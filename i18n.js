// i18n — 中英文切换（纯原生，无依赖）
// 挂 window.I18N，供 index.html / app.js 使用
(function () {
  'use strict';

  var LANG_KEY = 'neon8bit_lang';

  var zh = {
    title: 'NEON 8-BIT · NES 合成器',
    'hero.title': '点格子，写芯片音乐！',
    'hero.desc': '扩展 NES 八声道：<strong>P1/P2/P3/P4 方波</strong>（占空比+扫频）· <strong>TRI 三角波</strong>低音 · <strong>NSE 噪声</strong>鼓点 · <strong>SAW 锯齿波</strong>主旋律 · <strong>DMC 采样</strong>鼓组<br />多段编排，奏响你的 8-bit 游戏旋律～',

    'panel.control': '▶ 控制面板',
    'loop.single': '↺ 单段循环',
    'loop.hint': '只播当前选中段',
    'save.placeholder': '输入名称',
    'save.confirm': '确认',
    'save.defaultName': '我的歌曲',

    'random.label': '随机风格',
    'random.auto': '✨ 随机',
    'random.classic': '经典流行',
    'random.debussy': '德彪西',
    'random.mj': '迈克尔杰克逊',

    'panel.sequencer': '♪ 音序器',
    'seq.count': '8 声道 × 32',
    'seq.addPattern': '＋ 段落',
    'seq.dup': '⧉ 复制',
    'seq.del': '✕ 删除',
    'seq.rename': '✎ 重命名',
    'legend.p1': 'P1 方波',
    'legend.p2': 'P2 方波',
    'legend.tri': 'TRI 三角',
    'legend.nse': 'NSE 噪声',
    'legend.p3': 'P3 方波',
    'legend.p4': 'P4 方波',
    'legend.saw': 'SAW 锯齿',
    'legend.dmc': 'DMC 采样',

    'panel.params': '⚙ 声道参数',
    'param.square1': '方波声道 <span class="param-channel ch-0">P1</span>',
    'param.square2': '方波声道 <span class="param-channel ch-1">P2</span>',
    'param.triangle': '三角波声道 <span class="param-channel ch-2">TRI</span>',
    'param.noise': '噪声声道 <span class="param-channel ch-3">NSE</span>',
    'param.square3': '方波声道 <span class="param-channel ch-4">P3</span>',
    'param.square4': '方波声道 <span class="param-channel ch-5">P4</span>',
    'param.sawtooth': '锯齿波声道 <span class="param-channel ch-6">SAW</span>',
    'param.dmc': '采样声道 <span class="param-channel ch-7">DMC</span>',
    'param.duty': '占空比',
    'param.volume': '音量',
    'param.envelope': '包络',
    'param.env.const': '恒定',
    'param.env.decay': '衰减',
    'param.env.loop': '循环',
    'param.sweep': '频率扫频',
    'param.sweepPeriod': '扫频周期',
    'param.sweepDir': '扫频方向',
    'param.sweep.down': '降',
    'param.sweep.up': '升',
    'param.sweepShift': '扫频移位',
    'param.glide': '滑音时间',
    'param.glideNote': '滑音：从前一个音符平滑过渡到当前音符，时间越长过渡越慢。',
    'param.triNote': '三角波无音量控制，仅开关。音色柔和，适合低音线。滑音：从前一个音符平滑过渡到当前音符。',
    'param.sawNote': '锯齿波拥有丰富的谐波，音色厚实，适合主旋律。滑音：从前一个音符平滑过渡到当前音符。',
    'param.mode': '模式',
    'param.noise.long': '长噪声',
    'param.noise.short': '短噪声',
    'param.drum': '鼓类型',
    'param.dmcSample': '采样',
    'param.dmcRate': '速率档',
    'param.dmcNote': 'DMC 采样声道：每步触发一个采样，速率档越高音高越高、时长越短。适合鼓点与贝斯。',

    'panel.arrange': '↻ 歌曲编排',
    'arrange.subtitle': '前奏 / 主歌 / 副歌',
    'arrange.append': '＋ 追加当前段',
    'arrange.loopStart': '↺ 设为循环起',
    'arrange.loopEnd': '↻ 设为循环止',
    'arrange.note': '「循环起/止」之间的段落循环播放，之前的段落（如前奏）只播一次。',

    'panel.presets': '⌨ 预设',
    'preset.star': '星尘脉冲',
    'preset.victory': '胜利凯旋',
    'import.midi': '📂 导入 MIDI 文件',

    'panel.library': '💾 存档',
    'library.count': '{n} 首',
    'library.patterns': '{n} 段',
    'library.empty': '还没有保存的歌曲<br />编好后点「💾 保存」就能存下来',
    'library.load': '加载',
    'library.delete': '删除',
    'library.migrated': '迁移',
    'export.midi': '⬇️ 导出 MIDI',

    'share.title': '✦ 歌曲完成！ ✦',
    'share.desc': '你的 NES 芯片音乐已保存<br />截图分享给小伙伴吧～',
    'share.tip': '📸 截图分享给 <span>好友</span>',
    'share.close': '关闭',
    'share.preview': '▶ 试听',
    'share.meta': '{bpm} BPM · NES 2A03 · {n} 段',

    'section.intro': '前奏',
    'section.verse': '主歌',
    'section.chorus': '副歌',
    'pattern.new': '新段落',
    'pattern.default': '段落{n}',
    'pattern.copySuffix': '副本',

    'arp.none': '无',
    'arp.major': '大三',
    'arp.minor': '小三',
    'arp.fifth': '五度',
    'arp.octave': '八度',

    'vib.none': '无',
    'vib.light': '轻',
    'vib.medium': '中',
    'vib.heavy': '重',

    'noise.0': '高镲', 'noise.1': '高镲', 'noise.2': '高帽', 'noise.3': '高帽',
    'noise.4': '军鼓', 'noise.5': '军鼓', 'noise.6': '中鼓', 'noise.7': '中鼓',
    'noise.8': '中低鼓', 'noise.9': '低鼓', 'noise.10': '底鼓', 'noise.11': '底鼓',
    'noise.12': '深底鼓', 'noise.13': '深底鼓', 'noise.14': '重低音', 'noise.15': '重低音',

    'dmc.0': '底鼓', 'dmc.1': '军鼓', 'dmc.2': '贝斯', 'dmc.3': '镲片',

    'field.arp': '琶音',
    'field.vibrato': '颤音',
    'field.gate': '时值',
    'field.default': '默认',
    'unit.steps': '{n} 步',

    'cell.hold': '延续',
    'cell.arp': '琶音 {a}/{b}',
    'cell.drum': '鼓 {name}',
    'cell.vol': ' · 音量 {n}',
    'cell.gate': ' · 时值 {n} 步',
    'cell.vib': ' · 颤音({label})',

    'order.loopStart': '循环起',
    'order.loopEnd': '循环止',

    'toast.minPattern': '⚠️ 至少保留一个段落',
    'toast.minSlot': '⚠️ 至少保留一个编排槽位',
    'toast.loopStartSet': '↺ 循环起点已设为第 {n} 段',
    'toast.loopEndSet': '↻ 循环终点已设为第 {n} 段后',
    'toast.noNotesPattern': '⚠️ 当前段落还没有音符',
    'toast.noNotesSong': '⚠️ 先点格子写旋律呀～',
    'toast.singleLoopOn': '↺ 单段循环已开启',
    'toast.fullPlay': '▶ 整曲播放已恢复',
    'toast.presetLoaded': '🎵 已加载预设',
    'toast.random': '🎲 {name}生成！',
    'toast.cleared': '🗑️ 已清空当前段落',
    'toast.emptyToSave': '⚠️ 先编点旋律再保存呀～',
    'toast.nameRequired': '⚠️ 请输入名称',
    'toast.renamed': '✅ 已重命名「{name}」',
    'toast.saved': '✅ 已保存「{name}」',
    'toast.loaded': '📂 已加载「{name}」',
    'toast.deleted': '🗑️ 已删除「{name}」',
    'toast.exportReady': '⚠️ 先编点旋律再导出呀～',
    'toast.exported': '⬇️ 已导出 MIDI',
    'toast.importNone': '⚠️ 未解析到音符',
    'toast.imported': '🎵 已导入 {n} 个音符',
    'toast.importFail': '⚠️ 导入失败：{msg}',
    'toast.importFileFail': '⚠️ 文件读取失败',

    'err.notMidi': '不是标准 MIDI 文件',
    'err.smpte': '暂不支持 SMPTE 时间格式',
    'err.trackHeader': '轨道头错误',
    'err.invalidFile': '文件无效',

    'import.name': '导入 {c}',

    'style.debussy': '德彪西',
    'style.mj': '迈克尔杰克逊',
    'style.classic': '经典流行',

    'tab.synth': '合成器',
    'tab.help': '教程',

    'help.intro.title': '🎮 欢迎使用 NEON 8-BIT',
    'help.intro.body': '<p>NEON 8-BIT 是一台运行在浏览器里的 <strong>NES 2A03 芯片合成器</strong>，在经典四声道基础上扩展为八声道：P1/P2/P3/P4 方波、TRI 三角波、NSE 噪声、SAW 锯齿波、DMC 采样。</p><p>你只需在网格上「点格子」，就能写出 8-bit 芯片音乐，并编排成完整歌曲。</p>',
    'help.quick.title': '🚀 快速上手',
    'help.quick.body': '<ul><li><strong>点格子</strong>：在音序器网格上点击放入音符，再点同一格删除。</li><li><strong>播放</strong>：按「▶ PLAY」听当前段落或整首歌。</li><li><strong>换音高</strong>：用每个声道行顶部的音高下拉框选择要放的音符。</li><li><strong>随机</strong>：点「✦ RANDOM」一键生成完整歌曲。</li></ul>',
    'help.channels.title': '🎛 八声道',
    'help.channels.body': '<ul><li><strong>P1 方波</strong>：主旋律，支持占空比、扫频、滑音、颤音。</li><li><strong>P2 方波</strong>：和声 / 第二旋律，能力与 P1 相同。</li><li><strong>TRI 三角波</strong>：低音线，无音量控制，音色柔和。</li><li><strong>NSE 噪声</strong>：鼓点与打击乐，可选长/短噪声与鼓类型。</li><li><strong>P3/P4 方波</strong>：扩展方波声道，能力与 P1/P2 相同，可承载更多复音。</li><li><strong>SAW 锯齿波</strong>：扩展声道，拥有丰富谐波，音色厚实，适合主旋律。</li><li><strong>DMC 采样</strong>：采样声道，每步触发底鼓/军鼓/贝斯/镲片，速率档可调音高。</li></ul>',
    'help.notes.title': '✏️ 写音符',
    'help.notes.body': '<p>每个声道是一行 <strong>32 步</strong>网格。放入音符后可继续调整：</p><ul><li><strong>时值</strong>：下拉选择持续步数（1/2/4/8/16/32），延续步显示为横线。</li><li><strong>音量</strong>：方波与噪声可选每步音量，网格透明度表示力度。</li><li><strong>琶音</strong>：旋律声道可选琶音，一个音符快速循环三个音。</li><li><strong>颤音</strong>：给长音加入音高波动，紫色发光边框表示。</li><li><strong>滑音</strong>：在参数面板调节，让音符平滑滑到下一个音。</li></ul>',
    'help.params.title': '⚙️ 声道参数',
    'help.params.body': '<ul><li><strong>占空比</strong>：方波波形宽窄（12.5% / 25% / 50% / 75%）。</li><li><strong>音量</strong>：0-15，声道整体响度。</li><li><strong>包络</strong>：恒定 / 衰减 / 循环。</li><li><strong>扫频</strong>：方波专属，音高随时间升降。</li><li><strong>滑音时间</strong>：音符间平滑过渡时长。</li><li><strong>噪声模式</strong>：长噪声（低沉）或短噪声（明亮）。</li><li><strong>鼓类型</strong>：从高镲到底鼓共 16 档。</li></ul>',
    'help.arrange.title': '↻ 段落与编排',
    'help.arrange.body': '<p>歌曲由多个 <strong>段落（Pattern）</strong>组成，再按顺序编排播放。</p><ul><li><strong>段落</strong>：点「＋ 段落」新建，可复制 / 删除 / 重命名。</li><li><strong>编排条</strong>：点「＋ 追加当前段」加入歌曲尾部，用箭头调整顺序。</li><li><strong>循环</strong>：用「设为循环起/止」圈出循环区间，之前的前奏只播一次。</li></ul>',
    'help.play.title': '▶ 播放与循环',
    'help.play.body': '<ul><li><strong>BPM</strong>：拖动滑杆在 60-180 之间调速。</li><li><strong>单段循环</strong>：勾选后只循环当前选中段落。</li><li><strong>跟随播放</strong>：播放时网格自动切换段落并高亮当前步。</li></ul>',
    'help.library.title': '💾 保存与存档',
    'help.library.body': '<p>歌曲保存在浏览器 <strong>本地存储（localStorage）</strong>，不会上传到任何服务器。</p><ul><li><strong>保存</strong>：按「💾 SAVE」输入名称后确认。</li><li><strong>加载 / 删除</strong>：在存档列表中管理歌曲。</li><li><strong>分享</strong>：保存后弹出分享卡片，可截图分享。</li></ul>',
    'help.presets.title': '⌨ 预设与随机',
    'help.presets.body': '<ul><li><strong>预设</strong>：「星尘脉冲」「胜利凯旋」两套现成歌曲，一键加载。</li><li><strong>随机</strong>：「✦ RANDOM」按所选风格（经典流行 / 德彪西 / 迈克尔杰克逊）自动生成前奏+主歌+副歌。</li></ul>',
    'help.midi.title': '📂 MIDI 导入 / 导出',
    'help.midi.body': '<ul><li><strong>导入</strong>：点「📂 导入 MIDI 文件」选择 .mid，自动映射到八声道。</li><li><strong>导出</strong>：点「⬇️ 导出 MIDI」把当前歌曲下载为 .mid，可在 DAW 中打开。</li></ul>',
    'help.footer': '祝你玩得开心，写出属于你的 8-bit 旋律 ♥'
  };

  var en = {
    title: 'NEON 8-BIT · NES Synth',
    'hero.title': 'Tap the grid, write chiptune!',
    'hero.desc': 'Expanded NES eight-channel: <strong>P1/P2/P3/P4 Square</strong> (duty + sweep) · <strong>TRI Triangle</strong> bass · <strong>NSE Noise</strong> drums · <strong>SAW Sawtooth</strong> lead · <strong>DMC Sample</strong> kit<br />Arrange sections and play your 8-bit game melody!',

    'panel.control': '▶ CONTROL PANEL',
    'loop.single': '↺ SINGLE LOOP',
    'loop.hint': 'Loop current pattern only',
    'save.placeholder': 'Enter name',
    'save.confirm': 'OK',
    'save.defaultName': 'My Song',

    'random.label': 'Random style',
    'random.auto': '✨ Random',
    'random.classic': 'Classic Pop',
    'random.debussy': 'Debussy',
    'random.mj': 'Michael Jackson',

    'panel.sequencer': '♪ SEQUENCER',
    'seq.count': '8 channels × 32',
    'seq.addPattern': '＋ Pattern',
    'seq.dup': '⧉ Duplicate',
    'seq.del': '✕ Delete',
    'seq.rename': '✎ Rename',
    'legend.p1': 'P1 Square',
    'legend.p2': 'P2 Square',
    'legend.tri': 'TRI Triangle',
    'legend.nse': 'NSE Noise',
    'legend.p3': 'P3 Square',
    'legend.p4': 'P4 Square',
    'legend.saw': 'SAW Sawtooth',
    'legend.dmc': 'DMC Sample',

    'panel.params': '⚙ CHANNEL PARAMS',
    'param.square1': 'Square <span class="param-channel ch-0">P1</span>',
    'param.square2': 'Square <span class="param-channel ch-1">P2</span>',
    'param.triangle': 'Triangle <span class="param-channel ch-2">TRI</span>',
    'param.noise': 'Noise <span class="param-channel ch-3">NSE</span>',
    'param.square3': 'Square <span class="param-channel ch-4">P3</span>',
    'param.square4': 'Square <span class="param-channel ch-5">P4</span>',
    'param.sawtooth': 'Sawtooth <span class="param-channel ch-6">SAW</span>',
    'param.dmc': 'Sample <span class="param-channel ch-7">DMC</span>',
    'param.duty': 'Duty',
    'param.volume': 'Volume',
    'param.envelope': 'Envelope',
    'param.env.const': 'Const',
    'param.env.decay': 'Decay',
    'param.env.loop': 'Loop',
    'param.sweep': 'Freq sweep',
    'param.sweepPeriod': 'Sweep period',
    'param.sweepDir': 'Sweep dir',
    'param.sweep.down': 'Down',
    'param.sweep.up': 'Up',
    'param.sweepShift': 'Sweep shift',
    'param.glide': 'Glide time',
    'param.glideNote': 'Glide: slides smoothly from the previous note to the current one; longer = slower.',
    'param.triNote': 'Triangle has no volume control, only on/off. Its soft tone suits bass lines. Glide: slides from previous to current note.',
    'param.sawNote': 'Sawtooth has rich harmonics with a thick tone, great for lead melodies. Glide: slides from previous to current note.',
    'param.mode': 'Mode',
    'param.noise.long': 'Long',
    'param.noise.short': 'Short',
    'param.drum': 'Drum type',
    'param.dmcSample': 'Sample',
    'param.dmcRate': 'Rate',
    'param.dmcNote': 'DMC sample channel: each step triggers a sample; higher rate = higher pitch and shorter duration. Great for drums and bass.',

    'panel.arrange': '↻ SONG ARRANGE',
    'arrange.subtitle': 'Intro / Verse / Chorus',
    'arrange.append': '＋ Append current',
    'arrange.loopStart': '↺ Loop start',
    'arrange.loopEnd': '↻ Loop end',
    'arrange.note': 'Sections between loop start/end repeat; earlier sections (like the intro) play once.',

    'panel.presets': '⌨ PRESETS',
    'preset.star': 'Star Pulse',
    'preset.victory': 'Victory Fanfare',
    'import.midi': '📂 Import MIDI',

    'panel.library': '💾 LIBRARY',
    'library.count': '{n} songs',
    'library.patterns': '{n} sections',
    'library.empty': 'No saved songs yet<br />Compose then tap 💾 SAVE to store',
    'library.load': 'Load',
    'library.delete': 'Delete',
    'library.migrated': 'Migrated',
    'export.midi': '⬇️ Export MIDI',

    'share.title': '✦ Song complete! ✦',
    'share.desc': 'Your NES chiptune is saved<br />Share a screenshot with friends!',
    'share.tip': '📸 Screenshot & share with <span>friends</span>',
    'share.close': 'Close',
    'share.preview': '▶ Preview',
    'share.meta': '{bpm} BPM · NES 2A03 · {n} sections',

    'section.intro': 'Intro',
    'section.verse': 'Verse',
    'section.chorus': 'Chorus',
    'pattern.new': 'New pattern',
    'pattern.default': 'Pattern {n}',
    'pattern.copySuffix': ' copy',

    'arp.none': 'None',
    'arp.major': 'Major',
    'arp.minor': 'Minor',
    'arp.fifth': 'Fifth',
    'arp.octave': 'Octave',

    'vib.none': 'None',
    'vib.light': 'Light',
    'vib.medium': 'Medium',
    'vib.heavy': 'Heavy',

    'noise.0': 'Crash', 'noise.1': 'Crash', 'noise.2': 'Hi-hat', 'noise.3': 'Hi-hat',
    'noise.4': 'Snare', 'noise.5': 'Snare', 'noise.6': 'Mid tom', 'noise.7': 'Mid tom',
    'noise.8': 'Low-mid tom', 'noise.9': 'Low tom', 'noise.10': 'Kick', 'noise.11': 'Kick',
    'noise.12': 'Deep kick', 'noise.13': 'Deep kick', 'noise.14': 'Sub bass', 'noise.15': 'Sub bass',

    'dmc.0': 'Kick', 'dmc.1': 'Snare', 'dmc.2': 'Bass', 'dmc.3': 'Hat',

    'field.arp': 'Arp',
    'field.vibrato': 'Vib',
    'field.gate': 'Gate',
    'field.default': 'Default',
    'unit.steps': '{n} steps',

    'cell.hold': 'Hold',
    'cell.arp': 'Arp {a}/{b}',
    'cell.drum': 'Drum {name}',
    'cell.vol': ' · Vol {n}',
    'cell.gate': ' · Gate {n} steps',
    'cell.vib': ' · Vib({label})',

    'order.loopStart': 'Loop start',
    'order.loopEnd': 'Loop end',

    'toast.minPattern': '⚠️ Keep at least one pattern',
    'toast.minSlot': '⚠️ Keep at least one slot',
    'toast.loopStartSet': '↺ Loop start set to section {n}',
    'toast.loopEndSet': '↻ Loop end set after section {n}',
    'toast.noNotesPattern': '⚠️ No notes in this pattern',
    'toast.noNotesSong': '⚠️ Tap the grid to write a melody',
    'toast.singleLoopOn': '↺ Single loop on',
    'toast.fullPlay': '▶ Full song playback',
    'toast.presetLoaded': '🎵 Preset loaded',
    'toast.random': '🎲 Generated: {name}',
    'toast.cleared': '🗑️ Cleared current pattern',
    'toast.emptyToSave': '⚠️ Compose something first',
    'toast.nameRequired': '⚠️ Enter a name',
    'toast.renamed': '✅ Renamed to "{name}"',
    'toast.saved': '✅ Saved "{name}"',
    'toast.loaded': '📂 Loaded "{name}"',
    'toast.deleted': '🗑️ Deleted "{name}"',
    'toast.exportReady': '⚠️ Compose something first',
    'toast.exported': '⬇️ MIDI exported',
    'toast.importNone': '⚠️ No notes parsed',
    'toast.imported': '🎵 Imported {n} notes',
    'toast.importFail': '⚠️ Import failed: {msg}',
    'toast.importFileFail': '⚠️ File read failed',

    'err.notMidi': 'Not a standard MIDI file',
    'err.smpte': 'SMPTE time format not supported',
    'err.trackHeader': 'Bad track header',
    'err.invalidFile': 'Invalid file',

    'import.name': 'Import {c}',

    'style.debussy': 'Debussy',
    'style.mj': 'Michael Jackson',
    'style.classic': 'Classic Pop',

    'tab.synth': 'SYNTH',
    'tab.help': 'GUIDE',

    'help.intro.title': '🎮 Welcome to NEON 8-BIT',
    'help.intro.body': '<p>NEON 8-BIT is an in-browser <strong>NES 2A03 chip synthesizer</strong> expanded from the classic four channels to eight: P1/P2/P3/P4 Square, TRI Triangle, NSE Noise, SAW Sawtooth, and DMC Sample.</p><p>Just tap cells on the grid to write 8-bit chiptune and arrange it into a full song.</p>',
    'help.quick.title': '🚀 Quick Start',
    'help.quick.body': '<ul><li><strong>Tap cells</strong>: click a grid cell to place a note; click it again to remove.</li><li><strong>Play</strong>: press "▶ PLAY" to hear the current pattern or the whole song.</li><li><strong>Pick pitch</strong>: use the pitch dropdown at the top of each channel row.</li><li><strong>Random</strong>: hit "✦ RANDOM" to instantly generate a full song.</li></ul>',
    'help.channels.title': '🎛 Eight Channels',
    'help.channels.body': '<ul><li><strong>P1 Square</strong>: lead melody with duty, sweep, glide, and vibrato.</li><li><strong>P2 Square</strong>: harmony / second melody, same as P1.</li><li><strong>TRI Triangle</strong>: bass line; no volume control, soft tone.</li><li><strong>NSE Noise</strong>: drums and percussion with long/short mode and drum types.</li><li><strong>P3/P4 Square</strong>: extended square channels, same capabilities as P1/P2, for richer polyphony.</li><li><strong>SAW Sawtooth</strong>: extended channel with rich harmonics, thick tone, great for lead melodies.</li><li><strong>DMC Sample</strong>: sample channel; each step triggers kick/snare/bass/hat, with rate controlling pitch.</li></ul>',
    'help.notes.title': '✏️ Writing Notes',
    'help.notes.body': '<p>Each channel is a row of <strong>32 steps</strong>. After placing a note you can fine-tune it:</p><ul><li><strong>Gate</strong>: choose how many steps the note holds (1/2/4/8/16/32); held steps show as a dash.</li><li><strong>Volume</strong>: square and noise support per-step volume; grid opacity shows velocity.</li><li><strong>Arpeggio</strong>: melodic channels can arpeggiate, rapidly cycling three pitches.</li><li><strong>Vibrato</strong>: add pitch wobble to long notes (purple glowing border).</li><li><strong>Glide</strong>: set in the params panel to slide smoothly into the next note.</li></ul>',
    'help.params.title': '⚙️ Channel Parameters',
    'help.params.body': '<ul><li><strong>Duty</strong>: pulse width of the square wave (12.5% / 25% / 50% / 75%).</li><li><strong>Volume</strong>: 0-15 overall loudness per channel.</li><li><strong>Envelope</strong>: constant / decay / loop.</li><li><strong>Sweep</strong>: square-only; pitch rises or falls over time.</li><li><strong>Glide time</strong>: smooth transition duration between notes.</li><li><strong>Noise mode</strong>: long (dark) or short (bright).</li><li><strong>Drum type</strong>: 16 timbres from crash to kick.</li></ul>',
    'help.arrange.title': '↻ Patterns & Arrangement',
    'help.arrange.body': '<p>A song is built from multiple <strong>patterns</strong> arranged in order.</p><ul><li><strong>Patterns</strong>: tap "＋ Pattern" to add; duplicate, delete, or rename them.</li><li><strong>Arrangement</strong>: use "＋ Append current" to add to the song, and reorder with the arrows.</li><li><strong>Loop</strong>: set loop start/end to repeat a section; the intro before it plays once.</li></ul>',
    'help.play.title': '▶ Playback & Loop',
    'help.play.body': '<ul><li><strong>BPM</strong>: drag the slider to set tempo from 60 to 180.</li><li><strong>Single loop</strong>: check it to loop only the currently selected pattern.</li><li><strong>Follow playback</strong>: the grid auto-switches patterns and highlights the current step while playing.</li></ul>',
    'help.library.title': '💾 Save & Library',
    'help.library.body': '<p>Songs are stored in your browser <strong>localStorage</strong>; nothing is uploaded anywhere.</p><ul><li><strong>Save</strong>: press "💾 SAVE" and enter a name.</li><li><strong>Load / delete</strong>: manage songs in the library list.</li><li><strong>Share</strong>: after saving, a share card pops up for screenshots.</li></ul>',
    'help.presets.title': '⌨ Presets & Random',
    'help.presets.body': '<ul><li><strong>Presets</strong>: "Star Pulse" and "Victory Fanfare" are ready-to-play songs.</li><li><strong>Random</strong>: "✦ RANDOM" generates intro+verse+chorus in the selected style (Classic Pop / Debussy / Michael Jackson).</li></ul>',
    'help.midi.title': '📂 MIDI Import / Export',
    'help.midi.body': '<ul><li><strong>Import</strong>: tap "📂 Import MIDI" and pick a .mid file; it auto-maps to the eight channels.</li><li><strong>Export</strong>: tap "⬇️ Export MIDI" to download the current song as a .mid for use in a DAW.</li></ul>',
    'help.footer': 'Have fun writing your own 8-bit melodies ♥'
  };

  var DICT = { zh: zh, en: en };
  var current = 'zh';

  function loadLang() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      if (v === 'zh' || v === 'en') return v;
    } catch (e) { /* ignore */ }
    return 'zh';
  }

  function t(key, params) {
    var dict = DICT[current] || DICT.zh;
    var s = dict[key];
    if (s == null) s = DICT.zh[key];
    if (s == null) s = key;
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          s = s.split('{' + k + '}').join(String(params[k]));
        }
      }
    }
    return s;
  }

  function setLang(lang) {
    if (lang !== 'zh' && lang !== 'en') lang = 'zh';
    current = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : 'en';
    if (window.__onLangChange) window.__onLangChange();
  }

  current = loadLang();
  document.documentElement.lang = (current === 'zh') ? 'zh-CN' : 'en';

  window.I18N = {
    get current() { return current; },
    t: t,
    setLang: setLang
  };
})();
