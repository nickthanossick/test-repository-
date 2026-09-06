import { escapeHtml } from "./util.js";
/** Hinglish subtitle runner. data/dialogue.json ke beats chalata hai. */
export class Dialogue {
  constructor(el, data) {
    this.el = el;
    this.lines = data.dialogue.lines;
    this.characters = data.characterById;
    this.queue = [];
    this.timer = 0;
  }

  play(key) {
    const beat = this.lines[key];
    if (!beat) return false;
    this.queue.push(...beat);
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
