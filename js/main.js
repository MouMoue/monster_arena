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
let player, bullets, monsters, eprojs, pets, petProjs, effects, floaters;
let playTime, kills, runCoins, spawnTimer, stats, worldT = 0;
let boss = null, bossIdx = 0, nextBossT = Infinity, fxList = [];
let zones = [];          // Boss 持续性地面区域（毒雾等）
// 局内成长（每局清零）：升级三选一的强化倍率
let runMods, runXp = 0, runXpNeed = 30, runLv = 1, pendingLvls = 0, runPicked = {}, lvlChoices = [];
let runDmg = {}, lastKiller = null, runSpawn = [0, 0];
function freshRunMods() {
  return { dmg: 1, rate: 1, speed: 1, maxHp: 0, pierce: 0, petCd: 1, magnet: 0, coin: 1, invuln: 1, mercDmg: 1 };
}
runMods = freshRunMods();
// 局外装备 + 局内强化 → 实战属性
function recomputeStats() {
  const st = effectiveStats();
  st.maxHp += runMods.maxHp;
  st.speed *= runMods.speed;
  st.invuln *= runMods.invuln;
  st.magnet += runMods.magnet;
  st.coinMul *= runMods.coin;
  st.petCd *= runMods.petCd;
  st.weapon.damage = Math.round(st.weapon.damage * runMods.dmg);
  st.weapon.fireRate *= runMods.rate;
  st.weapon.pierce += runMods.pierce;
  stats = st;
}
// 升级三选一强化池
const RUN_UPGRADES = [
  { id: 'dmg',     name: '强化弹药', desc: '武器伤害 +15%',        apply: () => { runMods.dmg *= 1.15; } },
  { id: 'rate',    name: '快速扳机', desc: '射速 +12%',            apply: () => { runMods.rate *= 1.12; } },
  { id: 'speed',   name: '轻盈步伐', desc: '移动速度 +8%',         apply: () => { runMods.speed *= 1.08; } },
  { id: 'hp',      name: '生命强化', desc: '生命上限 +25 并恢复',  apply: () => { runMods.maxHp += 25; player.hp += 25; } },
  { id: 'pierce',  name: '贯穿弹头', desc: '子弹穿透 +1',  max: 2, apply: () => { runMods.pierce += 1; } },
  { id: 'petcd',   name: '精灵共鸣', desc: '精灵冷却 -15%',        apply: () => { runMods.petCd *= 0.85; } },
  { id: 'magnet',  name: '拾取磁场', desc: '拾取范围 +70',         apply: () => { runMods.magnet += 70; } },
  { id: 'coin',    name: '赏金嗅觉', desc: '金币获取 +15%',        apply: () => { runMods.coin *= 1.15; } },
  { id: 'invuln',  name: '韧性护体', desc: '受击无敌 +25%',        apply: () => { runMods.invuln *= 1.25; } },
  { id: 'mercdmg', name: '战旗激励', desc: '佣兵伤害 +25%',        apply: () => { runMods.mercDmg *= 1.25; } },
  { id: 'heal',    name: '战地急救', desc: '立即回满生命',         apply: () => { player.hp = stats.maxHp; } },
];
function rollUpgrades() {
  const pool = RUN_UPGRADES.filter(u => !u.max || (runPicked[u.id] || 0) < u.max);
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return picks;
}
function openLevelup() { lvlChoices = rollUpgrades(); state = 'levelup'; }
function chooseUpgrade(i) {
  const u = lvlChoices[i];
  if (!u) return;
  runPicked[u.id] = (runPicked[u.id] || 0) + 1;
  u.apply();
  recomputeStats();
  player.hp = Math.min(player.hp, stats.maxHp);
  addFloater(player.x, player.y - 76, u.name + '！', '#9FE1CB', 1.2);
  pendingLvls--;
  if (pendingLvls > 0) lvlChoices = rollUpgrades();
  else state = 'playing';
}
let shopTab = 'weapon';
let shopFrom = 'title';      // 商城来源：title / game / gameover（决定返回去向）
let lastTap = null;
const cam = { x: 0, y: 0 };

function diff() { return CONFIG.difficulties[meta.difficulty]; }

function reset() {
  MAPGEN.reset(Math.floor(Math.random() * 2147483647));   // 每局全新世界
  runMods = freshRunMods();
  runXp = 0; runXpNeed = 30; runLv = 1; pendingLvls = 0; runPicked = {}; lvlChoices = [];
  runDmg = {}; lastKiller = null;
  recomputeStats();
  const [sx, sy] = MAPGEN.findSpawn();
  runSpawn = [sx, sy];
  player = {
    x: sx, y: sy,
    hp: stats.maxHp,
    aim: { x: 1, y: 0 },
    face: 1, animT: 0,
    moving: false, phase: 0,
    fireCd: 0, muzzle: 0, invuln: 0,
    weaponId: meta.weapon,
  };
  bullets = [];
  monsters = [];
  eprojs = [];
  effects = [];
  floaters = [];
  pets = (meta.activePet ? [meta.activePet] : []).map((id, i) => ({   // 单精灵出战
    id, slot: i,
    x: player.x + CONFIG.petSlots[i][0], y: player.y + CONFIG.petSlots[i][1],
    state: 'idle', animT: Math.random(), atkCd: 0.5, casted: false, target: null, flip: false,
  }));
  petProjs = [];
  playTime = 0;
  kills = 0;
  runCoins = 0;
  spawnTimer = 0.5;
  boss = null; bossIdx = 0; nextBossT = CONFIG.bossSchedule.firstAt; fxList = []; zones = [];
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

function spawnBoss() {
  const sch = CONFIG.bossSchedule;
  const type = sch.order[bossIdx % sch.order.length];
  bossIdx++;
  const cfg = CONFIG.monsters[type];
  let x = player.x, y = player.y - 560;
  for (let k = 0; k < 16; k++) {
    const a = Math.random() * Math.PI * 2, dist = 520 + Math.random() * 120;
    const px = player.x + Math.cos(a) * dist, py = player.y + Math.sin(a) * dist;
    if (MAPGEN.walkable(px, py)) { x = px; y = py; break; }
  }
  const m = makeMonster(type, x, y);
  const scale = 1 + Math.floor(playTime / 120) * sch.hpScalePer2min;
  m.maxHp = m.hp = Math.round(cfg.hp * diff().hpMul * scale);
  m.summonCd = cfg.summon ? cfg.summon.gap : 0;
  m.enterT = 0;
  boss = m;
  monsters.push(m);
  addFloater(player.x, player.y - 130, '⚠ ' + cfg.bossName + ' 出现！', '#FF6B6B', 2.6);
  if (window.AUDIO) AUDIO.kill(m);   // 低吼提示
}

// ---------- Boss 技能组：每个 Boss 轮换施放专属技能 ----------
const BOSS_KITS = {
  bossGoblin:   ['slam', 'whirl', 'warcry'],
  bossEye:      ['dash', 'minions', 'dash', 'slam'],
  bossMushroom: ['ring', 'poison', 'slam'],
  bossSkeleton: ['triple', 'bonering', 'minions'],
};
function bossCast(skill) {
  const bc = CONFIG.monsters[boss.type];
  if (skill === 'slam') {                  // 追踪重压：玩家脚下预警→落地
    spawnFx('warn', player.x, player.y, { r: 115, life: 0.75, dmg: Math.round(bc.damage * 1.3), src: bc.bossName + '·重压', color: 'rgba(230,60,70,0.9)' });
  } else if (skill === 'whirl') {          // 旋风斩：以自身为中心大范围扫击
    addFloater(boss.x, boss.y - 110, '旋风斩！', '#FFD27A', 1.1);
    spawnFx('warn', boss.x, boss.y, { r: 195, life: 0.7, dmg: Math.round(bc.damage * 1.5), src: bc.bossName + '·旋风斩' });
  } else if (skill === 'warcry') {         // 战吼：周围小怪狂暴加速
    addFloater(boss.x, boss.y - 110, '战吼！小的们上！', '#FF9090', 1.4);
    spawnFx('shockwave', boss.x, boss.y + 6, { r: 330, color: '#ff8a5a', life: 0.6 });
    for (const m of monsters) {
      if (!CONFIG.monsters[m.type].boss && !m.dying && Math.hypot(m.x - boss.x, m.y - boss.y) < 640) m.rageT = 4.5;
    }
  } else if (skill === 'dash') {           // 俯冲：锁定落点→蓄力→高速冲撞
    const tx = player.x, ty = player.y;
    spawnFx('warn', tx, ty, { r: 95, life: 0.5, color: 'rgba(90,150,255,0.85)' });
    boss.dashDelay = 0.5;
    boss.dashTo = [tx, ty];
  } else if (skill === 'ring') {           // 孢子风暴：360° 环形弹幕
    addFloater(boss.x, boss.y - 110, '孢子风暴！', '#C0DD97', 1.2);
    const p = bc.projectile, n = 14;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      eprojs.push({ type: boss.type, x: boss.x, y: boss.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, animT: Math.random() });
    }
  } else if (skill === 'poison') {         // 毒雾：三片持续伤害区域
    addFloater(boss.x, boss.y - 110, '毒雾蔓延！', '#9CCB60', 1.2);
    for (let k = 0; k < 3; k++) {
      const zx = player.x + (k === 0 ? 0 : (Math.random() - 0.5) * 280);
      const zy = player.y + (k === 0 ? 0 : (Math.random() - 0.5) * 280);
      spawnFx('warn', zx, zy, { r: 92, life: 0.7, color: 'rgba(120,190,60,0.85)' });
      zones.push({ x: zx, y: zy, r: 92, until: playTime + 5.2, tickCd: 0.7, dmg: Math.round(bc.damage * 0.45), delay: 0.7, tick: 0 });
    }
  } else if (skill === 'triple') {         // 三连斩：连续三记追身斩击
    addFloater(boss.x, boss.y - 120, '三连斩！', '#E8E8F0', 1.2);
    for (let k = 0; k < 3; k++) {
      spawnFx('warn', player.x + (Math.random() - 0.5) * 70, player.y + (Math.random() - 0.5) * 70,
        { r: 105, life: 0.55 + k * 0.38, dmg: Math.round(bc.damage * 0.9), src: bc.bossName + '·三连斩' });
    }
  } else if (skill === 'bonering') {       // 白骨牢笼：环绕玩家的骨刺阵（从缝隙逃生）
    addFloater(boss.x, boss.y - 120, '白骨牢笼！', '#E8E8F0', 1.3);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + Math.random() * 0.3;
      spawnFx('warn', player.x + Math.cos(a) * 150, player.y + Math.sin(a) * 150,
        { r: 80, life: 0.85, dmg: Math.round(bc.damage * 1.0), src: bc.bossName + '·白骨牢笼' });
    }
  } else if (skill === 'minions') {        // 召唤同族小怪
    const t = boss.type === 'bossEye' ? 'flyingEye' : 'skeleton';
    addFloater(boss.x, boss.y - 110, '召唤！', '#FFB0B0', 1.2);
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2, dd = 80 + Math.random() * 60;
      const sx = boss.x + Math.cos(a) * dd, sy = boss.y + Math.sin(a) * dd;
      if (MAPGEN.walkable(sx, sy)) monsters.push(makeMonster(t, sx, sy));
    }
  }
}

// Boss tint 整张雪碧图预渲染缓存（替代逐帧 ctx.filter，移动端性能关键）
function tintedImg(type, key) {
  const cfg = CONFIG.monsters[type];
  const base = images[type][key];
  if (!base || !base.complete || !base.naturalWidth) return base;
  const cacheMap = (images[type]._tint = images[type]._tint || {});
  let t = cacheMap[key];
  if (!t) {
    t = document.createElement('canvas');
    t.width = base.naturalWidth;
    t.height = base.naturalHeight;
    const g = t.getContext('2d');
    g.filter = cfg.tint;
    g.drawImage(base, 0, 0);
    cacheMap[key] = t;
  }
  return t;
}

// ---------- 程序化特效（Boss 攻击）：冲击波 / 范围预警 / 落地冲击 ----------
function spawnFx(kind, x, y, o = {}) { fxList.push(Object.assign({ kind, x, y, t: 0, life: o.life || 0.5 }, o)); }
function updateFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.t += dt;
    if (f.kind === 'warn' && !f.fired && f.t >= f.life) {       // 预警结束 → 落地伤害
      f.fired = true;
      spawnFx('slam', f.x, f.y, { life: 0.32, r: f.r });
      if (f.dmg && Math.hypot(player.x - f.x, player.y - f.y) < f.r) hurtPlayer(f.dmg, f.src || 'Boss 技能');
    }
    if (f.t >= f.life) fxList.splice(i, 1);
  }
}
function drawFx(f) {
  const p = Math.min(1, f.t / f.life);
  ctx.save();
  if (f.kind === 'shockwave') {
    const r = f.r * p;
    ctx.globalAlpha = (1 - p) * 0.85; ctx.strokeStyle = f.color || '#ffd27a';
    ctx.lineWidth = (f.w || 9) * (1 - p) + 2;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - p) * 0.35; ctx.lineWidth *= 0.5;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 0.66, r * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (f.kind === 'warn') {
    const pulse = 0.5 + 0.5 * Math.sin(f.t * 20);
    ctx.globalAlpha = 0.22 + 0.3 * pulse; ctx.fillStyle = f.color || '#e23b4e';
    ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    const ir = f.r * (1 - p); ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, ir, ir * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (f.kind === 'slam') {
    const r = (f.r || 90) * p;
    ctx.globalAlpha = (1 - p) * 0.9; ctx.fillStyle = '#fff2cc';
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = (1 - p) * 0.7; ctx.strokeStyle = '#ffae42'; ctx.lineWidth = 7 * (1 - p) + 2;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, r * 1.15, r * 0.63, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// 子弹绘制：按武器子弹样式（光晕 + 拖尾 + 5 种形态）
function drawBullet(b) {
  const v = b.vis || { shape: 'orb', color: '#FFE45A', glow: '#FF9F27', r: b.r };
  const r = v.r || b.r, ang = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.globalAlpha = 0.32; ctx.strokeStyle = v.glow; ctx.lineWidth = r * 1.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); ctx.stroke();
  ctx.globalAlpha = 1;
  if (v.shape === 'beam') {
    ctx.translate(b.x, b.y); ctx.rotate(ang);
    ctx.globalAlpha = 0.5; ctx.fillStyle = v.glow; ctx.fillRect(-r * 3, -r * 0.9, r * 6, r * 1.8);
    ctx.globalAlpha = 1; ctx.fillStyle = v.color; ctx.fillRect(-r * 2.2, -r * 0.45, r * 4.4, r * 0.9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-r * 1.4, -r * 0.2, r * 2.8, r * 0.4);
  } else if (v.shape === 'energy') {
    ctx.globalAlpha = 0.4; ctx.fillStyle = v.glow;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * (1.1 + 0.25 * Math.sin(worldT * 18)), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.4, 0, Math.PI * 2); ctx.fill();
  } else if (v.shape === 'fire') {
    const fr = r * (0.85 + 0.3 * Math.sin(worldT * 30 + b.x));
    ctx.globalAlpha = 0.5; ctx.fillStyle = v.glow;
    ctx.beginPath(); ctx.arc(b.x, b.y, fr * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath(); ctx.arc(b.x, b.y, fr * 0.45, 0, Math.PI * 2); ctx.fill();
  } else if (v.shape === 'bolt') {
    ctx.translate(b.x, b.y); ctx.rotate(ang);
    const zig = [[-r*2,0],[-r,-r],[0,r*0.6],[r,-r*0.7],[r*2,0]];
    ctx.globalAlpha = 0.6; ctx.strokeStyle = v.glow; ctx.lineWidth = 3;
    ctx.beginPath(); zig.forEach((q,i)=>ctx[i?'lineTo':'moveTo'](q[0],q[1])); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = v.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); zig.forEach((q,i)=>ctx[i?'lineTo':'moveTo'](q[0],q[1])); ctx.stroke();
  } else {
    ctx.globalAlpha = 0.4; ctx.fillStyle = v.glow;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = v.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x - r * 0.25, b.y - r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
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

function hurtPlayer(dmg, src) {
  if (player.invuln > 0) return;
  player.hp -= Math.round(dmg * diff().dmgMul);
  player.invuln = stats.invuln;
  if (src) {
    runDmg[src] = (runDmg[src] || 0) + Math.round(dmg * diff().dmgMul);
    lastKiller = src;
  }
  if (window.AUDIO) AUDIO.hurt();
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
  runXp += n;
  while (runXp >= runXpNeed) {           // 局内升级：暂停并三选一
    runXp -= runXpNeed;
    runXpNeed = Math.round(runXpNeed * 1.42);
    runLv++;
    pendingLvls++;
  }
  if (pendingLvls > 0 && state === 'playing') openLevelup();
  const after = levelInfo().lv;
  if (after > before) addFloater(player.x, player.y - 60, `账号升级 Lv.${after}！`, '#FAC775', 1.3);
}

function onKill(m) {
  kills++;
  if (window.AUDIO) AUDIO.kill(m);
  const cfg = CONFIG.monsters[m.type];
  const tb = 1 + (m.tier || 0) * 0.6;
  const farMul = 1 + Math.min(0.6, Math.hypot(m.x - runSpawn[0], m.y - runSpawn[1]) / 6000);   // 离出生点越远收益越高
  const gain = Math.round(cfg.coin * diff().coinMul * tb * (stats.coinMul || 1) * farMul);
  grantCoins(gain);
  grantXp(Math.round(cfg.xp * tb * (stats.xpMul || 1)));
  addFloater(m.x, m.y - 40, `+${gain}`, '#FAC775');
  dropFrom(m);
  if (cfg.explodes) spawnExplosion(m.x, m.y);
  if (cfg.boss) {
    boss = null;
    nextBossT = playTime + CONFIG.bossSchedule.gap;
    grantCoins(100);                                  // 击杀分红
    for (let k = 0; k < 6; k++) {                     // 金币雨
      const a = Math.random() * Math.PI * 2, dd = 30 + Math.random() * 70;
      spawnPickup('gold', m.x + Math.cos(a) * dd, m.y + Math.sin(a) * dd);
    }
    spawnPickup('meat', m.x, m.y + 40);
    addFloater(m.x, m.y - 110, cfg.bossName + ' 被击败！', '#FFD27A', 3.2);
  }
}

// 局内购物立即生效：武器/装备换算属性（血量上限提升的部分直接补上）、精灵换人、佣兵入场/升级
function applyLoadout() {
  if (!player) return;
  const oldMax = stats.maxHp;
  recomputeStats();
  if (stats.maxHp > oldMax) player.hp += stats.maxHp - oldMax;
  player.hp = Math.min(player.hp, stats.maxHp);
  player.weaponId = meta.weapon;
  if (!pets.length || pets[0].id !== meta.activePet) {
    pets = (meta.activePet ? [meta.activePet] : []).map((id, i) => ({
      id, slot: i,
      x: player.x + CONFIG.petSlots[i][0], y: player.y + CONFIG.petSlots[i][1],
      state: 'idle', animT: Math.random(), atkCd: 0.5, casted: false, target: null, flip: false,
    }));
  }
  for (const cls of ['pawn', 'warrior', 'archer']) {
    const tier = meta.mercTier[cls];
    if (tier < 0) continue;
    const cfg = CONFIG.mercs[cls];
    const mul = 1 + tier * 0.5;
    const mc = mercs.find(m => m.cls === cls);
    if (!mc) {
      mercs.push({
        cls, tier, maxHp: Math.round(cfg.hp * mul), hp: Math.round(cfg.hp * mul), dmg: Math.round(cfg.damage * mul),
        x: player.x + CONFIG.mercSlots[cls][0], y: player.y + CONFIG.mercSlots[cls][1],
        state: 'idle', animT: Math.random(), atkCd: 1, hitDone: false, target: null, flip: false, deadT: 0,
      });
    } else if (mc.tier !== tier) {
      mc.tier = tier;
      mc.maxHp = Math.round(cfg.hp * mul);
      mc.hp = mc.maxHp;                 // 升级即满血归队
      mc.dmg = Math.round(cfg.damage * mul);
      if (mc.state === 'dead') { mc.state = 'idle'; mc.deadT = 0; }
    }
  }
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

  player.dashCd = (player.dashCd || 0) - dt;
  if (player.dashT > 0) {                // 冲刺：高速位移 + 短无敌
    player.dashT -= dt;
    const sp = stats.speed * CONFIG.dash.mul;
    const nx = player.x + player.dashDx * sp * dt, ny = player.y + player.dashDy * sp * dt;
    if (MAPGEN.walkable(nx, player.y)) player.x = nx;
    if (MAPGEN.walkable(player.x, ny)) player.y = ny;
    player.invuln = Math.max(player.invuln, 0.06);
    player.moving = true;
    player.animT += dt;                  // 跑动帧
  } else {
  player.moving = input.moveX !== 0 || input.moveY !== 0;
  if (player.moving) {
    player.dirX = input.moveX;          // 记录移动朝向，佣兵/精灵列队在身后
    player.dirY = input.moveY;
    const nx = player.x + input.moveX * stats.speed * dt;
    const ny = player.y + input.moveY * stats.speed * dt;
    if (MAPGEN.walkable(nx, player.y)) player.x = nx;
    if (MAPGEN.walkable(player.x, ny)) player.y = ny;
    player.phase = (player.phase + dt * 2.2) % 1;
  }
  }
  updateCam();
  if (stats.regen && player.hp > 0) player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
  player.fireCd -= dt;
  player.muzzle -= dt;
  player.invuln -= dt;
  player.animT += dt;

  // 自动锁定 + 自动开火
  // 瞄准角相对固定点（身体中心+手部高度）计算，不随朝向偏移，避免目标在正上/正下时来回翻面
  const SPR = CONFIG.player.sprite;
  let target = null, bestScore = Infinity;        // 威胁加权锁定：优先投弹手/自爆桶/Boss
  for (const m of monsters) {
    if (m.dying) continue;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d > 520) continue;
    const sc = d / (CONFIG.threat[m.type] || 1);
    if (sc < bestScore) { bestScore = sc; target = m; }
  }
  player.lockTarget = target;
  if (target) {
    const gx = player.x, gy = player.y + SPR.handY;
    const d = Math.hypot(target.x - gx, target.y - gy) || 1;
    player.aim.x = (target.x - gx) / d;
    player.aim.y = (target.y - gy) / d;
    const wpn = stats.weapon;
    if (player.fireCd <= 0 && bullets.length < CONFIG.bullet.max) {
      const base = Math.atan2(player.aim.y, player.aim.x);
      const tip = heroGunTip(player.weaponId);
      const ax = gx + player.face * SPR.handX;             // 持枪锚点（子弹从枪口出生）
      for (let i = 0; i < wpn.pellets; i++) {
        let ang = base;
        if (wpn.pellets > 1) ang += wpn.spread * (i / (wpn.pellets - 1) - 0.5) * 2;
        else if (wpn.spread > 0) ang += (Math.random() - 0.5) * 2 * wpn.spread;
        const bx = ax + Math.cos(base) * tip, by = gy + Math.sin(base) * tip;
        bullets.push({
          x: bx, y: by, ox: bx, oy: by, maxD: wpn.range || 0,
          vx: Math.cos(ang) * wpn.speed, vy: Math.sin(ang) * wpn.speed,
          r: wpn.bulletR, dmg: wpn.damage, pierce: wpn.pierce, hit: [], vis: wpn.bullet,
        });
      }
      player.fireCd = 1 / wpn.fireRate;
      player.muzzle = 0.07;
      if (window.AUDIO) AUDIO.shoot(player.weaponId);
    }
  } else if (player.moving) {
    player.aim.x = input.moveX;
    player.aim.y = input.moveY;
  }
  // 朝向迟滞带：瞄准接近竖直时保持原朝向，杜绝翻面抖动
  if (player.aim.x > SPR.faceDead) player.face = 1;
  else if (player.aim.x < -SPR.faceDead) player.face = -1;
  // 背向移动（面朝怪物倒退走）时跑步动画倒放，腿部与移动方向一致
  player.backpedal = player.moving && input.moveX * player.face < 0;

  // 子弹
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.hypot(b.x - player.x, b.y - player.y) > 800) { bullets.splice(i, 1); continue; }
    if (b.maxD && Math.hypot(b.x - b.ox, b.y - b.oy) > b.maxD) { bullets.splice(i, 1); continue; }   // 短射程武器（烈焰喷射器）
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
    const pbx = -(player.dirX || 0), pby = -(player.dirY ?? 1);   // 精灵也列队在身后侧翼
    const tx = player.x + pbx * 56 + pby * 46;
    const ty = player.y + pby * 56 - pbx * 46;
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
        const t = nearestMonster(pet.x, pet.y, CONFIG.petRange);
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
        if (t && !t.dying) {       // 朝目标发射元素技能弹
          const sx = pet.x, sy = pet.y - 28;
          const d = Math.hypot(t.x - sx, t.y - sy) || 1;
          const sp = CONFIG.petProj.speed;
          petProjs.push({
            kind: cfg.effect, x: sx, y: sy, vx: (t.x - sx) / d * sp, vy: (t.y - sy) / d * sp,
            dmg: cfg.damage, slow: cfg.slow || 0, kb: cfg.kb || 0, aoe: cfg.aoe || 0, t: 0,
          });
        }
      }
      if (frame >= ps.cols) { pet.state = 'idle'; pet.animT = 0; pet.atkCd = cfg.cooldown * (stats.petCd || 1); pet.target = null; }
    }
  }

  // 精灵技能弹：飞行 → 命中爆发（爆系溅射 / 水系击退 / 冰系减速）
  for (let i = petProjs.length - 1; i >= 0; i--) {
    const p = petProjs[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.t > CONFIG.petProj.life) { petProjs.splice(i, 1); continue; }
    for (const m of monsters) {
      if (m.dying) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < CONFIG.petProj.radius + CONFIG.monsters[m.type].radius) {
        const sp = Math.hypot(p.vx, p.vy);
        damageMonster(m, p.dmg, p.kb ? p.vx / sp * p.kb : 0, p.kb ? p.vy / sp * p.kb : 0);
        if (p.slow && !m.dying) m.slowT = p.slow;
        if (p.aoe) {
          for (const o of monsters) {
            if (o === m || o.dying) continue;
            if (Math.hypot(o.x - m.x, o.y - m.y) < p.aoe) damageMonster(o, Math.round(p.dmg * 0.6), 0, 0);
          }
        }
        effects.push({ kind: p.kind, target: m, x: m.x, y: m.y - 20, animT: 0 });   // 命中爆发动画
        petProjs.splice(i, 1);
        break;
      }
    }
  }

  // 命中爆发动画（纯视觉，跟随目标）
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const cfg = CONFIG.effects[e.kind];
    e.animT += dt;
    if (e.target && !e.target.dying) { e.x = e.target.x; e.y = e.target.y - 20; }
    if (Math.floor(e.animT * cfg.fps) >= cfg.frames) effects.splice(i, 1);
  }

  // Boss 触发 + 召唤
  if (!boss && playTime >= nextBossT) spawnBoss();
  if (boss) {
    if (boss.dying || !monsters.includes(boss)) boss = null;
    else {
      const bc = CONFIG.monsters[boss.type];
      // 俯冲蓄力 → 起飞
      if (boss.dashDelay != null && boss.dashDelay > 0) {
        boss.dashDelay -= dt;
        if (boss.dashDelay <= 0) {
          const [tx, ty] = boss.dashTo;
          const dd = Math.hypot(tx - boss.x, ty - boss.y) || 1;
          boss.dashT = Math.min(0.85, (dd + 100) / 880);
          boss.dashVx = (tx - boss.x) / dd * 880;
          boss.dashVy = (ty - boss.y) / dd * 880;
          boss.dashHit = false;
        }
      }
      // 技能轮换（俯冲途中不施放）
      boss.skillCd = (boss.skillCd == null ? 3.2 : boss.skillCd) - dt;
      if (boss.skillCd <= 0 && !(boss.dashT > 0) && !(boss.dashDelay > 0)) {
        const kit = BOSS_KITS[boss.type] || ['slam'];
        bossCast(kit[(boss.kitIdx = boss.kitIdx || 0) % kit.length]);
        boss.kitIdx++;
        boss.skillCd = 3.6 + Math.random() * 1.4;
      }
      if (bc.summon) {
        boss.summonCd -= dt;
        if (boss.summonCd <= 0) {
          boss.summonCd = bc.summon.gap;
          for (let k = 0; k < bc.summon.count; k++) {
            const a = Math.random() * Math.PI * 2, dd = 70 + Math.random() * 50;
            const sx = boss.x + Math.cos(a) * dd, sy = boss.y + Math.sin(a) * dd;
            if (MAPGEN.walkable(sx, sy)) monsters.push(makeMonster(bc.summon.type, sx, sy));
          }
          addFloater(boss.x, boss.y - 90, '召唤小弟！', '#FFB0B0', 1.2);
        }
      }
    }
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
    m.rageT = (m.rageT || 0) - dt;
    if (m.dying) {
      const da = cfg.anims.death;
      const dur = da ? da.frames / da.fps + 0.3 : 0.45;
      m.dying += dt;
      if (m.dying > dur) monsters.splice(i, 1);
      continue;
    }
    const dx = player.x - m.x, dy = player.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 1500 && !cfg.boss) { monsters.splice(i, 1); continue; }   // 被甩远的怪直接回收（Boss 不回收）
    m.atkCd -= dt;

    if (m.dashT > 0) {                 // Boss 俯冲：高速冲撞，命中一次重伤
      m.dashT -= dt;
      const nx = m.x + m.dashVx * dt, ny = m.y + m.dashVy * dt;
      if (MAPGEN.walkable(nx, m.y)) m.x = nx;
      if (MAPGEN.walkable(m.x, ny)) m.y = ny;
      m.flip = m.dashVx < 0;
      if (!m.dashHit && Math.hypot(player.x - m.x, player.y - m.y) < cfg.radius + CONFIG.player.radius) {
        m.dashHit = true;
        hurtPlayer(cfg.damage * 1.2, (cfg.bossName || '魔王') + '的俯冲');
        spawnFx('shockwave', m.x, m.y + 6, { r: 130, color: '#9fd0ff', life: 0.4 });
      }
      continue;
    }

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
            hurtPlayer(cfg.damage * (m.dmgMul || 1), (cfg.bossName || CONFIG.monsterNames[m.type] || '怪物') + '的攻击');
            if (cfg.fireFx) spawnFireFx(player.x, player.y);
          }
          if (cfg.boss) spawnFx('shockwave', m.x, m.y + 6, { r: cfg.attackRange * 1.7, color: '#ffd27a', life: 0.45 });
        } else {
          const p = cfg.projectile;
          const n = cfg.barrage || 1, baseA = Math.atan2(dy, dx);
          for (let j = 0; j < n; j++) {
            const a = baseA + (n > 1 ? (j / (n - 1) - 0.5) * 0.7 : 0);
            eprojs.push({ type: m.type, x: m.x, y: m.y - 10, vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, animT: 0 });
          }
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
      const spd = cfg.speed * (m.slowT > 0 ? 0.5 : 1) * (m.rageT > 0 ? 1.5 : 1);
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
      hurtPlayer(CONFIG.monsters[e.type].damage, '孢子弹幕');
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
        grantCoins(25);
        addFloater(c.camp.x, c.camp.y - 80, '营地肃清 +25 金币', '#FAC775', 1.4);
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
  updateFx(dt);

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    f.y -= 32 * dt;
    if (f.t >= f.life) floaters.splice(i, 1);
  }

  // Boss 持续区域（毒雾）：踩入周期掉血
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z.delay > 0) { z.delay -= dt; continue; }
    if (playTime > z.until) { zones.splice(i, 1); continue; }
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = z.tickCd;
      if (Math.hypot(player.x - z.x, player.y - z.y) < z.r + CONFIG.player.radius * 0.5) hurtPlayer(z.dmg, '毒雾');
    }
  }
}

function gameOver() {
  state = 'gameover';
  if (window.AUDIO) AUDIO.gameOver();
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
  // 雪原覆盖（低频生物群系，边缘渐变）
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!MAPGEN.landAt(tx, ty)) continue;
      const sn = MAPGEN.snowAt(tx, ty);
      if (sn > 0) {
        ctx.globalAlpha = sn * 0.48;
        ctx.fillStyle = '#e9eefb';
        ctx.fillRect(tx * t, ty * t, t, t);
      }
    }
  }
  ctx.globalAlpha = 1;

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
  if (cfg.boss && !m.dying) {                          // Boss 脚下脉动危险光环
    ctx.save();
    const pl = 0.5 + 0.5 * Math.sin(worldT * 4);
    ctx.globalAlpha = 0.16 + 0.1 * pl; ctx.fillStyle = '#e23b4e';
    ctx.beginPath(); ctx.ellipse(m.x, m.y + 14, cfg.radius * 1.7, cfg.radius * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (m.slowT > 0 || m.rageT > 0) {        // 状态色环（替代昂贵的逐帧 ctx.filter）
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = m.slowT > 0 ? '#6fb8ff' : '#ff5040';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + 12, cfg.radius + 10, (cfg.radius + 10) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.translate(m.x, m.y - cfg.bodyOffsetY * cfg.scale);
  if (m.flip) ctx.scale(-1, 1);
  const img = cfg.tint ? tintedImg(m.type, key) : (cfg.tierSheets ? images[m.type].tiers[m.tier] : images[m.type][key]);
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
  const ps = CONFIG.petSheet;
  const size = ps.frame * 0.55;
  const row = pet.state === 'attack' ? 1 : 0;
  const fps = pet.state === 'attack' ? ps.attackFps : ps.idleFps;
  let f = Math.floor(pet.animT * fps);
  f = pet.state === 'attack' ? Math.min(f, ps.cols - 1) : f % ps.cols;
  shadow(pet.x, pet.y + size * 0.30, size * 0.22);
  ctx.save();
  ctx.translate(pet.x, pet.y);
  // pet.flip = 想面向左；素材默认原生朝左（个别 face:'right' 的原生朝右），按需镜像
  const nativeRight = CONFIG.pets[pet.id].face === 'right';
  const mirror = nativeRight ? pet.flip : !pet.flip;
  if (mirror) ctx.scale(-1, 1);
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

// 精灵技能弹：元素特效首帧做弹体，朝飞行方向旋转 + 轻微脉动
function drawPetProj(p) {
  const cfg = CONFIG.effects[p.kind];
  const s = cfg.size * (0.42 + Math.sin(p.t * 22) * 0.05);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.drawImage(effectImgs[p.kind], 0, 0, cfg.size, cfg.size, -s / 2, -s / 2, s, s);
  ctx.restore();
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
  for (const z of zones) {
    if (z.delay > 0) continue;
    const pul = 0.5 + 0.5 * Math.sin(worldT * 5 + z.x);
    ctx.globalAlpha = 0.22 + 0.12 * pul;
    ctx.fillStyle = '#74b82e';
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#4f8a18'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * (0.8 + 0.2 * pul), z.r * 0.55 * (0.8 + 0.2 * pul), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

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
  order.push({ y: player.y + 6, fn: () => { shadow(player.x, player.y + 38, 26); drawHero(ctx, player.x, player.y, player); } });   // 贴近平局时主角优先在前，避免被佣兵闪烁遮挡
  order.sort((a, b) => a.y - b.y);
  for (const o of order) o.fn();

  eprojs.forEach(drawEproj);
  dynamites.forEach(drawDynamiteE);
  arrows.forEach(drawArrowE);
  bullets.forEach(drawBullet);
  petProjs.forEach(drawPetProj);
  effects.forEach(drawEffectE);
  fireFxs.forEach(drawFireFxE);
  booms.forEach(drawBoom);
  fxList.forEach(drawFx);

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
  ctx.fillText(`HP ${Math.ceil(player.hp)}/${stats.maxHp}`, 24, 25);

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
  ctx.fillStyle = C.hpBack;                       // 局内升级进度条
  ctx.fillRect(W / 2 - 70, 40, 140, 7);
  ctx.fillStyle = '#FAC775';
  ctx.fillRect(W / 2 - 70, 40, 140 * Math.min(1, runXp / runXpNeed), 7);
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText(`局内 Lv.${runLv}`, W / 2, 60);

  ctx.textAlign = 'right';
  ctx.font = '16px -apple-system, sans-serif';
  ctx.fillText(`击杀 ${kills}`, W - 100, 30);
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText(stats.weapon.name, W - 100, 48);

  drawPauseBtn();
  iconBtn('gameShop', GAME_SHOP_BTN, 6, 'blue');     // 局内商城（进入即暂停）
  iconBtn('dash', DASH_BTN, 0, (player.dashCd || 0) > 0 ? 'disable' : 'hover', ICON_DASH);   // 冲刺双箭头
  if ((player.dashCd || 0) > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(player.dashCd), DASH_BTN.x + DASH_BTN.w / 2, DASH_BTN.y + DASH_BTN.h / 2 + 5);
  }
  drawBossBar();
}

function drawBossBar() {
  if (!boss || boss.dying || !monsters.includes(boss)) return;
  const cfg = CONFIG.monsters[boss.type];
  const bw = 380, bx = W / 2 - bw / 2, by = 66;
  ctx.fillStyle = 'rgba(10,8,16,0.55)'; ctx.fillRect(bx - 8, by - 22, bw + 16, 44);
  ctx.fillStyle = '#FFE0A0'; ctx.font = 'bold 15px -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('☠ ' + cfg.bossName, W / 2, by - 6);
  ctx.fillStyle = '#2a0e16'; ctx.fillRect(bx, by, bw, 14);
  ctx.fillStyle = '#e23b4e'; ctx.fillRect(bx, by, bw * Math.max(0, boss.hp) / boss.maxHp, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 14);
}

const PAUSE_BTN = { x: W - 50, y: 10, w: 38, h: 38 };
const DASH_BTN = { x: W - 64, y: H - 64, w: 50, h: 50 };
const PAUSE_DIFF_BTNS = ['easy', 'hard', 'nightmare'].map((id, i) => ({ id, x: W / 2 - 146 + i * 100, y: H / 2 + 4, w: 92, h: 44 }));
const GAME_SHOP_BTN = { x: W - 94, y: 10, w: 38, h: 38 };
function drawPauseBtn() {
  iconBtn('pause', PAUSE_BTN, 1, state === 'paused' ? 'hover' : 'blue');   // 齿轮 = 设置/暂停
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
const DIFF_BTNS = ['easy', 'hard', 'nightmare'].map((id, i) => ({ id, x: W / 2 - 150 + i * 110, y: H / 2 - 38, w: 80, h: 56 }));
const DIFF_ICONS = [3, 4, 5];   // 图标 1/2/3 对应 简单/困难/噩梦
const START_BTN = { x: W / 2 - 110, y: H / 2 + 46, w: 220, h: 52 };
const SHOP_BTN = { x: W / 2 - 110, y: H / 2 + 110, w: 220, h: 46 };

function drawTitle() {
  ctx.fillStyle = 'rgba(10,10,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  nine(uiBanner.h, W / 2 - 290, H / 2 - 218, 580, 112);
  ctx.fillStyle = UI_TEXT;
  ctx.textAlign = 'center';
  ctx.font = '36px -apple-system, sans-serif';
  ctx.fillText('猫猫枪手：无尽兽潮', W / 2, H / 2 - 148);
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillStyle = C.hudDim;
  ctx.fillText('无尽兽潮 · 自动锁定射击 · 精灵与佣兵伴你作战', W / 2, H / 2 - 90);
  ctx.fillText('移动：方向键 / WASD（手机拖动摇杆）　难度数字键 1-3　商城 B', W / 2, H / 2 - 68);

  for (let i = 0; i < DIFF_BTNS.length; i++) {
    const b = DIFF_BTNS[i];
    const sel = meta.difficulty === b.id;
    iconBtn('diff' + i, { x: b.x + 8, y: b.y, w: 56, h: 56 }, DIFF_ICONS[i], sel ? 'hover' : 'blue');
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
  ctx.fillText(`Lv.${li.lv}　武器：${CONFIG.weapons[meta.weapon].name}　精灵 ${meta.ownedPets.length}/16${meta.activePet ? '·出战' + CONFIG.pets[meta.activePet].name : ''}　佣兵 ${Object.values(meta.mercTier).filter(t => t >= 0).length}/3`, W / 2 - 88, H - 28);
}

// ---------- 商城（四页签：武器/装备/精灵/佣兵） ----------
const SHOP_TABS = [
  { id: 'weapon', label: '武器', color: 'Red' },
  { id: 'equip', label: '装备', color: 'Blue' },
  { id: 'pet', label: '精灵', color: 'Yellow' },
  { id: 'merc', label: '佣兵', color: 'Red' },
  { id: 'hero', label: '角色', color: 'Blue' },
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
  iconBtn('back', SHOP_BACK, 0, 'red');   // icon 01 = X

  let tabX = 50;
  for (const tab of SHOP_TABS) {
    ribbonTab('tab_' + tab.id, { x: tabX, y: 84, w: 150, h: 44 }, tab.label, tab.color, shopTab === tab.id);
    tabX += 174;
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
  } else if (shopTab === 'hero') {
    // 人物简介：当前属性总览（含装备/精灵/佣兵加成）
    const st = effectiveStats();
    const wpn = st.weapon;
    cardBg({ x: 60, y: 148, w: 260, h: 332 }, 'equipped', false);
    const fr = HERO_FRAMES.idle[Math.floor(worldT * 8) % HERO_FRAMES.idle.length];
    ctx.save();
    ctx.translate(190, 252);
    ctx.scale(-1.45, 1.45);
    ctx.drawImage(heroImgs.idle, fr.x, fr.y, fr.w, fr.h, -64, -60, fr.w, fr.h);
    ctx.restore();
    drawPixelIcon((HERO_GUNS[meta.weapon] || HERO_GUNS.pistol).img, 152, 328, 76);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI_TEXT;
    ctx.font = '16px -apple-system, sans-serif';
    ctx.fillText(`Lv.${li.lv} 猫猫枪手`, 190, 432);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(90,58,26,0.75)';
    ctx.fillText(`难度：${diff().name}`, 190, 456);
    const lines = [
      ['生命上限', `${st.maxHp}`],
      ['移动速度', `${Math.round(st.speed)} px/s`],
      ['受击无敌', `${st.invuln.toFixed(2)} 秒`],
      ['武器', wpn.name],
      ['单发伤害', `${wpn.damage}${wpn.pellets > 1 ? ' ×' + wpn.pellets : ''}${wpn.pierce ? '（穿透' + wpn.pierce + '）' : ''}`],
      ['射速', `${wpn.fireRate.toFixed(1)} 发/秒`],
      ['每秒输出', `${Math.round(wpn.damage * wpn.fireRate * wpn.pellets)}`],
      ['装备', meta.ownedEquip.length ? meta.ownedEquip.map(id => CONFIG.equipment[id].name).join('、') : '无'],
      ['出战精灵', meta.activePet ? `${CONFIG.pets[meta.activePet].name}·${CONFIG.pets[meta.activePet].element}（伤${CONFIG.pets[meta.activePet].damage}）` : '无'],
      ['佣兵', ['pawn', 'warrior', 'archer'].filter(c => meta.mercTier[c] >= 0).map(c => `${CONFIG.mercs[c].name}${CONFIG.mercTierNames[meta.mercTier[c]]}`).join('、') || '无'],
    ];
    ctx.textAlign = 'left';
    lines.forEach(([k, v], i) => {
      const yy = 180 + i * 33;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.7)';
      ctx.fillText(k, 360, yy);
      ctx.fillStyle = UI_TEXT;
      ctx.font = '15px -apple-system, sans-serif';
      ctx.fillText(String(v), 472, yy);
    });
  } else if (shopTab === 'pet') {
    // 16 只精灵两列网格；点击已拥有的切换出战（每次只能带一只）
    const colW = (rw - 16) / 2;
    Object.entries(CONFIG.pets).forEach(([id, item], i) => {
      const col = i % 2, rowI = Math.floor(i / 2);
      const r = { x: rx + col * (colW + 16), y: 142 + rowI * 46, w: colW, h: 42, kind: 'pet', id };
      const owned = meta.ownedPets.includes(id);
      const active = meta.activePet === id;
      const locked = li.lv < item.level;
      cardBg(r, active ? 'equipped' : locked ? 'locked' : 'normal', uiPressedId === 'row_pet_' + id);
      ctx.save();
      if (locked) ctx.globalAlpha = 0.45;
      ctx.drawImage(petIcons[id], r.x + 8, r.y + 6, 26, 30);
      ctx.restore();
      ctx.fillStyle = locked ? 'rgba(90,58,26,0.55)' : UI_TEXT;
      ctx.font = '13px -apple-system, sans-serif';
      ctx.fillText(`${item.name}·${item.element}`, r.x + 42, r.y + 18);
      ctx.font = '10px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.7)';
      ctx.fillText(`伤${item.damage} · ${item.cooldown}s${item.slow ? ' · 减速' : item.aoe ? ' · 溅射' : item.kb ? ' · 击退' : ''}`, r.x + 42, r.y + 33);
      ctx.textAlign = 'right';
      ctx.font = '12px -apple-system, sans-serif';
      if (locked) {
        ctx.fillStyle = 'rgba(90,58,26,0.6)';
        ctx.fillText(`Lv.${item.level}`, r.x + colW - 10, r.y + 26);
      } else if (!owned) {
        ctx.fillStyle = meta.coins >= item.price ? '#854F0B' : '#A32D2D';
        ctx.fillText(`${item.price} 金`, r.x + colW - 10, r.y + 26);
      } else if (active) {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText('出战中', r.x + colW - 10, r.y + 26);
      } else {
        ctx.fillStyle = UI_TEXT;
        ctx.fillText('点击出战', r.x + colW - 10, r.y + 26);
      }
      ctx.textAlign = 'left';
      shopRows.push(r);
    });
  } else if (shopTab === 'equip') {
    // 12 件装备两列网格（购买后被动叠加生效）
    const colW = (rw - 16) / 2;
    Object.entries(CONFIG.equipment).forEach(([id, item], i) => {
      const col = i % 2, rowI = Math.floor(i / 2);
      const r = { x: rx + col * (colW + 16), y: 142 + rowI * 54, w: colW, h: 50, kind: 'equip', id };
      const owned = meta.ownedEquip.includes(id);
      const locked = li.lv < item.level;
      cardBg(r, owned ? 'equipped' : locked ? 'locked' : 'normal', uiPressedId === 'row_equip_' + id);
      ctx.save();
      if (locked) ctx.globalAlpha = 0.45;
      ctx.drawImage(uiBanner.carved, r.x + 6, r.y + 5, 40, 40);
      drawPixelIcon(EQUIP_ICONS[id], r.x + 10, r.y + 9, 32);
      ctx.restore();
      ctx.fillStyle = locked ? 'rgba(90,58,26,0.55)' : UI_TEXT;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(item.name, r.x + 54, r.y + 21);
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.7)';
      ctx.fillText(item.desc, r.x + 54, r.y + 38);
      ctx.textAlign = 'right';
      ctx.font = '13px -apple-system, sans-serif';
      if (locked) {
        ctx.fillStyle = 'rgba(90,58,26,0.6)';
        ctx.fillText(`Lv.${item.level}`, r.x + colW - 10, r.y + 30);
      } else if (!owned) {
        ctx.fillStyle = meta.coins >= item.price ? '#854F0B' : '#A32D2D';
        ctx.fillText(`${item.price} 金`, r.x + colW - 10, r.y + 30);
      } else {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText('已生效', r.x + colW - 10, r.y + 30);
      }
      ctx.textAlign = 'left';
      shopRows.push(r);
    });
  } else {
    // 武器两列网格（与装备页同构，可容 14 把）
    const colW = (rw - 16) / 2;
    Object.entries(CONFIG.weapons).forEach(([id, item], i) => {
      const col = i % 2, rowI = Math.floor(i / 2);
      const r = { x: rx + col * (colW + 16), y: 142 + rowI * 54, w: colW, h: 50, kind: 'weapon', id };
      const owned = meta.owned.includes(id);
      const locked = li.lv < item.level;
      const equipped = meta.weapon === id;
      cardBg(r, equipped ? 'equipped' : locked ? 'locked' : 'normal', uiPressedId === 'row_weapon_' + id);
      ctx.save();
      if (locked) ctx.globalAlpha = 0.45;
      ctx.drawImage(uiBanner.carved, r.x + 6, r.y + 5, 40, 40);
      drawPixelIcon(HERO_GUNS[id].img, r.x + 10, r.y + 9, 32);
      ctx.restore();
      ctx.fillStyle = locked ? 'rgba(90,58,26,0.55)' : UI_TEXT;
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(item.name, r.x + 54, r.y + 21);
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(90,58,26,0.7)';
      ctx.fillText(item.desc, r.x + 54, r.y + 38);
      ctx.textAlign = 'right';
      ctx.font = '13px -apple-system, sans-serif';
      if (locked) {
        ctx.fillStyle = 'rgba(90,58,26,0.6)';
        ctx.fillText(`Lv.${item.level}`, r.x + colW - 10, r.y + 30);
      } else if (!owned) {
        ctx.fillStyle = meta.coins >= item.price ? '#854F0B' : '#A32D2D';
        ctx.fillText(`${item.price} 金`, r.x + colW - 10, r.y + 30);
      } else if (equipped) {
        ctx.fillStyle = '#1D9E75';
        ctx.fillText('使用中', r.x + colW - 10, r.y + 30);
      } else {
        ctx.fillStyle = UI_TEXT;
        ctx.fillText('点击装备', r.x + colW - 10, r.y + 30);
      }
      ctx.textAlign = 'left';
      shopRows.push(r);
    });
  }
}

// ---------- 局内升级三选一 ----------
const LVL_CARDS = [0, 1, 2].map(i => ({ x: W / 2 - 392 + i * 268, y: H / 2 - 64, w: 248, h: 158 }));
function drawLevelup() {
  ctx.fillStyle = 'rgba(10,10,24,0.62)';
  ctx.fillRect(0, 0, W, H);
  ribbonHeader('Yellow', W / 2, H / 2 - 152, 340, `升级！选择一项强化（局内 Lv.${runLv}）`, 17);
  lvlChoices.forEach((u, i) => {
    const r = LVL_CARDS[i];
    cardBg(r, 'normal', uiPressedId === 'lvl' + i);
    ctx.drawImage(uiIcon.Regular[3 + i], r.x + r.w / 2 - 16, r.y + 14, 32, 32);
    ctx.fillStyle = UI_TEXT;
    ctx.font = '17px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(u.name, r.x + r.w / 2, r.y + 76);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(90,58,26,0.8)';
    ctx.fillText(u.desc, r.x + r.w / 2, r.y + 102);
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(90,58,26,0.55)';
    ctx.fillText(`按 ${i + 1} 或点击`, r.x + r.w / 2, r.y + 134);
  });
}

// ---------- 结算 ----------
const RESTART_BTN = { x: W / 2 - 230, y: H / 2 + 96, w: 220, h: 52 };
const GO_SHOP_BTN = { x: W / 2 + 10, y: H / 2 + 96, w: 220, h: 52 };

function deathTip(src) {
  if (src.includes('爆') || src.includes('自爆')) return '提示：自爆桶贴脸前先打死，TNT 红圈落点别站；空格冲刺可救命';
  if (src.includes('孢子') || src.includes('毒')) return '提示：侧向移动躲弹幕，绿色毒雾别久留；疾跑靴值得买';
  if (src.includes('俯冲')) return '提示：蓝圈是俯冲落点，往垂直方向闪开';
  if (src.includes('重压') || src.includes('旋风') || src.includes('斩') || src.includes('牢笼')) return '提示：红圈预警出现立刻离开，白骨牢笼要找缝隙钻';
  return '提示：被围殴时空格冲刺脱身；商城的皮甲和再生戒指能救命';
}

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
  if (lastKiller) {
    ctx.fillStyle = '#A32D2D';
    ctx.fillText(`死于：${lastKiller}`, W / 2, H / 2 + 26);
    ctx.fillStyle = C.hudDim;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(deathTip(lastKiller), W / 2, H / 2 + 50);
    ctx.font = '16px -apple-system, sans-serif';
  } else {
    ctx.fillText('按 R 重开 · 按 B 进商城', W / 2, H / 2 + 28);
  }
  skinBtn('restart', RESTART_BTN, '再来一局', 'primary', 20);
  skinBtn('goshop', GO_SHOP_BTN, '商城', 'secondary', 20);
}

const vigCanvas = (() => {            // 暗角 + 暖色统一层（预渲染，一次绘制开销）
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(W / 2, H / 2, H * 0.44, W / 2, H / 2, H * 0.80);
  rg.addColorStop(0, 'rgba(28,22,46,0)');
  rg.addColorStop(1, 'rgba(22,16,38,0.36)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,212,150,0.05)';
  g.fillRect(0, 0, W, H);
  return c;
})();

function draw() {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  drawWorldScene();
  ctx.drawImage(vigCanvas, 0, 0, W, H);
  if (state === 'title') { drawTitle(); }
  else if (state === 'shop') { drawShop(); }
  else {
    drawHUD();
    drawTouchControls();
    if (state === 'levelup') {
      drawLevelup();
    } else if (state === 'paused') {
      ctx.fillStyle = 'rgba(10,10,24,0.6)';
      ctx.fillRect(0, 0, W, H);
      nine(uiBanner.carved9, W / 2 - 220, H / 2 - 100, 440, 210);
      ctx.fillStyle = UI_TEXT;
      ctx.textAlign = 'center';
      ctx.font = '26px -apple-system, sans-serif';
      ctx.fillText('已暂停', W / 2, H / 2 - 56);
      ctx.font = '13px -apple-system, sans-serif';
      ctx.fillText('按 P 或点击右上角继续 · 数字键 1-3 或点击切换难度', W / 2, H / 2 - 28);
      for (let i = 0; i < PAUSE_DIFF_BTNS.length; i++) {
        const b = PAUSE_DIFF_BTNS[i];
        skinBtn('pdiff' + i, b, CONFIG.difficulties[b.id].name, meta.difficulty === b.id ? 'hover' : 'secondary', 15);
      }
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
let _bgmWant = '';
function syncBgm() {                              // BGM 跟随场景：Boss战 > 普通战斗 > 菜单
  if (!window.AUDIO) return;
  let want = 'menu';
  if (state === 'playing' || state === 'paused') want = (boss && !boss.dying) ? 'boss' : 'battle';
  if (want !== _bgmWant) { _bgmWant = want; AUDIO.startBGM(want); }
}
function tryDash() {
  if (state !== 'playing' || player.dashT > 0 || (player.dashCd || 0) > 0) return;
  let dx = input.moveX, dy = input.moveY;
  if (!dx && !dy) { dx = player.aim.x; dy = player.aim.y; }
  const d = Math.hypot(dx, dy) || 1;
  player.dashDx = dx / d;
  player.dashDy = dy / d;
  player.dashT = CONFIG.dash.dur;
  player.dashCd = CONFIG.dash.cd;
  spawnFx('shockwave', player.x, player.y + 16, { r: 64, color: '#cfe8ff', life: 0.28 });
}

function startGame() {
  state = 'playing';
  reset();
  if (window.AUDIO) AUDIO.unlock();
  if (!meta.tipSeen) {                   // 首局三句话教学
    meta.tipSeen = true;
    saveMeta();
    addFloater(player.x, player.y - 96, '自动开火：你只管走位！', '#9FE1CB', 4);
    addFloater(player.x, player.y + 72, '红圈 = 危险落点，赶紧离开', '#FFB0B0', 6);
    addFloater(player.x, player.y + 100, '空格 / 右下角按钮 = 冲刺闪避', '#9fd0ff', 8);
  }
}

function handleUI(dt) {
  uiTick(dt);
  if (lastTap) lastTap.t += dt;
  for (const code of input.keyPresses) {
    if (code === 'KeyM') { if (window.AUDIO) AUDIO.toggleMute(); continue; }
    if (code === 'KeyG' && state === 'playing') { nextBossT = 0; continue; }   // 调试：立即召唤 Boss
    if (state === 'levelup') {
      if (/^Digit[1-3]$/.test(code)) { uiPress('lvl' + (Number(code[5]) - 1)); chooseUpgrade(Number(code[5]) - 1); }
      continue;
    }
    if (state === 'playing' && code === 'Space') { tryDash(); continue; }
    if (state === 'title') {
      if (code === 'Digit1') { meta.difficulty = 'easy'; saveMeta(); }
      else if (code === 'Digit2') { meta.difficulty = 'hard'; saveMeta(); }
      else if (code === 'Digit3') { meta.difficulty = 'nightmare'; saveMeta(); }
      else if (code === 'KeyB') { shopFrom = 'title'; state = 'shop'; }
      else if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') { uiPress('start'); startGame(); }
    } else if (state === 'shop') {
      if (code === 'Escape' || code === 'KeyB') state = shopFrom === 'game' ? 'paused' : shopFrom === 'gameover' ? 'gameover' : 'title';
      else if (code === 'Digit1') shopTab = 'weapon';
      else if (code === 'Digit2') shopTab = 'equip';
      else if (code === 'Digit3') shopTab = 'pet';
      else if (code === 'Digit4') shopTab = 'merc';
    } else if (state === 'gameover') {
      if (code === 'KeyR') { uiPress('restart'); startGame(); }
      else if (code === 'KeyB') { shopFrom = 'gameover'; state = 'shop'; }
    } else if (state === 'paused' && /^Digit[1-3]$/.test(code)) {
      meta.difficulty = ['easy', 'hard', 'nightmare'][Number(code[5]) - 1];
      saveMeta();
    } else if (code === 'KeyB' && (state === 'playing' || state === 'paused')) {
      shopFrom = 'game';                 // 局内进商城：游戏逻辑自动暂停
      state = 'shop';
    } else if (code === 'KeyP' && (state === 'playing' || state === 'paused')) {
      state = state === 'playing' ? 'paused' : 'playing';
    }
  }
  for (const p of input.taps) {
    lastTap = { x: p.x, y: p.y, t: 0 };
    if (state === 'levelup') {
      for (let i = 0; i < LVL_CARDS.length; i++) {
        if (inRect(p, LVL_CARDS[i])) { uiPress('lvl' + i); chooseUpgrade(i); }
      }
      continue;
    }
    if (state === 'playing' && inRect(p, DASH_BTN)) { uiPress('dash'); tryDash(); continue; }
    if (state === 'title') {
      for (let i = 0; i < DIFF_BTNS.length; i++) {
        if (inRect(p, DIFF_BTNS[i])) { meta.difficulty = DIFF_BTNS[i].id; saveMeta(); uiPress('diff' + i); }
      }
      if (inRect(p, START_BTN)) { uiPress('start'); startGame(); }
      else if (inRect(p, SHOP_BTN)) { uiPress('shop'); shopFrom = 'title'; state = 'shop'; }
    } else if (state === 'shop') {
      if (inRect(p, SHOP_BACK)) {
        uiPress('back');
        state = shopFrom === 'game' ? 'paused' : shopFrom === 'gameover' ? 'gameover' : 'title';
      }
      let tabX = 50;
      for (const tab of SHOP_TABS) {
        if (inRect(p, { x: tabX, y: 78, w: 150, h: 54 })) shopTab = tab.id;
        tabX += 174;
      }
      for (const r of shopRows) {
        if (inRect(p, r)) {
          uiPress('row_' + r.kind + '_' + r.id);
          shopAction(r.kind, r.id);
          if (shopFrom === 'game') applyLoadout();   // 局内购买立即生效
        }
      }
    } else if (state === 'gameover') {
      if (inRect(p, RESTART_BTN)) { uiPress('restart'); startGame(); }
      else if (inRect(p, GO_SHOP_BTN)) { uiPress('goshop'); shopFrom = 'gameover'; state = 'shop'; }
    } else if (state === 'playing' || state === 'paused') {
      if (inRect(p, GAME_SHOP_BTN)) {
        uiPress('gameShop');
        shopFrom = 'game';
        state = 'shop';
      } else if (inRect(p, PAUSE_BTN)) {
        uiPress('pause');
        state = state === 'playing' ? 'paused' : 'playing';
      } else if (state === 'paused') {
        for (let i = 0; i < PAUSE_DIFF_BTNS.length; i++) {
          if (inRect(p, PAUSE_DIFF_BTNS[i])) { meta.difficulty = PAUSE_DIFF_BTNS[i].id; saveMeta(); uiPress('pdiff' + i); }
        }
      }
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
  ctx.imageSmoothingQuality = 'high';
  try {
    input.poll();
    handleUI(dt);
    if (state === 'playing') update(dt);
    draw();
    syncBgm();
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

let loadedImgs = 0, bootStarted = false;
function bootGame() {
  if (bootStarted) return;
  bootStarted = true;
  reset();
  requestAnimationFrame(loop);
}
function imgDone() {
  if (++loadedImgs >= pending.length) bootGame();
}
pending.forEach(img => {
  img.onload = imgDone;
  img.onerror = () => { console.error('加载失败: ' + img.src); imgDone(); };   // 缺图不卡启动
});
// 保底启动：缓存图片的 onload 偶发不触发计数（竞态），轮询兜底 + 8 秒强制开局
const bootPoll = setInterval(() => {
  if (bootStarted) { clearInterval(bootPoll); return; }
  if (pending.every(img => img.complete)) { clearInterval(bootPoll); bootGame(); }
}, 700);
setTimeout(bootGame, 8000);
