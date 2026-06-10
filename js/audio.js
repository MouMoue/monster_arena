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

  // 首次用户手势调用：创建并恢复 AudioContext，并起 BGM（全程循环）
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    startBGM();
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
    if (now - lastShot < 45) return; // 节流
    lastShot = now;
    const map = { pistol: 680, spread: 520, shotgun: 470, pierce: 900, rapid: 840, laser: 1020, smg: 800 };
    let base = map[weaponId];
    if (!base) { // 未知武器 id：按字符串 hash 生成稳定基频
      let h = 0; const s = String(weaponId || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      base = 560 + Math.abs(h) % 380;
    }
    tone({ freq: base, to: base * 0.4, type: 'square', dur: 0.055, vol: 0.06 });
    noise({ dur: 0.035, vol: 0.022, hp: 1200, lp: 7000 });
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
    tone({ freq: 440, to: 110, type: 'triangle', dur: 0.5, vol: 0.22 });
    tone({ freq: 330, to: 80, type: 'square', dur: 0.5, vol: 0.10, delay: 0.06 });
  }

  // ---- BGM：舒缓抒情循环（柔和 sine 和弦铺底 + 三角波琶音 + 留白主旋律，无硬鼓点）----
  const PROG = [
    { bass: 130.8, pad: [261.6, 329.6, 392.0, 493.9] }, // Cmaj7
    { bass: 98.00, pad: [196.0, 246.9, 293.7, 392.0] }, // G
    { bass: 110.0, pad: [220.0, 261.6, 329.6, 392.0] }, // Am7
    { bass: 87.31, pad: [174.6, 220.0, 261.6, 329.6] }, // Fmaj7
  ];
  // 32 步抒情主旋律（0 = 休止，留白制造呼吸感）
  const MEL = [
    523.3, 0, 0, 587.3, 0, 659.3, 0, 0, 784.0, 0, 0, 0, 659.3, 0, 587.3, 0,
    523.3, 0, 0, 493.9, 0, 440.0, 0, 0, 392.0, 0, 0, 0, 440.0, 0, 493.9, 0,
  ];
  const BPM = 100;
  const STEP = 60 / BPM / 2; // 八分音符

  // 柔和铺底和弦（长音、慢起音）
  function pad(freqs, at) {
    for (const f of freqs) tone({ freq: f, type: 'sine', dur: STEP * 7.6, vol: 0.026, delay: at - ctx.currentTime, attack: 0.14 });
  }

  function schedule() {
    if (!ctx) return;
    while (bgmNextT < ctx.currentTime + 0.25) {
      const step = bgmStep % 32;
      const dly = bgmNextT - ctx.currentTime;
      const ch = PROG[Math.floor(step / 8) % 4];
      if (step % 8 === 0) pad(ch.pad, bgmNextT);                                                                            // 每小节铺一层柔和和弦
      if (step % 4 === 0) tone({ freq: ch.bass, type: 'triangle', dur: STEP * 3.4, vol: 0.055, delay: dly, attack: 0.03 }); // 柔和低音
      if (step % 2 === 0) tone({ freq: ch.pad[Math.floor(step / 2) % ch.pad.length], type: 'triangle', dur: STEP * 1.5, vol: 0.026, delay: dly, attack: 0.02 }); // 轻琶音
      const m = MEL[step];
      if (m) tone({ freq: m, type: 'triangle', dur: STEP * 1.9, vol: 0.056, delay: dly, attack: 0.035 });                  // 抒情主旋律
      bgmStep++; bgmNextT += STEP;
    }
  }

  function startBGM() {
    ensure();
    if (!ctx || bgmTimer) return;
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
