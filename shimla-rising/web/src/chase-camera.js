import * as THREE from "three";

/** GTA-style chase camera: peeche-upar se, smooth, aur zameen ke andar nahi ghusti. */
export class ChaseCamera {
  constructor(camera, terrain, colliders = null) {
    this.cam = camera;
    this.terrain = terrain;
    this.colliders = colliders;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 9.5;
    this.targetDist = 9.5;
    // Nikhil: "camera bahut zoom in ho raha, chalne mein aur overall dekhne
    // mein dikkat". Ab wheel se khud tay kar sakta hai.
    this.zoom = 1.0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this._init = false;
  }

  handleMouse(dx, dy, sens = 0.0026) {
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sens, -0.42, 1.15);
  }

  /** Mouse wheel se zoom -- 0.65x (paas) se 1.7x (door) tak. */
  handleWheel(dy) {
    if (!dy) return;
    this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(dy) * 0.12, 0.65, 1.7);
  }

  /**
   * @param mode "foot" | "vehicle"
   * @param speed gaadi ki raftaar m/s -- look-ahead iske saath badhta hai
   */
  update(dt, target, mode, headingYaw = null, speed = 0) {
    const drive = mode === "vehicle";
    /*
     * Nikhil: *"gaadi chalte hue kuch dikh ni ra dhng se"*.
     *
     * Gaadi mein camera ab **ooncha aur thoda door** hai. 4.2 m par wo
     * lagbhag gaadi ki chhat ke barabar tha, aur Shimla ki chadhai par
     * saamne ki sadak gaadi ke peeche chhup jaati thi -- aage kya aa raha
     * hai, kuch dikhta hi nahi tha.
     */
    this.targetDist = (drive ? 14.5 : 9.5) * this.zoom;
    /*
     * Oonchai 4.2 se 4.9 -- 5.6 nahi.
     *
     * Pehle 5.6 rakha tha, par naapne par kul oonchai 9.1 m nikli (kyunki
     * `pitch` ka `sin(pitch) * dist` bhi upar se judta hai). Us par camera
     * helicopter jaisa lagta hai aur apni gaadi hi mushkil se dikhti hai.
     * 4.9 par kul ~8 m aata hai: saamne ki sadak bhi dikhti hai aur gaadi
     * bhi frame mein rehti hai.
     */
    const height = (drive ? 4.9 : 3.1) * (0.6 + this.zoom * 0.4);
    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 4);

    /*
     * Gaadi mein camera uske peeche aata hai -- ab **do guna tez** (1.5 se
     * 3.2). Pehle mod par camera itna peeche reh jaata tha ki aap gaadi ka
     * pehlu dekhte the, aage ki sadak nahi.
     */
    if (headingYaw !== null) {
      let d = headingYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * (drive ? 3.2 : 1.5));
    }

    const cp = Math.cos(this.pitch);
    const want = _v.set(
      target.x + Math.sin(this.yaw) * this.dist * cp,
      target.y + height + Math.sin(this.pitch) * this.dist,
      target.z + Math.cos(this.yaw) * this.dist * cp,
    );

    // terrain ke neeche mat jaao
    const ground = this.terrain.heightAt(want.x, want.z) + 1.6;
    if (want.y < ground) want.y = ground;

    // Imaarat ke andar mat jaao. Target se camera tak ray march karke pehli
    // deewar dhoondo aur us se thoda pehle ruk jaao -- warna Shimla ki ghani
    // basti mein camera har doosre frame mein kisi chhat ke andar hota hai.
    /*
     * Deewar aane par camera **paas nahi aata, upar uthta hai**.
     *
     * Purana tareeka har frame ke hisaab se camera ko `max(0.18, ...)` par
     * kheench leta tha -- yaani doori ka sirf 18%, gaadi se lagbhag 2.5 m.
     * Sanjauli ki ghani gali mein ray har doosre frame kisi dukan se takrati
     * hai, isliye camera **har frame andar-bahar jhatakta** tha aur bahut
     * paas rehta tha: screen par gaadi ki dickey ke alawa kuch nahi. Yahi
     * "gaadi chalate hue kuch dikhta nahi" ki asli wajah thi.
     *
     * Ab do badlaav: (1) kam se kam 45% doori bachi rehti hai, aur (2) jo
     * kaatna padta hai wo **waqt ke saath narm** hota hai (`_occl`), isliye
     * jhatka nahi lagta. Ghani basti mein camera thoda upar uth jaata hai --
     * wahan se sadak dikhti hai, deewar nahi.
     */
    let occl = 1;
    if (this.colliders) {
      const eyeY = target.y + height;
      const dx = want.x - target.x, dy = want.y - eyeY, dz = want.z - target.z;
      const STEPS = 10;
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const px = target.x + dx * t, py = eyeY + dy * t, pz = target.z + dz * t;
        if (this.colliders.inside(px, py, pz, 0.9)) {
          occl = Math.max(drive ? 0.45 : 0.32, (i - 1) / STEPS);
          break;
        }
      }
    }
    // andar jaana turant (deewar mein ghusna nahi chahiye), bahar aana narm
    const prev = this._occl ?? 1;
    this._occl = occl < prev ? occl : prev + (occl - prev) * Math.min(1, dt * 2.2);
    if (this._occl < 0.999) {
      const eyeY = target.y + height;
      const dx = want.x - target.x, dy = want.y - eyeY, dz = want.z - target.z;
      const b = this._occl;
      // doori katti hai to oonchai lautaate hain -- upar se raasta dikhta hai
      want.set(target.x + dx * b, eyeY + dy * b + (1 - b) * height * 0.85, target.z + dz * b);
      const g2 = this.terrain.heightAt(want.x, want.z) + 1.2;
      if (want.y < g2) want.y = g2;
    }

    if (!this._init) { this.pos.copy(want); this._init = true; }
    else this.pos.lerp(want, Math.min(1, dt * 9));

    /*
     * Nazar gaadi par nahi, **gaadi ke aage** hoti hai.
     *
     * Camera seedha gaadi ko dekhta tha, isliye aadhi screen gaadi hi thi.
     * Ab dekhne ka bindu raftaar ke saath aage khisakta hai (60 km/h par
     * lagbhag 8 m), jaise har driving game mein hota hai -- sadak, mod aur
     * saamne ka traffic sab pehle dikhne lagta hai.
     */
    const lookY = target.y + (drive ? 1.6 : 1.5);
    let lx = target.x, lz = target.z;
    if (drive && headingYaw !== null) {
      // 6 m tak -- isse zyada par nazar itni aage chali jaati hai ki
      // apni gaadi frame se neeche nikal jaati hai
      const ahead = Math.min(6, Math.abs(speed) * 0.4);
      lx -= Math.sin(headingYaw) * ahead;
      lz -= Math.cos(headingYaw) * ahead;
    }
    this.look.lerp(_l.set(lx, lookY, lz), Math.min(1, dt * 12));
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }
}
const _v = new THREE.Vector3(), _l = new THREE.Vector3();
