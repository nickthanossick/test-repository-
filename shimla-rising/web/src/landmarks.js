import * as THREE from "three";
import { MeshBuilder } from "./geometry.js";
import * as TEX from "./textures.js";

/**
 * Shimla ki asli jagahein -- har ek ki apni pehchan wali imaarat.
 *
 * Pehle ye city.js ke andar ek 12-case ka `switch` tha jisme har jagah do-teen
 * box thi. Nateeja: 32 POI mein se 20 ke aas-paas wahi procedural ghar bikhre
 * hote the, aur Sanjauli Chowk, Kasumpti aur Chhota Shimla bilkul ek jaise
 * lagte the.
 *
 * Ab ek registry hai: har POI ka `landmark` field batata hai kaunsa builder
 * chalega, aur builders reusable hain -- bazaar ki kataar, colonial block,
 * college campus, dukan, mandir, tunnel. Iske upar **naam ka board** lagta hai,
 * jo sabse zyada farak deta hai.
 */

// ---------------------------------------------------------------- helpers

/** Deterministic per-POI RNG -- har jagah har baar ek jaisi banti hai. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; h |= 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Imaarat ka mukh sabse nazdeek sadak ki taraf ghumao.
 *
 * Local -Z ko sadak ki disha pe rakhte hain. MeshBuilder ka yaw (x,z) ko
 * ghumata hai, to local (0,0,-1) -> (sin yaw, -cos yaw); usse sadak ki disha
 * ke barabar rakhne pe yaw = atan2(dx, -dz).
 */
function facing(roads, x, z) {
  const n = roads.nearestNode(x, z, (r) => r.type !== "rail");
  if (!n) return 0;
  const dx = n.node.pos.x - x, dz = n.node.pos.z - z;
  if (Math.hypot(dx, dz) < 0.5) return 0;
  return Math.atan2(dx, -dz);
}

/** Sadak ki disha (tangent) -- bazaar ki kataar isi ke saath lagti hai. */
function roadTangent(roads, x, z) {
  const n = roads.nearestNode(x, z, (r) => r.type !== "rail");
  if (!n) return { tx: 1, tz: 0, dist: Infinity };
  return { tx: -n.node.nz, tz: n.node.nx, dist: n.dist };
}

const C = new THREE.Color();
const hex = (h) => C.setHex(h);

// ---------------------------------------------------------------- builders
//
// Har builder ko ctx milta hai: { x, z, y, yaw, L(u,v), rng, poi }
// aur mb: { stone, plaster, tin, wood, glass, metal } -- alag material groups.

/** College / school campus -- lamba block + arcade + tower + gate. */
function campus(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  const w = 30 + rng() * 12, d = 12, h = 7.4;

  // lawn -- zameen mein dhansi hui, taaki dhalan pe tairti hui na lage
  hex(0x3f6b39); mb.stone.box(x, y - 0.35, z, w * 1.35, 1.0, d * 2.3, C, yaw);

  // main block, do manzil
  hex(0xd9cdb4); mb.plaster.box(x, y + h / 2, z, w, h, d, C, yaw);
  hex(0xc2b598);
  mb.plaster.box(x, y + h * 0.5, z, w * 1.01, 0.22, d * 1.01, C, yaw);   // string course
  hex(0x8f2f28); mb.tin.gableRoof(x, y + h, z, w, d, 2.4, 0.7, C, yaw, true);

  // ground floor arcade -- colonial campus ki pehchan
  const cols = Math.floor(w / 3.2);
  for (let i = 0; i < cols; i++) {
    const u = (i / (cols - 1) - 0.5) * (w - 1.6);
    const [px, pz] = L(u, -(d / 2 + 1.1));
    hex(0xe4dac4); mb.plaster.box(px, y + 1.7, pz, 0.5, 3.4, 0.5, C, yaw);
  }
  const [ax, az] = L(0, -(d / 2 + 1.1));
  hex(0xd0c4a8); mb.plaster.box(ax, y + 3.55, az, w - 1.0, 0.36, 2.4, C, yaw);

  // ek sire pe chapel/hall tower
  const [tx, tz] = L(w / 2 - 3.4, 1.5);
  hex(0xcfc2a6); mb.plaster.box(tx, y + 7.5, tz, 6.4, 15, 6.4, C, yaw);
  hex(0x7a2b24); mb.tin.pyramid(tx, y + 15, tz, 7.2, 5.2, C, yaw);

  // khidkiyan
  for (let f = 0; f < 2; f++) {
    for (let i = 0; i < cols; i++) {
      const u = (i / (cols - 1) - 0.5) * (w - 2.4);
      const [wx, wz] = L(u, -(d / 2 + 0.04));
      hex(0xe9e2d2); mb.plaster.box(wx, y + 1.9 + f * 3.3, wz, 1.15, 1.7, 0.16, C, yaw);
      hex(0x2c3b46); mb.glass.box(wx, y + 1.9 + f * 3.3, wz, 0.85, 1.4, 0.1, C, yaw);
    }
  }

  // boundary wall + gate posts
  for (const s of [-1, 1]) {
    const [gx, gz] = L(s * 4.2, -(d / 2 + 12));
    hex(0x9a9086); mb.stone.box(gx, y + 1.5, gz, 1.0, 3.0, 1.0, C, yaw);
  }
}

/**
 * Government College Sanjauli -- apna campus, generic block nahi.
 *
 * Nikhil ne asli college ki tasveer bheji aur kaha "exact aisa environment".
 * Jo cheezein us tasveer mein pehchan banati hain, sab yahan hain: patthar ki
 * main building jiske dono taraf **athkona bay tower** aur beech mein mehraab
 * wala dohra darwaza, saamne chaudi seedhiyan, peeche **science block** jispe
 * CHEMISTRY se COMPUTER SCIENCE tak paanch board, neeche wale terrace par
 * ARTS / B.COM / LIBRARY, aur daayen taraf poora **basketball court** jiske
 * paar oonchi patthar ki deewar par chain-link jaali aur razor wire.
 *
 * Poora campus dhalan par teen terrace mein baitha hai. Har terrace ka farsh
 * us hisse ki *sabse oonchi* zameen par rakha jaata hai aur slab kaafi neeche
 * tak jaata hai -- isse na terrace tairta hai, na pahad usme se nikalta hai.
 *
 * Tasveer pencil drawing hai. Wo madhyam hai, look nahi -- usse layout aur
 * architecture uthaya gaya hai, banaya game ke apne modern look mein (Nikhil:
 * "graphics yr retro mat rkh modern kr ise").
 *
 * Local frame: -v sadak/dhalan ki taraf hai (wahi `facing()` wala rukh), +v
 * pahad ki taraf. Isliye main building +v par hai aur uska mukh -v ki taraf.
 */
function college(c, mb) {
  const { yaw, terrain, boards, fences, colliders } = c;

  /*
   * Poora campus dhalan par **upar** khiskaya hua hai.
   *
   * 1852 wala Sanjauli tunnel POI se sirf 21 m door hai -- asli Shimla mein
   * bhi utna hi paas hai. Bina is offset ke uska patthar ka portal seedha
   * college ki mukhya seedhiyon ke beech aa khada hota tha. Asli jagah wahi
   * hai: sadak aur tunnel neeche, campus unke upar ki dhalan par. Isliye POI
   * ka coordinate wahi rehta hai aur imaaratein +v (pahad ki taraf) shift ho
   * jaati hain.
   */
  const VOFF = 17;
  const L = (u, v) => c.L(u, v + VOFF);

  /** Kisi hisse ki sabse oonchi zameen -- terrace ka farsh isi par baithta hai. */
  const padMax = (u0, u1, v0, v1) => {
    let m = -Infinity;
    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        const [px, pz] = L(u0 + ((u1 - u0) * i) / 4, v0 + ((v1 - v0) * j) / 4);
        m = Math.max(m, terrain.heightAt(px, pz));
      }
    }
    return m;
  };

  // Yahan Y **absolute** hai (relative nahi) -- campus ke teen alag farsh hain.
  const B = (which, u, yy, v, sx, sy, sz, h, spin = 0) => {
    const [px, pz] = L(u, v);
    hex(h);
    mb[which].box(px, yy, pz, sx, sy, sz, C, yaw + spin);
  };

  const PLAZA = padMax(-16, 40, -16, 12) + 0.25;   // forecourt + court, ek hi satah
  const MAIN = PLAZA + 3.2;                        // main building ka plinth
  const LOWER = PLAZA - 6.4;                       // arts / b.com / library

  const STONE = 0xa89981, STONE_D = 0x8c7d68, TRIM = 0xd0c4ab;
  const WHITE = 0xe6e4dc, BAND = 0xc9c5bb, SLATE = 0x555b63;
  const PAVE = 0xa8a49c, GLASSC = 0x2e4350, IRON = 0x3a3f45;

  // =============================================================== terrace
  B("stone", 11, PLAZA - 3.2, -1, 54, 6.4, 28, PAVE);            // upar ka farsh
  B("stone", -31, LOWER - 4.4, -22, 32, 8.8, 20, PAVE);          // neeche ka farsh
  // dono terrace ke beech retaining wall
  B("stone", -31, (PLAZA + LOWER) / 2 - 0.2, -12.0, 32, PLAZA - LOWER + 0.5, 1.5, STONE_D);
  B("stone", -31, PLAZA + 0.18, -12.0, 32, 0.36, 1.9, TRIM);     // coping

  // ============================================================ main block
  const MW = 17, MD = 12, MH = 9.4, MV = 10;
  B("stone", 0, MAIN + MH / 2, MV, MW, MH, MD, STONE);
  B("stone", 0, MAIN + 4.6, MV, MW + 0.35, 0.34, MD + 0.35, TRIM);          // string course
  B("stone", 0, MAIN + MH + 0.34, MV, MW + 1.1, 0.68, MD + 1.1, STONE_D);   // cornice
  hex(SLATE);
  {
    const [rx, rz] = L(0, MV);
    mb.tin.gableRoof(rx, MAIN + MH + 0.68, rz, MW + 1.1, MD + 1.1, 2.7, 0.5, C, yaw, true);
  }

  const FV = MV - MD / 2;                          // main block ka aage ka mukh

  // ---- mehraab wala dohra darwaza ----
  for (const s of [-1, 1]) {
    const u0 = s * 2.55;
    B("stone", u0, MAIN + 2.25, FV - 0.20, 3.3, 4.5, 0.45, TRIM);           // frame
    B("wood", u0, MAIN + 2.05, FV - 0.42, 2.5, 4.1, 0.16, 0x4a3a28);        // patt
    B("metal", u0, MAIN + 2.05, FV - 0.50, 0.10, 3.9, 0.06, 0x2a2420);      // beech ki dandi
    // mehraab -- voussoir ki patti, wahi tareeka jo tunnel ke portal par hai
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * Math.PI;
      B("stone", u0 + Math.cos(a) * 1.65, MAIN + 4.5 + Math.sin(a) * 1.45, FV - 0.22,
        0.54, 0.52, 0.5, i === 3 || i === 4 ? TRIM : STONE_D);
    }
  }
  // darwaze ke upar ki khidkiyon ki kataar
  for (let i = 0; i < 5; i++) {
    const u = (i / 4 - 0.5) * 9.2;
    B("stone", u, MAIN + 7.2, FV - 0.05, 1.35, 1.9, 0.2, TRIM);
    B("glass", u, MAIN + 7.2, FV - 0.16, 1.05, 1.55, 0.1, GLASSC);
  }

  // ---- dono taraf athkona bay tower ----
  // Athkone ke liye do box: ek seedha, ek 45 degree ghuma hua. Door se poora
  // athkona padhta hai aur do box mein ban jaata hai.
  for (const s of [-1, 1]) {
    const tu = s * 10.6, tv = MV - 4.2, TWD = 6.6, TH = 12.4;
    B("stone", tu, MAIN + TH / 2, tv, TWD, TH, TWD, STONE);
    // 45 degree wala box **chhota** hona chahiye. Barabar rakhne par uske kone
    // seedhe box ke mukh se kaafi bahar nikal jaate hain aur silhouette athkona
    // nahi, aath-noki taara ban jaata hai. 0.74 par kone bas zara se nikalte hain.
    B("stone", tu, MAIN + TH / 2, tv, TWD * 0.74, TH, TWD * 0.74, STONE_D, Math.PI / 4);
    B("stone", tu, MAIN + 4.6, tv, TWD + 0.3, 0.34, TWD + 0.3, TRIM);
    B("stone", tu, MAIN + TH + 0.3, tv, TWD + 0.9, 0.6, TWD + 0.9, STONE_D);   // cornice
    hex(SLATE);
    {
      const [px, pz] = L(tu, tv);
      mb.tin.pyramid(px, MAIN + TH + 0.6, pz, TWD + 1.0, 3.0, C, yaw);
    }
    // teen mukh par lambi khidkiyan -- bay ki pehchan
    for (let f = 0; f < 3; f++) {
      for (const [du, dv] of [[0, -TWD / 2 - 0.05], [-TWD / 2 - 0.05, 0], [TWD / 2 + 0.05, 0]]) {
        B("stone", tu + du * 0.98, MAIN + 1.9 + f * 3.5, tv + dv * 0.98,
          dv ? 2.0 : 0.18, 2.4, dv ? 0.18 : 2.0, TRIM);
        B("glass", tu + du, MAIN + 1.9 + f * 3.5, tv + dv,
          dv ? 1.6 : 0.1, 2.0, dv ? 0.1 : 1.6, GLASSC);
      }
    }
  }

  // ---- chaudi patthar ki seedhiyan, forecourt se plinth tak ----
  const STEPS = 11, SW = 10.5;
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    B("stone", 0, PLAZA + (MAIN - PLAZA) * t + 0.18, FV - 0.8 - (1 - t) * 6.4,
      SW - t * 1.6, 0.38, 0.68, i % 2 ? TRIM : STONE);
  }
  // seedhiyon ke dono taraf plinth, uspar gamle aur lamp
  for (const s of [-1, 1]) {
    // seedhi ke saath dhalwan parapet -- kandha bhar oonchi, taaki mukh dikhe
    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const yy = PLAZA + (MAIN - PLAZA) * t;
      B("stone", s * (SW / 2 + 0.55), yy - 0.5, FV - 0.8 - (1 - t) * 6.4,
        1.0, 2.6, 0.68, STONE_D);
      B("stone", s * (SW / 2 + 0.55), yy + 0.86, FV - 0.8 - (1 - t) * 6.4,
        1.25, 0.22, 0.72, TRIM);
    }
    // seedhi ke sire par patthar ka khamba, uspar gamla
    B("stone", s * (SW / 2 + 0.55), PLAZA + 0.75, FV - 7.4, 1.35, 2.2, 1.35, STONE_D);
    B("stone", s * (SW / 2 + 0.55), PLAZA + 2.05, FV - 7.4, 0.72, 0.55, 0.72, 0xa8907a);
    B("plaster", s * (SW / 2 + 0.55), PLAZA + 2.48, FV - 7.4, 0.78, 0.42, 0.78, 0x2f4f2a);
    B("plaster", s * (SW / 2 + 0.55), PLAZA + 2.80, FV - 7.4, 0.52, 0.40, 0.52, 0x3a6033);
  }

  // ========================================================= science block
  // Tasveer mein ye peeche-baayen khada hai aur ispe paanch board hain.
  const SBU = -24.5, SBV = 15, SBW = 15, SBD = 11, FLOORS = 6, FLH = 3.4;
  const SBH = FLOORS * FLH;
  B("plaster", SBU, MAIN + SBH / 2, SBV, SBW, SBH, SBD, WHITE);
  B("plaster", SBU, MAIN + SBH + 0.45, SBV, SBW + 0.7, 0.9, SBD + 0.7, BAND);      // parapet
  for (let f = 0; f < FLOORS; f++) {
    const fy = MAIN + f * FLH;
    B("plaster", SBU, fy + 0.12, SBV, SBW + 0.24, 0.24, SBD + 0.24, BAND);         // floor band
    for (let i = 0; i < 5; i++) {
      const u = SBU + (i / 4 - 0.5) * (SBW - 2.6);
      B("glass", u, fy + 1.85, SBV - SBD / 2 - 0.06, 1.55, 1.85, 0.12, GLASSC);
      B("glass", u, fy + 1.85, SBV + SBD / 2 + 0.06, 1.55, 1.85, 0.12, GLASSC);
    }
  }
  // paanch board, upar se neeche -- theek jaise tasveer mein hain
  const LABELS = ["CHEMISTRY BLOCK", "PHYSICS BLOCK", "BIOLOGY BLOCK",
                  "MATHEMATICS BLOCK", "COMPUTER SCIENCE BLOCK"];
  LABELS.forEach((text, i) => {
    const [bx, bz] = L(SBU, SBV - SBD / 2 - 0.22);
    boards.push({ x: bx, z: bz, y: MAIN + SBH - 2.4 - i * FLH, yaw,
                  text, sub: "", kind: "block", width: 9.6 });
  });

  // ==================================================== neeche ka terrace
  // ARTS BLOCK, B.COM BLOCK -- safed teen-manzila; LIBRARY -- chhoti gable wali
  const teach = (u, v, w, d, floors, text) => {
    const h = floors * 3.3;
    B("plaster", u, LOWER + h / 2, v, w, h, d, WHITE);
    B("plaster", u, LOWER + h + 0.4, v, w + 0.6, 0.8, d + 0.6, BAND);
    for (let f = 0; f < floors; f++) {
      const fy = LOWER + f * 3.3;
      B("plaster", u, fy + 0.11, v, w + 0.22, 0.22, d + 0.22, BAND);
      for (let i = 0; i < 4; i++) {
        const uu = u + (i / 3 - 0.5) * (w - 2.2);
        B("glass", uu, fy + 1.75, v - d / 2 - 0.06, 1.4, 1.7, 0.12, GLASSC);
      }
      // balcony railing -- pahadi college ki pehchan
      if (f > 0) {
        B("metal", u, fy + 0.55, v - d / 2 - 0.5, w * 0.9, 0.08, 0.06, IRON);
        B("metal", u, fy + 1.0, v - d / 2 - 0.5, w * 0.9, 0.08, 0.06, IRON);
      }
    }
    const [bx, bz] = L(u, v - d / 2 - 0.2);
    boards.push({ x: bx, z: bz, y: LOWER + h - 1.5, yaw, text, sub: "",
                  kind: "block", width: Math.min(w * 0.8, 7.6) });
  };
  teach(-42, -24, 13, 10, 3, "ARTS BLOCK");
  teach(-28, -26, 12, 10, 3, "B.COM BLOCK");

  // library -- patthar, gable chhat, apna board
  {
    const u = -16.5, v = -27.5, w = 10, d = 7.5, h = 5.8;
    B("stone", u, LOWER + h / 2, v, w, h, d, STONE);
    B("stone", u, LOWER + h + 0.25, v, w + 0.7, 0.5, d + 0.7, STONE_D);
    hex(SLATE);
    {
      const [rx, rz] = L(u, v);
      mb.tin.gableRoof(rx, LOWER + h + 0.5, rz, w + 0.7, d + 0.7, 2.1, 0.45, C, yaw, true);
    }
    for (let i = 0; i < 3; i++) {
      const uu = u + (i - 1) * 2.9;
      B("stone", uu, LOWER + 2.6, v - d / 2 - 0.05, 1.7, 2.3, 0.2, TRIM);
      B("glass", uu, LOWER + 2.6, v - d / 2 - 0.16, 1.35, 1.9, 0.1, GLASSC);
    }
    const [bx, bz] = L(u, v - d / 2 - 0.2);
    boards.push({ x: bx, z: bz, y: LOWER + 4.5, yaw, text: "LIBRARY", sub: "",
                  kind: "block", width: 5.6 });
  }

  // ====================================================== basketball court
  const CU = 22, CV = -1, CW = 26, CD = 16;       // court ka kendra aur naap
  B("stone", CU, PLAZA + 0.06, CV, CW, 0.12, CD, 0xa89b88);    // court ka farsh
  const line = (u, v, lu, lv) => B("plaster", u, PLAZA + 0.14, v, lu, 0.05, lv, 0xf0efe9);
  // baahri lakeer
  line(CU, CV - CD / 2 + 0.6, CW - 1.2, 0.16);
  line(CU, CV + CD / 2 - 0.6, CW - 1.2, 0.16);
  line(CU - CW / 2 + 0.6, CV, 0.16, CD - 1.2);
  line(CU + CW / 2 - 0.6, CV, 0.16, CD - 1.2);
  line(CU, CV, 0.16, CD - 1.2);                   // halfway line
  // beech ka ghera
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    B("plaster", CU + Math.cos(a) * 2.4, PLAZA + 0.14, CV + Math.sin(a) * 2.4,
      0.42, 0.05, 0.16, 0xf0efe9, a);
  }
  // dono taraf key aur three-point arc
  for (const s of [-1, 1]) {
    const ku = CU + s * (CW / 2 - 3.4);
    line(ku, CV - 2.45, 5.2, 0.14);
    line(ku, CV + 2.45, 5.2, 0.14);
    line(ku + s * 2.6, CV, 0.14, 5.0);
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      B("plaster", ku + s * 2.6 - s * Math.cos(a) * 6.4, PLAZA + 0.14, CV + Math.sin(a) * 6.4,
        0.16, 0.05, 0.5, 0xf0efe9, a);
    }
    // hoop -- khamba, backboard, ring
    const hu = CU + s * (CW / 2 - 1.0);
    B("metal", hu, PLAZA + 1.9, CV, 0.22, 3.8, 0.22, 0x6a7078);
    B("metal", hu - s * 0.6, PLAZA + 3.55, CV, 1.2, 0.12, 0.12, 0x6a7078);        // arm
    B("plaster", hu - s * 1.2, PLAZA + 3.6, CV, 0.1, 1.05, 1.8, 0xf2f2ee);        // backboard
    B("metal", hu - s * 1.55, PLAZA + 3.25, CV, 0.06, 0.06, 0.9, 0xd06a2a);       // ring
  }

  // ====================== boundary: patthar ki deewar + chain-link + razor
  const WALLH = 4.6;
  const runs = [
    { u: CU + CW / 2 + 3.2, v: CV, w: 1.1, l: CD + 10, spin: 0 },     // court ke paar
    { u: CU, v: CV + CD / 2 + 3.2, w: CW + 8, l: 1.1, spin: 0 },      // peeche
  ];
  for (const r of runs) {
    B("stone", r.u, PLAZA + WALLH / 2 - 1.2, r.v, r.w, WALLH + 2.4, r.l, STONE_D, r.spin);
    B("stone", r.u, PLAZA + WALLH - 0.9, r.v, r.w + 0.4, 0.36, r.l + 0.4, TRIM, r.spin);
    // jaali -- alag transparent mesh mein jaati hai
    const [fx2, fz2] = L(r.u, r.v);
    /*
     * Jaali ka rukh: quad apne yaw ke local +X ke saath failta hai. Jo run
     * `v` ke saath lamba hai (l > w) usko 90 degree ghumana padta hai --
     * pehle ye ulta tha aur dono jaaliyan deewar ke aar-paar tirchhi latak
     * rahi thi.
     */
    fences.push({ x: fx2, z: fz2, y: PLAZA + WALLH + 0.35,
                  yaw: yaw + (r.l > r.w ? Math.PI / 2 : 0),
                  width: Math.max(r.w, r.l), height: 2.4 });
    // upar razor wire ki coil -- chhote tirchhe tukdon se
    const len = Math.max(r.w, r.l);
    const n = Math.round(len / 0.55);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * (len - 0.6);
      const du = r.w > r.l ? t : 0, dv = r.w > r.l ? 0 : t;
      B("metal", r.u + du, PLAZA + WALLH + 1.75, r.v + dv, 0.30, 0.30, 0.04, 0xb4bac2,
        i % 2 ? 0.7 : -0.7);
    }
  }

  // ====================================== railing, lamp post, gali ka kinara
  // forecourt ka kinara -- neeche wale terrace ki taraf
  for (let i = 0; i < 14; i++) {
    const u = -45 + i * 2.2;
    B("metal", u, PLAZA + 0.55, -11.8, 0.09, 1.1, 0.09, IRON);
    B("metal", u + 1.1, PLAZA + 0.95, -11.8, 2.2, 0.07, 0.07, IRON);
    B("metal", u + 1.1, PLAZA + 0.52, -11.8, 2.2, 0.06, 0.06, IRON);
  }
  const lamp = (u, v, base) => {
    B("metal", u, base + 1.9, v, 0.16, 3.8, 0.16, 0x2f343a);
    B("metal", u, base + 3.95, v, 0.5, 0.42, 0.5, 0x2f343a);
    B("glass", u, base + 3.72, v, 0.34, 0.34, 0.34, 0xfff0cf);
  };
  lamp(-8.5, -10.2, PLAZA);
  lamp(2.5, -6.5, PLAZA);
  lamp(13.5, -10.2, PLAZA);
  lamp(CU + CW / 2 + 1.4, CV - 6, PLAZA);
  lamp(CU + CW / 2 + 1.4, CV + 6, PLAZA);
  lamp(-36, -15.5, LOWER);
  lamp(-21, -17.5, LOWER);

  // ================================================================ collider
  /*
   * Campus ke collider haath se, `FOOTPRINT` se nahi.
   *
   * Ek gol footprint (POI ke kendra par) forecourt, seedhiyan aur poora
   * basketball court band kar deta -- yaani khiladi apne hi college mein
   * ghus hi nahi paata. Isliye collider sirf **imaaraton aur boundary wall
   * par**, aur chalne ki jagah khali.
   */
  const solid = (u, v, r, base, top) => {
    const [px, pz] = L(u, v);
    colliders?.add(px, pz, r, base - 2, base + top);
  };
  for (let i = -1; i <= 1; i++) solid(i * 5.5, MV, 4.2, MAIN, 14);      // main block
  for (const s of [-1, 1]) solid(s * 10.6, MV - 4.2, 3.6, MAIN, 16);    // bay tower
  for (let i = -1; i <= 1; i++) solid(SBU + i * 4.5, SBV, 4.4, MAIN, 24);  // science block
  solid(-42, -24, 6.0, LOWER, 12);                                       // arts
  solid(-28, -26, 5.6, LOWER, 12);                                       // b.com
  solid(-16.5, -27.5, 4.6, LOWER, 8);                                    // library
  for (const r of runs) {                                                // boundary wall
    const n = Math.round(Math.max(r.w, r.l) / 6);
    for (let i = 0; i < n; i++) {
      const t = (i / Math.max(1, n - 1) - 0.5) * (Math.max(r.w, r.l) - 2);
      solid(r.u + (r.w > r.l ? t : 0), r.v + (r.w > r.l ? 0 : t), 2.0, PLAZA, WALLH + 3);
    }
  }
}

/** Bazaar ki kataar -- sadak ke saath sitti hui dukanein, upar ghar. */
function bazaar(c, mb) {
  const { x, z, y, terrain, rng, poi } = c;
  const { tx, tz } = roadTangent(c.roads, x, z);
  const yaw = Math.atan2(tx, -tz) + Math.PI / 2;
  const count = poi.id.includes("sanjauli") ? 11 : 7;
  const unit = 4.6;

  for (let i = 0; i < count; i++) {
    const t = (i - (count - 1) / 2) * unit;
    const sx = x + tx * t, sz = z + tz * t;
    // dukanein sadak ke dono taraf
    for (const side of [-1, 1]) {
      if (side > 0 && rng() > 0.72) continue;
      const off = side * (5.2 + rng() * 1.4);
      const bx = sx - tz * off, bz = sz + tx * off;
      const g = terrain.heightAt(bx, bz);
      const floors = 2 + Math.floor(rng() * 2);
      const bh = floors * 3.1;

      hex(0x8b8177); mb.stone.box(bx, g - 1.2, bz, unit * 0.95, 3.0, 6.2, C, yaw);   // plinth
      hex([0xc9bda6, 0xd2c4ad, 0xb8ad98, 0xc0b6a4][(rng() * 4) | 0]);
      mb.plaster.box(bx, g + bh / 2, bz, unit * 0.92, bh, 6.0, C, yaw);

      // ground floor shutter, sadak ki taraf
      const fx = bx + tz * side * 3.05, fz = bz - tx * side * 3.05;
      hex(0x33393f); mb.metal.box(fx, g + 1.35, fz, unit * 0.72, 2.5, 0.14, C, yaw);
      // awning
      hex([0x8c3b2e, 0x2f5d8a, 0x3f6b47][(rng() * 3) | 0]);
      mb.tin.box(bx + tz * side * 3.9, g + 2.95, bz - tx * side * 3.9,
                 unit * 0.9, 0.12, 1.9, C, yaw);
      // upar balcony
      hex(0xd9cfbc);
      mb.wood.box(bx + tz * side * 3.5, g + 4.6, bz - tx * side * 3.5,
                  unit * 0.78, 2.3, 0.9, C, yaw);
      hex(0x2c3b46);
      mb.glass.box(bx + tz * side * 3.55, g + 4.7, bz - tx * side * 3.55,
                   unit * 0.66, 1.5, 0.5, C, yaw);
      hex([0x8c3b2e, 0x2f5d8a, 0x6b6b70][(rng() * 3) | 0]);
      mb.tin.gableRoof(bx, g + bh, bz, unit * 0.92, 6.0, 1.3, 0.4, C, yaw, false);
    }
  }
}

/** Ek chhoti dukan -- Buddy's, dhaba, daftar. */
function shopfront(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  const w = 6.5, d = 6.0;
  hex(0x8b8177); mb.stone.box(x, y - 1.0, z, w * 1.05, 2.6, d * 1.05, C, yaw);
  hex(0xd2c4ad); mb.plaster.box(x, y + 3.1, z, w, 6.2, d, C, yaw);
  const [fx, fz] = L(0, -(d / 2 + 0.05));
  hex(0x2c3b46); mb.glass.box(fx, y + 1.5, fz, w * 0.74, 2.6, 0.14, C, yaw);   // sheeshe ka front
  hex(0x33393f); mb.metal.box(fx, y + 0.15, fz, w * 0.78, 0.3, 0.2, C, yaw);
  const [ax, az] = L(0, -(d / 2 + 1.0));
  hex(0x8c3b2e); mb.tin.box(ax, y + 3.25, az, w * 0.98, 0.12, 2.1, C, yaw);    // awning
  hex(0x6b6b70); mb.tin.gableRoof(x, y + 6.2, z, w, d, 1.3, 0.42, C, yaw, true);
}

/** Victorian colonial block -- Gaiety, Town Hall, Vidhan Sabha. */
function colonial(c, mb) {
  const { x, z, y, yaw, L, rng, poi } = c;
  const w = 22 + rng() * 8, d = 14, h = 12;
  hex(0x9a9086); mb.stone.box(x, y + 0.5, z, w * 1.08, 1.0, d * 1.08, C, yaw);
  hex(0xc8b89a); mb.plaster.box(x, y + h / 2, z, w, h, d, C, yaw);
  hex(0xb0a084);
  for (const fy of [0.34, 0.68]) mb.plaster.box(x, y + h * fy, z, w * 1.02, 0.3, d * 1.02, C, yaw);
  hex(0xa8987c); mb.plaster.box(x, y + h + 0.35, z, w * 1.06, 0.7, d * 1.06, C, yaw);   // cornice
  hex(0x6d4a3c); mb.tin.gableRoof(x, y + h + 0.7, z, w, d, 3.2, 0.8, C, yaw, true);

  // arched khidkiyan (do manzil)
  const cols = Math.floor(w / 3.0);
  for (let f = 0; f < 3; f++) {
    for (let i = 0; i < cols; i++) {
      const u = (i / (cols - 1) - 0.5) * (w - 2.6);
      const [wx, wz] = L(u, -(d / 2 + 0.04));
      const wy = y + 2.2 + f * 3.5;
      hex(0xe6dcc6); mb.plaster.box(wx, wy, wz, 1.25, 2.1, 0.18, C, yaw);
      hex(0x2c3b46); mb.glass.box(wx, wy, wz, 0.9, 1.7, 0.11, C, yaw);
      hex(0xe6dcc6); mb.plaster.box(wx, wy + 1.2, wz, 1.4, 0.35, 0.2, C, yaw);   // arch head
    }
  }

  // Town Hall pe clock tower
  if (poi.id === "town_hall" || poi.id === "gaiety") {
    const [cx2, cz2] = L(w / 2 - 2.6, 0);
    hex(0xc0ae90); mb.plaster.box(cx2, y + h * 0.5 + 5, cz2, 5.0, h + 10, 5.0, C, yaw);
    hex(0xf0ead8); mb.plaster.box(cx2, y + h + 8.4, cz2, 5.3, 2.4, 5.3, C, yaw);   // clock face
    hex(0x5c3f33); mb.tin.pyramid(cx2, y + h + 9.6, cz2, 5.6, 4.4, C, yaw);
  }
}

/** Mandir -- aangan, shikhara, ghanti ka arch. */
function temple(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  hex(0x9a9086); mb.stone.box(x, y + 0.25, z, 26, 0.5, 26, C, yaw);       // aangan
  hex(0xd8c9a8); mb.plaster.box(x, y + 3.2, z, 10, 6.4, 10, C, yaw);      // garbhagriha
  // shikhara -- ghatte hue box ka dher
  let s = 8.6, sy = y + 6.4;
  for (let i = 0; i < 6; i++) {
    hex(i % 2 ? 0xd6b98a : 0xc9a877);
    mb.plaster.box(x, sy + 0.9, z, s, 1.8, s, C, yaw);
    sy += 1.8; s *= 0.82;
  }
  hex(0xe8c33a); mb.metal.box(x, sy + 0.7, z, 1.0, 1.4, 1.0, C, yaw);     // kalash
  // ghanti ka arch
  for (const sgn of [-1, 1]) {
    const [gx, gz] = L(sgn * 3.4, -7.2);
    hex(0xb9a888); mb.plaster.box(gx, y + 2.0, gz, 0.7, 4.0, 0.7, C, yaw);
  }
  const [bx, bz] = L(0, -7.2);
  hex(0xb9a888); mb.plaster.box(bx, y + 4.2, bz, 7.5, 0.55, 0.7, C, yaw);
  hex(0xc9a23a); mb.metal.box(bx, y + 3.5, bz, 0.5, 0.8, 0.5, C, yaw);    // ghanti
  // boundary
  for (const sgn of [-1, 1]) {
    const [px, pz] = L(sgn * 13, 0);
    hex(0xa79c8e); mb.stone.box(px, y + 1.0, pz, 0.5, 2.0, 26, C, yaw);
  }
}

/** Tunnel ka portal. */
function tunnel(c, mb, wide) {
  const { x, z, y, yaw, L } = c;
  const w = wide ? 9.5 : 6.0;
  hex(0x8d857a);
  mb.stone.box(x, y + 3.4, z, w + 5, 7.0, 3.2, C, yaw);                    // portal face
  hex(0x14161a);
  mb.stone.box(x, y + 2.3, z, w, 4.6, 3.6, C, yaw);                        // andhera mukh
  hex(0x9a9086);
  mb.stone.box(x, y + 5.2, z, w + 6, 1.0, 3.6, C, yaw);                    // lintel
  for (const sgn of [-1, 1]) {
    const [px, pz] = L(sgn * (w / 2 + 2.6), 0);
    mb.stone.box(px, y + 2.6, pz, 1.4, 5.4, 3.6, C, yaw);
  }
}

/** Chauraha -- island, bollard, board ka khamba. */
function junction(c, mb) {
  const { x, z, y, yaw } = c;
  hex(0x9a9086); mb.stone.box(x, y + 0.22, z, 5.4, 0.44, 5.4, C, yaw);
  hex(0x4f7a41); mb.stone.box(x, y + 0.5, z, 4.2, 0.3, 4.2, C, yaw);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hex(0xd8d2c4);
    mb.stone.box(x + Math.cos(a) * 3.2, y + 0.5, z + Math.sin(a) * 3.2, 0.28, 0.9, 0.28, C, yaw);
  }
}

/** Khula maidan / plaza -- Ridge, Scandal Point. */
function plaza(c, mb) {
  const { x, z, y, yaw, L } = c;
  hex(0x8d857a); mb.stone.box(x, y + 0.3, z, 46, 0.6, 26, C, yaw);
  for (const sgn of [-1, 1]) {
    const [rx, rz] = L(0, sgn * 13);
    hex(0x3d4147); mb.metal.box(rx, y + 1.1, rz, 46, 0.08, 0.08, C, yaw);
    for (let i = 0; i < 16; i++) {
      const [px, pz] = L((i / 15 - 0.5) * 44, sgn * 13);
      mb.metal.box(px, y + 0.85, pz, 0.07, 1.1, 0.07, C, yaw);
    }
  }
  for (let i = 0; i < 5; i++) {
    const [bx, bz] = L((i / 4 - 0.5) * 34, -8);
    hex(0x6d4a3c); mb.wood.box(bx, y + 0.75, bz, 2.0, 0.14, 0.6, C, yaw);
    mb.wood.box(bx, y + 1.15, bz, 2.0, 0.6, 0.12, C, yaw);
  }
}

/** Timber/cement yard. */
function yard(c, mb) {
  const { x, z, y, yaw, L, rng } = c;
  hex(0x6f6a60); mb.stone.box(x, y + 0.2, z, 34, 0.4, 26, C, yaw);
  for (let i = 0; i < 5; i++) {
    const [lx, lz] = L(-10 + i * 1.5, -6 + rng() * 10);
    for (let k = 0; k < 3 - (i % 2); k++) {
      hex(0x7a5a34);
      mb.wood.box(lx, y + 0.7 + k * 1.05, lz, 1.0, 1.0, 9.5, C, yaw);      // deodar ke latthe
    }
  }
  const [sx, sz] = L(9, 4);
  hex(0xb6ab97); mb.plaster.box(sx, y + 2.4, sz, 9, 4.8, 7, C, yaw);
  hex(0x6b6b70); mb.tin.box(sx, y + 4.95, sz, 9.6, 0.24, 7.6, C, yaw);
  for (const sgn of [-1, 1]) {
    const [fx, fz] = L(sgn * 17, 0);
    hex(0x55504a); mb.metal.box(fx, y + 1.2, fz, 0.2, 2.4, 26, C, yaw);
  }
}

const BUILDERS = {
  college, campus, bazaar, shopfront, colonial, temple, junction, plaza, yard,
  // tunnel ab `tunnel.js` banata hai -- poora bore, sirf portal nahi
  tunnel_old: () => {},
  tunnel_new: () => {},
  church: (c, mb) => { colonial(c, mb); },
  institution: (c, mb) => { colonial(c, mb); },
  palace: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x8d7f68); c.mbRef.plaster.box(x, y + 8, z, 46, 16, 26, C, yaw);
    hex(0x6f6353); c.mbRef.plaster.box(x, y + 20, z, 12, 9, 12, C, yaw);
    hex(0x5c4a3a); c.mbRef.tin.gableRoof(x, y + 16, z, 46, 26, 4.0, 1.0, C, yaw, true);
  },
  hotel: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x7d5648); mb.plaster.box(x, y + 11, z, 26, 22, 20, C, yaw);
    hex(0xa33030); mb.tin.gableRoof(x, y + 22, z, 26, 20, 3.6, 0.8, C, yaw, true);
  },
  station: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0xa03a30); mb.plaster.box(x, y + 4, z, 40, 8, 13, C, yaw);
    hex(0x6b6259); mb.tin.box(x, y + 8.6, z, 43, 1.2, 15, C, yaw);
  },
  busstand: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x6b7680); mb.plaster.box(x, y + 3.5, z, 46, 7, 24, C, yaw);
    hex(0x8d857a); mb.stone.box(x, y + 0.3, z, 60, 0.6, 34, C, yaw);
  },
  ground: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0x53853f); mb.stone.box(x, y + 0.3, z, 150, 0.6, 110, C, yaw);
    hex(0xd8d2c4); mb.stone.box(x, y + 0.62, z, 18, 0.06, 18, C, yaw);      // helipad
  },
  garage: (c, mb) => {
    const { x, z, y, yaw, L } = c;
    hex(0x8a7a60); mb.plaster.box(x, y + 2.4, z, 11, 5, 8, C, yaw);
    hex(0x3f5f7a); mb.tin.box(x, y + 5.2, z, 12, 0.5, 9, C, yaw);
    const [dx2, dz2] = L(0, -4.1);
    hex(0x33393f); mb.metal.box(dx2, y + 1.9, dz2, 6.5, 3.8, 0.16, C, yaw);
  },
  house: (c, mb) => {
    const { x, z, y, yaw } = c;
    hex(0xc9bda6); mb.plaster.box(x, y + 4.6, z, 9, 9.2, 8, C, yaw);
    hex(0x2f5d8a); mb.tin.gableRoof(x, y + 9.2, z, 9, 8, 1.8, 0.5, C, yaw, true);
  },
  gate: (c, mb) => {
    const { x, z, y, yaw, L } = c;
    for (const sgn of [-1, 1]) {
      const [px, pz] = L(sgn * 3.2, 0);
      hex(0x9a9086); mb.stone.box(px, y + 1.5, pz, 0.8, 3.0, 0.8, C, yaw);
    }
    hex(0xc2413a); mb.metal.box(x, y + 1.5, z, 6.6, 0.16, 0.16, C, yaw);     // barrier
    const [hx, hz] = L(5.2, 1.0);
    hex(0xb6ab97); mb.plaster.box(hx, y + 1.4, hz, 3.0, 2.8, 3.0, C, yaw);
    hex(0x6b6b70); mb.tin.pyramid(hx, y + 2.8, hz, 3.4, 1.1, C, yaw);
  },
};

// ------------------------------------------------------------------- build

/**
 * Har landmark kism ka mota footprint -- collider ke liye.
 *
 * `r: 0` ka matlab **collider bilkul nahi**, aur ye jaan-boojh kar hai:
 * tunnel, chowk, maidan, gate, parking aur bazaar-row ke aar-paar se guzarna
 * hota hai. Wahan cylinder rakhne se sadak hi band ho jaati.
 */
const FOOTPRINT = {
  // college apne collider khud lagata hai (imaarat par, court khaali) --
  // ek gol footprint poore forecourt aur court ko band kar deta
  college: { r: 0, h: 0 },
  campus: { r: 18, h: 14 },
  shopfront: { r: 5.0, h: 8 },
  colonial: { r: 14, h: 17 },
  temple: { r: 10, h: 15 },
  church: { r: 12, h: 19 },
  institution: { r: 14, h: 15 },
  palace: { r: 20, h: 18 },
  hotel: { r: 12, h: 16 },
  station: { r: 14, h: 10 },
  busstand: { r: 10, h: 8 },
  garage: { r: 7.0, h: 6 },
  house: { r: 6.0, h: 11 },
  // guzarne wali jagahein -- yahan collider nahi
  bazaar: { r: 0 }, junction: { r: 0 }, plaza: { r: 0 }, yard: { r: 0 },
  tunnel_old: { r: 0 }, tunnel_new: { r: 0 }, ground: { r: 0 }, gate: { r: 0 },
};

/**
 * Jin jagahon par generic ghar nahi banne chahiye.
 *
 * `city.js` pehle sadak ke kinare procedural ghar bikherta hai aur uske *baad*
 * named landmark banate hain -- isliye college ke forecourt aur basketball
 * court ke beecho-beech ek naali-daar chhat wala ghar khada mil raha tha.
 * Ab campus ki zameen pehle hi reserve ho jaati hai.
 *
 * `SpatialGrid` bindu-aadharit hai, isliye poore daayre par bindu chhaapte hain.
 * Abhi sirf `college` ke liye -- baaki landmark apni chhoti footprint se hi kaam
 * chala lete hain, aur sabke liye lagane se sheher POI ke aas-paas khaali ho
 * jaata.
 */
const CLEAR = { college: 42 };

export function landmarkClearance(terrain, pois) {
  const out = [];
  for (const p of pois.pois) {
    const r = CLEAR[p.landmark];
    if (!r) continue;
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    for (let dx = -r; dx <= r; dx += 7) {
      for (let dz = -r; dz <= r; dz += 7) {
        if (dx * dx + dz * dz <= r * r) out.push({ x: x + dx, z: z + dz });
      }
    }
  }
  return out;
}

export function buildLandmarks(terrain, roads, pois, colliders = null) {
  const mb = {
    stone: new MeshBuilder(0.32), plaster: new MeshBuilder(0.42),
    tin: new MeshBuilder(0.5), wood: new MeshBuilder(0.6),
    glass: new MeshBuilder(0.9), metal: new MeshBuilder(0.8),
  };
  const signs = [];
  /*
   * Imaarat *par* lage board (college ke CHEMISTRY BLOCK, LIBRARY...) aur
   * chain-link jaali. Ye `mb` ke merged batch mein nahi ja sakte -- board ko
   * apni texture chahiye aur jaali ko alpha. Builders inme push karte hain
   * aur aakhir mein ek-ek merged mesh ban jaata hai, bazaar ke shop-board
   * wale tareeke se.
   */
  const boards = [];
  const fences = [];

  for (const p of pois.pois) {
    const fn = BUILDERS[p.landmark];
    if (!fn) continue;
    const { x, z } = terrain.geo.toWorld(p.lat, p.lon);
    const y = terrain.heightAt(x, z);
    const yaw = facing(roads, x, z);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ctx = {
      x, z, y, yaw, terrain, roads, poi: p, rng: seeded(p.id), mbRef: mb, boards, fences, colliders,
      L: (u, v) => [x + u * cy - v * sy, z + u * sy + v * cy],
    };
    fn(ctx, mb);

    /*
     * Pehle 51 named landmark mein se ek bhi collider list mein nahi tha --
     * gaadi St. Bede's aur hospital dono ke aar-paar nikal jaati thi.
     *
     * Par collider sadak par nahi chadhna chahiye. Bus stop (r 10), police
     * station (r 14) aur mandir (r 10) sadak ke bilkul kinare hain, aur unke
     * poore radius se sadak ka centreline hi block ho jaata tha -- gaadi wahan
     * se guzar hi nahi sakti thi. Isliye radius ko nazdeek ki sadak ke kinare
     * tak kaat dete hain, aur bahut chhota bache to collider hi nahi rakhte.
     */
    const fp = FOOTPRINT[p.landmark];
    if (colliders && fp && fp.r > 0) {
      const near = roads.nearestNode(x, z, (r) => r.type !== "rail");
      let r = fp.r;
      if (near) {
        const clear = near.dist - near.node.road.spec.width_m / 2 - 1.0;
        r = Math.min(r, clear);
      }
      if (r >= 3) colliders.add(x, z, r, y - 3, y + fp.h);
    }

    if (p.sign) {
      signs.push({ x, z, y, yaw, text: p.sign, sub: p.sign_sub || "",
                   kind: signKind(p), id: p.id });
    }
  }

  const g = new THREE.Group();
  g.name = "landmarks";
  const MATS = {
    stone: () => TEX.standard(TEX.plaster(0xffffff, 13), { vertexColors: true, roughness: 1.0 }),
    plaster: () => TEX.standard(TEX.plaster(0xffffff), { vertexColors: true }),
    tin: () => TEX.standard(TEX.corrugatedTin(0xffffff, 9), { vertexColors: true, metalness: 0.42 }),
    wood: () => TEX.standard(TEX.fabric(0xffffff, 71, 26), { vertexColors: true, roughness: 0.82 }),
    glass: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12,
      emissive: 0xffc978, emissiveIntensity: 0.0 }),
    metal: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.72 }),
  };
  for (const [key, builder] of Object.entries(mb)) {
    if (!builder.count) continue;
    const mesh = builder.build(MATS[key]());
    mesh.name = `landmark-${key}`;
    g.add(mesh);
  }
  if (boards.length) g.add(buildWallBoards(boards));
  if (fences.length) g.add(buildFences(fences));

  g.userData.signs = signs;
  g.userData.landmarkCount = pois.pois.filter((p) => BUILDERS[p.landmark]).length;
  return g;
}

/**
 * Imaarat ki deewar par lage board -- ek texture, ek mesh.
 *
 * Wahi batching jo bazaar ke dukan-board mein chali: `TEX.signboard()` naam se
 * cache hota hai, isliye ek jaise naam wale saare board ek hi BufferGeometry
 * mein jud jaate hain. College ke 8 board = 8 draw call, 8 alag mesh nahi.
 */
function buildWallBoards(boards) {
  const g = new THREE.Group();
  g.name = "wall-boards";
  const groups = new Map();

  for (const b of boards) {
    const key = `${b.kind}|${b.text}|${b.sub}`;
    let grp = groups.get(key);
    if (!grp) {
      grp = { set: TEX.signboard(b.text, b.sub, b.kind, 0), pos: [], uv: [], idx: [], n: 0 };
      groups.set(key, grp);
    }
    const h = b.width / 4;                      // texture 1024x256 = 4:1
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      grp.pos.push(b.x + u * (b.width / 2) * cs, b.y + v * (h / 2), b.z + u * (b.width / 2) * sn);
    }
    // Board ka mukh local -Z par hai; us taraf se dekhne wale ko local +X
    // baayen dikhta hai, isliye u ulta -- warna naam aaine jaisa palat jaata hai.
    grp.uv.push(1, 0, 0, 0, 0, 1, 1, 1);
    grp.idx.push(grp.n, grp.n + 1, grp.n + 2, grp.n, grp.n + 2, grp.n + 3);
    grp.n += 4;
  }

  for (const grp of groups.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(grp.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(grp.uv, 2));
    geo.setIndex(grp.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: grp.set.map, roughness: grp.set.roughness ?? 0.85,
      side: THREE.DoubleSide,
    })));
  }
  return g;
}

/** Chain-link jaali -- ek transparent plane, alpha texture se taar. */
function buildFences(fences) {
  const g = new THREE.Group();
  g.name = "fences";
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (const f of fences) {
    const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(f.x + u * (f.width / 2) * cs, f.y + v * (f.height / 2), f.z + u * (f.width / 2) * sn);
    }
    // texture ko doori ke hisaab se dohrao, warna diamond khinch jaate hain
    const ru = f.width / 2.2, rv = f.height / 2.2;
    uv.push(0, 0, ru, 0, ru, rv, 0, rv);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const set = TEX.chainLink();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: set.map, transparent: true, alphaTest: 0.35, depthWrite: false,
    roughness: set.roughness, metalness: set.metalness, side: THREE.DoubleSide,
  })));
  return g;
}

function signKind(p) {
  if (p.landmark === "campus" || p.landmark === "institution" || p.landmark === "palace") return "stone";
  if (p.landmark === "junction" || p.landmark === "tunnel_new" || p.landmark === "tunnel_old") return "road";
  return "shop";
}
