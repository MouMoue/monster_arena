// 游戏主逻辑 —— 状态机: title / shop / playing / paused / gameover
// 无边界世界 + 相机跟随；实体按 y 排序（2.5D）；Tiny Swords 全素材分配见各文件注释
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const { W, H } = CONFIG;
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

// ---------- 游戏状态 ----------
let state = 'title';
let player, bullets, monsters, eprojs, pets, effects, floaters;
let playTime, kills, runCoins, spawnTimer, stats, worldT = 0;
let shopTab = 'weapon';
let lastTap = null;
const cam = { x: 0, y: 0 };

function diff() { return CONFIG.difficulties[meta.difficulty]; }

function reset() {
  MAPGEN.reset(Math.floor(Math.random() * 2147483647));   // 每局全新世界
  stats = effectiveStats();
  const [sx, sy] = MAPGEN.findSpawn();
  player = {
    x: sx, y: sy,
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
  unitsReset();
  updateCam();
}

function updateCam() {
  cam.x = player.x - W / 2;
  cam.y = player.y - H / 2;
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
function tierNow() {
  let t = 0;
  for (let i = 0; i < CONFIG.tierUnlock.length; i++) if (playTime >= CONFIG.tierUnlock[i]) t = i;
  return t;
}

function pickType(weights) {
  let r = Math.random(), acc = 0;
  for (const [type, w] of Object.entries(weights)) {
    acc += w;
    if (r < acc) return type;
  }
  return Object.keys(weights)[0];
}

function makeMonster(type, x, y) {
  const cfg = CONFIG.monsters[type];
  let tier = 0;
  if (cfg.tierSheets) {
    const maxT = tierNow();
    tier = Math.max(0, maxT - (Math.random() < 0.4 ? 1 : 0));
  }
  const mul = cfg.tierSheets ? CONFIG.tierMul[tier] : 1;
  const hp = Math.round(cfg.hp * hpMul(stage()) * mul);
  return {
    type, tier, x, y, hp, maxHp: hp, dmgMul: mul,
    state: 'move', animT: Math.random(), atkCd: 0, atkAnim: 'attack', hitDone: false,
    staggerCd: 0, slowT: 0, flip: false, dying: 0,
  };
}

function spawnMonster(s) {
  const [d0, d1] = CONFIG.spawnDist;
  for (let k = 0; k < 12; k++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = d0 + Math.random() * (d1 - d0);
    const x = player.x + Math.cos(ang) * dist;
    const y = player.y + Math.sin(ang) * dist;
    if (!MAPGEN.walkable(x, y)) continue;
    monsters.push(makeMonster(pickType(s.weights), x, y));
    return;
  }
}

function spawnCampGoblins(camp) {
  camp.units = [];
  const types = ['torchGob', 'torchGob', 'torchGob', 'tntGob', 'barrelGob'];
  for (const type of types) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110;
      const x = camp.x + Math.cos(a) * d, y = camp.y + Math.sin(a) * d;
      if (!MAPGEN.walkable(x, y)) continue;
      const m = makeMonster(type, x, y);
      monsters.push(m);
      camp.units.push(m);
      break;
    }
  }
  addFloater(camp.x, camp.y - 90, '哥布林伏兵！', '#F09595', 1.4);
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
function grantCoins(n) {
  meta.coins += n;
  runCoins += n;
}
function grantXp(n) {
  const before = levelInfo().lv;
  meta.xp += n;
  const after = levelInfo().lv;
  if (after > before) addFloater(player.x, player.y - 60, `升级 Lv.${after}！`, '#9FE1CB', 1.3);
}

function onKill(m) {
  kills++;
  const cfg = CONFIG.monsters[m.type];
  const tb = 1 + (m.tier || 0) * 0.6;
  const gain = Math.round(cfg.coin * diff().coinMul * tb);
  grantCoins(gain);
  grantXp(Math.round(cfg.xp * tb));
  addFloater(m.x, m.y - 40, `+${gain}`, '#FAC775');
  dropFrom(m);
  if (cfg.explodes) spawnExplosion(m.x, m.y);
}

function damageMonster(m, dmg, kbx, kby) {
  if (m.dying) return;
  m.hp -= dmg;
  if (kbx || kby) {
    const k = CONFIG.monsters[m.type].kbMul;
    const kx = m.x + kbx * k, ky = m.y + kby * k;
    if (MAPGEN.walkable(kx, ky)) { m.x = kx; m.y = ky; }
  }
  if (m.hp <= 0) {
    m.dying = 0.0001;
    m.animT = 0;
    onKill(m);
    return;
  }
  if (m.staggerCd <= 0 && m.state !== 'attack' && CONFIG.monsters[m.type].anims.hit) {
    m.state = 'hit';
    m.animT = 0;
    m.staggerCd = CONFIG.stagger;
  }
}

// ---------- 更新 ----------
function update(dt) {
  playTime += dt;

  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
    const nx = player.x + input.moveX * stats.speed * dt;
    const ny = player.y + input.moveY * stats.speed * dt;
    if (MAPGEN.walkable(nx, player.y)) player.x = nx;
    if (MAPGEN.walkable(player.x, ny)) player.y = ny;
    player.phase = (player.phase + dt * 2.2) % 1;
  }
  updateCam();
  player.fireCd -= dt;
  player.muzzle -= dt;
  player.invuln -= dt;

  // 自动锁定 + 自动开火
  const target = nearestMonster(player.x, player.y - 12, 520);
  player.lockTarget = target;
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

  // 子弹
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

  // 精灵
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

  // 精灵元素特效
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

  // 刷怪 + 远端清理
  const s = stage();
  spawnTimer -= dt;
  const alive = monsters.filter(m => !m.dying).length;
  if (spawnTimer <= 0 && alive < monsterCap(s)) {
    spawnMonster(s);
    spawnTimer = s.interval * diff().spawnMul;
  }

  // 怪物状态机
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    const cfg = CONFIG.monsters[m.type];
    m.animT += dt;
    m.staggerCd -= dt;
    m.slowT -= dt;
    if (m.dying) {
      const da = cfg.anims.death;
      const dur = da ? da.frames / da.fps + 0.3 : 0.45;
      m.dying += dt;
      if (m.dying > dur) monsters.splice(i, 1);
      continue;
    }
    const dx = player.x - m.x, dy = player.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 1500) { monsters.splice(i, 1); continue; }   // 被甩远的怪直接回收
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
        if (cfg.behavior === 'kamikaze') {
          spawnExplosion(m.x, m.y);
          monsters.splice(i, 1);     // 自爆不给击杀奖励
          continue;
        } else if (cfg.behavior === 'lob') {
          throwDynamite(m.x, m.y - 24, player.x, player.y);
        } else if (cfg.behavior === 'melee') {
          if (d < cfg.attackRange + CONFIG.player.radius + 12) {
            hurtPlayer(cfg.damage * (m.dmgMul || 1));
            if (cfg.fireFx) spawnFireFx(player.x, player.y);
          }
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
    } else if (!inRange || cfg.behavior === 'kamikaze') {
      const spd = cfg.speed * (m.slowT > 0 ? 0.5 : 1);
      const nx = m.x + dx / d * spd * dt, ny = m.y + dy / d * spd * dt;
      if (MAPGEN.walkable(nx, m.y)) m.x = nx;
      if (MAPGEN.walkable(m.x, ny)) m.y = ny;
      m.idle = false;
    } else {
      m.idle = true;
    }
  }

  // 蘑菇孢子
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

  // 场景逻辑：羊群入场 / 哥布林营地 / 驻塔弓手 / 金矿产金
  for (const c of MAPGEN.visibleChunks(cam)) {
    if (!c.sheepDone) {
      c.sheepDone = true;
      for (const [x, y] of c.sheepSpots) {
        sheepL.push({ x, y, state: 'graze', wait: 1 + Math.random() * 2, animT: Math.random() * 5, flip: false, dead: false });
      }
    }
    if (c.camp && !c.camp.active && !c.camp.cleared && Math.hypot(c.camp.x - player.x, c.camp.y - player.y) < 520) {
      c.camp.active = true;
      spawnCampGoblins(c.camp);
    }
    if (c.camp && c.camp.active && !c.camp.cleared) {
      if (c.camp.units.every(u => u.hp <= 0 || !monsters.includes(u))) {
        c.camp.cleared = true;
        grantCoins(40);
        addFloater(c.camp.x, c.camp.y - 80, '营地肃清 +40 金币', '#FAC775', 1.4);
      }
    }
    for (const sc of c.scenery) {
      if (sc.kind === 'tower' && sc.archer) {
        sc.cd = (sc.cd || 0) - dt;
        const t = nearestMonster(sc.x, sc.y - 150, CONFIG.towerDef.range);
        if (t) {
          const d = Math.hypot(t.x - sc.x, t.y - (sc.y - 150)) || 1;
          sc.aimX = (t.x - sc.x) / d;
          sc.aimY = (t.y - (sc.y - 150)) / d;
          if (sc.cd <= 0) {
            fireArrow(sc.x, sc.y - 185, t.x, t.y, CONFIG.towerDef.damage);
            sc.cd = CONFIG.towerDef.cooldown;
          }
        }
      } else if (sc.kind === 'goldmine' && sc.state === 'active') {
        sc.cd = (sc.cd || 0) - dt;
        if (sc.cd <= 0 && sc.out < CONFIG.goldMine.maxOut && Math.hypot(sc.x - player.x, sc.y - player.y) < CONFIG.goldMine.range) {
          spawnPickup('gold', sc.x + 30 + Math.random() * 40, sc.y + 30, sc);
          sc.out++;
          sc.cd = CONFIG.goldMine.interval;
        }
      }
    }
  }

  updateUnits(dt);

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

// ---------- 绘制：地面 ----------
function inView(x, y, m) {
  return x > cam.x - m && x < cam.x + W + m && y > cam.y - m && y < cam.y + H + m;
}

function drawGround(visChunks) {
  const t = MAPGEN.T;
  const tx0 = Math.floor(cam.x / t) - 1, tx1 = Math.floor((cam.x + W) / t) + 1;
  const ty0 = Math.floor(cam.y / t) - 1, ty1 = Math.floor((cam.y + H) / t) + 1;
  const ff = Math.floor(worldT * 8) % 8;
  // 水面 + 泡沫
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      ctx.drawImage(tswWater, tx * t, ty * t, t, t);
      if (MAPGEN.landAt(tx, ty) && (!MAPGEN.landAt(tx - 1, ty) || !MAPGEN.landAt(tx + 1, ty) || !MAPGEN.landAt(tx, ty - 1) || !MAPGEN.landAt(tx, ty + 1))) {
        ctx.drawImage(tswFoam, ff * 192, 0, 192, 192, tx * t - 64, ty * t - 64, 192, 192);
      }
    }
  }
  // 沙层
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (MAPGEN.landAt(tx, ty)) {
        const [sx, sy] = MAPGEN.autotileSrc(MAPGEN.landAt, tx, ty, 5);
        ctx.drawImage(tswTilemap, sx, sy, 64, 64, tx * t, ty * t, t, t);
      }
    }
  }
  // 草层
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (MAPGEN.grassAt(tx, ty)) {
        const [sx, sy] = MAPGEN.autotileSrc(MAPGEN.grassAt, tx, ty, 0);
        ctx.drawImage(tswTilemap, sx, sy, 64, 64, tx * t, ty * t, t, t);
      }
    }
  }
  // 栈桥与平面装饰（地面层）
  for (const c of visChunks) {
    for (const sc of c.scenery) {
      if ((sc.kind === 'pier' || sc.kind === 'flat' || sc.kind === 'rock') && inView(sc.x, sc.y, 260)) drawSceneryItem(sc);
    }
  }
}

function shadow(x, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 绘制：怪物（luizmelo 单行文件 / 哥布林多行梯队色） ----------
function drawMonster(m) {
  const cfg = CONFIG.monsters[m.type];
  const fw = cfg.frame;
  const size = fw * cfg.scale;
  let key;
  if (m.dying) key = cfg.anims.death ? 'death' : (m.state === 'attack' ? m.atkAnim : 'move');
  else if (m.state === 'attack') key = m.atkAnim;
  else if (m.state === 'hit') key = 'hit';
  else if (m.idle && cfg.anims.idle) key = 'idle';
  else key = 'move';
  const a = cfg.anims[key];
  const t = m.dying || m.animT;

  let f;
  ctx.save();
  if (m.dying) {
    f = cfg.anims.death ? Math.min(Math.floor(t * a.fps), a.frames - 1) : 0;
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - (cfg.anims.death ? a.frames / a.fps : 0.1)) / 0.3);
  } else if (m.state === 'attack' || m.state === 'hit') {
    f = Math.min(Math.floor(t * a.fps), a.frames - 1);
  } else {
    f = Math.floor(t * a.fps) % a.frames;
  }
  if (!m.dying) shadow(m.x, m.y + 12, cfg.radius + 6);
  ctx.translate(m.x, m.y - cfg.bodyOffsetY * cfg.scale);
  if (m.flip) ctx.scale(-1, 1);
  if (m.slowT > 0) ctx.filter = 'saturate(0.4) brightness(1.25)';
  const img = cfg.tierSheets ? images[m.type].tiers[m.tier] : images[m.type][key];
  const row = cfg.tierSheets ? a.row : 0;
  ctx.drawImage(img, f * fw, row * fw, fw, fw, -size / 2, -size / 2, size, size);
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

function drawEffectE(e) {
  const cfg = CONFIG.effects[e.kind];
  const f = Math.min(Math.floor(e.animT * cfg.fps), cfg.frames - 1);
  const size = cfg.size * cfg.scale;
  ctx.drawImage(effectImgs[e.kind], f * cfg.size, 0, cfg.size, cfg.size, e.x - size / 2, e.y - size / 2, size, size);
}

function pointerAt(idx, x, y, s = 36) {
  const bob = Math.sin(worldT * 6) * 4;
  ctx.drawImage(uiPointer[idx], x - s / 2, y + bob, s, s);
}

// ---------- 世界场景 ----------
function drawWorldScene() {
  const visChunks = MAPGEN.visibleChunks(cam);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawGround(visChunks);

  const order = [];
  for (const c of visChunks) {
    for (const sc of c.scenery) {
      if (sc.kind === 'pier' || sc.kind === 'flat' || sc.kind === 'rock') continue;
      if (inView(sc.x, sc.y, 340)) order.push({ y: sc.y, fn: () => drawSceneryItem(sc) });
    }
  }
  for (const m of monsters) if (inView(m.x, m.y, 200)) order.push({ y: m.y, fn: () => drawMonster(m) });
  for (const pet of pets) order.push({ y: pet.y, fn: () => drawPet(pet) });
  for (const mc of mercs) order.push({ y: mc.state === 'dead' ? mc.y - 1e6 : mc.y, fn: () => drawMerc(mc) });
  for (const sh of sheepL) if (inView(sh.x, sh.y, 130)) order.push({ y: sh.y, fn: () => drawSheepE(sh) });
  for (const p of pickups) if (inView(p.x, p.y, 130)) order.push({ y: p.y, fn: () => drawPickup(p) });
  order.push({ y: player.y, fn: () => { shadow(player.x, player.y + 38, 26); drawStickman(ctx, player.x, player.y, player); } });
  order.sort((a, b) => a.y - b.y);
  for (const o of order) o.fn();

  eprojs.forEach(drawEproj);
  dynamites.forEach(drawDynamiteE);
  arrows.forEach(drawArrowE);
  bullets.forEach(b => {
    ctx.fillStyle = C.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });
  effects.forEach(drawEffectE);
  fireFxs.forEach(drawFireFxE);
  booms.forEach(drawBoom);

  // 指针标记（Tiny Swords pointers 1-6 全分配）
  if (state === 'playing') {
    if (player.lockTarget && !player.lockTarget.dying) pointerAt(1, player.lockTarget.x, player.lockTarget.y - 74);
    for (const pet of pets) if (pet.state === 'attack' && pet.target && !pet.target.dying) pointerAt(2, pet.target.x, pet.target.y - 56, 26);
    for (const c of visChunks) {
      if (c.camp && c.camp.active && !c.camp.cleared) pointerAt(4, c.camp.x, c.camp.y - 110);
      for (const sc of c.scenery) {
        if (sc.kind === 'goldmine' && sc.state === 'active' && Math.hypot(sc.x - player.x, sc.y - player.y) < CONFIG.goldMine.range) pointerAt(3, sc.x, sc.y - 110, 30);
      }
    }
    for (const mc of mercs) if (mc.state === 'dead') pointerAt(5, mc.x, mc.y - 60, 26);
  }

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

// ---------- HUD 与界面 ----------
function drawHUD() {
  ctx.fillStyle = 'rgba(10,10,24,0.35)';
  ctx.fillRect(12, 8, 232, 52);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(20, 14, 200, 14);
  ctx.fillStyle = C.hpBar;
  ctx.fillRect(20, 14, 200 * player.hp / stats.maxHp, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 14, 200, 14);
  ctx.fillStyle = C.hud;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${player.hp}/${stats.maxHp}`, 24, 25);

  const li = levelInfo();
  ctx.drawImage(tswRes.G.icon, 14, 32, 26, 26);          // 金币图标（资源 NoShadow 版）
  ctx.fillStyle = '#FAC775';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, 42, 51);
  ctx.fillStyle = C.hud;
  ctx.fillText(`Lv.${li.lv}`, 112, 51);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(152, 42, 68, 8);
  ctx.fillStyle = '#9FE1CB';
  ctx.fillRect(152, 42, 68 * li.cur / li.need, 8);

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

const PAUSE_BTN = { x: W - 50, y: 10, w: 38, h: 38 };
function drawPauseBtn() {
  iconBtn('pause', PAUSE_BTN, state === 'paused' ? 0 : 7, state === 'paused' ? 'hover' : 'blue');
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

// ---------- 标题 ----------
const DIFF_BTNS = ['easy', 'normal', 'hard'].map((id, i) => ({ id, x: W / 2 - 150 + i * 110, y: H / 2 - 38, w: 80, h: 56 }));
const START_BTN = { x: W / 2 - 110, y: H / 2 + 46, w: 220, h: 52 };
const SHOP_BTN = { x: W / 2 - 110, y: H / 2 + 110, w: 220, h: 46 };

function drawTitle() {
  ctx.fillStyle = 'rgba(10,10,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  nine(uiBanner.h, W / 2 - 290, H / 2 - 218, 580, 112);
  ctx.fillStyle = UI_TEXT;
  ctx.textAlign = 'center';
  ctx.font = '36px -apple-system, sans-serif';
  ctx.fillText('火柴人：怪物围城', W / 2, H / 2 - 148);
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText('无尽大陆 · 自动锁定射击 · 精灵与佣兵伴你作战', W / 2, H / 2 - 90);
  ctx.fillText('移动：方向键 / WASD（手机拖动摇杆）　难度数字键 1-3　商城 B', W / 2, H / 2 - 68);

  for (let i = 0; i < DIFF_BTNS.length; i++) {
    const b = DIFF_BTNS[i];
    const sel = meta.difficulty === b.id;
    iconBtn('diff' + i, { x: b.x + 8, y: b.y, w: 56, h: 56 }, 3 + i, sel ? 'hover' : 'blue');
    ctx.fillStyle = sel ? '#FAC775' : C.hudDim;
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(CONFIG.difficulties[b.id].name, b.x + 36, b.y + 72);
  }
  skinBtn('start', START_BTN, '开始游戏', 'primary', 20);
  skinBtn('shop', SHOP_BTN, '商城', 'secondary', 18);

  // 标题装饰羊群（HappySheep_All）
  const sf = Math.floor(worldT * 6) % 8;
  ctx.drawImage(tswSheep.all, sf * 128, 0, 128, 128, 90, H - 130, 100, 100);
  ctx.drawImage(tswSheep.all, ((sf + 3) % 8) * 128, 128, 128, 128, W - 190, H - 125, 96, 96);

  const li = levelInfo();
  ctx.drawImage(tswRes.G.icon, W / 2 - 170, H - 46, 24, 24);
  ctx.fillStyle = '#FAC775';
  ctx.textAlign = 'left';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText(`${meta.coins}`, W / 2 - 142, H - 28);
  ctx.fillStyle = C.hudDim;
  ctx.fillText(`Lv.${li.lv}　武器：${CONFIG.weapons[meta.weapon].name}　精灵 ${meta.ownedPets.length}/3　佣兵 ${Object.values(meta.mercTier).filter(t => t >= 0).length}/3`, W / 2 - 110, H - 28);
}

// ---------- 商城（四页签：武器/装备/精灵/佣兵） ----------
const SHOP_TABS = [
  { id: 'weapon', label: '武器', color: 'Red', icon: 0 },
  { id: 'equip', label: '装备', color: 'Blue', icon: 1 },
  { id: 'pet', label: '精灵', color: 'Yellow', icon: 2 },
  { id: 'merc', label: '佣兵', color: 'Red', icon: 3 },
];
const SHOP_BACK = { x: W - 120, y: 22, w: 44, h: 44 };
let shopRows = [];

function drawShop() {
  ctx.fillStyle = 'rgba(10,10,24,0.6)';
  ctx.fillRect(0, 0, W, H);
  nine(uiBanner.carved9, 24, 64, W - 48, H - 84);
  ribbonHeader('Yellow', W / 2, 2, 260, '商城');

  const li = levelInfo();
  ctx.drawImage(tswRes.G.icon, 56, 26, 28, 28);
  ctx.fillStyle = '#FAC775';
  ctx.font = '17px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${meta.coins}`, 88, 47);
  ctx.fillStyle = C.hud;
  ctx.fillText(`Lv.${li.lv}`, 170, 47);
  ctx.fillStyle = C.hpBack;
  ctx.fillRect(220, 34, 80, 10);
  ctx.fillStyle = '#9FE1CB';
  ctx.fillRect(220, 34, 80 * li.cur / li.need, 10);
  iconBtn('back', SHOP_BACK, 9, 'red');

  let tabX = 60;
  for (const tab of SHOP_TABS) {
    ribbonTab('tab_' + tab.id, { x: tabX, y: 84, w: 165, h: 44 }, tab.label, tab.color, shopTab === tab.id);
    tabX += 180;
  }

  shopRows = [];
  const rx = 60, rw = W - 120;
  let ry = 148;
  ctx.textAlign = 'left';

  if (shopTab === 'merc') {
    for (const [cls, cfg] of Object.entries(CONFIG.mercs)) {
      const r = { x: rx, y: ry, w: rw, h: 70, kind: 'merc', id: cls };
      const cur = meta.mercTier[cls];
      const next = cur + 1;
      const maxed = next > 3;
      const t = maxed ? null : cfg.tiers[next];
      const locked = t && li.lv < t.level;
      cardBg(r, cur >= 0 && maxed ? 'equipped' : locked ? 'locked' : 'normal', uiPressedId === 'row_merc_' + cls);
      drawUnitFrame(tswMerc[cls][Math.max(0, cur)], 192, Math.floor(worldT * 6) % 6, 0, r.x + 40, r.y + 52, 0.62, false);
      ctx.fillStyle = UI_TEXT;
      ctx.font = '16px -apple-system, sans-serif';
      ctx.fillText(`${cfg.name}${cur >= 0 ? '　' + CONFIG.mercTierNames[cur] : ''}`, r.x + 80, r.y + 30);
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.75)';
      ctx.fillText(cfg.clsDesc + (cur >= 0 ? '（已出战）' : ''), r.x + 80, r.y + 52);
      ctx.textAlign = 'right';
      ctx.font = '14px -apple-system, sans-serif';
      if (maxed) {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText('已满级 Ⅳ·红', r.x + rw - 18, r.y + 42);
      } else if (locked) {
        ctx.fillStyle = 'rgba(90,58,26,0.6)';
        ctx.fillText(`Lv.${t.level} 解锁 ${CONFIG.mercTierNames[next]}`, r.x + rw - 18, r.y + 42);
      } else {
        ctx.fillStyle = meta.coins >= t.price ? '#854F0B' : '#A32D2D';
        ctx.fillText(`${cur < 0 ? '雇佣' : '升级'} ${CONFIG.mercTierNames[next]}　${t.price} 金`, r.x + rw - 18, r.y + 42);
      }
      ctx.textAlign = 'left';
      shopRows.push(r);
      ry += 82;
    }
  } else {
    const src = shopTab === 'weapon' ? CONFIG.weapons : shopTab === 'equip' ? CONFIG.equipment : CONFIG.pets;
    const ownedList = shopTab === 'weapon' ? meta.owned : shopTab === 'equip' ? meta.ownedEquip : meta.ownedPets;
    const rh = shopTab === 'pet' ? 70 : 58;
    for (const [id, item] of Object.entries(src)) {
      const r = { x: rx, y: ry, w: rw, h: rh, kind: shopTab, id };
      const owned = ownedList.includes(id);
      const locked = li.lv < item.level;
      const equipped = shopTab === 'weapon' && meta.weapon === id;
      cardBg(r, equipped || (owned && shopTab !== 'weapon') ? 'equipped' : locked ? 'locked' : 'normal', uiPressedId === 'row_' + shopTab + '_' + id);
      let textX = r.x + 18;
      if (shopTab === 'pet') {
        ctx.save();
        if (locked) ctx.globalAlpha = 0.45;
        ctx.drawImage(petIcons[id], r.x + 14, r.y + 14, 38, 42);
        ctx.restore();
        textX = r.x + 64;
      }
      ctx.fillStyle = locked ? 'rgba(90,58,26,0.55)' : UI_TEXT;
      ctx.font = '15px -apple-system, sans-serif';
      ctx.fillText(item.name, textX, r.y + 24);
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.75)';
      ctx.fillText(item.desc, textX, r.y + rh - 14);
      ctx.textAlign = 'right';
      ctx.font = '14px -apple-system, sans-serif';
      const cy = r.y + rh / 2 + 5;
      if (locked) {
        ctx.fillStyle = 'rgba(90,58,26,0.6)';
        ctx.fillText(`Lv.${item.level} 解锁`, r.x + rw - 18, cy);
      } else if (!owned) {
        ctx.fillStyle = meta.coins >= item.price ? '#854F0B' : '#A32D2D';
        ctx.fillText(`${item.price} 金`, r.x + rw - 18, cy);
      } else if (equipped) {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText('使用中', r.x + rw - 18, cy);
      } else if (shopTab === 'weapon') {
        ctx.fillStyle = UI_TEXT;
        ctx.fillText('点击装备', r.x + rw - 18, cy);
      } else {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText(shopTab === 'pet' ? '已跟随' : '已生效', r.x + rw - 18, cy);
      }
      ctx.textAlign = 'left';
      shopRows.push(r);
      ry += rh + 10;
    }
  }
}

// ---------- 结算 ----------
const RESTART_BTN = { x: W / 2 - 230, y: H / 2 + 96, w: 220, h: 52 };
const GO_SHOP_BTN = { x: W / 2 + 10, y: H / 2 + 96, w: 220, h: 52 };

function drawGameover() {
  const best = loadBest();
  ctx.fillStyle = 'rgba(10,10,24,0.6)';
  ctx.fillRect(0, 0, W, H);
  nine(uiBanner.v, W / 2 - 210, H / 2 - 130, 420, 210);
  ribbonHeader('Red', W / 2, H / 2 - 170, 280, '游戏结束', 22);
  ctx.font = '16px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = UI_TEXT;
  ctx.fillText(`存活 ${fmtTime(playTime)}　击杀 ${kills}`, W / 2, H / 2 - 62);
  ctx.fillStyle = '#854F0B';
  ctx.fillText(`本局金币 +${runCoins}　总金币 ${meta.coins}`, W / 2, H / 2 - 32);
  ctx.fillStyle = 'rgba(90,58,26,0.8)';
  if (best) ctx.fillText(`最佳：存活 ${fmtTime(best.time)}　击杀 ${best.kills}`, W / 2, H / 2 - 2);
  ctx.fillText('按 R 重开 · 按 B 进商城', W / 2, H / 2 + 28);
  skinBtn('restart', RESTART_BTN, '再来一局', 'primary', 20);
  skinBtn('goshop', GO_SHOP_BTN, '商城', 'secondary', 20);
}

function draw() {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  drawWorldScene();
  if (state === 'title') { drawTitle(); }
  else if (state === 'shop') { drawShop(); }
  else {
    drawHUD();
    drawTouchControls();
    if (state === 'paused') {
      ctx.fillStyle = 'rgba(10,10,24,0.6)';
      ctx.fillRect(0, 0, W, H);
      three(uiBanner.carved3, W / 2 - 160, H / 2 - 60, 320, 90);
      ctx.fillStyle = UI_TEXT;
      ctx.textAlign = 'center';
      ctx.font = '26px -apple-system, sans-serif';
      ctx.fillText('已暂停', W / 2, H / 2 - 18);
      ctx.font = '13px -apple-system, sans-serif';
      ctx.fillText('按 P 或点击右上角继续', W / 2, H / 2 + 8);
      drawPauseBtn();
    } else if (state === 'gameover') {
      drawGameover();
    }
  }
  // 点按涟漪（屏幕坐标）
  if (lastTap && lastTap.t < 0.3) {
    ctx.globalAlpha = 1 - lastTap.t / 0.3;
    ctx.drawImage(uiPointer[0], lastTap.x - 16, lastTap.y - 16, 32, 32);
    ctx.globalAlpha = 1;
  }
}

// ---------- UI 事件路由 ----------
function startGame() { state = 'playing'; reset(); }

function handleUI(dt) {
  uiTick(dt);
  if (lastTap) lastTap.t += dt;
  for (const code of input.keyPresses) {
    if (state === 'title') {
      if (code === 'Digit1') { meta.difficulty = 'easy'; saveMeta(); }
      else if (code === 'Digit2') { meta.difficulty = 'normal'; saveMeta(); }
      else if (code === 'Digit3') { meta.difficulty = 'hard'; saveMeta(); }
      else if (code === 'KeyB') state = 'shop';
      else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') { uiPress('start'); startGame(); }
    } else if (state === 'shop') {
      if (code === 'Escape' || code === 'KeyB') state = 'title';
      else if (code === 'Digit1') shopTab = 'weapon';
      else if (code === 'Digit2') shopTab = 'equip';
      else if (code === 'Digit3') shopTab = 'pet';
      else if (code === 'Digit4') shopTab = 'merc';
    } else if (state === 'gameover') {
      if (code === 'KeyR') { uiPress('restart'); startGame(); }
      else if (code === 'KeyB') state = 'shop';
    } else if (code === 'KeyP' && (state === 'playing' || state === 'paused')) {
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
  for (const p of input.taps) {
    lastTap = { x: p.x, y: p.y, t: 0 };
    if (state === 'title') {
      for (let i = 0; i < DIFF_BTNS.length; i++) {
        if (inRect(p, DIFF_BTNS[i])) { meta.difficulty = DIFF_BTNS[i].id; saveMeta(); uiPress('diff' + i); }
      }
      if (inRect(p, START_BTN)) { uiPress('start'); startGame(); }
      else if (inRect(p, SHOP_BTN)) { uiPress('shop'); state = 'shop'; }
    } else if (state === 'shop') {
      if (inRect(p, SHOP_BACK)) { uiPress('back'); state = 'title'; }
      let tabX = 60;
      for (const tab of SHOP_TABS) {
        if (inRect(p, { x: tabX, y: 78, w: 165, h: 54 })) shopTab = tab.id;
        tabX += 180;
      }
      for (const r of shopRows) {
        if (inRect(p, r)) {
          uiPress('row_' + r.kind + '_' + r.id);
          shopAction(r.kind, r.id);
        }
      }
    } else if (state === 'gameover') {
      if (inRect(p, RESTART_BTN)) { uiPress('restart'); startGame(); }
      else if (inRect(p, GO_SHOP_BTN)) { uiPress('goshop'); state = 'shop'; }
    } else if ((state === 'playing' || state === 'paused') && input.touchSeen && inRect(p, PAUSE_BTN)) {
      uiPress('pause');
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
}

// ---------- 主循环（出错不冻结：屏幕提示 + 继续运行） ----------
let last = performance.now();
let lastError = null;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  worldT += dt;
  try {
    input.poll();
    handleUI(dt);
    if (state === 'playing') update(dt);
    draw();
  } catch (e) {
    if (lastError !== e.message) { lastError = e.message; console.error(e); }
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    ctx.fillStyle = 'rgba(160,30,30,0.9)';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = '#fff';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('运行错误（请截图反馈）: ' + e.message, 12, H - 12);
  }
  input.flush();
  requestAnimationFrame(loop);
}

let loadedImgs = 0;
pending.forEach(img => {
  img.onload = () => { if (++loadedImgs === pending.length) { reset(); requestAnimationFrame(loop); } };
  img.onerror = () => { console.error('加载失败: ' + img.src); };
});
