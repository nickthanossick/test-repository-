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
    };
    this.ctx = this.el.minimap.getContext("2d");
    this.mapScale = 0.055;          // px per metre
    this._toastTimer = 0;
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

  setMoney(v) { this.el.money.innerHTML = "&#8377;" + Math.round(v).toLocaleString("en-IN"); }
  setDistrict(name) { this.el.district.textContent = name || "—"; }
  setBars(hp, st) {
    this.el.hp.style.width = Math.max(0, hp) + "%";
    this.el.st.style.width = Math.max(0, st) + "%";
  }
  setSpeed(kmh, label) {
    this.el.kmh.innerHTML = Math.round(kmh) + "<small> km/h</small>";
    this.el.vehname.textContent = label;
  }

  setMission(mission, objIndex, extra = "") {
    if (!mission) { this.el.mission.hidden = true; return; }
    this.el.mission.hidden = false;
    this.el.mtitle.textContent = mission.title;
    this.el.objlist.innerHTML = mission.objectives.map((o, i) => {
      const cls = i < objIndex ? "done" : i === objIndex ? "active" : "";
      const suffix = i === objIndex && extra ? ` <span style="opacity:.75">${extra}</span>` : "";
      return `<li class="${cls}">${escapeHtml(o.text)}${suffix}</li>`;
    }).join("");
  }

  toast(msg, seconds = 2.6) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    this._toastTimer = seconds;
  }

  update(dt, playerPos, playerYaw, markers) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove("show");
    }
    this._drawMinimap(playerPos, playerYaw, markers);
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

    c.fillStyle = "#e8c33a";
    for (const m of markers) {
      const X = tx(m.position.x), Y = ty(m.position.z);
      const cl = Math.hypot(X - cx, Y - cy);
      const lim = W / 2 - 8;
      if (cl > lim) {                       // kinare pe chipka do, direction dikhane ke liye
        const k = lim / cl;
        c.beginPath(); c.arc(cx + (X - cx) * k, cy + (Y - cy) * k, 3.2, 0, Math.PI * 2); c.fill();
      } else {
        c.beginPath(); c.arc(X, Y, 4, 0, Math.PI * 2); c.fill();
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
  }
}
