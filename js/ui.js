// Tiny Swords UI 皮肤：9宫格/3段切片 + 丝带页签 + 三态按钮 + 图标
// 按钮: Blue=次要 Red=主要 Hover=选中态 Disable=不可用, _Pressed=按下反馈
const UI_TEXT = '#5a3a1a';
let uiPressedId = null, uiPressedT = 0;

function uiPress(id) { uiPressedId = id; uiPressedT = 0.18; }
function uiTick(dt) { if (uiPressedT > 0) { uiPressedT -= dt; if (uiPressedT <= 0) uiPressedId = null; } }

// 9 宫格（192 源图、64 角；小尺寸时角部等比缩小）
function nine(img, x, y, w, h) {
  const c = Math.min(64, Math.floor(h / 2.2), Math.floor(w / 2.2));   // 目标角尺寸（小尺寸时等比缩小）
  const sc = 64;                         // 源图角固定 64
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
  ctx.textBaseline = 'middle';            // 中文字形按几何中心对齐，修正按钮内偏上
  ctx.fillText(text, r.x + r.w / 2, r.y + r.h * 0.44 + (pressed ? 2 : 0));   // 按钮面板主体偏上（下方是底座），按 44% 高度居中
  ctx.textBaseline = 'alphabetic';
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

// 像素数字 4（仿 1-3 图标：深描边浅底板 + 深色数字）
const ICON_FOUR = (() => {
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4252';
  g.fillRect(1, 0, 22, 24); g.fillRect(0, 1, 24, 22);      // 深色描边底
  g.fillStyle = '#ece7db';
  g.fillRect(2, 2, 20, 20);                                 // 浅底板
  g.fillStyle = '#f8f4ec';
  g.fillRect(2, 2, 20, 3);                                  // 顶部高光
  g.fillStyle = '#cfc8b8';
  g.fillRect(2, 19, 20, 3);                                 // 底部阴影
  const GLYPH = ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'];
  g.fillStyle = '#3a4252';
  GLYPH.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] === 'X') g.fillRect(7 + gx * 2, 5 + gy * 2, 2, 2);
    }
  });
  return c;
})();

// 像素装备图标（24px，描边+主体+高光，与 hero.js 枪械同风格）
const EQUIP_ICONS = (() => {
  function make(draw) {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    draw(px);
    return c;
  }
  const O = '#23272f', BR = '#8a5429', BR2 = '#a96b38', BR3 = '#c98d4b';
  const ST = '#6b7488', ST2 = '#9aa3b8', ST3 = '#c7cedd';
  const GD = '#ffd23e', GD2 = '#b8762a', GR = '#639922', GR2 = '#7db83a';
  return {
    leather: make(px => {              // 皮甲：护肩 + 系带
      px(4, 3, 16, 18, O); px(5, 4, 14, 16, BR);
      px(5, 4, 4, 5, BR2); px(15, 4, 4, 5, BR2);          // 护肩
      px(9, 4, 6, 3, O);                                   // 领口
      px(8, 9, 8, 9, BR2); px(8, 9, 8, 2, BR3);            // 胸甲亮面
      px(11, 11, 2, 7, GD2);                               // 系带
    }),
    steel: make(px => {                // 钢板甲：板甲 + 斜高光
      px(4, 3, 16, 18, O); px(5, 4, 14, 16, ST);
      px(5, 4, 4, 5, ST2); px(15, 4, 4, 5, ST2);
      px(9, 4, 6, 3, O);
      px(8, 9, 8, 9, ST2); px(8, 9, 3, 3, ST3); px(11, 12, 3, 3, ST3);
    }),
    boots: make(px => {                // 疾跑靴：靴筒 + 翅膀
      px(7, 3, 7, 12, O); px(8, 4, 5, 10, BR);
      px(7, 13, 12, 8, O); px(8, 14, 10, 5, BR2);
      px(8, 19, 11, 2, '#3a2a18');                         // 鞋底
      px(13, 5, 7, 3, GD); px(15, 8, 5, 2, GD);            // 风翼
    }),
    mag: make(px => {                  // 快装弹夹：弹窗见弹
      px(6, 2, 12, 20, O); px(7, 3, 10, 18, ST);
      px(9, 5, 6, 14, '#3a3f4d');
      px(10, 6, 4, 3, GD); px(10, 11, 4, 3, GD); px(10, 16, 4, 3, GD);
      px(7, 3, 10, 2, ST3);
    }),
    amulet: make(px => {               // 守护护符：项链 + 紫宝石
      px(6, 2, 2, 2, GD2); px(16, 2, 2, 2, GD2); px(8, 1, 8, 2, GD2);
      px(10, 4, 4, 4, GD2);
      px(7, 8, 10, 12, O); px(8, 9, 8, 10, '#9b59d0');
      px(9, 10, 3, 3, '#c79df0');
    }),
    magnet: make(px => {               // 磁石项链：U 形磁铁
      px(4, 4, 7, 16, O); px(13, 4, 7, 16, O); px(4, 14, 16, 6, O);
      px(5, 5, 5, 14, '#d85a30'); px(14, 5, 5, 14, '#d85a30');
      px(5, 15, 14, 4, '#e8825c');
      px(5, 5, 5, 4, ST3); px(14, 5, 5, 4, ST3);           // 银极头
    }),
    scope: make(px => {                // 鹰眼瞄准镜：镜筒 + 蓝镜片
      px(2, 9, 20, 7, O); px(3, 10, 18, 5, ST);
      px(3, 10, 18, 2, ST2);
      px(2, 8, 5, 9, O); px(3, 9, 3, 7, ST2);
      px(18, 9, 5, 7, O); px(19, 10, 3, 5, '#378add'); px(19, 10, 2, 2, '#9fd0ff');
      px(10, 6, 4, 4, O); px(11, 7, 2, 2, ST2);            // 调焦钮
    }),
    ring: make(px => {                 // 再生戒指：金环 + 绿宝石
      px(6, 8, 12, 13, O); px(7, 9, 10, 11, GD); px(9, 11, 6, 7, '#1a1408');
      px(8, 10, 3, 2, '#fff0b0');
      px(9, 2, 6, 7, O); px(10, 3, 4, 5, GR); px(10, 3, 2, 2, GR2);
    }),
    ap: make(px => {                   // 穿甲弹匣：三发尖头弹
      for (const dx of [2, 9, 16]) {
        px(dx, 10, 6, 11, O); px(dx + 1, 11, 4, 9, GD);
        px(dx + 1, 4, 4, 7, O); px(dx + 2, 5, 2, 6, ST3); px(dx + 2, 3, 2, 3, O);
      }
    }),
    tome: make(px => {                 // 智慧巨著：蓝皮书 + 金扣
      px(3, 4, 18, 16, O); px(4, 5, 16, 14, '#378add');
      px(6, 5, 2, 14, '#9fd0ff');
      px(18, 5, 2, 14, '#e8dcc0'); px(17, 6, 1, 12, '#cfc3a5');
      px(10, 9, 6, 6, GD); px(12, 11, 2, 2, GD2);          // 金扣
    }),
    clover: make(px => {               // 幸运四叶草
      px(8, 3, 8, 8, O); px(9, 4, 6, 6, GR2);
      px(3, 8, 8, 8, O); px(4, 9, 6, 6, GR);
      px(13, 8, 8, 8, O); px(14, 9, 6, 6, GR);
      px(8, 13, 8, 8, O); px(9, 14, 6, 6, GR2);
      px(11, 10, 2, 9, '#3f6212');
      px(10, 5, 2, 2, '#b5e07a');
    }),
    bell: make(px => {                 // 精灵铃铛：金铃
      px(10, 2, 4, 3, O); px(11, 3, 2, 1, GD2);
      px(6, 5, 12, 12, O); px(7, 6, 10, 10, GD);
      px(8, 7, 3, 3, '#fff0b0');
      px(5, 16, 14, 3, O); px(6, 17, 12, 1, GD2);
      px(10, 19, 4, 4, O); px(11, 20, 2, 2, GD2);          // 铃舌
    }),
  };
})();

// 像素图（离屏画布）以最近邻放大绘制：武器用 HERO_GUNS[id].img，装备用 EQUIP_ICONS[id]
function drawPixelIcon(img, x, y, size) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const sc = size / Math.max(img.width, img.height);
  const w = img.width * sc, h = img.height * sc;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  ctx.restore();
}

// 丝带横标（3Slides）
function ribbonHeader(color, cx, y, w, text, fontSize = 20) {
  three(uiRibbon[color + '_3'], cx - w / 2, y, w, 56);
  ctx.fillStyle = '#fff6e0';
  ctx.font = `${fontSize}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + 35);
}
