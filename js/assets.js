// 统一资源加载 —— Tiny Swords 197 张 + luizmelo 怪物 + Scarloxy 精灵全部在此登记
const pending = [];
function loadImg(src) {
  const img = new Image();
  img.src = src;
  pending.push(img);
  return img;
}
const TSW = 'assets/tiny_swords/';

// ---- luizmelo 怪物（150px 帧，单行文件）----
const images = {};
for (const [type, cfg] of Object.entries(CONFIG.monsters)) {
  images[type] = {};
  if (cfg.tierSheets) {
    images[type].tiers = cfg.tierSheets.map(p => loadImg(TSW + 'factions/goblins/troops/' + p));
  } else {
    for (const [anim, a] of Object.entries(cfg.anims)) images[type][anim] = loadImg('assets/monsters/' + a.file);
    if (cfg.projectile) images[type].projectile = loadImg('assets/monsters/' + cfg.projectile.file);
  }
}

// ---- Scarloxy 精灵 + 元素特效 ----
const petImgs = {}, petIcons = {}, effectImgs = {};
for (const id of Object.keys(CONFIG.pets)) {
  const file = id[0].toUpperCase() + id.slice(1) + '.png';
  petImgs[id] = loadImg('assets/pets/' + file);
  petIcons[id] = loadImg('assets/pets/icons/' + file);
}
for (const [id, e] of Object.entries(CONFIG.effects)) effectImgs[id] = loadImg('assets/effects/' + e.file);

// ---- Tiny Swords 地形 ----
const tswTilemap = loadImg(TSW + 'terrain/ground/Tilemap_Flat.png');        // 草/沙自动拼接
const tswElev = loadImg(TSW + 'terrain/ground/Tilemap_Elevation.png');      // 岩台障碍
const tswShadows = loadImg(TSW + 'terrain/ground/Shadows.png');             // 大型物件底部阴影
const tswWater = loadImg(TSW + 'terrain/water/Water.png');
const tswFoam = loadImg(TSW + 'terrain/water/foam/Foam.png');
const tswRocks = [1, 2, 3, 4].map(i => loadImg(TSW + `terrain/water/rocks/Rocks_0${i}.png`));
const tswBridge = loadImg(TSW + 'terrain/bridge/Bridge_All.png');           // 海边栈桥（可行走）

// ---- 资源与生灵 ----
const tswTree = loadImg(TSW + 'resources/trees/Tree.png');                  // 动态树（含残桩帧）
const tswGoldMine = {
  active: loadImg(TSW + 'resources/gold_mine/GoldMine_Active.png'),
  inactive: loadImg(TSW + 'resources/gold_mine/GoldMine_Inactive.png'),
  destroyed: loadImg(TSW + 'resources/gold_mine/GoldMine_Destroyed.png'),
};
const tswRes = {};      // G金 M肉 W木：Spawn 落地动画 / Idle 待拾取 / NoShadow 用作 HUD 与飘字图标
for (const k of ['G', 'M', 'W']) {
  tswRes[k] = {
    idle: loadImg(TSW + `resources/resources/${k}_Idle.png`),
    spawn: loadImg(TSW + `resources/resources/${k}_Spawn.png`),
    icon: loadImg(TSW + `resources/resources/${k}_Idle_(NoShadow).png`),
  };
}
const tswSheep = {
  idle: loadImg(TSW + 'resources/sheep/HappySheep_Idle.png'),       // 吃草
  bounce: loadImg(TSW + 'resources/sheep/HappySheep_Bouncing.png'), // 蹦跳移动
  all: loadImg(TSW + 'resources/sheep/HappySheep_All.png'),         // 标题界面装饰羊群
};

// ---- 骑士阵营：地标建筑（4 色 + 在建 + 废墟）与佣兵 ----
const tswCastle = {}, tswHouse = {}, tswTowerB = {};
for (const c of ['Blue', 'Red', 'Yellow', 'Purple']) {
  tswCastle[c] = loadImg(TSW + `factions/knights/buildings/castle/Castle_${c}.png`);
  tswHouse[c] = loadImg(TSW + `factions/knights/buildings/house/House_${c}.png`);
  tswTowerB[c] = loadImg(TSW + `factions/knights/buildings/tower/Tower_${c}.png`);
}
tswCastle.Construction = loadImg(TSW + 'factions/knights/buildings/castle/Castle_Construction.png');
tswCastle.Destroyed = loadImg(TSW + 'factions/knights/buildings/castle/Castle_Destroyed.png');
tswHouse.Construction = loadImg(TSW + 'factions/knights/buildings/house/House_Construction.png');
tswHouse.Destroyed = loadImg(TSW + 'factions/knights/buildings/house/House_Destroyed.png');
tswTowerB.Construction = loadImg(TSW + 'factions/knights/buildings/tower/Tower_Construction.png');
tswTowerB.Destroyed = loadImg(TSW + 'factions/knights/buildings/tower/Tower_Destroyed.png');

const tswMerc = { pawn: [], warrior: [], archer: [] };               // 佣兵 4 色 = 4 档
for (const c of CONFIG.mercColors) {
  tswMerc.pawn.push(loadImg(TSW + `factions/knights/troops/pawn/${c.toLowerCase()}/Pawn_${c}.png`));
  tswMerc.warrior.push(loadImg(TSW + `factions/knights/troops/warrior/${c.toLowerCase()}/Warrior_${c}.png`));
}
tswMerc.archer = [
  loadImg(TSW + 'factions/knights/troops/archer/blue/Archer_Blue.png'),
  loadImg(TSW + 'factions/knights/troops/archer/yellow/Archer_Yellow.png'),
  loadImg(TSW + 'factions/knights/troops/archer/purple/Archer_Purlple.png'),
  loadImg(TSW + 'factions/knights/troops/archer/red/Archer_Red.png'),
];
const tswTowerArcher = {};   // 驻塔弓手：无臂身体 + 可旋转弓（塔色对应弓手色）
for (const c of ['Blue', 'Red', 'Yellow', 'Purple']) {
  tswTowerArcher[c] = {
    body: loadImg(TSW + `factions/knights/troops/archer/archer_+_bow/Archer_${c}_(NoArms).png`),
    bow: loadImg(TSW + `factions/knights/troops/archer/archer_+_bow/Archer_Bow_${c}.png`),
  };
}
const tswArrow = loadImg(TSW + 'factions/knights/troops/archer/arrow/Arrow.png');
const tswDead = loadImg(TSW + 'factions/knights/troops/dead/Dead.png');     // 佣兵阵亡动画

// ---- 哥布林阵营：营地建筑 ----
const tswGobHouse = {
  ok: loadImg(TSW + 'factions/goblins/buildings/wood_house/Goblin_House.png'),
  destroyed: loadImg(TSW + 'factions/goblins/buildings/wood_house/Goblin_House_Destroyed.png'),
};
const tswWoodTower = { frames: {} };   // 瞭望塔 4 色（4 帧摇晃动画）+ 在建 + 损毁
for (const c of ['Blue', 'Red', 'Yellow', 'Purple']) {
  tswWoodTower.frames[c] = loadImg(TSW + `factions/goblins/buildings/wood_tower/Wood_Tower_${c}.png`);
}
tswWoodTower.construction = loadImg(TSW + 'factions/goblins/buildings/wood_tower/Wood_Tower_InConstruction.png');
tswWoodTower.destroyed = loadImg(TSW + 'factions/goblins/buildings/wood_tower/Wood_Tower_Destroyed.png');

// ---- 投射物与爆炸 ----
const tswDynamite = loadImg(TSW + 'factions/goblins/troops/tnt/dynamite/Dynamite.png');
const tswExplosion = loadImg(TSW + 'effects/explosion/Explosions.png');
const tswFire = loadImg(TSW + 'effects/fire/Fire.png');

// ---- 装饰 18 件 ----
const GRASS_DECOS = ['01', '02', '03', '07', '08', '09', '10', '16', '17'];
const SAND_DECOS = ['04', '05', '06', '11', '12', '13', '14', '15'];
const tswDecos = {};
for (let i = 1; i <= 18; i++) {
  const n = String(i).padStart(2, '0');
  tswDecos[n] = loadImg(TSW + 'deco/' + n + '.png');
}

// ---- UI：按钮 18 / 丝带 27 / 横幅 9 / 图标 30 / 指针 6 ----
const uiBtn = {};
for (const n of ['Blue', 'Red', 'Hover', 'Disable']) {
  uiBtn[n] = loadImg(TSW + `ui/buttons/Button_${n}.png`);
  uiBtn[n + '_3'] = loadImg(TSW + `ui/buttons/Button_${n}_3Slides.png`);
  uiBtn[n + '_9'] = loadImg(TSW + `ui/buttons/Button_${n}_9Slides.png`);
}
for (const n of ['Blue', 'Red']) {
  uiBtn[n + '_P'] = loadImg(TSW + `ui/buttons/Button_${n}_Pressed.png`);
  uiBtn[n + '_3P'] = loadImg(TSW + `ui/buttons/Button_${n}_3Slides_Pressed.png`);
  uiBtn[n + '_9P'] = loadImg(TSW + `ui/buttons/Button_${n}_9Slides_Pressed.png`);
}
const uiRibbon = {};
for (const c of ['Blue', 'Red', 'Yellow']) {
  uiRibbon[c + '_3'] = loadImg(TSW + `ui/ribbons/Ribbon_${c}_3Slides.png`);
  for (const d of ['Up', 'Down', 'Left', 'Right']) {
    uiRibbon[`${c}_${d}`] = loadImg(TSW + `ui/ribbons/Ribbon_${c}_Connection_${d}.png`);
    uiRibbon[`${c}_${d}_P`] = loadImg(TSW + `ui/ribbons/Ribbon_${c}_Connection_${d}_Pressed.png`);
  }
}
const uiBanner = {
  h: loadImg(TSW + 'ui/banners/Banner_Horizontal.png'),
  v: loadImg(TSW + 'ui/banners/Banner_Vertical.png'),
  up: loadImg(TSW + 'ui/banners/Banner_Connection_Up.png'),
  down: loadImg(TSW + 'ui/banners/Banner_Connection_Down.png'),
  left: loadImg(TSW + 'ui/banners/Banner_Connection_Left.png'),
  right: loadImg(TSW + 'ui/banners/Banner_Connection_Right.png'),
  carved: loadImg(TSW + 'ui/banners/Carved_Regular.png'),
  carved3: loadImg(TSW + 'ui/banners/Carved_3Slides.png'),
  carved9: loadImg(TSW + 'ui/banners/Carved_9Slides.png'),
};
const uiIcon = { Regular: [], Pressed: [], Disable: [] };
for (const s of ['Regular', 'Pressed', 'Disable']) {
  for (let i = 1; i <= 10; i++) uiIcon[s].push(loadImg(TSW + `ui/icons/${s}_${String(i).padStart(2, '0')}.png`));
}
const uiPointer = [];
for (let i = 1; i <= 6; i++) uiPointer.push(loadImg(TSW + `ui/pointers/0${i}.png`));
