// 持枪火柴人程序化绘制 —— PRD 4.1
// 姿态完全由参数驱动: aim 朝向(单位向量), moving, phase 走路相位, muzzle 枪口火光剩余秒数,
// invuln 无敌剩余秒数, weaponVisual {len,w} 当前武器的枪身尺寸
function gunTip(visual) { return 15 + visual.len + 2; }  // 枪口距肩部距离，供 main 计算子弹出生点

function drawStickman(ctx, x, y, o) {
  const C = CONFIG.colors;
  ctx.save();
  ctx.translate(x, y);
  if (o.invuln > 0 && Math.floor(o.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35;

  ctx.strokeStyle = C.stickman;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  const hipY = 10, footLen = 27;
  const swing = o.moving ? Math.sin(o.phase * Math.PI * 2) * 0.55 : 0.2;
  for (const s of [swing, -swing]) {
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(Math.sin(s) * footLen, hipY + Math.cos(s) * footLen);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(0, -16);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -26, 9, 0, Math.PI * 2);
  ctx.stroke();

  const aimAngle = Math.atan2(o.aim.y, o.aim.x);
  const shoulderY = -12;
  const backAngle = aimAngle + 2.5;
  ctx.beginPath();
  ctx.moveTo(0, shoulderY);
  ctx.lineTo(Math.cos(backAngle) * 14, shoulderY + Math.sin(backAngle) * 14);
  ctx.stroke();

  // 持枪臂 + 枪，整体随瞄准方向旋转；开火瞬间整臂后坐
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.rotate(aimAngle);
  const recoil = o.muzzle > 0 ? 2.5 : 0;
  ctx.translate(-recoil, 0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(17, 0);
  ctx.stroke();
  const v = o.weaponVisual || { len: 17, w: 6 };
  const tip = gunTip(v);
  ctx.fillStyle = C.gun;
  ctx.fillRect(15, -v.w / 2, v.len, v.w);
  ctx.fillRect(17, v.w / 2, 5, 8);
  if (o.muzzle > 0) {
    ctx.fillStyle = C.muzzle;
    ctx.beginPath();
    ctx.arc(tip + 3, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.muzzle;
    ctx.lineWidth = 2;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(tip + 6, 0);
      ctx.lineTo(tip + 13 + 3 * Math.cos(a * 3), 9 * Math.sin(a));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}
