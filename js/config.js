// 数值配置表 —— 全部可调
// 素材分配总表见 docs/PRD.md 第14节；Tiny Swords 全部 197 张素材的用途在各 js 文件中标注
const CONFIG = {
  W: 960,
  H: 540,

  // 无边界世界：纯函数噪声地形，按 8x8 格区块惰性生成装饰/碰撞，每局随机种子
  world: { tile: 64, chunk: 8 },

  player: {
    hp: 100,
    speed: 240,
    radius: 20,
    invuln: 0.5,
  },

  bullet: {
    max: 100,
    knockback: 8,
  },

  weapons: {
    pistol:  { name: '手枪',   desc: '伤害25 · 射速4',        price: 0,    level: 1, damage: 25, fireRate: 4,  speed: 600, pellets: 1, spread: 0,    pierce: 0, bulletR: 4,   visual: { len: 17, w: 6 } },
    smg:     { name: '冲锋枪', desc: '伤害12 · 射速10',       price: 150,  level: 2, damage: 12, fireRate: 10, speed: 650, pellets: 1, spread: 0.06, pierce: 0, bulletR: 3,   visual: { len: 22, w: 5 } },
    shotgun: { name: '霰弹枪', desc: '5连珠散射 · 单发伤害12', price: 300,  level: 3, damage: 12, fireRate: 1.6, speed: 560, pellets: 5, spread: 0.42, pierce: 0, bulletR: 3.5, visual: { len: 24, w: 8 } },
    rifle:   { name: '狙击步枪', desc: '伤害60 · 穿透2个敌人',  price: 600,  level: 5, damage: 60, fireRate: 2,  speed: 900, pellets: 1, spread: 0,    pierce: 2, bulletR: 4.5, visual: { len: 30, w: 5 } },
    minigun: { name: '加特林', desc: '伤害15 · 射速16',       price: 1200, level: 7, damage: 15, fireRate: 16, speed: 700, pellets: 1, spread: 0.12, pierce: 0, bulletR: 3.5, visual: { len: 30, w: 9 } },
  },

  equipment: {
    leather: { name: '皮甲',     desc: '生命上限 +25',     price: 100, level: 2, effect: { maxHp: 25 } },
    boots:   { name: '疾跑靴',   desc: '移动速度 +15%',    price: 250, level: 3, effect: { speedMul: 0.15 } },
    steel:   { name: '钢板甲',   desc: '生命上限 +50',     price: 400, level: 4, effect: { maxHp: 50 } },
    mag:     { name: '快装弹夹', desc: '射速 +20%',        price: 500, level: 5, effect: { rateMul: 0.20 } },
    amulet:  { name: '守护护符', desc: '受击无敌 +50%',    price: 800, level: 6, effect: { invulnMul: 0.5 } },
  },

  // 精灵图鉴（Scarloxy 全 16 只）：每次只能带一只出战（商城里点击已拥有的切换出战）
  // 攻击方式：朝目标发射元素技能弹，命中爆发；ice 减速 / explosion 范围溅射 / splash 击退 / scratch 高频
  pets: {
    larvea:      { name: '拉维虫',   element: '草', price: 300,  level: 3,  damage: 14, cooldown: 1.2, effect: 'green' },
    plumette:    { name: '小绒羽',   element: '风', price: 450,  level: 4,  damage: 12, cooldown: 0.9, effect: 'scratch' },
    sparchu:     { name: '斯帕丘',   element: '火', price: 500,  level: 5,  damage: 18, cooldown: 1.3, effect: 'fire' },
    finsta:      { name: '小水鳍',   element: '水', price: 650,  level: 6,  damage: 16, cooldown: 1.2, effect: 'splash', kb: 14 },
    cleaf:       { name: '克里夫',   element: '草', price: 900,  level: 7,  damage: 26, cooldown: 1.6, effect: 'green' },
    pouch:       { name: '帕奇袋',   element: '风', price: 1000, level: 8,  damage: 20, cooldown: 1.1, effect: 'scratch' },
    cindrill:    { name: '辛德钻',   element: '火', price: 1200, level: 9,  damage: 30, cooldown: 1.5, effect: 'fire' },
    gulfin:      { name: '高尔芬',   element: '水', price: 1300, level: 10,  damage: 24, cooldown: 1.3, effect: 'splash', kb: 18 },
    jacana:      { name: '贾卡纳',   element: '水', price: 1500, level: 11,  damage: 22, cooldown: 1.0, effect: 'splash', kb: 12 },
    friolera:    { name: '芙琳拉',   element: '冰', face: 'right', price: 1500, level: 12,  damage: 22, cooldown: 1.5, effect: 'ice', slow: 2.0 },
    ivieron:     { name: '艾维龙',   element: '草', price: 1800, level: 13,  damage: 34, cooldown: 1.5, effect: 'green' },
    pluma:       { name: '普鲁玛',   element: '风', price: 2200, level: 14,  damage: 30, cooldown: 0.9, effect: 'scratch' },
    charmadillo: { name: '查玛甲',   element: '火', price: 2600, level: 16, damage: 45, cooldown: 1.8, effect: 'fire' },
    draem:       { name: '德雷姆',   element: '爆', price: 3000, level: 17, damage: 36, cooldown: 1.4, effect: 'explosion', aoe: 70 },
    finiette:    { name: '菲尼特',   element: '水', price: 3500, level: 18, damage: 42, cooldown: 1.5, effect: 'splash', kb: 22 },
    atrox:       { name: '阿特罗斯', element: '爆', price: 4200, level: 20, damage: 55, cooldown: 1.6, effect: 'explosion', aoe: 85 },
  },
  petSheet: { frame: 192, cols: 4, idleFps: 6, attackFps: 10, castFrame: 2 },
  petSlots: [[-52, 26]],          // 单精灵出战
  petRange: 360,
  petProj: { speed: 470, radius: 14, life: 1.3 },

  effects: {
    fire:      { file: 'fire.png',      frames: 4, size: 192, fps: 14, scale: 0.75 },
    green:     { file: 'green.png',     frames: 4, size: 192, fps: 14, scale: 0.75 },
    ice:       { file: 'ice.png',       frames: 4, size: 192, fps: 14, scale: 0.75 },
    scratch:   { file: 'scratch.png',   frames: 4, size: 192, fps: 16, scale: 0.7 },
    splash:    { file: 'splash.png',    frames: 4, size: 192, fps: 14, scale: 0.75 },
    explosion: { file: 'explosion.png', frames: 4, size: 192, fps: 14, scale: 0.85 },
  },

  // 佣兵（Tiny Swords 骑士兵种，4 色 = 4 档强度，购买高档自动替换出战）
  // 用到素材: Pawn/Warrior/Archer 全 4 色 12 张 + Dead.png 阵亡 + Arrow.png 箭矢
  mercs: {
    pawn: {
      name: '侍从', clsDesc: '自动拾取战利品，锤击近敌',
      hp: 70, damage: 9, range: 75, cooldown: 1.2, collectRange: 420,
      tiers: [
        { price: 200,  level: 2 }, { price: 450,  level: 5 },
        { price: 900,  level: 8 }, { price: 1600, level: 11 },
      ],
      attack: { row: 2, frames: 6, fps: 12, hitFrame: 3 },
    },
    warrior: {
      name: '战士', clsDesc: '近战横扫，范围伤害',
      hp: 150, damage: 26, range: 95, aoe: 80, cooldown: 1.1,
      tiers: [
        { price: 350,  level: 3 }, { price: 750,  level: 6 },
        { price: 1500, level: 9 }, { price: 2600, level: 12 },
      ],
      attack: { row: 2, frames: 6, fps: 13, hitFrame: 3 },
    },
    archer: {
      name: '弓手', clsDesc: '远程射箭，射程极远',
      hp: 90, damage: 18, range: 400, cooldown: 1.3, arrowSpeed: 520,
      tiers: [
        { price: 500,  level: 4 }, { price: 1000, level: 7 },
        { price: 2000, level: 10 }, { price: 3600, level: 13 },
      ],
      arrowSpeed: 720,
      attack: { row: 4, frames: 8, fps: 14, hitFrame: 3 },
    },
  },
  mercTierNames: ['Ⅰ·蓝', 'Ⅱ·黄', 'Ⅲ·紫', 'Ⅳ·红'],
  mercColors: ['Blue', 'Yellow', 'Purple', 'Red'],
  mercSlots: { pawn: [0, 92], warrior: [-100, -58], archer: [100, -58] },
  mercRespawn: 15,          // 阵亡后复活秒数（播放 Dead.png 动画）

  // 拾取物（Tiny Swords resources：G 金 / M 肉 / W 木，Spawn 落地动画 + Idle 待拾取）
  pickups: {
    gold: { coins: 10, label: '+10 金币' },
    meat: { heal: 25,  label: '+25 生命' },
    wood: { xp: 10,    label: '+10 经验' },
  },
  dropRates: { meat: 0.10, gold: 0.06, wood: 0.07 },
  pickupLife: 25,

  // 怪物图鉴
  // luizmelo 四怪(150px帧/单行文件) + Tiny Swords 哥布林军团(192/128px帧/多行雪碧图, 4色=4梯队)
  monsters: {
    goblin: {
      hp: 50, speed: 120, damage: 10, radius: 22, coin: 2, xp: 6, kbMul: 1,
      frame: 150, scale: 1.5, bodyOffsetY: 26, behavior: 'melee',
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
    flyingEye: {
      hp: 30, speed: 210, damage: 8, radius: 20, coin: 3, xp: 8, kbMul: 1,
      frame: 150, scale: 1.4, bodyOffsetY: 34, behavior: 'melee',
      attackRange: 55, attackCooldown: 0.8, hitFrame: 4, attacks: ['attack', 'attack2'],
      anims: {
        move:    { file: 'flying_eye/Flight.png',  frames: 8, fps: 14 },
        attack:  { file: 'flying_eye/Attack.png',  frames: 8, fps: 18 },
        attack2: { file: 'flying_eye/Attack2.png', frames: 8, fps: 18 },
        hit:     { file: 'flying_eye/TakeHit.png', frames: 4, fps: 14 },
        death:   { file: 'flying_eye/Death.png',   frames: 4, fps: 10 },
      },
    },
    mushroom: {
      hp: 40, speed: 80, damage: 12, radius: 20, coin: 4, xp: 9, kbMul: 1,
      frame: 150, scale: 1.5, bodyOffsetY: 26, behavior: 'ranged',
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
    skeleton: {
      hp: 150, speed: 70, damage: 20, radius: 24, coin: 7, xp: 18, kbMul: 0.3,
      frame: 150, scale: 1.6, bodyOffsetY: 26, behavior: 'melee',
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
    torchGob: {                      // 火把哥布林：近战挥火把，命中带火焰特效
      hp: 60, speed: 145, damage: 12, radius: 20, coin: 3, xp: 9, kbMul: 0.8,
      frame: 192, scale: 0.95, bodyOffsetY: 22, behavior: 'melee',
      attackRange: 70, attackCooldown: 1.1, hitFrame: 3, attacks: ['attack'], fireFx: true,
      tierSheets: ['torch/blue/Torch_Blue.png', 'torch/yellow/Torch_Yellow.png', 'torch/purple/Torch_Purple.png', 'torch/red/Torch_Red.png'],
      anims: {
        move:   { row: 1, frames: 6, fps: 10 },
        idle:   { row: 0, frames: 7, fps: 8 },
        attack: { row: 2, frames: 6, fps: 12 },
      },
    },
    tntGob: {                        // TNT 哥布林：远程抛炸药，落点爆炸
      hp: 45, speed: 115, damage: 16, radius: 20, coin: 4, xp: 10, kbMul: 1,
      frame: 192, scale: 0.95, bodyOffsetY: 22, behavior: 'lob',
      attackRange: 430, attackCooldown: 2.2, hitFrame: 4, attacks: ['attack'],
      tierSheets: ['tnt/blue/TNT_Blue.png', 'tnt/yellow/TNT_Yellow.png', 'tnt/purple/TNT_Purple.png', 'tnt/red/TNT_Red.png'],
      anims: {
        move:   { row: 1, frames: 6, fps: 10 },
        idle:   { row: 0, frames: 7, fps: 8 },
        attack: { row: 2, frames: 7, fps: 12 },
      },
    },
    barrelGob: {                     // 自爆桶哥布林：滚向主角贴脸引爆（被打死也会炸）
      hp: 40, speed: 175, damage: 30, radius: 18, coin: 5, xp: 12, kbMul: 0.6,
      frame: 128, scale: 1.1, bodyOffsetY: 14, behavior: 'kamikaze',
      attackRange: 55, attackCooldown: 9, hitFrame: 2, attacks: ['attack'], explodes: true,
      tierSheets: ['barrel/blue/Barrel_Blue.png', 'barrel/yellow/Barrel_Yellow.png', 'barrel/purple/Barrel_Purple.png', 'barrel/red/Barrel_Red.png'],
      anims: {
        move:   { row: 1, frames: 6, fps: 10 },
        idle:   { row: 0, frames: 1, fps: 4 },
        attack: { row: 5, frames: 3, fps: 9 },   // 引爆抖动
      },
    },
  },

  // 哥布林梯队（颜色=强度），按局内时间解锁更高梯队
  tierUnlock: [0, 60, 150, 240],
  tierMul: [1, 1.5, 2.1, 2.8],
  tierNames: ['蓝', '黄', '紫', '红'],

  explosion: { radius: 85, player: 20, monster: 45, merc: 30, frames: 9, fps: 15, size: 192, dmgFrame: 2 },
  dynamite: { speed: 270, frames: 6, fps: 12 },
  fireFx: { frames: 7, fps: 14, size: 128 },
  arrow: { dmg: 18 },
  towerDef: { range: 430, cooldown: 1.5, damage: 26 },   // 完好骑士塔楼的驻塔弓手
  goldMine: { interval: 10, range: 480, maxOut: 2 },

  stagger: 1.4,

  difficulty: [
    { until: 30,       interval: 1.6,  cap: 10, hpMul: 1.0, weights: { goblin: 0.55, torchGob: 0.45 } },
    { until: 60,       interval: 0.95, cap: 20, hpMul: 1.3, weights: { goblin: 0.3, flyingEye: 0.2, torchGob: 0.3, tntGob: 0.2 } },
    { until: 120,      interval: 0.6,  cap: 32, hpMul: 1.8, weights: { goblin: 0.18, flyingEye: 0.14, mushroom: 0.14, skeleton: 0.09, torchGob: 0.2, tntGob: 0.15, barrelGob: 0.1 } },
    { until: Infinity, interval: 0.4,  cap: 50, hpMul: 2.4, hpRampPer60s: 0.7, weights: { goblin: 0.13, flyingEye: 0.11, mushroom: 0.12, skeleton: 0.11, torchGob: 0.18, tntGob: 0.16, barrelGob: 0.19 } },
  ],

  difficulties: {
    easy:   { name: '简单', spawnMul: 1.4, hpMul: 0.8, dmgMul: 0.7, coinMul: 1.0 },
    normal: { name: '普通', spawnMul: 1.0, hpMul: 1.0, dmgMul: 1.0, coinMul: 1.2 },
    hard:   { name: '困难', spawnMul: 0.6, hpMul: 1.5, dmgMul: 1.5, coinMul: 1.6 },
  },

  xp: { base: 100, growth: 75 },

  mobileMonsterCap: 30,
  spawnDist: [600, 740],

  colors: {
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
