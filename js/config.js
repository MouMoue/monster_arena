// 数值配置表 —— 全部可调，对应 PRD 4.1-4.3 节
const CONFIG = {
  W: 960,
  H: 540,

  player: {
    hp: 100,
    speed: 240,
    radius: 20,
    invuln: 0.5,            // 受击无敌秒数
  },

  bullet: {
    max: 100,
    knockback: 10,          // 命中击退像素
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
    amulet:  { name: '守护护符', desc: '受击无敌时间 +50%', price: 800, level: 6, effect: { invulnMul: 0.5 } },
  },

  // 难度档：影响刷怪速度、怪物强度与金币收益
  difficulties: {
    easy:   { name: '简单', spawnMul: 1.4, hpMul: 0.8, dmgMul: 0.7, coinMul: 1.0 },
    normal: { name: '普通', spawnMul: 1.0, hpMul: 1.0, dmgMul: 1.0, coinMul: 1.2 },
    hard:   { name: '困难', spawnMul: 0.7, hpMul: 1.4, dmgMul: 1.4, coinMul: 1.6 },
  },

  // 经验曲线：升到下一级所需 = base + growth*(当前等级-1)
  xp: { base: 60, growth: 40 },

  // 怪物图鉴：behavior = melee(近身挥击) / ranged(远程吐弹)
  // 每只怪的伤害都通过攻击动作结算（hitFrame 帧生效），不再用纯碰撞扣血
  monsters: {
    goblin: {                          // 基础近战
      hp: 50, speed: 120, damage: 10, radius: 22, coin: 5, xp: 8,
      scale: 1.5, bodyOffsetY: 26, behavior: 'melee',
      attackRange: 55, attackCooldown: 1.0, hitFrame: 5,
      anims: {
        move:   { file: 'goblin/Run.png',    frames: 8, fps: 12 },
        attack: { file: 'goblin/Attack.png', frames: 8, fps: 16 },
        death:  { file: 'goblin/Death.png',  frames: 4, fps: 10 },
      },
    },
    flyingEye: {                       // 高速冲锋，脆皮
      hp: 30, speed: 210, damage: 8, radius: 20, coin: 6, xp: 10,
      scale: 1.4, bodyOffsetY: 34, behavior: 'melee',
      attackRange: 50, attackCooldown: 0.8, hitFrame: 4,
      anims: {
        move:   { file: 'flying_eye/Flight.png', frames: 8, fps: 14 },
        attack: { file: 'flying_eye/Attack.png', frames: 8, fps: 18 },
        death:  { file: 'flying_eye/Death.png',  frames: 4, fps: 10 },
      },
    },
    mushroom: {                        // 远程：保持距离吐孢子
      hp: 40, speed: 80, damage: 12, radius: 20, coin: 8, xp: 12,
      scale: 1.5, bodyOffsetY: 26, behavior: 'ranged',
      attackRange: 280, attackCooldown: 1.8, hitFrame: 5,
      projectile: { file: 'mushroom/Projectile_sprite.png', frames: 8, fps: 12, size: 50, scale: 1.1, speed: 230, radius: 10 },
      anims: {
        move:   { file: 'mushroom/Run.png',    frames: 8, fps: 12 },
        idle:   { file: 'mushroom/Idle.png',   frames: 4, fps: 8 },
        attack: { file: 'mushroom/Attack.png', frames: 8, fps: 12 },
        death:  { file: 'mushroom/Death.png',  frames: 4, fps: 10 },
      },
    },
    skeleton: {                        // 坦克：血厚移速慢，重剑高伤
      hp: 150, speed: 70, damage: 20, radius: 24, coin: 15, xp: 25,
      scale: 1.6, bodyOffsetY: 26, behavior: 'melee',
      attackRange: 65, attackCooldown: 1.4, hitFrame: 5,
      anims: {
        move:   { file: 'skeleton/Walk.png',   frames: 4, fps: 8 },
        attack: { file: 'skeleton/Attack.png', frames: 8, fps: 14 },
        death:  { file: 'skeleton/Death.png',  frames: 4, fps: 10 },
      },
    },
  },

  // 难度曲线：按局内时间取第一个 until 大于当前时间的档位；weights 为刷怪类型权重
  difficulty: [
    { until: 30,       interval: 2.0, cap: 8,  hpMul: 1.0, weights: { goblin: 1 } },
    { until: 60,       interval: 1.2, cap: 15, hpMul: 1.2, weights: { goblin: 0.7, flyingEye: 0.3 } },
    { until: 120,      interval: 0.8, cap: 25, hpMul: 1.5, weights: { goblin: 0.4, flyingEye: 0.25, mushroom: 0.25, skeleton: 0.1 } },
    { until: Infinity, interval: 0.5, cap: 40, hpMul: 2.0, hpRampPer60s: 0.5, weights: { goblin: 0.3, flyingEye: 0.25, mushroom: 0.25, skeleton: 0.2 } },
  ],

  mobileMonsterCap: 30,     // 移动端同屏上限（覆盖各档 cap 的上限）
  spawnMargin: 60,          // 怪物在场外多远处刷出

  colors: {
    floor: '#20243a',
    grid: 'rgba(255,255,255,0.04)',
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
