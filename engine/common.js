// Shared GLSL: header, hashing, noise, SDF helpers.
'use strict';

const GLSL_HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uLT;
uniform vec4 uP[12];
uniform float uLow, uHigh, uLvl;
#define PI 3.14159265359
#define TAU 6.28318530718
`;

const GLSL_LIB = `
float sat(float x){ return clamp(x,0.0,1.0); }
vec3 sat(vec3 x){ return clamp(x,0.0,1.0); }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3 hash32(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y);
}
float noise3(vec3 p){
  vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.0-2.0*f);
  float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), f1=hash13(i+vec3(1,0,1)), g=hash13(i+vec3(0,1,1)), h=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,f1,u.x),mix(g,h,u.x),u.y), u.z);
}
float fbm(vec2 p, int oct){ float s=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<oct;i++){ s+=a*noise(p); p=m*p+3.1; a*=0.5; } return s; }
float fbm3(vec3 p, int oct){ float s=0.0, a=0.5; for(int i=0;i<oct;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
float ridged(vec2 p, int oct){ float s=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<oct;i++){ s+=a*(1.0-abs(noise(p)*2.0-1.0)); p=m*p+1.7; a*=0.5; } return s; }
vec2 voronoi(vec2 x){ // returns (F1 distance, edge distance)
  vec2 n=floor(x), f=fract(x); vec2 mg, mr; float md=8.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j); vec2 o=hash22(n+g); vec2 r=g+o-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; } }
  float ed=8.0;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ vec2 g=mg+vec2(i,j); vec2 o=hash22(n+g); vec2 r=g+o-f; if(dot(mr-r,mr-r)>0.00001) ed=min(ed, dot(0.5*(mr+r), normalize(r-mr))); }
  return vec2(sqrt(md), ed);
}
float smin(float a, float b, float k){ float h=sat(0.5+0.5*(b-a)/k); return mix(b,a,h)-k*h*(1.0-h); }
float smax(float a, float b, float k){ return -smin(-a,-b,k); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h)-r; }
float sdSeg2(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h); }
vec2 sdSeg2h(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return vec2(length(pa-ba*h), h); }
float sdBox2(vec2 p, vec2 b){ vec2 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,d.y),0.0); }
float sdEllipse2(vec2 p, vec2 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.0)/max(k1,1e-5); }
// quadratic bezier: returns (distance, t)
vec2 sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C){
  vec2 a=B-A, b=A-2.0*B+C, c=a*2.0, d=A-pos;
  float kk=1.0/max(dot(b,b),1e-6), kx=kk*dot(a,b), ky=kk*(2.0*dot(a,a)+dot(d,b))/3.0, kz=kk*dot(d,a);
  float p=ky-kx*kx, p3=p*p*p, q=kx*(2.0*kx*kx-3.0*ky)+kz, h=q*q+4.0*p3;
  float res, tt;
  if(h>=0.0){ h=sqrt(h); vec2 x=(vec2(h,-h)-q)/2.0; vec2 uv=sign(x)*pow(abs(x),vec2(1.0/3.0)); tt=sat(uv.x+uv.y-kx); vec2 r=d+(c+b*tt)*tt; res=dot(r,r); }
  else { float z=sqrt(-p); float v=acos(q/(p*z*2.0))/3.0; float m=cos(v), n=sin(v)*1.732050808; vec3 t3=clamp(vec3(m+m,-n-m,n-m)*z-kx,0.0,1.0);
    vec2 r1=d+(c+b*t3.x)*t3.x; float d1=dot(r1,r1); vec2 r2=d+(c+b*t3.y)*t3.y; float d2=dot(r2,r2);
    if(d1<d2){ res=d1; tt=t3.x; } else { res=d2; tt=t3.y; } }
  return vec2(sqrt(res), tt);
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba=b-a; float l2=dot(ba,ba); float rr=r1-r2; float a2=l2-rr*rr; float il2=1.0/l2;
  vec3 pa=p-a; float y=dot(pa,ba); float z=y-l2; vec3 xv=pa*l2-ba*y; float x2=dot(xv,xv); float y2=y*y*l2; float z2=z*z*l2;
  float k=sign(rr)*rr*rr*x2;
  if(sign(z)*a2*z2>k) return sqrt(x2+z2)*il2-r2;
  if(sign(y)*a2*y2<k) return sqrt(x2+y2)*il2-r1;
  return (sqrt(x2*a2*il2)+y*rr)*il2-r1;
}
// triplanar photo-material sampling (explicit LOD: safe inside non-uniform control flow)
vec3 triW(vec3 n){ vec3 w=pow(abs(n),vec3(4.0)); return w/(w.x+w.y+w.z); }
vec3 triAlb(sampler2D t, vec3 p, vec3 n, float s, float lod){
  vec3 w=triW(n);
  return textureLod(t,p.zy*s,lod).rgb*w.x+textureLod(t,p.xz*s,lod).rgb*w.y+textureLod(t,p.xy*s,lod).rgb*w.z;
}
float triH(sampler2D t, vec3 p, vec3 n, float s, float lod){
  vec3 w=triW(n);
  return textureLod(t,p.zy*s,lod).r*w.x+textureLod(t,p.xz*s,lod).r*w.y+textureLod(t,p.xy*s,lod).r*w.z;
}
vec3 triNor(sampler2D t, vec3 p, vec3 n, float s, float lod, float k){   // whiteout-blended normal map
  vec3 w=triW(n);
  vec3 tx=textureLod(t,p.zy*s,lod).xyz*2.0-1.0, ty=textureLod(t,p.xz*s,lod).xyz*2.0-1.0, tz=textureLod(t,p.xy*s,lod).xyz*2.0-1.0;
  tx.xy*=k; ty.xy*=k; tz.xy*=k;
  tx=vec3(tx.xy+n.zy,abs(tx.z)*n.x); ty=vec3(ty.xy+n.xz,abs(ty.z)*n.y); tz=vec3(tz.xy+n.xy,abs(tz.z)*n.z);
  return normalize(tx.zyx*w.x+ty.xzy*w.y+tz.xyz*w.z);
}
float sdBox3(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float sdEllip(vec3 p, vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.0)/max(k1,1e-5); }
float specGGX(vec3 n, vec3 v, vec3 l, float rough){
  vec3 h=normalize(v+l); float a=rough*rough; float a2=a*a;
  float nh=max(dot(n,h),0.0); float d=nh*nh*(a2-1.0)+1.0;
  return a2/(PI*d*d)*max(dot(n,l),0.0)*0.25;
}
// in-scattering of a point light along a ray segment [0,tEnd] (fog of unit density)
float inscatter(vec3 ro, vec3 rd, vec3 lp, float tEnd){
  vec3 lo=lp-ro; float tc=dot(lo,rd); float h=max(length(lo-rd*tc),0.05);
  return (atan((tEnd-tc)/h)-atan(-tc/h))/h;
}
vec3 aces(vec3 x){ return sat((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14)); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
// blackbody-ish ember palette, t in 0..1+
vec3 fireCol(float t){ t=max(t,0.0); return vec3(1.0,0.38,0.08)*t*1.6 + vec3(1.0,0.75,0.35)*pow(t,3.0)*1.2 + vec3(0.4,0.02,0.0)*sqrt(t)*0.6; }
// hooded wanderer silhouette, feet at origin, height ~1.8 (armUp: sword arm raised)
float cloaked2D(vec2 p, float armUp){
  float y=p.y;
  float wy=mix(0.42,0.25,smoothstep(0.0,1.25,y));
  float wind=0.07*(noise(vec2(y*3.5,uTime*1.3))-0.5)*(1.0-sat(y/1.3));
  float hem=0.05*noise(vec2(p.x*10.0,uTime*0.7));
  float body=max(abs(p.x-wind+0.04*(1.0-sat(y)))-wy, max(hem-y, y-1.32));
  float sh=sdEllipse2(p-vec2(0.0,1.27),vec2(0.27,0.13));
  float hood=sdEllipse2(p-vec2(0.0,1.50),vec2(0.12,0.17));
  float peak=sdSeg2(p,vec2(0.0,1.58),vec2(-0.05,1.83))-0.045;
  float d=smin(body,sh,0.10);
  d=smin(d,hood,0.09);
  d=smin(d,peak,0.06);
  if(armUp>0.5){
    vec2 sd=sdSeg2h(p,vec2(0.17,1.28),vec2(0.40,1.64));
    d=smin(d,sd.x-mix(0.08,0.045,sd.y),0.05);
  } else {
    vec2 sd=sdSeg2h(p,vec2(-0.20,1.25),vec2(-0.31,0.86));
    d=smin(d,sd.x-0.05,0.05);
  }
  return d;
}
// flames: upward-scrolling fbm field
float flameField(vec2 p, float t){ vec2 q=p; q.y-=t*1.2; float n=fbm(q*vec2(2.2,1.4)+vec2(0.0,t*0.3),5); n+=0.5*fbm(q*4.0-vec2(0,t*1.1),3); return n; }
`;
