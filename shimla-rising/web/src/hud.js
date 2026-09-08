import { escapeHtml } from "./util.js";
/** DOM overlay: sitare, paisa, mission list, minimap, speedo, toast. */
export class HUD {
  constructor(data, terrain) {
    this.data = data;
    this.terrain = terrain;
    this.el = {
      stars: document.getElementById("stars"),
      money: document.getElementById("money"),
      district: document.getElementById("district"),
      mission: document.getElementById("mission"),
      mtitle: document.getElementById("mtitle"),
      objlist: document.getElementById("objlist"),
      kmh: document.getElementById("kmh"),
      vehname: document.getElementById("vehname"),
      hp: document.querySelector("#hp > i"),
      st: document.querySelector("#st > i"),
      toast: document.getElementById("toast"),
      minimap: document.querySelector("#minimap canvas"),
      vol: document.getElementById("vol"),
      volBar: document.querySelector("#vol .vbar > i"),
      volNum: document.getElementById("vnum"),
      volIcon: document.getElementById("vicon"),
    };
    this.ctx = this.el.minimap.getContext("2d");
    this.mapScale = 0.055;          // px per metre
    this._toastTimer = 0;
    this._volTimer = 0;
    this._last = {};          // DOM ke liye chhota memo -- neeche `_once()`
    this._prepMinimap();
  }

  /** Minimap ke liye sadak aur POI ek baar world-space mein taiyaar kar lo. */
  _prepMinimap() {
    this.mapRoads = [];
    for (const r of this.data.roads.roads) {
      const pts = r.points.map(([lat, lon]) => this.terrain.geo.toWorld(lat, lon));
      this.mapRoads.push({ pts, color: r.type === "pedestrian" ? "#8a7c5e" : "#55555c",
        w: r.type === "arterial" ? 2.4 : 1.4 });
    }
    this.mapPois = this.data.pois.pois.map((p) => ({
      ...this.terrain.geo.toWorld(p.lat, p.lon), type: p.type,
    }));
  }

  setStars(n) {
    let s = "";
    for (let i = 0; i < 5; i++) s += `<span class="${i < n ? "" : "off"}">&#9733;</span>`;
    this.el.stars.innerHTML = s;
  }

  /*
   * DOM tabhi likho jab value sach mein badli ho.
   *
   * Ye sab `main.js` ke loop se **har frame** bulaye jaate the, aur har baar
   * `innerHTML` likhna matlab string banana + HTML parse + layout invalidate --
   * us aankde ke liye jo secondon mein ek baar badalta hai (paisa, district,
   * mission ki list). `_last` ek chhota memo hai; sirf farak par likhte hain.
   */
  _once(key, value, write) {
    if (this._last[key] === value) return;
    this._last[key] = value;
    write();
  }

  setMoney(v) {
    const s = "&#8377;" + Math.round(v).toLocaleString("en-IN");
    this._once("money", s, () => { this.el.money.innerHTML = s; });
  }
  setDistrict(name) {
    const s = name || "—";
    this._once("district", s, () => { this.el.district.textContent = s; });
  }
  setBars(hp, st) {
    // 0.5% se kam ka farak ek pixel bhi nahi hilata
    const a = Math.round(Math.max(0, hp) * 2) / 2, b = Math.round(Math.max(0, st) * 2) / 2;
    this._once("hp", a, () => { this.el.hp.style.width = a + "%"; });
    this._once("st", b, () => { this.el.st.style.width = b + "%"; });
  }
  setSpeed(kmh, label) {
    const k = Math.round(kmh);
    this._once("kmh", k, () => { this.el.kmh.innerHTML = k + "<small> km/h</small>"; });
    this._once("vehname", label, () => { this.el.vehname.textContent = label; });
  }

  setMission(mission, objIndex, extra = "") {
    if (!mission) {
      this._once("mission", null, () => { this.el.mission.hidden = true; });
      return;
    }
    const key = `${mission.id}|${objIndex}|${extra}`;
    this._once("mission", key, () => {
      this.el.mission.hidden = false;
      this.el.mtitle.textContent = mission.title;
      this.el.objlist.innerHTML = mission.objectives.map((o, i) => {
        const cls = i < objIndex ? "done" : i === objIndex ? "active" : "";
        const suffix = i === objIndex && extra ? ` <span style="opacity:.75">${extra}</span>` : "";
        return `<li class="${cls}">${escapeHtml(o.text)}${suffix}</li>`;
      }).join("");
    });
  }

  toast(msg, seconds = 2.6) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    this._toastTimer = seconds;
  }

  /**
   * Awaaz ka indicator. Volume badalte hi dikhta hai aur do second baad ghul
   * jaata hai -- HUD par hamesha ek aur cheez nahi chahiye.
   */
  setVolume(v, muted) {
    const el = this.el.vol;
    if (!el) return;
    this.el.volBar.style.width = `${Math.round(v * 100)}%`;
    this.el.volNum.textContent = muted ? "mute" : `${Math.round(v * 100)}%`;
    this.el.volIcon.innerHTML = muted ? "&#128263;" : v < 0.34 ? "&#128265;" : "&#128266;";
    el.classList.toggle("mute", !!muted);
    el.classList.add("show");
    this._volTimer = 2.2;
  }

  update(dt, playerPos, playerYaw, markers) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove("show");
    }
    if (this._volTimer > 0) {
      this._volTimer -= dt;
      if (this._volTimer <= 0) this.el.vol?.classList.remove("show");
    }
    /*
     * Minimap 15 Hz par, har frame nahi.
     *
     * Ek poora 2D canvas redraw hai: 24 sadak ki polyline, 58 POI, aur mission
     * marker -- har frame. Naksha 190 px ka hai aur khiladi 6 m/s chalta hai,
     * yaani ek frame mein wo aadha pixel bhi nahi khiskta. 15 Hz par aankh ko
     * farak nahi padta aur CPU ka chautha hissa bach jaata hai.
     */
    this._mapTimer = (this._mapTimer || 0) - dt;
    if (this._mapTimer <= 0) {
      this._mapTimer = 1 / 15;
      this._drawMinimap(playerPos, playerYaw, markers);
    }
  }

  _drawMinimap(p, yaw, markers) {
    const c = this.ctx, W = this.el.minimap.width, H = this.el.minimap.height;
    const s = this.mapScale, cx = W / 2, cy = H / 2;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = "#1a2029"; c.fillRect(0, 0, W, H);

    const tx = (wx) => cx + (wx - p.x) * s;
    const ty = (wz) => cy + (wz - p.z) * s;

    for (const r of this.mapRoads) {
      c.strokeStyle = r.color; c.lineWidth = r.w; c.beginPath();
      let started = false;
      for (const q of r.pts) {
        const X = tx(q.x), Y = ty(q.z);
        if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) { started = false; continue; }
        started ? c.lineTo(X, Y) : (c.moveTo(X, Y), (started = true));
      }
      c.stroke();
    }

    c.fillStyle = "#7d8a99";
    for (const q of this.mapPois) {
      const X = tx(q.x), Y = ty(q.z);
      if (X < 0 || X > W || Y < 0 || Y > H) continue;
      c.fillRect(X - 1.2, Y - 1.2, 2.4, 2.4);
    }

    /*
     * Marker apne **apne rang** mein.
     *
     * Nikhil: *"map m ye b dikha jana kahan h, mission kahan se shuru hone"*.
     * `missions.js` pehle se teen tarah ke marker banata hai -- hara (abhi ka
     * kaam), peela (mission ki shuruaat / objective) aur neela (side
     * mission) -- par yahan sab ek hi `#e8c33a` se putt jaate the, isliye
     * naksha dekh kar ye pata hi nahi chalta tha ki kaunsa nishan kis cheez
     * ka hai. Rang ab marker khud batata hai.
     *
     * Jo nishan daayre se bahar hai wo kinare par chipak jaata hai aur uspar
     * ek chhota teer bhi banta hai -- sirf gola dekh kar disha nahi padhti.
     */
    let nearest = null, nd = Infinity;
    for (const m of markers) {
      const hex = m.userData?.markerColor ?? 0xe8c33a;
      const kind = m.userData?.markerKind ?? "objective";
      c.fillStyle = "#" + hex.toString(16).padStart(6, "0");
      const X = tx(m.position.x), Y = ty(m.position.z);
      const dw = Math.hypot(m.position.x - p.x, m.position.z - p.z);
      if (dw < nd) { nd = dw; nearest = { kind, hex }; }
      const cl = Math.hypot(X - cx, Y - cy);
      const lim = W / 2 - 9;
      if (cl > lim) {
        const k = lim / cl, ex = cx + (X - cx) * k, ey = cy + (Y - cy) * k;
        c.save();
        c.translate(ex, ey);
        c.rotate(Math.atan2(Y - cy, X - cx) + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -5.5); c.lineTo(4, 3.5); c.lineTo(-4, 3.5);
        c.closePath(); c.fill();
        c.restore();
      } else {
        c.beginPath(); c.arc(X, Y, kind === "start" ? 3.4 : 4.4, 0, Math.PI * 2); c.fill();
        if (kind === "active" || kind === "objective") {
          c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1.4;
          c.beginPath(); c.arc(X, Y, 7.5, 0, Math.PI * 2); c.stroke();
        }
      }
    }

    // khiladi ka arrow
    c.translate(cx, cy); c.rotate(-yaw);
    c.fillStyle = "#ffffff"; c.beginPath();
    c.moveTo(0, -6); c.lineTo(4.4, 5); c.lineTo(0, 2.6); c.lineTo(-4.4, 5);
    c.closePath(); c.fill();
    c.restore();

    c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); c.stroke();

    /*
     * Sabse paas wale nishan tak ki **doori**.
     *
     * Sirf gola dikhne se ye nahi pata chalta ki wo 40 m door hai ya 900 m.
     * Neeche ek chhoti patti par doori aur ye ki wo kaam hai ya nayi mission
     * ki shuruaat.
     */
    if (nearest) {
      const txt = (nd >= 1000 ? (nd / 1000).toFixed(1) + " km" : Math.round(nd) + " m")
        + (nearest.kind === "start" ? "  mission" : "  kaam");
      c.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      c.textAlign = "center";
      const tw = c.measureText(txt).width + 12;
      c.fillStyle = "rgba(12,16,22,.78)";
      c.fillRect(cx - tw / 2, H - 27, tw, 16);
      c.fillStyle = "#" + nearest.hex.toString(16).padStart(6, "0");
      c.fillText(txt, cx, H - 15);
    }
  }
}
