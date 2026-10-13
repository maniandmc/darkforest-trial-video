// FOREST — raymarched dead forest, moon backlight through fog, wanderer with lantern, watching eyes.
// P0 ro.xyz, focal | P1 target.xyz, roll | P2 L.xyz, fog density | P3 wanderer.xyz, on
// P4 walk, lantern, yaw, moon | P5 fog rgb, height fog | P6 light rgb, back intensity | P7 eyes.xyz, eye intensity
'use strict';

SCENES.forest = {
  frag: `
const float CELL=3.2;
vec3 gL, gFog, gLight, gWan, gLan; float gWalk, gLanI, gYaw;
float pathX(float z){ return 1.3*sin(z*0.07)+0.5*sin(z*0.19+1.3); }
float groundH(vec2 xz){
  float pd=xz.x-pathX(xz.y);
  return 0.3*noise(xz*0.3)+0.07*noise(xz*1.9)-0.12*exp(-pd*pd*0.5);
}
float treeD(vec3 p, out float border){
  vec2 cid=floor(p.xz/CELL);
  vec2 lc=p.xz-(cid+0.5)*CELL;
  border=min(CELL*0.5-abs(lc.x), CELL*0.5-abs(lc.y));
  vec2 h=hash22(cid);
  vec2 c=(cid+0.5)*CELL+(h-0.5)*1.1;
  if(abs(c.x-pathX(c.y))<1.8 || hash12(cid+3.3)<0.1) return 1e5;
  vec3 q=p; q.xz-=c;
  vec2 lean=(hash22(cid+9.1)-0.5)*0.10;
  q.xz-=lean*q.y;
  float r0=mix(0.13,0.40,hash12(cid+5.7));
  if(hash12(cid+8.8)<0.12) r0*=1.8;
  float y=q.y;
  float r=r0*(1.0+0.9*exp(-max(y,0.0)*2.0))*(0.45+0.55*smoothstep(19.0,7.0,y));
  float a=atan(q.z,q.x);
  r+=r0*(0.10*sin(a*6.0+y*0.7+h.x*20.0)+0.16*(noise(vec2(a*2.0+h.y*10.0,y*2.5))-0.5));
  float d=length(q.xz)-r;
  float top=hash12(cid+2.2)<0.15? 2.5+hash12(cid+4.4)*6.0 : 19.0;
  d=max(d,y-top+0.4*noise(vec2(a*3.0,0.0)));
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
  float rc=mix(0.36,0.17,pow(h,0.65));
  float hem=0.07*noise(vec2(atan(q.z,q.x)*3.0,gWalk*0.7))+0.02;
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
  float dg=p.y-groundH(p.xz);
  float dw=uP[3].w>0.5?wanD(p):1e5;
  id=1.0; float d=dt;
  if(dg<d){ d=dg; id=2.0; }
  if(dw<d){ d=dw; id=3.0; }
  return d;
}
vec3 calcN(vec3 p){
  float id; const vec2 k=vec2(1.0,-1.0); const float e=0.003;
  return normalize(k.xyy*mapAll(p+k.xyy*e,id)+k.yyx*mapAll(p+k.yyx*e,id)+k.yxy*mapAll(p+k.yxy*e,id)+k.xxx*mapAll(p+k.xxx*e,id));
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
  vec3 ro=uP[0].xyz, ta=uP[1].xyz;
  vec3 cw=normalize(ta-ro);
  float rl=uP[1].w;
  vec3 cu=normalize(cross(cw,vec3(sin(rl),cos(rl),0.0)));
  vec3 cv=cross(cu,cw);
  vec3 rd=normalize(uv.x*cu+uv.y*cv+uP[0].w*cw);
  { vec3 lq=vec3(-0.32,0.68,0.14); lq.xz=rot(-gYaw)*lq.xz; gLan=gWan+lq; gLan.y+=0.03*abs(sin(gWalk*PI)); }

  float t=0.05, id=0.0, tmax=62.0;
  bool hit=false;
  for(int i=0;i<104;i++){
    vec3 p=ro+rd*t;
    float b; float dt=treeD(p,b);
    float dg=p.y-groundH(p.xz);
    float dw=uP[3].w>0.5?wanD(p):1e5;
    float d=min(min(dt,dg),dw);
    if(d<0.0015*t){ hit=true; break; }
    t+=min(min(min(dt,b+0.05),dg*0.75),dw);
    if(t>tmax || (p.y>20.0 && rd.y>0.0)) break;
  }
  vec3 col;
  if(hit){
    vec3 p=ro+rd*t; mapAll(p,id);
    vec3 n=calcN(p);
    vec3 alb=vec3(0.05,0.046,0.042);
    if(id>1.5 && id<2.5){
      float pd=abs(p.x-pathX(p.z));
      alb=mix(vec3(0.035,0.04,0.03),vec3(0.06,0.055,0.05),fbm(p.xz*1.3,3));
      alb=mix(alb*1.5,alb,smoothstep(0.4,1.3,pd));
    }
    if(id>2.5) alb=vec3(0.018,0.017,0.02);
    if(id<1.5){ alb*=0.6+0.8*fbm(vec2(atan(n.z,n.x)*3.0,p.y*3.0)+p.xz,3); }
    col=alb*gFog*(0.6+0.6*n.y)*2.5;
    float dif=max(dot(n,gL),0.0);
    col+=alb*gLight*dif*0.8*uP[6].w;
    float rim=pow(1.0-abs(dot(n,rd)),3.0)*smoothstep(-0.3,0.7,dot(n,gL));
    col+=gLight*rim*(id>2.5?0.55:0.18)*uP[6].w*exp(-t*0.02);
    if(gLanI>0.0){
      vec3 dl=gLan-p; float d2=dot(dl,dl);
      float lf=max(dot(n,normalize(dl)),0.0);
      col+=alb*vec3(1.0,0.5,0.18)*gLanI*lf/(0.2+d2*1.2)*9.0;
      if(id>2.5) col+=vec3(1.0,0.45,0.15)*gLanI*0.05*lf/(0.1+d2*4.0);
    }
  } else { t=tmax; col=sky(rd); }
  // fog
  float fd=uP[2].w;
  float fogA=1.0-exp(-t*fd);
  float hb=0.55;
  float hf=uP[5].w*exp(-ro.y*hb)*(1.0-exp(-t*rd.y*hb))/(abs(rd.y)>1e-3?rd.y*hb:1e-3*hb);
  if(abs(rd.y)<1e-3) hf=uP[5].w*exp(-ro.y*hb)*t;
  float fa=sat(fogA+hf*0.12);
  if(hit) col=mix(col,fogColor(rd),fa);
  else col=mix(col,fogColor(rd),sat(hf*0.05));
  // volumetric canopy shafts: gobo pattern projected along the light direction
  if(uP[5].w>0.0){
    vec3 bx=normalize(cross(gL,vec3(0.0,0.0,1.0))); vec3 by=cross(bx,gL);
    float tEnd=min(hit?t:tmax,48.0);
    float stp=tEnd/22.0;
    float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
    float sh=0.0;
    for(int i=0;i<22;i++){
      float ts=(float(i)+jit)*stp; vec3 sp=ro+rd*ts;
      vec2 g=vec2(dot(sp,bx),dot(sp,by));
      float gap=smoothstep(0.60,0.80,noise(g*0.42+vec2(uTime*0.03,0.0)))*(0.6+0.4*noise(g*1.7));
      sh+=gap*exp(-ts*0.045)*smoothstep(-0.2,1.5,sp.y);
    }
    float m=max(dot(rd,gL),0.0);
    col+=gLight*sh*stp*(0.010+0.05*pow(m,6.0))*uP[6].w*uP[5].w*2.0;
  }
  // drifting ground-mist sheets
  for(int k=0;k<3;k++){
    float hy=0.25+float(k)*0.45;
    float tp=(hy-ro.y)/rd.y;
    if(tp>0.0 && tp<(hit?t:tmax)){
      vec3 mp=ro+rd*tp;
      float n=fbm(mp.xz*vec2(0.22,0.12)+vec2(uTime*0.10+float(k)*3.1,uTime*0.03),4);
      float m=smoothstep(0.45,0.85,n)*exp(-tp*0.035)*(1.0-float(k)*0.25);
      col+=fogColor(rd)*m*0.55*uP[5].w;
    }
  }
  // lantern: core + in-scattering halo
  if(gLanI>0.0){
    vec3 lo=gLan-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc); h=max(h,0.02);
    float tEnd=hit?t:tmax;
    float sc=(atan((tEnd-tc)/h)-atan((0.0-tc)/h))/h;
    float fl=0.85+0.15*sin(uTime*23.0)*sin(uTime*7.3);
    col+=vec3(1.0,0.48,0.16)*gLanI*fl*(sc*0.012 + (tc<tEnd+0.1? exp(-h*h/0.0004)*2.5:0.0));
  }
  // eyes in the dark
  if(uP[7].w>0.0){
    vec3 ep=uP[7].xyz; vec3 side=normalize(cross(vec3(0.0,1.0,0.0),ep-ro))*0.09;
    for(int k=0;k<2;k++){
      vec3 e=ep+side*(float(k)*2.0-1.0);
      vec3 lo=e-ro; float tc=dot(lo,rd); float h=length(lo-rd*tc);
      if(!hit || tc<t+0.2){
        float a=h/tc;
        col+=vec3(1.0,0.12,0.03)*uP[7].w*(exp(-a*a/0.0000035)*6.0+exp(-a*a/0.00006)*0.6);
      }
    }
  }
  fragColor=vec4(col,1.0);
}`,
};

SCENES.forest.pack = function (o) {
  const d = Object.assign({
    ro: [0, 1.6, 0], fl: 1.6, ta: [0, 1.6, 10], roll: 0,
    L: [0.10, 0.40, 1], fog: 0.03, wan: [0, 0, 6], wanOn: 0, walk: 0, lantern: 0, yaw: 0, moon: 1,
    fogCol: [0.045, 0.06, 0.075], hfog: 0.5, lightCol: [0.62, 0.72, 0.88], back: 1, eyes: [0, 1.5, 20], eyeI: 0,
  }, o);
  return [...d.ro, d.fl, ...d.ta, d.roll, ...d.L, d.fog, ...d.wan, d.wanOn, d.walk, d.lantern, d.yaw, d.moon,
    ...d.fogCol, d.hfog, ...d.lightCol, d.back, ...d.eyes, d.eyeI];
};
SCENES.forest.pathX = z => 1.3 * Math.sin(z * 0.07) + 0.5 * Math.sin(z * 0.19 + 1.3);

// project a world direction to screen texcoords for the shaft pass
SCENES.forest.project = function (o, dir) {
  const d = Object.assign({ ro: [0, 1.6, 0], ta: [0, 1.6, 10], fl: 1.6, roll: 0, L: [0.10, 0.40, 1] }, o);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cw = norm(sub(d.ta, d.ro));
  const cu = norm(cross(cw, [Math.sin(d.roll), Math.cos(d.roll), 0]));
  const cv = cross(cu, cw);
  const L = norm(dir || d.L);
  const z = dot(L, cw);
  const x = d.fl * dot(L, cu) / z, y = d.fl * dot(L, cv) / z;
  return [x * 1080 / 1920 + 0.5, y + 0.5];
};
