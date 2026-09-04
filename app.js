// 8bit 旋律工坊 — NES 2A03 芯片音乐合成器
// 经典脚本（非 module），挂 window 命名空间，与 nes-apu.js 协作

(function () {
  'use strict';

  // ========== 常量 ==========
  var STEP_COUNT = 32;
  var STORAGE_KEY = 'xhs_8bit_nes_song_v1';
  var LEGACY_KEY = 'neon_8bit_melodies_v6';
  var CHANNEL_TYPES = ['pulse1', 'pulse2', 'triangle', 'noise', 'pulse3', 'pulse4', 'sawtooth', 'dmc'];

  var t = (window.I18N && window.I18N.t) ? window.I18N.t : function (k) { return k; };
  function noiseName(i) { return t('noise.' + i); }
  function dmcName(i) { return t('dmc.' + i); }

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var MIDI_MIN = 36; // C2
  var MIDI_MAX = 96; // C7

  // 旧 8 轨固定频率（用于旧存档迁移）
  var LEGACY_NOTES = [130.81, 196.0, 261.63, 329.63, 392.0, 493.88, 523.25, 783.99];

  // Noise 周期标签由 i18n 字典（noise.0 ~ noise.15）经 noiseName() 提供

  var CHANNEL_LABELS = { pulse1: 'P1', pulse2: 'P2', triangle: 'TRI', noise: 'NSE', pulse3: 'P3', pulse4: 'P4', sawtooth: 'SAW', dmc: 'DMC' };

  // DMC 采样声道采样数量（与 nes-apu.js 保持一致）
  var DMC_SAMPLE_COUNT = 4;

  // 旋律声道索引（非噪声），用于 MIDI 导入声部分配与八度拟合
  var MELODIC_CHANNELS = [0, 1, 2, 4, 5, 6];

  // ========== 状态 ==========
  var song = createEmptySong();
  var currentPatternIndex = 0;
  var currentOrderIndex = 0; // 当前选中的编排槽位
  var savedEditIndex = 0; // 播放前用户编辑的段落，停止后恢复
  var savedOrderIndex = 0; // 播放前用户选中的编排槽位，停止后恢复
  var savedSongs = loadSongs();
  var isPlaying = false;
  var toastTimer = null;

  // 每个声道当前选中的「放置音高」（旋律=MIDI，噪声=周期索引）
  var selectedPitch = { pulse1: 72, pulse2: 60, triangle: 48, noise: 8, pulse3: 67, pulse4: 60, sawtooth: 55, dmc: 0 };

  // 琶音类型：每个旋律声道当前选中的琶音（null=无，[o1,o2]=两个半音偏移）
  var ARP_TYPES = [
    { label: 'arp.none', offsets: null },
    { label: 'arp.major', offsets: [4, 7] },
    { label: 'arp.minor', offsets: [3, 7] },
    { label: 'arp.fifth', offsets: [7, 12] },
    { label: 'arp.octave', offsets: [12, 0] }
  ];
  var selectedArp = { pulse1: 0, pulse2: 0, triangle: 0, pulse3: 0, pulse4: 0, sawtooth: 0 }; // 存 ARP_TYPES 索引

  // 各声道当前选中的音量（null=默认，用声道 vol；否则 0-15 覆盖）。triangle 无音量控制，不参与
  var selectedVol = { pulse1: null, pulse2: null, noise: null, pulse3: null, pulse4: null, sawtooth: null, dmc: null };

  // 各声道当前选中的时值（音符持续步数）
  var GATE_OPTIONS = [1, 2, 4, 8, 16, 32];
  var selectedGate = { pulse1: 1, pulse2: 1, triangle: 1, noise: 1, pulse3: 1, pulse4: 1, sawtooth: 1, dmc: 1 };

  // 颤音类型：旋律声道选中的颤音深度（半音）
  var VIBRATO_TYPES = [
    { label: 'vib.none', depth: 0 },
    { label: 'vib.light', depth: 0.5 },
    { label: 'vib.medium', depth: 1 },
    { label: 'vib.heavy', depth: 2 }
  ];
  var selectedVibrato = { pulse1: 0, pulse2: 0, triangle: 0, pulse3: 0, pulse4: 0, sawtooth: 0 }; // 存 VIBRATO_TYPES 索引

  // 播放调度状态（前瞻调度器）
  var schedulerTimer = null;
  var nextStepTime = 0;   // 音频时间轴上下一拍的绝对时间
  var globalStep = 0;     // 当前全局步（order 展平后的步索引）
  var loopStartStep = 0;
  var loopEndStep = 32;
  var singleLoop = false; // 单段循环：只播放当前选中的段落
  var singleLoopPatternIndex = 0; // 单段循环播放时固定的段落索引
  var currentPlayStep = -1; // 当前播放的步（-1=未播放），用于播放时同步/编辑

  // 滑音：每个旋律声道上一个音符的 MIDI 音高（用于跨音符滑音）
  var lastNotePitch = { pulse1: null, pulse2: null, pulse3: null, pulse4: null, triangle: null, sawtooth: null };

  // ========== DOM 元素 ==========
  var els = {};

  // ========== 工具函数 ==========
  function midiToName(midi) {
    return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  function freqToMidi(freq) {
    // 用 Math.log / Math.LN2 替代 Math.log2，兼容旧 WebView
    return Math.round(69 + 12 * (Math.log(freq / 440) / Math.LN2));
  }

  function emptyNotes() {
    var arr = [];
    for (var i = 0; i < STEP_COUNT; i++) arr.push(null);
    return arr;
  }

  function notesFromPairs(pairs) {
    var notes = emptyNotes();
    for (var i = 0; i < pairs.length; i++) {
      notes[pairs[i][0]] = pairs[i][1];
    }
    return notes;
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2000);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== 数据模型 ==========
  function createEmptyChannel(type) {
    if (type === 'triangle') {
      return { type: type, notes: emptyNotes(), arp: emptyNotes(), gates: emptyNotes(), vibrato: emptyNotes(), glideTime: 0 };
    }
    if (type === 'noise') {
      return { type: type, mode: 0, period: 8, vol: 11, envMode: 'decay', notes: emptyNotes(), vols: emptyNotes(), gates: emptyNotes() };
    }
    if (type === 'sawtooth') {
      return {
        type: type, vol: 10, envMode: 'decay',
        notes: emptyNotes(), arp: emptyNotes(), vols: emptyNotes(), gates: emptyNotes(), vibrato: emptyNotes(),
        glideTime: 0
      };
    }
    if (type === 'dmc') {
      return { type: type, sample: 0, rate: 8, vol: 12, notes: emptyNotes(), vols: emptyNotes(), gates: emptyNotes() };
    }
    // pulse1 / pulse2 / pulse3 / pulse4
    var dutyDefault = (type === 'pulse1') ? 1 : (type === 'pulse2') ? 2 : (type === 'pulse3') ? 0 : 3;
    var volDefault = (type === 'pulse1') ? 12 : (type === 'pulse2') ? 10 : 8;
    return {
      type: type, duty: dutyDefault, vol: volDefault,
      envMode: 'decay',
      sweepOn: false, sweepPeriod: 0, sweepNegate: false, sweepShift: 0,
      notes: emptyNotes(), arp: emptyNotes(), vols: emptyNotes(), gates: emptyNotes(), vibrato: emptyNotes(),
      glideTime: 0
    };
  }

  function createEmptyPattern(name) {
    var channels = [];
    for (var i = 0; i < CHANNEL_TYPES.length; i++) {
      channels.push(createEmptyChannel(CHANNEL_TYPES[i]));
    }
    return { name: name || t('pattern.new'), steps: STEP_COUNT, channels: channels };
  }

  function createEmptySong() {
    return {
      bpm: 140,
      patterns: [createEmptyPattern(t('section.verse'))],
      order: [0],
      loopStart: 0,
      loopEnd: 1
    };
  }

  function cloneChannel(ch) {
    var c = {};
    for (var k in ch) {
      if (Object.prototype.hasOwnProperty.call(ch, k)) {
        c[k] = Array.isArray(ch[k]) ? ch[k].slice() : ch[k];
      }
    }
    return c;
  }

  function clonePattern(p) {
    var channels = [];
    for (var i = 0; i < p.channels.length; i++) channels.push(cloneChannel(p.channels[i]));
    return { name: p.name, steps: p.steps, channels: channels };
  }

  function cloneSong(s) {
    var patterns = [];
    for (var i = 0; i < s.patterns.length; i++) patterns.push(clonePattern(s.patterns[i]));
    return {
      bpm: s.bpm,
      patterns: patterns,
      order: s.order.slice(),
      loopStart: s.loopStart,
      loopEnd: s.loopEnd
    };
  }

  function currentPattern() {
    return song.patterns[currentPatternIndex];
  }

  // ========== 存档 ==========
  function sanitizeSong(s) {
    if (!s || typeof s !== 'object') return null;
    if (typeof s.bpm !== 'number' || !Array.isArray(s.patterns) || s.patterns.length === 0) return null;
    if (!Array.isArray(s.order) || s.order.length === 0) return null;
    for (var i = 0; i < s.patterns.length; i++) {
      var p = s.patterns[i];
      if (!p || !Array.isArray(p.channels) || (p.channels.length !== 4 && p.channels.length !== 7 && p.channels.length !== CHANNEL_TYPES.length)) return null;
      // 旧存档（4 声道）补齐扩展声道
      if (p.channels.length === 4) {
        p.channels.push(createEmptyChannel('pulse3'));
        p.channels.push(createEmptyChannel('pulse4'));
        p.channels.push(createEmptyChannel('sawtooth'));
        p.channels.push(createEmptyChannel('dmc'));
      } else if (p.channels.length === 7) {
        // 7 声道旧存档补齐 DMC 采样声道
        p.channels.push(createEmptyChannel('dmc'));
      }
      for (var c = 0; c < p.channels.length; c++) {
        var ch = p.channels[c];
        if (!ch || typeof ch.type !== 'string' || !Array.isArray(ch.notes)) return null;
        if (ch.type !== 'noise' && ch.type !== 'dmc' && !Array.isArray(ch.arp)) ch.arp = emptyNotes();
        if (ch.type !== 'triangle' && !Array.isArray(ch.vols)) ch.vols = emptyNotes();
        if (!Array.isArray(ch.gates)) ch.gates = emptyNotes();
        if (ch.type !== 'noise' && ch.type !== 'dmc' && !Array.isArray(ch.vibrato)) ch.vibrato = emptyNotes();
        if (ch.type !== 'noise' && ch.type !== 'dmc' && typeof ch.glideTime !== 'number') ch.glideTime = 0;
        if (ch.type === 'dmc' && typeof ch.sample !== 'number') ch.sample = 0;
        if (ch.type === 'dmc' && typeof ch.rate !== 'number') ch.rate = 8;
      }
    }
    // 校验 order 索引均在 patterns 范围内
    for (var o = 0; o < s.order.length; o++) {
      var idx = s.order[o];
      if (typeof idx !== 'number' || idx < 0 || idx >= s.patterns.length) return null;
    }
    // 校验循环区间
    if (typeof s.loopStart !== 'number') s.loopStart = 0;
    if (typeof s.loopEnd !== 'number') s.loopEnd = s.order.length;
    s.loopStart = Math.max(0, Math.min(s.loopStart, s.order.length - 1));
    s.loopEnd = Math.max(1, Math.min(s.loopEnd, s.order.length));
    if (s.loopEnd <= s.loopStart) s.loopEnd = s.loopStart + 1;
    return s;
  }

  function loadSongs() {
    var list = [];
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) {
            if (parsed[i] && typeof parsed[i].name === 'string' && sanitizeSong(parsed[i].song)) {
              list.push(parsed[i]);
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // 旧存档迁移（仅一次）
    try {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        var old = JSON.parse(legacy);
        if (Array.isArray(old)) {
          for (var j = 0; j < old.length; j++) {
            list.push({ name: old[j].name || (t('library.migrated') + (j + 1)), song: migrateLegacySong(old[j]) });
          }
        }
        localStorage.removeItem(LEGACY_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch (e) { /* ignore */ }

    return list;
  }

  function migrateLegacySong(item) {
    var steps = Array.isArray(item.steps) ? item.steps : [];
    var bpm = typeof item.bpm === 'number' ? item.bpm : 120;
    var s = createEmptySong();
    s.bpm = bpm;
    var p = s.patterns[0];

    // track0 → triangle, track1 → pulse1, 其余 → pulse2
    var tri = p.channels[2].notes;
    var p1 = p.channels[0].notes;
    var p2 = p.channels[1].notes;
    for (var i = 0; i < STEP_COUNT; i++) {
      if (steps[0] && steps[0][i]) tri[i] = freqToMidi(LEGACY_NOTES[0]);
      if (steps[1] && steps[1][i]) p1[i] = freqToMidi(LEGACY_NOTES[1]);
      var anyHigh = false;
      for (var t = 2; t < 8; t++) {
        if (steps[t] && steps[t][i]) { anyHigh = true; break; }
      }
      if (anyHigh) p2[i] = freqToMidi(LEGACY_NOTES[2]);
    }
    return s;
  }

  function persistSongs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSongs));
    } catch (e) { /* ignore */ }
  }

  // ========== 渲染 ==========
  function renderAll() {
    renderPatternTabs();
    renderChannels();
    renderParamPanel();
    renderOrderBar();
    renderLibrary();
    renderBpm();
    updatePlayState();
  }

  function renderBpm() {
    els.bpmSlider.value = String(song.bpm);
    els.bpmValue.textContent = song.bpm + ' BPM';
  }

  function renderPatternTabs() {
    els.patternTabs.innerHTML = '';
    for (var i = 0; i < song.patterns.length; i++) {
      (function (idx) {
        var chip = document.createElement('button');
        chip.className = 'pattern-chip' + (idx === currentPatternIndex ? ' active' : '');
        chip.textContent = (idx + 1) + '. ' + song.patterns[idx].name;
        chip.addEventListener('click', function () {
          switchPattern(idx);
        });
        els.patternTabs.appendChild(chip);
      })(i);
    }
  }

  // 给参数下拉框包一层带标签的容器
  function makeField(labelText, selectEl, fieldType) {
    var field = document.createElement('label');
    field.className = 'ch-field';
    if (fieldType) field.setAttribute('data-field', fieldType);
    var tag = document.createElement('span');
    tag.className = 'ch-field-label';
    tag.textContent = labelText;
    field.appendChild(tag);
    field.appendChild(selectEl);
    return field;
  }

  function renderChannels() {
    els.tracks.innerHTML = '';
    for (var c = 0; c < CHANNEL_TYPES.length; c++) {
      var ch = currentPattern().channels[c];
      var row = document.createElement('div');
      row.className = 'channel-row';

      // 标签 + 音高选择器
      var head = document.createElement('div');
      head.className = 'channel-head';
      var label = document.createElement('div');
      label.className = 'channel-label ch-' + c;
      label.textContent = CHANNEL_LABELS[ch.type];
      head.appendChild(label);

      var sel = document.createElement('select');
      sel.className = 'pitch-select';
      sel.setAttribute('data-channel', String(c));
      if (ch.type === 'noise') {
        for (var n = 0; n < 16; n++) {
          var opt = document.createElement('option');
          opt.value = String(n);
          opt.textContent = n + '·' + noiseName(n);
          if (n === selectedPitch.noise) opt.selected = true;
          sel.appendChild(opt);
        }
      } else if (ch.type === 'dmc') {
        for (var dn = 0; dn < DMC_SAMPLE_COUNT; dn++) {
          var dopt = document.createElement('option');
          dopt.value = String(dn);
          dopt.textContent = dn + '·' + dmcName(dn);
          if (dn === selectedPitch.dmc) dopt.selected = true;
          sel.appendChild(dopt);
        }
      } else {
        for (var m = MIDI_MIN; m <= MIDI_MAX; m++) {
          var o = document.createElement('option');
          o.value = String(m);
          o.textContent = midiToName(m);
          if (m === selectedPitch[ch.type]) o.selected = true;
          sel.appendChild(o);
        }
      }
      sel.addEventListener('change', onPitchChange);
      head.appendChild(sel);

      // 参数下拉框容器（带标签，排列整齐）
      var controls = document.createElement('div');
      controls.className = 'ch-controls';

      // 音量选择器（方波 + 噪声声道；三角波无音量控制）
      if (ch.type !== 'triangle') {
        var volSel = document.createElement('select');
        volSel.className = 'vol-select';
        volSel.setAttribute('data-channel', String(c));
        var vopt0 = document.createElement('option');
        vopt0.value = 'd';
        vopt0.textContent = t('field.default');
        if (selectedVol[ch.type] === null) vopt0.selected = true;
        volSel.appendChild(vopt0);
        for (var vi = 0; vi < 16; vi++) {
          var vopt = document.createElement('option');
          vopt.value = String(vi);
          vopt.textContent = 'V' + vi;
          if (selectedVol[ch.type] === vi) vopt.selected = true;
          volSel.appendChild(vopt);
        }
        volSel.addEventListener('change', onVolChange);
        controls.appendChild(makeField(t('param.volume'), volSel, 'volume'));
      }

      // 琶音选择器（仅旋律声道）
      if (ch.type !== 'noise' && ch.type !== 'dmc') {
        var arpSel = document.createElement('select');
        arpSel.className = 'arp-select';
        arpSel.setAttribute('data-channel', String(c));
        for (var ai = 0; ai < ARP_TYPES.length; ai++) {
          var aopt = document.createElement('option');
          aopt.value = String(ai);
          aopt.textContent = t(ARP_TYPES[ai].label);
          if (ai === selectedArp[ch.type]) aopt.selected = true;
          arpSel.appendChild(aopt);
        }
        arpSel.addEventListener('change', onArpChange);
        controls.appendChild(makeField(t('field.arp'), arpSel, 'arp'));

        // 颤音选择器（仅旋律声道）
        var vibSel = document.createElement('select');
        vibSel.className = 'vib-select';
        vibSel.setAttribute('data-channel', String(c));
        for (var bi = 0; bi < VIBRATO_TYPES.length; bi++) {
          var bopt = document.createElement('option');
          bopt.value = String(bi);
          bopt.textContent = t(VIBRATO_TYPES[bi].label);
          if (bi === selectedVibrato[ch.type]) bopt.selected = true;
          vibSel.appendChild(bopt);
        }
        vibSel.addEventListener('change', onVibratoChange);
        controls.appendChild(makeField(t('field.vibrato'), vibSel, 'vib'));
      }

      // 时值选择器（所有声道）
      var gateSel = document.createElement('select');
      gateSel.className = 'gate-select';
      gateSel.setAttribute('data-channel', String(c));
      for (var gi = 0; gi < GATE_OPTIONS.length; gi++) {
        var gopt = document.createElement('option');
        gopt.value = String(GATE_OPTIONS[gi]);
        gopt.textContent = t('unit.steps', { n: GATE_OPTIONS[gi] });
        if (GATE_OPTIONS[gi] === selectedGate[ch.type]) gopt.selected = true;
        gateSel.appendChild(gopt);
      }
      gateSel.addEventListener('change', onGateChange);
      controls.appendChild(makeField(t('field.gate'), gateSel, 'gate'));

      head.appendChild(controls);
      row.appendChild(head);

      // 32 步网格
      var grid = document.createElement('div');
      grid.className = 'step-grid';
      for (var s = 0; s < STEP_COUNT; s++) {
        var cell = document.createElement('button');
        cell.className = 'step-cell';
        cell.setAttribute('data-channel', String(c));
        cell.setAttribute('data-step', String(s));
        cell.addEventListener('click', onCellClick);
        updateCellState(cell, c, s);
        grid.appendChild(cell);
      }
      row.appendChild(grid);
      els.tracks.appendChild(row);
    }
  }

  function updateCellState(cell, c, s) {
    var ch = currentPattern().channels[c];
    var val = ch.notes[s];
    var arp = ch.arp ? ch.arp[s] : null;
    var vol = ch.vols ? ch.vols[s] : null;
    cell.classList.remove('active', 'has-arp', 'gate-hold', 'has-vib');
    cell.textContent = '';
    cell.title = '';
    cell.style.opacity = '';
    // 延续步：显示横线（不重新触发）
    if (val === null || val === undefined) {
      var ns = noteStartAt(ch, s);
      if (ns >= 0) {
        cell.classList.add('active', 'ch-' + c, 'gate-hold');
        cell.textContent = '—';
        cell.title = t('cell.hold');
      }
      cell.classList.remove('current');
      return;
    }
    cell.classList.add('active');
    cell.classList.add('ch-' + c);
    if (arp && Array.isArray(arp)) {
      cell.classList.add('has-arp');
      cell.textContent = '◆';
      cell.title = t('cell.arp', { a: arp[0], b: arp[1] });
    } else if (ch.type === 'noise') {
      cell.textContent = '●';
      cell.title = t('cell.drum', { name: noiseName(val) });
      // 音量列：用不透明度呈现力度（null=默认满亮度）
      if (vol !== null && vol !== undefined) {
        cell.style.opacity = String(0.25 + 0.75 * (vol / 15));
        cell.title += t('cell.vol', { n: vol });
      }
    } else if (ch.type === 'dmc') {
      cell.textContent = '●';
      cell.title = t('cell.drum', { name: dmcName(val) });
      // 音量列：用不透明度呈现力度
      if (vol !== null && vol !== undefined) {
        cell.style.opacity = String(0.25 + 0.75 * (vol / 15));
        cell.title += t('cell.vol', { n: vol });
      }
    } else {
      cell.textContent = '●';
      cell.title = midiToName(val);
      // 音量列：用不透明度呈现力度（null=默认满亮度）
      if (vol !== null && vol !== undefined) {
        cell.style.opacity = String(0.25 + 0.75 * (vol / 15));
        cell.title += t('cell.vol', { n: vol });
      }
    }
    // 时值标记：起始步显示持续步数
    var gate = (ch.gates && ch.gates[s]) || 1;
    if (gate > 1) {
      cell.title += t('cell.gate', { n: gate });
    }
    // 颤音标记
    var vib = (ch.vibrato && ch.vibrato[s]) || 0;
    if (vib > 0) {
      cell.classList.add('has-vib');
      cell.title += t('cell.vib', { label: t(VIBRATO_TYPES[vib].label) });
    }
    cell.classList.remove('current');
  }

  function renderParamPanel() {
    var p = currentPattern();
    for (var c = 0; c < CHANNEL_TYPES.length; c++) {
      var ch = p.channels[c];
      if (!ch) continue;
      // 滑音：所有旋律声道（pulse/triangle/sawtooth）都有
      if (ch.type !== 'noise' && ch.type !== 'dmc') {
        var glideInput = els['glideTime_' + c];
        if (glideInput) {
          // 存储值是秒，滑块用毫秒（0-1000ms，滑块值 0-100 每步 10ms）
          var msVal = Math.round((ch.glideTime || 0) * 1000 / 10);
          glideInput.value = String(msVal);
        }
        var glideLabel = els['glideTimeLabel_' + c];
        if (glideLabel) {
          var ms = Math.round((ch.glideTime || 0) * 1000);
          glideLabel.textContent = ms + ' ms';
        }
      }
      if (ch.type === 'triangle') continue;
      // 音量
      var volInput = els['vol_' + c];
      if (volInput) volInput.value = String(ch.vol);
      var volLabel = els['volLabel_' + c];
      if (volLabel) volLabel.textContent = ch.vol;

      if (ch.type === 'pulse1' || ch.type === 'pulse2' || ch.type === 'pulse3' || ch.type === 'pulse4') {
        setDutyButtons(c, ch.duty);
        setEnvButtons(c, ch.envMode);
        if (els['sweepOn_' + c]) els['sweepOn_' + c].checked = !!ch.sweepOn;
        if (els['sweepPeriod_' + c]) els['sweepPeriod_' + c].value = String(ch.sweepPeriod);
        if (els['sweepShift_' + c]) els['sweepShift_' + c].value = String(ch.sweepShift);
        setSweepDirButtons(c, ch.sweepNegate);
      } else if (ch.type === 'sawtooth') {
        setEnvButtons(c, ch.envMode);
      } else if (ch.type === 'noise') {
        setModeButtons(c, ch.mode);
        if (els['noisePeriod_' + c]) els['noisePeriod_' + c].value = String(ch.period);
        if (els['noisePeriodLabel_' + c]) els['noisePeriodLabel_' + c].textContent = ch.period + '·' + noiseName(ch.period);
        setEnvButtons(c, ch.envMode);
      } else if (ch.type === 'dmc') {
        if (els['dmcSample_' + c]) els['dmcSample_' + c].value = String(ch.sample);
        if (els['dmcSampleLabel_' + c]) els['dmcSampleLabel_' + c].textContent = ch.sample + '·' + dmcName(ch.sample);
        if (els['dmcRate_' + c]) els['dmcRate_' + c].value = String(ch.rate);
        if (els['dmcRateLabel_' + c]) els['dmcRateLabel_' + c].textContent = ch.rate;
      }
    }
  }

  function setDutyButtons(c, duty) {
    var btns = document.querySelectorAll('[data-param="duty"][data-channel="' + c + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', parseInt(btns[i].getAttribute('data-value'), 10) === duty);
    }
  }

  function setEnvButtons(c, envMode) {
    var btns = document.querySelectorAll('[data-param="envMode"][data-channel="' + c + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-value') === envMode);
    }
  }

  function setSweepDirButtons(c, negate) {
    var btns = document.querySelectorAll('[data-param="sweepNegate"][data-channel="' + c + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', (btns[i].getAttribute('data-value') === '1') === negate);
    }
  }

  function setModeButtons(c, mode) {
    var btns = document.querySelectorAll('[data-param="noiseMode"][data-channel="' + c + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', parseInt(btns[i].getAttribute('data-value'), 10) === mode);
    }
  }

  function renderOrderBar() {
    els.orderBar.innerHTML = '';
    for (var i = 0; i < song.order.length; i++) {
      (function (slot) {
        var pi = song.order[slot];
        var item = document.createElement('div');
        item.className = 'order-item' + (isLoopSlot(slot) ? ' loop' : '') + (slot === currentOrderIndex ? ' selected' : '');
        var name = document.createElement('span');
        name.className = 'order-name';
        name.textContent = (slot + 1) + ':' + song.patterns[pi].name;
        item.appendChild(name);

        if (slot === song.loopStart) {
          var ltag = document.createElement('span');
          ltag.className = 'order-tag loop-start';
          ltag.textContent = t('order.loopStart');
          item.appendChild(ltag);
        }
        if (slot === song.loopEnd - 1) {
          var etag = document.createElement('span');
          etag.className = 'order-tag loop-end';
          etag.textContent = t('order.loopEnd');
          item.appendChild(etag);
        }

        var mvL = document.createElement('button');
        mvL.className = 'order-btn';
        mvL.textContent = '‹';
        mvL.addEventListener('click', function (e) { e.stopPropagation(); moveOrder(slot, -1); });
        item.appendChild(mvL);
        var mvR = document.createElement('button');
        mvR.className = 'order-btn';
        mvR.textContent = '›';
        mvR.addEventListener('click', function (e) { e.stopPropagation(); moveOrder(slot, 1); });
        item.appendChild(mvR);
        var del = document.createElement('button');
        del.className = 'order-btn del';
        del.textContent = '×';
        del.addEventListener('click', function (e) { e.stopPropagation(); removeOrderSlot(slot); });
        item.appendChild(del);

        // 点击选中编排槽位
        item.addEventListener('click', function () {
          currentOrderIndex = slot;
          // 同时切换到对应的 pattern 方便编辑
          currentPatternIndex = pi;
          renderAll();
        });

        els.orderBar.appendChild(item);
      })(i);
    }
  }

  // 高亮当前播放的编排槽位
  function highlightPlayingOrder(slot) {
    var items = els.orderBar.querySelectorAll('.order-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('playing', i === slot);
    }
  }

  function isLoopSlot(slot) {
    return slot >= song.loopStart && slot < song.loopEnd;
  }

  function renderLibrary() {
    els.libraryCount.textContent = t('library.count', { n: savedSongs.length });
    if (savedSongs.length === 0) {
      els.libraryContainer.innerHTML =
        '<div class="library-empty"><div class="emoji">🎵</div>' +
        '<p>' + t('library.empty') + '</p></div>';
      return;
    }
    var list = document.createElement('div');
    list.className = 'library-list';
    for (var i = savedSongs.length - 1; i >= 0; i--) {
      (function (idx) {
        var item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML =
          '<div class="library-item-info">' +
            '<div class="library-item-name">' + escapeHtml(savedSongs[idx].name) + '</div>' +
            '<div class="library-item-date">' + savedSongs[idx].song.bpm + ' BPM · ' +
              t('library.patterns', { n: savedSongs[idx].song.patterns.length }) + '</div>' +
          '</div>' +
          '<div class="library-item-actions">' +
            '<button class="mini-btn load" data-action="load">' + t('library.load') + '</button>' +
            '<button class="mini-btn delete" data-action="delete">' + t('library.delete') + '</button>' +
          '</div>';
        item.querySelector('.load').addEventListener('click', function () { loadSong(idx); });
        item.querySelector('.delete').addEventListener('click', function () { deleteSong(idx); });
        list.appendChild(item);
      })(i);
    }
    els.libraryContainer.innerHTML = '';
    els.libraryContainer.appendChild(list);
  }

  function updatePlayState() {
    if (isPlaying) {
      els.playBtn.textContent = '⏹ STOP';
      els.playBtn.classList.add('playing');
      els.statusPill.classList.add('playing');
      els.statusText.textContent = 'PLAY';
    } else {
      els.playBtn.textContent = '▶ PLAY';
      els.playBtn.classList.remove('playing');
      els.statusPill.classList.remove('playing');
      els.statusText.textContent = 'READY';
    }
  }

  // ========== 交互：音序网格 ==========
  // 找 step 处实际发音的起始步；若为延续步返回其起始步，空则返回 -1
  function noteStartAt(ch, step) {
    if (ch.notes[step] !== null && ch.notes[step] !== undefined) return step;
    if (!ch.gates) return -1;
    for (var k = 1; k < STEP_COUNT && step - k >= 0; k++) {
      var s2 = step - k;
      if (ch.notes[s2] !== null && ch.notes[s2] !== undefined) {
        var g = ch.gates[s2] || 1;
        return (g > k) ? s2 : -1;
      }
    }
    return -1;
  }

  // 清空 [start, start+len) 区间的音符数据
  function clearRange(ch, start, len) {
    var end = Math.min(start + len, STEP_COUNT);
    for (var s = start; s < end; s++) {
      ch.notes[s] = null;
      if (ch.arp) ch.arp[s] = null;
      if (ch.vols) ch.vols[s] = null;
      if (ch.gates) ch.gates[s] = null;
      if (ch.vibrato) ch.vibrato[s] = null;
    }
  }

  function onCellClick(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var s = parseInt(e.currentTarget.getAttribute('data-step'), 10);
    var ch = currentPattern().channels[c];
    var sel = selectedPitch[ch.type];
    var arpOffsets = null;
    var vibIdx = null;
    if (ch.type !== 'noise' && ch.type !== 'dmc') {
      var arpIdx = selectedArp[ch.type];
      arpOffsets = ARP_TYPES[arpIdx].offsets;
      vibIdx = selectedVibrato[ch.type];
    }
    var volVal = (ch.type !== 'triangle') ? selectedVol[ch.type] : null;
    var gate = selectedGate[ch.type] || 1;
    var start = noteStartAt(ch, s);
    var cur = (start >= 0) ? ch.notes[start] : null;
    var curArp = (start >= 0 && ch.arp) ? ch.arp[start] : null;
    var curVol = (start >= 0 && ch.vols) ? ch.vols[start] : null;
    var curGate = (start >= 0 && ch.gates) ? (ch.gates[start] || 1) : null;
    var curVib = (start >= 0 && ch.vibrato) ? (ch.vibrato[start] || 0) : null;

    var sameNote = (cur === sel);
    var sameArp = arpEquals(curArp, arpOffsets);
    var sameVol = (curVol === volVal);
    var sameGate = (curGate === gate);
    var sameVib = (curVib === vibIdx);

    if (start >= 0 && sameNote && sameArp && sameVol && sameGate && sameVib) {
      // 完全相同：清除整个音符区间
      clearRange(ch, start, curGate);
    } else {
      if (start >= 0 && start < s) {
        // 点击的是延续步：截断前一个长音符，从 s 重新开始
        ch.gates[start] = s - start;
      }
      // 写新音符（先清空 [s, s+gate) 区间）
      clearRange(ch, s, gate);
      ch.notes[s] = sel;
      if (ch.arp) ch.arp[s] = arpOffsets;
      if (ch.vols) ch.vols[s] = volVal;
      if (ch.gates) ch.gates[s] = gate;
      if (ch.vibrato) ch.vibrato[s] = vibIdx;
    }
    // 刷新整行受影响区域的格子
    renderChannels();
    // 试听
    var ns = noteStartAt(ch, s);
    if (ns >= 0) {
      var t0 = NesApu.now() + 0.02;
      var vv = (ch.vols && ch.vols[ns] !== null && ch.vols[ns] !== undefined) ? ch.vols[ns] : null;
      var vibDepth = (ch.vibrato && ch.vibrato[ns]) ? VIBRATO_TYPES[ch.vibrato[ns]].depth : 0;
      if (ch.type === 'noise') {
        NesApu.note(ch.type, ch, ch.notes[ns], t0, 0.14, vv);
      } else if (ch.arp && ch.arp[ns] && Array.isArray(ch.arp[ns])) {
        playArpPreview(ch, ch.notes[ns], ch.arp[ns], t0, 0.14, vv, vibDepth);
      } else {
        NesApu.note(ch.type, ch, ch.notes[ns], t0, 0.14, vv, vibDepth);
      }
    }
  }

  function arpEquals(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a[0] === b[0] && a[1] === b[1];
  }

  // 琶音试听：一步内快速循环 3 音
  function playArpPreview(ch, base, arp, startTime, totalDur, volOverride, vibDepth) {
    var sub = totalDur / 3;
    for (var k = 0; k < 3; k++) {
      var offset = k === 0 ? 0 : arp[k - 1];
      NesApu.note(ch.type, ch, base + offset, startTime + k * sub, sub, volOverride, vibDepth);
    }
  }

  function onPitchChange(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var ch = currentPattern().channels[c];
    var val = parseInt(e.currentTarget.value, 10);
    if (writeParamToCurrentStep(c, 'pitch', val) >= 0) {
      refreshAllCellsVisual();
      return;
    }
    selectedPitch[ch.type] = val;
  }

  function onArpChange(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var ch = currentPattern().channels[c];
    var idx = parseInt(e.currentTarget.value, 10);
    var offsets = ARP_TYPES[idx].offsets;
    if (writeParamToCurrentStep(c, 'arp', offsets) >= 0) {
      refreshAllCellsVisual();
      return;
    }
    selectedArp[ch.type] = idx;
  }

  function onVolChange(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var ch = currentPattern().channels[c];
    var v = e.currentTarget.value;
    var volVal = (v === 'd') ? null : parseInt(v, 10);
    if (writeParamToCurrentStep(c, 'vol', volVal) >= 0) {
      refreshAllCellsVisual();
      return;
    }
    selectedVol[ch.type] = volVal;
  }

  function onGateChange(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var ch = currentPattern().channels[c];
    var val = parseInt(e.currentTarget.value, 10);
    if (writeParamToCurrentStep(c, 'gate', val) >= 0) {
      refreshAllCellsVisual();
      return;
    }
    selectedGate[ch.type] = val;
  }

  function onVibratoChange(e) {
    var c = parseInt(e.currentTarget.getAttribute('data-channel'), 10);
    var ch = currentPattern().channels[c];
    var idx = parseInt(e.currentTarget.value, 10);
    if (writeParamToCurrentStep(c, 'vibrato', idx) >= 0) {
      refreshAllCellsVisual();
      return;
    }
    selectedVibrato[ch.type] = idx;
  }

  // ========== 交互：参数面板 ==========
  function onParamClick(e) {
    var btn = e.currentTarget;
    var c = parseInt(btn.getAttribute('data-channel'), 10);
    var param = btn.getAttribute('data-param');
    var value = btn.getAttribute('data-value');
    var ch = currentPattern().channels[c];

    if (param === 'duty') ch.duty = parseInt(value, 10);
    else if (param === 'envMode') ch.envMode = value;
    else if (param === 'sweepNegate') ch.sweepNegate = value === '1';
    else if (param === 'noiseMode') ch.mode = parseInt(value, 10);
    else if (param === 'sweepOn') ch.sweepOn = btn.checked;

    renderParamPanel();
  }

  function onParamSlider(e) {
    var input = e.currentTarget;
    var c = parseInt(input.getAttribute('data-channel'), 10);
    var param = input.getAttribute('data-param');
    var ch = currentPattern().channels[c];
    var val = parseFloat(input.value);

    if (param === 'vol') ch.vol = Math.round(val);
    else if (param === 'sweepPeriod') ch.sweepPeriod = Math.round(val);
    else if (param === 'sweepShift') ch.sweepShift = Math.round(val);
    else if (param === 'noisePeriod') ch.period = Math.round(val);
    else if (param === 'dmcSample') ch.sample = Math.round(val);
    else if (param === 'dmcRate') ch.rate = Math.round(val);
    else if (param === 'glideTime') {
      // 滑块值 0-100，每步 10ms，转换为秒
      ch.glideTime = val * 10 / 1000;
    }

    renderParamPanel();
  }

  // ========== 交互：pattern 管理 ==========
  function switchPattern(idx) {
    if (idx === currentPatternIndex) return;
    currentPatternIndex = idx;
    // 同步更新 currentOrderIndex：找到第一个引用该 pattern 的编排槽位
    var found = -1;
    for (var i = 0; i < song.order.length; i++) {
      if (song.order[i] === idx) { found = i; break; }
    }
    if (found >= 0) currentOrderIndex = found;
    // 单段循环播放中切换段落：更新锁定段落并从头重新播放
    if (singleLoop && isPlaying) {
      singleLoopPatternIndex = idx;
      globalStep = 0;
      nextStepTime = NesApu.now() + 0.06;
    }
    renderAll();
  }

  function addPattern() {
    var p = createEmptyPattern(t('pattern.default', { n: song.patterns.length + 1 }));
    song.patterns.push(p);
    var idx = song.patterns.length - 1;
    song.order.push(idx);
    // 扩展循环区间（默认全部循环）
    song.loopEnd = song.order.length;
    currentPatternIndex = idx;
    renderAll();
  }

  function duplicatePattern() {
    var p = clonePattern(currentPattern());
    p.name = p.name + t('pattern.copySuffix');
    song.patterns.splice(currentPatternIndex + 1, 0, p);
    // 修正 order 中大于当前索引的引用
    for (var i = 0; i < song.order.length; i++) {
      if (song.order[i] >= currentPatternIndex + 1) song.order[i]++;
    }
    currentPatternIndex++;
    renderAll();
  }

  function deletePattern() {
    if (song.patterns.length <= 1) { showToast(t('toast.minPattern')); return; }
    var removed = currentPatternIndex;
    song.patterns.splice(removed, 1);
    // 从 order 移除对已删 pattern 的引用，并修正索引
    var newOrder = [];
    var removedBeforeCurrent = 0; // currentOrderIndex 之前被移除的槽位数
    var loopStartOffset = 0;
    var loopEndOffset = 0;
    for (var i = 0; i < song.order.length; i++) {
      var pi = song.order[i];
      if (pi === removed) {
        if (i < currentOrderIndex) removedBeforeCurrent++;
        if (i < song.loopStart) loopStartOffset++;
        if (i < song.loopEnd) loopEndOffset++;
        continue;
      }
      newOrder.push(pi > removed ? pi - 1 : pi);
    }
    if (newOrder.length === 0) newOrder = [0];
    song.order = newOrder;
    // 修正循环区间（减去被移除的槽位数）
    song.loopStart = Math.max(0, song.loopStart - loopStartOffset);
    song.loopEnd = Math.max(1, song.loopEnd - loopEndOffset);
    // 边界校验
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    if (song.loopEnd <= song.loopStart) song.loopEnd = song.loopStart + 1;
    // 修正当前选中的编排槽位
    currentOrderIndex = Math.max(0, Math.min(currentOrderIndex - removedBeforeCurrent, song.order.length - 1));
    currentPatternIndex = Math.min(removed, song.patterns.length - 1);
    renderAll();
  }

  function renamePattern() {
    var p = currentPattern();
    els.savePanel.classList.add('show');
    els.saveInput.value = p.name;
    els.savePanel.setAttribute('data-mode', 'rename');
    els.saveInput.select();
    setTimeout(function () { els.saveInput.focus(); }, 50);
  }

  // ========== 交互：order 编排 ==========
  function addOrderSlot() {
    song.order.push(currentPatternIndex);
    song.loopEnd = song.order.length;
    // 选中新添加的槽位
    currentOrderIndex = song.order.length - 1;
    renderAll();
  }

  function removeOrderSlot(slot) {
    if (song.order.length <= 1) { showToast(t('toast.minSlot')); return; }
    song.order.splice(slot, 1);
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    // 修正当前选中的槽位
    if (currentOrderIndex >= song.order.length) currentOrderIndex = song.order.length - 1;
    if (currentOrderIndex >= slot) currentOrderIndex = Math.max(0, currentOrderIndex - 1);
    renderAll();
  }

  function moveOrder(slot, delta) {
    var target = slot + delta;
    if (target < 0 || target >= song.order.length) return;
    var tmp = song.order[slot];
    song.order[slot] = song.order[target];
    song.order[target] = tmp;
    // 跟随移动当前选中的槽位
    if (currentOrderIndex === slot) currentOrderIndex = target;
    else if (currentOrderIndex === target) currentOrderIndex = slot;
    // 修正循环区间：如果循环起止点刚好在被移动的槽位上，跟随移动
    var newLoopStart = song.loopStart;
    var newLoopEnd = song.loopEnd;
    if (song.loopStart === slot) newLoopStart = target;
    else if (song.loopStart === target) newLoopStart = slot;
    if (song.loopEnd - 1 === slot) newLoopEnd = target + 1;
    else if (song.loopEnd - 1 === target) newLoopEnd = slot + 1;
    song.loopStart = newLoopStart;
    song.loopEnd = newLoopEnd;
    // 边界校验
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    if (song.loopEnd <= song.loopStart) song.loopEnd = song.loopStart + 1;
    renderAll();
  }

  function setLoopStart() {
    song.loopStart = currentOrderIndex;
    if (song.loopEnd <= song.loopStart) song.loopEnd = song.loopStart + 1;
    // 边界校验
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    renderAll();
    showToast(t('toast.loopStartSet', { n: song.loopStart + 1 }));
  }

  function setLoopEnd() {
    var target = currentOrderIndex + 1;
    if (target <= song.loopStart) target = song.loopStart + 1;
    song.loopEnd = Math.max(target, song.loopStart + 1);
    // 边界校验
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    renderAll();
    showToast(t('toast.loopEndSet', { n: song.loopEnd }));
  }

  // ========== 播放（前瞻调度）==========
  function stepDuration() {
    return (60 / song.bpm) * 0.25; // 16 分音符
  }

  function rebuildSchedule() {
    if (singleLoop) {
      loopStartStep = 0;
      loopEndStep = STEP_COUNT;
      return;
    }
    // 边界校验，确保循环区间合法
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    if (song.loopEnd <= song.loopStart) song.loopEnd = song.loopStart + 1;
    var totalSteps = song.order.length * STEP_COUNT;
    loopStartStep = song.loopStart * STEP_COUNT;
    loopEndStep = Math.min(song.loopEnd * STEP_COUNT, totalSteps);
    if (loopEndStep <= loopStartStep) loopEndStep = loopStartStep + STEP_COUNT;
  }

  function togglePlay() {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (singleLoop) {
      // 单段模式：只检查当前段落是否有音符
      if (!patternHasNotes(currentPatternIndex)) {
        showToast(t('toast.noNotesPattern'));
        return;
      }
    } else if (!songHasNotes()) {
      showToast(t('toast.noNotesSong'));
      return;
    }
    startPlayback();
  }

  function patternHasNotes(idx) {
    var p = song.patterns[idx];
    if (!p) return false;
    var chs = p.channels;
    for (var c = 0; c < chs.length; c++) {
      var n = chs[c].notes;
      for (var s = 0; s < n.length; s++) {
        if (n[s] !== null && n[s] !== undefined) return true;
      }
    }
    return false;
  }

  function songHasNotes() {
    for (var i = 0; i < song.patterns.length; i++) {
      var chs = song.patterns[i].channels;
      for (var c = 0; c < chs.length; c++) {
        var n = chs[c].notes;
        for (var s = 0; s < n.length; s++) {
          if (n[s] !== null && n[s] !== undefined) return true;
        }
      }
    }
    return false;
  }

  function startPlayback() {
    NesApu.ensureContext();
    rebuildSchedule();
    isPlaying = true;
    // 重置滑音跟踪状态
    lastNotePitch = { pulse1: null, pulse2: null, pulse3: null, pulse4: null, triangle: null, sawtooth: null };
    if (singleLoop) {
      globalStep = 0;
      singleLoopPatternIndex = currentPatternIndex; // 单段循环时锁定播放的段落
    } else {
      // 整曲播放从当前选中的编排槽位开始
      globalStep = currentOrderIndex * STEP_COUNT;
      // 如果起点在循环终点之后，从循环起点开始
      if (globalStep >= loopEndStep) {
        globalStep = loopStartStep;
      }
    }
    nextStepTime = NesApu.now() + 0.06;
    savedEditIndex = currentPatternIndex; // 记住用户编辑的段落
    savedOrderIndex = currentOrderIndex; // 记住用户选中的编排槽位
    updatePlayState();
    clearPlayHighlight();
    schedulerTimer = setInterval(schedulerTick, 25);
  }

  function stopPlayback() {
    if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
    isPlaying = false;
    currentPlayStep = -1;
    updatePlayState();
    clearPlayHighlight();
    // 清除编排槽位播放高亮
    var items = els.orderBar.querySelectorAll('.order-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('playing');
    // 整曲播放会随进度自动切换段落，停止后恢复到用户编辑的段落
    // 单段循环播放不改变选中段落，无需恢复
    if (!singleLoop) {
      if (currentPatternIndex !== savedEditIndex) {
        currentPatternIndex = savedEditIndex;
      }
      if (currentOrderIndex !== savedOrderIndex) {
        currentOrderIndex = savedOrderIndex;
      }
      renderPatternTabs();
      renderOrderBar();
    }
    // 恢复参数面板滑块为段落级参数（播放时被同步为当前步值）
    renderParamPanel();
    // 恢复下拉框为画笔设置（播放时被同步为格子状态）
    renderChannels();
  }

  function schedulerTick() {
    var apuNow = NesApu.now();
    // 前瞻：提前 0.1s 调度音符
    while (nextStepTime < apuNow + 0.1) {
      scheduleStep(globalStep, nextStepTime);
      nextStepTime += stepDuration();
      globalStep++;
      if (globalStep >= loopEndStep) {
        globalStep = loopStartStep;
      }
    }
    // 高亮当前正在播放的步
    highlightPlayStep();
  }

  function scheduleStep(global, time) {
    var pi, stepInPattern;
    if (singleLoop) {
      pi = singleLoopPatternIndex; // 使用锁定的段落索引，不受用户切换影响
      stepInPattern = global % STEP_COUNT;
    } else {
      var slot = Math.floor(global / STEP_COUNT);
      stepInPattern = global % STEP_COUNT;
      if (slot >= song.order.length) return;
      pi = song.order[slot];
    }
    var pattern = song.patterns[pi];
    if (!pattern) return;
    var dur = stepDuration() * 0.9;
    for (var c = 0; c < pattern.channels.length; c++) {
      var ch = pattern.channels[c];
      var val = ch.notes[stepInPattern];
      // 无音符或为延续步（由前一个长音符覆盖）则跳过
      if (val === null || val === undefined) continue;
      if (noteStartAt(ch, stepInPattern) !== stepInPattern) continue;
      // 时值：该音符持续的步数
      var gate = (ch.gates && ch.gates[stepInPattern]) || 1;
      var noteDur = dur * gate;
      var arp = (ch.type !== 'noise' && ch.arp && Array.isArray(ch.arp[stepInPattern])) ? ch.arp[stepInPattern] : null;
      // 音量列：有每步音量则覆盖声道默认音量（triangle 无音量控制，忽略）
      var volOverride = (ch.type !== 'triangle' && ch.vols && ch.vols[stepInPattern] !== null && ch.vols[stepInPattern] !== undefined) ? ch.vols[stepInPattern] : null;
      // 颤音深度（半音）
      var vibDepth = (ch.vibrato && ch.vibrato[stepInPattern]) ? VIBRATO_TYPES[ch.vibrato[stepInPattern]].depth : 0;
      // 滑音：仅旋律声道（非噪声/非 DMC）且无琶音时生效
      var glideFrom = null;
      var glideTime = 0;
      if (ch.type !== 'noise' && ch.type !== 'dmc' && !arp && ch.glideTime > 0) {
        glideFrom = lastNotePitch[ch.type];
        glideTime = ch.glideTime;
        // 限制滑音时间不超过音符时长
        if (glideTime > noteDur) glideTime = noteDur;
      }
      if (arp) {
        // 琶音：在音符时长内循环 base, base+o1, base+o2（按 gate 扩展子音时长）
        // 琶音时不使用滑音
        var sub = noteDur / 3;
        for (var k = 0; k < 3; k++) {
          var offset = k === 0 ? 0 : arp[k - 1];
          NesApu.note(ch.type, ch, val + offset, time + k * sub, sub, volOverride, vibDepth);
        }
        // 更新最后音符音高（琶音用根音）
        if (ch.type !== 'noise') lastNotePitch[ch.type] = val;
      } else {
        NesApu.note(ch.type, ch, val, time, noteDur, volOverride, vibDepth, glideFrom, glideTime);
        // 更新最后音符音高
        if (ch.type !== 'noise' && ch.type !== 'dmc') lastNotePitch[ch.type] = val;
      }
    }
  }

  function clearPlayHighlight() {
    var cells = els.tracks.querySelectorAll('.step-cell');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('current');
  }

  // 把琶音偏移 [o1,o2] 映射回 ARP_TYPES 索引
  function arpToIndex(arp) {
    if (!arp || !Array.isArray(arp)) return 0;
    for (var i = 0; i < ARP_TYPES.length; i++) {
      var offs = ARP_TYPES[i].offsets;
      if (offs && offs[0] === arp[0] && offs[1] === arp[1]) return i;
    }
    return 0;
  }

  function highlightPlayStep() {
    var step, pi;
    if (singleLoop) {
      pi = singleLoopPatternIndex; // 高亮正在播放的段落标签
      step = globalStep % STEP_COUNT;
    } else {
      var slot = Math.floor(globalStep / STEP_COUNT);
      step = globalStep % STEP_COUNT;
      pi = song.order[slot];
      // 播放到新段落时，让网格和参数面板跟随当前段落
      if (pi !== currentPatternIndex) {
        currentPatternIndex = pi;
        currentOrderIndex = slot;
        renderPatternTabs();
        renderChannels();
        renderParamPanel();
        renderOrderBar();
      }
      // 高亮当前播放的编排槽位
      highlightPlayingOrder(slot);
    }
    highlightPlayingTab(pi);
    clearPlayHighlight();
    var cells = els.tracks.querySelectorAll('.step-cell[data-step="' + step + '"]');
    for (var i = 0; i < cells.length; i++) cells[i].classList.add('current');
    // 同步下拉框显示当前步格子的实际状态
    currentPlayStep = step;
    syncControlsToStep(step);
  }

  function highlightPlayingTab(pi) {
    var tabs = els.patternTabs.querySelectorAll('.pattern-chip');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('playing', i === pi);
    }
  }

  // 播放时把下拉框同步到当前步格子的实际状态（有音符显示格子数据，无音符显示画笔）
  function syncControlsToStep(step) {
    var pattern = currentPattern();
    if (!pattern || step < 0) return;
    var rows = els.tracks.querySelectorAll('.channel-row');
    for (var c = 0; c < rows.length && c < pattern.channels.length; c++) {
      var ch = pattern.channels[c];
      var row = rows[c];
      if (!ch || !row) continue;
      var start = noteStartAt(ch, step);
      var hasNote = start >= 0;

      var pitchSel = row.querySelector('.pitch-select');
      if (pitchSel) {
        pitchSel.value = hasNote ? String(ch.notes[start]) : String(selectedPitch[ch.type]);
      }

      var volSel = row.querySelector('.vol-select');
      if (volSel) {
        if (hasNote && ch.vols && ch.vols[start] !== null && ch.vols[start] !== undefined) {
          volSel.value = String(ch.vols[start]);
        } else if (hasNote) {
          volSel.value = 'd'; // 有音符但无音量列，显示默认
        } else {
          volSel.value = (selectedVol[ch.type] === null) ? 'd' : String(selectedVol[ch.type]);
        }
      }

      // 同步参数面板音量滑块：有音符且有音量列时显示当前音符力度，否则回落到段落级音量
      var volInput = els['vol_' + c];
      if (volInput) {
        var displayVol = ch.vol;
        if (hasNote && ch.vols && ch.vols[start] !== null && ch.vols[start] !== undefined) {
          displayVol = ch.vols[start];
        }
        volInput.value = String(displayVol);
        if (els['volLabel_' + c]) els['volLabel_' + c].textContent = displayVol;
      }

      var arpSel = row.querySelector('.arp-select');
      if (arpSel) {
        if (hasNote && ch.arp && Array.isArray(ch.arp[start])) {
          arpSel.value = String(arpToIndex(ch.arp[start]));
        } else {
          arpSel.value = String(selectedArp[ch.type]);
        }
      }

      var vibSel = row.querySelector('.vib-select');
      if (vibSel) {
        if (hasNote && ch.vibrato && ch.vibrato[start]) {
          vibSel.value = String(ch.vibrato[start]);
        } else {
          vibSel.value = String(selectedVibrato[ch.type]);
        }
      }

      var gateSel = row.querySelector('.gate-select');
      if (gateSel) {
        if (hasNote && ch.gates && ch.gates[start]) {
          gateSel.value = String(ch.gates[start]);
        } else {
          gateSel.value = String(selectedGate[ch.type]);
        }
      }

      // 同步参数面板鼓类型滑块：噪声声道随当前鼓点变化，否则回落到段落级鼓类型
      if (ch.type === 'noise') {
        var npInput = els['noisePeriod_' + c];
        if (npInput) {
          var displayPeriod = hasNote ? ch.notes[start] : ch.period;
          npInput.value = String(displayPeriod);
          if (els['noisePeriodLabel_' + c]) els['noisePeriodLabel_' + c].textContent = displayPeriod + '·' + noiseName(displayPeriod);
        }
      }

      // 同步参数面板 DMC 采样/速率：跟随声道级参数
      if (ch.type === 'dmc') {
        if (els['dmcSample_' + c]) els['dmcSample_' + c].value = String(ch.sample);
        if (els['dmcSampleLabel_' + c]) els['dmcSampleLabel_' + c].textContent = ch.sample + '·' + dmcName(ch.sample);
        if (els['dmcRate_' + c]) els['dmcRate_' + c].value = String(ch.rate);
        if (els['dmcRateLabel_' + c]) els['dmcRateLabel_' + c].textContent = ch.rate;
      }

      // 同步参数面板滑音滑块：有音符且有滑音时显示实际滑音时间（受音符时长约束），否则 0
      if (ch.type !== 'noise' && ch.type !== 'dmc') {
        var glideInput = els['glideTime_' + c];
        if (glideInput) {
          var displayGlideMs = 0;
          if (hasNote && ch.glideTime > 0) {
            var gateNow = (ch.gates && ch.gates[start]) || 1;
            var gTime = Math.min(ch.glideTime, stepDuration() * gateNow);
            displayGlideMs = Math.round(gTime * 1000);
          }
          glideInput.value = String(Math.round(displayGlideMs / 10));
          if (els['glideTimeLabel_' + c]) els['glideTimeLabel_' + c].textContent = displayGlideMs + ' ms';
        }
      }

      // 同步参数面板扫频滑块：有音符且有扫频时显示扫频参数，否则 0
      if (ch.type === 'pulse1' || ch.type === 'pulse2' || ch.type === 'pulse3' || ch.type === 'pulse4') {
        var sweepActive = hasNote && ch.sweepOn;
        if (els['sweepPeriod_' + c]) els['sweepPeriod_' + c].value = String(sweepActive ? ch.sweepPeriod : 0);
        if (els['sweepShift_' + c]) els['sweepShift_' + c].value = String(sweepActive ? ch.sweepShift : 0);
      }
    }
  }

  // 播放时把参数修改写入当前播放步的格子；返回写入的起始步（>=0）或 -1
  function writeParamToCurrentStep(channelIdx, param, value) {
    if (!isPlaying || currentPlayStep < 0) return -1;
    var ch = currentPattern().channels[channelIdx];
    if (!ch) return -1;
    var start = noteStartAt(ch, currentPlayStep);
    if (start < 0) return -1; // 当前步无音符，不写入（走画笔）

    if (param === 'pitch') {
      ch.notes[start] = value;
    } else if (param === 'vol') {
      ch.vols[start] = value; // value 为 null 表示默认
    } else if (param === 'arp') {
      ch.arp[start] = value; // offsets 或 null
    } else if (param === 'vibrato') {
      ch.vibrato[start] = value;
    } else if (param === 'gate') {
      var oldGate = ch.gates[start] || 1;
      ch.gates[start] = value;
      if (value < oldGate) {
        // 缩短：清空被释放的延续区间
        clearRange(ch, start + value, oldGate - value);
      } else if (value > oldGate) {
        // 延长：清空延长区间内可能冲突的音符
        clearRange(ch, start + oldGate, value - oldGate);
      }
    }
    return start;
  }

  // 刷新所有格子视觉（不重建下拉框），并保留当前播放步高亮
  function refreshAllCellsVisual() {
    var cells = els.tracks.querySelectorAll('.step-cell');
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var c = parseInt(cell.getAttribute('data-channel'), 10);
      var s = parseInt(cell.getAttribute('data-step'), 10);
      updateCellState(cell, c, s);
      if (isPlaying && s === currentPlayStep) cell.classList.add('current');
    }
  }

  // ========== 交互：预设 ==========
  function loadPreset(key) {
    if (isPlaying) stopPlayback();
    var presets = buildPresets();
    if (presets[key]) {
      song = presets[key];
      currentPatternIndex = 0;
      currentOrderIndex = 0;
      // 校验循环区间合法性
      song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
      song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
      renderAll();
      showToast(t('toast.presetLoaded'));
    }
  }

  // ========== 随机生成：风格库 ==========
  // 每个风格：音阶 + 和弦进行 + 鼓点库 + 音色偏好
  var RANDOM_STYLES = [
    {
      key: 'debussy', name: 'style.debussy', bpmMin: 70, bpmMax: 92,
      scale: [60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84], // 全音阶
      chords: [
        { root: 48, color: [0, 2, 7] },  // C 挂二
        { root: 50, color: [0, 4, 7] },  // D 大
        { root: 48, color: [0, 4, 8] },  // C 增三（全音阶）
        { root: 55, color: [0, 2, 7] }   // G 挂二
      ],
      drum: { kick: [0], snare: [8], hat: [4, 12], kickP: 13, snareP: 4, hatP: 1 },
      dutyPool: [0, 1]
    },
    {
      key: 'michael_jackson', name: 'style.mj', bpmMin: 112, bpmMax: 132,
      scale: [57, 60, 62, 63, 64, 67, 69, 72, 74, 76, 79, 81, 84], // A 小调五声 + 蓝调音
      chords: [
        { root: 45, color: [0, 3, 7] }, // Am
        { root: 53, color: [0, 4, 7] }, // F
        { root: 55, color: [0, 4, 7] }, // G
        { root: 45, color: [0, 3, 7] }  // Am
      ],
      drum: { kick: [0, 8, 10], snare: [4, 12], hat: [2, 6, 10, 14], kickP: 11, snareP: 5, hatP: 2 },
      dutyPool: [1, 2, 3]
    },
    {
      key: 'classic', name: 'style.classic', bpmMin: 100, bpmMax: 128,
      scale: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84], // C 大调
      chords: [
        { root: 48, color: [0, 4, 7] },  // C  (I)
        { root: 55, color: [0, 4, 7] },  // G  (V)
        { root: 57, color: [0, 3, 7] },  // Am (vi)
        { root: 53, color: [0, 4, 7] }   // F  (IV)
      ],
      drum: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], kickP: 11, snareP: 5, hatP: 2 },
      dutyPool: [1, 2, 3]
    }
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function styleByKey(key) {
    for (var i = 0; i < RANDOM_STYLES.length; i++) {
      if (RANDOM_STYLES[i].key === key) return RANDOM_STYLES[i];
    }
    return RANDOM_STYLES[0];
  }

  // 返回 [low, high] 音域内属于某和弦（root + color 半音程）的所有音
  function chordTones(root, color, low, high) {
    var tones = [];
    for (var p = low; p <= high; p++) {
      var st = ((p - root) % 12 + 12) % 12;
      if (color.indexOf(st) >= 0) tones.push(p);
    }
    return tones;
  }

  // 按段落截取音阶区间：前奏偏低、副歌偏高
  function sectionScale(scale, section) {
    var n = scale.length;
    if (section === 'intro') return scale.slice(0, Math.ceil(n / 3) + 1);
    if (section === 'chorus') return scale.slice(Math.floor(n / 3));
    return scale;
  }

  // 副歌和弦变奏：轮换和弦顺序 + 挂留(sus2/sus4)，让高潮和声更新鲜，避免三段套同一套和弦
  function varyChords(chords) {
    var rot = 1 + Math.floor(Math.random() * (chords.length - 1));
    var rotated = chords.slice(rot).concat(chords.slice(0, rot));
    return rotated.map(function (ch) {
      if (Math.random() < 0.35) {
        var color = ch.color.slice();
        var idx = color.indexOf(4);
        if (idx < 0) idx = color.indexOf(3);
        if (idx >= 0) {
          color[idx] = Math.random() < 0.5 ? 2 : 5; // sus2 或 sus4
          return { root: ch.root, color: color };
        }
      }
      return ch;
    });
  }

  // 节奏风格：按风格提供不同的音符/休止长度分布与切分倾向
  function rhythmProfile(styleKey) {
    if (styleKey === 'debussy') {
      // 德彪西：舒缓空灵，长音长休止，几乎不切分
      return { noteLens: [2, 4, 4, 8, 8], restLens: [2, 4, 4, 6], syncopate: 0.1 };
    }
    if (styleKey === 'michael_jackson') {
      // MJ：律动强，短音 + 附点（3 步）+ 短休止，切分多
      return { noteLens: [1, 2, 2, 3, 3], restLens: [1, 1, 2, 3], syncopate: 0.55 };
    }
    // 经典流行：稳定，八分/四分为主，适度切分
    return { noteLens: [1, 2, 2, 4, 4], restLens: [2, 2, 1, 4], syncopate: 0.25 };
  }

  // 生成节奏动机：{offset, len} 起音事件列表，按风格差异化（切分、附点、长短音）
  function genRhythmMotif(length, styleKey) {
    var prof = rhythmProfile(styleKey);
    var events = [];
    var pos = 0;
    while (pos < length) {
      var len = pick(prof.noteLens);
      if (pos + len > length) len = length - pos;
      if (len < 1) len = 1;
      events.push({ offset: pos, len: len });
      pos += len;
      // 休止：切分风格更常把休止缩到 1 步，让下个音符落在弱拍形成切分
      var rest = pick(prof.restLens);
      if (Math.random() < prof.syncopate) rest = 1;
      pos += rest;
    }
    if (events.length === 0) events.push({ offset: 0, len: 2 });
    return events;
  }

  // 找 scale 中靠近 prev 的音（级进）
  function nearbyNote(scale, prev) {
    if (prev === null || prev === undefined) return pick(scale);
    var close = [];
    for (var j = 0; j < scale.length; j++) {
      if (Math.abs(scale[j] - prev) <= 3) close.push(scale[j]);
    }
    if (close.length === 0) close = scale;
    return pick(close);
  }

  // 返回离 prev 最近的和弦音（平滑声部进行）
  function nearestChordTone(tones, prev) {
    if (prev === null || prev === undefined) return pick(tones);
    var best = tones[0], bestD = Math.abs(tones[0] - prev);
    for (var i = 1; i < tones.length; i++) {
      var d = Math.abs(tones[i] - prev);
      if (d < bestD) { bestD = d; best = tones[i]; }
    }
    return best;
  }

  // 按乐句方向选音：dir>0 偏好上行（不低于 prev），dir<0 偏好下行（不高于 prev）
  function directionalNote(candidates, prev, dir) {
    if (!candidates || candidates.length === 0) return null;
    if (prev === null || prev === undefined) {
      if (dir > 0) return candidates[candidates.length - 1];
      if (dir < 0) return candidates[0];
      return pick(candidates);
    }
    var filtered = [];
    for (var i = 0; i < candidates.length; i++) {
      if (dir > 0 && candidates[i] >= prev) filtered.push(candidates[i]);
      else if (dir < 0 && candidates[i] <= prev) filtered.push(candidates[i]);
      else filtered.push(candidates[i]);
    }
    if (filtered.length === 0) filtered = candidates;
    return pick(filtered);
  }

  // 把音高规整到 [low, high] 音域内（按八度平移，范围不足八度时取边界）
  function clampPitch(pitch, low, high) {
    if (pitch >= low && pitch <= high) return pitch;
    var p = pitch;
    while (p > high) p -= 12;
    while (p < low) p += 12;
    if (p < low) p = low;
    if (p > high) p = high;
    return p;
  }

  function generateMelody(notes, style, section, vols, gates, vibrato) {
    var sc = sectionScale(style.scale, section);
    var low = sc[0], high = sc[sc.length - 1];
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    var rhythm = genRhythmMotif(chordLen, style.key); // 一段节奏动机整段复用，形成律动一致
    var prevPitch = null;
    var questionEnd = Math.floor(chordCount / 2) - 1; // 问句结束段（停在非主音，未完成）
    var answerEnd = chordCount - 1;                   // 答句结束段（落回主音，完整终止）

    for (var ci = 0; ci < chordCount; ci++) {
      var chord = style.chords[ci];
      var tones = chordTones(chord.root, chord.color, low, high);
      if (tones.length === 0) tones = sc;
      var base = ci * chordLen;
      var evCount = rhythm.length;
      if (section === 'intro') evCount = Math.ceil(evCount / 2); // 前奏更稀疏

      // 乐句方向：前半段上行（问句），后半段下行（答句）
      var phraseDir = (ci < chordCount / 2) ? 1 : -1;

      for (var e = 0; e < evCount; e++) {
        var ev = rhythm[e];
        var step = base + ev.offset;
        if (step >= STEP_COUNT) break;
        var isStrong = (ev.offset % 4 === 0);
        var isLast = (e === evCount - 1);
        var pitch;
        if (isStrong) {
          // 强拍：平滑落到最近的和弦音（声部进行）
          pitch = nearestChordTone(tones, prevPitch);
        } else {
          // 弱拍：按乐句方向级进，问句上行、答句下行，形成起伏
          pitch = directionalNote(sc, prevPitch, phraseDir);
          if (pitch === null) pitch = nearbyNote(sc, prevPitch);
        }
        // 乐句结尾：问句停在非主音（未完成感），答句落回主音（完整终止）
        if (isLast) {
          if (ci === answerEnd) {
            pitch = clampPitch(chord.root, low, high);
          } else if (ci === questionEnd) {
            var nonRoot = [];
            for (var t = 0; t < tones.length; t++) {
              if (tones[t] !== chord.root) nonRoot.push(tones[t]);
            }
            if (nonRoot.length > 0) pitch = nonRoot[nonRoot.length - 1];
          }
        }
        // 防止过大跳进（超过 9 半音则改级进）
        if (prevPitch !== null && Math.abs(pitch - prevPitch) > 9) {
          pitch = nearbyNote(sc, prevPitch);
        }
        var melVol = isStrong ? 14 : 11;
        var gate = Math.min(ev.len, STEP_COUNT - step);
        notes[step] = pitch;
        if (vols) vols[step] = melVol;
        if (gates) gates[step] = gate;
        if (vibrato && gate >= 2 && Math.random() < (section === 'chorus' ? 0.4 : 0.2)) {
          vibrato[step] = 1 + Math.floor(Math.random() * 3);
        }
        prevPitch = pitch;
      }
    }
  }

  function generateBass(notes, style, section, gates, vibrato) {
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    for (var ci = 0; ci < chordCount; ci++) {
      var chord = style.chords[ci];
      var base = ci * chordLen;
      var root = chord.root - 12;
      if (root < 36) root = chord.root;
      // 副歌段更长的低音音符，主歌中等，前奏稀疏
      var noteLen;
      if (section === 'intro') {
        noteLen = 8; // 前奏：8步长音
      } else if (section === 'chorus') {
        noteLen = 4; // 副歌：4步一拍，更有动感
      } else {
        noteLen = 4; // 主歌：4步
      }
      for (var p = 0; p < chordLen; p += noteLen) {
        if (section === 'intro' && p % 8 !== 0) continue; // 前奏更稀疏
        var step = base + p;
        if (step >= STEP_COUNT) break;
        // 根音 / 五度交替
        var pitch = (p % 8 === 0) ? root : root + 7;
        // 实际时长：不超出段落和和弦边界
        var actualLen = Math.min(noteLen, STEP_COUNT - step, base + chordLen - step);
        if (actualLen < 1) actualLen = 1;
        notes[step] = pitch;
        if (gates) gates[step] = actualLen;
        // 颤音：长音符（≥4步）或副歌段按概率加颤音
        if (vibrato && actualLen >= 4 && Math.random() < (section === 'chorus' ? 0.3 : 0.15)) {
          vibrato[step] = 1 + Math.floor(Math.random() * 2); // 轻/中
        }
      }
    }
  }

  function generateHarmony(notes, style, section, vols, gates, vibrato) {
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    var low = style.scale[0], high = style.scale[style.scale.length - 1];
    for (var ci = 0; ci < chordCount; ci++) {
      var chord = style.chords[ci];
      var tones = chordTones(chord.root, chord.color, low, high);
      if (tones.length === 0) continue;
      var base = ci * chordLen;
      for (var p = 0; p < chordLen; p += 4) {
        if (section === 'intro' && Math.random() < 0.5) continue;
        var pitch = pick(tones);
        var step = base + p;
        var gate = Math.min(4, STEP_COUNT - step);
        notes[step] = pitch;
        if (vols) vols[step] = 9; // 和声音量较低，衬托旋律
        if (gates) gates[step] = gate;
        // 颤音：和声长音按概率加轻/中颤音
        if (vibrato && gate >= 4 && Math.random() < 0.25) {
          vibrato[step] = 1 + Math.floor(Math.random() * 2); // 轻/中
        }
      }
    }
  }

  // 生成对位副旋律：音区比主旋律低、节奏更稀疏，形成二声部呼应
  function generateCounter(notes, style, section, vols, gates, vibrato) {
    var sc = sectionScale(style.scale, section);
    var mid = Math.floor(sc.length / 2);
    var counterScale = sc.slice(0, mid + 1); // 取音阶低半段，避开主旋律音区
    var low = counterScale[0], high = counterScale[counterScale.length - 1];
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    var rhythm = genRhythmMotif(chordLen, style.key);
    var prevPitch = null;

    for (var ci = 0; ci < chordCount; ci++) {
      var chord = style.chords[ci];
      var tones = chordTones(chord.root, chord.color, low, high);
      if (tones.length === 0) tones = counterScale;
      var base = ci * chordLen;
      // 副旋律比主旋律稀疏：前奏最少，副歌稍密
      var evCount = section === 'intro' ? 2 : (section === 'chorus' ? rhythm.length : Math.max(2, Math.ceil(rhythm.length / 2)));
      if (evCount > rhythm.length) evCount = rhythm.length; // 防止节奏动机过短时越界

      for (var e = 0; e < evCount; e++) {
        var ev = rhythm[e];
        var step = base + ev.offset;
        if (step >= STEP_COUNT) break;
        var isStrong = (e % 2 === 0);
        var pitch = isStrong ? nearestChordTone(tones, prevPitch) : nearbyNote(counterScale, prevPitch);
        if (prevPitch !== null && Math.abs(pitch - prevPitch) > 7) pitch = nearbyNote(counterScale, prevPitch);
        var gate = Math.min(ev.len, STEP_COUNT - step);
        notes[step] = pitch;
        if (vols) vols[step] = 9; // 低于主旋律
        if (gates) gates[step] = gate;
        if (vibrato && gate >= 4 && Math.random() < 0.2) {
          vibrato[step] = 1 + Math.floor(Math.random() * 2);
        }
        prevPitch = pitch;
      }
    }
  }

  // 生成琶音分解线：快速上下分解和弦，形成流动律动
  function generateArpLine(notes, style, section, vols, gates) {
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    var low = style.scale[0], high = style.scale[style.scale.length - 1];
    for (var ci = 0; ci < chordCount; ci++) {
      var chord = style.chords[ci];
      var tones = chordTones(chord.root, chord.color, low, high);
      if (tones.length === 0) continue;
      var base = ci * chordLen;
      for (var p = 0; p < chordLen; p += 2) {
        if (section === 'intro' && Math.random() < 0.4) continue; // 前奏更稀疏
        var step = base + p;
        var k = Math.floor(p / 2);
        // 低-高-低-高 交替，形成波浪琶音
        var idx = (k % 2 === 0) ? (k % tones.length) : (tones.length - 1 - (k % tones.length));
        var pitch = tones[idx];
        var gate = Math.min(2, STEP_COUNT - step);
        notes[step] = pitch;
        if (vols) vols[step] = 7; // 琶音量低，衬托
        if (gates) gates[step] = gate;
      }
    }
  }

  // 根据和弦音程返回琶音偏移
  function chordToArp(color) {
    if (color.indexOf(4) >= 0 && color.indexOf(7) >= 0) return [4, 7]; // 大三
    if (color.indexOf(3) >= 0 && color.indexOf(7) >= 0) return [3, 7]; // 小三
    if (color.indexOf(7) >= 0) return [7, 12]; // 五度
    return [4, 7];
  }

  // 给已有音符按概率加琶音（副歌为主）
  function generateArp(notes, arp, style, section) {
    if (section === 'intro') return; // 前奏不加琶音
    var chance = section === 'chorus' ? 0.5 : 0.2;
    var chordCount = style.chords.length;
    var chordLen = STEP_COUNT / chordCount;
    for (var s = 0; s < STEP_COUNT; s++) {
      if (notes[s] === null || notes[s] === undefined) continue;
      if (Math.random() > chance) continue;
      var ci = Math.floor(s / chordLen);
      var chord = style.chords[ci];
      arp[s] = chordToArp(chord.color);
    }
  }

  function clampPeriod(p) { return Math.max(0, Math.min(15, p)); }

  function generateDrums(notes, style, section, shift, vols) {
    for (var i = 0; i < STEP_COUNT; i++) notes[i] = null;
    if (vols) for (var v = 0; v < STEP_COUNT; v++) vols[v] = null;
    var drum = style.drum;
    var sft = shift || 0;
    // 段落级噪声 period 微调：前奏更沉(+)、副歌更亮(-)
    var kp = clampPeriod(drum.kickP + sft);
    var sp = clampPeriod(drum.snareP + sft);
    var hp = clampPeriod(drum.hatP + sft);
    var reps = 2; // 16 步节奏型重复两次
    for (var r = 0; r < reps; r++) {
      var base = r * 16;
      if (section !== 'intro') {
        for (var k = 0; k < drum.kick.length; k++) {
          notes[base + drum.kick[k]] = kp;
          if (vols) vols[base + drum.kick[k]] = 14; // 底鼓最重
        }
        for (var s = 0; s < drum.snare.length; s++) {
          notes[base + drum.snare[s]] = sp;
          if (vols) vols[base + drum.snare[s]] = 10; // 军鼓中等
        }
      }
      for (var h = 0; h < drum.hat.length; h++) {
        notes[base + drum.hat[h]] = hp;
        if (vols) vols[base + drum.hat[h]] = 6; // 高帽最轻
      }
    }
    // 副歌结尾加花：最后 4 步密集军鼓
    if (section === 'chorus') {
      for (var f = 28; f < 32; f++) {
        notes[f] = sp;
        if (vols) vols[f] = 12;
      }
    }
  }

  // DMC 采样鼓点：与噪声鼓共用节奏型，映射到采样（0=底鼓 1=军鼓 3=镲片）
  function generateDmcDrums(notes, style, section, vols) {
    for (var i = 0; i < STEP_COUNT; i++) notes[i] = null;
    if (vols) for (var v = 0; v < STEP_COUNT; v++) vols[v] = null;
    var drum = style.drum;
    var reps = 2; // 16 步节奏型重复两次
    for (var r = 0; r < reps; r++) {
      var base = r * 16;
      if (section !== 'intro') {
        for (var k = 0; k < drum.kick.length; k++) {
          notes[base + drum.kick[k]] = 0; // DMC 底鼓
          if (vols) vols[base + drum.kick[k]] = 14;
        }
        for (var s = 0; s < drum.snare.length; s++) {
          notes[base + drum.snare[s]] = 1; // DMC 军鼓
          if (vols) vols[base + drum.snare[s]] = 10;
        }
      }
      for (var h = 0; h < drum.hat.length; h++) {
        notes[base + drum.hat[h]] = 3; // DMC 镲片
        if (vols) vols[base + drum.hat[h]] = 7;
      }
    }
    // 副歌结尾加花：密集军鼓
    if (section === 'chorus') {
      for (var f = 28; f < 32; f++) {
        notes[f] = 1;
        if (vols) vols[f] = 12;
      }
    }
  }

  function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  // 段落级音色递进：前奏暗薄 → 主歌中性 → 副歌亮厚
  function sectionProfile(section) {
    if (section === 'intro') return {
      dutyBias: -1,
      env1: ['loop', 'decay'], env2: ['loop', 'const'],
      vol1: [9, 11], vol2: [7, 9],
      noiseMode: [0], noiseVol: [8, 10],
      noiseShift: 1, sweepChance: 0.5
    };
    if (section === 'chorus') return {
      dutyBias: 1,
      env1: ['decay', 'decay', 'loop'], env2: ['decay', 'const'],
      vol1: [12, 15], vol2: [9, 12],
      noiseMode: [1], noiseVol: [11, 13],
      noiseShift: -1, sweepChance: 0.25
    };
    return {
      dutyBias: 0,
      env1: ['decay', 'loop'], env2: ['decay', 'loop', 'const'],
      vol1: [10, 13], vol2: [8, 10],
      noiseMode: [0, 1], noiseVol: [9, 12],
      noiseShift: 0, sweepChance: 0.1
    };
  }

  // 按 bias 从 dutyPool 选：bias<0 偏暗（低占空比），bias>0 偏亮（高占空比）
  function pickDutyByBias(pool, bias) {
    var sorted = pool.slice().sort(function (a, b) { return a - b; });
    if (bias < 0 && Math.random() < 0.6) return sorted[0];
    if (bias > 0 && Math.random() < 0.6) return sorted[sorted.length - 1];
    return pick(sorted);
  }

  function generatePattern(style, section) {
    var labels = { intro: 'section.intro', verse: 'section.verse', chorus: 'section.chorus' };
    var pat = createEmptyPattern(t(labels[section]));
    var prof = sectionProfile(section);

    // 副歌：换一套变奏和弦（轮换顺序 + 挂留），让高潮和声更新鲜，避免三段套同一套和弦
    var st = style;
    if (section === 'chorus') {
      st = { key: style.key, scale: style.scale, chords: varyChords(style.chords), drum: style.drum, dutyPool: style.dutyPool };
    }

    // SAW 主旋律（锯齿波音色厚实，最突出）
    pat.channels[6].vol = randInt(prof.vol1[0], prof.vol1[1]);
    pat.channels[6].envMode = pick(prof.env1);

    // P1 副旋律（对位第二声部，音量低于主旋律）
    pat.channels[0].duty = pickDutyByBias(style.dutyPool, prof.dutyBias);
    pat.channels[0].envMode = pick(prof.env2);
    pat.channels[0].vol = randInt(prof.vol2[0], prof.vol2[1]);

    // P2 和声（和弦衬托）
    pat.channels[1].duty = pickDutyByBias(style.dutyPool, prof.dutyBias);
    pat.channels[1].envMode = 'decay';
    pat.channels[1].vol = randInt(prof.vol2[0], prof.vol2[1]);

    // P3 琶音分解（流动律动，音量低）
    pat.channels[4].duty = pickDutyByBias(style.dutyPool, 0);
    pat.channels[4].envMode = 'decay';
    pat.channels[4].vol = 7;

    // P4 副歌第二和声层（仅副歌使用）
    pat.channels[5].duty = pickDutyByBias(style.dutyPool, prof.dutyBias);
    pat.channels[5].envMode = 'decay';
    pat.channels[5].vol = 8;

    // 噪声声道
    pat.channels[3].mode = pick(prof.noiseMode);
    pat.channels[3].vol = randInt(prof.noiseVol[0], prof.noiseVol[1]);

    // DMC 采样鼓点声道：速率档决定音高/时长，前奏更沉、副歌更亮
    pat.channels[7].vol = 13;
    pat.channels[7].rate = section === 'intro' ? 7 : (section === 'chorus' ? 11 : 9);

    // 扫频：P1 副旋律作为装饰音（SAW 不支持扫频，仅脉冲声道）
    if (Math.random() < prof.sweepChance) {
      pat.channels[0].sweepOn = true;
      pat.channels[0].sweepShift = 1 + Math.floor(Math.random() * 3);
      pat.channels[0].sweepPeriod = section === 'intro' ? 1 : randInt(1, 3);
    }

    // 滑音：按段落风格和概率设置（副歌更多，前奏较少）
    var glideChance = section === 'chorus' ? 0.6 : (section === 'verse' ? 0.4 : 0.2);
    // SAW 主旋律滑音
    if (Math.random() < glideChance) {
      pat.channels[6].glideTime = (50 + Math.floor(Math.random() * 150)) / 1000; // 50-200ms
    }
    // P1 副旋律滑音（概率稍低）
    if (Math.random() < glideChance * 0.7) {
      pat.channels[0].glideTime = (50 + Math.floor(Math.random() * 150)) / 1000;
    }
    // TRI 低音滑音
    if (Math.random() < glideChance * 0.8) {
      pat.channels[2].glideTime = (80 + Math.floor(Math.random() * 170)) / 1000; // 80-250ms
    }

    // 声部生成
    generateBass(pat.channels[2].notes, st, section, pat.channels[2].gates, pat.channels[2].vibrato);
    generateDrums(pat.channels[3].notes, st, section, prof.noiseShift, pat.channels[3].vols);
    generateDmcDrums(pat.channels[7].notes, st, section, pat.channels[7].vols);
    generateMelody(pat.channels[6].notes, st, section, pat.channels[6].vols, pat.channels[6].gates, pat.channels[6].vibrato);   // SAW 主旋律
    generateCounter(pat.channels[0].notes, st, section, pat.channels[0].vols, pat.channels[0].gates, pat.channels[0].vibrato); // P1 副旋律
    generateHarmony(pat.channels[1].notes, st, section, pat.channels[1].vols, pat.channels[1].gates, pat.channels[1].vibrato); // P2 和声
    generateArpLine(pat.channels[4].notes, st, section, pat.channels[4].vols, pat.channels[4].gates);                            // P3 琶音
    if (section === 'chorus') {
      generateHarmony(pat.channels[5].notes, st, section, pat.channels[5].vols, pat.channels[5].gates, null); // P4 副歌第二和声
    }
    // 琶音标记：主旋律与和声按概率加琶音
    generateArp(pat.channels[6].notes, pat.channels[6].arp, st, section);
    generateArp(pat.channels[1].notes, pat.channels[1].arp, st, section);
    return pat;
  }

  function generateSong(styleKey) {
    var style = styleByKey(styleKey);
    var s = createEmptySong();
    s.bpm = style.bpmMin + Math.floor(Math.random() * (style.bpmMax - style.bpmMin + 1));
    s.patterns = [
      generatePattern(style, 'intro'),
      generatePattern(style, 'verse'),
      generatePattern(style, 'chorus')
    ];
    s.order = [0, 1, 2, 1];
    s.loopStart = 1;
    s.loopEnd = 4;
    return s;
  }

  function randomMelody() {
    if (isPlaying) stopPlayback();
    var styleKey = (els.randomStyleSelect && els.randomStyleSelect.value) || 'auto';
    if (styleKey === 'auto') styleKey = pick(RANDOM_STYLES).key;
    var style = styleByKey(styleKey);
    song = generateSong(styleKey);
    currentPatternIndex = 0;
    currentOrderIndex = 0;
    renderAll();
    showToast(t('toast.random', { name: t(style.name) }));
  }

  function clearGrid() {
    if (isPlaying) stopPlayback();
    var chs = currentPattern().channels;
    for (var c = 0; c < chs.length; c++) {
      chs[c].notes = emptyNotes();
      if (chs[c].arp) chs[c].arp = emptyNotes();
      if (chs[c].vols) chs[c].vols = emptyNotes();
      if (chs[c].gates) chs[c].gates = emptyNotes();
      if (chs[c].vibrato) chs[c].vibrato = emptyNotes();
    }
    renderChannels();
    showToast(t('toast.cleared'));
  }

  // ========== 交互：保存/加载 ==========
  function openSavePanel() {
    if (!songHasNotes()) { showToast(t('toast.emptyToSave')); return; }
    els.savePanel.classList.add('show');
    els.savePanel.setAttribute('data-mode', 'save');
    els.saveInput.value = t('save.defaultName');
    els.saveInput.select();
    setTimeout(function () { els.saveInput.focus(); }, 50);
  }

  function closeSavePanel() {
    els.savePanel.classList.remove('show');
  }

  function confirmSave() {
    var mode = els.savePanel.getAttribute('data-mode');
    var name = els.saveInput.value.trim();
    if (!name) { showToast(t('toast.nameRequired')); return; }

    if (mode === 'rename') {
      currentPattern().name = name;
      closeSavePanel();
      renderAll();
      showToast(t('toast.renamed', { name: name }));
      return;
    }

    // 保存歌曲：同名覆盖
    var next = [];
    for (var i = 0; i < savedSongs.length; i++) {
      if (savedSongs[i].name !== name) next.push(savedSongs[i]);
    }
    next.push({ name: name, song: cloneSong(song) });
    savedSongs = next;
    persistSongs();
    closeSavePanel();
    renderLibrary();
    showToast(t('toast.saved', { name: name }));
    openShareModal(name);
  }

  function loadSong(idx) {
    var item = savedSongs[idx];
    if (!item) return;
    if (isPlaying) stopPlayback();
    song = cloneSong(item.song);
    currentPatternIndex = 0;
    currentOrderIndex = 0;
    // 校验循环区间合法性
    song.loopStart = Math.max(0, Math.min(song.loopStart, song.order.length - 1));
    song.loopEnd = Math.max(1, Math.min(song.loopEnd, song.order.length));
    renderAll();
    showToast(t('toast.loaded', { name: item.name }));
  }

  function deleteSong(idx) {
    var item = savedSongs[idx];
    if (!item) return;
    var next = [];
    for (var i = 0; i < savedSongs.length; i++) {
      if (i !== idx) next.push(savedSongs[i]);
    }
    savedSongs = next;
    persistSongs();
    renderLibrary();
    showToast(t('toast.deleted', { name: item.name }));
  }

  // ========== 分享模态框 ==========
  function openShareModal(name) {
    els.shareName.textContent = name;
    els.shareMeta.textContent = t('share.meta', { bpm: song.bpm, n: song.patterns.length });
    els.shareModal.classList.add('show');
  }

  // ========== 语言切换 ==========
  function applyStaticText() {
    var i;
    var els2 = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < els2.length; i++) {
      els2[i].textContent = t(els2[i].getAttribute('data-i18n'));
    }
    var els3 = document.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < els3.length; i++) {
      els3[i].innerHTML = t(els3[i].getAttribute('data-i18n-html'));
    }
    var els4 = document.querySelectorAll('[data-i18n-placeholder]');
    for (i = 0; i < els4.length; i++) {
      els4[i].setAttribute('placeholder', t(els4[i].getAttribute('data-i18n-placeholder')));
    }
  }

  function updateLangToggle() {
    if (els.langToggle) els.langToggle.textContent = (window.I18N.current === 'zh') ? 'EN' : '中';
  }

  function applyLang() {
    applyStaticText();
    renderAll();
    updateLangToggle();
  }

  window.__onLangChange = applyLang;

  // ========== 标签页切换 ==========
  function switchTab(mode) {
    var isHelp = (mode === 'help');
    els.viewSynth.hidden = isHelp;
    els.viewHelp.hidden = !isHelp;
    els.tabSynth.classList.toggle('active', !isHelp);
    els.tabHelp.classList.toggle('active', isHelp);
    els.statusPill.style.display = isHelp ? 'none' : '';
  }

  // ========== 初始化 ==========
  function init() {
    var ids = ['playBtn', 'saveBtn', 'randomBtn', 'clearBtn', 'bpmSlider', 'bpmValue',
      'savePanel', 'saveInput', 'confirmSaveBtn', 'tracks', 'patternTabs', 'orderBar',
      'toast', 'statusPill', 'statusText', 'libraryContainer', 'libraryCount',
      'shareModal', 'shareName', 'shareMeta', 'closeShareBtn', 'playShareBtn',
      'addPatternBtn', 'dupPatternBtn', 'delPatternBtn', 'renamePatternBtn',
      'addOrderBtn', 'loopStartBtn', 'loopEndBtn', 'randomStyleSelect', 'singleLoopToggle',
      'importMidiBtn', 'midiFileInput', 'exportMidiBtn', 'langToggle',
      'tabSynth', 'tabHelp', 'viewSynth', 'viewHelp'];
    for (var i = 0; i < ids.length; i++) {
      els[ids[i]] = document.getElementById(ids[i]);
    }
    // 参数控件引用
    for (var c = 0; c < CHANNEL_TYPES.length; c++) {
      els['vol_' + c] = document.getElementById('vol_' + c);
      els['volLabel_' + c] = document.getElementById('volLabel_' + c);
      els['sweepOn_' + c] = document.getElementById('sweepOn_' + c);
      els['sweepPeriod_' + c] = document.getElementById('sweepPeriod_' + c);
      els['sweepShift_' + c] = document.getElementById('sweepShift_' + c);
      els['noisePeriod_' + c] = document.getElementById('noisePeriod_' + c);
      els['noisePeriodLabel_' + c] = document.getElementById('noisePeriodLabel_' + c);
      els['dmcSample_' + c] = document.getElementById('dmcSample_' + c);
      els['dmcSampleLabel_' + c] = document.getElementById('dmcSampleLabel_' + c);
      els['dmcRate_' + c] = document.getElementById('dmcRate_' + c);
      els['dmcRateLabel_' + c] = document.getElementById('dmcRateLabel_' + c);
      els['glideTime_' + c] = document.getElementById('glideTime_' + c);
      els['glideTimeLabel_' + c] = document.getElementById('glideTimeLabel_' + c);
    }

    renderAll();

    // 播放/保存/随机/清空
    els.playBtn.addEventListener('click', togglePlay);
    els.saveBtn.addEventListener('click', openSavePanel);
    els.randomBtn.addEventListener('click', randomMelody);
    els.clearBtn.addEventListener('click', clearGrid);
    els.confirmSaveBtn.addEventListener('click', confirmSave);
    els.langToggle.addEventListener('click', function () {
      window.I18N.setLang(window.I18N.current === 'zh' ? 'en' : 'zh');
    });
    els.tabSynth.addEventListener('click', function () { switchTab('synth'); });
    els.tabHelp.addEventListener('click', function () { switchTab('help'); });
    els.saveInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmSave();
      else if (e.key === 'Escape') closeSavePanel();
    });

    // BPM
    els.bpmSlider.addEventListener('input', function (e) {
      song.bpm = Math.max(60, Math.min(180, Math.round(parseFloat(e.target.value))));
      renderBpm();
      if (isPlaying) rebuildSchedule();
    });

    // 单段循环开关
    els.singleLoopToggle.addEventListener('change', function (e) {
      singleLoop = e.target.checked;
      if (isPlaying) {
        // 播放中切换：先停再按新模式重启
        stopPlayback();
        if (singleLoop) {
          if (patternHasNotes(currentPatternIndex)) startPlayback();
        } else {
          if (songHasNotes()) startPlayback();
        }
      }
      showToast(singleLoop ? t('toast.singleLoopOn') : t('toast.fullPlay'));
    });

    // Pattern 管理
    els.addPatternBtn.addEventListener('click', addPattern);
    els.dupPatternBtn.addEventListener('click', duplicatePattern);
    els.delPatternBtn.addEventListener('click', deletePattern);
    els.renamePatternBtn.addEventListener('click', renamePattern);

    // Order 编排
    els.addOrderBtn.addEventListener('click', addOrderSlot);
    els.loopStartBtn.addEventListener('click', setLoopStart);
    els.loopEndBtn.addEventListener('click', setLoopEnd);

    // 预设
    var presetBtns = document.querySelectorAll('.preset-btn[data-preset]');
    for (var pi = 0; pi < presetBtns.length; pi++) {
      presetBtns[pi].addEventListener('click', function () {
        loadPreset(this.getAttribute('data-preset'));
      });
    }

    // MIDI 导入
    els.importMidiBtn.addEventListener('click', function () {
      els.midiFileInput.click();
    });
    els.midiFileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importMidiFile(f);
      e.target.value = ''; // 允许重复选择同一文件
    });

    // MIDI 导出
    els.exportMidiBtn.addEventListener('click', downloadSongAsMidi);

    // 参数按钮（事件委托）：button 用 click，checkbox（sweepOn）用 change
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-param') && t.getAttribute('data-param') !== 'sweepOn') {
        onParamClick({ currentTarget: t });
      }
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-param') && t.getAttribute('data-param') === 'sweepOn') {
        onParamClick({ currentTarget: t });
      }
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-param') && t.getAttribute('data-param') !== 'sweepOn') {
        onParamSlider({ currentTarget: t });
      }
    });

    // 分享模态框
    els.closeShareBtn.addEventListener('click', function () { els.shareModal.classList.remove('show'); });
    els.playShareBtn.addEventListener('click', function () {
      els.shareModal.classList.remove('show');
      if (!isPlaying) startPlayback();
    });
    els.shareModal.addEventListener('click', function (e) {
      if (e.target === els.shareModal) els.shareModal.classList.remove('show');
    });

    // 触控优化：防止双击缩放
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    // 页面隐藏时暂停播放
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && isPlaying) stopPlayback();
    });

    // 初始语言渲染（静态文案 + 切换按钮）
    applyStaticText();
    updateLangToggle();
  }

  // ========== MIDI 导入 ==========
  // 纯 JS MIDI 解析器：支持 format 0/1、运行状态、tempo 元事件、GM 打击乐（channel 9）
  function parseMidiBytes(bytes) {
    var pos = 0;
    function u16() { var v = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; return v; }
    function u32() { var v = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0; pos += 4; return v; }
    function varlen() { var v = 0; while (true) { var b = bytes[pos++]; v = (v << 7) | (b & 0x7F); if (!(b & 0x80)) return v; } }
    function ascii(len) { var s = ''; for (var i = 0; i < len; i++) s += String.fromCharCode(bytes[pos + i]); pos += len; return s; }

    if (ascii(4) !== 'MThd') throw new Error(t('err.notMidi'));
    var headerLen = u32();
    var format = u16();
    var numTracks = u16();
    var division = u16();
    pos += headerLen - 6;
    if (division & 0x8000) throw new Error(t('err.smpte'));
    var ppq = division;

    var tempoMap = [];
    var notes = [];
    var maxTick = 0;

    for (var t = 0; t < numTracks; t++) {
      if (ascii(4) !== 'MTrk') throw new Error(t('err.trackHeader'));
      var trackLen = u32();
      var trackEnd = pos + trackLen;
      var absTick = 0;
      var running = null;
      var active = {}; // "ch:note" -> {start, vel}

      while (pos < trackEnd) {
        absTick += varlen();
        if (absTick > maxTick) maxTick = absTick;
        var sb = bytes[pos];
        var status;
        if (sb & 0x80) { status = sb; pos++; running = status; }
        else { status = running; }
        if (status == null) break;

        if (status === 0xFF) {
          var mtype = bytes[pos++];
          var mlen = varlen();
          if (mtype === 0x51 && mlen >= 3) {
            var us = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
            if (us > 0) tempoMap.push({ tick: absTick, bpm: 60000000 / us });
          } else if (mtype === 0x2F) { break; }
          pos += mlen;
          continue;
        }
        if (status === 0xF0 || status === 0xF7) { var sl = varlen(); pos += sl; continue; }
        var st = status & 0xF0;
        var ch = status & 0x0F;
        if (st === 0xC0 || st === 0xD0) { pos += 1; continue; }
        if (st === 0x80 || st === 0x90) {
          var note = bytes[pos]; var vel = bytes[pos + 1]; pos += 2;
          var key = ch + ':' + note;
          if (st === 0x90 && vel > 0) {
            if (!(key in active)) active[key] = { start: absTick, vel: vel };
          } else if (key in active) {
            var a = active[key];
            notes.push({ midi: note, track: t, channel: ch, startTick: a.start, endTick: Math.max(absTick, a.start + 1), velocity: a.vel, percussion: ch === 9 });
            delete active[key];
          }
          continue;
        }
        pos += 2;
      }
      for (var k in active) {
        var a = active[k];
        var parts = k.split(':');
        notes.push({ midi: parseInt(parts[1], 10), track: t, channel: parseInt(parts[0], 10), startTick: a.start, endTick: Math.max(maxTick, a.start + 1), velocity: a.vel, percussion: parseInt(parts[0], 10) === 9 });
      }
    }

    tempoMap.sort(function (a, b) { return a.tick - b.tick; });
    return { notes: notes, tempoMap: tempoMap, ppq: ppq, format: format, maxTick: maxTick };
  }

  function tickToSeconds(tick, tempoMap, ppq) {
    var sec = 0, prevTick = 0, prevBpm = 120;
    for (var i = 0; i < tempoMap.length; i++) {
      var e = tempoMap[i];
      if (e.tick >= tick) break;
      sec += (e.tick - prevTick) / ppq * (60 / prevBpm);
      prevTick = e.tick; prevBpm = e.bpm;
    }
    sec += (tick - prevTick) / ppq * (60 / prevBpm);
    return sec;
  }

  function gmDrumToNoise(note) {
    if (note === 35 || note === 36) return 11;                 // 底鼓
    if (note === 38 || note === 40) return 5;                  // 军鼓
    if (note === 42 || note === 44 || note === 46) return 2;   // 高帽
    if (note === 49 || note === 52 || note === 55 || note === 57) return 0; // 镲
    if (note === 51 || note === 53 || note === 59) return 1;   // 骑镲
    if (note >= 41 && note <= 50) return 6;                    // 桶鼓
    return 8;                                                  // 中鼓
  }

  // GM 打击乐 → DMC 采样索引；返回 null 表示该鼓仍走噪声声道（分工方案）
  function gmDrumToDmc(note) {
    if (note === 35 || note === 36) return 0;                  // 底鼓 → DMC 底鼓
    if (note === 41 || note === 43 || note === 45 || note === 47) return 2; // 低桶鼓 → DMC 贝斯
    return null;                                               // 军鼓/高帽/镲等仍走噪声
  }

  function convertMidiToSong(midiData) {
    var ppq = midiData.ppq;
    var tempoMap = midiData.tempoMap || [];
    var notes = midiData.notes || [];
    var bpm = tempoMap.length ? tempoMap[0].bpm : 120;
    bpm = Math.max(60, Math.min(180, Math.round(bpm)));
    var stepDur = (60 / bpm) * 0.25;

    var melody = [];
    var drums = [];
    var maxStep = 0;
    var maxVel = 1;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var vel = (typeof n.velocity === 'number') ? n.velocity : 100;
      if (vel > maxVel) maxVel = vel;
      var t0 = tickToSeconds(n.startTick, tempoMap, ppq);
      var t1 = tickToSeconds(n.endTick, tempoMap, ppq);
      var raw = t0 / stepDur;
      var step = Math.max(0, Math.round(raw));
      var gate = Math.max(1, Math.round((t1 - t0) / stepDur));
      // 保留原始音高（0..127），后续按声部做八度拟合与 clamp
      var m = Math.max(0, Math.min(127, n.midi));
      if (n.percussion) drums.push({ step: step, midi: n.midi, vel: vel });
      else melody.push({ step: step, raw: raw, midi: m, gate: gate, vel: vel, source: (n.track != null ? n.track : 0) + ':' + (n.channel != null ? n.channel : 0) });
      if (step + gate > maxStep) maxStep = step + gate;
    }

    // 量化碰撞消解：快速连续音（实际相隔 >0.5 步）被四舍五入到同一格时，顺延到下一格
    function resolveSteps(arr) {
      arr.sort(function (a, b) { return a.raw - b.raw; });
      var prevRaw = -Infinity, prevStep = -Infinity;
      for (var mi = 0; mi < arr.length; mi++) {
        var mn = arr[mi];
        var s = Math.round(mn.raw);
        if (mn.raw - prevRaw < 0.5 && s <= prevStep) {
          s = prevStep;                    // 和弦：并到前一格
        } else {
          s = Math.max(s, prevStep + 1);   // 顺序：至少后一格
        }
        mn.step = s;
        prevRaw = mn.raw;
        prevStep = s;
        if (s + mn.gate > maxStep) maxStep = s + mn.gate;
      }
    }

    // 按来源（track:channel）分组，判断能否做「轨道/通道 → NES 声道」直接映射
    var sourceMap = {};
    for (var sj = 0; sj < melody.length; sj++) {
      var src = melody[sj].source;
      (sourceMap[src] || (sourceMap[src] = [])).push(melody[sj]);
    }
    var sourceKeys = Object.keys(sourceMap);
    var chBySource = null;
    var sourceList = null;
    if (sourceKeys.length >= 2) {
      sourceList = sourceKeys.map(function (k) {
        var arr = sourceMap[k].slice().sort(function (a, b) { return a.midi - b.midi; });
        return { key: k, notes: sourceMap[k], median: arr[Math.floor(arr.length / 2)].midi };
      }).sort(function (a, b) { return a.median - b.median; });
      chBySource = {};
      // 按来源数选择声道映射表（来源已按中位音高从低到高排序）
      // 声道索引：0=P1, 1=P2, 2=TRI, 3=NSE, 4=P3, 5=P4, 6=SAW
      var SOURCE_CH_MAPS = [
        [2, 0],              // 2 来源：TRI, P1
        [2, 1, 0],           // 3 来源：TRI, P2, P1
        [2, 6, 1, 0],        // 4 来源：TRI, SAW, P2, P1
        [2, 6, 5, 1, 0],     // 5 来源：TRI, SAW, P4, P2, P1
        [2, 6, 5, 4, 1, 0]   // 6 来源：TRI, SAW, P4, P3, P2, P1
      ];
      var mapIdx = Math.min(sourceList.length, 6) - 2;
      var map = SOURCE_CH_MAPS[mapIdx];
      for (var q = 0; q < sourceList.length; q++) {
        chBySource[sourceList[q].key] = (q < map.length) ? map[q] : 1; // 溢出 → P2
      }
    }

    // 解析步序：直接映射按来源分别解析，否则全局解析
    if (chBySource) {
      for (var q2 = 0; q2 < sourceList.length; q2++) resolveSteps(sourceList[q2].notes);
    } else {
      resolveSteps(melody);
    }

    var patternCount = Math.max(1, Math.ceil(maxStep / STEP_COUNT));
    var patterns = [];
    for (var p = 0; p < patternCount; p++) {
      patterns.push(createEmptyPattern(t('import.name', { c: String.fromCharCode(65 + (p % 26)) })));
    }

    function velToVol(vel) {
      var ratio = maxVel > 0 ? (vel / maxVel) : 1;
      return Math.max(4, Math.min(15, Math.round(4 + 11 * ratio)));
    }

    function writeChannel(ch, step, midi, gate, vel) {
      if (step < 0 || step >= STEP_COUNT) return;
      ch.notes[step] = midi;
      ch.gates[step] = Math.max(1, Math.min(STEP_COUNT - step, gate));
      if (ch.vols) ch.vols[step] = velToVol(vel != null ? vel : 100);
    }

    // 落位音符；长音自动跨段续接（拆到后续段落的首步）
    function putNote(pi, chIndex, sInP, midi, gate, vel) {
      var remaining = gate;
      var g = Math.max(1, Math.min(STEP_COUNT - sInP, remaining));
      writeChannel(patterns[pi].channels[chIndex], sInP, midi, g, vel);
      remaining -= g;
      var np = pi + 1;
      while (remaining > 0 && np < patterns.length) {
        var g2 = Math.min(remaining, STEP_COUNT);
        writeChannel(patterns[np].channels[chIndex], 0, midi, g2, vel);
        remaining -= g2;
        np++;
      }
    }

    if (chBySource) {
      // 直接映射：每个来源（轨道/通道）的整轨音符落到对应 NES 声道，单音来源无需再切分
      for (var q3 = 0; q3 < sourceList.length; q3++) {
        var sNotes = sourceList[q3].notes;
        var chIndex = chBySource[sourceList[q3].key];
        for (var r = 0; r < sNotes.length; r++) {
          var sn = sNotes[r];
          var pi2 = Math.floor(sn.step / STEP_COUNT);
          var sInP2 = sn.step % STEP_COUNT;
          if (pi2 < patternCount) putNote(pi2, chIndex, sInP2, sn.midi, sn.gate, sn.vel);
        }
      }
    } else {
      // 单来源：按音高做声部分离 + 声部保持（扩展至 6 旋律声道）
      var byStep = {};
      for (var j = 0; j < melody.length; j++) {
        var s = melody[j].step;
        (byStep[s] || (byStep[s] = [])).push(melody[j]);
      }

      // 六个旋律声部，按音高从低到高排列
      // ch 2=TRI(低音), ch 6=SAW, ch 5=P4, ch 4=P3, ch 1=P2, ch 0=P1(主旋律)
      var VOICE_CHANS = [2, 6, 5, 4, 1, 0];
      var VOICE_DEF = { 0: 72, 1: 67, 2: 48, 4: 64, 5: 60, 6: 55 };
      var lastPitch = {};
      for (var vi = 0; vi < VOICE_CHANS.length; vi++) lastPitch[VOICE_CHANS[vi]] = null;

      function closestVoice(midi) {
        var best = VOICE_CHANS[0], bestDist = Infinity;
        for (var v = 0; v < VOICE_CHANS.length; v++) {
          var vc = VOICE_CHANS[v];
          var p = lastPitch[vc] == null ? VOICE_DEF[vc] : lastPitch[vc];
          var d = Math.abs(midi - p);
          if (d < bestDist) { bestDist = d; best = vc; }
        }
        return best;
      }

      // 和弦声部分配表（按音符数选择，和弦已升序）
      // 索引 = 和弦内位置（0=最低音），值 = NES 声道索引
      var CHORD_VOICES = {
        2: [2, 0],
        3: [2, 1, 0],
        4: [2, 6, 1, 0],
        5: [2, 6, 5, 1, 0],
        6: [2, 6, 5, 4, 1, 0]
      };

      var stepList = Object.keys(byStep).map(function (k) { return parseInt(k, 10); });
      stepList.sort(function (a, b) { return a - b; });
      for (var si2 = 0; si2 < stepList.length; si2++) {
        var step = stepList[si2];
        var chord = byStep[step];
        chord.sort(function (a, b) { return a.midi - b.midi; });
        var pi = Math.floor(step / STEP_COUNT);
        var sInP = step % STEP_COUNT;
        if (pi >= patternCount) continue;
        var chans = patterns[pi].channels;
        var n = chord.length;

        if (n === 1) {
          // 单音：按音高连续性路由到最近声部
          var v = closestVoice(chord[0].midi);
          putNote(pi, v, sInP, chord[0].midi, chord[0].gate, chord[0].vel);
          lastPitch[v] = chord[0].midi;
        } else if (n <= 6) {
          // 2-6 音和弦：按 CHORD_VOICES 表分配
          var voices = CHORD_VOICES[n];
          for (var ci = 0; ci < n; ci++) {
            putNote(pi, voices[ci], sInP, chord[ci].midi, chord[ci].gate, chord[ci].vel);
            lastPitch[voices[ci]] = chord[ci].midi;
          }
        } else {
          // 7+ 音和弦：前 6 音分配到声道，剩余转为琶音
          var voices6 = CHORD_VOICES[6];
          for (var ci2 = 0; ci2 < 6; ci2++) {
            putNote(pi, voices6[ci2], sInP, chord[ci2].midi, chord[ci2].gate, chord[ci2].vel);
            lastPitch[voices6[ci2]] = chord[ci2].midi;
          }
          // 第 7+ 音转为 P2 琶音
          var base = chord[5];
          var o1 = chord[6].midi - base.midi;
          var o2 = n >= 8 ? (chord[7].midi - base.midi) : 12;
          if (chans[1].arp) chans[1].arp[sInP] = [o1, o2];
        }
      }
    }

    for (var d = 0; d < drums.length; d++) {
      var dr = drums[d];
      var pi = Math.floor(dr.step / STEP_COUNT);
      var si = dr.step % STEP_COUNT;
      if (pi >= patternCount) continue;
      var dmcIdx = gmDrumToDmc(dr.midi);
      if (dmcIdx != null) {
        // 分工：底鼓/低桶鼓走 DMC 采样声道
        var dch = patterns[pi].channels[7];
        if (dch.notes[si] == null) {
          dch.notes[si] = dmcIdx;
          dch.gates[si] = 1;
          dch.vols[si] = velToVol(dr.vel != null ? dr.vel : 100);
        }
      } else {
        // 军鼓/高帽/镲等仍走噪声声道
        var nch = patterns[pi].channels[3];
        if (nch.notes[si] == null) {
          nch.notes[si] = gmDrumToNoise(dr.midi);
          nch.gates[si] = 1;
          nch.vols[si] = velToVol(dr.vel != null ? dr.vel : 100);
        }
      }
    }

    // 音域自适应转调：每个旋律声部按中位音高八度拟合到合适音区，减少 clamp 错八度
    var VOICE_TARGET = { 0: 72, 1: 67, 2: 48, 4: 64, 5: 60, 6: 55 }; // P1/P2/TRI/P3/P4/SAW
    for (var mci = 0; mci < MELODIC_CHANNELS.length; mci++) {
      var vc = MELODIC_CHANNELS[mci];
      var pitches = [];
      for (var pp = 0; pp < patterns.length; pp++) {
        var arr = patterns[pp].channels[vc].notes;
        for (var ii = 0; ii < arr.length; ii++) {
          if (arr[ii] != null) pitches.push(arr[ii]);
        }
      }
      if (pitches.length === 0) continue;
      pitches.sort(function (a, b) { return a - b; });
      var median = pitches[Math.floor(pitches.length / 2)];
      var shift = Math.round((VOICE_TARGET[vc] - median) / 12) * 12;
      for (var pp2 = 0; pp2 < patterns.length; pp2++) {
        var arr2 = patterns[pp2].channels[vc].notes;
        for (var ii2 = 0; ii2 < arr2.length; ii2++) {
          if (arr2[ii2] != null) {
            arr2[ii2] = Math.max(MIDI_MIN, Math.min(MIDI_MAX, arr2[ii2] + shift));
          }
        }
      }
    }

    var s = createEmptySong();
    s.bpm = bpm;
    s.patterns = patterns;
    s.order = [];
    for (var o = 0; o < patternCount; o++) s.order.push(o);
    s.loopStart = 0;
    s.loopEnd = patternCount;
    return s;
  }

  function importMidiFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var midiData = parseMidiBytes(new Uint8Array(e.target.result));
        if (!midiData.notes || midiData.notes.length === 0) { showToast(t('toast.importNone')); return; }
        if (isPlaying) stopPlayback();
        song = convertMidiToSong(midiData);
        currentPatternIndex = 0;
        currentOrderIndex = 0;
        renderAll();
        showToast(t('toast.imported', { n: midiData.notes.length }));
      } catch (err) {
        showToast(t('toast.importFail', { msg: (err && err.message ? err.message : t('err.invalidFile')) }));
      }
    };
    reader.onerror = function () { showToast(t('toast.importFileFail')); };
    reader.readAsArrayBuffer(file);
  }

  // ========== MIDI 导出 ==========
  function midiVlq(n) {
    var bytes = [];
    var buffer = n & 0x7F;
    while ((n >>>= 7) > 0) {
      buffer = (buffer << 8) | (((n & 0x7F) | 0x80));
    }
    while (true) {
      bytes.push(buffer & 0xFF);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function midiStrBytes(s) {
    var b = [];
    for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 0xFF);
    return b;
  }

  function midiMeta(type, bytes) {
    return [0xFF, type, bytes.length].concat(bytes);
  }

  function noiseToGmDrum(period) {
    if (period <= 1) return 49;  // 镲 → crash
    if (period <= 3) return 42;  // 高帽 → closed hat
    if (period <= 5) return 38;  // 军鼓 → snare
    if (period <= 7) return 47;  // 中鼓 → mid tom
    if (period <= 9) return 41;  // 低鼓 → floor tom
    return 36;                   // 底鼓/深底鼓/重低音 → kick
  }

  function dmcToGmDrum(sample) {
    if (sample === 0) return 36; // kick 底鼓
    if (sample === 1) return 38; // snare 军鼓
    if (sample === 2) return 35; // bass 贝斯 → acoustic kick
    return 42;                   // hat 镲片 → closed hat
  }

  function buildMidiTrack(events) {
    var body = [];
    for (var i = 0; i < events.length; i++) {
      body = body.concat(midiVlq(events[i].dt)).concat(events[i].data);
    }
    body = body.concat(midiVlq(0)).concat([0xFF, 0x2F, 0x00]);
    var len = body.length;
    return [0x4D, 0x54, 0x72, 0x6B, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF].concat(body);
  }

  function exportSongAsMidiBytes() {
    var ppq = 480;
    var tps = ppq / 4; // 每步（16 分音符）= 120 tick

    var tempoUs = Math.round(60000000 / song.bpm);
    var conductor = [
      { dt: 0, data: midiMeta(0x51, [(tempoUs >> 16) & 0xFF, (tempoUs >> 8) & 0xFF, tempoUs & 0xFF]) },
      { dt: 0, data: midiMeta(0x58, [4, 2, 24, 8]) } // 4/4
    ];

    // 8 声道 → MIDI 通道映射
    // ch 0=P1→MIDI ch0, ch 1=P2→MIDI ch1, ch 2=TRI→MIDI ch2, ch 3=NSE→MIDI ch9,
    // ch 4=P3→MIDI ch3, ch 5=P4→MIDI ch4, ch 6=SAW→MIDI ch5, ch 7=DMC→MIDI ch9（打击乐）
    var meta = [
      { ch: 0, name: 'P1 Square', program: 80 },
      { ch: 1, name: 'P2 Square', program: 80 },
      { ch: 2, name: 'TRI Bass', program: 33 },
      { ch: 9, name: 'NSE Drums', program: 0 },
      { ch: 3, name: 'P3 Square', program: 80 },
      { ch: 4, name: 'P4 Square', program: 80 },
      { ch: 5, name: 'SAW Lead', program: 81 },
      { ch: 9, name: 'DMC Drums', program: 0 }
    ];

    var tracks = [];
    for (var c = 0; c < CHANNEL_TYPES.length; c++) {
      var events = [];
      events.push({ dt: 0, data: midiMeta(0x03, midiStrBytes(meta[c].name)) });
      if (c !== 3 && c !== 7) {
        events.push({ dt: 0, data: [0xC0 | meta[c].ch, meta[c].program] });
      }

      var noteEvents = [];
      for (var o = 0; o < song.order.length; o++) {
        var patIdx = song.order[o];
        var pattern = song.patterns[patIdx];
        if (!pattern || !pattern.channels[c]) continue;
        var ch = pattern.channels[c];
        for (var s = 0; s < STEP_COUNT; s++) {
          var val = ch.notes[s];
          if (val === null || val === undefined) continue;
          var gate = (ch.gates && ch.gates[s]) || 1;
          var baseTick = (o * STEP_COUNT + s) * tps;
          var channel = meta[c].ch;
          var midiNote = (c === 3) ? noiseToGmDrum(val) : (c === 7 ? dmcToGmDrum(val) : val);
          var vel = 100;
          if (ch.vols && ch.vols[s] !== null && ch.vols[s] !== undefined) {
            vel = Math.max(1, Math.round(ch.vols[s] / 15 * 127));
          }
          var arpArr = (c !== 3 && c !== 7 && ch.arp && Array.isArray(ch.arp[s])) ? ch.arp[s] : null;

          if (arpArr) {
            // 琶音展开为 3 个子音
            var totalDur = gate * tps;
            var subDur = Math.max(1, Math.floor(totalDur / 3));
            var pitches = [midiNote, midiNote + arpArr[0], midiNote + arpArr[1]];
            for (var k = 0; k < 3; k++) {
              var p = Math.max(0, Math.min(127, pitches[k]));
              var onTick = baseTick + k * subDur;
              noteEvents.push({ tick: onTick, on: true, midi: p, vel: vel, channel: channel });
              noteEvents.push({ tick: onTick + subDur, on: false, midi: p, channel: channel });
            }
          } else {
            var p2 = Math.max(0, Math.min(127, midiNote));
            noteEvents.push({ tick: baseTick, on: true, midi: p2, vel: vel, channel: channel });
            noteEvents.push({ tick: baseTick + gate * tps, on: false, midi: p2, channel: channel });
          }
        }
      }

      noteEvents.sort(function (a, b) {
        if (a.tick !== b.tick) return a.tick - b.tick;
        if (a.on !== b.on) return a.on ? 1 : -1; // 同 tick 先关后开
        return 0;
      });

      var lastTick = 0;
      for (var e = 0; e < noteEvents.length; e++) {
        var ne = noteEvents[e];
        var dt = ne.tick - lastTick;
        lastTick = ne.tick;
        var status = ne.on ? 0x90 : 0x80;
        events.push({ dt: dt, data: [status | ne.channel, ne.midi & 0x7F, ne.on ? ne.vel : 0] });
      }

      tracks.push(buildMidiTrack(events));
    }

    tracks.unshift(buildMidiTrack(conductor));

    var out = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 0xFF, tracks.length & 0xFF, (ppq >> 8) & 0xFF, ppq & 0xFF];
    for (var t = 0; t < tracks.length; t++) out = out.concat(tracks[t]);
    return new Uint8Array(out);
  }

  function downloadSongAsMidi() {
    if (!songHasNotes()) { showToast(t('toast.exportReady')); return; }
    var bytes = exportSongAsMidiBytes();
    var blob = new Blob([bytes], { type: 'audio/midi' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'neon8bit.mid';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    showToast(t('toast.exported'));
  }

  // ========== 预设数据 ==========
  function buildPresets() {
    function p(name, pulse1, pulse2, tri, nse, duty1, duty2, nseMode, nsePeriod) {
      var pat = createEmptyPattern(name);
      pat.channels[0].notes = notesFromPairs(pulse1);
      pat.channels[1].notes = notesFromPairs(pulse2);
      pat.channels[2].notes = notesFromPairs(tri);
      pat.channels[3].notes = notesFromPairs(nse);
      pat.channels[0].duty = duty1 != null ? duty1 : 1;
      pat.channels[1].duty = duty2 != null ? duty2 : 2;
      pat.channels[3].mode = nseMode != null ? nseMode : 0;
      pat.channels[3].period = nsePeriod != null ? nsePeriod : 8;
      return pat;
    }

    // —— 预设 1：星尘脉冲（原创琶音，C 大调）——
    var s1 = createEmptySong();
    s1.bpm = 140;
    s1.patterns = [];
    s1.patterns.push(p(t('section.intro'),
      [[0, 60], [2, 64], [4, 67], [6, 72], [8, 71], [10, 67], [12, 64], [14, 60], [16, 64], [18, 67], [20, 72], [22, 76], [24, 74], [26, 72], [28, 71], [30, 67]],
      [[0, 52], [2, 55], [4, 60], [6, 64], [8, 59], [10, 55], [12, 52], [14, 48], [16, 55], [18, 60], [20, 64], [22, 67], [24, 65], [26, 64], [28, 59], [30, 55]],
      [[0, 48], [8, 43], [16, 48], [24, 43]],
      [[0, 8], [4, 8], [8, 8], [12, 8], [16, 8], [20, 8], [24, 8], [28, 8]],
      1, 2, 0, 8));
    s1.patterns.push(p(t('section.verse'),
      [[0, 72], [2, null], [4, 74], [6, null], [8, 76], [10, 79], [12, null], [14, 76], [16, 74], [18, null], [20, 72], [22, null], [24, 74], [26, 76], [28, null], [30, null]],
      [[0, 64], [4, 65], [8, 67], [12, 64], [16, 65], [20, 67], [24, 69], [28, 67]],
      [[0, 48], [8, 48], [16, 50], [24, 52]],
      [[0, 8], [4, 4], [8, 8], [12, 4], [16, 8], [20, 4], [24, 8], [28, 4]],
      1, 2, 0, 8));
    s1.patterns.push(p(t('section.chorus'),
      [[0, 84], [2, 83], [4, 84], [6, 79], [8, 76], [10, 79], [12, 84], [14, 88], [16, 86], [18, 84], [20, 83], [22, 79], [24, 76], [26, 79], [28, 84], [30, null]],
      [[0, 60], [2, 59], [4, 60], [6, 55], [8, 52], [10, 55], [12, 60], [14, 64], [16, 62], [18, 60], [20, 59], [22, 55], [24, 52], [26, 55], [28, 60], [30, 55]],
      [[0, 48], [4, 48], [8, 45], [12, 45], [16, 41], [20, 41], [24, 45], [28, 43]],
      [[0, 8], [4, 8], [8, 8], [12, 8], [16, 8], [20, 8], [24, 8], [28, 8]],
      1, 2, 0, 8));
    s1.order = [0, 1, 2, 1];
    s1.loopStart = 1;
    s1.loopEnd = 4;

    // —— 预设 2：胜利凯旋（明快上扬，C 大调）——
    var s2 = createEmptySong();
    s2.bpm = 132;
    s2.patterns = [];
    s2.patterns.push(p(t('section.intro'),
      [[0, 72], [4, 76], [8, 79], [12, 84], [16, 79], [20, 84], [24, 88], [28, 91]],
      [[0, 64], [4, 67], [8, 72], [12, 76], [16, 67], [20, 72], [24, 76], [28, 79]],
      [[0, 48], [8, 55], [16, 48], [24, 55]],
      [[0, 8], [8, 8], [16, 8], [24, 8]],
      1, 2, 0, 8));
    s2.patterns.push(p(t('section.verse'),
      [[0, 72], [2, 74], [4, 76], [6, 79], [8, 81], [10, 79], [12, 76], [14, 74], [16, 72], [18, 74], [20, 76], [22, 77], [24, 79], [26, 77], [28, 76], [30, 74]],
      [[0, 60], [4, 55], [8, 57], [12, 55], [16, 60], [20, 55], [24, 53], [28, 55]],
      [[0, 48], [8, 55], [16, 53], [24, 55]],
      [[0, 8], [4, 8], [8, 8], [12, 8], [16, 8], [20, 8], [24, 8], [28, 8]],
      1, 2, 0, 8));
    s2.patterns.push(p(t('section.chorus'),
      [[0, 79], [2, 84], [4, 88], [6, 91], [8, 84], [10, 79], [12, 76], [14, 72], [16, 77], [18, 81], [20, 84], [22, 89], [24, 88], [26, 84], [28, 79], [30, 72]],
      [[0, 60], [4, 60], [8, 55], [12, 55], [16, 65], [20, 65], [24, 60], [28, 55]],
      [[0, 48], [4, 48], [8, 55], [12, 55], [16, 53], [20, 53], [24, 48], [28, 55]],
      [[0, 8], [4, 8], [8, 8], [12, 8], [16, 8], [20, 8], [24, 8], [28, 8]],
      1, 2, 0, 8));
    s2.order = [0, 1, 2, 1];
    s2.loopStart = 1;
    s2.loopEnd = 4;

    return { star: s1, victory: s2 };
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
