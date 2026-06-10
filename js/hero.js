// 猫咪主角 —— 雪碧图角色 + 像素枪械绘制（v0.8 起替代程序化火柴人）
// 姿态完全由参数驱动: aim 朝向(单位向量), face 朝向(1右/-1左, main 按迟滞带维护),
// moving, animT 动画计时, muzzle 枪口火光剩余秒数, invuln 无敌剩余秒数, weaponId 当前武器
// 素材: assets/player/{idle,run}.png (TexturePacker 128px 源帧, 顶部对齐裁边, 原生朝左)

// 帧矩形内嵌自 TexturePacker JSON（避免运行时 fetch，file:// 下也可用）
const HERO_FRAMES = {
  idle: [[0,0,128,119],[130,0,128,119],[260,0,128,120],[0,122,128,120],[130,122,128,120],[260,122,128,120],[0,244,128,120],[130,244,128,120],[260,244,128,119]].map(([x,y,w,h]) => ({x,y,w,h})),
  run: [[0,0,128,121],[130,0,128,118],[260,0,128,119],[0,126,128,123],[130,126,128,123],[260,126,128,124],[0,252,128,124]].map(([x,y,w,h]) => ({x,y,w,h})),
};

// 像素枪（程序绘制离屏画布），尺寸对应 CONFIG.weapons[*].visual 的比例
// grip 握点 / muzzle 枪口（枪图内坐标），tipLen = 枪口距握点距离，供 main 计算子弹出生点
const HERO_GUNS = (() => {
  const P = { o: '#23272f', s: '#6b7488', sl: '#9aa3b8', w: '#b8763e', wd: '#8a5429', a: '#ffd23e' };
  function make(w, h, grip, muzzle, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
    return { img: c, grip, muzzle, tipLen: muzzle[0] - grip[0] + 3 };
  }
  return {
    pistol: make(16, 12, [5, 8], [16, 3], px => {
      px(1, 1, 13, 5, P.o); px(2, 2, 11, 3, P.s); px(11, 2, 3, 2, P.sl);
      px(3, 5, 5, 6, P.o); px(4, 6, 3, 4, P.wd);
    }),
    smg: make(21, 13, [8, 8], [21, 4], px => {
      px(0, 2, 21, 5, P.o); px(1, 3, 19, 3, P.s); px(17, 4, 3, 1, P.sl);
      px(0, 0, 5, 4, P.o); px(1, 1, 3, 2, P.wd);          // 枪托
      px(7, 7, 4, 6, P.o); px(8, 8, 2, 4, P.w);           // 弹匣
      px(13, 7, 3, 4, P.o);                               // 握把
    }),
    shotgun: make(24, 11, [8, 6], [24, 3], px => {
      px(2, 1, 22, 3, P.o); px(3, 2, 20, 1, P.sl);        // 上管
      px(2, 4, 20, 3, P.o); px(3, 5, 18, 1, P.s);         // 下管
      px(0, 0, 6, 6, P.o); px(1, 1, 4, 4, P.w);           // 枪托
      px(10, 7, 6, 4, P.o); px(11, 8, 4, 2, P.wd);        // 护木
    }),
    rifle: make(32, 12, [11, 8], [32, 5], px => {
      px(0, 4, 32, 4, P.o); px(1, 5, 30, 2, P.s); px(28, 5, 4, 1, P.sl);
      px(0, 2, 7, 5, P.o); px(1, 3, 5, 3, P.wd);          // 枪托
      px(10, 0, 9, 4, P.o); px(11, 1, 7, 2, P.a);         // 瞄准镜
      px(13, 8, 3, 4, P.o); px(21, 8, 2, 3, P.o);         // 握把/前托
    }),
    minigun: make(29, 15, [9, 8], [29, 5], px => {
      px(3, 2, 26, 3, P.o); px(4, 3, 24, 1, P.sl);        // 三管
      px(3, 5, 26, 3, P.o); px(4, 6, 24, 1, P.s);
      px(3, 8, 26, 3, P.o); px(4, 9, 24, 1, P.sl);
      px(0, 1, 6, 11, P.o); px(1, 2, 4, 9, P.wd);         // 机匣
      px(8, 11, 4, 4, P.o); px(9, 12, 2, 2, P.a);         // 握把
    }),
  };
})();

function heroGunTip(weaponId) {
  return (HERO_GUNS[weaponId] || HERO_GUNS.pistol).tipLen;
}

function drawHero(ctx, x, y, o) {
  const S = CONFIG.player.sprite;
  ctx.save();
  ctx.translate(x, y);
  if (o.invuln > 0 && Math.floor(o.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35;

  // 身体：原生朝左，朝右时镜像；帧顶部对齐，按中心摆放
  const frames = HERO_FRAMES[o.moving ? 'run' : 'idle'];
  let fi = Math.floor(o.animT * S.fps) % frames.length;
  if (o.backpedal) fi = frames.length - 1 - fi;          // 背向移动时倒放跑步循环
  const fr = frames[fi];
  const img = o.moving ? heroImgs.run : heroImgs.idle;
  const half = 64 * S.scale;
  ctx.save();
  if (o.face === 1) ctx.scale(-1, 1);
  ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, -half, -half, fr.w * S.scale, fr.h * S.scale);
  ctx.restore();

  // 枪：绕手部锚点随瞄准旋转，朝左时垂直镜像防倒拿，开火瞬间后坐
  const g = HERO_GUNS[o.weaponId] || HERO_GUNS.pistol;
  ctx.save();
  ctx.translate(o.face * S.handX, S.handY);
  ctx.rotate(Math.atan2(o.aim.y, o.aim.x));
  if (o.face === -1) ctx.scale(1, -1);
  if (o.muzzle > 0) ctx.translate(-2.5, 0);
  ctx.drawImage(g.img, -g.grip[0], -g.grip[1]);
  if (o.muzzle > 0) {
    const mx = g.muzzle[0] - g.grip[0] + 3, my = g.muzzle[1] - g.grip[1];
    ctx.fillStyle = CONFIG.colors.muzzle;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = i % 2 ? 3 : 7.5;
      ctx[i ? 'lineTo' : 'moveTo'](mx + Math.cos(a) * r, my + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff8d8';
    ctx.beginPath();
    ctx.arc(mx, my, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}
