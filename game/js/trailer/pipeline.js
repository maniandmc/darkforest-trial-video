// The trailer's render pipeline (offline, one frame at a time, so it can afford more than the game):
//   1. the scene into an HDR multisampled target with a depth texture
//   2. the moon's depth from its side (the same trunks and canopy that shadow the ground cut the light in the air)
//   3. volumetric fog at half resolution: a jittered march along every view ray, in-scattering moonlight where the
//      moon's depth map says it reaches (shafts) and a cold ambient, with extinction
//   4. composite: depth-aware upsample of the fog, the lantern's halo (closed-form in-scattering of a point light),
//      optional depth of field
//   5. bloom, then the grade: exposure, split-tone, ACES, saturation, vignette, chromatic fringe, grain, letterbox, flash
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const NOISE = /* glsl */`
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), u.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), u.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), u.x), u.y), u.z);
}`;

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FOG_FS = /* glsl */`
precision highp float;
uniform sampler2D tDepth, tMoon;
uniform mat4 uInvProj, uCamWorld, uMoonVP;
uniform vec3 uCamPos, uMoonDir, uMoonCol, uAmbCol, uWind;
uniform float uDensity, uHeight, uGround, uGroundH, uMaxD, uG, uTime, uNoiseK, uFrame, uMoonSoft;
uniform vec2 uRes;
varying vec2 vUv;
${NOISE}
float density(vec3 p){
  float y = max(p.y, 0.0);
  float n = vn(p * 0.16 + uWind * uTime) * 0.65 + vn(p * 0.47 - uWind * uTime * 1.7) * 0.35;
  return uDensity * (exp(-y / uHeight) + uGround * exp(-y / uGroundH)) * mix(1.0, 0.25 + 1.5 * n, uNoiseK);
}
float moonVis(vec3 p){
  vec4 l = uMoonVP * vec4(p, 1.0);
  vec2 uv = l.xy * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float d = l.z * 0.5 + 0.5 - 0.0015, v = 0.0;
  // 4 taps on a small rotated square: soft-edged shadow volumes instead of hard slabs
  for (int k = 0; k < 4; k++) { vec2 o = vec2(k == 0 || k == 3 ? 1.0 : -1.0, k < 2 ? 1.0 : -1.0) * uMoonSoft; v += step(d, texture2D(tMoon, uv + o).r); }
  return v * 0.25;
}
float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main(){
  float z = texture2D(tDepth, vUv).r;
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); v /= v.w;
  vec3 wp = (uCamWorld * vec4(v.xyz, 1.0)).xyz;
  vec3 rd = wp - uCamPos; float dist = length(rd); rd /= dist;
  if (z >= 0.99999) dist = uMaxD;
  dist = min(dist, uMaxD);
  // interleaved gradient noise: per-pixel jitter of the march start
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  const int N = 44;
  float ph = hg(dot(rd, uMoonDir), uG) + hg(dot(rd, uMoonDir), -0.25) * 0.35;
  vec3 scat = vec3(0.0); float T = 1.0, t0 = 0.0;
  for (int i = 0; i < N; i++) {
    float t1 = dist * pow((float(i) + 1.0) / float(N), 1.6);
    float dt = t1 - t0;
    vec3 p = uCamPos + rd * (t0 + dt * j);
    float s = density(p);
    vec3 L = uMoonCol * moonVis(p) * ph + uAmbCol;
    float ex = exp(-s * dt);
    scat += T * L * (1.0 - ex);          // = T * L * s * (1-ex)/s
    T *= ex;
    t0 = t1;
    if (T < 0.01) break;
  }
  gl_FragColor = vec4(scat, T);
}`;

const COMP_FS = /* glsl */`
precision highp float;
uniform sampler2D tColor, tDepth, tFog;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos, uLanPos, uLanCol;
uniform float uLanDens, uDensity, uHeight, uGround, uGroundH, uMaxD;
uniform vec2 uRes, uFogRes;
uniform vec2 uNF; uniform vec3 uCamFwd;
uniform vec4 uDof;          // focus distance, aperture (px of blur per unit of 1/d difference), max px, on
varying vec2 vUv;
vec3 worldAt(vec2 uv, float z){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); v /= v.w; return (uCamWorld * vec4(v.xyz, 1.0)).xyz; }
// view-space depth (metres along the camera axis), cheap enough for every tap
float distAt(vec2 uv){ float z = texture2D(tDepth, uv).r; if (z >= 0.99999) return uMaxD; float n = uNF.x, f = uNF.y; return min(n * f / (f - z * (f - n)), uMaxD); }
vec4 fogAt(vec2 uv, float d0){
  // depth-aware upsample from the half-res fog
  vec2 f = uv * uFogRes - 0.5, i = floor(f), fr = f - i;
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 tuv = (i + o + 0.5) / uFogRes;
    float d = distAt(tuv);
    float w = (x == 0 ? 1.0 - fr.x : fr.x) * (y == 0 ? 1.0 - fr.y : fr.y) + 1e-3;
    w *= 1.0 / (1e-3 + abs(d - d0) / max(d0, 0.5) * 8.0);
    acc += texture2D(tFog, tuv) * w; wsum += w;
  }
  return acc / wsum;
}
float coc(float d){ return uDof.w > 0.5 ? clamp(abs(1.0 / max(d, 0.1) - 1.0 / uDof.x) * uDof.y, 0.0, uDof.z) : 0.0; }
void main(){
  float d0 = distAt(vUv);
  vec3 col = texture2D(tColor, vUv).rgb;
  if (uDof.w > 0.5) {
    // gather bokeh: golden-angle spiral, samples only pull from pixels at least as blurred as their distance from us
    float c0 = coc(d0);
    vec3 acc = col; float wsum = 1.0;
    for (int k = 1; k < 28; k++) {
      float r = sqrt(float(k) / 28.0) * uDof.z, a = float(k) * 2.39996;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * r / uRes;
      float ds = distAt(suv), cs = coc(ds);
      float w = smoothstep(r - 1.5, r + 0.5, ds < d0 ? cs : min(cs, c0));
      acc += texture2D(tColor, suv).rgb * w; wsum += w;
    }
    col = acc / wsum;
  }
  vec4 fog = fogAt(vUv, d0);
  col = col * fog.a + fog.rgb;
  // lantern halo: in-scattering of a point light along the ray, integrated in closed form (1 / r^2 falloff)
  if (uLanDens > 0.0) {
    vec3 rd = normalize(worldAt(vUv, 0.5) - uCamPos);
    float dr = d0 / max(dot(rd, uCamFwd), 0.2);                 // along the ray
    vec3 lc = uLanPos - uCamPos; float tc = dot(lc, rd); float h = max(length(lc - rd * tc), 0.12);
    float I = (atan((dr - tc) / h) - atan(-tc / h)) / h;
    float y = max(uLanPos.y, 0.0);
    float s = uDensity * (exp(-y / uHeight) + uGround * exp(-y / uGroundH));
    col += uLanCol * I * s * uLanDens * exp(-s * max(tc, 0.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const GRADE_FS = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform vec2 uRes;
uniform float uExposure, uSat, uVig, uGrain, uCA, uTime, uBars, uFade, uContrast;
uniform vec3 uLift, uGain, uFlash, uShadowTint, uHiTint;
uniform float uFlashA;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(O * RRTAndODTFit(I * (c / 0.6)), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5; float r2 = dot(d * vec2(1.0, 0.5625), d * vec2(1.0, 0.5625)) * 3.2;
  vec3 c = vec3(texture2D(tColor, vUv - d * uCA * r2).r, texture2D(tColor, vUv).g, texture2D(tColor, vUv + d * uCA * r2).b);
  c *= uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(uShadowTint, uHiTint, smoothstep(0.0, 0.6, l));          // split-tone before the curve
  c = aces(c);
  c = uLift * (1.0 - c) * 0.04 + c * uGain;
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = mix(c, smoothstep(0.0, 1.0, c), uContrast);
  c *= 1.0 - uVig * r2;
  c = mix(c, uFlash, clamp(uFlashA, 0.0, 1.0));
  c = toSRGB(max(c, 0.0));
  float g = fract(sin(dot(floor(vUv * uRes) + fract(uTime * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += g * uGrain * (0.35 + 0.65 * sqrt(max(l, 0.0)));
  c *= uFade;
  float bar = uBars * 0.5;                                          // letterbox: fraction of the height covered
  if (vUv.y < bar || vUv.y > 1.0 - bar) c = vec3(0.0);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Pipeline {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const HF = THREE.HalfFloatType;
    this.rtMain = new THREE.WebGLRenderTarget(W, H, { type: HF, samples: 4, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType) });
    this.rtComp = new THREE.WebGLRenderTarget(W, H, { type: HF });
    this.fw = W >> 1; this.fh = H >> 1;
    this.rtFog = new THREE.WebGLRenderTarget(this.fw, this.fh, { type: HF, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const MS = 1024;
    this.rtMoon = new THREE.WebGLRenderTarget(MS, MS, { depthTexture: new THREE.DepthTexture(MS, MS, THREE.UnsignedIntType) });
    this.moonCam = new THREE.OrthographicCamera(-40, 40, 40, -40, 1, 220);
    this.depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
    this.fog = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FOG_FS, depthTest: false, depthWrite: false,
      uniforms: U({ tDepth: this.rtMain.depthTexture, tMoon: this.rtMoon.depthTexture, uInvProj: new THREE.Matrix4(), uCamWorld: new THREE.Matrix4(),
        uMoonVP: new THREE.Matrix4(), uCamPos: new THREE.Vector3(), uMoonDir: new THREE.Vector3(0, 1, 0), uMoonCol: new THREE.Color(), uAmbCol: new THREE.Color(),
        uWind: new THREE.Vector3(0.05, 0.01, 0.03), uDensity: 0.03, uHeight: 6, uGround: 2, uGroundH: 0.8, uMaxD: 90, uG: 0.6, uTime: 0, uNoiseK: 1,
        uFrame: 0, uMoonSoft: 1.8 / MS, uRes: new THREE.Vector2(this.fw, this.fh) }) });
    this.comp = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: U({ tColor: this.rtMain.texture, tDepth: this.rtMain.depthTexture, tFog: this.rtFog.texture, uInvProj: this.fog.uniforms.uInvProj.value,
        uCamWorld: this.fog.uniforms.uCamWorld.value, uCamPos: this.fog.uniforms.uCamPos.value, uLanPos: new THREE.Vector3(), uLanCol: new THREE.Color(),
        uLanDens: 0, uDensity: 0, uHeight: 0, uGround: 0, uGroundH: 0, uMaxD: 90, uRes: new THREE.Vector2(W, H), uFogRes: new THREE.Vector2(this.fw, this.fh),
        uDof: new THREE.Vector4(5, 0, 12, 0), uNF: new THREE.Vector2(0.05, 400), uCamFwd: new THREE.Vector3() }) });
    this.grade = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: GRADE_FS, depthTest: false, depthWrite: false,
      uniforms: U({ tColor: this.rtComp.texture, uRes: new THREE.Vector2(W, H), uExposure: 1, uSat: 1, uVig: 0.5, uGrain: 0.04, uCA: 0.004, uTime: 0,
        uBars: 0.25, uFade: 1, uContrast: 0.1, uLift: new THREE.Color(0.2, 0.3, 0.45), uGain: new THREE.Color(1, 1, 1), uFlash: new THREE.Color(1, 1, 1), uFlashA: 0,
        uShadowTint: new THREE.Color(0.85, 0.95, 1.15), uHiTint: new THREE.Color(1.05, 1.0, 0.95) }) });
    this.quad = new FullScreenQuad(null);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.6, 0.9);
  }

  // look of the air: { density, height, ground, groundH, g, noiseK, moonCol, ambCol, maxD }
  setFog(o) {
    const u = this.fog.uniforms, c = this.comp.uniforms;
    for (const [k, n] of [['density', 'uDensity'], ['height', 'uHeight'], ['ground', 'uGround'], ['groundH', 'uGroundH'], ['g', 'uG'], ['noiseK', 'uNoiseK'], ['maxD', 'uMaxD']])
      if (o[k] !== undefined) { u[n].value = o[k]; if (c[n]) c[n].value = o[k]; }
    if (o.moonCol) u.uMoonCol.value.setRGB(...o.moonCol);
    if (o.ambCol) u.uAmbCol.value.setRGB(...o.ambCol);
  }

  // moon: direction toward it, the ground area its depth map covers
  aimMoon(dir, center, half = 40) {
    const c = this.moonCam;
    c.left = c.bottom = -half; c.right = c.top = half; c.near = 1; c.far = 260;
    c.position.copy(center).addScaledVector(dir, 120); c.lookAt(center); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    this.fog.uniforms.uMoonDir.value.copy(dir);
    this.fog.uniforms.uMoonVP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }

  render(scene, camera, o) {
    const r = this.r, fu = this.fog.uniforms, cu = this.comp.uniforms, gu = this.grade.uniforms;
    const gl = r.getContext(), prof = o.profile ? {} : null; let pt = performance.now();
    const px = new Uint8Array(4), pxf = new Uint16Array(4);
    const mark = k => { if (!prof) return; const rt = r.getRenderTarget(); if (rt && rt.samples === 0 && rt.texture.type === THREE.HalfFloatType) r.readRenderTargetPixels(rt, 0, 0, 1, 1, pxf); else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const n = performance.now(); prof[k] = Math.round(n - pt); pt = n; };
    camera.updateMatrixWorld(true);
    // moon depth
    scene.overrideMaterial = this.depthOnly;
    const bg = scene.background; scene.background = null;
    r.setRenderTarget(this.rtMoon); r.clear(); r.render(scene, this.moonCam);
    mark('moonDepth');
    scene.overrideMaterial = null; scene.background = bg;
    // the scene
    r.setRenderTarget(this.rtMain); r.clear(); r.render(scene, camera);
    mark('scene+shadows');
    // fog
    fu.uInvProj.value.copy(camera.projectionMatrixInverse); fu.uCamWorld.value.copy(camera.matrixWorld);
    camera.getWorldPosition(fu.uCamPos.value); camera.getWorldDirection(cu.uCamFwd.value); cu.uNF.value.set(camera.near, camera.far);
    fu.uTime.value = o.time; fu.uFrame.value = o.frame % 64;
    this.quad.material = this.fog; r.setRenderTarget(this.rtFog); this.quad.render(r);
    mark('fog');
    // composite
    if (o.lantern) { cu.uLanPos.value.copy(o.lantern.pos); cu.uLanCol.value.setRGB(...o.lantern.col); cu.uLanDens.value = o.lantern.k; } else cu.uLanDens.value = 0;
    if (o.dof) cu.uDof.value.set(o.dof.focus, o.dof.aperture, o.dof.max ?? 12, 1); else cu.uDof.value.w = 0;
    this.quad.material = this.comp; r.setRenderTarget(this.rtComp); this.quad.render(r);
    mark('comp+dof');
    // bloom (added into rtComp)
    const b = o.bloom || [0.6, 0.6, 0.9];
    this.bloom.strength = b[0]; this.bloom.radius = b[1]; this.bloom.threshold = b[2];
    this.bloom.render(r, null, this.rtComp, 0, false);
    mark('bloom');
    // grade → screen
    const g = o.grade || {};
    gu.uTime.value = o.time;
    for (const [k, n] of [['exposure', 'uExposure'], ['sat', 'uSat'], ['vig', 'uVig'], ['grain', 'uGrain'], ['ca', 'uCA'], ['bars', 'uBars'], ['fade', 'uFade'], ['contrast', 'uContrast'], ['flashA', 'uFlashA']])
      if (g[k] !== undefined) gu[n].value = g[k];
    for (const [k, n] of [['lift', 'uLift'], ['gain', 'uGain'], ['flash', 'uFlash'], ['shadowTint', 'uShadowTint'], ['hiTint', 'uHiTint']])
      if (g[k]) gu[n].value.setRGB(...g[k]);
    this.quad.material = this.grade; r.setRenderTarget(null); this.quad.render(r);
    mark('grade');
    return prof;
  }
}
