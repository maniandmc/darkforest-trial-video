// Post-processing: HDR render (MSAA), bloom, a grade pass (split-tone, vignette, chromatic fringe, grain), tone map.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVig: { value: 0.55 }, uGrain: { value: 0.035 }, uCA: { value: 0.0025 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uCA; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv - d * uCA * r2 * 8.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * uCA * r2 * 8.0).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c * vec3(1.06, 0.97, 0.9), c, smoothstep(0.0, 1.5, l));          // warm the mids
      c += vec3(0.010, 0.004, 0.006) * (1.0 - smoothstep(0.0, 0.08, l));       // lifted, plum-tinted blacks
      c *= 1.0 - uVig * r2 * 2.0;
      float g = fract(sin(dot(floor(vUv * uRes) + fract(uTime * 7.13) * 91.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += g * uGrain * (0.25 + sqrt(max(l, 0.0)));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(sz.x, sz.y), 0.62, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
  }
  setEnabled(on) { this.enabled = on; }
  resize(w, h, pr) {
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }
  render(t) { this.grade.uniforms.uTime.value = t; this.composer.render(); }
}
