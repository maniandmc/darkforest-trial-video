// Materials. Rock surfaces use a patched MeshStandardMaterial: photo-scanned albedo + normal maps projected
// triplanar in each mesh's own (scaled) object space — so textures stick to moving limbs — plus a second macro scale
// against tiling, and optional 3D-voronoi plate seams carrying live magma (the trailer's basalt-armour look).
import * as THREE from 'three';

const shared = { uTime: { value: 0 } };
export const matTime = shared.uTime;

const GLSL_COMMON = /* glsl */`
varying vec3 vObjPos; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2;
uniform sampler2D tDiff, tNor;
uniform float uScale, uNormalK, uCell, uLava, uTime, uSeamDark, uTint, uSeed, uSeamW, uLive;
uniform vec3 uLavaColor;
vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec3 triAlb(sampler2D t, vec3 p, vec3 w, float s){
  return texture(t, p.zy * s).rgb * w.x + texture(t, p.xz * s).rgb * w.y + texture(t, p.xy * s).rgb * w.z;
}
vec3 triNor(sampler2D t, vec3 p, vec3 n, float s, float k){
  vec3 w = triW(n);
  vec3 tx = texture(t, p.zy * s).xyz * 2.0 - 1.0, ty = texture(t, p.xz * s).xyz * 2.0 - 1.0, tz = texture(t, p.xy * s).xyz * 2.0 - 1.0;
  tx.xy *= k; ty.xy *= k; tz.xy *= k;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), u.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), u.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), u.x), u.y), u.z);
}
vec2 vor3(vec3 x){
  vec3 n = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec3 g = vec3(float(i), float(j), float(k)); vec3 r = g + h33(n + g) * 0.8 + 0.1 - f; float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = h13(n + g + 0.37); } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d2) - sqrt(d1), id);
}`;

function patchRock(mat, U, defines) {
  mat.defines = { ...(mat.defines || {}), ...defines };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 mm_ = modelMatrix;
        #ifdef USE_INSTANCING
          mm_ = modelMatrix * instanceMatrix;
        #endif
        vec3 sc_ = vec3(length(mm_[0].xyz), length(mm_[1].xyz), length(mm_[2].xyz));
        vObjPos = position * sc_; vObjN = normalize(normal / sc_);
        #ifdef USE_INSTANCING
          vObjPos += instanceMatrix[3].xyz * 0.37;
        #endif
        vR0 = mm_[0].xyz / sc_.x; vR1 = mm_[1].xyz / sc_.y; vR2 = mm_[2].xyz / sc_.z;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <map_fragment>', `
        vec3 nO_ = normalize(vObjN); vec3 tw_ = triW(nO_);
        vec3 alb_ = triAlb(tDiff, vObjPos, tw_, uScale);
        vec3 albM_ = triAlb(tDiff, vObjPos + vec3(13.7, 5.1, 9.3), tw_, uScale * 0.21);
        alb_ *= 0.55 + 0.9 * dot(albM_, vec3(0.2126, 0.7152, 0.0722));
        float seam_ = 1.0, plId_ = 0.0, edge_ = 1.0;
        #ifdef SEAMS
          vec3 pp_ = vObjPos * uCell + uSeed + 0.45 * vec3(n3(vObjPos * 0.4), n3(vObjPos * 0.4 + 7.1), n3(vObjPos * 0.4 + 3.3));
          vec2 pl_ = vor3(pp_); plId_ = pl_.y;
          float sw_ = uSeamW * (0.35 + 1.3 * n3(vObjPos * 0.22 + uSeed * 1.7));       // cracks vary in width
          seam_ = smoothstep(0.0, sw_, pl_.x); edge_ = smoothstep(0.0, sw_ * 3.0, pl_.x);
          alb_ *= mix(1.0, (0.55 + 0.6 * plId_), 0.7) * mix(uSeamDark, 1.0, edge_);
        #endif
        diffuseColor.rgb *= alb_ * uTint;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.75 + 0.5 * dot(alb_, vec3(0.33))) , 0.15, 1.0);`)
      .replace('#include <normal_fragment_maps>', `
        { vec3 np_ = triNor(tNor, vObjPos, nO_, uScale, uNormalK);
          vec3 nw_ = normalize(mat3(vR0, vR1, vR2) * np_);
          normal = normalize((viewMatrix * vec4(nw_, 0.0)).xyz); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef SEAMS
        { float live_ = smoothstep(uLive, uLive + 0.18, n3(vObjPos * 0.33 + vec3(0.0, -uTime * 0.06, 0.0) + uSeed));
          float hot_ = (0.06 + 0.94 * live_) * uLava * (0.82 + 0.18 * sin(uTime * 2.3 + plId_ * 6.0 + vObjPos.y));
          totalEmissiveRadiance += uLavaColor * (pow(1.0 - seam_, 2.0) * 2.0 + (1.0 - edge_) * 0.1) * hot_; }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'rock:' + JSON.stringify(defines);
  return mat;
}

export function makeMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  const tex = (url, srgb) => {
    const t = loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const T = {
    rockD: tex('assets/tex/rock_diff.jpg', true), rockN: tex('assets/tex/rock_nor.jpg', false),
    cliffD: tex('assets/tex/cliff_diff.jpg', true), cliffN: tex('assets/tex/cliff_nor.jpg', false),
  };
  const rock = (o) => {
    const U = {
      tDiff: { value: o.diff }, tNor: { value: o.nor }, uScale: { value: o.scale }, uNormalK: { value: o.normalK ?? 1.4 },
      uCell: { value: o.cell ?? 0.5 }, uLava: { value: o.lava ?? 0 }, uTime: shared.uTime, uSeamDark: { value: o.seamDark ?? 0.2 },
      uTint: { value: o.tint ?? 1 }, uSeed: { value: o.seed ?? 0 }, uSeamW: { value: o.seamW ?? 0.05 }, uLive: { value: o.live ?? 0.45 }, uLavaColor: { value: new THREE.Color(...(o.lavaColor || [2.5, 0.75, 0.16])) },
    };
    const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0.0,
      emissive: 0x000000 });
    m.userData.U = U;
    return patchRock(m, U, o.seams ? { SEAMS: 1 } : {});
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    T,
    cloak: std({ color: 0x1d1b1a, roughness: 0.92 }),
    cloakIn: std({ color: 0x3a0c08, roughness: 0.9 }),
    playerDark: std({ color: 0x020202, roughness: 1 }),
    steel: std({ color: 0x5a5450, roughness: 0.35, metalness: 0.9 }),
    blade: std({ color: 0xc9c2b6, roughness: 0.2, metalness: 1.0, emissive: 0xff6a20, emissiveIntensity: 0 }),
    flask: std({ color: 0xffa040, emissive: 0xff8a20, emissiveIntensity: 3, roughness: 0.2 }),
    bossSkin: rock({ diff: T.rockD, nor: T.rockN, scale: 0.42, normalK: 1.7, seams: true, cell: 0.55, seamW: 0.04, live: 0.5, lava: 0.7, seamDark: 0.15, tint: 0.62, roughness: 0.6 }),
    bossHorn: rock({ diff: T.cliffD, nor: T.cliffN, scale: 0.9, normalK: 1.2, tint: 0.32, roughness: 0.42 }),
    bone: std({ color: 0xb8a78e, roughness: 0.5 }),
    claw: std({ color: 0x1c1714, roughness: 0.35, metalness: 0.1 }),
    socket: std({ color: 0x020100, roughness: 1 }),
    bossEye: std({ color: 0xffb060, emissive: 0xff7a18, emissiveIntensity: 6 }),
    floor: rock({ diff: T.cliffD, nor: T.cliffN, scale: 0.16, normalK: 1.3, seams: true, cell: 0.16, seamW: 0.016, live: 0.58, lava: 0.5, seamDark: 0.3, tint: 0.42, roughness: 0.85, seed: 3.7 }),
    wall: rock({ diff: T.cliffD, nor: T.cliffN, scale: 0.07, normalK: 1.5, tint: 0.5, roughness: 0.95 }),
    rubble: rock({ diff: T.rockD, nor: T.rockN, scale: 0.35, normalK: 1.5, tint: 0.6, roughness: 0.85 }),
  };
}
