import * as THREE from "three";
import * as TEX from "./textures.js";

/**
 * Jagah ke naam ke board.
 *
 * Ye is round ka sabse asardaar hissa hai: bina board ke "Sanjauli Chowk" aur
 * "Kasumpti Market" bilkul ek jaise dikhte hain. Board lagte hi khiladi padh
 * kar jaan jaata hai ki wo kahan khada hai.
 *
 * Har board apni sabse nazdeek sadak ki taraf ghoomta hai (landmark builder ne
 * jo yaw nikala tha, wahi use hota hai). Dukanon ke board raat ko jagmagate
 * hain -- daynight.js unka emissiveIntensity badhata hai.
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

  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.5, metalness: 0.6 });

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
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 1.04, h * 1.08, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.7 }),
    );
    back.position.set(px - fx * 0.06, ground + spec.height, pz - fz * 0.06);
    back.rotation.y = s.yaw + Math.PI;
    g.add(back);

    if (spec.post) {
      for (const side of [-1, 1]) {
        const ox = -fz * side * spec.width * 0.36;
        const oz = fx * side * spec.width * 0.36;
        const post = new THREE.Mesh(postGeo, postMat);
        const ph = spec.height - h / 2;
        post.scale.y = ph;
        post.position.set(px + ox, ground + ph / 2, pz + oz);
        post.castShadow = true;
        g.add(post);
      }
    }
  }

  g.userData.glowingMaterials = glowing;
  g.userData.count = signs.length;
  return g;
}
