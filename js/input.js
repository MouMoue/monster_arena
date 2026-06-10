// 输入抽象 —— PRD 4.8：键盘 + 触屏统一为「移动向量 + 开火信号」，游戏逻辑不感知来源
// 触屏：左半屏动态摇杆（按下处为原点），右半屏按住开火；必须支持多点触控
class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.moveX = 0;
    this.moveY = 0;
    this.firing = false;
    this.touchSeen = false;          // 检测到触屏才显示虚拟控件
    this.joystick = null;            // {id, ox, oy, cx, cy}
    this.firePointers = new Set();
    this.taps = [];                  // 本帧的点按事件 [{x,y}]，UI 用
    this.keyPresses = [];            // 本帧的按键 code 列表，UI 用

    addEventListener('keydown', e => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.keyPresses.push(e.code);
      this.keys[e.code] = true;
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });

    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    canvas.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('pointercancel', e => this.onUp(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * CONFIG.W / r.width, y: (e.clientY - r.top) * CONFIG.H / r.height };
  }

  onDown(e) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = this.toLogical(e);
    this.taps.push(p);
    if (e.pointerType === 'touch') {
      this.touchSeen = true;
      if (p.x < CONFIG.W / 2) {
        if (!this.joystick) this.joystick = { id: e.pointerId, ox: p.x, oy: p.y, cx: p.x, cy: p.y };
      } else {
        this.firePointers.add(e.pointerId);
      }
    } else if (e.pointerType === 'mouse') {
      this.firePointers.add(e.pointerId); // 鼠标按住也可开火
    }
  }

  onMove(e) {
    if (this.joystick && e.pointerId === this.joystick.id) {
      const p = this.toLogical(e);
      this.joystick.cx = p.x;
      this.joystick.cy = p.y;
    }
  }

  onUp(e) {
    if (this.joystick && e.pointerId === this.joystick.id) this.joystick = null;
    this.firePointers.delete(e.pointerId);
  }

  // 每帧调用：汇总键盘+触屏为统一信号
  poll() {
    let mx = 0, my = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) mx -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) mx += 1;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) my -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) my += 1;

    if (this.joystick) {
      const dx = this.joystick.cx - this.joystick.ox;
      const dy = this.joystick.cy - this.joystick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 10) { mx = dx / d; my = dy / d; }   // 死区 10px，方向 360° 自由
    }

    const len = Math.hypot(mx, my);
    this.moveX = len > 0 ? mx / len : 0;
    this.moveY = len > 0 ? my / len : 0;
    this.firing = this.firePointers.size > 0 || !!this.keys['KeyJ'] || !!this.keys['Space'];
  }

  // 帧末清空一次性事件
  flush() {
    this.taps.length = 0;
    this.keyPresses.length = 0;
  }
}
