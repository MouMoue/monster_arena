// 游戏主逻辑 —— 状态机: title / shop / playing / paused / gameover
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const { W, H } = CONFIG;
const C = CONFIG.colors;
loadMeta();

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
let player, bullets, monsters, eprojs, floaters, playTime, kills, runCoins, spawnTimer, stats;

function diff() { return CONFIG.difficulties[meta.difficulty]; }

function reset() {
  stats = effectiveStats();
  player = {
    x: W / 2, y: H / 2,
    hp: stats.maxHp,
    aim: { x: 1, y: 0 },
    moving: false, phase: 0,
    fireCd: 0, muzzle: 0, invuln: 0,
    weaponVisual: stats.weapon.visual,
  };
  bullets = [];
  monsters = [];
  eprojs = [];
  floaters = [];
  playTime = 0;
  kills = 0;
  runCoins = 0;
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
  return m * diff().hpMul;
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
    state: 'move', animT: Math.random(), atkCd: 0, hitDone: false,
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
  player.hp -= Math.round(dmg * diff().dmgMul);
  player.invuln = stats.invuln;
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

function addFloater(x, y, text, color, life = 0.7) {
  floaters.push({ x, y, text, color, t: 0, life });
}

function onKill(m) {
  kills++;
  const cfg = CONFIG.monsters[m.type];
  const gain = Math.round(cfg.coin * diff().coinMul);
  const before = levelInfo().lv;
  meta.coins += gain;
  runCoins += gain;
  meta.xp += cfg.xp;
  addFloater(m.x, m.y - 40, `+${gain}`, '#FAC775');
  const after = levelInfo().lv;
  if (after > before) addFloater(player.x, player.y - 60, `升级 Lv.${after}！`, '#9FE1CB', 1.3);
}

// ---------- 更新 ----------
function update(dt) {
  playTime += dt;

  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
    player.x += input.moveX * stats.speed * dt;
    player.y += input.moveY * stats.speed * dt;
    const r = CONFIG.player.radius;
    player.x = Math.max(r, Math.min(W - r, player.x));
    player.y = Math.max(r + 20, Math.min(H - r, player.y));
    player.phase = (player.phase + dt * 2.2) % 1;
  }
  player.fireCd -= dt;
  player.muzzle -= dt;
  player.invuln -= dt;

  // 自动锁定最近敌人 + 自动开火（武器决定弹道：散射/穿透/射速）
  const target = nearestMonster();
  if (target) {
    const gx = player.x, gy = player.y - 12;
    const d = Math.hypot(target.x - gx, target.y - gy) || 1;
    player.aim.x = (target.x - gx) / d;
    player.aim.y = (target.y - gy) / d;
    const wpn = stats.weapon;
    if (player.fireCd <= 0 && bullets.length < CONFIG.bullet.max) {
      const base = Math.atan2(player.aim.y, player.aim.x);
      const tip = gunTip(wpn.visual);
      for (let i = 0; i < wpn.pellets; i++) {
        let ang = base;
        if (wpn.pellets > 1) ang += wpn.spread * (i / (wpn.pellets - 1) - 0.5) * 2;
        else if (wpn.spread > 0) ang += (Math.random() - 0.5) * 2 * wpn.spread;
        bullets.push({
          x: gx + Math.cos(base) * tip, y: gy + Math.sin(base) * tip,
          vx: Math.cos(ang) * wpn.speed, vy: Math.sin(ang) * wpn.speed,
          r: wpn.bulletR, dmg: wpn.damage, pierce: wpn.pierce, hit: [],
        });
      }
      player.fireCd = 1 / wpn.fireRate;
      player.muzzle = 0.07;
    }
  } else if (player.moving) {
    player.aim.x = input.moveX;
    player.aim.y = input.moveY;
  }

  // 子弹（支持穿透）
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) { bullets.splice(i, 1); continue; }
    for (const m of monsters) {
      if (m.dying || b.hit.includes(m)) continue;
      if (Math.hypot(b.x - m.x, b.y - m.y) < b.r + CONFIG.monsters[m.type].radius) {
        m.hp -= b.dmg;
        const kb = CONFIG.bullet.knockback, sp = Math.hypot(b.vx, b.vy);
        m.x += b.vx / sp * kb;
        m.y += b.vy / sp * kb;
        if (m.hp <= 0) { m.dying = 0.0001; m.animT = 0; onKill(m); }
        if (b.pierce > 0) { b.pierce--; b.hit.push(m); }
        else bullets.splice(i, 1);
        break;
      }
    }
  }

  // 刷怪（难度影响节奏）
  const s = stage();
  spawnTimer -= dt;
  const alive = monsters.filter(m => !m.dying).length;
  if (spawnTimer <= 0 && alive < monsterCap(s)) {
    spawnMonster(s);
    spawnTimer = s.interval * diff().spawnMul;
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
      m.idle = true;
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

  // 飘字
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    f.y -= 32 * dt;
    if (f.t >= f.life) floaters.splice(i, 1);
  }
}

function gameOver() {
  state = 'gameover';
  saveMeta();
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
  let a, t, key;
  if (m.dying) { key = 'death'; a = cfg.anims.death; t = m.dying; }
  else if (m.state === 'attack') { key = 'attack'; a = cfg.anims.attack; t = m.animT; }
  else if (m.idle && cfg.anims.idle) { key = 'idle'; a = cfg.anims.idle; t = m.animT; }
  else { key = 'move'; a = cfg.anims.move; t = m.animT; }

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
  ctx.translate(m.x, m.y - cfg.bodyOffsetY * cfg.scale);
  if (m.flip) ctx.scale(-1, 1);
  ctx.drawImage(images[m.type][key], f * 150, 0, 150, 150, -size / 2, -size / 2, size, size);
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

function drawCoin(x, y, r) {
  ctx.fillStyle = '#FAC775';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#BA7517';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHUD() {
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(20, 16, 200, 14);
  ctx.fillStyle = C.hpBar;
  ctx.fillRect(20, 16, 200 * player.hp / stats.maxHp, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 16, 200, 14);
  ctx.fillStyle = C.hud;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${player.hp}/${stats.maxHp}`, 24, 27);

  // 金币 + 等级 + 经验条
  const li = levelInfo();
  drawCoin(28, 45, 7);
  ctx.fillStyle = '#FAC775';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, 40, 50);
  ctx.fillStyle = C.hud;
  ctx.fillText(`Lv.${li.lv}`, 110, 50);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(150, 41, 70, 8);
  ctx.fillStyle = '#9FE1CB';
  ctx.fillRect(150, 41, 70 * li.cur / li.need, 8);

  ctx.textAlign = 'center';
  ctx.font = '20px -apple-system, sans-serif';
  ctx.fillStyle = C.hud;
  ctx.fillText(fmtTime(playTime), W / 2, 32);

  ctx.textAlign = 'right';
  ctx.font = '16px -apple-system, sans-serif';
  ctx.fillText(`击杀 ${kills}`, W - (input.touchSeen ? 70 : 20), 30);
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText(stats.weapon.name, W - (input.touchSeen ? 70 : 20), 48);

  if (input.touchSeen) drawPauseBtn();
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
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

function btn(r, text, style, textStyle, fontSize = 18) {
  ctx.fillStyle = style;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = textStyle;
  ctx.font = `${fontSize}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + fontSize * 0.36);
}

// ---------- 标题界面 ----------
const DIFF_BTNS = ['easy', 'normal', 'hard'].map((id, i) => ({ id, x: W / 2 - 166 + i * 116, y: H / 2 - 28, w: 100, h: 40 }));
const START_BTN = { x: W / 2 - 110, y: H / 2 + 36, w: 220, h: 50 };
const SHOP_BTN = { x: W / 2 - 110, y: H / 2 + 100, w: 220, h: 44 };

function drawTitle() {
  ctx.fillStyle = 'rgba(10,10,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'center';
  ctx.font = '40px -apple-system, sans-serif';
  ctx.fillText('火柴人：怪物围城', W / 2, H / 2 - 130);
  ctx.font = '15px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText('自动锁定最近的怪物射击，你只管走位活下去', W / 2, H / 2 - 90);
  ctx.fillText('移动：方向键 / WASD（手机：任意位置拖动摇杆）　暂停：P', W / 2, H / 2 - 66);

  for (const b of DIFF_BTNS) {
    const sel = meta.difficulty === b.id;
    btn(b, CONFIG.difficulties[b.id].name, sel ? 'rgba(239,159,39,0.9)' : 'rgba(255,255,255,0.1)', sel ? '#2a1c05' : C.hud, 17);
  }
  btn(START_BTN, '开始游戏', 'rgba(239,159,39,0.9)', '#2a1c05', 20);
  btn(SHOP_BTN, '商城', 'rgba(255,255,255,0.14)', C.hud, 18);

  const li = levelInfo();
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.textAlign = 'center';
  drawCoin(W / 2 - 130, H - 32, 7);
  ctx.fillStyle = '#FAC775';
  ctx.textAlign = 'left';
  ctx.fillText(`${meta.coins}`, W / 2 - 118, H - 27);
  ctx.fillStyle = C.hudDim;
  ctx.fillText(`Lv.${li.lv}（${li.cur}/${li.need}）　武器：${CONFIG.weapons[meta.weapon].name}`, W / 2 - 60, H - 27);
}

// ---------- 商城界面 ----------
const SHOP_BACK = { x: W - 130, y: 28, w: 90, h: 38 };
const SHOP_ROWS = [];
{
  const wIds = Object.keys(CONFIG.weapons);
  const eIds = Object.keys(CONFIG.equipment);
  wIds.forEach((id, i) => SHOP_ROWS.push({ kind: 'weapon', id, x: 40, y: 116 + i * 70, w: 420, h: 62 }));
  eIds.forEach((id, i) => SHOP_ROWS.push({ kind: 'equip', id, x: 500, y: 116 + i * 70, w: 420, h: 62 }));
}

function drawShop() {
  ctx.fillStyle = 'rgba(10,10,24,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'left';
  ctx.font = '28px -apple-system, sans-serif';
  ctx.fillText('商城', 40, 56);

  const li = levelInfo();
  drawCoin(130, 48, 8);
  ctx.fillStyle = '#FAC775';
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, 144, 54);
  ctx.fillStyle = C.hud;
  ctx.fillText(`Lv.${li.lv}`, 220, 54);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(270, 42, 90, 10);
  ctx.fillStyle = '#9FE1CB';
  ctx.fillRect(270, 42, 90 * li.cur / li.need, 10);

  btn(SHOP_BACK, '返回', 'rgba(255,255,255,0.14)', C.hud, 16);

  ctx.font = '15px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.textAlign = 'left';
  ctx.fillText('武器（点击购买/装备）', 40, 102);
  ctx.fillText('装备（购买后自动生效）', 500, 102);

  for (const r of SHOP_ROWS) {
    const item = r.kind === 'weapon' ? CONFIG.weapons[r.id] : CONFIG.equipment[r.id];
    const ownedList = r.kind === 'weapon' ? meta.owned : meta.ownedEquip;
    const owned = ownedList.includes(r.id);
    const locked = li.lv < item.level;
    const equipped = r.kind === 'weapon' && meta.weapon === r.id;

    ctx.fillStyle = equipped ? 'rgba(159,225,203,0.12)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (equipped) {
      ctx.strokeStyle = '#9FE1CB';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = locked ? C.hudDim : C.hud;
    ctx.font = '16px -apple-system, sans-serif';
    ctx.fillText(item.name, r.x + 16, r.y + 26);
    ctx.fillStyle = C.hudDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(item.desc, r.x + 16, r.y + 46);

    ctx.textAlign = 'right';
    ctx.font = '14px -apple-system, sans-serif';
    if (locked) {
      ctx.fillStyle = C.hudDim;
      ctx.fillText(`Lv.${item.level} 解锁`, r.x + r.w - 16, r.y + 38);
    } else if (!owned) {
      drawCoin(r.x + r.w - 16 - ctx.measureText(`${item.price}`).width - 14, r.y + 34, 6);
      ctx.fillStyle = meta.coins >= item.price ? '#FAC775' : '#E24B4A';
      ctx.fillText(`${item.price}`, r.x + r.w - 16, r.y + 39);
    } else if (equipped) {
      ctx.fillStyle = '#9FE1CB';
      ctx.fillText('使用中', r.x + r.w - 16, r.y + 38);
    } else if (r.kind === 'weapon') {
      ctx.fillStyle = C.hud;
      ctx.fillText('点击装备', r.x + r.w - 16, r.y + 38);
    } else {
      ctx.fillStyle = '#9FE1CB';
      ctx.fillText('已生效', r.x + r.w - 16, r.y + 38);
    }
  }
}

// ---------- 结算界面 ----------
const RESTART_BTN = { x: W / 2 - 230, y: H / 2 + 80, w: 220, h: 50 };
const GO_SHOP_BTN = { x: W / 2 + 10, y: H / 2 + 80, w: 220, h: 50 };

function drawGameover() {
  const best = loadBest();
  ctx.fillStyle = 'rgba(10,10,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'center';
  ctx.font = '40px -apple-system, sans-serif';
  ctx.fillText('游戏结束', W / 2, H / 2 - 100);
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText(`存活 ${fmtTime(playTime)}　击杀 ${kills}`, W / 2, H / 2 - 52);
  ctx.fillStyle = '#FAC775';
  ctx.fillText(`本局金币 +${runCoins}　总金币 ${meta.coins}`, W / 2, H / 2 - 22);
  ctx.fillStyle = C.hudDim;
  if (best) ctx.fillText(`最佳纪录：存活 ${fmtTime(best.time)}　击杀 ${best.kills}`, W / 2, H / 2 + 8);
  ctx.fillText('按 R 重开 · 按 B 进商城', W / 2, H / 2 + 38);
  btn(RESTART_BTN, '再来一局', 'rgba(239,159,39,0.9)', '#2a1c05', 20);
  btn(GO_SHOP_BTN, '商城', 'rgba(255,255,255,0.14)', C.hud, 20);
}

function draw() {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  drawArena();
  if (state === 'title') { drawTitle(); return; }
  if (state === 'shop') { drawShop(); return; }

  monsters.forEach(drawMonster);
  eprojs.forEach(drawEproj);
  bullets.forEach(b => {
    ctx.fillStyle = C.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
  drawStickman(ctx, player.x, player.y, player);
  drawFloaters();
  drawHUD();
  drawTouchControls();

  if (state === 'paused') {
    drawOverlayDim('已暂停', '按 P 或点击右上角继续');
    drawPauseBtn();
  } else if (state === 'gameover') {
    drawGameover();
  }
}

function drawOverlayDim(title, line) {
  ctx.fillStyle = 'rgba(10,10,24,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'center';
  ctx.font = '40px -apple-system, sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 20);
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText(line, W / 2, H / 2 + 20);
}

// ---------- UI 事件路由 ----------
function startGame() { state = 'playing'; reset(); }

function handleUI() {
  for (const code of input.keyPresses) {
    if (state === 'title') {
      if (code === 'Digit1') { meta.difficulty = 'easy'; saveMeta(); }
      else if (code === 'Digit2') { meta.difficulty = 'normal'; saveMeta(); }
      else if (code === 'Digit3') { meta.difficulty = 'hard'; saveMeta(); }
      else if (code === 'KeyB') state = 'shop';
      else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') startGame();
    } else if (state === 'shop') {
      if (code === 'Escape' || code === 'KeyB') state = 'title';
    } else if (state === 'gameover') {
      if (code === 'KeyR') startGame();
      else if (code === 'KeyB') state = 'shop';
    } else if (code === 'KeyP' && (state === 'playing' || state === 'paused')) {
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
  for (const p of input.taps) {
    if (state === 'title') {
      for (const b of DIFF_BTNS) if (inRect(p, b)) { meta.difficulty = b.id; saveMeta(); }
      if (inRect(p, START_BTN)) startGame();
      else if (inRect(p, SHOP_BTN)) state = 'shop';
    } else if (state === 'shop') {
      if (inRect(p, SHOP_BACK)) state = 'title';
      for (const r of SHOP_ROWS) if (inRect(p, r)) shopAction(r.kind, r.id);
    } else if (state === 'gameover') {
      if (inRect(p, RESTART_BTN)) startGame();
      else if (inRect(p, GO_SHOP_BTN)) state = 'shop';
    } else if ((state === 'playing' || state === 'paused') && input.touchSeen && inRect(p, PAUSE_BTN)) {
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
