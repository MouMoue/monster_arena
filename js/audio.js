// 程序化音频 —— Web Audio API 合成 BGM / 射击 / 击杀 / 受击
// 零素材、零依赖、零版权。契合本项目「程序化绘制」风格。
// 浏览器自动播放策略：首次用户手势(键盘/触摸)后才会出声(见 unlock())。
const AUDIO = (() => {
  let ctx = null, master = null;
  let muted = false;
  let bgmTimer = null, bgmStep = 0, bgmNextT = 0;
  let lastShot = 0; // 射击节流(全自动射击很频繁，防音爆)

  try { muted = localStorage.getItem('ma_muted') === '1'; } catch (_) {}

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
  }

  // 首次用户手势调用：创建并恢复 AudioContext（BGM 由 syncBgm 按场景启动）
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // 带包络的振荡器(可扫频)
  function tone({ freq = 440, to = null, type = 'square', dur = 0.1, vol = 0.3, delay = 0, attack = 0.005, dest = null }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(g); g.connect(dest || master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  // 噪声爆破(用于打击质感)
  function noise({ dur = 0.1, vol = 0.2, hp = 800, lp = 6000, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + Math.max(0, delay);
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    let node = src;
    if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  // ---- 射击：短促 "pew" + 一点噪声，按武器变基频 ----
  function shoot(weaponId) {
    if (!ctx || muted) return;
    const now = performance.now();
    if (now - lastShot < 90) return; // 节流（间隔越大越不吵）
    lastShot = now;
    const map = { pistol: 680, spread: 520, shotgun: 470, pierce: 900, rapid: 840, laser: 1020, smg: 800 };
    let base = map[weaponId];
    if (!base) { // 未知武器 id：按字符串 hash 生成稳定基频
      let h = 0; const s = String(weaponId || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      base = 560 + Math.abs(h) % 380;
    }
    tone({ freq: base, to: base * 0.4, type: 'square', dur: 0.05, vol: 0.032 });
    noise({ dur: 0.03, vol: 0.009, hp: 1400, lp: 6500 });
  }

  // ---- 击倒/击杀：低频 thud + 破碎噪声(大怪更低更长) ----
  function kill(m) {
    if (!ctx || muted) return;
    const t = m && m.type;
    const big = (m && (m.tier || 0) >= 2) || t === 'skeleton' || t === 'ogre' || t === 'mushroom_big' || t === 'boss';
    const f = big ? 150 : 235;
    tone({ freq: f, to: f * 0.35, type: 'triangle', dur: big ? 0.30 : 0.18, vol: 0.30 });
    tone({ freq: f * 1.5, to: f * 0.5, type: 'square', dur: 0.12, vol: 0.10 });
    noise({ dur: big ? 0.20 : 0.12, vol: 0.18, hp: 450, lp: 5000 });
  }

  // ---- 主角受击：低沉一击 ----
  function hurt() {
    if (!ctx || muted) return;
    tone({ freq: 300, to: 90, type: 'sawtooth', dur: 0.18, vol: 0.20 });
    noise({ dur: 0.10, vol: 0.10, hp: 300, lp: 3000 });
  }

  // ---- 游戏结束：下行失败音 ----
  function gameOver() {
    if (!ctx || muted) return;
    tone({ freq: 440, to: 110, type: 'triangle', dur: 0.5, vol: 0.11 });
    tone({ freq: 330, to: 80, type: 'triangle', dur: 0.5, vol: 0.05, delay: 0.06 });
  }

  // ---- BGM：高能驱动战斗曲（140 BPM · 鼓组 + 律动 bass + synth 主旋律 · 4 段）----
  const CHORDS = [
    // 段 A（主题，建立律动）
    { root: 110.0, notes: [220.0, 261.6, 329.6] }, // Am
    { root: 87.31, notes: [174.6, 220.0, 261.6] }, // F
    { root: 130.8, notes: [196.0, 261.6, 329.6] }, // C
    { root: 98.00, notes: [196.0, 246.9, 293.7] }, // G
    // 段 B（上扬）
    { root: 110.0, notes: [220.0, 261.6, 329.6] }, // Am
    { root: 98.00, notes: [196.0, 246.9, 293.7] }, // G
    { root: 87.31, notes: [174.6, 220.0, 261.6] }, // F
    { root: 98.00, notes: [196.0, 246.9, 293.7] }, // G
    // 段 C（副歌 / 高潮）
    { root: 87.31, notes: [174.6, 220.0, 261.6] }, // F
    { root: 130.8, notes: [196.0, 261.6, 329.6] }, // C
    { root: 98.00, notes: [196.0, 246.9, 293.7] }, // G
    { root: 110.0, notes: [220.0, 261.6, 329.6] }, // Am
    // 段 D（bridge，紧张转折）
    { root: 73.42, notes: [146.8, 174.6, 220.0] }, // Dm
    { root: 82.41, notes: [164.8, 207.7, 246.9] }, // E
    { root: 110.0, notes: [220.0, 261.6, 329.6] }, // Am
    { root: 98.00, notes: [196.0, 246.9, 293.7] }, // G
  ];
  // 128 步主旋律：4 段（A 主题 / B 上扬 / C 副歌高潮 / D 转折），每段 4 小节
  const MEL = [
    // A
    659.3, 0, 587.3, 0, 523.3, 0, 587.3, 0, 659.3, 0, 0, 587.3, 523.3, 0, 440.0, 0,
    523.3, 0, 587.3, 0, 659.3, 0, 698.5, 0, 587.3, 0, 0, 0, 523.3, 0, 493.9, 0,
    // B
    659.3, 0, 659.3, 0, 587.3, 0, 659.3, 0, 698.5, 0, 659.3, 0, 587.3, 0, 523.3, 0,
    587.3, 0, 587.3, 0, 523.3, 0, 587.3, 0, 659.3, 0, 0, 0, 587.3, 0, 659.3, 0,
    // C（高潮，高音区）
    880.0, 0, 0, 784.0, 0, 880.0, 0, 0, 1046.5, 0, 880.0, 0, 784.0, 0, 698.5, 0,
    659.3, 0, 784.0, 0, 880.0, 0, 784.0, 0, 698.5, 0, 659.3, 0, 587.3, 0, 0, 0,
    // D（转折）
    587.3, 0, 698.5, 0, 659.3, 0, 587.3, 0, 523.3, 0, 0, 659.3, 587.3, 0, 0, 0,
    493.9, 0, 587.3, 0, 659.3, 0, 587.3, 0, 659.3, 0, 698.5, 0, 784.0, 0, 880.0, 0,
  ];
  const B_STEP = 60 / 140 / 2; // 战斗曲八分音符
  const M_STEP = 60 / 100 / 2; // 菜单曲八分音符
  let curKind = 'battle';
  // 菜单舒缓曲数据（柔和 sine 铺底 + 三角波琶音 + 留白旋律，5 段）
  const M_CHORDS = [
    { root: 130.8, pad: [261.6, 329.6, 392.0, 493.9] }, { root: 98.00, pad: [196.0, 246.9, 293.7, 392.0] },
    { root: 110.0, pad: [220.0, 261.6, 329.6, 392.0] }, { root: 87.31, pad: [174.6, 220.0, 261.6, 329.6] },
    { root: 87.31, pad: [174.6, 220.0, 261.6, 329.6] }, { root: 98.00, pad: [196.0, 246.9, 293.7, 392.0] },
    { root: 82.41, pad: [164.8, 196.0, 246.9, 293.7] }, { root: 110.0, pad: [220.0, 261.6, 329.6, 392.0] },
    { root: 110.0, pad: [220.0, 261.6, 329.6, 392.0] }, { root: 82.41, pad: [164.8, 196.0, 246.9, 293.7] },
    { root: 87.31, pad: [174.6, 220.0, 261.6, 329.6] }, { root: 130.8, pad: [261.6, 329.6, 392.0, 493.9] },
    { root: 73.42, pad: [146.8, 174.6, 220.0, 261.6] }, { root: 98.00, pad: [196.0, 246.9, 293.7, 392.0] },
    { root: 82.41, pad: [164.8, 196.0, 246.9, 293.7] }, { root: 110.0, pad: [220.0, 261.6, 329.6, 392.0] },
    { root: 87.31, pad: [174.6, 220.0, 261.6, 329.6] }, { root: 98.00, pad: [196.0, 246.9, 293.7, 392.0] },
    { root: 130.8, pad: [261.6, 329.6, 392.0, 493.9] }, { root: 98.00, pad: [196.0, 246.9, 293.7, 392.0] },
  ];
  const M_MEL = [
    523.3, 0, 0, 587.3, 0, 659.3, 0, 0, 784.0, 0, 0, 0, 659.3, 0, 587.3, 0,
    523.3, 0, 0, 493.9, 0, 440.0, 0, 0, 392.0, 0, 0, 0, 440.0, 0, 493.9, 0,
    587.3, 0, 0, 659.3, 0, 698.5, 0, 0, 880.0, 0, 0, 0, 784.0, 0, 659.3, 0,
    659.3, 0, 0, 587.3, 0, 523.3, 0, 0, 493.9, 0, 0, 0, 440.0, 0, 392.0, 0,
    440.0, 0, 0, 392.0, 0, 329.6, 0, 0, 349.2, 0, 392.0, 0, 440.0, 0, 0, 0,
    392.0, 0, 0, 349.2, 0, 329.6, 0, 0, 293.7, 0, 0, 0, 329.6, 0, 392.0, 0,
    587.3, 0, 0, 523.3, 0, 587.3, 0, 0, 659.3, 0, 587.3, 0, 523.3, 0, 0, 0,
    493.9, 0, 0, 440.0, 0, 493.9, 0, 0, 523.3, 0, 0, 0, 587.3, 0, 659.3, 0,
    698.5, 0, 0, 659.3, 0, 587.3, 0, 0, 523.3, 0, 0, 0, 493.9, 0, 440.0, 0,
    392.0, 0, 0, 440.0, 0, 493.9, 0, 0, 523.3, 0, 0, 0, 523.3, 0, 0, 0,
  ];

  function kick(at, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(50, at + 0.1);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.13);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + 0.15);
  }
  function snare(at) {
    const n = Math.floor(ctx.sampleRate * 0.13);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.085, at); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.13);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(at); s.stop(at + 0.14);
  }
  function hat(at, open) {
    const dur = open ? 0.07 : 0.028;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.02 : 0.028, at); g.gain.exponentialRampToValueAtTime(0.0006, at + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(at); s.stop(at + dur + 0.01);
  }

  function schedule() {
    if (!ctx) return;
    if (curKind === 'menu') scheduleMenu(); else scheduleBattle();
  }
  function scheduleBattle() {
    while (bgmNextT < ctx.currentTime + 0.25) {
      const step = bgmStep % 128;
      const dly = bgmNextT - ctx.currentTime;
      const t = bgmNextT;
      const ch = CHORDS[Math.floor(step / 8) % 16];
      const chorus = Math.floor(step / 32) % 4 === 2;                       // 副歌段（C）加密鼓点
      if (step % 4 === 0) kick(t, 0.15);                                    // 每拍底鼓
      if (chorus && step % 4 === 2) kick(t, 0.10);
      if (step % 8 === 4) snare(t);                                         // 反拍军鼓
      hat(t, step % 4 === 2);                                              // 每八分踩镲（反拍 open）
      const bf = (step % 4 === 2) ? ch.root * 1.5 : (step % 2 === 0 ? ch.root : ch.root * 2); // 律动 bassline
      tone({ freq: bf, type: 'sawtooth', dur: B_STEP * 0.85, vol: 0.06, delay: dly, attack: 0.004 });
      tone({ freq: ch.notes[step % ch.notes.length] * 2, type: 'square', dur: B_STEP * 0.45, vol: 0.016, delay: dly, attack: 0.004 }); // 快速琶音垫
      const m = MEL[step];
      if (m) tone({ freq: m, type: 'square', dur: B_STEP * 1.25, vol: 0.07, delay: dly, attack: 0.005 });                            // synth 主旋律
      bgmStep++; bgmNextT += B_STEP;
    }
  }
  function scheduleMenu() {
    while (bgmNextT < ctx.currentTime + 0.25) {
      const step = bgmStep % 160;
      const dly = bgmNextT - ctx.currentTime;
      const ch = M_CHORDS[Math.floor(step / 8) % 20];
      if (step % 8 === 0) for (const f of ch.pad) tone({ freq: f, type: 'sine', dur: M_STEP * 7.6, vol: 0.026, delay: dly, attack: 0.14 });
      if (step % 4 === 0) tone({ freq: ch.root, type: 'triangle', dur: M_STEP * 3.4, vol: 0.055, delay: dly, attack: 0.03 });
      if (step % 2 === 0) tone({ freq: ch.pad[Math.floor(step / 2) % ch.pad.length], type: 'triangle', dur: M_STEP * 1.5, vol: 0.026, delay: dly, attack: 0.02 });
      const m = M_MEL[step];
      if (m) tone({ freq: m, type: 'triangle', dur: M_STEP * 1.9, vol: 0.056, delay: dly, attack: 0.035 });
      bgmStep++; bgmNextT += M_STEP;
    }
  }

  function startBGM(kind) {
    ensure();
    if (!ctx) return;
    kind = kind || curKind;
    if (bgmTimer && kind === curKind) return;       // 已在播同一曲
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    curKind = kind;
    bgmStep = 0;
    bgmNextT = ctx.currentTime + 0.08;
    bgmTimer = setInterval(schedule, 40);
  }
  function stopBGM() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.85;
    try { localStorage.setItem('ma_muted', muted ? '1' : '0'); } catch (_) {}
    return muted;
  }

  return { unlock, shoot, kill, hurt, gameOver, startBGM, stopBGM, toggleMute, get muted() { return muted; } };
})();
window.AUDIO = AUDIO;
