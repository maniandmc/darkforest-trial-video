// FOREST (photoreal) — same layout/params as `forest`, upgraded for v3:
// photo-scanned bark/leaf-litter/mud materials (Poly Haven, CC0) with normal + height maps, bark displacement,
// moonlight soft shadows dappled by the canopy, lantern soft shadows, AO, specular, cloth folds, depth -> alpha (DOF).
'use strict';

SCENES.forestpr = {
  frag: `
uniform sampler2D uBarkD, uBarkN, uBarkH, uLeafD, uLeafN, uLeafH, uMudD, uMudN, uMudH;
const float CELL=3.2;
vec3 gL, gFog, gLight, gWan, gLan; float gWalk, gLanI, gYaw; float gT;
vec3 gBx, gBy;
float pathX(float z){ return 1.3*sin(z*0.07)+0.5*sin(z*0.19+1.3); }
float groundH(vec2 xz, float near){
  float pd=xz.x-pathX(xz.y);
  float h=0.3*noise(xz*0.3)+0.07*noise(xz*1.9)-0.12*exp(-pd*pd*0.5);
  if(near>0.0) h+=(textureLod(uLeafH,xz/2.2,2.0).r-0.5)*0.07*near;
  return h;
}
// tree cell info shared by SDF and shading
struct Tree { vec2 cid; vec2 c; float r0; float ok; };
Tree treeAt(vec3 p){
  Tree T; T.cid=floor(p.xz/CELL);
  vec2 h=hash22(T.cid);
  T.c=(T.cid+0.5)*CELL+(h-0.5)*1.1;
  T.ok=(abs(T.c.x-pathX(T.c.y))<1.8 || hash12(T.cid+3.3)<0.1)?0.0:1.0;
  T.r0=mix(0.13,0.40,hash12(T.cid+5.7)); if(hash12(T.cid+8.8)<0.12) T.r0*=1.8;
  return T;
}
vec2 barkUV(vec3 q, float r0, vec2 cid){
  float k=max(1.0,floor(TAU*r0/0.9+0.5));
  float a=atan(q.z,q.x);
  return vec2(a/TAU*k+hash12(cid+1.7), q.y/1.8+hash12(cid+2.9)*7.0);
}
// fallen, half-sunk mossy logs lying across some cells
float logD(vec3 p, vec2 cid){
  if(hash12(cid+6.1)>0.28) return 1e5;
  vec3 hl=hash32(cid+21.3);
  float ang=hl.x*PI; vec3 dir=vec3(cos(ang),0.0,sin(ang));
  vec3 c=vec3((cid.x+0.5)*CELL+(hl.y-0.5)*0.6,0.0,(cid.y+0.5)*CELL+(hl.z-0.5)*0.6);
  float rad=0.16+0.16*hash12(cid+4.7);
  c.y=groundH(c.xz,0.0)+rad*0.55;
  vec3 a=c-dir*1.15, b=c+dir*1.15;
  vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba));
  return length(pa-ba*h)-rad*(1.0-0.15*h)+0.03*noise(p.xz*7.0);
}
float treeD(vec3 p, out float border){
  vec2 cid=floor(p.xz/CELL);
  vec2 lc=p.xz-(cid+0.5)*CELL;
  border=min(CELL*0.5-abs(lc.x), CELL*0.5-abs(lc.y));
  Tree T=treeAt(p);
  if(T.ok<0.5) return 1e5;
  vec2 h=hash22(cid);
  vec3 q=p; q.xz-=T.c;
  vec2 lean=(hash22(cid+9.1)-0.5)*0.10;
  q.xz-=lean*q.y;
  float r0=T.r0;
  float y=q.y;
  float r=r0*(1.0+0.9*exp(-max(y,0.0)*2.0))*(0.45+0.55*smoothstep(19.0,7.0,y));
  float a=atan(q.z,q.x);
  r+=r0*(0.10*sin(a*6.0+y*0.7+h.x*20.0)+0.16*(noise(vec2(a*2.0+h.y*10.0,y*2.5))-0.5));
  float d0=length(q.xz)-r;
  if(d0<0.25 && gT<22.0) d0-=(textureLod(uBarkH,barkUV(q,r0,cid),2.0).r-0.5)*0.06;   // bark relief on silhouettes
  float d=d0;
  float top=hash12(cid+2.2)<0.15? 2.5+hash12(cid+4.4)*6.0 : 19.0;
  d=max(d,y-top+0.4*noise(vec2(a*3.0,0.0)));
  d=min(d,logD(p,cid));
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec3 hb=hash32(cid+fi*13.7+1.0);
    float by=2.6+hb.x*7.0+fi*1.5;
    float ba=hb.y*TAU;
    vec3 dir=normalize(vec3(cos(ba),0.7+hb.z*1.1,sin(ba)));
    vec3 a0=vec3(0.0,by,0.0);
    vec3 b0=a0+dir*(1.0+hb.z*0.7);
    vec3 pa=q-a0, ba3=b0-a0; float hh=sat(dot(pa,ba3)/dot(ba3,ba3));
    float bd=length(pa-ba3*hh)-r0*mix(0.32,0.06,hh);
    d=smin(d,bd,0.12);
  }
  return d;
}
float wanD(vec3 p){
  vec3 lp=p-gWan; lp.xz=rot(gYaw)*lp.xz;
  float bb=length(lp-vec3(0.0,0.95,0.0))-1.3;
  if(bb>0.3) return bb;
  vec3 q0=lp;
  q0.y-=0.03*abs(sin(gWalk*PI));
  float h=sat(q0.y/1.5);
  vec3 q=q0; q.z*=1.25;
  q.x-=0.05*sin(gWalk*PI+q0.y*2.0)*(1.0-h);
  float ang=atan(q.z,q.x);
  float rc=mix(0.36,0.17,pow(h,0.65));
  rc+=0.016*sin(ang*13.0+q0.y*2.5+gWalk*0.6)*(1.0-h*0.7)+0.008*sin(ang*29.0-q0.y*4.0);   // cloth folds
  float hem=0.07*noise(vec2(ang*3.0,gWalk*0.7))+0.02;
  float cloak=max(length(q.xz)-rc, max(hem-q0.y, q0.y-1.42));
  float sh=length((q0-vec3(0.0,1.36,0.0))*vec3(1.0,1.8,1.5))-0.22;
  float hood=sdRoundCone(q0,vec3(0.0,1.50,0.0),vec3(0.0,1.83,-0.13),0.155,0.012);
  hood+=0.006*sin(atan(q0.z,q0.x)*9.0+q0.y*20.0);
  float d=smin(cloak,sh,0.08); d=smin(d,hood,0.07);
  d=min(d, sdCapsule(q0,vec3(0.28,0.0,0.2),vec3(0.31,1.95,0.12),0.022));
  d=smin(d, sdCapsule(q0,vec3(-0.18,1.25,0.0),vec3(-0.30,0.86,0.13),0.05),0.05);
  float lan=sdBox2(vec2(length((q0-vec3(-0.32,0.68,0.14)).xz),q0.y-0.68),vec2(0.045,0.07))-0.01;
  d=min(d,lan);
  return d;
}
float mapAll(vec3 p, out float id){
  float b; float dt=treeD(p,b);
  float dg=p.y-groundH(p.xz, gT<15.0?1.0:0.0);
  float dw=uP[3].w>0.5?wanD(p):1e5;
  id=1.0; float d=dt;
  if(dg<d){ d=dg; id=2.0; }
  if(dw<d){ d=dw; id=3.0; }
  return d;
}
float mapS(vec3 p){ float id; return mapAll(p,id); }
vec3 calcN(vec3 p){
  float id; const vec2 k=vec2(1.0,-1.0); const float e=0.003;
  return normalize(k.xyy*mapAll(p+k.xyy*e,id)+k.yyx*mapAll(p+k.yyx*e,id)+k.yxy*mapAll(p+k.yxy*e,id)+k.xxx*mapAll(p+k.xxx*e,id));
}
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k, int steps){
  float res=1.0, t=tmin;
  for(int i=0;i<40;i++){
    if(i>=steps) break;
    vec3 p=ro+rd*t;
    float b; float h=min(treeD(p,b), p.y-groundH(p.xz,0.0));
    if(uP[3].w>0.5) h=min(h,wanD(p));
    res=min(res,k*h/t);
    t+=clamp(min(h,b+0.05),0.04,1.2);
    if(res<0.02 || t>tmax || p.y>20.0) break;
  }
  return sat(res);
}
float calcAO(vec3 p, vec3 n){
  float occ=0.0, sca=1.0;
  for(int i=0;i<5;i++){ float h=0.03+0.14*float(i); occ+=(h-mapS(p+n*h))*sca; sca*=0.75; }
  return sat(1.0-1.6*occ);
}
float canopy(vec3 p){
  vec2 g=vec2(dot(p,gBx),dot(p,gBy));
  return smoothstep(0.60,0.80,noise(g*0.42+vec2(uTime*0.03,0.0)))*(0.6+0.4*noise(g*1.7));
}
vec3 fogColor(vec3 rd){
  float m=max(dot(rd,gL),0.0);
  return gFog + gLight*uP[6].w*(pow(m,4.0)*0.10 + pow(m,24.0)*0.30 + pow(m,220.0)*0.9 + pow(m,3000.0)*1.5);
}
vec3 sky(vec3 rd){
  vec3 c=fogColor(rd);
  float m=dot(rd,gL);
  c+=gLight*smoothstep(1.0-uP[4].w*0.00035-0.00012, 1.0-uP[4].w*0.00035, m)*3.0*uP[6].w;
  if(rd.y>0.10){
    vec2 pp=rd.xz/rd.y*7.0;
    float tw=ridged(pp*0.35+vec2(3.0,1.0),6);
    float mask=smoothstep(0.70,0.86,tw)*smoothstep(0.10,0.40,rd.y);
    c*=1.0-mask*0.97;
  }
  return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  gL=normalize(uP[2].xyz); gFog=uP[5].rgb; gLight=uP[6].rgb;
  gWan=uP[3].xyz; gWalk=uP[4].x; gLanI=uP[4].y; gYaw=uP[4].z;
  gBx=normalize(cross(gL,vec3(0.0,0.0,1.0))); gBy=cross(gBx,gL);
  vec3 ro=uP[0].xyz, ta=uP[1].xyz;
  vec3 cw=normalize(ta-ro);
  float rl=uP[1].w;
  vec3 cu=normalize(cross(cw,vec3(sin(rl),cos(rl),0.0)));
  vec3 cv=cross(cu,cw);
  float fl=uP[0].w;
  vec3 rd=normalize(uv.x*cu+uv.y*cv+fl*cw);
  { vec3 lq=vec3(-0.32,0.68,0.14); lq.xz=rot(-gYaw)*lq.xz; gLan=gWan+lq; gLan.y+=0.03*abs(sin(gWalk*PI)); }
  if(uP[8].w>0.5) gLan=uP[8].xyz;

  float t=0.05, id=0.0, tmax=62.0;
  bool hit=false;
  for(int i=0;i<112;i++){
    vec3 p=ro+rd*t; gT=t;
    float b; float dt=treeD(p,b);
    float dg=p.y-groundH(p.xz, t<15.0?1.0:0.0);
    float dw=uP[3].w>0.5?wanD(p):1e5;
    float d=min(min(dt,dg),dw);
    if(d<0.0012*t){ hit=true; break; }
    t+=min(min(min(dt*0.9,b+0.05),dg*0.7),dw);
    if(t>tmax || (p.y>20.0 && rd.y>0.0)) break;
  }
  vec3 col;
  if(hit){
    vec3 p=ro+rd*t; gT=t; mapAll(p,id);
    vec3 n=calcN(p);
    vec3 v=-rd;
    float lod=log2(max(t*1100.0/(fl*uRes.y)/max(abs(dot(n,v)),0.25),1.0));   // texels per pixel footprint
    vec3 alb; float rough=0.8; float spec=0.04;
    if(id<1.5){
      Tree T=treeAt(p);
      vec3 q=p; q.xz-=T.c; vec2 lean=(hash22(T.cid+9.1)-0.5)*0.10; q.xz-=lean*q.y;
      vec2 buv=barkUV(q,T.r0,T.cid);
      alb=textureLod(uBarkD,buv,lod).rgb;
      vec3 nm=textureLod(uBarkN,buv,lod).xyz*2.0-1.0;
      float a=atan(q.z,q.x);
      vec3 Tg=normalize(vec3(-sin(a),0.0,cos(a))); vec3 Bt=vec3(0.0,1.0,0.0);
      Tg=normalize(Tg-n*dot(n,Tg)); Bt=normalize(cross(n,Tg));
      n=normalize(Tg*nm.x*1.3+Bt*nm.y*1.3+n*nm.z);
      alb*=0.42*vec3(0.95,0.95,1.0);
      rough=0.75;
    } else if(id<2.5){
      float pd=abs(p.x-pathX(p.z));
      float pm=smoothstep(1.05,0.55,pd+0.35*(noise(p.xz*1.3)-0.5));
      vec2 guv=p.xz/2.2;
      vec3 la=textureLod(uLeafD,guv,lod).rgb, ma=textureLod(uMudD,p.xz/2.6,lod).rgb;
      vec3 ln=textureLod(uLeafN,guv,lod).xyz*2.0-1.0, mn=textureLod(uMudN,p.xz/2.6,lod).xyz*2.0-1.0;
      alb=mix(la*vec3(0.72,0.70,0.64),ma*1.15,pm)*0.55;
      vec3 nt=mix(ln,mn,pm);
      n=normalize(n+vec3(nt.x,0.0,-nt.y)*1.6);
      rough=mix(0.85,0.55,pm); spec=mix(0.03,0.06,pm);
    } else {
      float fab=0.85+0.3*noise(p.xz*90.0+p.y*60.0)*noise(vec2(p.y*140.0,p.x*30.0));
      alb=vec3(0.026,0.024,0.027)*fab; rough=0.9;
    }
    float ao=calcAO(p,n);
    vec3 pn=p+n*0.02;
    // ambient sky/fog light
    col=alb*gFog*(0.55+0.45*n.y)*2.2*ao;
    // moon: soft shadows through the trunks, dappled by the canopy
    float ndl=max(dot(n,gL),0.0);
    float sh=ndl>0.0? softShadow(pn,gL,0.05,18.0,10.0,28):0.0;
    float gap=mix(0.10,1.0,canopy(p));
    vec3 moon=gLight*uP[6].w*1.25*sh*gap;
    col+=alb*moon*ndl + moon*specGGX(n,v,gL,rough)*spec*8.0;
    float rim=pow(1.0-abs(dot(n,rd)),3.0)*smoothstep(-0.3,0.7,dot(n,gL));
    col+=gLight*rim*(id>2.5?0.4:0.08)*uP[6].w*exp(-t*0.02)*ao;
    // lantern: warm point light with its own soft shadows
    if(gLanI>0.0){
      vec3 dl=gLan-p; float d2=dot(dl,dl); float dd=sqrt(d2); vec3 ld=dl/dd;
      float lf=max(dot(n,ld),0.0);
      if(lf>0.0 && d2<60.0){
        float ls=softShadow(pn,ld,0.06,dd-0.12,7.0,20);
        vec3 lc=vec3(1.0,0.5,0.18)*gLanI*9.0/(0.2+d2*1.2);
        col+=(alb*lf+specGGX(n,v,ld,rough)*spec*6.0)*lc*ls;
      }
    }
  } else { t=tmax; col=sky(rd); }
  float depth=hit?t:500.0;
  // fog
  float fd=uP[2].w;
  float fogA=1.0-exp(-t*fd);
  float hb=0.55;
  float hf=uP[5].w*exp(-ro.y*hb)*(1.0-exp(-t*rd.y*hb))/(abs(rd.y)>1e-3?rd.y*hb:1e-3*hb);
  if(abs(rd.y)<1e-3) hf=uP[5].w*exp(-ro.y*hb)*t;
  float fa=sat(fogA+hf*0.12);
  if(hit) col=mix(col,fogColor(rd),fa);
  else col=mix(col,fogColor(rd),sat(hf*0.05));
  // volumetric canopy shafts
  if(uP[5].w>0.0){
    float tEnd=min(hit?t:tmax,48.0);
    float stp=tEnd/22.0;
    float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
    float shs=0.0;
    for(int i=0;i<22;i++){
      float ts=(float(i)+jit)*stp; vec3 sp=ro+rd*ts;
      shs+=canopy(sp)*exp(-ts*0.045)*smoothstep(-0.2,1.5,sp.y);
    }
    float m=max(dot(rd,gL),0.0);
    col+=gLight*shs*stp*(0.010+0.05*pow(m,6.0))*uP[6].w*uP[5].w*2.0;
  }
  // drifting ground-mist sheets
  for(int k=0;k<3;k++){
    float hy=0.25+float(k)*0.45;
    float tp=(hy-ro.y)/rd.y;
    if(tp>0.0 && tp<(hit?t:tmax)){
      vec3 mp=ro+rd*tp;
      float nn=fbm(mp.xz*vec2(0.22,0.12)+vec2(uTime*0.10+float(k)*3.1,uTime*0.03),4);
      float m=smoothstep(0.45,0.85,nn)*exp(-tp*0.035)*(1.0-float(k)*0.25);
      col+=fogColor(rd)*m*0.55*uP[5].w;
    }
  }
  // lantern in-scattering halo
  if(gLanI>0.0){
    vec3 lo=gLan-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc); h=max(h,0.02);
    float tEnd=hit?t:tmax;
    float sc=(atan((tEnd-tc)/h)-atan((0.0-tc)/h))/h;
    float fl2=0.85+0.15*sin(uTime*23.0)*sin(uTime*7.3);
    col+=vec3(1.0,0.48,0.16)*gLanI*fl2*(sc*0.012*(uP[8].w>0.5?uP[9].x:1.0) + (tc<tEnd+0.1? exp(-h*h/0.0004)*2.5:0.0));
  }
  // eyes in the dark
  if(uP[7].w>0.0){
    vec3 ep=uP[7].xyz; vec3 side=normalize(cross(vec3(0.0,1.0,0.0),ep-ro))*0.09;
    for(int k=0;k<2;k++){
      vec3 e=ep+side*(float(k)*2.0-1.0);
      vec3 lo=e-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc);
      if(tc>0.0 && (!hit || tc<t+0.2)){
        float a=h/tc;
        col+=vec3(1.0,0.12,0.03)*uP[7].w*(exp(-a*a/0.0000035)*6.0+exp(-a*a/0.00006)*0.6);
      }
    }
  }
  fragColor=vec4(col,depth);
}`,
  textures: () => TEX.bind({ uBark: 'bark', uLeaf: 'leaves', uMud: 'mud' }),
};
SCENES.forestpr.pack = SCENES.forest.pack;
