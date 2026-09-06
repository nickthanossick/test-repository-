import * as THREE from "three";
import * as TEX from "./textures.js";
import { deform } from "./human.js";

/**
 * Sadak ke jaanwar -- Shimla mein ye kirdaaron jitne hi aam hain.
 *
 * Insaanon jaisa hi tareeka: kam geometry, kaam texture aur silhouette se.
 * Chaupaayon ka rig ek jaisa hai ({legs, head, tail}) taaki ek hi chalne ka
 * animation dono pe chale.
 */

function furMat(hex, rough = 0.95) {
  return TEX.standard(TEX.setRepeat(TEX.fabric(hex, 29, 42), 3), { roughness: rough });
}

/**
 * Desi sadak ka kutta -- lamba jism, patli taangein, khadi kaan, mudi hui poonch.
 * Kandhe tak lagbhag 45 cm.
 */
export function buildDog(o = {}) {
  const g = new THREE.Group();
  const coat = furMat(o.coat ?? 0xa97f56);
  const add = (m, p = g) => { m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };

  const body = add(new THREE.Mesh(deform(new THREE.CapsuleGeometry(0.105, 0.30, 6, 14), (v) => {
    // seena kulhon se chauda
    const t = THREE.MathUtils.clamp(v.y / 0.20, -1, 1);
    const w = 1 + 0.16 * Math.max(0, -t) - 0.08 * Math.max(0, t);
    v.x *= w; v.z *= w * 0.92;
  }), coat));
  body.rotation.z = Math.PI / 2;      // capsule ko letao -- lambai X par
  body.position.set(0, 0.335, 0);
  body.scale.set(1, 1, 0.88);

  // gardan + sir aage (-Z)
  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.070, 0.13, 10), coat));
  neck.position.set(0, 0.385, -0.20);
  neck.rotation.x = 1.05;

  const head = new THREE.Group();
  head.position.set(0, 0.435, -0.275);
  g.add(head);
  const skull = add(new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 12), coat), head);
  skull.scale.set(0.88, 0.92, 1.05);
  const snout = add(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.043, 0.105, 10), coat), head);
  snout.position.set(0, -0.012, -0.086);
  snout.rotation.x = Math.PI / 2;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.4 })), head)
    .position.set(0, -0.012, -0.140);
  for (const side of [-1, 1]) {
    // khade tikone kaan
    const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.075, 5), coat), head);
    ear.position.set(side * 0.044, 0.070, 0.012);
    ear.rotation.set(-0.18, 0, side * 0.28);
    // aankh
    add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x140f0a, roughness: 0.3 })), head)
      .position.set(side * 0.035, 0.014, -0.058);
  }

  // taangein: aage-peeche, dono taraf
  const legs = [];
  for (const [zx, front] of [[-0.155, true], [0.150, false]]) {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.072, 0.315, zx);
      g.add(hip);
      const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.022, 0.17, 8), coat), hip);
      upper.position.y = -0.085;
      const knee = new THREE.Group();
      knee.position.y = -0.170;
      hip.add(knee);
      const lower = add(new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.015, 0.145, 8), coat), knee);
      lower.position.y = -0.072;
      const paw = add(new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.026, 0.058), coat), knee);
      paw.position.set(0, -0.152, -0.010);
      legs.push({ hip, knee, front });
    }
  }

  // poonch -- desi kutte ki upar mudi hui
  const tail = new THREE.Group();
  tail.position.set(0, 0.395, 0.185);
  g.add(tail);
  const t1 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.011, 0.20, 8), coat), tail);
  t1.position.y = 0.085;
  t1.rotation.x = -0.55;
  tail.rotation.x = -0.5;

  g.userData.rig = { legs, head, tail, kind: "dog" };
  g.userData.speed = 1.5;
  return g;
}

/**
 * Gaay (zebu) -- kandhe pe kohaan, galey pe latki hui khaal, mudey hue seeng.
 * Shimla ki sadkon pe ye traffic ka hissa hain.
 */
export function buildCow(o = {}) {
  const g = new THREE.Group();
  const hide = furMat(o.hide ?? 0xb59a76, 0.92);
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3129, roughness: 0.7 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.55 });
  const add = (m, p = g) => { m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };

  const body = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.335, 0.60, 8, 18), hide));
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.86, 0);
  body.scale.set(1, 1, 0.86);

  // kohaan -- zebu ki sabse badi pehchan
  const hump = add(new THREE.Mesh(new THREE.SphereGeometry(0.20, 14, 12), hide));
  hump.position.set(0, 1.16, -0.26);
  hump.scale.set(0.86, 1.02, 1.10);

  // galey ki latki hui khaal
  const dewlap = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.34), hide));
  dewlap.position.set(0, 0.79, -0.52);
  dewlap.rotation.x = 0.22;

  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.34, 12), hide));
  neck.position.set(0, 1.02, -0.47);
  neck.rotation.x = 1.02;

  const head = new THREE.Group();
  head.position.set(0, 1.00, -0.70);
  g.add(head);
  const skull = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), hide), head);
  skull.scale.set(0.82, 0.95, 1.15);
  // Thooth chauda aur chhota -- lamba patla thooth gaay ko ghoda bana deta hai.
  const muzzle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.128, 0.155, 12), hide), head);
  muzzle.position.set(0, -0.062, -0.152);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.scale.set(1.0, 1.0, 0.86);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), dark), head)
    .position.set(0, -0.068, -0.232);
  for (const side of [-1, 1]) {
    const h = add(new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.20, 7), horn), head);
    h.position.set(side * 0.100, 0.150, 0.006);
    h.rotation.set(-0.30, 0, side * 0.95);
    const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), hide), head);
    ear.position.set(side * 0.165, 0.045, 0.010);
    ear.scale.set(1.35, 0.55, 0.35);
    ear.rotation.z = side * 0.30;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), dark), head)
      .position.set(side * 0.098, 0.040, -0.115);
  }

  const legs = [];
  for (const [zx, front] of [[-0.34, true], [0.36, false]]) {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.205, 0.83, zx);
      g.add(hip);
      const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.055, 0.40, 9), hide), hip);
      upper.position.y = -0.20;
      const knee = new THREE.Group();
      knee.position.y = -0.40;
      hip.add(knee);
      const lower = add(new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.040, 0.36, 9), hide), knee);
      lower.position.y = -0.18;
      const hoof = add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.075, 9), dark), knee);
      hoof.position.y = -0.395;
      legs.push({ hip, knee, front });
    }
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.06, 0.46);
  g.add(tail);
  const t1 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.016, 0.62, 8), hide), tail);
  t1.position.y = -0.31;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark), tail)
    .position.y = -0.63;

  g.userData.rig = { legs, head, tail, kind: "cow" };
  g.userData.speed = 0.7;
  return g;
}

/** Chaupaaye ka chalne ka animation -- tirchi jodi ek saath uthti hai. */
export function animateQuadruped(mesh, t, moving) {
  const rig = mesh.userData.rig;
  if (!rig) return;
  const freq = rig.kind === "dog" ? 9 : 5;
  const amp = moving ? (rig.kind === "dog" ? 0.75 : 0.45) : 0;
  rig.legs.forEach((L, i) => {
    // tirchi chaal: aage-baayan peeche-daayen ke saath
    const phase = ((i % 2) + (L.front ? 0 : 1)) % 2 ? Math.PI : 0;
    const sw = Math.sin(t * freq + phase) * amp;
    L.hip.rotation.x = sw;
    L.knee.rotation.x = Math.max(0, -sw) * 0.8;
  });
  if (rig.tail) rig.tail.rotation.z = Math.sin(t * (moving ? 6 : 2.2)) * (moving ? 0.30 : 0.14);
  if (rig.head) rig.head.rotation.x = Math.sin(t * 1.4) * 0.05;
}
