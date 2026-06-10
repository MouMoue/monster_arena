// 游戏主逻辑 —— 状态机: title / shop / playing / paused / gameover
// 大地图世界坐标 + 相机跟随；实体按 y 排序绘制（2.5D 深度感）
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const { W, H } = CONFIG;
const WORLD = CONFIG.world;
const C = CONFIG.colors;
loadMeta();

// ---------- 视口适配 ----------
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
const pending = [];
function loadImg(src) {
  const img = new Image();
  img.src = src;
  pending.push(img);
  return img;
}
const images = {};
for (const [type, cfg] of Object.entries(CONFIG.monsters)) {
  images[type] = {};
  for (const [anim, a] of Object.entries(cfg.anims)) images[type][anim] = loadImg('assets/monsters/' + a.file);
  if (cfg.projectile) images[type].projectile = loadImg('assets/monsters/' + cfg.projectile.file);
}
const petImgs = {}, petIcons = {}, effectImgs = {};
for (const [id, p] of Object.entries(CONFIG.pets)) {
  petImgs[id] = loadImg('assets/pets/' + p.sheet);
  petIcons[id] = loadImg('assets/pets/icons/' + p.icon);
}
for (const [id, e] of Object.entries(CONFIG.effects)) effectImgs[id] = loadImg('assets/effects/' + e.file);
// ---------- Tiny Swords 地图素材 ----------
const TSW = 'assets/tiny_swords/';
const tswTilemap = loadImg(TSW + 'terrain/ground/Tilemap_Flat.png');
const tswWater = loadImg(TSW + 'terrain/water/Water.png');
const tswFoam = loadImg(TSW + 'terrain/water/foam/Foam.png');
const tswTree = loadImg(TSW + 'resources/trees/Tree.png');
const tswRocks = [loadImg(TSW + 'terrain/water/rocks/Rocks_01.png'), loadImg(TSW + 'terrain/water/rocks/Rocks_02.png')];
const tswCastle = loadImg(TSW + 'factions/knights/buildings/castle/Castle_Blue.png');
const tswHouse = loadImg(TSW + 'factions/knights/buildings/house/House_Blue.png');
const tswTower = loadImg(TSW + 'factions/knights/buildings/tower/Tower_Blue.png');
const tswSheep = loadImg(TSW + 'resources/sheep/HappySheep_Idle.png');
const tswScarecrow = loadImg(TSW + 'deco/18.png');
const GRASS_DECOS = ['01', '02', '03', '07', '08', '09', '10', '16', '17'];
const SAND_DECOS = ['04', '05', '06', '11', '12', '13', '14', '15'];
const tswDecos = {};
[...GRASS_DECOS, ...SAND_DECOS].forEach(n => { tswDecos[n] = loadImg(TSW + 'deco/' + n + '.png'); });

// ---------- 地图生成（固定种子，水→沙→草双层 + 装饰与地标） ----------
const MAP = (() => {
  const t = WORLD.tile;
  const cols = WORLD.w / t, rows = WORLD.h / t;
  const sand = new Uint8Array(cols * rows);
  const grass = new Uint8Array(cols * rows);
  let seed = 20260610;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  function blob(mask, cx, cy, rw, rh) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rw, dy = (y - cy) / rh;
        if (dx * dx + dy * dy < 1) mask[y * cols + x] = 1;
      }
    }
  }
  // 主岛 + 卫星沙洲
  blob(sand, cols * 0.5, rows * 0.5, cols * 0.42, rows * 0.40);
  blob(sand, cols * 0.16, rows * 0.26, 8, 6);
  blob(sand, cols * 0.85, rows * 0.72, 8, 6);
  blob(sand, cols * 0.82, rows * 0.20, 6, 5);
  blob(sand, cols * 0.18, rows * 0.80, 6, 5);
  // 草地大陆 + 草甸（严格在沙地内，留出沙滩边）
  blob(grass, cols * 0.5, rows * 0.5, cols * 0.33, rows * 0.31);
  blob(grass, cols * 0.17, rows * 0.27, 5, 4);
  blob(grass, cols * 0.84, rows * 0.71, 5, 4);
  for (let i = 0; i < grass.length; i++) grass[i] &= sand[i];

  const at = (mask, x, y) => (x >= 0 && y >= 0 && x < cols && y < rows ? mask[y * cols + x] : 0);

  // 海岸泡沫：沙地且四邻有水
  const foamTiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (sand[y * cols + x] && (!at(sand, x - 1, y) || !at(sand, x + 1, y) || !at(sand, x, y - 1) || !at(sand, x, y + 1))) {
        foamTiles.push([x * t, y * t]);
      }
    }
  }

  // 在指定地表随机取一个世界坐标点
  function spot(mask, other) {
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(rnd() * cols), y = Math.floor(rnd() * rows);
      if (mask[y * cols + x] && (!other || !other[y * cols + x])) return [x * t + t / 2, y * t + t / 2];
    }
    return [WORLD.w / 2, WORLD.h / 2];
  }

  const flats = [];          // 平面小装饰（蘑菇/石头/灌木/骨头）
  for (let i = 0; i < 46; i++) {
    const onGrass = rnd() < 0.6;
    const [x, y] = onGrass ? spot(grass) : spot(sand, grass);
    const pool = onGrass ? GRASS_DECOS : SAND_DECOS;
    flats.push({ n: pool[Math.floor(rnd() * pool.length)], x, y });
  }

  const trees = [];          // 动态树（y 排序）
  for (let i = 0; i < 18; i++) {
    const [x, y] = spot(grass);
    if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 260) continue;   // 出生点附近留空
    trees.push({ x, y, ph: rnd() });
  }

  const buildings = [];      // 地标建筑（y 排序）
  const tryPlace = (kind, n) => {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 40; k++) {
        const [x, y] = spot(grass);
        if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 380) continue;
        if (buildings.every(b => Math.hypot(b.x - x, b.y - y) > 420) && trees.every(tr => Math.hypot(tr.x - x, tr.y - y) > 150)) {
          buildings.push({ kind, x, y });
          break;
        }
      }
    }
  };
  tryPlace('castle', 1);
  tryPlace('house', 3);
  tryPlace('tower', 2);

  const sheep = [];          // 闲逛的羊（待机动画）
  for (let i = 0; i < 4; i++) {
    const [x, y] = spot(grass);
    sheep.push({ x, y, ph: rnd() });
  }
  const scarecrows = [];
  for (let i = 0; i < 2; i++) {
    const [x, y] = spot(grass);
    scarecrows.push({ x, y });
  }

  const waterRocks = [];     // 海面礁石（动画）
  for (let i = 0; i < 7; i++) {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(rnd() * cols), y = Math.floor(rnd() * rows);
      if (!sand[y * cols + x]) {
        const wx = x * t + t / 2, wy = y * t + t / 2;
        if (foamTiles.every(f => Math.hypot(f[0] - wx, f[1] - wy) > 120)) { waterRocks.push({ x: wx, y: wy, v: i % 2, ph: rnd() }); break; }
      }
    }
  }

  const walkable = (x, y) => at(sand, Math.floor(x / t), Math.floor(y / t)) === 1;
  return { cols, rows, sand, grass, at, foamTiles, flats, trees, buildings, sheep, scarecrows, waterRocks, walkable };
})();

// ---------- 游戏状态 ----------
let state = 'title';
let player, bullets, monsters, eprojs, pets, effects, floaters;
let playTime, kills, runCoins, spawnTimer, stats, worldT = 0;
const cam = { x: 0, y: 0 };

function diff() { return CONFIG.difficulties[meta.difficulty]; }

function reset() {
  stats = effectiveStats();
  player = {
    x: WORLD.w / 2, y: WORLD.h / 2,
    hp: stats.maxHp,
    aim: { x: 1, y: 0 },
    moving: false, phase: 0,
    fireCd: 0, muzzle: 0, invuln: 0,
    weaponVisual: stats.weapon.visual,
  };
  bullets = [];
  monsters = [];
  eprojs = [];
  effects = [];
  floaters = [];
  pets = meta.ownedPets.slice(0, CONFIG.petSlots.length).map((id, i) => ({
    id, slot: i,
    x: player.x + CONFIG.petSlots[i][0], y: player.y + CONFIG.petSlots[i][1],
    state: 'idle', animT: Math.random(), atkCd: 0.5 + i * 0.4, casted: false, target: null, flip: false,
  }));
  playTime = 0;
  kills = 0;
  runCoins = 0;
  spawnTimer = 0.5;
  updateCam();
}

function updateCam() {
  cam.x = Math.max(0, Math.min(WORLD.w - W, player.x - W / 2));
  cam.y = Math.max(0, Math.min(WORLD.h - H, player.y - H / 2));
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
  const [d0, d1] = CONFIG.spawnDist;
  for (let k = 0; k < 12; k++) {     // 在主角周围环形找一块可行走的陆地
    const ang = Math.random() * Math.PI * 2;
    const dist = d0 + Math.random() * (d1 - d0);
    const x = player.x + Math.cos(ang) * dist;
    const y = player.y + Math.sin(ang) * dist;
    if (x < 40 || y < 40 || x > WORLD.w - 40 || y > WORLD.h - 40 || !MAP.walkable(x, y)) continue;
    const type = pickType(s.weights);
    const hp = Math.round(CONFIG.monsters[type].hp * hpMul(s));
    monsters.push({
      type, x, y, hp, maxHp: hp,
      state: 'move', animT: Math.random(), atkCd: 0, atkAnim: 'attack', hitDone: false,
      staggerCd: 0, slowT: 0, flip: false, dying: 0,
    });
    return;
  }
}

function nearestMonster(fx, fy, range) {
  let best = null, bd = range;
  for (const m of monsters) {
    if (m.dying) continue;
    const d = Math.hypot(m.x - fx, m.y - fy);
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

function damageMonster(m, dmg, kbx, kby) {
  m.hp -= dmg;
  if (kbx || kby) {
    const k = CONFIG.monsters[m.type].kbMul;
    const kx = m.x + kbx * k, ky = m.y + kby * k;
    if (MAP.walkable(kx, ky)) { m.x = kx; m.y = ky; }
  }
  if (m.hp <= 0) {
    m.dying = 0.0001;
    m.animT = 0;
    onKill(m);
    return;
  }
  // 受击僵直（带冷却，攻击动作不被打断）
  if (m.staggerCd <= 0 && m.state !== 'attack' && CONFIG.monsters[m.type].anims.hit) {
    m.state = 'hit';
    m.animT = 0;
    m.staggerCd = CONFIG.stagger;
  }
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
  worldT += dt;

  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
    // 沿可行走地表滑动（海岸线挡路，水面不可走）
    const nx = player.x + input.moveX * stats.speed * dt;
    const ny = player.y + input.moveY * stats.speed * dt;
    if (MAP.walkable(nx, player.y)) player.x = nx;
    if (MAP.walkable(player.x, ny)) player.y = ny;
    player.phase = (player.phase + dt * 2.2) % 1;
  }
  updateCam();
  player.fireCd -= dt;
  player.muzzle -= dt;
  player.invuln -= dt;

  // 自动锁定（520px 内）+ 自动开火
  const target = nearestMonster(player.x, player.y - 12, 520);
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

  // 子弹（穿透支持；远离主角即销毁）
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.hypot(b.x - player.x, b.y - player.y) > 800) { bullets.splice(i, 1); continue; }
    for (const m of monsters) {
      if (m.dying || b.hit.includes(m)) continue;
      if (Math.hypot(b.x - m.x, b.y - m.y) < b.r + CONFIG.monsters[m.type].radius) {
        const sp = Math.hypot(b.vx, b.vy), kb = CONFIG.bullet.knockback;
        damageMonster(m, b.dmg, b.vx / sp * kb, b.vy / sp * kb);
        if (b.pierce > 0) { b.pierce--; b.hit.push(m); }
        else bullets.splice(i, 1);
        break;
      }
    }
  }

  // 精灵：跟随阵位 + 自动施放元素攻击
  const ps = CONFIG.petSheet;
  for (const pet of pets) {
    const cfg = CONFIG.pets[pet.id];
    pet.animT += dt;
    pet.atkCd -= dt;
    const tx = player.x + CONFIG.petSlots[pet.slot][0];
    const ty = player.y + CONFIG.petSlots[pet.slot][1];
    const dx = tx - pet.x, dy = ty - pet.y;
    const d = Math.hypot(dx, dy);
    if (pet.state !== 'attack') {
      if (d > 6) {
        const step = Math.min(1, 6 * dt);
        pet.x += dx * step;
        pet.y += dy * step;
        if (Math.abs(dx) > 3) pet.flip = dx < 0;
      }
      if (pet.atkCd <= 0) {
        const t = nearestMonster(pet.x, pet.y, cfg.range);
        if (t) {
          pet.state = 'attack';
          pet.animT = 0;
          pet.casted = false;
          pet.target = t;
          pet.flip = t.x < pet.x;
        }
      }
    } else {
      const frame = Math.floor(pet.animT * ps.attackFps);
      if (!pet.casted && frame >= ps.castFrame) {
        pet.casted = true;
        const t = pet.target;
        if (t && !t.dying) {
          effects.push({ kind: cfg.effect, target: t, x: t.x, y: t.y - 20, animT: 0, dmg: cfg.damage, slow: cfg.slow || 0, done: false });
        }
      }
      if (frame >= ps.cols) { pet.state = 'idle'; pet.animT = 0; pet.atkCd = cfg.cooldown; pet.target = null; }
    }
  }

  // 精灵攻击特效：跟随目标，dmgFrame 帧结算
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const cfg = CONFIG.effects[e.kind];
    e.animT += dt;
    if (e.target && !e.target.dying) { e.x = e.target.x; e.y = e.target.y - 20; }
    const frame = Math.floor(e.animT * cfg.fps);
    if (!e.done && frame >= cfg.dmgFrame) {
      e.done = true;
      if (e.target && !e.target.dying) {
        damageMonster(e.target, e.dmg, 0, 0);
        if (e.slow && !e.target.dying) e.target.slowT = e.slow;
      }
    }
    if (frame >= cfg.frames) effects.splice(i, 1);
  }

  // 刷怪
  const s = stage();
  spawnTimer -= dt;
  const alive = monsters.filter(m => !m.dying).length;
  if (spawnTimer <= 0 && alive < monsterCap(s)) {
    spawnMonster(s);
    spawnTimer = s.interval * diff().spawnMul;
  }

  // 怪物状态机: move 追近 / idle 等冷却 / hit 受击僵直 / attack 出手(hitFrame 结算) / dying
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    const cfg = CONFIG.monsters[m.type];
    m.animT += dt;
    m.staggerCd -= dt;
    m.slowT -= dt;
    if (m.dying) {
      m.dying += dt;
      if (m.dying > cfg.anims.death.frames / cfg.anims.death.fps + 0.3) monsters.splice(i, 1);
      continue;
    }
    const dx = player.x - m.x, dy = player.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    m.atkCd -= dt;

    if (m.state === 'hit') {
      const a = cfg.anims.hit;
      if (m.animT >= a.frames / a.fps) { m.state = 'move'; m.animT = 0; }
      continue;
    }

    if (m.state === 'attack') {
      const a = cfg.anims[m.atkAnim];
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

    m.flip = dx < 0;
    const inRange = d < cfg.attackRange;
    if (inRange && m.atkCd <= 0) {
      m.state = 'attack';
      m.animT = 0;
      m.hitDone = false;
      m.atkAnim = cfg.attacks[Math.floor(Math.random() * cfg.attacks.length)];
    } else if (!inRange) {
      const spd = cfg.speed * (m.slowT > 0 ? 0.5 : 1);
      const nx = m.x + dx / d * spd * dt, ny = m.y + dy / d * spd * dt;
      if (MAP.walkable(nx, m.y)) m.x = nx;
      if (MAP.walkable(m.x, ny)) m.y = ny;
      m.idle = false;
    } else {
      m.idle = true;          // 射程内等攻击冷却：原地待机面向主角
    }
  }

  // 敌方投射物
  for (let i = eprojs.length - 1; i >= 0; i--) {
    const e = eprojs[i];
    const p = CONFIG.monsters[e.type].projectile;
    e.animT += dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (Math.hypot(e.x - player.x, e.y - player.y) > 800) { eprojs.splice(i, 1); continue; }
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

// ---------- 绘制：世界 ----------
// 自动拼接：根据四邻接选 3x3 块/单行/单列/孤立块；baseCol 0=草地 5=沙地
function autotileSrc(mask, tx, ty, baseCol) {
  const L = MAP.at(mask, tx - 1, ty), R = MAP.at(mask, tx + 1, ty);
  const U = MAP.at(mask, tx, ty - 1), D = MAP.at(mask, tx, ty + 1);
  const cx = L && R ? 1 : R ? 0 : L ? 2 : 3;
  const cy = U && D ? 1 : D ? 0 : U ? 2 : 3;
  if (cx === 3 && cy === 3) return [(baseCol + 3) * 64, 3 * 64];
  if (cx === 3) return [(baseCol + 3) * 64, cy * 64];
  if (cy === 3) return [(baseCol + cx) * 64, 3 * 64];
  return [(baseCol + cx) * 64, cy * 64];
}

function inView(x, y, m) {
  return x > cam.x - m && x < cam.x + W + m && y > cam.y - m && y < cam.y + H + m;
}

function drawGround() {
  const t = WORLD.tile;
  const tx0 = Math.max(0, Math.floor(cam.x / t)), tx1 = Math.min(MAP.cols - 1, Math.floor((cam.x + W) / t));
  const ty0 = Math.max(0, Math.floor(cam.y / t)), ty1 = Math.min(MAP.rows - 1, Math.floor((cam.y + H) / t));

  // 1) 水面铺底（含世界外）
  const wx0 = Math.floor((cam.x - t) / t) * t, wy0 = Math.floor((cam.y - t) / t) * t;
  for (let x = wx0; x < cam.x + W + t; x += t) {
    for (let y = wy0; y < cam.y + H + t; y += t) ctx.drawImage(tswWater, x, y, t, t);
  }
  // 2) 海岸泡沫（动画，垫在沙滩下）
  const ff = Math.floor(worldT * 8) % 8;
  for (const [fx, fy] of MAP.foamTiles) {
    if (!inView(fx, fy, 192)) continue;
    ctx.drawImage(tswFoam, ff * 192, 0, 192, 192, fx - 64, fy - 64, 192, 192);
  }
  // 3) 海面礁石（动画）
  const rf = Math.floor(worldT * 6) % 8;
  for (const r of MAP.waterRocks) {
    if (!inView(r.x, r.y, 128)) continue;
    ctx.drawImage(tswRocks[r.v], rf * 128, 0, 128, 128, r.x - 64, r.y - 64, 128, 128);
  }
  // 4) 沙地层 + 5) 草地层（自动拼接）
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (MAP.sand[ty * MAP.cols + tx]) {
        const [sx, sy] = autotileSrc(MAP.sand, tx, ty, 5);
        ctx.drawImage(tswTilemap, sx, sy, 64, 64, tx * t, ty * t, t, t);
      }
    }
  }
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (MAP.grass[ty * MAP.cols + tx]) {
        const [sx, sy] = autotileSrc(MAP.grass, tx, ty, 0);
        ctx.drawImage(tswTilemap, sx, sy, 64, 64, tx * t, ty * t, t, t);
      }
    }
  }
  // 6) 平面小装饰
  for (const f of MAP.flats) {
    if (!inView(f.x, f.y, 80)) continue;
    const img = tswDecos[f.n];
    ctx.drawImage(img, f.x - img.width / 2, f.y - img.height / 2);
  }
}

// 场景实体（参与 y 排序）：树 / 建筑 / 羊 / 稻草人
function drawTree(tr) {
  const f = Math.floor((worldT * 6 + tr.ph * 4) % 4);
  ctx.drawImage(tswTree, f * 192, 0, 192, 192, tr.x - 96, tr.y - 160, 192, 192);
}
function drawBuilding(b) {
  if (b.kind === 'castle') ctx.drawImage(tswCastle, b.x - 160, b.y - 230);
  else if (b.kind === 'house') ctx.drawImage(tswHouse, b.x - 64, b.y - 170);
  else ctx.drawImage(tswTower, b.x - 64, b.y - 230);
}
function drawSheep(s) {
  const f = Math.floor((worldT * 6 + s.ph * 8) % 8);
  ctx.drawImage(tswSheep, f * 128, 0, 128, 128, s.x - 64, s.y - 90, 128, 128);
}
function drawScarecrow(s) {
  ctx.drawImage(tswScarecrow, s.x - 96, s.y - 165);
}

function shadow(x, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawMonster(m) {
  const cfg = CONFIG.monsters[m.type];
  const size = 150 * cfg.scale;
  let key;
  if (m.dying) key = 'death';
  else if (m.state === 'attack') key = m.atkAnim;
  else if (m.state === 'hit') key = 'hit';
  else if (m.idle && cfg.anims.idle) key = 'idle';
  else key = 'move';
  const a = cfg.anims[key];
  const t = m.dying || m.animT;

  let f;
  ctx.save();
  if (m.dying) {
    f = Math.min(Math.floor(t * a.fps), a.frames - 1);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - a.frames / a.fps) / 0.3);
  } else if (m.state === 'attack' || m.state === 'hit') {
    f = Math.min(Math.floor(t * a.fps), a.frames - 1);
  } else {
    f = Math.floor(t * a.fps) % a.frames;
  }
  if (!m.dying) shadow(m.x, m.y + 12, cfg.radius + 6);
  ctx.translate(m.x, m.y - cfg.bodyOffsetY * cfg.scale);
  if (m.flip) ctx.scale(-1, 1);
  if (m.slowT > 0) ctx.filter = 'saturate(0.4) brightness(1.25)';
  ctx.drawImage(images[m.type][key], f * 150, 0, 150, 150, -size / 2, -size / 2, size, size);
  ctx.restore();

  if (!m.dying && m.hp < m.maxHp) {
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(m.x - 18, m.y - 48, 36, 4);
    ctx.fillStyle = C.hpBar;
    ctx.fillRect(m.x - 18, m.y - 48, 36 * m.hp / m.maxHp, 4);
  }
}

function drawPet(pet) {
  const cfg = CONFIG.pets[pet.id];
  const ps = CONFIG.petSheet;
  const size = ps.frame * cfg.scale;
  const row = pet.state === 'attack' ? 1 : 0;
  const fps = pet.state === 'attack' ? ps.attackFps : ps.idleFps;
  let f = Math.floor(pet.animT * fps);
  f = pet.state === 'attack' ? Math.min(f, ps.cols - 1) : f % ps.cols;
  shadow(pet.x, pet.y + size * 0.30, size * 0.22);
  ctx.save();
  ctx.translate(pet.x, pet.y);
  if (pet.flip) ctx.scale(-1, 1);
  ctx.drawImage(petImgs[pet.id], f * ps.frame, row * ps.frame, ps.frame, ps.frame, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawEproj(e) {
  const p = CONFIG.monsters[e.type].projectile;
  const f = Math.floor(e.animT * p.fps) % p.frames;
  const size = p.size * p.scale;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.vx < 0) ctx.scale(-1, 1);
  ctx.drawImage(images[e.type].projectile, f * p.size, 0, p.size, p.size, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawEffect(e) {
  const cfg = CONFIG.effects[e.kind];
  const f = Math.min(Math.floor(e.animT * cfg.fps), cfg.frames - 1);
  const size = cfg.size * cfg.scale;
  ctx.drawImage(effectImgs[e.kind], f * cfg.size, 0, cfg.size, cfg.size, e.x - size / 2, e.y - size / 2, size, size);
}

function drawWorldScene() {
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGround();
  const order = [];
  for (const tr of MAP.trees) if (inView(tr.x, tr.y, 200)) order.push({ y: tr.y, fn: () => drawTree(tr) });
  for (const b of MAP.buildings) if (inView(b.x, b.y, 340)) order.push({ y: b.y, fn: () => drawBuilding(b) });
  for (const s of MAP.sheep) if (inView(s.x, s.y, 130)) order.push({ y: s.y, fn: () => drawSheep(s) });
  for (const s of MAP.scarecrows) if (inView(s.x, s.y, 200)) order.push({ y: s.y, fn: () => drawScarecrow(s) });
  for (const m of monsters) order.push({ y: m.y, fn: () => drawMonster(m) });
  for (const pet of pets) order.push({ y: pet.y, fn: () => drawPet(pet) });
  order.push({ y: player.y, fn: () => { shadow(player.x, player.y + 38, 26); drawStickman(ctx, player.x, player.y, player); } });
  order.sort((a, b) => a.y - b.y);
  for (const o of order) o.fn();
  eprojs.forEach(drawEproj);
  bullets.forEach(b => {
    ctx.fillStyle = C.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
  effects.forEach(drawEffect);
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- 绘制：HUD 与界面 ----------
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
  ctx.fillStyle = 'rgba(10,10,24,0.35)';
  ctx.fillRect(12, 8, 220, 50);
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
  ctx.fillText('大地图生存！自动锁定射击，精灵伴你作战', W / 2, H / 2 - 90);
  ctx.fillText('移动：方向键 / WASD（手机：任意位置拖动摇杆）　暂停：P', W / 2, H / 2 - 66);

  for (const b of DIFF_BTNS) {
    const sel = meta.difficulty === b.id;
    btn(b, CONFIG.difficulties[b.id].name, sel ? 'rgba(239,159,39,0.9)' : 'rgba(255,255,255,0.1)', sel ? '#2a1c05' : C.hud, 17);
  }
  btn(START_BTN, '开始游戏', 'rgba(239,159,39,0.9)', '#2a1c05', 20);
  btn(SHOP_BTN, '商城', 'rgba(255,255,255,0.14)', C.hud, 18);

  const li = levelInfo();
  drawCoin(W / 2 - 150, H - 32, 7);
  ctx.fillStyle = '#FAC775';
  ctx.textAlign = 'left';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, W / 2 - 138, H - 27);
  ctx.fillStyle = C.hudDim;
  ctx.fillText(`Lv.${li.lv}（${li.cur}/${li.need}）　武器：${CONFIG.weapons[meta.weapon].name}　精灵：${meta.ownedPets.length}/3`, W / 2 - 80, H - 27);
}

// ---------- 商城界面（武器 / 装备 / 精灵 三列） ----------
const SHOP_BACK = { x: W - 130, y: 28, w: 90, h: 38 };
const SHOP_ROWS = [];
{
  Object.keys(CONFIG.weapons).forEach((id, i) => SHOP_ROWS.push({ kind: 'weapon', id, x: 30, y: 116 + i * 70, w: 290, h: 62 }));
  Object.keys(CONFIG.equipment).forEach((id, i) => SHOP_ROWS.push({ kind: 'equip', id, x: 336, y: 116 + i * 70, w: 290, h: 62 }));
  Object.keys(CONFIG.pets).forEach((id, i) => SHOP_ROWS.push({ kind: 'pet', id, x: 642, y: 116 + i * 70, w: 288, h: 62 }));
}

function drawShop() {
  ctx.fillStyle = 'rgba(10,10,24,0.88)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.hud;
  ctx.textAlign = 'left';
  ctx.font = '28px -apple-system, sans-serif';
  ctx.fillText('商城', 30, 56);

  const li = levelInfo();
  drawCoin(120, 48, 8);
  ctx.fillStyle = '#FAC775';
  ctx.font = '17px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, 134, 54);
  ctx.fillStyle = C.hud;
  ctx.fillText(`Lv.${li.lv}`, 210, 54);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(260, 42, 90, 10);
  ctx.fillStyle = '#9FE1CB';
  ctx.fillRect(260, 42, 90 * li.cur / li.need, 10);

  btn(SHOP_BACK, '返回', 'rgba(255,255,255,0.14)', C.hud, 16);

  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.textAlign = 'left';
  ctx.fillText('武器（点击购买/装备）', 30, 102);
  ctx.fillText('装备（购买后自动生效）', 336, 102);
  ctx.fillText('精灵（购买后跟随出战）', 642, 102);

  for (const r of SHOP_ROWS) {
    const item = r.kind === 'weapon' ? CONFIG.weapons[r.id] : r.kind === 'pet' ? CONFIG.pets[r.id] : CONFIG.equipment[r.id];
    const ownedList = r.kind === 'weapon' ? meta.owned : r.kind === 'pet' ? meta.ownedPets : meta.ownedEquip;
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

    let textX = r.x + 14;
    if (r.kind === 'pet') {
      const icon = petIcons[r.id];
      ctx.save();
      if (locked) ctx.globalAlpha = 0.4;
      ctx.drawImage(icon, r.x + 10, r.y + 12, 36, 38);
      ctx.restore();
      textX = r.x + 54;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = locked ? C.hudDim : C.hud;
    ctx.font = '15px -apple-system, sans-serif';
    ctx.fillText(item.name, textX, r.y + 25);
    ctx.fillStyle = C.hudDim;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText(item.desc, textX, r.y + 45);

    ctx.textAlign = 'right';
    ctx.font = '13px -apple-system, sans-serif';
    if (locked) {
      ctx.fillStyle = C.hudDim;
      ctx.fillText(`Lv.${item.level} 解锁`, r.x + r.w - 12, r.y + 37);
    } else if (!owned) {
      drawCoin(r.x + r.w - 12 - ctx.measureText(`${item.price}`).width - 12, r.y + 33, 5);
      ctx.fillStyle = meta.coins >= item.price ? '#FAC775' : '#E24B4A';
      ctx.fillText(`${item.price}`, r.x + r.w - 12, r.y + 37);
    } else if (equipped) {
      ctx.fillStyle = '#9FE1CB';
      ctx.fillText('使用中', r.x + r.w - 12, r.y + 37);
    } else if (r.kind === 'weapon') {
      ctx.fillStyle = C.hud;
      ctx.fillText('点击装备', r.x + r.w - 12, r.y + 37);
    } else {
      ctx.fillStyle = '#9FE1CB';
      ctx.fillText(r.kind === 'pet' ? '已跟随' : '已生效', r.x + r.w - 12, r.y + 37);
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
  drawWorldScene();
  if (state === 'title') { drawTitle(); return; }
  if (state === 'shop') { drawShop(); return; }

  drawHUD();
  drawTouchControls();

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(10,10,24,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.hud;
    ctx.textAlign = 'center';
    ctx.font = '40px -apple-system, sans-serif';
    ctx.fillText('已暂停', W / 2, H / 2 - 20);
    ctx.font = '17px -apple-system, sans-serif';
    ctx.fillStyle = C.hudDim;
    ctx.fillText('按 P 或点击右上角继续', W / 2, H / 2 + 20);
    drawPauseBtn();
  } else if (state === 'gameover') {
    drawGameover();
  }
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
  else worldT += dt;     // 标题/商城界面水面也保持流动
  draw();
  input.flush();
  requestAnimationFrame(loop);
}

let loadedImgs = 0;
pending.forEach(img => {
  img.onload = () => { if (++loadedImgs === pending.length) { reset(); requestAnimationFrame(loop); } };
});
