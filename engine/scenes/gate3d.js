// GATE 3D (v3) — the Gate of Hell as a raymarched set: rough cliff, flat carved facade, gothic portal with
// receding archivolts and columns, inscription panel, stone steps, two colossal hooded guardians on plinths,
// inferno seen down the portal tunnel. Photo-scanned stone/rock (Poly Haven CC0), portal light with soft shadows,
// volumetric haze. Depth -> alpha for DOF.
// P0 ro.xyz, focal | P1 target.xyz, roll | P2 portal, burn, wanderer on, wanderer z | P3 vortex, flare, haze, lantern
'use strict';

SCENES.gate3d = {
  frag: `
uniform sampler2D uTex0;
uniform sampler2D uBlkD, uBlkN, uBlkH, uClfD, uClfN, uClfH, uRckD, uRckN, uRckH;
const float AW=4.0, AHS=11.0, AA=2.2;
float gPortal, gWalk; vec3 gLp, gWan;
float archSDF(vec2 p){
  float R=AW+AA;
  float rect=sdBox2(p-vec2(0.0,AHS*0.5-1.0),vec2(AW,AHS*0.5+1.0));
  float arch=max(max(length(p-vec2(-AA,AHS))-R,length(p-vec2(AA,AHS))-R),AHS-p.y);
  return min(rect,arch);
}
float statueD(vec3 q){ // hooded guardian, unit height ~2, facing -z, holding a sword point-down
  float bb=length(q-vec3(0.0,1.0,0.0))-1.25; if(bb>0.4) return bb;
  float h=sat(q.y/1.45); float ang=atan(q.z,q.x);
  float rc=mix(0.42,0.21,pow(h,0.7))+0.018*sin(ang*11.0+q.y*1.5)*(1.0-h*0.6);
  vec3 c=q; c.z*=1.2;
  float cloak=max(length(c.xz)-rc,max(-q.y,q.y-1.42));
  float sh=sdEllip(q-vec3(0.0,1.36,0.0),vec3(0.30,0.15,0.22));
  float hood=sdRoundCone(q,vec3(0.0,1.48,0.02),vec3(0.0,1.86,0.12),0.18,0.02);
  float d=smin(cloak,sh,0.1); d=smin(d,hood,0.08);
  d=max(d,-sdEllip(q-vec3(0.0,1.52,-0.15),vec3(0.10,0.13,0.10)));          // dark hollow under the hood
  float hands=sdEllip(q-vec3(0.0,1.08,-0.27),vec3(0.12,0.08,0.09));
  d=smin(d,hands,0.05);
  float blade=sdBox3(q-vec3(0.0,0.55,-0.33),vec3(0.05,0.47,0.014));
  float guard=sdBox3(q-vec3(0.0,1.0,-0.33),vec3(0.17,0.022,0.03));
  float grip=sdBox3(q-vec3(0.0,1.13,-0.31),vec3(0.022,0.12,0.022));
  d=min(d,min(blade,min(guard,grip)));
  return d;
}
float wanD(vec3 p){
  vec3 q0=p-gWan;
  float bb=length(q0-vec3(0.0,0.95,0.0))-1.3; if(bb>0.3) return bb;
  float h=sat(q0.y/1.5); float ang=atan(q0.z,q0.x);
  float rc=mix(0.36,0.17,pow(h,0.65))+0.014*sin(ang*13.0+q0.y*2.5)*(1.0-h*0.7);
  vec3 q=q0; q.z*=1.25;
  float cloak=max(length(q.xz)-rc,max(0.02-q0.y,q0.y-1.42));
  float sh=length((q0-vec3(0.0,1.36,0.0))*vec3(1.0,1.8,1.5))-0.22;
  float hood=sdRoundCone(q0,vec3(0.0,1.50,0.0),vec3(0.0,1.83,-0.13),0.155,0.012);
  float d=smin(cloak,sh,0.08); d=smin(d,hood,0.07);
  d=min(d,sdCapsule(q0,vec3(0.28,0.0,-0.2),vec3(0.31,1.95,-0.12),0.022));
  return d;
}
float cliffS(vec2 xy){ return -1.4*noise(xy*0.05)-0.7*noise(xy*0.17+3.0)-0.25*noise(xy*0.6); }
// id: 1 facade/stone, 2 cliff, 3 statue, 4 ground, 5 wanderer
float map(vec3 p, out float id){
  // facade blends into the rough cliff away from the portal
  float fm=smoothstep(14.0,11.0,abs(p.x))*smoothstep(26.0,23.5,p.y);
  float s=mix(cliffS(p.xy),0.0,fm);
  float wall=(s-p.z)*0.75;
  wall=max(wall,p.z-4.0);                      // 4 m thick: the portal opens straight into the inferno
  float cut=archSDF(p.xy);
  for(int k=1;k<4;k++){ float fk=float(k); cut=min(cut,max(archSDF(p.xy)-0.6*fk,p.z-(2.4-0.6*fk))); }
  wall=max(wall,-cut);
  wall=max(wall,-sdBox3(p-vec3(0.0,19.95,0.0),vec3(10.4,0.95,0.28)));             // inscription panel
  // jamb columns
  float col=1e5;
  for(int k=0;k<3;k++){
    float fk=float(k); float cx=AW+0.6*fk+0.32; float cz=2.4-0.6*fk-0.32;
    vec2 cq=vec2(abs(p.x)-cx,p.z-cz);
    col=min(col,max(length(cq)-0.26,max(-p.y,p.y-AHS)));
    col=min(col,sdBox3(vec3(cq.x,p.y-AHS-0.15,cq.y),vec3(0.36,0.15,0.36)));
  }
  float d=min(wall,col); id=(fm>0.5||col<wall)?1.0:2.0;
  // steps up to the threshold
  float st=1e5;
  for(int i=0;i<4;i++){ float fi=float(i); float z0=-5.4+1.25*fi; float hgt=0.24*(fi+1.0);
    st=min(st,sdBox3(p-vec3(0.0,hgt*0.5,(z0+1.0)*0.5),vec3(6.8-0.4*fi,hgt*0.5,(1.0-z0)*0.5))); }
  if(st<d){ d=st; id=1.0; }
  // guardians on plinths
  for(int k=0;k<2;k++){
    float sx=k==0?-1.0:1.0; vec3 b=vec3(sx*13.0,2.2,-4.5);
    float pl=sdBox3(p-vec3(b.x,1.1,b.z),vec3(2.6,1.1,2.6));
    if(pl<d){ d=pl; id=1.0; }
    float S=9.5;
    float gd=statueD((p-b)/S)*S;
    if(gd<d){ d=gd; id=3.0; }
  }
  float g=p.y-(0.35*noise(p.xz*0.15)+0.12*noise(p.xz*0.7)-0.25);
  if(g<d){ d=g; id=4.0; }
  if(uP[2].z>0.5){ float w=wanD(p); if(w<d){ d=w; id=5.0; } }
  return d;
}
float mapS(vec3 p){ float id; return map(p,id); }
vec3 calcN(vec3 p, float e){
  float id; const vec2 k=vec2(1.0,-1.0);
  return normalize(k.xyy*map(p+k.xyy*e,id)+k.yyx*map(p+k.yyx*e,id)+k.yxy*map(p+k.yxy*e,id)+k.xxx*map(p+k.xxx*e,id));
}
float softShadow(vec3 ro, vec3 rd, float tmax, float k){
  float res=1.0, t=0.08;
  for(int i=0;i<30;i++){ float h=mapS(ro+rd*t); res=min(res,k*h/t); t+=clamp(h,0.05,1.5); if(res<0.02||t>tmax) break; }
  return sat(res);
}
float calcAO(vec3 p, vec3 n){
  float occ=0.0, sca=1.0;
  for(int i=0;i<5;i++){ float h=0.05+0.35*float(i); occ+=(h-mapS(p+n*h))*sca; sca*=0.7; }
  return sat(1.0-0.9*occ);
}
vec3 inferno(vec2 p, float t){
  vec2 vp=vec2(0.0,5.0);
  vec2 q=p-vp; float r=length(q); float a=atan(q.y,q.x);
  float z=1.0/(r+0.35);
  float zz=z*2.5+t*uP[3].x;
  float f=fbm3(vec3(cos(a)*1.6,sin(a)*1.6,zz),5);
  float f2=fbm3(vec3(cos(a)*3.2,sin(a)*3.2,zz*3.0+3.0),4);
  float heat=smoothstep(0.35,0.9,f*0.8+f2*0.4)*(0.4+0.6*exp(-r*0.18));
  vec3 c=fireCol(heat*1.15)*1.1;
  float smoke=smoothstep(0.35,0.75,fbm(p*0.35+vec2(t*0.08,-t*0.15),5));
  c*=0.25+0.75*smoke;
  c+=vec3(1.0,0.40,0.10)*exp(-r*0.55)*0.9+vec3(1.0,0.80,0.55)*exp(-r*2.0)*1.4;
  return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  gPortal=uP[2].x; gWan=vec3(0.0,0.0,uP[2].w);
  gLp=vec3(0.0,6.0,8.5);
  vec3 ro=uP[0].xyz, ta=uP[1].xyz;
  vec3 cw=normalize(ta-ro); float rl=uP[1].w;
  vec3 cu=normalize(cross(cw,vec3(sin(rl),cos(rl),0.0))); vec3 cv=cross(cu,cw);
  float fl=uP[0].w;
  vec3 rd=normalize(uv.x*cu+uv.y*cv+fl*cw);
  float t=0.1, id=0.0, tmax=220.0; bool hit=false;
  for(int i=0;i<150;i++){
    vec3 p=ro+rd*t; float d=map(p,id);
    if(d<0.0008*t){ hit=true; break; }
    t+=d; if(t>tmax) break;
  }
  vec3 col=vec3(0.0); float depth=500.0;
  vec3 haze=vec3(0.30,0.10,0.04)*gPortal;
  if(hit){
    vec3 p=ro+rd*t; map(p,id); depth=t;
    vec3 n=calcN(p,0.0015*t+0.002);
    vec3 v=-rd;
    float lod=log2(max(t*700.0/(fl*uRes.y)/max(abs(dot(n,v)),0.3),1.0));
    vec3 alb; float rough=0.85; vec3 nn=n;
    if(id<1.5){
      alb=triAlb(uBlkD,p,n,0.42,lod)*vec3(0.62,0.56,0.50)*0.55;
      nn=triNor(uBlkN,p,n,0.42,lod,1.4);
      alb*=0.55+0.45*smoothstep(0.25,0.7,fbm(p.xy*0.35,3));          // soot & grime
    } else if(id<2.5){
      alb=mix(triAlb(uClfD,p,n,0.16,lod),triAlb(uRckD,p,n,0.22,lod),0.5)*0.42;
      nn=triNor(uClfN,p,n,0.16,lod,1.6);
    } else if(id<3.5){
      alb=triAlb(uRckD,p,n,0.35,lod)*0.62; nn=triNor(uRckN,p,n,0.35,lod,1.3);
    } else if(id<4.5){
      alb=triAlb(uRckD,p,n,0.3,lod)*0.45; nn=triNor(uRckN,p,n,0.3,lod,1.2);
      alb*=0.7+0.3*noise(p.xz*0.5);
    } else { alb=vec3(0.022,0.02,0.022); rough=0.9; }
    float ao=calcAO(p,n);
    // tunnel interior glows with the inferno
    float inTun=step(archSDF(p.xy),0.05)*smoothstep(0.5,4.0,p.z);
    // portal key light with soft shadows
    vec3 dl=gLp-p; float dd=length(dl); vec3 ld=dl/dd;
    float ndl=max(dot(nn,ld),0.0);
    float sh=ndl>0.0?softShadow(p+n*0.03,ld,dd-0.3,8.0):0.0;
    vec3 Lc=vec3(1.0,0.42,0.13)*gPortal*900.0/(4.0+dd*dd);
    col=alb*Lc*ndl*sh + Lc*specGGX(nn,v,ld,rough)*0.12*sh;
    // glow spilling out of the portal (unshadowed fill in front of the opening)
    vec3 sp=vec3(0.0,4.5,-3.0); vec3 sl=sp-p; float sd2=dot(sl,sl);
    col+=alb*vec3(1.0,0.38,0.12)*gPortal*700.0/(6.0+sd2)*max(dot(nn,normalize(sl)),0.0)*ao;
    // inferno bounce inside the tunnel, cold moon key with soft shadows, ambient
    col+=alb*vec3(1.0,0.35,0.1)*gPortal*inTun*0.6*ao;
    vec3 mL=normalize(vec3(-0.78,0.42,-0.46));       // raking blue key from the left
    float mdl=max(dot(nn,mL),0.0);
    float msh=mdl>0.0?softShadow(p+n*0.05,mL,60.0,10.0):0.0;
    col+=alb*vec3(0.30,0.40,0.58)*9.0*mdl*msh+vec3(0.3,0.4,0.6)*specGGX(nn,v,mL,rough)*0.6*msh;
    col+=alb*vec3(0.16,0.17,0.22)*ao;
    // inscription letters carved into the panel: dark glyphs that ignite left to right
    if(abs(p.y-19.95)<0.95 && abs(p.x)<10.4 && p.z>0.1){
      vec2 iu=vec2((10.0-p.x)/20.0,(p.y-19.4)/1.5);        // camera right is -x
      if(iu.x>0.0&&iu.x<1.0&&iu.y>0.0&&iu.y<1.0){
        float txt=texture(uTex0,iu).a;
        float burn=uP[2].y;
        float ign=smoothstep(burn,burn-0.06,iu.x);
        float flk=0.8+0.2*sin(uTime*17.0+iu.x*40.0)*sin(uTime*5.3);
        col*=1.0-txt*0.85;
        col+=fireCol(1.0)*txt*ign*flk*2.6;
        col+=vec3(1.0,0.5,0.15)*txt*smoothstep(0.05,0.0,abs(iu.x-burn))*6.0*step(burn,1.02);
        col+=vec3(1.0,0.45,0.12)*ign*0.18*exp(-pow((p.y-19.95)*1.2,2.0));
      }
    }
  } else {
    // beyond the tunnel: the inferno
    if(rd.z>0.0){
      float tz=(40.0-ro.z)/rd.z; vec3 pz=ro+rd*tz;
      col=inferno(pz.xy*0.45,uTime)*gPortal*1.2;
      depth=tz;
    }
    col+=vec3(0.012,0.012,0.018);
  }
  // volumetric haze lit by the portal + ash fog near the ground
  float tE=min(depth,120.0);
  float fogD=uP[3].z;
  float sc=inscatter(ro,rd,gLp,tE);
  float nz=0.6+0.8*fbm(vec2(dot(ro+rd*min(tE,20.0),vec3(0.1,0.05,0.0)),uTime*0.05),3);
  col+=vec3(1.0,0.42,0.13)*gPortal*sc*0.9*fogD*nz;
  float fogA=1.0-exp(-tE*0.010*fogD);
  col=mix(col,haze*0.25+vec3(0.01,0.008,0.01),fogA);
  // lantern of the small figure
  if(uP[2].z>0.5 && uP[3].w>0.0){
    vec3 lp=gWan+vec3(-0.32,0.72,-0.12);
    vec3 lo=lp-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc);
    if(tc<depth+0.3) col+=vec3(1.0,0.55,0.2)*uP[3].w*(exp(-h*h/(0.0004*tc*tc*0.01+0.0009))*3.0+inscatter(ro,rd,lp,tE)*0.02);
  }
  col+=vec3(1.0,0.5,0.2)*uP[3].y;
  fragColor=vec4(max(col,0.0),depth);
}`,
  init() { if (!SCENES.gate.tex) SCENES.gate.init(); },
  textures: () => Object.assign({ uTex0: SCENES.gate.tex }, TEX.bind({ uBlk: 'blocks', uClf: 'cliff', uRck: 'rock' })),
  pack(o) {
    const d = Object.assign({ ro: [0, 4, -60], fl: 1.6, ta: [0, 10, 0], roll: 0, portal: 1, burn: 0, wanOn: 1, wanZ: -9,
      vortex: 0.6, flare: 0, haze: 1, lantern: 1 }, o);
    return [...d.ro, d.fl, ...d.ta, d.roll, d.portal, d.burn, d.wanOn, d.wanZ, d.vortex, d.flare, d.haze, d.lantern];
  },
};
