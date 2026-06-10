// 单位与实体系统：拾取物 / 羊 / 佣兵 / 箭矢 / 炸药 / 爆炸 / 场景物绘制
// 引用 main.js 的全局: player, monsters, stats, meta, damageMonster, hurtPlayer, addFloater, grantXp, grantCoins, worldT, diff
let pickups = [], sheepL = [], mercs = [], booms = [], dynamites = [], arrows = [], fireFxs = [];

function unitsReset() {
  pickups = []; sheepL = []; booms = []; dynamites = []; arrows = []; fireFxs = [];
  mercs = [];
  for (const cls of ['pawn', 'warrior', 'archer']) {
    const tier = meta.mercTier[cls];
    if (tier < 0) continue;
    const cfg = CONFIG.mercs[cls];
    const mul = 1 + tier * 0.5;
    mercs.push({
      cls, tier, maxHp: Math.round(cfg.hp * mul), hp: Math.round(cfg.hp * mul), dmg: Math.round(cfg.damage * mul),
      x: player.x + CONFIG.mercSlots[cls][0], y: player.y + CONFIG.mercSlots[cls][1],
      state: 'idle', animT: Math.random(), atkCd: 1, hitDone: false, target: null, flip: false, deadT: 0,
    });
  }
}

// ---------- 生成器 ----------
function spawnPickup(kind, x, y, src) {
  pickups.push({ kind, x, y, t: 0, life: 0, src: src || null });
}
function dropFrom(m) {
  const r = Math.random();
  if (r < CONFIG.dropRates.meat) spawnPickup('meat', m.x, m.y);
  else if (r < CONFIG.dropRates.meat + CONFIG.dropRates.gold) spawnPickup('gold', m.x, m.y);
  else if (r < CONFIG.dropRates.meat + CONFIG.dropRates.gold + CONFIG.dropRates.wood) spawnPickup('wood', m.x, m.y);
}
function spawnExplosion(x, y) { booms.push({ x, y, t: 0, done: false }); }
function spawnFireFx(x, y) { fireFxs.push({ x, y, t: 0 }); }
function throwDynamite(sx, sy, tx, ty) {
  const dur = Math.hypot(tx - sx, ty - sy) / CONFIG.dynamite.speed;
  dynamites.push({ sx, sy, tx, ty, t: 0, dur: Math.max(0.5, dur) });
}
function fireArrow(x, y, tx, ty, dmg, speed = 720) {
  const d = Math.hypot(tx - x, ty - y) || 1;
  arrows.push({ x, y, vx: (tx - x) / d * speed, vy: (ty - y) / d * speed, dmg, t: 0 });
}

function collectPickup(p, byText) {
  const cfg = CONFIG.pickups[p.kind];
  if (cfg.coins) { grantCoins(cfg.coins); }
  if (cfg.heal) { player.hp = Math.min(stats.maxHp, player.hp + cfg.heal); }
  if (cfg.xp) { grantXp(cfg.xp); }
  addFloater(p.x, p.y - 24, cfg.label, p.kind === 'gold' ? '#FAC775' : p.kind === 'meat' ? '#F09595' : '#C0DD97');
  if (p.src) p.src.out--;
}

// ---------- 更新 ----------
function updateUnits(dt) {
  // 拾取物：落地动画 → 漂浮待拾取，超时消失
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life += dt;
    if (p.life > CONFIG.pickupLife) { if (p.src) p.src.out--; pickups.splice(i, 1); continue; }
    if (Math.hypot(p.x - player.x, p.y - player.y) < 38) { collectPickup(p); pickups.splice(i, 1); }
  }
  // 羊：吃草 ↔ 蹦跳挪窝
  for (let i = sheepL.length - 1; i >= 0; i--) {
    const s = sheepL[i];
    s.animT += dt;
    if (s.dead) { sheepL.splice(i, 1); continue; }
    if (s.state === 'graze') {
      s.wait -= dt;
      if (s.wait <= 0) {
        const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
        const tx = s.x + Math.cos(a) * d, ty = s.y + Math.sin(a) * d;
        if (MAPGEN.walkable(tx, ty)) { s.state = 'bounce'; s.tx = tx; s.ty = ty; s.flip = tx < s.x; }
        else s.wait = 1;
      }
    } else {
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
      if (d < 6) { s.state = 'graze'; s.wait = 2 + Math.random() * 3; }
      else { s.x += dx / d * 65 * dt; s.y += dy / d * 65 * dt; }
    }
  }
  // 佣兵
  for (const mc of mercs) {
    const cfg = CONFIG.mercs[mc.cls];
    mc.animT += dt;
    mc.atkCd -= dt;
    if (mc.state === 'dead') {
      mc.deadT += dt;
      if (mc.deadT > CONFIG.mercRespawn) {
        mc.state = 'idle'; mc.hp = mc.maxHp; mc.deadT = 0;
        mc.x = player.x + CONFIG.mercSlots[mc.cls][0]; mc.y = player.y + CONFIG.mercSlots[mc.cls][1];
        addFloater(mc.x, mc.y - 40, cfg.name + ' 归队！', '#9FE1CB', 1.2);
      }
      continue;
    }
    if (mc.state === 'attack') {
      const a = cfg.attack;
      const frame = Math.floor(mc.animT * a.fps);
      if (!mc.hitDone && frame >= a.hitFrame) {
        mc.hitDone = true;
        if (mc.cls === 'archer') {
          if (mc.target && !mc.target.dying) fireArrow(mc.x, mc.y - 24, mc.target.x, mc.target.y, mc.dmg);
        } else if (mc.cls === 'warrior') {
          for (const m of monsters) {
            if (m.dying) continue;
            if (Math.hypot(m.x - mc.x, m.y - mc.y) < cfg.aoe + CONFIG.monsters[m.type].radius) damageMonster(m, mc.dmg, 0, 0);
          }
        } else if (mc.target && !mc.target.dying) {
          if (Math.hypot(mc.target.x - mc.x, mc.target.y - mc.y) < cfg.range + 20) damageMonster(mc.target, mc.dmg, 0, 0);
        }
      }
      if (frame >= a.frames) { mc.state = 'idle'; mc.animT = 0; mc.atkCd = cfg.cooldown; mc.target = null; }
      continue;
    }
    // 寻找攻击目标
    if (mc.atkCd <= 0) {
      let best = null, bd = mc.cls === 'archer' ? cfg.range : cfg.range;
      for (const m of monsters) {
        if (m.dying) continue;
        const d = Math.hypot(m.x - mc.x, m.y - mc.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) {
        mc.state = 'attack'; mc.animT = 0; mc.hitDone = false; mc.target = best; mc.flip = best.x < mc.x;
        continue;
      }
    }
    // 跟随阵位；侍从优先跑向战利品
    let tx = player.x + CONFIG.mercSlots[mc.cls][0];
    let ty = player.y + CONFIG.mercSlots[mc.cls][1];
    if (mc.cls === 'pawn' && pickups.length) {
      let best = null, bd = cfg.collectRange;
      for (const p of pickups) {
        const d = Math.hypot(p.x - mc.x, p.y - mc.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { tx = best.x; ty = best.y; }
    }
    const dx = tx - mc.x, dy = ty - mc.y, d = Math.hypot(dx, dy);
    if (d > 26) {
      const nx = mc.x + dx / d * 275 * dt, ny = mc.y + dy / d * 275 * dt;
      if (MAPGEN.walkable(nx, mc.y)) mc.x = nx;
      if (MAPGEN.walkable(mc.x, ny)) mc.y = ny;
      mc.moving = true;
      if (Math.abs(dx) > 4) mc.flip = dx < 0;
    } else mc.moving = false;
    // 分离推挤：不和主角/其他佣兵叠在一起
    const pd = Math.hypot(mc.x - player.x, mc.y - player.y);
    if (pd > 0 && pd < 46) {
      const px = mc.x + (mc.x - player.x) / pd * (46 - pd), py = mc.y + (mc.y - player.y) / pd * (46 - pd);
      if (MAPGEN.walkable(px, py)) { mc.x = px; mc.y = py; }
    }
    for (const other of mercs) {
      if (other === mc || other.state === 'dead') continue;
      const od = Math.hypot(mc.x - other.x, mc.y - other.y);
      if (od > 0 && od < 36) {
        const px = mc.x + (mc.x - other.x) / od * (36 - od) * 0.5, py = mc.y + (mc.y - other.y) / od * (36 - od) * 0.5;
        if (MAPGEN.walkable(px, py)) { mc.x = px; mc.y = py; }
      }
    }
    // 侍从代收
    if (mc.cls === 'pawn') {
      for (let i = pickups.length - 1; i >= 0; i--) {
        if (Math.hypot(pickups[i].x - mc.x, pickups[i].y - mc.y) < 34) { collectPickup(pickups[i]); pickups.splice(i, 1); }
      }
    }
  }
  // 炸药（抛物线）→ 爆炸
  for (let i = dynamites.length - 1; i >= 0; i--) {
    const dy = dynamites[i];
    dy.t += dt / dy.dur;
    if (dy.t >= 1) { spawnExplosion(dy.tx, dy.ty); dynamites.splice(i, 1); }
  }
  // 爆炸：dmgFrame 帧对玩家/怪物/佣兵/羊全域结算（桶被炸死会连锁）
  const ex = CONFIG.explosion;
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.t += dt;
    const frame = Math.floor(b.t * ex.fps);
    if (!b.done && frame >= ex.dmgFrame) {
      b.done = true;
      if (Math.hypot(player.x - b.x, player.y - b.y) < ex.radius + CONFIG.player.radius) hurtPlayer(ex.player);
      for (const m of monsters) {
        if (m.dying) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) < ex.radius + CONFIG.monsters[m.type].radius) damageMonster(m, ex.monster, 0, 0);
      }
      for (const mc of mercs) {
        if (mc.state === 'dead') continue;
        if (Math.hypot(mc.x - b.x, mc.y - b.y) < ex.radius + 20) {
          mc.hp -= ex.merc;
          if (mc.hp <= 0) { mc.state = 'dead'; mc.animT = 0; mc.deadT = 0; }
        }
      }
      for (const s of sheepL) {
        if (Math.hypot(s.x - b.x, s.y - b.y) < ex.radius + 16) {
          s.dead = true;
          spawnPickup('meat', s.x, s.y);
          spawnPickup('meat', s.x + 20, s.y + 10);
        }
      }
    }
    if (frame >= ex.frames) booms.splice(i, 1);
  }
  // 箭矢
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.t += dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    let hit = false;
    for (const m of monsters) {
      if (m.dying) continue;
      if (Math.hypot(a.x - m.x, a.y - m.y) < CONFIG.monsters[m.type].radius + 6) {
        damageMonster(m, a.dmg, a.vx * 0.012, a.vy * 0.012);
        hit = true;
        break;
      }
    }
    if (hit || a.t > 1.4) arrows.splice(i, 1);
  }
  // 火把命中特效
  for (let i = fireFxs.length - 1; i >= 0; i--) {
    fireFxs[i].t += dt;
    if (fireFxs[i].t > CONFIG.fireFx.frames / CONFIG.fireFx.fps) fireFxs.splice(i, 1);
  }
}

// ---------- 绘制 ----------
// 通用：从多行雪碧图画一帧，锚点 = 帧内脚底 (fw/2, fw*0.72)
function drawUnitFrame(img, fw, col, row, x, y, scale, flip) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, col * fw, row * fw, fw, fw, -fw / 2 * scale, -fw * 0.72 * scale, fw * scale, fw * scale);
  ctx.restore();
}

function drawPickup(p) {
  const key = p.kind === 'gold' ? 'G' : p.kind === 'meat' ? 'M' : 'W';
  if (p.t < 0.5) {
    const f = Math.min(Math.floor(p.t * 14), 6);
    ctx.drawImage(tswRes[key].spawn, f * 128, 0, 128, 128, p.x - 64, p.y - 80, 128, 128);
  } else {
    const bob = Math.sin(p.t * 4) * 3;
    const blink = p.life > CONFIG.pickupLife - 4 && Math.floor(p.life * 5) % 2 === 0;
    if (!blink) ctx.drawImage(tswRes[key].idle, p.x - 40, p.y - 56 + bob, 80, 80);
  }
}

function drawSheepE(s) {
  const img = s.state === 'bounce' ? tswSheep.bounce : tswSheep.idle;
  const frames = s.state === 'bounce' ? 6 : 8;
  const f = Math.floor(s.animT * 8) % frames;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.flip) ctx.scale(-1, 1);
  ctx.drawImage(img, f * 128, 0, 128, 128, -56, -84, 112, 112);
  ctx.restore();
}

function drawMerc(mc) {
  const cfg = CONFIG.mercs[mc.cls];
  if (mc.state === 'dead') {
    const f = Math.min(Math.floor(mc.deadT * 10), 6);
    ctx.save();
    ctx.globalAlpha = mc.deadT > 3 ? Math.max(0.25, 1 - (mc.deadT - 3) / 4) : 1;
    ctx.drawImage(tswDead, f * 128, 0, 128, 128, mc.x - 56, mc.y - 76, 112, 112);
    ctx.restore();
    return;
  }
  const img = tswMerc[mc.cls][mc.tier];
  let row = 0, frames = 6, fps = 8;
  if (mc.state === 'attack') { row = cfg.attack.row; frames = cfg.attack.frames; fps = cfg.attack.fps; }
  else if (mc.moving) { row = 1; frames = 6; fps = 10; }
  let f = Math.floor(mc.animT * fps);
  f = mc.state === 'attack' ? Math.min(f, frames - 1) : f % frames;
  shadow(mc.x, mc.y + 8, 18);
  drawUnitFrame(img, 192, f, row, mc.x, mc.y, 0.85, mc.flip);
  if (mc.hp < mc.maxHp) {
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(mc.x - 16, mc.y - 58, 32, 4);
    ctx.fillStyle = '#9FE1CB';
    ctx.fillRect(mc.x - 16, mc.y - 58, 32 * mc.hp / mc.maxHp, 4);
  }
}

function drawDynamiteE(d) {
  const t = Math.min(d.t, 1);
  const x = d.sx + (d.tx - d.sx) * t;
  const y = d.sy + (d.ty - d.sy) * t - Math.sin(t * Math.PI) * 70;
  const f = Math.floor(worldT * CONFIG.dynamite.fps) % CONFIG.dynamite.frames;
  ctx.drawImage(tswDynamite, f * 64, 0, 64, 64, x - 24, y - 24, 48, 48);
}

function drawBoom(b) {
  const ex = CONFIG.explosion;
  const f = Math.min(Math.floor(b.t * ex.fps), ex.frames - 1);
  ctx.drawImage(tswExplosion, f * 192, 0, 192, 192, b.x - 110, b.y - 130, 220, 220);
}

function drawArrowE(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(a.vy, a.vx));   // 素材箭头朝右，直接按飞行方向旋转
  ctx.drawImage(tswArrow, 0, 0, 64, 64, -26, -26, 52, 52);
  ctx.restore();
}

function drawFireFxE(fx) {
  const f = Math.min(Math.floor(fx.t * CONFIG.fireFx.fps), CONFIG.fireFx.frames - 1);
  ctx.drawImage(tswFire, f * 128, 0, 128, 128, fx.x - 48, fx.y - 72, 96, 96);
}

// ---------- 场景物绘制（树/建筑/营地/金矿/岩台/栈桥等，主循环按 y 排序调用） ----------
function drawSceneryItem(s) {
  switch (s.kind) {
    case 'flat': {
      const img = tswDecos[s.n];
      ctx.drawImage(img, s.x - img.width / 2, s.y - img.height / 2);
      break;
    }
    case 'tree': {
      const f = Math.floor((worldT * 6 + s.ph * 4)) % 4;
      ctx.drawImage(tswShadows, 0, 0, 192, 192, s.x - 76, s.y - 60, 152, 152);
      ctx.drawImage(tswTree, f * 192, 0, 192, 192, s.x - 96, s.y - 156, 192, 192);
      break;
    }
    case 'stump':
      ctx.drawImage(tswTree, 0, 384, 192, 192, s.x - 96, s.y - 140, 192, 192);
      break;
    case 'elev': {
      const src = s.v === 2 ? [192, 0, 64, 256] : s.v === 1 ? [0, 256, 192, 192] : [0, 0, 192, 256];
      ctx.drawImage(tswElev, src[0], src[1], src[2], src[3], s.x - src[2] / 2, s.y - src[3] + 40, src[2], src[3]);
      break;
    }
    case 'castle': {
      const img = s.state === 'ok' ? tswCastle[s.color] : tswCastle[s.state];
      ctx.drawImage(tswShadows, 0, 0, 192, 192, s.x - 150, s.y - 80, 300, 170);
      ctx.drawImage(img, s.x - 160, s.y - 230);
      break;
    }
    case 'house': {
      const img = s.state === 'ok' ? tswHouse[s.color] : tswHouse[s.state];
      ctx.drawImage(img, s.x - 64, s.y - 170);
      break;
    }
    case 'tower': {
      const img = s.state === 'ok' ? tswTowerB[s.color] : tswTowerB[s.state];
      ctx.drawImage(img, s.x - 64, s.y - 230);
      if (s.archer) {          // 驻塔弓手：无臂身体 + 随目标旋转的弓
        drawUnitFrame(tswTowerArcher[s.color].body, 192, Math.floor(worldT * 6) % 6, 0, s.x, s.y - 158, 0.7, s.aimX < 0);
        ctx.save();
        ctx.translate(s.x, s.y - 185);
        ctx.rotate(Math.atan2(s.aimY || 0, s.aimX || 1));
        ctx.drawImage(tswTowerArcher[s.color].bow, 0, 0, 192, 192, -40, -40, 80, 80);
        ctx.restore();
      }
      break;
    }
    case 'gobHouse':
      ctx.drawImage(s.state === 'ok' ? tswGobHouse.ok : tswGobHouse.destroyed, s.x - 64, s.y - 170);
      break;
    case 'woodTower': {
      let img;
      if (s.state === 'construction') img = tswWoodTower.construction;
      else if (s.state === 'destroyed') img = tswWoodTower.destroyed;
      else img = tswWoodTower.frames[s.state];
      if (s.state !== 'construction' && s.state !== 'destroyed') {
        const f = Math.floor((worldT * 5 + s.ph * 4)) % 4;
        ctx.drawImage(img, f * 256, 0, 256, 192, s.x - 96, s.y - 150, 192, 144);
      } else {
        ctx.drawImage(img, s.x - 64, s.y - 140);
      }
      break;
    }
    case 'goldmine':
      ctx.drawImage(tswGoldMine[s.state], s.x - 96, s.y - 100);
      break;
    case 'scare': {
      const img = tswDecos['18'];
      ctx.drawImage(img, s.x - 96, s.y - 160);
      break;
    }
    case 'pier': {
      // 纵向栈桥：顶/中/底三段（Bridge_All 左列）
      for (let i = 0; i < s.len; i++) {
        const sy = i === 0 ? 64 : i === s.len - 1 ? 192 : 128;
        ctx.drawImage(tswBridge, 0, sy, 64, 64, s.x, s.y + i * 64, 64, 64);
      }
      break;
    }
    case 'rock': {
      const f = Math.floor((worldT * 6 + s.ph * 8)) % 8;
      ctx.drawImage(tswRocks[s.v], f * 128, 0, 128, 128, s.x - 64, s.y - 64, 128, 128);
      break;
    }
  }
}
