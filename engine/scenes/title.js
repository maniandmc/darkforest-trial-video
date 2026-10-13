// TITLE — backdrop for the logo: smoke, radial light burst, shockwave from the final hit.
// P0 shock(time since hit), glow, rays, smoke | P1 centre.xy, ice, ember floor
'use strict';

SCENES.title = {
  frag: `
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  vec2 c=uP[1].xy; vec2 q=uv-c;
  float r=length(q); float a=atan(q.y,q.x);
  float t=uTime;
  float st=uP[0].x;
  // smoke
  float sm=fbm(uv*1.6+vec2(t*0.04,-t*0.03),6);
  float sm2=fbm(uv*3.5-vec2(t*0.06,t*0.02)+4.0,4);
  vec3 col=vec3(0.020,0.014,0.013)*(0.4+1.4*sm*sm2);
  vec3 warm=mix(vec3(1.0,0.32,0.08),vec3(0.5,0.75,1.0),uP[1].z);
  col+=warm*0.08*smoothstep(0.7,-0.6,uv.y)*sm*uP[1].w;
  // radial light rays from behind the emblem
  float rays=fbm3(vec3(cos(a)*3.0,sin(a)*3.0,t*0.3),4);
  rays=pow(sat(rays*1.4-0.3),3.0);
  col+=warm*rays*exp(-r*2.2)*uP[0].z*1.6;
  col+=warm*exp(-r*r*5.0)*uP[0].y*0.6;
  col+=vec3(1.0,0.85,0.7)*exp(-r*r*40.0)*uP[0].y*0.5;
  // shockwave ring
  if(st>0.0 && st<2.5){
    float R=st*1.15+st*st*0.2;
    float ring=exp(-pow((r-R)*14.0,2.0))*exp(-st*1.6);
    col+=warm*ring*5.0+vec3(1.0)*ring*1.5*exp(-st*4.0);
    col+=vec3(1.0,0.9,0.8)*exp(-st*11.0)*1.2;
  }
  col*=1.0-0.55*smoothstep(0.0,1.6,length(uv*vec2(0.8,1.4)))*uP[0].w;
  fragColor=vec4(col,1.0);
}`,
  pack(o) {
    const d = Object.assign({ shock: -1, glow: 1, rays: 1, vig: 1, c: [0, 0.02], ice: 0, floor: 1 }, o);
    return [d.shock, d.glow, d.rays, d.vig, ...d.c, d.ice, d.floor, ...Array(24).fill(0)];
  },
};
