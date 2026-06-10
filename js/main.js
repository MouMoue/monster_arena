// 游戏主逻辑 —— 状态机: title / playing / paused / gameover
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const { W, H } = CONFIG;
const C = CONFIG.colors;

// ---------- 视口适配: 逻辑分辨率固定 960x540, 等比缩放铺满窗口 ----------
let viewScale = 1;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const fit = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = Math.round(W * fit) + 'px';
  canvas.style.height = Math.round(H * fit) + 'px';
  viewScale = fit * dpr;
  canvas.width = Math.round(W * viewScale);
  canvas.height = Math.round(H * viewScale);
}
addEventListener('resize', resize);
resize();

// ---------- 资源 ----------
const goblinImg = { run: new Image(), death: new Image() };
goblinImg.run.src = 'assets/monsters/goblin/Run.png';
goblinImg.death.src = 'assets/monsters/goblin/Death.png';

// ---------- 游戏状态 ----------
let state = 'title';
let player, bullets, monsters, playTime, kills, spawnTimer;

function reset() {
  player = {
    x: W / 2, y: H / 2,
    hp: CONFIG.player.hp,
    aim: { x: 1, y: 0 },
    moving: false, phase: 0,
    fireCd: 0, muzzle: 0, invuln: 0,
  };
  bullets = [];
  monsters = [];
  playTime = 0;
  kills = 0;
  spawnTimer = 0.5;
}

function stage() {
  const t = playTime;
  for (const s of CONFIG.difficulty) if (t < s.until) return s;
}
function monsterCap(s) {
  return input.touchSeen ? Math.min(s.cap, CONFIG.mobileMonsterCap) : s.cap;
}
function hpMul(s) {
  let m = s.hpMul;
  if (s.hpRampPer60s) m += s.hpRampPer60s * Math.floor((playTime - 120) / 60);
  return m;
}

function spawnMonster() {
  const m = CONFIG.spawnMargin, g = CONFIG.goblin;
  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? -m : side === 1 ? W + m : Math.random() * W;
  const y = side < 2 ? Math.random() * H : (side === 2 ? -m : H + m);
  const hp = Math.round(g.hp * hpMul(stage()));
  monsters.push({ x, y, hp, maxHp: hp, hitCd: 0, animT: Math.random(), flip: false, dying: 0 });
}

// ---------- 更新 ----------
function update(dt) {
  playTime += dt;

  // 主角移动 + 朝向（边走边打，射击不锁移动）
  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
    player.aim.x = input.moveX;
    player.aim.y = input.moveY;
    player.x += input.moveX * CONFIG.player.speed * dt;
    player.y += input.moveY * CONFIG.player.speed * dt;
    const r = CONFIG.player.radius;
    player.x = Math.max(r, Math.min(W - r, player.x));
    player.y = Math.max(r + 20, Math.min(H - r, player.y));
    player.phase = (player.phase + dt * 2.2) % 1;
  }
  player.fireCd -= dt;
  player.muzzle -= dt;
  player.invuln -= dt;

  // 开火
  if (input.firing && player.fireCd <= 0 && bullets.length < CONFIG.bullet.max) {
    const sx = player.x + player.aim.x * GUN_TIP;
    const sy = player.y - 12 + player.aim.y * GUN_TIP;
    bullets.push({ x: sx, y: sy, vx: player.aim.x * CONFIG.bullet.speed, vy: player.aim.y * CONFIG.bullet.speed });
    player.fireCd = 1 / CONFIG.bullet.fireRate;
    player.muzzle = 0.07;
  }

  // 子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) { bullets.splice(i, 1); continue; }
    for (const m of monsters) {
      if (m.dying || m.hp <= 0) continue;
      if (Math.hypot(b.x - m.x, b.y - m.y) < CONFIG.bullet.radius + CONFIG.goblin.radius) {
        m.hp -= CONFIG.bullet.damage;
        const kb = CONFIG.bullet.knockback, d = Math.hypot(b.vx, b.vy);
        m.x += b.vx / d * kb;
        m.y += b.vy / d * kb;
        if (m.hp <= 0) { m.dying = 0.0001; m.animT = 0; kills++; }
        bullets.splice(i, 1);
        break;
      }
    }
  }

  // 刷怪
  const s = stage();
  spawnTimer -= dt;
  const alive = monsters.filter(m => !m.dying).length;
  if (spawnTimer <= 0 && alive < monsterCap(s)) {
    spawnMonster();
    spawnTimer = s.interval;
  }

  // 怪物
  const g = CONFIG.goblin;
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    m.animT += dt;
    if (m.dying) {
      m.dying += dt;
      if (m.dying > g.deathFrames / g.deathFps + 0.3) monsters.splice(i, 1);
      continue;
    }
    const dx = player.x - m.x, dy = player.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    m.x += dx / d * g.speed * dt;
    m.y += dy / d * g.speed * dt;
    m.flip = dx < 0;
    m.hitCd -= dt;
    if (d < CONFIG.player.radius + g.radius && m.hitCd <= 0 && player.invuln <= 0) {
      player.hp -= g.damage;
      player.invuln = CONFIG.player.invuln;
      m.hitCd = g.hitCooldown;
      if (player.hp <= 0) { player.hp = 0; gameOver(); }
    }
  }
}

function gameOver() {
  state = 'gameover';
  const best = loadBest();
  if (!best || playTime > best.time) {
    localStorage.setItem('monster_arena_best', JSON.stringify({ time: playTime, kills }));
  }
}
function loadBest() {
  try { return JSON.parse(localStorage.getItem('monster_arena_best')); } catch { return null; }
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------- 绘制 ----------
function drawArena() {
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 60; x < W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 60; y < H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
}

function drawMonster(m) {
  const g = CONFIG.goblin;
  const size = 150 * g.scale;
  const img = m.dying ? goblinImg.death : goblinImg.run;
  const frames = m.dying ? g.deathFrames : g.runFrames;
  const fps = m.dying ? g.deathFps : g.runFps;
  let f = Math.floor(m.animT * fps) % frames;
  if (m.dying) {
    f = Math.min(Math.floor(m.dying * g.deathFps), frames - 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, m.dying - frames / g.deathFps) / 0.3);
  } else {
    ctx.save();
  }
  ctx.translate(m.x, m.y - g.bodyOffsetY * g.scale);
  if (m.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, f * 150, 0, 150, 150, -size / 2, -size / 2, size, size);
  ctx.restore();

  if (!m.dying && m.hp < m.maxHp) {
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(m.x - 18, m.y - 48, 36, 4);
    ctx.fillStyle = C.hpBar;
    ctx.fillRect(m.x - 18, m.y - 48, 36 * m.hp / m.maxHp, 4);
  }
}

function drawHUD() {
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(20, 16, 200, 14);
  ctx.fillStyle = C.hpBar;
  ctx.fillRect(20, 16, 200 * player.hp / CONFIG.player.hp, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 16, 200, 14);
  ctx.fillStyle = C.hud;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${player.hp}`, 24, 27);

  ctx.textAlign = 'center';
  ctx.font = '20px -apple-system, sans-serif';
  ctx.fillText(fmtTime(playTime), W / 2, 32);

  ctx.textAlign = 'right';
  ctx.font = '16px -apple-system, sans-serif';
  ctx.fillText(`击杀 ${kills}`, W - (input.touchSeen ? 70 : 20), 30);

  if (input.touchSeen) drawPauseBtn();
}

const PAUSE_BTN = { x: W - 44, y: 12, w: 32, h: 32 };
function drawPauseBtn() {
  const b = PAUSE_BTN;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = C.hud;
  if (state === 'paused') {
    ctx.beginPath();
    ctx.moveTo(b.x + 11, b.y + 8);
    ctx.lineTo(b.x + 24, b.y + 16);
    ctx.lineTo(b.x + 11, b.y + 24);
    ctx.fill();
  } else {
    ctx.fillRect(b.x + 9, b.y + 8, 5, 16);
    ctx.fillRect(b.x + 18, b.y + 8, 5, 16);
  }
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

const FIRE_BTN = { x: W - 110, y: H - 110, r: 52 };
function drawTouchControls() {
  if (!input.touchSeen || state !== 'playing') return;
  if (input.joystick) {
    const j = input.joystick;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.ox, j.oy, 52, 0, Math.PI * 2);
    ctx.stroke();
    const dx = j.cx - j.ox, dy = j.cy - j.oy;
    const d = Math.hypot(dx, dy), cl = Math.min(d, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(j.ox + (d ? dx / d * cl : 0), j.oy + (d ? dy / d * cl : 0), 24, 0, Math.PI * 2);
    ctx.fill();
  }
  const f = FIRE_BTN;
  ctx.fillStyle = input.firing ? 'rgba(239,159,39,0.45)' : 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.hud;
  ctx.font = '16px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('射击', f.x, f.y + 6);
}

function drawOverlay(title, lines, btnText) {
  ctx.fillStyle = 'rgba(10,10,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'center';
  ctx.font = '40px -apple-system, sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 90);
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 40 + i * 30));
  if (btnText) {
    const b = OVERLAY_BTN;
    ctx.fillStyle = 'rgba(239,159,39,0.9)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#2a1c05';
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillText(btnText, W / 2, b.y + 32);
  }
}
const OVERLAY_BTN = { x: W / 2 - 110, y: H / 2 + 70, w: 220, h: 50 };

function draw() {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  drawArena();
  if (state === 'title') {
    drawOverlay('火柴人：怪物围城', [
      '怪物会从四面八方涌来，活下去！',
      '移动：方向键 / WASD（手机：左半屏摇杆）',
      '射击：J / 空格 按住连发（手机：右下角按钮）',
    ], '开始游戏');
    return;
  }

  monsters.forEach(drawMonster);
  bullets.forEach(b => {
    ctx.fillStyle = C.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, CONFIG.bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  drawStickman(ctx, player.x, player.y, player);
  drawHUD();
  drawTouchControls();

  if (state === 'paused') {
    drawOverlay('已暂停', ['按 P 或点击右上角继续'], null);
    drawPauseBtn();
  } else if (state === 'gameover') {
    const best = loadBest();
    drawOverlay('游戏结束', [
      `存活 ${fmtTime(playTime)}　击杀 ${kills}`,
      best ? `最佳纪录：存活 ${fmtTime(best.time)}　击杀 ${best.kills}` : '',
      '按 R 重开',
    ], '再来一局');
  }
}

// ---------- UI 事件路由 ----------
function handleUI() {
  for (const code of input.keyPresses) {
    if (state === 'title') { state = 'playing'; reset(); }
    else if (state === 'gameover' && code === 'KeyR') { state = 'playing'; reset(); }
    else if (code === 'KeyP' && (state === 'playing' || state === 'paused')) {
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
  for (const p of input.taps) {
    if (state === 'title') { state = 'playing'; reset(); }
    else if (state === 'gameover' && inRect(p, OVERLAY_BTN)) { state = 'playing'; reset(); }
    else if ((state === 'playing' || state === 'paused') && input.touchSeen && inRect(p, PAUSE_BTN)) {
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
}

// ---------- 主循环 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  input.poll();
  handleUI();
  if (state === 'playing') update(dt);
  draw();
  input.flush();
  requestAnimationFrame(loop);
}

let loadedImgs = 0;
[goblinImg.run, goblinImg.death].forEach(img => {
  img.onload = () => { if (++loadedImgs === 2) { reset(); requestAnimationFrame(loop); } };
});
