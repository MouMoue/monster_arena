// 无边界自动生成地图 —— 纯函数噪声地形（走到哪生成到哪），区块缓存装饰/碰撞/营地
// 地形: 0 水 / 1 沙 / 2 草；最外没有边界，每局随机种子
const MAPGEN = (() => {
  const T = CONFIG.world.tile;          // 64
  const CH = CONFIG.world.chunk;        // 8 格 = 512px 一区块
  let SEED = 1;
  let chunks = new Map();

  function hash2(x, y) {
    let n = (x | 0) * 374761393 + (y | 0) * 668265263 + SEED * 974711;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function terrainAt(tx, ty) {
    const n = noise(tx / 16, ty / 16) * 0.62 + noise(tx / 5 + 1000, ty / 5 + 1000) * 0.38;
    return n > 0.60 ? 2 : n > 0.47 ? 1 : 0;
  }
  const landAt = (tx, ty) => terrainAt(tx, ty) >= 1;
  const grassAt = (tx, ty) => terrainAt(tx, ty) === 2;

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 生成一个区块的装饰/碰撞/营地（确定性：同区块重访结果一致）
  function genChunk(cx, cy) {
    const rnd = mulberry((cx * 731 + cy * 1373 + SEED) >>> 0);
    const c = { scenery: [], colliders: [], piers: new Set(), camp: null, sheepDone: false, sheepSpots: [] };
    const baseX = cx * CH, baseY = cy * CH;

    const spots = [];   // 区块内陆地/草地格中心
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const wx = (baseX + tx) * T + T / 2, wy = (baseY + ty) * T + T / 2;
        const ter = terrainAt(baseX + tx, baseY + ty);
        if (ter >= 1) spots.push({ wx, wy, grass: ter === 2 });
      }
    }
    if (!spots.length) {
      // 纯海区块：海面礁石（Rocks_01-04 四种摇曳动画）
      if (rnd() < 0.5) {
        const n = 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          c.scenery.push({ kind: 'rock', v: Math.floor(rnd() * 4), x: (baseX + rnd() * CH) * T, y: (baseY + rnd() * CH) * T, ph: rnd() });
        }
      }
      return c;
    }
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const grassSpots = spots.filter(s => s.grass);

    // 平面小装饰（草地: 蘑菇/灌木/高草, 沙地: 石头/骸骨）
    const nDeco = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < nDeco; i++) {
      const s = pick(spots);
      const pool = s.grass ? GRASS_DECOS : SAND_DECOS;
      c.scenery.push({ kind: 'flat', n: pool[Math.floor(rnd() * pool.length)], x: s.wx + (rnd() - 0.5) * 40, y: s.wy + (rnd() - 0.5) * 40 });
    }
    // 树 / 残桩（树有碰撞）
    if (grassSpots.length) {
      const nTree = Math.floor(rnd() * 3);
      for (let i = 0; i < nTree; i++) {
        const s = pick(grassSpots);
        if (rnd() < 0.12) {
          c.scenery.push({ kind: 'stump', x: s.wx, y: s.wy });
        } else {
          c.scenery.push({ kind: 'tree', x: s.wx, y: s.wy, ph: rnd() });
          c.colliders.push({ x: s.wx, y: s.wy + 6, r: 22 });
        }
      }
    }
    // 岩台障碍（Tilemap_Elevation 大岩丘，三种缩放；碰撞圆与可见底边精确对齐）
    if (rnd() < 0.16) {
      const s = pick(spots);
      const v = Math.floor(rnd() * 3);
      const r = [58, 46, 36][v];
      c.scenery.push({ kind: 'elev', v, x: s.wx, y: s.wy });
      c.colliders.push({ x: s.wx, y: s.wy - r * 0.35, r });
    }
    // 地标建筑（骑士阵营 4 色 × 完好/在建/废墟；完好塔楼有驻塔弓手）
    if (rnd() < 0.1 && grassSpots.length) {
      const s = pick(grassSpots);
      const color = pick(['Blue', 'Red', 'Yellow', 'Purple']);
      const state = rnd() < 0.62 ? 'ok' : rnd() < 0.5 ? 'Construction' : 'Destroyed';
      const kindR = rnd();
      if (kindR < 0.2) {
        c.scenery.push({ kind: 'castle', color, state, x: s.wx, y: s.wy });
        c.colliders.push({ x: s.wx - 60, y: s.wy - 30, r: 62 }, { x: s.wx + 60, y: s.wy - 30, r: 62 });
      } else if (kindR < 0.62) {
        c.scenery.push({ kind: 'house', color, state, x: s.wx, y: s.wy });
        c.colliders.push({ x: s.wx, y: s.wy - 18, r: 44 });
      } else {
        c.scenery.push({ kind: 'tower', color, state, x: s.wx, y: s.wy, cd: 0, archer: state === 'ok' });
        c.colliders.push({ x: s.wx, y: s.wy - 12, r: 34 });
      }
    }
    // 金矿（完好周期产金 / 停产 / 损毁）
    if (rnd() < 0.05) {
      const s = pick(spots);
      const state = rnd() < 0.5 ? 'active' : rnd() < 0.5 ? 'inactive' : 'destroyed';
      c.scenery.push({ kind: 'goldmine', state, x: s.wx, y: s.wy, cd: 4, out: 0 });
      c.colliders.push({ x: s.wx, y: s.wy - 10, r: 50 });
    }
    // 哥布林营地：木屋 + 瞭望塔（4 色摇晃动画/在建/损毁），靠近触发伏兵
    if (rnd() < 0.07 && spots.length > 10) {
      const s = pick(spots);
      c.camp = { x: s.wx, y: s.wy, active: false, cleared: false };
      c.scenery.push({ kind: 'gobHouse', state: 'ok', x: s.wx - 50, y: s.wy });
      c.colliders.push({ x: s.wx - 50, y: s.wy - 16, r: 40 });
      const wtState = rnd() < 0.6 ? pick(['Blue', 'Red', 'Yellow', 'Purple']) : (rnd() < 0.5 ? 'construction' : 'destroyed');
      c.scenery.push({ kind: 'woodTower', state: wtState, x: s.wx + 70, y: s.wy + 30, ph: rnd() });
      c.colliders.push({ x: s.wx + 70, y: s.wy + 18, r: 38 });
      if (rnd() < 0.3) c.scenery.push({ kind: 'gobHouse', state: 'destroyed', x: s.wx + 30, y: s.wy - 80 });
    }
    // 稻草人
    if (rnd() < 0.05 && grassSpots.length) {
      const s = pick(grassSpots);
      c.scenery.push({ kind: 'scare', x: s.wx, y: s.wy });
      c.colliders.push({ x: s.wx, y: s.wy, r: 12 });
    }
    // 海边栈桥：找一块"南边是水"的沙地，向水里伸 2-3 格木板（可行走）
    if (rnd() < 0.14) {
      for (const s of spots) {
        const tx = Math.floor(s.wx / T), ty = Math.floor(s.wy / T);
        if (!s.grass && !landAt(tx, ty + 1) && !landAt(tx, ty + 2)) {
          const len = 2 + Math.floor(rnd() * 2);
          for (let i = 1; i <= len; i++) c.piers.add((tx) + ',' + (ty + i));
          c.scenery.push({ kind: 'pier', x: tx * T, y: (ty + 1) * T, len });
          break;
        }
      }
    }
    // 羊群点位（由 units 实例化为闲逛实体）
    if (rnd() < 0.12 && grassSpots.length) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const s = pick(grassSpots);
        c.sheepSpots.push([s.wx, s.wy]);
      }
    }
    return c;
  }

  function chunkAt(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (!c) {
      c = genChunk(cx, cy);
      chunks.set(key, c);
      if (chunks.size > 600) {          // 远端区块淘汰（重访会按种子重生成，结果一致）
        const it = chunks.keys();
        for (let i = 0; i < 200; i++) chunks.delete(it.next().value);
      }
    }
    return c;
  }

  function pierAt(tx, ty) {
    const c = chunkAt(Math.floor(tx / CH), Math.floor(ty / CH));
    return c.piers.has(tx + ',' + ty);
  }

  // 可行走判定：陆地或栈桥，且不在任何静态碰撞体内（怪物/主角/击退共用）
  function walkable(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!landAt(tx, ty) && !pierAt(tx, ty)) return false;
    const ccx = Math.floor(x / (CH * T)), ccy = Math.floor(y / (CH * T));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const col of chunkAt(ccx + dx, ccy + dy).colliders) {
          const ddx = x - col.x, ddy = y - col.y;
          if (ddx * ddx + ddy * ddy < col.r * col.r) return false;
        }
      }
    }
    return true;
  }

  // 自动拼接选块：baseCol 0=草 5=沙
  function autotileSrc(isSet, tx, ty, baseCol) {
    const L = isSet(tx - 1, ty), R = isSet(tx + 1, ty);
    const U = isSet(tx, ty - 1), D = isSet(tx, ty + 1);
    const cx = L && R ? 1 : R ? 0 : L ? 2 : 3;
    const cy = U && D ? 1 : D ? 0 : U ? 2 : 3;
    if (cx === 3 && cy === 3) return [(baseCol + 3) * 64, 192];
    if (cx === 3) return [(baseCol + 3) * 64, cy * 64];
    if (cy === 3) return [(baseCol + cx) * 64, 192];
    return [(baseCol + cx) * 64, cy * 64];
  }

  function visibleChunks(cam) {
    const list = [];
    const c0x = Math.floor((cam.x - 256) / (CH * T)), c1x = Math.floor((cam.x + CONFIG.W + 256) / (CH * T));
    const c0y = Math.floor((cam.y - 256) / (CH * T)), c1y = Math.floor((cam.y + CONFIG.H + 256) / (CH * T));
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) list.push(chunkAt(cx, cy));
    return list;
  }

  function reset(seed) {
    SEED = seed >>> 0 || 1;
    chunks = new Map();
  }

  // 找出生点：从原点向外找一块草地
  function findSpawn() {
    for (let r = 0; r < 60; r++) {
      for (let a = 0; a < 16; a++) {
        const tx = Math.round(Math.cos(a / 16 * Math.PI * 2) * r);
        const ty = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        if (grassAt(tx, ty) && grassAt(tx + 1, ty) && grassAt(tx, ty + 1)) {
          const x = tx * T + T / 2, y = ty * T + T / 2;
          if (walkable(x, y)) return [x, y];
        }
      }
    }
    return [T / 2, T / 2];
  }

  return { T, CH, terrainAt, landAt, grassAt, walkable, autotileSrc, chunkAt, visibleChunks, pierAt, reset, findSpawn, hash2 };
})();
