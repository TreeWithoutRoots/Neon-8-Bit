// NES 2A03 APU 合成引擎 — 经典脚本，挂 window.NesApu
// 复现 Pulse1/2/3/4（占空比+扫频+音量包络）、Triangle（32 步量化）、Noise（15-bit LFSR），
// 以及扩展 Sawtooth 锯齿波声道
// 参考：https://www.nesdev.org/wiki/APU 及各子页
(function () {
  'use strict';

  var fCPU = 1789773.0; // NTSC

  // ============ 常量 ============
  // Pulse 4 种占空比：8 步序列（0=低, 1=高）
  var PULSE_DUTY = [
    [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
    [0, 1, 1, 0, 0, 0, 0, 0], // 25%
    [0, 1, 1, 1, 1, 0, 0, 0], // 50%
    [1, 0, 0, 1, 1, 1, 1, 1]  // 75%
  ];

  // Triangle 32 步量化三角序列
  var TRIANGLE_SEQ = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
  ];

  // Noise 16 档周期（NTSC 采样率）
  var NOISE_RATES = [
    447443.2, 223721.6, 111860.8, 55930.4, 27965.2, 18643.5, 13982.6, 11186.1,
    8860.3, 7046.3, 4709.9, 3523.2, 2348.8, 1761.6, 879.9, 440.0
  ];

  var PULSE_SLOT = 64; // Pulse 每 duty slot 采样数（8*64=512 周期采样）
  var TRI_SLOT = 16;   // Triangle/Sawtooth 每 slot 采样数（32*16=512 周期采样）

  // ============ 运行时状态 ============
  var ctx = null;
  var pulseBuffers = null; // 4 个 AudioBuffer
  var triangleBuffer = null;
  var sawtoothBuffer = null;
  var noiseBuffers = null; // [mode0, mode1]
  var pulseBus = null;     // Pulse1+Pulse2+Pulse3+Pulse4+Sawtooth
  var tndBus = null;       // Triangle+Noise
  var shaper = null;       // 软削波

  // ============ 工具 ============
  function midiToFreq(midi) {
    return 440.0 * Math.pow(2, (midi - 69) / 12);
  }

  function buildBuffer(values, slot) {
    var length = values.length * slot;
    var buf = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < values.length; i++) {
      var sample = values[i];
      for (var j = 0; j < slot; j++) {
        data[i * slot + j] = sample;
      }
    }
    return buf;
  }

  function buildPulseBuffer(dutyIdx) {
    var duty = PULSE_DUTY[dutyIdx];
    // 映射：0 -> -1，1 -> +1
    var vals = [];
    for (var i = 0; i < 8; i++) vals.push(duty[i] === 1 ? 1 : -1);
    return buildBuffer(vals, PULSE_SLOT);
  }

  function buildTriangleBuffer() {
    // 32 步量化，映射到 [-1, +1]
    var vals = [];
    for (var i = 0; i < 32; i++) vals.push((TRIANGLE_SEQ[i] / 15) * 2 - 1);
    return buildBuffer(vals, TRI_SLOT);
  }

  function buildSawtoothBuffer() {
    // 扩展锯齿波：32 步线性上升，映射到 [-1, +1]
    var vals = [];
    for (var i = 0; i < 32; i++) vals.push((i / 31) * 2 - 1);
    return buildBuffer(vals, TRI_SLOT);
  }

  function buildNoiseBuffer(mode) {
    // 长模式 LFSR 周期 32767；短模式（bit6 反馈）周期 127
    var length = mode === 1 ? 127 : 32767;
    var buf = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var lfsr = 1; // 上电初始值
    for (var i = 0; i < length; i++) {
      var b0 = lfsr & 1;
      // bit0=1 时静音（输出 0），bit0=0 时输出 +1
      data[i] = b0 ? 0 : 1;
      var fb = (lfsr & 1) ^ ((mode === 1 ? (lfsr >> 6) : (lfsr >> 1)) & 1);
      lfsr = (lfsr >> 1) | (fb << 14);
    }
    return buf;
  }

  // ============ 混音总线 ============
  function buildMixer() {
    pulseBus = ctx.createGain();
    pulseBus.gain.value = 0.5;
    tndBus = ctx.createGain();
    tndBus.gain.value = 0.35;

    var master = ctx.createGain();
    master.gain.value = 1.0;

    shaper = ctx.createWaveShaper();
    // 软削波曲线（tanh 近似），模拟 NES 非线性饱和
    var curve = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var x = (i / 127.5) - 1;
      curve[i] = Math.tanh(x * 2.0) * 0.8;
    }
    shaper.curve = curve;

    pulseBus.connect(master);
    tndBus.connect(master);
    master.connect(shaper);
    shaper.connect(ctx.destination);
  }

  // ============ 初始化 ============
  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    // 预生成波形 buffer
    pulseBuffers = [];
    for (var d = 0; d < 4; d++) pulseBuffers.push(buildPulseBuffer(d));
    triangleBuffer = buildTriangleBuffer();
    sawtoothBuffer = buildSawtoothBuffer();
    noiseBuffers = [buildNoiseBuffer(0), buildNoiseBuffer(1)];

    buildMixer();
    return ctx;
  }

  // ============ 包络 ============
  // 在 GainNode 上按 NES 包络语义设置增益
  // volOverride：音量列覆盖值（0-15 或 null/undefined 用 params.vol）
  function applyEnvelope(gain, params, startTime, duration, volOverride) {
    var vol = volOverride != null ? volOverride : (params.vol != null ? params.vol : 12);
    var envMode = params.envMode || 'decay';
    var loop = (envMode === 'loop');

    if (envMode === 'const') {
      gain.gain.setValueAtTime(vol / 15, startTime);
      // 门控结束归零，避免硬切爆音
      gain.gain.setValueAtTime(0, startTime + duration);
      return;
    }

    // decay / loop：从 15 开始，每 (vol+1) 个 quarter-frame 减 1
    // 限制最大步数防止极端长音符创建过多自动化事件（最多 512 步，覆盖所有合理时长）
    var stepTime = (vol + 1) / 240.0;
    var maxSteps = Math.ceil(duration / stepTime) + 2;
    if (maxSteps > 512) maxSteps = 512;
    var level = 15;
    var t = startTime;
    var end = startTime + duration;
    var steps = 0;

    while (t < end && level >= 0 && steps < maxSteps) {
      gain.gain.setValueAtTime(level / 15, t);
      level -= 1;
      t += stepTime;
      steps += 1;
      if (level < 0 && loop) {
        level = 15; // loop 回到 15
      }
    }
    // 步数超限或正常结束，确保结尾处有值
    if (t < end) {
      gain.gain.setValueAtTime(Math.max(0, level) / 15, t);
    }
    // 门控结束归零，避免爆音
    gain.gain.setValueAtTime(0, end);
  }

  // ============ 扫频（仅 Pulse）============
  function applySweep(src, type, params, initialPeriod, startTime, duration) {
    if (!params.sweepOn || !params.sweepShift) return;
    var shift = params.sweepShift;
    var negate = !!params.sweepNegate;
    // sweepPeriod 缺失时按 0 处理，避免 halfFrame 变成 NaN 导致死循环
    var sweepPeriod = params.sweepPeriod != null ? params.sweepPeriod : 0;
    var halfFrame = (sweepPeriod + 1) / 120.0; // 秒
    var end = startTime + duration;
    var period = initialPeriod;
    var k = 1;
    while (true) {
      var t = startTime + k * halfFrame;
      if (t >= end) break;
      var delta = period >> shift;
      if (negate) {
        // 向上扫（音高升高）：period 减小；Pulse1 额外减 1（反码）
        period = period - delta - (type === 'pulse1' ? 1 : 0);
      } else {
        // 向下扫（音高降低）：period 增大
        period = period + delta;
      }
      if (period < 8 || period > 0x7FF) {
        // 溢出静音
        src.playbackRate.setValueAtTime(0, t);
        return;
      }
      var freq = fCPU / (16 * (period + 1));
      src.playbackRate.setValueAtTime(freq * 512 / ctx.sampleRate, t);
      k++;
    }
  }

  // ============ 颤音 ============
  // 在音符持续期间，让音高按正弦波周期性上下波动
  function applyVibrato(src, baseRate, depthSemis, startTime, duration) {
    if (!depthSemis || depthSemis <= 0) return;
    var vibFreq = 6.0;   // 颤音速率 Hz
    var step = 1 / 40;   // 每 25ms 设一个点，足够平滑
    // 第一个点用 setValueAtTime 锚定起始值
    src.playbackRate.setValueAtTime(baseRate, startTime);
    for (var t = step; t <= duration + step * 0.5; t += step) {
      var offset = depthSemis * Math.sin(2 * Math.PI * vibFreq * t);
      var rate = baseRate * Math.pow(2, offset / 12);
      var ct = Math.min(startTime + t, startTime + duration);
      src.playbackRate.linearRampToValueAtTime(rate, ct);
    }
  }

  // ============ 滑音（Portamento）============
  // 从起始音高平滑过渡到目标音高
  // glideFromMidi: 起始 MIDI 音高；glideTime: 滑音持续时间（秒）
  function applyGlide(src, glideFromMidi, targetMidi, glideTime, startTime) {
    if (glideFromMidi == null || !glideTime || glideTime <= 0) return;
    if (glideFromMidi === targetMidi) return;

    // pulse / triangle 的波形 buffer 均为 512 周期采样，rate 换算一致
    var startRate = midiToFreq(glideFromMidi) * 512 / ctx.sampleRate;
    var targetRate = midiToFreq(targetMidi) * 512 / ctx.sampleRate;

    // 设置起始速率，然后线性过渡到目标速率
    src.playbackRate.setValueAtTime(startRate, startTime);
    src.playbackRate.linearRampToValueAtTime(targetRate, startTime + glideTime);
  }

  // ============ 音符触发 ============
  // type: 'pulse1' | 'pulse2' | 'pulse3' | 'pulse4' | 'triangle' | 'noise' | 'sawtooth'
  // params: 声道参数对象
  // pitchValue: 旋律=MIDI 音高；noise=周期索引 0-15
  // volOverride: 音量列覆盖值（可选，0-15），用于 pulse/noise；triangle 无音量控制，忽略
  // vibratoDepth: 颤音深度（半音，0 为无）
  // glideFromMidi: 滑音起始 MIDI 音高（null/undefined 为无滑音）
  // glideTime: 滑音持续时间（秒，0 为无滑音）
  function note(type, params, pitchValue, startTime, duration, volOverride, vibratoDepth, glideFromMidi, glideTime) {
    ensureContext();
    if (!ctx) return;

    var src = ctx.createBufferSource();
    src.loop = true;
    var gain = ctx.createGain();
    var initialPeriod = 0;
    var freq = 0;
    var baseRate = 0;
    var hasGlide = glideFromMidi != null && glideTime > 0 && glideFromMidi !== pitchValue;

    if (type === 'noise') {
      var idx = Math.max(0, Math.min(15, pitchValue));
      var mode = params.mode === 1 ? 1 : 0;
      src.buffer = noiseBuffers[mode];
      // 时钟速率 = NOISE_RATES[idx]，buffer 每采样 1 bit
      var rate = NOISE_RATES[idx] / ctx.sampleRate;
      src.playbackRate.value = rate;
      applyEnvelope(gain, params, startTime, duration, volOverride);
    } else if (type === 'triangle') {
      src.buffer = triangleBuffer;
      // Triangle 频率公式 f = fCPU/(32*(t+1))（Pulse 为 /16），此处按目标音高反推 timer，
      // 因此输出频率与输入 MIDI 音高一致
      var tf = midiToFreq(pitchValue);
      var tt = Math.round(fCPU / (32 * tf) - 1);
      tt = Math.max(8, Math.min(0x7FF, tt));
      freq = fCPU / (32 * (tt + 1));
      baseRate = freq * 512 / ctx.sampleRate;
      src.playbackRate.value = baseRate;
      if (hasGlide) {
        applyGlide(src, glideFromMidi, pitchValue, glideTime, startTime);
        // 颤音从滑音结束后开始，避免打断滑音的 ramp
        var vibStart = startTime + glideTime;
        var vibDur = Math.max(0, duration - glideTime);
        if (vibDur > 0) {
          applyVibrato(src, baseRate, vibratoDepth, vibStart, vibDur);
        }
      } else {
        applyVibrato(src, baseRate, vibratoDepth, startTime, duration);
      }
      // Triangle 无音量包络，仅开/关；短淡入淡出防爆音（自适应，避免短音符时间倒序）
      var tfade = Math.min(0.005, duration * 0.2);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.8, startTime + tfade);
      gain.gain.setValueAtTime(0.8, startTime + duration - tfade);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
    } else {
      // pulse1 / pulse2 / pulse3 / pulse4 / sawtooth
      var isSaw = (type === 'sawtooth');
      if (isSaw) {
        src.buffer = sawtoothBuffer;
      } else {
        var duty = Math.max(0, Math.min(3, params.duty));
        src.buffer = pulseBuffers[duty];
      }
      var pf = midiToFreq(pitchValue);
      initialPeriod = Math.round(fCPU / (16 * pf) - 1);
      initialPeriod = Math.max(8, Math.min(0x7FF, initialPeriod));
      freq = fCPU / (16 * (initialPeriod + 1));
      baseRate = freq * 512 / ctx.sampleRate;
      src.playbackRate.value = baseRate;
      if (hasGlide) {
        applyGlide(src, glideFromMidi, pitchValue, glideTime, startTime);
        // 颤音从滑音结束后开始
        var pVibStart = startTime + glideTime;
        var pVibDur = Math.max(0, duration - glideTime);
        if (pVibDur > 0) {
          applyVibrato(src, baseRate, vibratoDepth, pVibStart, pVibDur);
        }
      } else {
        applyVibrato(src, baseRate, vibratoDepth, startTime, duration);
      }
      applyEnvelope(gain, params, startTime, duration, volOverride);
      if (!isSaw) {
        applySweep(src, type, params, initialPeriod, startTime, duration);
      }
    }

    src.connect(gain);
    if (type === 'triangle' || type === 'noise') {
      gain.connect(tndBus);
    } else {
      gain.connect(pulseBus);
    }
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }

  // ============ 导出 ============
  window.NesApu = {
    ensureContext: ensureContext,
    note: note,
    now: function () {
      if (!ctx) { ensureContext(); }
      return ctx ? ctx.currentTime : 0;
    },
    get sampleRate() { return ctx ? ctx.sampleRate : 44100; }
  };
})();
