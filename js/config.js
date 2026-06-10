// 数值配置表 —— 全部可调，对应 PRD 4.1-4.6 节
const CONFIG = {
  W: 960,
  H: 540,

  // 大地图世界（Tiny Swords 海岛）：相机跟随主角，水→沙滩→草地双层自动拼接地形
  world: { w: 3200, h: 1920, tile: 64 },

  player: {
    hp: 100,
    speed: 240,
    radius: 20,
    invuln: 0.5,            // 受击无敌秒数
  },

  bullet: {
    max: 100,
    knockback: 8,           // 命中击退像素（怪物可有抗性 kbMul）
  },

  // 武器库：等级解锁 + 金币购买；pellets/spread 散射，pierce 穿透
  weapons: {
    pistol:  { name: '手枪',   desc: '伤害25 · 射速4',        price: 0,    level: 1, damage: 25, fireRate: 4,  speed: 600, pellets: 1, spread: 0,    pierce: 0, bulletR: 4,   visual: { len: 17, w: 6 } },
    smg:     { name: '冲锋枪', desc: '伤害12 · 射速10',       price: 150,  level: 2, damage: 12, fireRate: 10, speed: 650, pellets: 1, spread: 0.06, pierce: 0, bulletR: 3,   visual: { len: 22, w: 5 } },
    shotgun: { name: '霰弹枪', desc: '5连珠散射 · 单发伤害12', price: 300,  level: 3, damage: 12, fireRate: 1.6, speed: 560, pellets: 5, spread: 0.42, pierce: 0, bulletR: 3.5, visual: { len: 24, w: 8 } },
    rifle:   { name: '狙击步枪', desc: '伤害60 · 穿透2个敌人',  price: 600,  level: 5, damage: 60, fireRate: 2,  speed: 900, pellets: 1, spread: 0,    pierce: 2, bulletR: 4.5, visual: { len: 30, w: 5 } },
    minigun: { name: '加特林', desc: '伤害15 · 射速16',       price: 1200, level: 7, damage: 15, fireRate: 16, speed: 700, pellets: 1, spread: 0.12, pierce: 0, bulletR: 3.5, visual: { len: 30, w: 9 } },
  },

  // 装备：购买后被动生效，可叠加
  equipment: {
    leather: { name: '皮甲',     desc: '生命上限 +25',     price: 100, level: 2, effect: { maxHp: 25 } },
    boots:   { name: '疾跑靴',   desc: '移动速度 +15%',    price: 250, level: 3, effect: { speedMul: 0.15 } },
    steel:   { name: '钢板甲',   desc: '生命上限 +50',     price: 400, level: 4, effect: { maxHp: 50 } },
    mag:     { name: '快装弹夹', desc: '射速 +20%',        price: 500, level: 5, effect: { rateMul: 0.20 } },
    amulet:  { name: '守护护符', desc: '受击无敌 +50%',    price: 800, level: 6, effect: { invulnMul: 0.5 } },
  },

  // 精灵：购买后永久跟随主人出战，自动对范围内敌人施放元素攻击
  pets: {
    sparchu:  { name: '火精灵', desc: '火焰爆发 · 伤害18',       price: 500,  level: 3, damage: 18, range: 340, cooldown: 1.3, effect: 'fire',  sheet: 'Sparchu.png',  icon: 'Sparchu.png',  scale: 0.55 },
    cleaf:    { name: '草精灵', desc: '藤叶切割 · 伤害26',       price: 900,  level: 5, damage: 26, range: 340, cooldown: 1.6, effect: 'green', sheet: 'Cleaf.png',    icon: 'Cleaf.png',    scale: 0.55 },
    friolera: { name: '冰精灵', desc: '寒冰冻结 · 伤害22+减速',  price: 1500, level: 7, damage: 22, range: 340, cooldown: 1.5, effect: 'ice',   sheet: 'Friolera.png', icon: 'Friolera.png', scale: 0.55, slow: 2.0 },
  },
  petSheet: { frame: 192, cols: 4, idleFps: 6, attackFps: 10, castFrame: 2 },
  petSlots: [[-52, 26], [52, 26], [-84, -16]],   // 跟随阵位（相对主角）

  // 精灵攻击特效：施放在目标身上的爆发动画，dmgFrame 帧结算伤害
  effects: {
    fire:  { file: 'fire.png',  frames: 4, size: 192, fps: 12, scale: 0.75, dmgFrame: 1 },
    green: { file: 'green.png', frames: 4, size: 192, fps: 12, scale: 0.75, dmgFrame: 1 },
    ice:   { file: 'ice.png',   frames: 4, size: 192, fps: 12, scale: 0.75, dmgFrame: 1 },
  },

  // 怪物图鉴：behavior = melee(近身挥击) / ranged(远程吐弹)
  // 攻击动作: attacks 列表随机挑选；hit = 受击僵直动画；idle = 射程内等冷却时的待机
  monsters: {
    goblin: {                          // 基础近战
      hp: 50, speed: 120, damage: 10, radius: 22, coin: 5, xp: 8, kbMul: 1,
      scale: 1.5, bodyOffsetY: 26, behavior: 'melee',
      attackRange: 65, attackCooldown: 1.0, hitFrame: 5, attacks: ['attack', 'attack2'],
      anims: {
        move:    { file: 'goblin/Run.png',     frames: 8, fps: 12 },
        idle:    { file: 'goblin/Idle.png',    frames: 4, fps: 8 },
        attack:  { file: 'goblin/Attack.png',  frames: 8, fps: 16 },
        attack2: { file: 'goblin/Attack2.png', frames: 8, fps: 16 },
        hit:     { file: 'goblin/TakeHit.png', frames: 4, fps: 14 },
        death:   { file: 'goblin/Death.png',   frames: 4, fps: 10 },
      },
    },
    flyingEye: {                       // 高速冲锋，脆皮
      hp: 30, speed: 210, damage: 8, radius: 20, coin: 6, xp: 10, kbMul: 1,
      scale: 1.4, bodyOffsetY: 34, behavior: 'melee',
      attackRange: 55, attackCooldown: 0.8, hitFrame: 4, attacks: ['attack', 'attack2'],
      anims: {
        move:    { file: 'flying_eye/Flight.png',  frames: 8, fps: 14 },
        attack:  { file: 'flying_eye/Attack.png',  frames: 8, fps: 18 },
        attack2: { file: 'flying_eye/Attack2.png', frames: 8, fps: 18 },
        hit:     { file: 'flying_eye/TakeHit.png', frames: 4, fps: 14 },
        death:   { file: 'flying_eye/Death.png',   frames: 4, fps: 10 },
      },
    },
    mushroom: {                        // 远程：保持距离吐孢子
      hp: 40, speed: 80, damage: 12, radius: 20, coin: 8, xp: 12, kbMul: 1,
      scale: 1.5, bodyOffsetY: 26, behavior: 'ranged',
      attackRange: 280, attackCooldown: 1.8, hitFrame: 5, attacks: ['attack', 'attack2'],
      projectile: { file: 'mushroom/Projectile_sprite.png', frames: 8, fps: 12, size: 50, scale: 1.1, speed: 230, radius: 10 },
      anims: {
        move:    { file: 'mushroom/Run.png',     frames: 8, fps: 12 },
        idle:    { file: 'mushroom/Idle.png',    frames: 4, fps: 8 },
        attack:  { file: 'mushroom/Attack.png',  frames: 8, fps: 12 },
        attack2: { file: 'mushroom/Attack2.png', frames: 8, fps: 12 },
        hit:     { file: 'mushroom/TakeHit.png', frames: 4, fps: 14 },
        death:   { file: 'mushroom/Death.png',   frames: 4, fps: 10 },
      },
    },
    skeleton: {                        // 坦克：血厚移速慢，重剑高伤，击退抗性
      hp: 150, speed: 70, damage: 20, radius: 24, coin: 15, xp: 25, kbMul: 0.3,
      scale: 1.6, bodyOffsetY: 26, behavior: 'melee',
      attackRange: 85, attackCooldown: 1.4, hitFrame: 5, attacks: ['attack', 'attack2'],
      anims: {
        move:    { file: 'skeleton/Walk.png',     frames: 4, fps: 8 },
        idle:    { file: 'skeleton/Idle.png',     frames: 4, fps: 8 },
        attack:  { file: 'skeleton/Attack.png',   frames: 8, fps: 14 },
        attack2: { file: 'skeleton/Attack2.png',  frames: 8, fps: 14 },
        hit:     { file: 'skeleton/TakeHit.png',  frames: 4, fps: 14 },
        death:   { file: 'skeleton/Death.png',    frames: 4, fps: 10 },
      },
    },
  },

  stagger: 1.4,             // 受击僵直触发冷却（防止速射武器无限打断）

  // 难度曲线：按局内时间取第一个 until 大于当前时间的档位；weights 为刷怪类型权重
  difficulty: [
    { until: 30,       interval: 2.0, cap: 8,  hpMul: 1.0, weights: { goblin: 1 } },
    { until: 60,       interval: 1.2, cap: 15, hpMul: 1.2, weights: { goblin: 0.7, flyingEye: 0.3 } },
    { until: 120,      interval: 0.8, cap: 25, hpMul: 1.5, weights: { goblin: 0.4, flyingEye: 0.25, mushroom: 0.25, skeleton: 0.1 } },
    { until: Infinity, interval: 0.5, cap: 40, hpMul: 2.0, hpRampPer60s: 0.5, weights: { goblin: 0.3, flyingEye: 0.25, mushroom: 0.25, skeleton: 0.2 } },
  ],

  // 难度档：影响刷怪速度、怪物强度与金币收益
  difficulties: {
    easy:   { name: '简单', spawnMul: 1.4, hpMul: 0.8, dmgMul: 0.7, coinMul: 1.0 },
    normal: { name: '普通', spawnMul: 1.0, hpMul: 1.0, dmgMul: 1.0, coinMul: 1.2 },
    hard:   { name: '困难', spawnMul: 0.7, hpMul: 1.4, dmgMul: 1.4, coinMul: 1.6 },
  },

  // 经验曲线：升到下一级所需 = base + growth*(当前等级-1)
  xp: { base: 60, growth: 40 },

  mobileMonsterCap: 30,     // 移动端同屏上限（覆盖各档 cap 的上限）
  spawnDist: [600, 740],    // 怪物在主角周围环形刷出的距离范围（视野外）

  colors: {
    floor: '#20243a',
    stickman: '#f4f4f4',
    gun: '#b9b9b9',
    muzzle: '#FAC775',
    bullet: '#EF9F27',
    hpBar: '#E24B4A',
    hpBack: 'rgba(255,255,255,0.18)',
    hud: '#e8e8f0',
    hudDim: '#9aa0c0',
  },
};
