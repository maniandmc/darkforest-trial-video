// EYE — extreme close-up of a creature eye opening in the dark.
// P0 open, pupil, zoom, tilt | P1 look.xy, glow, lidBurn | P2 centre.xy, hue(0 gold..1 blood), reflection
'use strict';

SCENES.eye = {
  frag: `
float upperLid(float x, float o){ float k=sat(1.0-pow(abs(x)/0.95,2.0)); return o*0.40*pow(k,0.85)-0.03+0.05*(1.0-o)*k; }
float lowerLid(float x, float o){ float k=sat(1.0-pow(abs(x)/0.95,2.0)); return -o*0.28*pow(k,1.1)-0.03; }
vec3 skin(vec2 p, float glowAmt, vec2 eyeC){
  vec2 v=voronoi(p*vec2(7.0,9.0));
  float sc=smoothstep(0.0,0.10,v.y);
  vec2 v2=voronoi(p*vec2(18.0,22.0)+3.0);
  float h=fbm(p*6.0,4);
  vec3 base=mix(vec3(0.05,0.04,0.038),vec3(0.13,0.10,0.085),h)*(0.25+0.75*sc)*(0.6+0.4*smoothstep(0.0,0.15,v2.y));
  // light from the glowing eye (falls off from the opening)
  float d=length((p-eyeC)*vec2(0.8,1.6));
  vec3 warm=vec3(1.0,0.35,0.08)*glowAmt*exp(-d*2.4);
  vec3 col=base*(0.25+warm*4.0)+warm*0.04*sc;
  // cold rim from above (moonlight grazing the scales)
  col+=base*vec3(0.5,0.65,0.9)*smoothstep(0.0,0.6,p.y)*0.9;
  // bevel highlight on scale tops
  col+=vec3(0.5,0.6,0.75)*0.05*smoothstep(0.05,0.0,abs(v.x-0.25))*sc;
  // ember cracks between scales
  float crack=(1.0-smoothstep(0.0,0.035,v.y))*smoothstep(0.55,0.75,fbm(p*3.0+uTime*0.05,3));
  col+=fireCol(0.7)*crack*uP[1].w*(0.6+0.4*sin(uTime*3.0+p.x*10.0));
  return col;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  uv-=uP[2].xy;
  uv=rot(uP[0].w)*uv/uP[0].z;
  float o=uP[0].x;
  float yu=upperLid(uv.x,o), yl=lowerLid(uv.x,o);
  vec2 eyeC=vec2(0.0,(yu+yl)*0.5);
  vec3 col;
  float inside=step(yl,uv.y)*step(uv.y,yu);
  float edgeD=min(yu-uv.y,uv.y-yl);
  // eyeball
  vec2 look=uP[1].xy;
  float R=0.62; vec2 bp=uv; float rr=length(bp);
  float bz=sqrt(max(R*R-rr*rr,0.0))/R;
  vec2 ip=uv-look; float r=length(ip); float a=atan(ip.y,ip.x);
  float RI=0.30; float ri=r/RI;
  // sclera
  float veins=smoothstep(0.82,0.97,ridged(uv*vec2(7.0,9.0)+11.0,5))*smoothstep(0.9,1.4,ri);
  vec3 scl=mix(vec3(0.20,0.075,0.04),vec3(0.07,0.02,0.015),smoothstep(0.2,0.75,length(uv*vec2(1.0,1.6))));
  scl=mix(scl,vec3(0.35,0.03,0.02),veins*0.8);
  scl*=0.35+0.65*bz;
  // iris
  vec3 hue0=mix(vec3(1.9,0.85,0.18),vec3(1.9,0.30,0.08),uP[2].z);
  vec3 hue1=mix(vec3(1.0,0.22,0.03),vec3(0.8,0.06,0.02),uP[2].z);
  vec3 hue2=mix(vec3(0.45,0.06,0.02),vec3(0.30,0.02,0.02),uP[2].z);
  float fib=fbm3(vec3(cos(a)*9.0,sin(a)*9.0,ri*2.2+uTime*0.05),5);
  float fib2=noise3(vec3(cos(a)*30.0,sin(a)*30.0,ri*1.5));
  vec3 ic=mix(hue0,hue1,smoothstep(0.25,0.6,ri+0.25*(fib-0.5)));
  ic=mix(ic,hue2,smoothstep(0.6,0.95,ri+0.2*(fib-0.5)));
  ic*=0.25+1.5*fib*fib*fib+0.35*fib2*fib;
  float coll=exp(-pow((ri-0.48-0.06*sin(a*14.0+fib*4.0))*14.0,2.0));
  ic+=hue0*coll*0.6;
  vec2 crypt=voronoi(vec2(a*6.0/PI,ri*4.0));
  ic*=0.7+0.3*smoothstep(0.0,0.2,crypt.x);
  ic*=uP[1].z;
  float limb=smoothstep(0.86,1.02,ri);
  ic=mix(ic,vec3(0.01,0.0,0.0),limb);
  // slit pupil
  float pw=uP[0].y;
  float py=0.28; float yy=sat(1.0-pow(ip.y/py,2.0));
  float slitW=pw*pow(yy,0.9);
  float pupil=smoothstep(slitW+0.006,slitW-0.004,abs(ip.x))*step(abs(ip.y),py);
  vec3 pc=vec3(0.006,0.0,0.0)+vec3(0.25,0.02,0.0)*exp(-abs(ip.x)/(slitW+0.01)*2.0)*0.3;
  float irisM=smoothstep(1.02,0.98,ri);
  vec3 ball=mix(scl,ic,irisM);
  ball=mix(ball,pc,pupil*irisM);
  // highlights: arched window + lantern spark
  vec2 hp=uv-vec2(-0.16,0.10);
  float arc=abs(length((uv-look)*vec2(1.0,1.15))-0.23);
  float win=exp(-arc*arc/0.0002)*smoothstep(0.0,0.12,-(uv.x-look.x)-0.02)*smoothstep(-0.05,0.12,uv.y-look.y)*0.45;
  win+=exp(-dot(hp,hp)/0.0012)*0.35;
  float spark=exp(-dot(uv-vec2(0.13,-0.06),uv-vec2(0.13,-0.06))/0.00012);
  ball+=vec3(0.75,0.85,1.0)*win*bz + vec3(1.0,0.6,0.25)*spark*2.0*uP[2].w;
  ball+=vec3(0.7,0.8,1.0)*0.06*pow(1.0-bz,3.0);
  // shadow of the upper lid
  ball*=smoothstep(-0.01,0.09,yu-uv.y)*0.85+0.15;
  // wet lid margin
  float margin=exp(-edgeD*edgeD/0.00018)*inside;
  vec3 sk=skin(uv,o*uP[1].z,eyeC);
  float rimOut=exp(-pow(max(-edgeD,0.0),2.0)/0.0006)*(1.0-inside);
  col=mix(sk,ball,inside);
  col+=vec3(0.9,0.5,0.3)*margin*0.18*o;
  col+=vec3(1.0,0.35,0.1)*rimOut*0.25*o*uP[1].z;
  // eye glow spill
  col+=vec3(1.0,0.3,0.06)*exp(-length((uv-eyeC)*vec2(0.6,1.4))*2.6)*0.06*o*uP[1].z;
  // vignette darkness
  col*=smoothstep(1.6,0.3,length(uv*vec2(0.7,1.2)));
  fragColor=vec4(col,1.0);
}`,
  pack(o) {
    const d = Object.assign({ open: 1, pupil: 0.06, zoom: 1, tilt: 0, look: [0, 0], glow: 1, burn: 0.3, c: [0, 0], hue: 0, refl: 1 }, o);
    return [d.open, d.pupil, d.zoom, d.tilt, ...d.look, d.glow, d.burn, ...d.c, d.hue, d.refl, ...Array(20).fill(0)];
  },
};
