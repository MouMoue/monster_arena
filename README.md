# 火柴人：怪物围城（monster_arena）

俯视角竞技场生存小游戏：持枪火柴人居中，怪物从四周持续刷出并涌向主角，走位 + 射击杀怪，活得越久分越高。支持桌面键盘与手机触屏，部署公网后链接分享即玩。

- 产品需求文档：[docs/PRD.md](docs/PRD.md)（v0.3：持枪火柴人 + 触屏支持 + 部署分享）
- 技术栈：原生 HTML5 Canvas + JS，零依赖，静态托管（GitHub Pages）

## 运行

- 本地：浏览器直接打开 index.html，或 `node server.js 8766` 后访问 http://localhost:8766
- 桌面操作：方向键/WASD 移动，J/空格 射击（按住连发），P 暂停，R 重开
- 手机操作：左半屏拖动 = 摇杆移动，右下按钮 = 射击，右上角 = 暂停

## 状态

- [x] 项目结构
- [x] PRD v0.3
- [x] M1 骨架（火柴人绘制 + 八方向移动 + 射击）
- [x] M2 怪物（刷怪/追踪/碰撞/接触伤害）
- [x] M3 战斗闭环（杀怪/死亡结算/最佳纪录/重开）
- [x] M4 难度曲线 + HUD + 暂停
- [x] M5 移动端（视口适配 + 虚拟摇杆/攻击按钮 + 多点触控）
- [ ] M6 部署分享（GitHub Pages 上线）—— 等待 GitHub 账号授权

## 素材署名

怪物雪碧图来自 luizmelo 的 Monsters Creatures Fantasy 包（CC0），详见 assets/monsters/goblin/CREDITS.md。火柴人主角为程序化绘制，无外部素材。
