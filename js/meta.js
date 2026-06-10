// 跨局元进度：金币 / 经验等级 / 已购武器装备 / 难度选择，存 localStorage
const SAVE_KEY = 'monster_arena_save';

const meta = {
  coins: 0,
  xp: 0,
  owned: ['pistol'],       // 已购武器
  ownedEquip: [],          // 已购装备（被动叠加生效）
  ownedPets: [],           // 已购精灵
  activePet: null,         // 出战精灵（每次只能带一只）
  mercTier: { pawn: -1, warrior: -1, archer: -1 },   // 佣兵档位（-1 未雇佣，0-3 = 蓝/黄/紫/红）
  weapon: 'pistol',        // 当前装备的武器
  difficulty: 'easy',
};

function loadMeta() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) Object.assign(meta, s);
  } catch (_) {}
  if (!meta.owned.includes('pistol')) meta.owned.push('pistol');
  if (!CONFIG.weapons[meta.weapon]) meta.weapon = 'pistol';
  if (!CONFIG.difficulties[meta.difficulty]) meta.difficulty = 'easy';
  if (!meta.mercTier) meta.mercTier = { pawn: -1, warrior: -1, archer: -1 };
  meta.ownedPets = meta.ownedPets.filter(id => CONFIG.pets[id]);
  if (meta.activePet && !meta.ownedPets.includes(meta.activePet)) meta.activePet = null;
  if (!meta.activePet && meta.ownedPets.length) meta.activePet = meta.ownedPets[0];
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
  let dmgMul = 1, pierceAdd = 0, regen = 0, magnet = 0, coinMul = 1, xpMul = 1, petCdCut = 0;
  for (const id of meta.ownedEquip) {
    const e = CONFIG.equipment[id].effect;
    if (e.maxHp) maxHp += e.maxHp;
    if (e.speedMul) speedMul += e.speedMul;
    if (e.rateMul) rateMul += e.rateMul;
    if (e.invulnMul) invulnMul += e.invulnMul;
    if (e.dmgMul) dmgMul += e.dmgMul;
    if (e.pierceAdd) pierceAdd += e.pierceAdd;
    if (e.regen) regen += e.regen;
    if (e.magnet) magnet += e.magnet;
    if (e.coinMul) coinMul += e.coinMul;
    if (e.xpMul) xpMul += e.xpMul;
    if (e.petCdCut) petCdCut += e.petCdCut;
  }
  return {
    maxHp,
    speed: CONFIG.player.speed * speedMul,
    invuln: CONFIG.player.invuln * invulnMul,
    regen, magnet, coinMul, xpMul,
    petCd: Math.max(0.5, 1 - petCdCut),
    weapon: { ...w, fireRate: w.fireRate * rateMul, damage: Math.round(w.damage * dmgMul), pierce: w.pierce + pierceAdd },
  };
}

// 商城操作（购买武器自动装备；装备/精灵购买即生效；佣兵按档位逐级雇佣/升级）
function shopAction(kind, id) {
  if (kind === 'merc') {
    const cfg = CONFIG.mercs[id];
    const next = meta.mercTier[id] + 1;
    if (next > 3) return null;
    const t = cfg.tiers[next];
    if (levelInfo().lv < t.level || meta.coins < t.price) return null;
    meta.coins -= t.price;
    meta.mercTier[id] = next;
    saveMeta();
    return null;
  }
  const item = kind === 'weapon' ? CONFIG.weapons[id] : kind === 'pet' ? CONFIG.pets[id] : CONFIG.equipment[id];
  const ownedList = kind === 'weapon' ? meta.owned : kind === 'pet' ? meta.ownedPets : meta.ownedEquip;
  if (levelInfo().lv < item.level) return null;
  if (ownedList.includes(id)) {
    if (kind === 'weapon' && meta.weapon !== id) { meta.weapon = id; saveMeta(); }
    if (kind === 'pet' && meta.activePet !== id) { meta.activePet = id; saveMeta(); }   // 切换出战精灵
    return null;
  }
  if (meta.coins < item.price) return null;
  meta.coins -= item.price;
  ownedList.push(id);
  if (kind === 'weapon') meta.weapon = id;
  if (kind === 'pet') meta.activePet = id;       // 新买的精灵自动出战
  saveMeta();
  return null;
}
