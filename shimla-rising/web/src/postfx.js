import * as THREE from "three";
import { EffectComposer } from "../vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "../vendor/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "../vendor/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "../vendor/addons/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "../vendor/addons/shaders/FXAAShader.js";
import { Pass, FullScreenQuad } from "../vendor/addons/postprocessing/Pass.js";

/**
 * Post-processing.
 *
 * Nikhil ne poochha: *"ye realistic kyu ni lgre?"* -- aur iska sabse bada
 * jawab yahi tha: **is khel mein post-processing thi hi nahi**. `main.js`
 * seedha `renderer.render()` karta tha. Na ambient occlusion, na bloom, na
 * koi composer.
 *
 * Aaj ke khel mein realism ka bada hissa geometry se nahi, post se aata hai.
 * Sabse zyada **AO** se: uske bina har cheez zameen par *chipki* hui lagti
 * hai, *rakhi* hui nahi. Deewar aur zameen ka jod, chhat ke neeche ka
 * andhera, gaadi ke neeche ka saaya -- ye sab AO deta hai.
 *
 * ## Kyun apna AO likha, three ka SSAOPass/GTAOPass nahi
 *
 * Dono ek **alag depth+normal geometry pass** chalate hain -- yaani poora
 * drishya do baar. Integrated GPU par wo utna hi mehnga hai jitna shadow
 * pass, aur maine abhi pichhle round mein shadow ko 1.49 M se 0.44 M
 * triangle par laaya hai. Wo mehnat wapas de dena bewakoofi hoti.
 *
 * Yahan AO **sirf depth se** banta hai -- wahi depth jo composer ke render
 * target par pehle se juda hai. Koi doosra geometry pass nahi. Aur wo
 * **aadhi resolution** par banta hai (chauthai pixel), phir blur hokar poore
 * drishya par lagta hai.
 *
 * ## Chain
 *
 *   RenderPass -> AO -> bloom -> OutputPass -> FXAA
 *
 * Round 21: bloom ab teenon tier par (Vice City glow). `low` par sirf bloom
 * chalta hai (AO nahi -- uska depth-pass mehnga hai).
 */

/* ------------------------------------------------------------------ AO ---
 *
 * Screen-space AO, depth se. Har pixel par:
 *   1. depth se view-space position wapas banao
 *   2. paas ke do taps se surface normal nikalo
 *   3. ek chhote gole mein 8 namune lo; jo namuna surface ke saamne aur paas
 *      ho wo dhaka hua maana jaata hai
 *
 * 8 tap kam hain, isliye har pixel ka pattern thoda ghumaya jaata hai
 * (`rot`) -- warna saaf golakar bands dikhte hain. Ghumane se wo shor ban
 * jaata hai, aur shor ko agla blur pass kha jaata hai.
 */
const AO_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tDepth;
  uniform vec2  resolution;      // AO buffer ki apni resolution
  uniform mat4  projInv;
  uniform mat4  proj;
  uniform float radius;          // metres
  uniform float bias;
  uniform float strength;
  uniform float maxDist;         // isse door AO nahi -- ye contact AO hai
  varying vec2 vUv;

  float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }

  /** Depth se view-space position wapas. */
  vec3 viewPos(vec2 uv) {
    float d = rawDepth(uv);
    vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 v = projInv * clip;
    return v.xyz / v.w;
  }

  void main() {
    float d = rawDepth(vUv);
    // aasman: depth 1.0 -- wahan AO ka koi matlab nahi
    if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }

    vec3 p = viewPos(vUv);
    /*
     * Door AO nahi.
     *
     * Ye contact AO hai -- deewar aur zameen ka jod, chhat ke neeche, gaadi
     * ke pahiye ke paas. 60 m ke aage wo dikhta hi nahi, par depth ka shor
     * wahan sabse zyada hota hai aur poore pahad par gandi dhaari daal deta
     * hai. Isliye wahan seedha chhod dete hain.
     */
    float dist = -p.z;
    if (dist > maxDist) { gl_FragColor = vec4(1.0); return; }
    float distFade = 1.0 - smoothstep(maxDist * 0.55, maxDist, dist);

    vec2 texel = 1.0 / resolution;
    // normal do padosi taps se -- fwidth se zyada sthir
    vec3 dx = viewPos(vUv + vec2(texel.x, 0.0)) - p;
    vec3 dy = viewPos(vUv + vec2(0.0, texel.y)) - p;
    vec3 n = normalize(cross(dx, dy));
    if (n.z < 0.0) n = -n;                    // camera ki taraf

    // Har pixel ka apna ghumav -- 8 namune ke bands ko shor mein badalta hai,
    // aur shor ko agla blur kha jaata hai.
    float rot = fract(sin(dot(vUv * resolution, vec2(12.9898, 78.233))) * 43758.5453);
    float ang = rot * 6.2831853;
    vec3 rv = vec3(cos(ang), sin(ang), 0.0);
    vec3 t = normalize(rv - n * dot(rv, n));
    vec3 bt = cross(n, t);
    mat3 tbn = mat3(t, bt, n);

    /*
     * Hemisphere kernel -- chalte-chalte banta hai.
     *
     * Pehla prayaas screen ke XY talab mein ek chakti se namune leta tha. Wo
     * galat tha: samtal zameen par wo chakti surface ke **saath-saath** padti
     * hai, isliye occlusion lagbhag shoonya rehta tha aur AO buffer poora
     * safed aata tha (screenshot se pakda). Namune normal ke around ek
     * **hemisphere** mein chahiye.
     *
     * Aur ise ek const array se nahi likha ja sakta: GLSL ES 3.00 wala
     * array-constructor syntax three ke ShaderMaterial (1.00) mein compile
     * hi nahi hota. Golden-angle spiral se banana sasta bhi hai aur
     * surakshit bhi.
     */
    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float a = fi * 2.399963 + ang;                 // golden angle
      float kz = 0.25 + 0.72 * (fi / 7.0);           // hemisphere ki oonchai
      float kr = sqrt(max(0.0, 1.0 - kz * kz));
      vec3 k = vec3(cos(a) * kr, sin(a) * kr, kz);
      // paas ke namune ghane -- contact AO wahin banta hai
      float scale = 0.3 + 0.7 * (fi / 7.0) * (fi / 7.0);
      vec3 sp = p + (tbn * k) * radius * scale;

      vec4 cp = proj * vec4(sp, 1.0);
      vec2 suv = (cp.xy / cp.w) * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

      // view space mein z rinatmak hai: bada z = camera ke zyada paas
      float sceneZ = viewPos(suv).z;
      if (sceneZ >= sp.z + bias) {
        /*
         * Range check -- silhouette ka halo isi se rukta hai.
         *
         * Depth ke kinare par (imaarat ka kinara aasman ke saamne) peeche ki
         * satah bahut door hoti hai; bina is jaanch ke wo "dhaki hui" gini
         * jaati hai aur har kinare ke gird ek kaala halo aa jaata hai --
         * pehle screenshot mein yahi sabse zyada chubh raha tha.
         */
        float dz = abs(p.z - sceneZ);
        occ += 1.0 - smoothstep(radius * 0.6, radius * 1.6, dz);
      }
    }
    occ = clamp(occ / 8.0 * strength * distFade, 0.0, 1.0);
    gl_FragColor = vec4(vec3(1.0 - occ), 1.0);
  }
`;

/** AO ko blur karke drishya par lagao. Blur 4-tap cross -- shor mita deta hai. */
const AO_COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tAO;
  uniform vec2  aoTexel;
  uniform float intensity;
  varying vec2 vUv;

  void main() {
    vec4 col = texture2D(tDiffuse, vUv);
    /*
     * 3x3 box blur.
     *
     * AO 8 namunon se banta hai aur har pixel ka pattern ghumaya hua hai,
     * isliye kaccha AO kaafi shor bhara hota hai. 4-tap cross kam pad raha
     * tha -- 9 tap se wo saaf ho jaata hai, aur ye aadhi resolution par hai
     * isliye sasta bhi hai.
     */
    float ao = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        ao += texture2D(tAO, vUv + vec2(float(x), float(y)) * aoTexel).r;
      }
    }
    ao /= 9.0;
    gl_FragColor = vec4(col.rgb * mix(1.0, ao, intensity), col.a);
  }
`;

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Ek hi Pass jo do draw karta hai: pehle aadhi resolution par AO, phir uska
 * blur karke drishya par composite. Do alag Pass rakhne se composer ko ek aur
 * poore size ka buffer chahiye hota -- ye sasta hai.
 */
class AOPass extends Pass {
  constructor(camera, scale = 0.5) {
    super();
    this.camera = camera;
    this.scale = scale;
    this.needsSwap = true;

    this.aoTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RedFormat, type: THREE.UnsignedByteType,
      depthBuffer: false, stencilBuffer: false,
    });

    this.aoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, resolution: { value: new THREE.Vector2() },
        projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() },
        radius: { value: 1.0 }, bias: { value: 0.025 },
        strength: { value: 1.15 }, maxDist: { value: 60.0 },
      },
      vertexShader: VERT, fragmentShader: AO_FRAG,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tAO: { value: null },
        aoTexel: { value: new THREE.Vector2() }, intensity: { value: 0.85 },
      },
      vertexShader: VERT, fragmentShader: AO_COMPOSITE_FRAG,
    });
    this._aoQuad = new FullScreenQuad(this.aoMaterial);
    this._compQuad = new FullScreenQuad(this.compositeMaterial);
  }

  setSize(w, h) {
    const aw = Math.max(1, Math.round(w * this.scale));
    const ah = Math.max(1, Math.round(h * this.scale));
    this.aoTarget.setSize(aw, ah);
    this.aoMaterial.uniforms.resolution.value.set(aw, ah);
    this.compositeMaterial.uniforms.aoTexel.value.set(1 / aw, 1 / ah);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture;
    if (!depth) {           // depth na ho to AO chhod do, drishya waise ka waisa
      this.compositeMaterial.uniforms.intensity.value = 0;
    }
    const u = this.aoMaterial.uniforms;
    u.tDepth.value = depth;
    u.proj.value.copy(this.camera.projectionMatrix);
    u.projInv.value.copy(this.camera.projectionMatrixInverse);

    renderer.setRenderTarget(this.aoTarget);
    renderer.clear();
    this._aoQuad.render(renderer);

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tAO.value = this.aoTarget.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this._compQuad.render(renderer);
  }

  dispose() {
    this.aoTarget.dispose();
    this.aoMaterial.dispose();
    this.compositeMaterial.dispose();
    this._aoQuad.dispose();
    this._compQuad.dispose();
  }
}

export class PostFX {
  /**
   * @param cfg `quality.js` ka `Q.post` -- `null` matlab post band
   */
  constructor(renderer, scene, camera, cfg) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    /*
     * `available` = addons bundle/import mein aaye ya nahi. `enabled` se alag
     * hai: `low` tier par cfg null hota hai aur post band rehta hai, par
     * module phir bhi maujood hone chahiye. Artifact ka bundler ek baar inhe
     * chhod chuka hai (chup-chaap), isliye test iski jaanch karta hai.
     */
    this.available = typeof EffectComposer === "function";
    this.enabled = !!cfg;
    if (!this.enabled) return;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    /*
     * Render target par depth texture zaroori hai -- AO usi se banta hai.
     *
     * `samples` (MSAA) jaan-boojh kar 0 hai: multisampled target se depth
     * padhne ke liye resolve chahiye hota hai aur wo har browser par ek jaisa
     * nahi chalta. Kinare FXAA sambhalta hai, jo aakhir mein lagta hai.
     */
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,          // linear space -- OutputPass ant mein convert karega
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false,
    });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    rt.depthTexture.type = THREE.UnsignedIntType;

    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    if (cfg.ao) {
      this.ao = new AOPass(camera, cfg.aoScale ?? 0.5);
      this.composer.addPass(this.ao);
    }
    if (cfg.bloom) {
      /*
       * Vice City wala glow (Nikhil: *"glow b la vice city wala jitna la skta"*).
       *
       * Pehle ye bahut halka tha (strength 0.32, threshold 0.9) aur sirf `high`
       * tier par -- yaani Nikhil ke laptop par dikhta hi nahi tha. Ab teenon
       * tier par, aur bahut zyada neon: threshold neecha (0.62) taaki boards,
       * lamp, khidki aur headlight sab pakde jayein; strength ooncha.
       *
       * `setNight()` ise waqt ke saath modulate karta hai -- din mein halka
       * (warna dopahar dhundhla lage), shaam/raat mein poora neon. Base yahan
       * din wala hai.
       */
      this._bloomDay = { strength: 0.55, threshold: 0.72 };
      this._bloomNight = { strength: 1.15, threshold: 0.48 };
      this.bloom = new UnrealBloomPass(size, this._bloomDay.strength, 0.72, this._bloomDay.threshold);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());

    // FXAA aakhir mein, sRGB ke baad -- wahi uski sahi jagah hai
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    this.setSize(size.x, size.y);
  }

  /**
   * Bloom ko waqt ke saath badlo. `n` = raat ka anupaat (0 = din, 1 = raat).
   *
   * Din mein halka taaki dopahar ki safed deewar na chamke; raat mein poora
   * neon taaki boards, lamp aur headlight Vice City jaise jagmagayein.
   */
  setNight(n) {
    if (!this.bloom) return;
    const t = n < 0 ? 0 : n > 1 ? 1 : n;
    const d = this._bloomDay, ni = this._bloomNight;
    this.bloom.strength = d.strength + (ni.strength - d.strength) * t;
    this.bloom.threshold = d.threshold + (ni.threshold - d.threshold) * t;
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setSize(w, h);
    this.ao?.setSize(w, h);
    this.bloom?.setSize(w, h);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  render() {
    if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
    /*
     * `renderer.info` ko poore frame ka rakho, sirf aakhri pass ka nahi.
     *
     * Composer har pass ke shuru mein `renderer.render()` bulata hai, aur
     * three.js default par har render ke pehle `info` reset kar deta hai --
     * isliye frame ke baad `info.render.triangles` sirf **aakhri fullscreen
     * pass** (FXAA quad = 1 triangle) dikhata tha. Round 20 tak `low` tier par
     * composer band tha (seedha render), isliye ye chhupa raha; ab bloom har
     * tier par hai to smoke ka "geometry rendered" ise 1 padhne laga.
     *
     * `autoReset` **sirf is call bhar** band rehta hai: shuru mein ek reset,
     * antt mein wapas `true`. Isse info poore frame (RenderPass + post passes)
     * ka jod dikhata hai, aur `perf.mjs` -- jo seedha `renderer.render()` se
     * naapta hai aur auto-reset par tikta hai -- bina chhede sahi chalta hai
     * (ye render() synchronous hai, isliye beech mein kuch aur nahi chalta).
     */
    const info = this.renderer.info;
    info.autoReset = false;
    info.reset();
    this.composer.render();
    info.autoReset = true;
  }
}
