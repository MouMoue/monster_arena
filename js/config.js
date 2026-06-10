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
    damage: 25,
    speed: 600,
    radius: 4,
    fireRate: 4,            // 发/秒
    max: 100,
    knockback: 10,          // 命中击退像素
  },

  goblin: {
    hp: 50,
    speed: 120,
    damage: 10,
    radius: 22,
    hitCooldown: 0.8,       // 同一只怪接触伤害冷却
    scale: 1.5,             // 150x150 帧的绘制缩放
    runFps: 12,
    deathFps: 10,
    runFrames: 8,
    deathFrames: 4,
    bodyOffsetY: 26,        // 帧内身体偏下，绘制时上移使身体居中
  },

  // 难度曲线：按局内时间取第一个 until 大于当前时间的档位
  difficulty: [
    { until: 30,       interval: 2.0, cap: 8,  hpMul: 1.0 },
    { until: 60,       interval: 1.2, cap: 15, hpMul: 1.2 },
    { until: 120,      interval: 0.8, cap: 25, hpMul: 1.5 },
    { until: Infinity, interval: 0.5, cap: 40, hpMul: 2.0, hpRampPer60s: 0.5 },
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
