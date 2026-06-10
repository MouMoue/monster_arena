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

// ---------- 资源: 按怪物图鉴批量加载 ----------
const images = {};
const pending = [];
for (const [type, cfg] of Object.entries(CONFIG.monsters)) {
  images[type] = {};
  for (const [anim, a] of Object.entries(cfg.anims)) {
    const img = new Image();
    img.src = 'assets/monsters/' + a.file;
    images[type][anim] = img;
    pending.push(img);
  }
  if (cfg.projectile) {
    const img = new Image();
    img.src = 'assets/monsters/' + cfg.projectile.file;
    images[type].projectile = img;
    pending.push(img);
  }
}

// ---------- 游戏状态 ----------
let state = 'title';
let player, bullets, monsters, eprojs, playTime, kills, spawnTimer;

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
  eprojs = [];          // 敌方投射物（蘑菇孢子）
  playTime = 0;
  kills = 0;
  spawnTimer = 0.5;
}

function stage() {
  for (const s of CONFIG.difficulty) if (playTime < s.until) return s;
}
function monsterCap(s) {
  return input.touchSeen ? Math.min(s.cap, CONFIG.mobileMonsterCap) : s.cap;
}
function hpMul(s) {
  let m = s.hpMul;
  if (s.hpRampPer60s) m += s.hpRampPer60s * Math.floor((playTime - 120) / 60);
  return m;
}

function pickType(weights) {
  let r = Math.random(), acc = 0;
  for (const [type, w] of Object.entries(weights)) {
    acc += w;
    if (r < acc) return type;
  }
  return Object.keys(weights)[0];
}

function spawnMonster(s) {
  const m = CONFIG.spawnMargin;
  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? -m : side === 1 ? W + m : Math.random() * W;
  const y = side < 2 ? Math.random() * H : (side === 2 ? -m : H + m);
  const type = pickType(s.weights);
  const hp = Math.round(CONFIG.monsters[type].hp * hpMul(s));
  monsters.push({
    type, x, y, hp, maxHp: hp,
    state: 'move',            // move | attack | dying
    animT: Math.random(), atkCd: 0, hitDone: false,
    flip: false, dying: 0,
  });
}

function nearestMonster() {
  let best = null, bd = Infinity;
  for (const m of monsters) {
    if (m.dying) continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function hurtPlayer(dmg) {
  if (player.invuln > 0) return;
  player.hp -= dmg;
  player.invuln = CONFIG.player.invuln;
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

// ---------- 更新 ----------
function update(dt) {
  playTime += dt;

  // 主角移动（攻击全自动，移动永不锁定）
  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
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

  // 自动锁定最近敌人 + 自动开火；无敌人时枪口跟随移动方向
  const target = nearestMonster();
  if (target) {
    const gx = player.x, gy = player.y - 12;
    const d = Math.hypot(target.x - gx, target.y - gy) || 1;
    player.aim.x = (target.x - gx) / d;
    player.aim.y = (target.y - gy) / d;
    if (player.fireCd <= 0 && bullets.length < CONFIG.bullet.max) {
      bullets.push({
        x: gx + player.aim.x * GUN_TIP, y: gy + player.aim.y * GUN_TIP,
        vx: player.aim.x * CONFIG.bullet.speed, vy: player.aim.y * CONFIG.bullet.speed,
      });
      player.fireCd = 1 / CONFIG.bullet.fireRate;
      player.muzzle = 0.07;
    }
  } else if (player.moving) {
    player.aim.x = input.moveX;
    player.aim.y = input.moveY;
  }

  // 子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) { bullets.splice(i, 1); continue; }
    for (const m of monsters) {
      if (m.dying) continue;
      if (Math.hypot(b.x - m.x, b.y - m.y) < CONFIG.bullet.radius + CONFIG.monsters[m.type].radius) {
        m.hp -= CONFIG.bullet.damage;
        const kb = CONFIG.bullet.knockback, sp = Math.hypot(b.vx, b.vy);
        m.x += b.vx / sp * kb;
        m.y += b.vy / sp * kb;
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
    spawnMonster(s);
    spawnTimer = s.interval;
  }

  // 怪物状态机: move 追近 → attack 挥击/吐弹(hitFrame 帧结算) → 冷却后再攻
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    const cfg = CONFIG.monsters[m.type];
    m.animT += dt;
    if (m.dying) {
      m.dying += dt;
      if (m.dying > cfg.anims.death.frames / cfg.anims.death.fps + 0.3) monsters.splice(i, 1);
      continue;
    }
    const dx = player.x - m.x, dy = player.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    m.flip = dx < 0;
    m.atkCd -= dt;

    if (m.state === 'attack') {
      const a = cfg.anims.attack;
      const frame = Math.floor(m.animT * a.fps);
      if (!m.hitDone && frame >= cfg.hitFrame) {
        m.hitDone = true;
        if (cfg.behavior === 'melee') {
          if (d < cfg.attackRange + CONFIG.player.radius + 12) hurtPlayer(cfg.damage);
        } else {
          const p = cfg.projectile;
          eprojs.push({ type: m.type, x: m.x, y: m.y - 10, vx: dx / d * p.speed, vy: dy / d * p.speed, animT: 0 });
        }
      }
      if (frame >= a.frames) { m.state = 'move'; m.animT = 0; m.atkCd = cfg.attackCooldown; }
      continue;
    }

    // move 状态：近战贴脸即攻；远程保持距离，进入射程就停下吐弹
    const inRange = d < cfg.attackRange;
    if (inRange && m.atkCd <= 0) {
      m.state = 'attack';
      m.animT = 0;
      m.hitDone = false;
    } else if (!inRange || cfg.behavior === 'melee') {
      m.x += dx / d * cfg.speed * dt;
      m.y += dy / d * cfg.speed * dt;
      m.idle = false;
    } else {
      m.idle = true;          // 远程怪在射程内等冷却
    }
  }

  // 敌方投射物
  for (let i = eprojs.length - 1; i >= 0; i--) {
    const e = eprojs[i];
    const p = CONFIG.monsters[e.type].projectile;
    e.animT += dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.x < -80 || e.x > W + 80 || e.y < -80 || e.y > H + 80) { eprojs.splice(i, 1); continue; }
    if (Math.hypot(e.x - player.x, e.y - player.y) < p.radius + CONFIG.player.radius) {
      hurtPlayer(CONFIG.monsters[e.type].damage);
      eprojs.splice(i, 1);
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
  const cfg = CONFIG.monsters[m.type];
  const size = 150 * cfg.scale;
  let a, t;
  if (m.dying) { a = cfg.anims.death; t = m.dying; }
  else if (m.state === 'attack') { a = cfg.anims.attack; t = m.animT; }
  else if (m.idle && cfg.anims.idle) { a = cfg.anims.idle; t = m.animT; }
  else { a = cfg.anims.move; t = m.animT; }

  let f;
  ctx.save();
  if (m.dying) {
    f = Math.min(Math.floor(t * a.fps), a.frames - 1);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - a.frames / a.fps) / 0.3);
  } else if (m.state === 'attack') {
    f = Math.min(Math.floor(t * a.fps), a.frames - 1);
  } else {
    f = Math.floor(t * a.fps) % a.frames;
  }
  const img = images[m.type][m.dying ? 'death' : (m.state === 'attack' ? 'attack' : (m.idle && cfg.anims.idle ? 'idle' : 'move'))];
  ctx.translate(m.x, m.y - cfg.bodyOffsetY * cfg.scale);
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

function drawEproj(e) {
  const p = CONFIG.monsters[e.type].projectile;
  const img = images[e.type].projectile;
  const f = Math.floor(e.animT * p.fps) % p.frames;
  const size = p.size * p.scale;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.vx < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, f * p.size, 0, p.size, p.size, -size / 2, -size / 2, size, size);
  ctx.restore();
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

function drawTouchControls() {
  if (!input.touchSeen || state !== 'playing' || !input.joystick) return;
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
      '自动锁定最近的怪物射击，你只管走位',
      '移动：方向键 / WASD（手机：任意位置拖动摇杆）',
      '小心蘑菇怪的孢子弹和骷髅的重剑',
    ], '开始游戏');
    return;
  }

  monsters.forEach(drawMonster);
  eprojs.forEach(drawEproj);
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
pending.forEach(img => {
  img.onload = () => { if (++loadedImgs === pending.length) { reset(); requestAnimationFrame(loop); } };
});
