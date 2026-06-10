// 跨局元进度：金币 / 经验等级 / 已购武器装备 / 难度选择，存 localStorage
const SAVE_KEY = 'monster_arena_save';

const meta = {
  coins: 0,
  xp: 0,
  owned: ['pistol'],       // 已购武器
  ownedEquip: [],          // 已购装备（被动叠加生效）
  weapon: 'pistol',        // 当前装备的武器
  difficulty: 'normal',
};

function loadMeta() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) Object.assign(meta, s);
  } catch (_) {}
  if (!meta.owned.includes('pistol')) meta.owned.push('pistol');
  if (!CONFIG.weapons[meta.weapon]) meta.weapon = 'pistol';
  if (!CONFIG.difficulties[meta.difficulty]) meta.difficulty = 'normal';
}
function saveMeta() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
}

// 由总经验推算 {lv, cur 本级已得, need 本级所需}
function levelInfo() {
  let lv = 1, acc = 0, need = CONFIG.xp.base;
  while (meta.xp >= acc + need) {
    acc += need;
    lv++;
    need = CONFIG.xp.base + CONFIG.xp.growth * (lv - 1);
  }
  return { lv, cur: meta.xp - acc, need };
}

// 汇总当前武器 + 全部已购装备的实际战斗数值
function effectiveStats() {
  const w = CONFIG.weapons[meta.weapon];
  let maxHp = CONFIG.player.hp, speedMul = 1, rateMul = 1, invulnMul = 1;
  for (const id of meta.ownedEquip) {
    const e = CONFIG.equipment[id].effect;
    if (e.maxHp) maxHp += e.maxHp;
    if (e.speedMul) speedMul += e.speedMul;
    if (e.rateMul) rateMul += e.rateMul;
    if (e.invulnMul) invulnMul += e.invulnMul;
  }
  return {
    maxHp,
    speed: CONFIG.player.speed * speedMul,
    invuln: CONFIG.player.invuln * invulnMul,
    weapon: { ...w, fireRate: w.fireRate * rateMul },
  };
}

// 商城操作：返回提示文案（购买武器自动装备）
function shopAction(kind, id) {
  const item = kind === 'weapon' ? CONFIG.weapons[id] : CONFIG.equipment[id];
  const ownedList = kind === 'weapon' ? meta.owned : meta.ownedEquip;
  if (levelInfo().lv < item.level) return null;
  if (ownedList.includes(id)) {
    if (kind === 'weapon' && meta.weapon !== id) { meta.weapon = id; saveMeta(); }
    return null;
  }
  if (meta.coins < item.price) return null;
  meta.coins -= item.price;
  ownedList.push(id);
  if (kind === 'weapon') meta.weapon = id;
  saveMeta();
  return null;
}
