// GATE — colossal gothic portal carved in a cliff; inferno vortex inside; burning inscription above.
// P0 cam.xy, viewHeight, roll | P1 portal, burn, wanderer on, wanderer x | P2 vortex speed, flare, smoke, lantern
'use strict';

SCENES.gate = {
  frag: `
uniform sampler2D uTex0;
float archOpen(vec2 p){ // signed distance-ish to opening (negative inside)
  float a=2.2, R=4.0+a;
  float rect=sdBox2(p-vec2(0.0,6.0),vec2(4.0,6.0));
  float c1=length(p-vec2(-a,12.0))-R, c2=length(p-vec2(a,12.0))-R;
  float arch=max(max(c1,c2),12.0-p.y);
  return min(rect,arch);
}
vec3 inferno(vec2 p, float t){
  vec2 vp=vec2(0.0,4.0);
  vec2 q=p-vp; float r=length(q); float a=atan(q.y,q.x);
  float z=1.0/(r+0.35);
  float zz=z*2.5+t*uP[2].x;
  float f=fbm3(vec3(cos(a)*1.6,sin(a)*1.6,zz),5);
  float f2=fbm3(vec3(cos(a)*3.2,sin(a)*3.2,zz*3.0+3.0),4);
  float heat=smoothstep(0.35,0.9,f*0.8+f2*0.4)*(0.4+0.6*exp(-r*0.18));
  vec3 c=fireCol(heat*1.15)*1.1;
  float smoke=smoothstep(0.35,0.75,fbm(p*0.35+vec2(t*0.08,-t*0.15),5));
  c*=0.25+0.75*smoke;
  c+=vec3(1.0,0.40,0.10)*exp(-r*0.6)*0.9;
  c+=vec3(1.0,0.80,0.55)*exp(-r*2.2)*1.4;
  // jagged rock silhouettes inside
  float rocks=p.y-(1.2+1.6*abs(fbm(vec2(p.x*0.5,1.0),4)-0.5)*4.0)*(0.4+0.6*smoothstep(0.0,4.0,abs(p.x)));
  float rk=smoothstep(-0.05,0.05,rocks);
  vec3 rockC=vec3(0.02,0.012,0.01)+vec3(1.0,0.4,0.1)*exp(-max(-rocks,0.0)*6.0)*0.5*(0.5+fbm(p*3.0,3));
  c=mix(rockC,c,rk);
  return c;
}
float wanderer2D(vec2 p, float staffOn){
  float d=cloaked2D(p,0.0);
  d=min(d,sdSeg2(p,vec2(0.30,0.0),vec2(0.33,1.95))-0.022+(1.0-staffOn)*10.0);
  return d;
}
float guardian(vec2 p){ // colossal hooded statue holding a sword point-down
  float d=wanderer2D(p,0.0);
  vec2 q=p-vec2(0.0,0.95);
  float blade=sdBox2(q-vec2(0.0,-0.35),vec2(0.035,0.55));
  float guard=sdBox2(q-vec2(0.0,0.22),vec2(0.17,0.025));
  float hilt=sdBox2(q-vec2(0.0,0.36),vec2(0.025,0.12));
  d=min(d,min(blade,min(guard,hilt)));
  float plinth=sdBox2(p-vec2(0.0,-0.12),vec2(0.42,0.12));
  return min(d,plinth);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  uv=rot(uP[0].w)*uv;
  vec2 p=uP[0].xy+uv*uP[0].z;
  float t=uTime;
  float portal=uP[1].x;
  float op=archOpen(p);
  vec3 col;
  // --- rock wall with carved blocks
  vec2 bp=p*vec2(0.55,0.9); bp.x+=0.5*step(1.0,mod(floor(bp.y),2.0));
  vec2 bf=fract(bp)-0.5;
  float mortar=smoothstep(0.47,0.5,max(abs(bf.x),abs(bf.y)));
  float h=fbm(p*0.8,5); float h2=fbm(p*3.5,3);
  vec2 e=vec2(0.05,0.0);
  float hx=fbm((p+e.xy)*0.8,5)-h, hy=fbm((p+e.yx)*0.8,5)-h;
  vec3 n=normalize(vec3(-hx*6.0,-hy*6.0,1.0));
  vec3 alb=mix(vec3(0.030,0.026,0.024),vec3(0.085,0.07,0.06),h*0.7+h2*0.3)*(1.0-mortar*0.7);
  // portal light falloff on wall + moulding rims
  float dOp=max(op,0.0);
  vec3 L=normalize(vec3(-p.x,4.0-p.y,6.0));
  float lit=exp(-dOp*0.20)*portal;
  col=alb*vec3(1.0,0.38,0.12)*lit*(0.3+1.6*max(dot(n,L),0.0))*3.0;
  col+=alb*vec3(0.35,0.45,0.6)*0.9*max(dot(n,normalize(vec3(-0.5,0.8,0.4))),0.0);
  // cracks with faint heat
  vec2 vr=voronoi(p*0.35);
  col*=0.75+0.25*smoothstep(0.0,0.06,vr.y);
  // lit haze in front of the cliff so the statues read as silhouettes
  col+=vec3(0.30,0.09,0.03)*exp(-dOp*0.055)*portal*0.55*(0.5+0.9*fbm(p*0.15+vec2(t*0.03,0.0),4));
  // colossal guardians flanking the gate
  for(int k=0;k<2;k++){
    float sx=k==0?-1.0:1.0;
    vec2 gp=vec2((p.x-sx*13.5)*sx,p.y+0.3)/11.0;
    float gd=guardian(gp)*11.0;
    float gm=smoothstep(0.06,-0.06,gd);
    float side=sat(-sx*(p.x-sx*13.5)*0.35+0.3);
    float rimG=exp(-max(-gd,0.0)*7.0)*gm*side;
    vec3 stoneG=vec3(0.012,0.011,0.010)*(0.6+0.8*h2)+vec3(0.35,0.45,0.6)*0.012*h;
    col=mix(col,stoneG+vec3(1.0,0.4,0.12)*rimG*portal*0.9,gm);
  }
  // archivolt mouldings (concentric recessed bands)
  for(int i=1;i<5;i++){
    float fi=float(i);
    float band=abs(op-fi*0.75);
    float edge=exp(-band*band/0.012);
    col+=vec3(1.0,0.42,0.15)*edge*exp(-fi*0.55)*portal*0.9;
    col*=1.0-0.35*smoothstep(0.08,0.0,abs(op-fi*0.75-0.18));
  }
  // pillars
  float pil=min(sdBox2(vec2(abs(p.x)-5.6,p.y-8.0),vec2(0.9,8.0)),1e5);
  float flute=smoothstep(0.35,0.5,abs(fract((abs(p.x)-4.7)*2.2)-0.5))*step(pil,0.0);
  col*=1.0-0.4*flute;
  col+=vec3(1.0,0.42,0.15)*exp(-abs(abs(p.x)-4.7)*6.0)*step(p.y,16.0)*portal*0.35*step(4.6,abs(p.x));
  // inscription band above the apex
  vec2 iu=vec2((p.x+10.0)/20.0,(p.y-19.4)/1.5);
  float inBand=step(0.0,iu.x)*step(iu.x,1.0)*step(0.0,iu.y)*step(iu.y,1.0);
  float frameB=exp(-pow(sdBox2(p-vec2(0.0,20.15),vec2(10.3,1.0)),2.0)/0.01);
  col+=vec3(1.0,0.45,0.15)*frameB*portal*0.25;
  if(inBand>0.5){
    float txt=texture(uTex0,iu).a;
    float burn=uP[1].y;
    float ign=smoothstep(burn,burn-0.06,iu.x);
    float fl=0.8+0.2*sin(t*17.0+iu.x*40.0)*sin(t*5.3);
    col*=1.0-txt*0.8;
    col+=fireCol(1.0)*txt*ign*fl*2.2;
    col+=vec3(1.0,0.5,0.15)*txt*smoothstep(0.05,0.0,abs(iu.x-burn))*6.0*step(burn,1.02);
  }
  // --- inside the portal
  if(op<0.0){
    vec3 inf=inferno(p,t)*portal;
    col=inf;
  }
  // ground in front: wet stone catching the glow
  if(p.y<0.0){
    float gz=1.0/max(-p.y,0.02);
    vec2 gp=vec2(p.x*gz*0.3,gz);
    float st=fbm(gp*vec2(1.0,0.4),4);
    float steps=smoothstep(0.0,0.08,abs(fract(gz*0.18)-0.5))*0.5+0.5;
    vec3 g=vec3(0.03,0.025,0.02)*(0.5+st)*steps;
    float refl=exp(-abs(p.x)*0.35)*exp(p.y*0.25);
    g+=vec3(1.0,0.4,0.12)*refl*portal*(0.25+0.5*st)*0.9;
    col=g;
  }
  // haze glow around the opening
  col+=vec3(1.0,0.35,0.1)*exp(-dOp*0.18)*0.12*portal;
  // drifting smoke in front
  float sm=fbm(p*0.12+vec2(t*0.05,-t*0.02),5);
  float smk=smoothstep(0.45,0.85,sm)*uP[2].z;
  col=mix(col,col*0.25+vec3(0.08,0.035,0.02)*portal,smk);
  // wanderer silhouette
  if(uP[1].z>0.5){
    float wd=wanderer2D((p-vec2(uP[1].w,0.0))/1.0,1.0);
    float px=uP[0].z/uRes.y*1.5;
    float m=smoothstep(px,-px,wd);
    vec3 rim=vec3(1.0,0.45,0.15)*exp(-max(-wd,0.0)/max(px*2.0,0.004))*portal*1.5;
    col=mix(col,vec3(0.004)+rim*0.6,m);
    vec2 lp=vec2(uP[1].w-0.32,0.72);
    float ld=length(p-lp);
    col+=vec3(1.0,0.55,0.2)*uP[2].w*(exp(-ld*ld/0.0006)*3.0+exp(-ld*ld/0.2)*0.12);
  }
  col+=vec3(1.0,0.5,0.2)*uP[2].y;
  fragColor=vec4(col,1.0);
}`,
  init(R) {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 150px Cinzel';
    const txt = 'LASCIATE  OGNE  SPERANZA,  VOI  CH’INTRATE';
    if ('letterSpacing' in x) x.letterSpacing = '22px';
    let w = x.measureText(txt).width;
    if (w > 3900) x.font = `600 ${Math.floor(150 * 3900 / w)}px Cinzel`;
    x.fillText(txt, 2048, 136);
    SCENES.gate.tex = GLX.texture(c, { mip: true });
  },
  textures: () => ({ uTex0: SCENES.gate.tex }),
  pack(o) {
    const d = Object.assign({ cam: [0, 6], S: 24, roll: 0, portal: 1, burn: 0, wanOn: 1, wanX: 0, vortex: 0.6, flare: 0, smoke: 0.6, lantern: 1 }, o);
    return [...d.cam, d.S, d.roll, d.portal, d.burn, d.wanOn, d.wanX, d.vortex, d.flare, d.smoke, d.lantern, ...Array(20).fill(0)];
  },
};
