import { escapeHtml } from "./util.js";
/** Hinglish subtitle runner. data/dialogue.json ke beats chalata hai. */
export class Dialogue {
  constructor(el, data) {
    this.el = el;
    this.lines = data.dialogue.lines;
    this.characters = data.characterById;
    this.queue = [];
    this.timer = 0;
    /** Har line par bulaaya jaata hai -- main.js isse bolwaata hai. */
    this.onLine = () => {};
  }

  play(key) {
    const beat = this.lines[key];
    if (!beat) return false;
    this.queue.push(...beat);
    if (!this.timer) this._next();
    return true;
  }

  /**
   * Ek hi line -- us key mein se koi ek, bina turant dohraye.
   *
   * `play()` poora beat queue kar deta hai, jo mission ke samvaad ke liye
   * theek hai. Par Vicky jab khud se bolta hai to ek baar mein ek hi line
   * chahiye, aur wahi line baar-baar nahi -- isliye pichhli line yaad rehti
   * hai (`_last`).
   */
  playOne(key) {
    const beat = this.lines[key];
    if (!beat || !beat.length) return false;
    this._last ||= new Map();
    let line = beat[(Math.random() * beat.length) | 0];
    if (beat.length > 1 && line === this._last.get(key)) {
      line = beat[(beat.indexOf(line) + 1) % beat.length];
    }
    this._last.set(key, line);
    this.queue.push(line);
    if (!this.timer) this._next();
    return true;
  }

  say(speaker, text, seconds = 3.2) {
    this.queue.push({ speaker, text, seconds });
    if (!this.timer) this._next();
  }

  _next() {
    const line = this.queue.shift();
    if (!line) { this.el.style.display = "none"; this.timer = 0; return; }
    const c = this.characters.get(line.speaker);
    const name = c ? c.name.replace(/\s*'.*'\s*/, " ").trim() : line.speaker;
    const colour = c?.color || "#e8c33a";
    this.el.innerHTML = `<b style="color:${colour}">${escapeHtml(name)}:</b> ${escapeHtml(line.text)}`;
    this.onLine(line);
    this.el.style.display = "block";
    // padhne ka time: lambai ke hisaab se, kam se kam 2.2s
    this.timer = line.seconds || Math.max(2.2, Math.min(6.5, line.text.length * 0.055));
  }

  update(dt) {
    if (!this.timer) return;
    this.timer -= dt;
    if (this.timer <= 0) this._next();
  }

  get busy() { return this.timer > 0 || this.queue.length > 0; }
}
