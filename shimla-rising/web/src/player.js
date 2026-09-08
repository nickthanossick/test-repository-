import * as THREE from "three";
import { buildHuman } from "./human.js";

/**
 * Paidal Vicky.
 *
 * Shimla-specific: **chadhai pe stamina jaldi khatam hoti hai.** Ye koi
 * decoration nahi -- Jakhoo ki chadhai (Ridge 2205 m se mandir 2455 m, 1.1 km mein)
 * asli mein saans phula deti hai, aur mission a1_m5 isi pe bana hai. Uphill
 * daudne ka kharch dhalan ke saath teen guna tak badh jaata hai.
 */
export class Player {
  constructor(terrain, colliders = null, ground = null) {
    this.colliders = colliders;
    this.terrain = terrain;
    /*
     * Zameen kahan hai. Sadak ka mesh terrain se 0.5 m upar bichta hai, isliye
     * sirf `terrain.heightAt()` lene par khiladi sadak mein dhans jaata tha.
     * `roads.groundAt()` sadak ki satah samet deta hai.
     */
    this.ground = ground || ((x, z) => terrain.heightAt(x, z));
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.grounded = true;
    this.health = 100;
    this.stamina = 100;
    this.running = false;
    this.height = 1.75;
    this.mesh = buildAvatar();

    /*
     * Chhota state machine: idle / walk / run / smoke / phone.
     *
     * Pehle sirf `_animate(moving)` tha, isliye beedi ka kash aur phone ki
     * baat gait ke upar likh jaate the -- baazu ek hi frame mein do jagah
     * jaana chahte the. Ab ye states baazu par *baad mein* likhti hain.
     */
    this.smokeT = 0;              // kash ka waqt, 0 = nahi
    this.smokeWait = 8 + Math.random() * 12;
    this.onPhone = false;
    this.phoneT = 0;
  }

  placeAt(x, z, yaw = 0) {
    this.pos.set(x, this.ground(x, z), z);
    this.yaw = yaw; this.vy = 0;
    this.mesh.position.copy(this.pos);
    return this;
  }

  update(dt, ctl, camYaw) {
    /** Khiladi ka collision radius -- kandhe se thoda kam. */
const PLAYER_RADIUS = 0.42;
const WALK = 3.1, RUN = 6.4;
const TURN_RATE = 2.6;      // radian/second, arrows se ghoomne ki raftaar

    /*
     * Do tarah ke control, dono ek saath:
     *
     *   W/A/S/D  camera ke hisaab se -- jidhar camera dekh raha hai udhar
     *   arrows   up/down bande ke apne rukh mein, left/right se banda ghoomta
     *            hai aur camera peeche aata hai
     *
     * Camera target se `(sin yaw, cos yaw) * dist` par baithta hai, yaani
     * **aage ki disha `(-sin, -cos)` hai**. Pehle yahan
     *     dx = mx*cos - mz*sin;  dz = mx*sin + mz*cos;
     * tha -- W dabane par `(-sin, +cos)` nikalta tha, yaani z ka chinh ulta
     * (aur strafe mein x ka). Isi se banda camera ghumate hi kabhi aage,
     * kabhi bagal, kabhi ulta chal padta tha.
     *
     * ## `this.yaw` ka matlab -- yahi asli gadbad thi
     *
     * Pehle `yaw` ka matlab tha "chalne ki disha `(sin yaw, cos yaw)`", jabki
     * gaadi ka `yaw` matlab "aage `(-sin yaw, -cos yaw)`" -- do ulte usool ek
     * hi khel mein. Chase camera gaadi wale usool par bana hai (wo `target +
     * (sin, cos)*dist` par baithta hai), isliye jab arrows se ghoomne par
     * `chase.yaw` ko `player.yaw` diya jaata tha, **camera bande ke saamne
     * pahunch jaata tha**. Nateeja: aage badhte hi Vicky camera ki taraf, mooh
     * saamne karke chalta dikhta tha -- Nikhil ki "body ulti chal rahi hai".
     *
     * Ab dono ek hi usool par hain: **aage `(-sin yaw, -cos yaw)`**. Isse
     * camera apne aap peeche aa jaata hai, aur model ka apna aage bhi `-Z` hai
     * to `mesh.rotation.y = yaw` seedha kaam kar jaata hai -- koi ulat-pher
     * nahi.
     */
    if (ctl.turn) {
      this.yaw -= ctl.turn * TURN_RATE * dt;
      // yaw ko -PI..PI mein rakho, warna camera ka lerp lamba chakkar kaat leta hai
      if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    }

    let mx = ctl.strafe, mz = ctl.forward;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    // arrows wala aage/peeche -- bande ke apne rukh mein
    const fwd = ctl.walk || 0;
    const moving = len > 0.01 || Math.abs(fwd) > 0.01;

    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let dx = -mx * cos - mz * sin;      // camera-right = (-cos, +sin)
    let dz = mx * sin - mz * cos;       // camera-aage  = (-sin, -cos)
    if (fwd) {
      dx += -Math.sin(this.yaw) * fwd;      // aage = (-sin, -cos)
      dz += -Math.cos(this.yaw) * fwd;
    }
    {
      const dl = Math.hypot(dx, dz);
      if (dl > 1) { dx /= dl; dz /= dl; }
    }

    // --- dhalan aur stamina ----------------------------------------------
    const h0 = this.ground(this.pos.x, this.pos.z);
    const probe = 1.5;
    const hAhead = this.ground(this.pos.x + dx * probe, this.pos.z + dz * probe);
    const grade = moving ? (hAhead - h0) / probe : 0;      // + = chadhai

    this.running = ctl.run && this.stamina > 1 && moving;
    let speed = this.running ? RUN : WALK;
    speed *= THREE.MathUtils.clamp(1 - grade * 0.85, 0.42, 1.28);   // chadhai dheemi, utraai tez

    if (this.running) {
      const uphill = Math.max(0, grade);
      this.stamina -= dt * (9 + uphill * 46);              // chadhai pe teen guna kharch
    } else {
      this.stamina += dt * (moving ? 5.5 : 13);
    }
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);

    if (moving) {
      // Deewar ke aar-paar nahi -- sweep chhote kadmon mein chalta hai aur har
      // kadam ke baad bahar dhakel deta hai, isliye tez chaal pe bhi paar nahi
      // hota. Slide apne aap hoti hai: push sirf normal ki disha mein lagta hai.
      const mx = dx * speed * dt, mz = dz * speed * dt;
      if (this.colliders) {
        this.colliders.sweep(this.pos, mx, mz, PLAYER_RADIUS,
                             this.pos.y + 0.9, 0.35);
      } else {
        this.pos.x += mx; this.pos.z += mz;
      }
      // Rukh sirf tab badlo jab WASD se chal rahe ho. Arrows wale mode mein
      // rukh khiladi khud `ctl.turn` se tay karta hai -- yahan overwrite karne
      // se wo turant wapas ghis jaata tha aur ghoomna kaam hi nahi karta tha.
      if (len > 0.01) this.yaw = Math.atan2(-dx, -dz);
    }

    const lim = this.terrain.half - 8;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);

    // --- gravity / jump ---------------------------------------------------
    const ground = this.ground(this.pos.x, this.pos.z);
    if (ctl.jump && this.grounded) { this.vy = 5.2; this.grounded = false; }
    this.vy -= 19.6 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) {
      if (this.vy < -14) this.health = Math.max(0, this.health + (this.vy + 14) * 2.4);  // giravat ka nuksan
      this.pos.y = ground; this.vy = 0; this.grounded = true;
    }

    this.mesh.position.copy(this.pos);
    /*
     * Seedha `yaw`.
     *
     * `rotation.y = yaw` model ka `-Z` `(-sin yaw, -cos yaw)` par le jaata
     * hai -- aur ab `yaw` ka matlab bhi wahi hai. Pehle yahan `faceYaw()` se
     * ulta karna padta tha kyunki `yaw` ka matlab ulta tha; wo ab theek ho
     * gaya, isliye ye ulat-pher hat gayi.
     */
    this.mesh.rotation.y = this.yaw;

    this._updateStates(dt, moving);
    this._animate(moving, dt, moving ? speed : 0);
    this._applyStates();
  }

  /** `H` se phone on/off. */
  togglePhone() {
    this.onPhone = !this.onPhone;
    const ph = this.mesh.userData.props?.phone;
    if (ph) ph.visible = this.onPhone;
    return this.onPhone;
  }

  /**
   * Beedi aur phone ki ghadi.
   *
   * Kash apne aap aata hai -- Nikhil ne kaha tha "beech beech m smoke krra".
   * Chalte-chalte kash nahi lagta, isliye sirf khade hone par.
   */
  _updateStates(dt, moving) {
    if (this.smokeT > 0) {
      this.smokeT = Math.max(0, this.smokeT - dt);
      if (this.smokeT === 0) this.smokeWait = 10 + Math.random() * 14;
    } else if (!moving && !this.onPhone) {
      this.smokeWait -= dt;
      if (this.smokeWait <= 0) this.smokeT = 2.4;
    }
    if (this.onPhone) this.phoneT += dt;
  }

  /**
   * States gait ke **upar** lagti hain.
   *
   * Isi kram se dono ek saath chal sakte hain: taangein chalti rehti hain aur
   * baayan haath phone/beedi ke liye upar uth jaata hai.
   */
  _applyStates() {
    const rig = this.mesh.userData.rig;
    const props = this.mesh.userData.props;
    if (!rig) return;
    const L = rig.arms[0];        // baayan haath -- beedi aur phone dono yahin

    if (this.onPhone) {
      /*
       * Haath kaan tak. Chinh gait ke saath milta hai: `rotation.x > 0` ang
       * ko **aage** le jaata hai. Pehle yahan rinaatmak kon tha, isliye
       * baazu aage-upar ki jagah **peeche** uthta tha aur phone sar ke
       * peeche chala jaata tha.
       */
      L.shoulder.rotation.x = 0.62;
      L.shoulder.rotation.z = 0.42;
      L.elbow.rotation.x = 2.25;
      // baat karte waqt halka sar hilana
      if (rig.head) rig.head.rotation.z = Math.sin(this.phoneT * 2.2) * 0.05;
    } else if (this.smokeT > 0) {
      /*
       * Kash: haath mooh tak jaata hai, ek pal rukta hai, phir wapas.
       * 2.4 s ka arc -- 0..0.35 upar, 0.35..0.65 mooh par, 0.65..1 wapas.
       */
      const t = 1 - this.smokeT / 2.4;
      const up = t < 0.35 ? t / 0.35
        : t < 0.65 ? 1
        : 1 - (t - 0.65) / 0.35;
      L.shoulder.rotation.x = 0.48 * up;
      L.shoulder.rotation.z = 0.30 * up;
      L.elbow.rotation.x = 2.05 * up;
      // ember tez jab beedi mooh par ho
      if (props?.ember) {
        props.ember.material.emissiveIntensity = 1.4 + (t > 0.35 && t < 0.65 ? 2.6 : 0);
      }
    } else if (props?.ember) {
      props.ember.material.emissiveIntensity = 1.4;
    }
  }

  /**
   * Chaal.
   *
   * Nikhil: *"vicky ki movements fluid nahi h, age peeche sb wrong chal rha
   * h... face stomach legs age facing hoti, back side peeth hoti h"*. Isme
   * **teen** alag keede the:
   *
   * **1. Ghutna aur kohni ulte mudte the.** Rig mein `rotation.x` ka matlab
   * saaf hai: ang neeche latakta hai `(0,-L,0)`, aur `R_x(a)` use
   * `(0, -L·cos a, -L·sin a)` par le jaata hai -- yaani **`a > 0` ka matlab
   * aage (`-Z`)**. Asli ghutna **peeche** mudta hai, isliye uska kon
   * **rinaatmak** hona chahiye; asli kohni **aage** mudti hai, isliye uska
   * kon **dhanaatmak**. Code mein dono ka chinh ulta tha -- ghutna pakshi ki
   * tarah aage mudta tha aur haath peeche. Isi se chaal ulti dikhti thi.
   *
   * **2. Phase ghadi se chalta tha, kadam se nahi.** `performance.now()` se
   * `sin` lene ka matlab: raftaar badle ya na badle, taangein utni hi tez
   * chalti thi (pair phislte the), aur rukte hi `amp` ek frame mein 0 ho
   * jaata tha -- taang jhatke se seedhi. Ab phase **tay ki gayi doori** se
   * badhta hai aur `amp` dheere-dheere badalta hai.
   *
   * **3. Kohni ka mod `Math.abs()` par tha**, isliye har aadhe chakkar mein
   * ek teekha kona aata tha. Ab wo bhi lagataar hai.
   */
  _animate(moving, dt, speed) {
    const rig = this.mesh.userData.rig;
    if (!rig) return;

    // ---- phase: har metre par utna hi, chahe fps kuch bhi ho -------------
    const stride = this.running ? 1.95 : 1.42;      // metre prati aadha kadam
    if (moving) this._gaitPhase = (this._gaitPhase ?? 0) + (speed * dt / stride) * Math.PI;
    // ---- amp: shuru aur ant dono narm ------------------------------------
    const want = moving ? (this.running ? 0.80 : 0.46) : 0;
    const k = 1 - Math.exp(-dt * 9);                 // ~0.11 s ka time constant
    this._gaitAmp = (this._gaitAmp ?? 0) + (want - (this._gaitAmp ?? 0)) * k;
    const amp = this._gaitAmp;

    const ph = this._gaitPhase ?? 0;
    const sw = Math.sin(ph) * amp;
    const sw2 = Math.sin(ph + Math.PI) * amp;

    rig.legs[0].hip.rotation.x = sw;
    rig.legs[1].hip.rotation.x = sw2;
    /*
     * Ghutna: taang jab **peeche** ho tab mudti hai, aur peeche hi mudti hai
     * -- isliye kon rinaatmak. `-Math.max(0, -sw)` matlab: sw < 0 (taang
     * peeche) hone par hi mod, aur wo mod negative.
     */
    rig.legs[0].knee.rotation.x = -Math.max(0, -sw) * 1.15;
    rig.legs[1].knee.rotation.x = -Math.max(0, -sw2) * 1.15;

    // haath ulti taraf jhoolte hain: daaya pair aage to baaya haath aage
    rig.arms[0].shoulder.rotation.x = sw2 * 0.75;
    rig.arms[1].shoulder.rotation.x = sw * 0.75;
    /*
     * Kohni hamesha thodi mudi rehti hai aur **aage** mudti hai (positive).
     * Jab haath peeche jaata hai tab mod kam, aage jaate waqt zyada -- yahi
     * asli chaal hai. `abs()` ki jagah `sin` ka aadha, taaki kona na aaye.
     */
    const bend = (s) => 0.22 + amp * 0.30 + s * 0.34;
    rig.arms[0].elbow.rotation.x = bend(sw2);
    rig.arms[1].elbow.rotation.x = bend(sw);

    // saans/bob -- ye bhi amp ke saath aata-jaata hai, warna rukte hi jhatka
    const bob = amp > 0.02
      ? Math.abs(Math.sin(ph)) * (this.running ? 0.055 : 0.028) * (amp / 0.46)
      : 0;
    this.mesh.position.y += bob + Math.sin(performance.now() / 625) * 0.008 * (1 - amp / 0.46);
  }
}

/**
 * Vicky.
 *
 * Poora humanoid `human.js` mein hai taaki sadak pe chalne wale NPC bhi wahi
 * dhaancha istemaal karein -- ek hi jagah se sudhaar sab pe lagta hai.
 */
/**
 * Vicky -- pahadi bawa.
 *
 * NPC se alag treatment jaan-boojh kar: bheed mein 34-120 log hote hain aur
 * lag wahin se aata hai, jabki Vicky **ek hi model** hai. Isliye uspar detail
 * kharch karna lagbhag muft hai aur NPC ko haath nahi lagate -- Nikhil ne khud
 * kaha tha "baki npc chahe normal lge par charcater pura pahadi bawa lagna
 * chahie".
 */
function buildAvatar() {
  return buildHuman({
    build: "male",
    hero: true,           // lagataar dhad, joint ke gole, asli ungliyan, 512px kapda
    skin: 0xc08a5e,
    top: 0xbb3a2a,        // laal jacket
    bottom: 0x35425e,     // neeli jeans
    topi: true,
    danda: true,          // daayein haath mein -- `combat.js` isse ghumata hai
    sneakers: true,
    beedi: true,          // baayen haath mein
    phone: true,          // jeb mein, `H` par bahar
  });
}
