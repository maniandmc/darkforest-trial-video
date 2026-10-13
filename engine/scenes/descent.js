// DESCENT — falling down the axis of Dante's funnel: self-similar terraced circles, fires on the ledges.
// P0 progress(levels), spin, focal, fire | P1 vp.xy, haze, ringGlow | P2 ice, flash, -, -
'use strict';

SCENES.descent = {
  frag: `
vec2 voronoiP(vec2 x, float per){
  vec2 n=floor(x), f=fract(x); float md=8.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j); vec2 c=n+g; c.x=mod(c.x,per); vec2 o=hash22(c); vec2 r=g+o-f; md=min(md,dot(r,r)); }
  return vec2(sqrt(md),0.0);
}
const float Q=0.62;      // radius/height shrink per level
const float R0=6.0;
const float H0=3.2;
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  uv-=uP[1].xy;
  float prog=uP[0].x;
  float f=fract(prog); float L0=floor(prog);
  float spin=uP[0].y;
  float h=length(uv)/uP[0].z;
  float phi=atan(uv.y,uv.x)+spin;
  float zs=H0/(1.0-Q);
  float z0=-0.6*H0;
  float zc=zs-(zs-z0)*pow(Q,f);
  vec3 col=vec3(0.0);
  float ice=uP[2].x;
  vec3 fireA=mix(vec3(1.0,0.36,0.08),vec3(0.35,0.7,1.0),ice);
  vec3 fireB=mix(vec3(1.0,0.75,0.4),vec3(0.75,0.9,1.0),ice);
  bool done=false;
  float hitLevel=12.0;
  for(int i=0;i<12;i++){
    float fi=float(i);
    float Ri=R0*pow(Q,fi), Rn=Ri*Q;
    float Di=zs*(1.0-pow(Q,fi)), Dn=zs*(1.0-pow(Q,fi+1.0));
    float sc=pow(Q,fi);
    float lvl=L0+fi;                     // absolute level index for variety
    float zw=zc+Ri/max(h,1e-4);
    float rel=fi-f;                      // depth in levels relative to camera
    float glow=uP[0].w*(0.25+0.22*rel*rel);
    if(zw<=Dn){
      // wall
      float ang=phi*Ri/sc; float zz=(zw-Di)/sc;
      vec2 tc=vec2(phi*6.0,zz*1.2);
      vec2 cs=vec2(cos(phi),sin(phi));
      float rock=fbm3(vec3(cs*1.6,zz*2.0+lvl*7.3),5);
      float strata=0.6+0.4*smoothstep(0.3,0.7,noise3(vec3(cs*0.4,zz*6.0+lvl)));
      vec3 alb=vec3(0.05,0.035,0.03)*(0.4+1.1*rock)*strata;
      float down=smoothstep(0.0,1.0,(zw-Di)/(Dn-Di));
      col=alb*fireA*glow*(0.6+3.0*down*down)*2.2;
      // crevices with heat
      float cr=smoothstep(0.08,0.0,abs(noise3(vec3(cs*3.0,zz*3.0+lvl*3.1))-0.5));
      col+=fireA*cr*0.35*glow*down;
      hitLevel=rel; done=true; break;
    }
    float rr=h*(Dn-zc);
    if(rr>=Rn){
      // ledge (floor of level i, from Rn to Ri)
      float u=(rr-Rn)/(Ri-Rn);           // 0 at the inner lip, 1 at the wall
      vec2 cs=vec2(cos(phi),sin(phi));
      float st=fbm3(vec3(cs*2.5,u*4.0+lvl*5.1),4);
      vec3 alb=vec3(0.06,0.045,0.035)*(0.5+st);
      col=alb*fireA*glow*(0.5+0.8*(1.0-u));
      // bonfires along the ledge
      float phiW=mod(phi,TAU);
      float sg=floor(phiW/TAU*18.0);
      float fa=(sg+0.5)/18.0*TAU;
      float hs=hash11(mod(sg+lvl*3.0,18.0)+lvl*31.0);
      float dphi=abs(mod(phiW-fa+PI,TAU)-PI)*Ri/sc;
      float du=abs(u-(0.25+0.5*hs));
      float fire=exp(-(dphi*dphi*40.0+du*du*400.0))*step(0.35,hs);
      float fl=0.7+0.3*sin(uTime*13.0+hs*50.0);
      // tiny souls: dark specks crowding the ledge, lit by the fires
      float per=220.0;
      vec2 sp=vec2(fract((phi+uTime*0.03)/TAU)*per,u*9.0+lvl*11.0);
      vec2 sv=voronoiP(sp,per);
      vec2 sc2=floor(sp); sc2.x=mod(sc2.x,per);
      float soul=smoothstep(0.20,0.12,sv.x)*step(0.5,hash12(sc2+lvl))*smoothstep(0.05,0.2,u)*smoothstep(0.95,0.7,u);
      col=mix(col,vec3(0.0),soul*0.85);
      col+=fireB*fire*fl*3.0*(0.6+0.4*rel);
      col+=fireA*exp(-(dphi*dphi*4.0+du*du*30.0))*step(0.35,hs)*0.25*fl;
      // glowing lip of the circle
      float lip=exp(-u*u/0.0025);
      col+=fireA*lip*uP[1].w*glow*0.9;
      hitLevel=rel; done=true; break;
    }
  }
  if(!done){
    float r=h;
    col=fireB*uP[0].w*3.0+fireA*uP[0].w*2.0*fbm(vec2(phi*3.0,uTime),3);
    hitLevel=12.0;
  }
  // depth haze: deeper levels sink into the glow
  vec3 haze=fireA*0.35*uP[0].w;
  col=mix(col,haze,sat(1.0-exp(-max(hitLevel,0.0)*uP[1].z)));
  // heat shimmer / smoke wisps spiralling
  float sm=fbm3(vec3(cos(phi+uTime*0.4)*1.5,sin(phi+uTime*0.4)*1.5,log(h+0.02)*3.0-uTime*0.8),4);
  col*=0.75+0.5*smoothstep(0.3,0.8,sm);
  col+=vec3(1.0,0.9,0.8)*uP[2].y;
  fragColor=vec4(col,1.0);
}`,
  pack(o) {
    const d = Object.assign({ prog: 0, spin: 0, focal: 0.9, fire: 1, vp: [0, 0], haze: 0.28, ring: 1, ice: 0, flash: 0 }, o);
    return [d.prog, d.spin, d.focal, d.fire, ...d.vp, d.haze, d.ring, d.ice, d.flash, 0, 0, ...Array(20).fill(0)];
  },
};
