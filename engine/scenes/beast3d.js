// BEAST 3D (v3) — raymarched demon bust: horned skull, brow, cheekbones, sockets with burning eyes, opening maw,
// massive neck/shoulders with spikes. Fissured dark-rock hide (Poly Haven CC0) with lava in its real crevices
// (height map), fire key light from below with soft shadows, fire-wall rim from behind, smoke, 3D hooded hero with a
// flaming sword. Depth -> alpha (DOF).
// P0 ro.xyz, focal | P1 target.xyz, roll | P2 eyes, roar, cracks, rise | P3 fire, smoke, flash, heroOn
// P4 hero.xyz, swordAngle | P5 ignite, swordSwing, keyLight, -
'use strict';

SCENES.beast3d = {
  frag: `
uniform sampler2D uRckD, uRckN, uRckH, uClfD, uClfN;
float gRoar, gRise; vec3 gHero; float gSw, gIgn;
vec3 bodyP(vec3 p){ return p-vec3(0.0,-gRise,0.0); }
vec3 bez3(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float u=1.0-t; return u*u*u*a+3.0*u*u*t*b+3.0*u*t*t*c+t*t*t*d; }
float hornD(vec3 q){ // q: x mirrored. massive bull/ram horn: out, up, tip curling forward — chain of round cones
  float d=1e5;
  vec3 A=vec3(1.35,11.35,0.45), Bc=vec3(4.3,11.7,1.2), C=vec3(6.2,14.6,0.9), D=vec3(5.0,17.2,-1.1);
  vec3 prev=A; float rp=0.98;
  for(int i=1;i<=8;i++){
    float s=float(i)/8.0;
    vec3 c=bez3(A,Bc,C,D,s);
    float r=mix(0.98,0.05,pow(s,0.8));
    d=min(d,sdRoundCone(q,prev,c,rp,r));
    prev=c; rp=r;
  }
  return d;
}
float beastD(vec3 p, out float part){
  vec3 q=bodyP(p); q.x=abs(q.x);
  part=0.0;
  float bb=length(q-vec3(0.0,7.0,1.0))-17.0; if(bb>1.0) return bb;
  vec3 h=q-vec3(0.0,10.0,0.0);
  float jd=gRoar*0.85;
  // skull
  float d=sdEllip(h-vec3(0.0,0.75,0.65),vec3(1.65,1.95,2.15));
  d=smin(d,sdEllip(h-vec3(0.0,0.42,-1.30),vec3(1.62,0.40,0.62)),0.35);             // overhanging brow ridge
  d=smin(d,sdEllip(h-vec3(0.0,1.25,-0.75),vec3(0.28,0.85,0.9)),0.3);               // central crest
  d=smin(d,sdEllip(h-vec3(1.30,-0.42,-0.75),vec3(0.55,0.36,0.95)),0.3);            // zygomatic arches
  d=smin(d,sdEllip(h-vec3(0.0,-0.72,-1.30),vec3(0.92,0.85,1.0)),0.45);             // maxilla
  d=smax(d,-sdEllip(h-vec3(0.62,0.02,-1.78),vec3(0.46,0.40,0.62)),0.12);           // deep eye sockets
  d=smax(d,-sdEllip(vec3(h.x*1.4+abs(h.y+0.38)*0.6,h.y+0.38,h.z+2.2),vec3(0.20,0.30,0.5)),0.08);   // nasal cavity
  d=smax(d,-sdEllip(vec3(h.x,h.y+1.45,h.z+1.8),vec3(0.85,0.12+jd*0.25,0.9)),0.1);  // mouth line
  // mandible (separate, drops with the roar)
  vec3 jq=h-vec3(0.0,-1.62,-0.35); jq.yz=rot(-jd*0.45)*jq.yz;
  float jaw=sdEllip(jq-vec3(0.0,-0.28,-1.15),vec3(0.95,0.42,1.25));
  jaw=smin(jaw,sdEllip(jq-vec3(1.05,-0.05,0.0),vec3(0.35,0.55,0.75)),0.3);
  d=smin(d,jaw,0.15*(1.0-gRoar)+0.02);
  // fangs: upper row down, lower row up
  float teeth=1e5;
  for(int i=0;i<4;i++){ float fi=float(i);
    vec3 tp=h-vec3(0.16+fi*0.2,-1.42,-2.15+fi*0.14);
    teeth=min(teeth,sdRoundCone(tp,vec3(0.0),vec3(0.0,-0.32-0.1*step(fi,0.5),-0.04),0.065,0.008));
    vec3 lp=jq-vec3(0.18+fi*0.2,0.08,-2.05+fi*0.15);
    teeth=min(teeth,sdRoundCone(lp,vec3(0.0),vec3(0.0,0.24,-0.03),0.055,0.008));
  }
  d=min(d,teeth);
  float horn=hornD(q)+0.03*sin(length(q-vec3(1.35,11.35,0.45))*10.0);
  if(horn<d) part=1.0;
  d=smin(d,horn,0.3);
  // neck, shoulders, spikes
  float neck=sdCapsule(q,vec3(0.0,8.4,1.2),vec3(0.0,4.0,2.0),2.4);
  float sh=sdEllip(q-vec3(0.0,2.2,2.6),vec3(10.5,4.2,4.8))+0.32*sin(q.x*1.6+q.z*0.7)*sin(q.y*1.2+0.5)+0.18*sin(q.x*3.1-q.y*2.3);
  d=smin(d,smin(neck,sh,1.6),1.0);
  for(int i=0;i<4;i++){ float fi=float(i); vec3 b=vec3(3.4+fi*2.1,5.4-fi*0.6-fi*fi*0.12,2.0+fi*0.3);
    d=smin(d,sdRoundCone(q,b,b+vec3(0.6+fi*0.25,2.4-fi*0.35,0.6),0.62,0.04),0.25); }
  return d;
}
float heroD(vec3 p){
  vec3 q0=p-gHero;
  float bb=length(q0-vec3(0.0,1.2,0.0))-2.2; if(bb>0.3) return bb;
  float h=sat(q0.y/1.5); float ang=atan(q0.z,q0.x);
  float rc=mix(0.38,0.18,pow(h,0.65))+0.016*sin(ang*13.0+q0.y*2.5+uTime*1.5)*(1.0-h*0.7);
  vec3 q=q0; q.z*=1.2; q.x-=0.06*sin(uTime*1.3+q0.y*2.0)*(1.0-h);
  float cloak=max(length(q.xz)-rc,max(0.02-q0.y,q0.y-1.42));
  float sh=length((q0-vec3(0.0,1.36,0.0))*vec3(1.0,1.8,1.5))-0.22;
  float hood=sdRoundCone(q0,vec3(0.0,1.50,0.0),vec3(0.0,1.83,-0.13),0.155,0.012);
  float d=smin(cloak,sh,0.08); d=smin(d,hood,0.07);
  vec3 hand=vec3(0.32,1.55,0.22);
  d=smin(d,sdCapsule(q0,vec3(0.18,1.32,0.0),hand,0.055),0.05);
  return d;
}
vec3 swordTip(){ float a=gSw; return gHero+vec3(0.32,1.55,0.22)+vec3(-sin(a)*0.25,cos(a),sin(a)*0.95)*1.35; }
float swordD(vec3 p){
  vec3 a=gHero+vec3(0.32,1.55,0.22); vec3 b=swordTip();
  vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba));
  return length(pa-ba*h)-mix(0.03,0.006,h);
}
// id: 1 hide, 2 horn, 3 hero, 4 sword, 5 ground
float map(vec3 p, out float id){
  float part; float d=beastD(p,part); id=part>0.5?2.0:1.0;
  float g=max(p.y-(0.3*noise(p.xz*0.3)-0.3),p.z-14.0);      // ground ends at the fire pit; the fire wall fills the horizon
  if(g<d){ d=g; id=5.0; }
  if(uP[3].w>0.5){ float hd=heroD(p); if(hd<d){ d=hd; id=3.0; } float sd=swordD(p); if(sd<d){ d=sd; id=4.0; } }
  return d;
}
float mapS(vec3 p){ float id; return map(p,id); }
vec3 calcN(vec3 p, float e){
  float id; const vec2 k=vec2(1.0,-1.0);
  return normalize(k.xyy*map(p+k.xyy*e,id)+k.yyx*map(p+k.yyx*e,id)+k.yxy*map(p+k.yxy*e,id)+k.xxx*map(p+k.xxx*e,id));
}
float softShadow(vec3 ro, vec3 rd, float tmax, float k){
  float res=1.0, t=0.1;
  for(int i=0;i<28;i++){ float h=mapS(ro+rd*t); res=min(res,k*h/t); t+=clamp(h,0.08,2.0); if(res<0.02||t>tmax) break; }
  return sat(res);
}
float calcAO(vec3 p, vec3 n){
  float occ=0.0, sca=1.0;
  for(int i=0;i<5;i++){ float h=0.06+0.3*float(i); occ+=(h-mapS(p+n*h))*sca; sca*=0.7; }
  return sat(1.0-0.8*occ);
}
// fire wall behind the beast (plane at z=+22), domain-warped flames rising
vec3 fireWall(vec2 p, float t){
  vec2 w=vec2(fbm(p*0.12+vec2(0.0,-t*0.35),4),fbm(p*0.12+vec2(5.2,-t*0.3),4));
  vec2 fp=p*0.09+w*1.6; fp.y-=t*0.55;
  float f=fbm(fp,6);
  float hgt=smoothstep(26.0,-4.0,p.y);
  float heat=sat((f-0.42)*2.6*hgt+hgt*0.55-0.2);
  vec3 c=fireCol(heat*heat)*0.75;
  float smk=smoothstep(0.35,0.75,fbm(p*0.05+vec2(t*0.03,-t*0.12),5));
  c*=0.25+0.9*smk;
  return c*uP[3].x;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  gRoar=uP[2].y; gRise=uP[2].w; gHero=uP[4].xyz; gSw=uP[4].w; gIgn=uP[5].x;
  vec3 ro=uP[0].xyz, ta=uP[1].xyz;
  vec3 cw=normalize(ta-ro); float rl=uP[1].w;
  vec3 cu=normalize(cross(cw,vec3(sin(rl),cos(rl),0.0))); vec3 cv=cross(cu,cw);
  float fl=uP[0].w;
  vec3 rd=normalize(uv.x*cu+uv.y*cv+fl*cw);
  float t=0.1, id=0.0, tmax=120.0; bool hit=false;
  for(int i=0;i<140;i++){
    vec3 p=ro+rd*t; float d=map(p,id);
    if(d<0.0006*t){ hit=true; break; }
    t+=d*0.9; if(t>tmax) break;
  }
  vec3 Kp=vec3(0.0,1.2,-7.5);                               // fire pit between hero and beast: key light from below
  vec3 col=vec3(0.0); float depth=500.0;
  float tz=(22.0-ro.z)/max(rd.z,1e-3);
  vec3 bg=rd.z>0.0?fireWall((ro+rd*tz).xy,uTime):vec3(0.0);
  if(hit){
    vec3 p=ro+rd*t; map(p,id); depth=t;
    vec3 n=calcN(p,0.001*t+0.002);
    vec3 v=-rd;
    float lod=log2(max(t*800.0/(fl*uRes.y)/max(abs(dot(n,v)),0.3),1.0));
    vec3 alb; vec3 nn=n; float rough=0.7; vec3 emit=vec3(0.0);
    if(id<2.5){
      float s=id<1.5?0.32:0.6;
      alb=triAlb(uRckD,p,n,s,lod)*(id<1.5?0.75:0.5);
      nn=triNor(uRckN,p,n,s,lod,1.6);
      if(id<1.5){
        float hgt=triH(uRckH,p,n,s,lod);
        float crev=smoothstep(0.30,0.12,hgt)*smoothstep(0.45,0.7,fbm(p.xy*0.25+uTime*0.05,3))*uP[2].z;
        crev*=smoothstep(9.5,6.0,bodyP(p).y)+0.35;
        emit+=fireCol(0.85+0.25*sin(uTime*2.0+p.y))*crev*1.8;
        rough=mix(0.55,0.9,hgt);
      } else rough=0.45;
    } else if(id<3.5){
      alb=vec3(0.025,0.022,0.024)*(0.85+0.3*noise(p.xy*80.0)); rough=0.9;
    } else if(id<4.5){
      alb=vec3(0.06); rough=0.25;
      vec3 a=gHero+vec3(0.32,1.55,0.22); float along=length(p-a)/1.35;
      emit+=fireCol(1.0)*1.6*step(along,gIgn)*gIgn;
    } else {
      alb=triAlb(uClfD,p,n,0.2,lod)*0.35; nn=triNor(uClfN,p,n,0.2,lod,1.3);
    }
    float ao=calcAO(p,n);
    vec3 dl=Kp-p; float dd=length(dl); vec3 ld=dl/dd;
    float ndl=max(dot(nn,ld),0.0);
    float sh=ndl>0.0?softShadow(p+n*0.05,ld,dd-0.5,9.0):0.0;
    vec3 Kc=vec3(1.0,0.42,0.13)*uP[5].z*260.0/(1.0+dd*dd*0.35);
    col=alb*Kc*ndl*sh+Kc*specGGX(nn,v,ld,rough)*0.15*sh;
    // fire wall rim from behind
    vec3 bL=normalize(vec3(0.0,0.25,1.0));
    float rim=pow(1.0-max(dot(nn,v),0.0),3.0)*max(dot(nn,bL)+0.35,0.0);
    col+=vec3(1.0,0.38,0.1)*rim*1.6*uP[3].x*ao;
    col+=alb*vec3(0.35,0.12,0.06)*0.35*ao;                // red ambient
    col+=alb*vec3(0.18,0.22,0.32)*0.25*max(nn.y,0.0)*ao;     // faint cold sky
    col+=emit;
    // the hero's blade lights its holder
    if(uP[3].w>0.5 && gIgn>0.0){
      vec3 sp=(gHero+vec3(0.32,1.55,0.22)+swordTip())*0.5; vec3 sl=sp-p; float s2=dot(sl,sl);
      col+=alb*fireCol(1.0)*gIgn*6.0/(0.3+s2)*max(dot(nn,normalize(sl)),0.0);
    }
  } else { col=bg; depth=tz; }
  // eyes: burning embers deep in the sockets, with a glow in the smoke
  for(int k=0;k<2;k++){
    vec3 e=vec3(k==0?-0.62:0.62,10.02-gRise,-1.55);
    vec3 lo=e-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc);
    if(tc>0.0 && tc<depth+0.6){
      float a=h/tc;
      vec3 od=normalize(lo-rd*tc+1e-6*cu);
      vec2 ea=vec2(dot(od,cu),dot(od,cv))*a;
      float sl=ea.x*ea.x/0.000022+ea.y*ea.y/0.000004;                 // slit-shaped ember
      col+=vec3(1.0,0.55,0.12)*uP[2].x*(exp(-sl)*5.0+exp(-a*a/0.0004)*0.35);
    }
  }
  if(gRoar>0.05){ vec3 m=vec3(0.0,8.4-gRoar*0.4-gRise,-2.0); col+=fireCol(0.9)*gRoar*inscatter(ro,rd,m,min(depth,60.0))*0.035; }
  // smoke and heat haze lit by the fire
  float tE=min(depth,60.0);
  float sm=fbm(vec2(dot(rd,cu)*3.0+uTime*0.04,dot(rd,cv)*3.0-uTime*0.08),5);
  float smk=smoothstep(0.45,0.85,sm)*uP[3].y;
  col=mix(col,col*0.35+vec3(0.06,0.02,0.01),smk*0.7);
  col+=vec3(1.0,0.4,0.12)*inscatter(ro,rd,Kp,tE)*0.07*uP[5].z;
  // foreground flames licking up between camera and beast (plane z=-3.5)
  if(rd.z>0.0){
    float tf=(-3.5-ro.z)/rd.z;
    if(tf>0.0 && tf<depth){
      vec3 pf=ro+rd*tf;
      vec2 w=vec2(fbm(pf.xy*0.3+vec2(0.0,-uTime*0.6),3),fbm(pf.xy*0.3+vec2(3.1,-uTime*0.5),3));
      vec2 fp=pf.xy*vec2(0.35,0.22)+w*0.9; fp.y-=uTime*1.1;
      float f=fbm(fp,5);
      float hg=smoothstep(7.5,0.5,pf.y);
      float heat=sat((f-0.48)*2.8*hg+hg*0.25-0.12)*uP[5].w;
      col=col*(1.0-sat(heat*1.4)*0.55)+fireCol(heat)*1.2;
    }
  }
  col+=vec3(1.0,0.6,0.3)*uP[3].z;
  fragColor=vec4(max(col,0.0),depth);
}`,
  textures: () => TEX.bind({ uRck: 'rock', uClf: 'cliff' }),
  pack(o) {
    const d = Object.assign({ ro: [0, 1.6, -22], fl: 1.6, ta: [0, 9, 0], roll: 0, eyes: 1, roar: 0, cracks: 0.8, rise: 0,
      fire: 1, smoke: 0.5, flash: 0, heroOn: 0, hero: [0, 0, -12], swing: 0.35, ignite: 0, key: 1, rise: -1.2 }, o);
    return [...d.ro, d.fl, ...d.ta, d.roll, d.eyes, d.roar, d.cracks, d.rise, d.fire, d.smoke, d.flash, d.heroOn,
      ...d.hero, d.swing, d.ignite, 0, d.key, d.fgFire === undefined ? 1 : d.fgFire];
  },
};
