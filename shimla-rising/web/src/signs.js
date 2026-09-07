import * as THREE from "three";
import * as TEX from "./textures.js";
import { MeshBuilder } from "./geometry.js";

/**
 * Jagah ke naam ke board.
 *
 * Ye is round ka sabse asardaar hissa tha: bina board ke "Sanjauli Chowk" aur
 * "Kasumpti Market" bilkul ek jaise dikhte hain. Board lagte hi khiladi padh
 * kar jaan jaata hai ki wo kahan khada hai.
 *
 * Har board apni sabse nazdeek sadak ki taraf ghoomta hai (landmark builder ne
 * jo yaw nikala tha, wahi use hota hai). Dukanon ke board raat ko jagmagate
 * hain -- daynight.js unka emissiveIntensity badhata hai.
 *
 * ## Batching
 *
 * Har board ka **apna texture** hai (uspar uska apna naam likha hai), isliye
 * board khud alag mesh rehna hi padta hai -- 48 texture, 48 draw call.
 *
 * Par baaki sab ek jaisa hai, aur wahi pehle 74 mesh aur 48 material kha raha
 * tha: har board ke peeche ek gehri plate, aur stone/road wale board ke do
 * khambe. Ab plate **ek merged mesh** hai (`MeshBuilder`, wahi jo poora sheher
 * banata hai) aur khambe **ek `InstancedMesh`**. 122 mesh se 50, aur 96
 * material se 50.
 */

const KIND = {
  // offset = POI se sadak ki taraf kitna aage, height = zameen se oonchai
  shop:  { offset: 6.6, height: 4.3, width: 4.6, post: false },
  stone: { offset: 13.0, height: 2.3, width: 3.4, post: true },
  road:  { offset: 9.0, height: 3.3, width: 4.0, post: true },
};

export function buildSigns(signs, terrain) {
  const g = new THREE.Group();
  g.name = "signs";
  const glowing = [];

  const backs = new MeshBuilder(0.4);
  const backCol = new THREE.Color(0x2a2e33);
  const posts = [];                       // {x, y, z, h} -- neeche instanced

  for (const s of signs) {
    const spec = KIND[s.kind] || KIND.shop;
    const set = TEX.signboard(s.text, s.sub, s.kind, s.id.length);

    // local -Z sadak ki taraf hai (landmarks.js ka facing()), isliye board
    // usi disha mein aage khiskao aur usi taraf mukh karo
    const fx = Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const px = s.x + fx * spec.offset;
    const pz = s.z + fz * spec.offset;
    const ground = terrain.heightAt(px, pz);

    const h = spec.width / 4;                       // texture 1024x256 = 4:1
    /*
     * Board ka material sanjha nahi ho sakta: har ek ka texture alag hai, aur
     * `daynight.js` raat ko iska `emissiveIntensity` badalta hai. Sanjha karne
     * par ek board ki roshni sab par chali jaati.
     */
    const mat = new THREE.MeshStandardMaterial({
      map: set.map,
      roughness: set.roughness,
      metalness: set.metalness,
      side: THREE.DoubleSide,
    });
    if (set.emissiveMap) {
      mat.emissiveMap = set.emissiveMap;
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveIntensity = 0;                    // raat ko badhta hai
      glowing.push(mat);
    }

    const board = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, h), mat);
    board.position.set(px, ground + spec.height, pz);
    board.rotation.y = s.yaw + Math.PI;             // plane ka +Z normal sadak ki taraf
    board.castShadow = true;
    g.add(board);

    // board ka backing -- patli plate, taaki peeche se dekhne pe khokhla na lage
    backs.box(px - fx * 0.06, ground + spec.height, pz - fz * 0.06,
              spec.width * 1.04, h * 1.08, 0.09, backCol, s.yaw + Math.PI);

    if (spec.post) {
      for (const side of [-1, 1]) {
        const ox = -fz * side * spec.width * 0.36;
        const oz = fx * side * spec.width * 0.36;
        const ph = spec.height - h / 2;
        posts.push({ x: px + ox, y: ground + ph / 2, z: pz + oz, h: ph });
      }
    }
  }

  if (backs.count) {
    // rang vertex se aata hai, isliye ek hi material sab plate ke liye
    g.add(backs.build(TEX.mat("sign:back", () => new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.7 }))));
  }

  if (posts.length) {
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1, 8);
    const postMat = TEX.plain(0x51565c, 0.5, { metalness: 0.6 });
    const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      mtx.makeScale(1, p.h, 1);
      mtx.setPosition(p.x, p.y, p.z);
      inst.setMatrixAt(i, mtx);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    g.add(inst);
  }

  g.userData.glowingMaterials = glowing;
  g.userData.count = signs.length;
  return g;
}
