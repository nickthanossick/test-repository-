// Keyboard + mouse. Pointer lock optional hai -- bina lock ke bhi drag se camera ghoomta hai.
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this._pressedOnce = new Set();

    addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this._pressedOnce.add(k);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(k)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    dom.addEventListener("click", () => { if (!this.locked) dom.requestPointerLock?.(); });
    document.addEventListener("pointerlockchange", () => { this.locked = document.pointerLockElement === dom; });
    addEventListener("mousemove", (e) => {
      if (this.locked || e.buttons & 1) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
    });
  }

  down(code) { return this.keys.has(code); }

  /** Do mein se koi bhi dabaa ho. */
  anyDown(...codes) { return codes.some((c) => this.keys.has(c)); }

  /** Sirf ek baar true -- toggle keys (F, M, H) ke liye. */
  pressed(code) {
    if (this._pressedOnce.has(code)) { this._pressedOnce.delete(code); return true; }
    return false;
  }

  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }

  /** Har frame ke aakhir mein call karo. */
  endFrame() { this.mouseDX = 0; this.mouseDY = 0; this._pressedOnce.clear(); }
}
