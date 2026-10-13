// BEAST — colossal horned demon rising from a wall of fire; optional hero with a flaming sword.
// P0 cam.xy, viewH, roll | P1 eyes, roar, cracks, rise | P2 fireWall, smoke, flash, heroLight
// P3 heroOn, hero.x, hero.y, heroScale | P4 swordIgnite, swordAngle, beastX, beastScale
'use strict';

SCENES.beast = {
  frag: `
float horn(vec2 p, vec2 a, vec2 b, vec2 c, float w0){
  vec2 bz=sdBezier(p,a,b,c);
  float w=mix(w0,0.006,pow(bz.y,0.8));
  float ridges=0.012*smoothstep(0.2,1.0,sin(bz.y*48.0))*(1.0-bz.y);
  return bz.x-w-ridges;
}
float beastSDF(vec2 p, out float eyeMask, out float mouthMask){
  // head
  float head=sdEllipse2(p-vec2(0.0,0.44),vec2(0.25,0.32));
  float jaw=sdBox2(vec2(abs(p.x)*1.0+ (0.44-p.y)*0.35,p.y-0.18),vec2(0.14,0.16))-0.04;
  float d=smin(head,jaw,0.08);
  float brow=sdEllipse2(vec2(abs(p.x)-0.12,p.y-0.52)*rot(-0.35),vec2(0.12,0.05));
  d=smin(d,brow,0.04);
  // horns: big sweeping pair + small inner pair
  vec2 q=vec2(abs(p.x),p.y);
  d=smin(d,horn(q,vec2(0.15,0.64),vec2(0.95,0.80),vec2(0.66,1.66),0.14),0.06);
  d=smin(d,horn(q,vec2(0.10,0.80),vec2(0.17,0.92),vec2(0.13,1.0),0.035),0.02);
  // neck + shoulders + spikes
  float neck=sdBox2(p-vec2(0.0,-0.05),vec2(0.24,0.25))-0.08;
  d=smin(d,neck,0.12);
  float sh=sdEllipse2(p-vec2(0.0,-1.05),vec2(2.1,0.95));
  float trap=sdBox2(vec2(abs(p.x)+p.y*0.9,p.y+0.9),vec2(0.9,0.75));
  d=smin(d,min(sh,trap),0.25);
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec2 base=vec2(0.40+fi*0.30,-0.22-fi*0.12-fi*fi*0.03);
    vec2 tip=base+vec2(0.10+fi*0.04,0.30-fi*0.04);
    vec2 sp=vec2(abs(p.x),p.y);
    vec2 bz=sdSeg2h(sp,base,tip);
    d=smin(d,bz.x-mix(0.06,0.004,bz.y),0.03);
  }
  d+=(fbm(p*9.0,4)-0.5)*0.025;
  // eyes: slanted slits
  vec2 ep=vec2(abs(p.x)-0.105,p.y-0.43); ep*=rot(0.38);
  eyeMask=smoothstep(0.012,0.0,sdEllipse2(ep,vec2(0.055,0.016)));
  vec2 mp=vec2(p.x,p.y-0.16);
  mouthMask=smoothstep(0.01,0.0,sdEllipse2(mp,vec2(0.11,0.025+0.05*uP[1].y)));
  return d;
}
float hero2D(vec2 p){ return cloaked2D(p,1.0); }
vec3 fireWall(vec2 p, float t){
  float f=flameField(vec2(p.x*0.9,p.y*0.8+1.2),t*0.9);
  float hgt=smoothstep(1.8,-1.0,p.y);
  float heat=sat((f-0.55)*2.2+hgt*0.75-0.25);
  vec3 c=fireCol(heat*heat)*0.55;
  float sm=fbm(p*1.1+vec2(t*0.05,-t*0.25),5);
  c*=0.15+1.0*smoothstep(0.3,0.75,sm);
  c+=vec3(0.10,0.018,0.006)*smoothstep(2.5,-0.5,p.y);
  return c*uP[2].x;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  uv=rot(uP[0].w)*uv;
  vec2 p=uP[0].xy+uv*uP[0].z;
  float t=uTime;
  vec3 col=fireWall(p,t);
  // beast
  vec2 bp=(p-vec2(uP[4].z,-uP[1].w))/uP[4].w;
  float eye, mouth;
  float bd=beastSDF(bp,eye,mouth)*uP[4].w;
  float px=uP[0].z/uRes.y*1.2;
  float bm=smoothstep(px,-px,bd);
  float rv=ridged(bp*vec2(3.2,3.8)+7.0,5);
  float cracks=smoothstep(0.86,0.97,rv)*smoothstep(0.4,0.8,fbm(bp*1.5+t*0.08,3))*uP[1].z*smoothstep(0.7,0.2,bp.y);
  vec3 skin=vec3(0.012,0.008,0.007)*(0.5+fbm(bp*6.0,4));
  float rim=exp(-max(-bd,0.0)/max(px*3.0,0.01))*bm;
  vec3 bc=skin+fireCol(0.9)*cracks*(0.6+0.4*sin(t*2.0+bp.y*8.0))*1.4+vec3(1.0,0.45,0.15)*rim*0.7*uP[2].x;
  bc+=fireCol(1.2)*eye*uP[1].x*3.0+vec3(1.0,0.3,0.05)*eye*uP[1].x*2.0;
  bc+=fireCol(1.0)*mouth*uP[1].y*2.5;
  col=mix(col,bc,bm);
  // eye glow halo (outside silhouette too)
  vec2 ebp=vec2(abs(bp.x)-0.105,bp.y-0.43);
  col+=vec3(1.0,0.25,0.05)*exp(-dot(ebp,ebp)/0.004)*uP[1].x*0.5;
  // hero in front
  if(uP[3].x>0.5){
    vec2 hp=(p-uP[3].yz)/uP[3].w;
    float hd=hero2D(hp)*uP[3].w;
    float hm=smoothstep(px,-px,hd);
    float hrim=exp(-max(-hd,0.0)/max(px*2.5,0.004))*hm;
    // sword: from hand, angled
    float ang=uP[4].y;
    vec2 hand=vec2(0.34,1.62);
    vec2 tip=hand+vec2(cos(ang),sin(ang))*1.25;
    vec2 sw=sdSeg2h(hp,hand,tip);
    float blade=sw.x*uP[3].w-mix(0.020,0.004,sw.y)*uP[3].w;
    float swm=smoothstep(px,-px,blade);
    vec3 hc=vec3(0.006)+vec3(1.0,0.45,0.15)*hrim*1.2*uP[2].w;
    col=mix(col,hc,hm);
    float ign=uP[4].x;
    float along=step(sw.y,ign);
    vec3 bladeC=mix(vec3(0.05),fireCol(0.9)*1.2,along);
    col=mix(col,bladeC,swm);
    // flames licking off the blade
    vec2 fp=vec2(sw.y*6.0,sw.x*14.0-t*4.0);
    float fl=fbm(fp+vec2(0.0,-t*3.0),4);
    float fdist=sw.x*uP[3].w;
    float flame=exp(-fdist*fdist/(0.004*uP[3].w*uP[3].w))*smoothstep(0.35,0.75,fl)*along;
    col+=fireCol(0.9)*flame*2.0*ign;
    col+=vec3(1.0,0.5,0.15)*exp(-fdist*fdist/(0.02*uP[3].w*uP[3].w))*0.35*along*ign;
  }
  // flames in front, licking up over the lower frame
  float ff=flameField(vec2(p.x*1.4+3.0,p.y*1.1+0.6),t*1.3);
  float fh=smoothstep(-0.2,-1.6,p.y-uP[0].y+uP[0].z*0.25);
  float fheat=sat((ff-0.6)*2.5+fh*0.8-0.35)*fh;
  col+=fireCol(fheat)*0.9*uP[2].x;
  // foreground smoke
  float sm=fbm(p*0.7+vec2(t*0.12,0.03*t),5);
  col=mix(col,col*0.3,smoothstep(0.55,0.85,sm)*uP[2].y);
  col+=vec3(1.0,0.6,0.3)*uP[2].z;
  fragColor=vec4(col,1.0);
}`,
  pack(o) {
    const d = Object.assign({ cam: [0, 0.4], S: 2.6, roll: 0, eyes: 1, roar: 0, cracks: 0.6, rise: 0, fire: 1, smoke: 0.6, flash: 0, heroLight: 1,
      heroOn: 0, hero: [0, -1.2], heroS: 0.5, ignite: 0, swordAng: 1.1, beastX: 0, beastS: 1 }, o);
    return [...d.cam, d.S, d.roll, d.eyes, d.roar, d.cracks, d.rise, d.fire, d.smoke, d.flash, d.heroLight,
      d.heroOn, ...d.hero, d.heroS, d.ignite, d.swordAng, d.beastX, d.beastS, ...Array(16).fill(0)];
  },
};
