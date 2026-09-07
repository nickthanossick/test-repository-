/**
 * Flashcards -- mission se pehle do line ki kahani, asli jagah ke saamne.
 *
 * Nikhil: "pehle flash cards aayenge jo thodi back story batayenge Vicky bhai,
 * aur har mission pe pehle flashcards aake thoda batayenge ki kya hai."
 *
 * Card ke peeche koi banayi hui tasveer nahi hai -- **game khud us jagah ka
 * shot leta hai**. Camera `main.js` ke `lookAt()` se wahan jaata hai (wahi
 * ray-march wala, jo ghane bazaar mein bhi deewar ke peeche nahi phasta), ek
 * frame render hota hai, aur wahi frame card ke peeche ruk jaata hai. Isliye
 * har card us jagah ka hai jahan mission wakai hoga, aur duniya badalne par
 * card apne aap badal jaata hai.
 *
 * Card khule hone par game rukta hai: `active` true rehta hai aur `main.js` ka
 * loop na khiladi ko chalata hai na mission ko tick karta hai.
 */
export class Flashcards {
  /**
   * @param el      full-screen overlay (#flash)
   * @param deps    {lookAt, render, poiExists}
   */
  constructor(el, deps) {
    this.el = el;
    this.d = deps;
    this.deck = [];
    this.index = 0;
    this.active = false;
    this._onDone = null;

    this._advance = () => this.next();
    this._key = (e) => {
      if (!this.active) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
        e.preventDefault();
        if (e.code === "Escape") this.finish();
        else this.next();
      }
    };
    el.addEventListener("click", this._advance);
    window.addEventListener("keydown", this._key);
  }

  /** @param deck [{poi, dist, elev, title, text}] */
  play(deck, onDone) {
    if (!deck || !deck.length) { onDone?.(); return false; }
    this.deck = deck;
    this.index = 0;
    this.active = true;
    this._onDone = onDone;
    this.el.hidden = false;
    document.body.classList.add("carding");
    this._show();
    return true;
  }

  next() {
    this.index++;
    if (this.index >= this.deck.length) { this.finish(); return; }
    this._show();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.el.hidden = true;
    document.body.classList.remove("carding");
    const done = this._onDone;
    this._onDone = null;
    done?.();
  }

  _show() {
    const c = this.deck[this.index];
    /*
     * Camera ko jagah par le jaakar ek frame kheencho.
     *
     * Ye `requestAnimationFrame` ke bahar seedha render hai -- main loop card
     * khule hone par rukka hua hai, isliye agar yahan render na karein to
     * parde ke peeche pichhla frame hi ruka rehta.
     */
    if (this.d.poiExists?.(c.poi)) {
      this.d.lookAt(c.poi, c.dist ?? 26, c.elev ?? 6);
      this.d.render();
    }
    const n = this.deck.length;
    this.el.innerHTML = `
      <div class="fcard">
        <div class="fnum">${this.index + 1} / ${n}</div>
        <h2>${esc(c.title)}</h2>
        <p>${esc(c.text)}</p>
        <div class="fhint">${this.index + 1 === n
          ? "Space / click &mdash; shuru karo"
          : "Space / click &mdash; aage"}</div>
      </div>`;
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
