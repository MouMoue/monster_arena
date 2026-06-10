// Tiny Swords UI 皮肤：9宫格/3段切片 + 丝带页签 + 三态按钮 + 图标
// 按钮: Blue=次要 Red=主要 Hover=选中态 Disable=不可用, _Pressed=按下反馈
const UI_TEXT = '#5a3a1a';
let uiPressedId = null, uiPressedT = 0;

function uiPress(id) { uiPressedId = id; uiPressedT = 0.18; }
function uiTick(dt) { if (uiPressedT > 0) { uiPressedT -= dt; if (uiPressedT <= 0) uiPressedId = null; } }

// 9 宫格（192 源图、64 角；小尺寸时角部等比缩小）
function nine(img, x, y, w, h) {
  const sc = 64;                         // 源图角固定 64，目标角按需缩小
  const iw = img.width, ih = img.height;
  const mw = iw - sc * 2, mh = ih - sc * 2;
  ctx.drawImage(img, 0, 0, sc, sc, x, y, c, c);
  ctx.drawImage(img, iw - sc, 0, sc, sc, x + w - c, y, c, c);
  ctx.drawImage(img, 0, ih - sc, sc, sc, x, y + h - c, c, c);
  ctx.drawImage(img, iw - sc, ih - sc, sc, sc, x + w - c, y + h - c, c, c);
  if (w > c * 2) {
    ctx.drawImage(img, sc, 0, mw, sc, x + c, y, w - c * 2, c);
    ctx.drawImage(img, sc, ih - sc, mw, sc, x + c, y + h - c, w - c * 2, c);
  }
  if (h > c * 2) {
    ctx.drawImage(img, 0, sc, sc, mh, x, y + c, c, h - c * 2);
    ctx.drawImage(img, iw - sc, sc, sc, mh, x + w - c, y + c, c, h - c * 2);
  }
  if (w > c * 2 && h > c * 2) ctx.drawImage(img, sc, sc, mw, mh, x + c, y + c, w - c * 2, h - c * 2);
}

// 3 段（192x64 源、64 端帽），可整体缩放高度
function three(img, x, y, w, h = 64) {
  const s = h / 64, cap = 64 * s;
  ctx.drawImage(img, 0, 0, 64, 64, x, y, cap, h);
  ctx.drawImage(img, 128, 0, 64, 64, x + w - cap, y, cap, h);
  if (w > cap * 2) ctx.drawImage(img, 64, 0, 64, 64, x + cap, y + 0, w - cap * 2, h);
}

// 文字按钮（3 段皮肤）
function skinBtn(id, r, text, kind = 'secondary', fontSize = 18) {
  const pressed = uiPressedId === id;
  let img;
  if (kind === 'primary') img = pressed ? uiBtn.Red_3P : uiBtn.Red_3;
  else if (kind === 'disabled') img = uiBtn.Disable_3;
  else if (kind === 'hover') img = uiBtn.Hover_3;
  else img = pressed ? uiBtn.Blue_3P : uiBtn.Blue_3;
  three(img, r.x, r.y, r.w, r.h);
  ctx.fillStyle = kind === 'disabled' ? 'rgba(90,58,26,0.5)' : UI_TEXT;
  ctx.font = `${fontSize}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + fontSize * 0.34 + (pressed ? 2 : 0));
}

// 小方块按钮 + 图标（图标三态: Regular/Pressed/Disable）
function iconBtn(id, r, iconIdx, kind = 'blue') {
  const pressed = uiPressedId === id;
  let img;
  if (kind === 'red') img = pressed ? uiBtn.Red_P : uiBtn.Red;
  else if (kind === 'hover') img = uiBtn.Hover;
  else if (kind === 'disable') img = uiBtn.Disable;
  else img = pressed ? uiBtn.Blue_P : uiBtn.Blue;
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  const icon = kind === 'disable' ? uiIcon.Disable[iconIdx] : pressed ? uiIcon.Pressed[iconIdx] : uiIcon.Regular[iconIdx];
  const s = r.w * 0.62;
  ctx.drawImage(icon, r.x + (r.w - s) / 2, r.y + (r.h - s) / 2 + (pressed ? 2 : 0), s, s);
}

// 卡片底（9 宫格）：normal 蓝 / locked 木牌禁用 / equipped 金色 / flash 红按下
function cardBg(r, kind, pressed) {
  let img;
  if (kind === 'locked') img = uiBtn.Disable_9;
  else if (kind === 'equipped') img = uiBtn.Hover_9;
  else if (kind === 'danger') img = pressed ? uiBtn.Red_9P : uiBtn.Red_9;
  else img = pressed ? uiBtn.Blue_9P : uiBtn.Blue_9;
  nine(img, r.x, r.y, r.w, r.h);
}

// 丝带页签：左帽+中段+右帽（Connection_Left/Down/Right），选中用 _Pressed + 顶部挂钩 Connection_Up
function ribbonTab(id, r, text, color, selected) {
  const P = selected ? '_P' : '';
  const h = r.h;
  ctx.drawImage(uiRibbon[`${color}_Left${P}`], r.x, r.y, h, h);
  if (r.w > h * 2) {
    const mid = uiRibbon[`${color}_Down${P}`];
    ctx.drawImage(mid, 0, 0, 64, 64, r.x + h, r.y, r.w - h * 2, h);
  }
  ctx.drawImage(uiRibbon[`${color}_Right${P}`], r.x + r.w - h, r.y, h, h);
  if (selected) ctx.drawImage(uiRibbon[`${color}_Up_P`], r.x + r.w / 2 - 14, r.y - 12, 28, 28);
  else ctx.drawImage(uiRibbon[`${color}_Up`], r.x + r.w / 2 - 10, r.y - 8, 20, 20);
  ctx.fillStyle = selected ? '#fff6e0' : '#f0e0c0';
  ctx.font = `${selected ? 17 : 15}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, r.x + r.w / 2, r.y + h / 2 + 6);
}

// 丝带横标（3Slides）
function ribbonHeader(color, cx, y, w, text, fontSize = 20) {
  three(uiRibbon[color + '_3'], cx - w / 2, y, w, 56);
  ctx.fillStyle = '#fff6e0';
  ctx.font = `${fontSize}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 35);
}
