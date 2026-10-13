// Post-processing shaders: transitions, light shafts, composite (particles + type), bloom, final grade.
'use strict';

const POST = {};

POST.copy = GLSL_HEAD + `
uniform sampler2D uTex; uniform float uGain;
void main(){ fragColor = texture(uTex, vUV)*uGain; }`;

// ---------------------------------------------------------------- transitions
POST.transition = GLSL_HEAD + GLSL_LIB + `
uniform sampler2D uA, uB;
uniform float uType, uProg;
uniform vec4 uTP; // type params
void main(){
  vec2 uv=vUV; float p=uProg; vec3 col;
  vec2 asp=vec2(uRes.x/uRes.y,1.0);
  if(uType<0.5){ // dissolve through burning noise
    float n=fbm((uv*asp)*4.0,5);
    float e=smoothstep(p-0.08,p+0.08,n*1.1-0.05);
    vec3 a=texture(uA,uv).rgb, b=texture(uB,uv).rgb;
    float edge=exp(-pow((n*1.1-0.05-p)*18.0,2.0))*sat(p*8.0)*sat((1.0-p)*8.0);
    col=mix(b,a,e)+vec3(2.5,0.9,0.25)*edge*uTP.x;
  } else if(uType<1.5){ // slash split: line through centre at angle uTP.x, halves slide apart along it
    float ang=uTP.x; vec2 dir=vec2(cos(ang),sin(ang)); vec2 nrm=vec2(-dir.y,dir.x);
    vec2 q=(uv-0.5)*asp; float side=sign(dot(q,nrm)+1e-5);
    float sep=pow(p,1.6)*uTP.y;
    vec2 qa=q - dir*side*sep*0.6 - nrm*side*sep*0.35;
    vec2 uva=qa/asp+0.5;
    float gap=abs(dot(q,nrm));
    vec3 a=texture(uA,uva).rgb;
    vec3 b=texture(uB,uv).rgb;
    float open=sep*0.35;
    float inGap=step(gap,open);
    col=mix(a,b,inGap);
    col+=vec3(3.0,1.5,0.6)*exp(-max(gap-open,0.0)*500.0)*(1.0-p)*1.6+vec3(1.0,0.4,0.1)*exp(-max(gap-open,0.0)*60.0)*(1.0-p)*0.25;
  } else if(uType<2.5){ // glitch slices
    float rows=18.0+floor(hash11(floor(p*12.0))*30.0);
    float r=floor(uv.y*rows);
    float h=hash12(vec2(r,floor(p*20.0)));
    float useB=step(h,p);
    float off=(hash12(vec2(r,7.0+floor(p*24.0)))-0.5)*0.12*sin(p*PI);
    vec2 u2=uv+vec2(off,0.0);
    vec3 a=vec3(texture(uA,u2+vec2(0.006,0)).r,texture(uA,u2).g,texture(uA,u2-vec2(0.006,0)).b);
    vec3 b=vec3(texture(uB,u2+vec2(0.006,0)).r,texture(uB,u2).g,texture(uB,u2-vec2(0.006,0)).b);
    col=mix(a,b,useB);
  } else { // iris/zoom-through: B revealed from a growing circle at uTP.xy
    vec2 c=uTP.xy; float d=length((uv-c)*asp);
    float rad=pow(p,2.2)*1.3;
    float m=smoothstep(rad,rad-0.02,d);
    vec2 za=c+(uv-c)/(1.0+p*2.0);
    col=mix(texture(uA,za).rgb, texture(uB,uv).rgb, m);
    col+=vec3(2.6,1.2,0.4)*exp(-abs(d-rad)*60.0)*sat(p*6.0)*(1.0-p);
  }
  fragColor=vec4(col,1.0);
}`;

// ---------------------------------------------------------------- light shafts (half res)
POST.rays = GLSL_HEAD + GLSL_LIB + `
uniform sampler2D uScene; uniform vec2 uLight; uniform vec4 uRayP; // x threshold, y decay, z length
void main(){
  vec2 uv=vUV; vec2 d=(uLight-uv)*uRayP.z/64.0;
  float w=1.0; vec3 acc=vec3(0.0);
  float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
  vec2 s=uv+d*jit*0.6;
  for(int i=0;i<64;i++){
    vec3 c=texture(uScene,s).rgb;
    float l=luma(c);
    acc+=c*max(l-uRayP.x,0.0)/max(l,1e-3)*w;
    w*=uRayP.y; s+=d;
  }
  fragColor=vec4(acc/64.0*3.0,1.0);
}`;

// ---------------------------------------------------------------- composite
POST.composite = GLSL_HEAD + GLSL_LIB + `
uniform sampler2D uScene, uRays, uGfx, uTxt;
uniform vec4 uShake;      // x,y offset (uv units), z rotation, w zoom
uniform vec4 uZoomBlur;   // xy centre, z strength
uniform vec3 uRaysCol; uniform float uRaysAmt;
uniform vec4 uEmber;      // amount, speed, size, mode(0 rise,1 radial out,2 fall,3 sideways)
uniform vec4 uEmberC;     // rgb tint, near-bokeh amount
uniform vec4 uAsh;        // amount, speed, size, wind
uniform vec4 uDust;       // amount, speed, size, brightness
uniform vec4 uTxtFx;      // gain, dissolve, glitch, bevel
uniform vec4 uTxtFx2;     // sweep pos, chroma px, burn edge, seed
uniform vec4 uGfxFx;      // gain, glitch, -, -
uniform vec4 uFlash;      // rgb, amount
uniform float uExposure;
uniform vec2 uPartC;      // radial centre

vec2 shakeUV(vec2 uv){
  vec2 asp=vec2(uRes.x/uRes.y,1.0);
  vec2 q=(uv-0.5)*asp; q=rot(uShake.z)*q; q/=uShake.w; q/=asp;
  return q+0.5+uShake.xy;
}
vec3 sampleScene(vec2 uv){
  if(uZoomBlur.z<=0.0001) return texture(uScene,uv).rgb;
  vec3 acc=vec3(0.0); vec2 c=uZoomBlur.xy; float j=hash12(uv*uRes);
  for(int i=0;i<16;i++){ float f=(float(i)+j)/16.0; acc+=texture(uScene, c+(uv-c)*(1.0-uZoomBlur.z*f)).rgb; }
  return acc/16.0;
}
// particles -------------------------------------------------------------
vec3 emberLayer(vec2 uv, float t, float L, float amt){
  float depth=1.0+L*0.9;
  float sc=4.0*depth;
  vec2 p=uv*sc;
  float spd=uEmber.y/depth;
  vec2 vel;
  if(uEmber.w<0.5){ vel=vec2(0.25*sin(L*3.1),1.0); }
  else if(uEmber.w<2.5 && uEmber.w>1.5){ vel=vec2(0.15,-1.0); }
  else if(uEmber.w>2.5){ vel=vec2(1.0,0.35); }
  else { vel=vec2(0.0,1.0); }
  p-=vel*t*spd*sc*0.35;
  p.x+=sin(p.y*0.6+t*0.9+L*4.0)*0.35;
  vec2 cid=floor(p); vec2 f=fract(p)-0.5;
  vec3 h=hash32(cid+L*31.7);
  if(h.z>amt) return vec3(0.0);
  vec2 pos=(h.xy-0.5)*0.6;
  pos+=vec2(sin(t*2.3+h.x*20.0),cos(t*1.7+h.y*20.0))*0.06;
  vec2 v=normalize(vel)*0.10*spd*uEmber.z;
  float d=sdSeg2(f,pos,pos-v);
  float sz=uEmber.z*mix(0.018,0.045,h.x);
  float core=smoothstep(sz,0.0,d);
  float glow=exp(-d*d/(sz*sz*9.0))*0.35;
  float fl=0.55+0.45*sin(t*(6.0+h.y*10.0)+h.x*40.0);
  vec3 c=mix(vec3(1.0,0.35,0.06),vec3(1.0,0.75,0.35),h.y)*uEmberC.rgb;
  return c*(core*2.2+glow)*fl/(0.6+L*0.4);
}
vec3 emberRadial(vec2 uv, float t, float L, float amt){
  vec2 q=(uv-uPartC); float r=length(q); float a=atan(q.y,q.x);
  float lr=log(r+1e-3);
  vec2 p=vec2(a/TAU*28.0*(1.0+L*0.5), lr*6.0 - t*uEmber.y*(1.0+L*0.4));
  vec2 cid=floor(p); vec2 f=fract(p)-0.5;
  vec3 h=hash32(cid+L*13.1);
  if(h.z>amt) return vec3(0.0);
  vec2 pos=(h.xy-0.5)*0.5;
  float d=sdSeg2(f,pos,pos-vec2(0.0,0.9*uEmber.z));
  float sz=0.05*(1.0+h.x)*uEmber.z;
  float b=smoothstep(sz,0.0,d)*sat(r*3.0)*smoothstep(1.4,0.3,r);
  vec3 c=mix(vec3(1.0,0.32,0.05),vec3(1.0,0.7,0.3),h.y)*uEmberC.rgb;
  return c*b*1.8;
}
vec3 ashLayer(vec2 uv, float t, float L){
  float depth=1.0+L*1.1;
  vec2 p=uv*5.0*depth;
  p.y+=t*uAsh.y*1.6; p.x-=t*uAsh.w*1.6;
  p.x+=sin(p.y*0.8+t+L)*0.3;
  vec2 cid=floor(p); vec2 f=fract(p)-0.5;
  vec3 h=hash32(cid+L*7.3+40.0);
  if(h.z>uAsh.x) return vec3(0.0);
  vec2 pos=(h.xy-0.5)*0.6;
  float ang=t*(1.0+h.x*3.0)+h.y*6.0;
  vec2 g=rot(ang)*(f-pos);
  float d=length(g*vec2(1.0,2.5+2.0*h.x));
  float sz=uAsh.z*mix(0.02,0.05,h.y);
  float b=smoothstep(sz,sz*0.3,d);
  return vec3(0.55,0.5,0.47)*b*(0.25+0.4*h.x)/(0.7+L*0.4);
}
vec3 dustLayer(vec2 uv, float t, float L){
  float depth=1.0+L*1.3;
  vec2 p=uv*3.0*depth;
  p+=vec2(sin(t*0.13+L),cos(t*0.11+L))*0.5 + vec2(0.05,0.03)*t*uDust.y;
  vec2 cid=floor(p); vec2 f=fract(p)-0.5;
  vec3 h=hash32(cid+L*3.9+90.0);
  if(h.z>uDust.x) return vec3(0.0);
  vec2 pos=(h.xy-0.5)*0.6+vec2(sin(t*0.7+h.x*9.0),cos(t*0.5+h.y*9.0))*0.08;
  float d=length(f-pos);
  float sz=uDust.z*mix(0.01,0.03,h.x)*(L>1.5?3.0:1.0);
  float b=smoothstep(sz,0.0,d)*(L>1.5?0.25:1.0);
  float tw=0.5+0.5*sin(t*3.0+h.y*30.0);
  return vec3(0.8,0.88,1.0)*b*tw*uDust.w;
}
// type -------------------------------------------------------------------
vec4 txtSample(vec2 uv){
  vec4 c=texture(uTxt,uv);
  if(uTxtFx2.y>0.0){
    vec2 o=vec2(uTxtFx2.y/uRes.x,0.0);
    float r=texture(uTxt,uv+o).r, b=texture(uTxt,uv-o).b;
    c.r=max(c.r,r); c.b=max(c.b,b); c.a=max(c.a,max(texture(uTxt,uv+o).a,texture(uTxt,uv-o).a)*0.8);
  }
  return c;
}
void main(){
  vec2 uv=vUV;
  vec2 asp=vec2(uRes.x/uRes.y,1.0);
  vec2 su=shakeUV(uv);
  vec3 col=sampleScene(su)*uExposure;
  col+=texture(uRays,su).rgb*uRaysCol*uRaysAmt;

  // particles in screen space (shaken a bit less: parallax feel)
  vec2 pu=(su-0.5)*asp;
  float t=uTime;
  vec3 part=vec3(0.0);
  if(uEmber.x>0.0){
    if(uEmber.w>0.5 && uEmber.w<1.5){ for(int L=0;L<3;L++) part+=emberRadial(su*asp,t,float(L),uEmber.x); }
    else { for(int L=0;L<4;L++) part+=emberLayer(pu,t,float(L),uEmber.x); }
    // near out-of-focus embers
    if(uEmberC.a>0.0){
      vec2 p=pu*1.6; p.y-=t*uEmber.y*0.5; vec2 cid=floor(p); vec2 f=fract(p)-0.5; vec3 h=hash32(cid+77.0);
      if(h.z<uEmberC.a){ float d=length(f-(h.xy-0.5)*0.5); part+=vec3(1.0,0.4,0.1)*smoothstep(0.09,0.05,d)*0.25*(0.5+0.5*sin(t*3.0+h.x*9.0)); }
    }
  }
  if(uAsh.x>0.0){ for(int L=0;L<3;L++) part+=ashLayer(pu,t,float(L)); }
  if(uDust.x>0.0){ for(int L=0;L<3;L++) part+=dustLayer(pu,t,float(L)); }
  col+=part;

  // graphic overlay (premultiplied), slightly shaken with scene
  vec2 gu=mix(uv,su,0.6);
  if(uGfxFx.y>0.0){ float r=floor(gu.y*90.0); float h=hash12(vec2(r,floor(uTime*24.0))); gu.x+=(h>0.8?(h-0.9)*uGfxFx.y:0.0); }
  vec4 g=texture(uGfx,gu);
  col=col*(1.0-g.a)+g.rgb*uGfxFx.x;

  // typography
  vec2 tu=mix(uv,su,0.35);
  if(uTxtFx.z>0.0){ // glitch slices
    float rows=40.0; float r=floor(tu.y*rows+uTxtFx2.w*7.0);
    float h=hash12(vec2(r,floor(uTime*30.0)+uTxtFx2.w));
    tu.x+=(h>0.55?(h-0.75)*0.18*uTxtFx.z:0.0);
  }
  vec4 tx=txtSample(tu);
  if(uTxtFx.y>0.0){ // burn-dissolve
    float n=fbm(tu*asp*9.0+uTxtFx2.w,4);
    float th=uTxtFx.y*1.15-0.08;
    float keep=smoothstep(th,th+0.05,n);
    float edge=smoothstep(th-0.02,th+0.02,n)-keep;
    vec3 ec=vec3(3.0,1.1,0.25)*edge*tx.a*uTxtFx2.z;
    tx*=keep; col+=ec;
  }
  if(uTxtFx.w>0.0){ // bevelled metal: alpha as height
    vec2 px=1.6/uRes;
    float hL=texture(uTxt,tu-vec2(px.x,0)).a, hR=texture(uTxt,tu+vec2(px.x,0)).a;
    float hD=texture(uTxt,tu-vec2(0,px.y)).a, hU=texture(uTxt,tu+vec2(0,px.y)).a;
    vec3 n=normalize(vec3((hL-hR)*2.2,(hD-hU)*2.2,1.0));
    vec3 Ld=normalize(vec3(-0.4,0.7,0.6));
    float diff=max(dot(n,Ld),0.0);
    float spec=pow(max(dot(reflect(-Ld,n),vec3(0,0,1)),0.0),24.0);
    float sweep=exp(-pow((tu.x*asp.x - tu.y*0.6 - uTxtFx2.x)*5.0,2.0));
    vec3 metal=tx.rgb*(0.35+0.85*diff) + vec3(1.0,0.86,0.62)*spec*tx.a*0.9 + vec3(1.6,1.25,0.8)*sweep*tx.a*(0.4+spec*2.0);
    tx.rgb=mix(tx.rgb,metal,uTxtFx.w);
  }
  col=col*(1.0-tx.a)+tx.rgb*uTxtFx.x;

  col+=uFlash.rgb*uFlash.a;
  fragColor=vec4(max(col,0.0),1.0);
}`;

// ---------------------------------------------------------------- bloom
POST.bloomPre = GLSL_HEAD + GLSL_LIB + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh;
void main(){
  vec3 c=vec3(0.0);
  c+=texture(uTex,vUV+uTexel*vec2(-1,-1)).rgb; c+=texture(uTex,vUV+uTexel*vec2(1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(-1,1)).rgb;  c+=texture(uTex,vUV+uTexel*vec2(1,1)).rgb;
  c*=0.25;
  float l=luma(c); float k=uThresh*0.5;
  float s=clamp(l-uThresh+k,0.0,2.0*k); s=s*s/(4.0*k+1e-4);
  float w=max(s,l-uThresh)/max(l,1e-4);
  c*=w; c=min(c,vec3(60.0));
  fragColor=vec4(c,1.0);
}`;
POST.down = GLSL_HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec3 c=texture(uTex,vUV).rgb*0.5;
  c+=texture(uTex,vUV+uTexel*vec2(-1,-1)).rgb*0.125; c+=texture(uTex,vUV+uTexel*vec2(1,-1)).rgb*0.125;
  c+=texture(uTex,vUV+uTexel*vec2(-1,1)).rgb*0.125;  c+=texture(uTex,vUV+uTexel*vec2(1,1)).rgb*0.125;
  fragColor=vec4(c,1.0);
}`;
POST.up = GLSL_HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uGain;
void main(){
  vec3 c=vec3(0.0);
  c+=texture(uTex,vUV+uTexel*vec2(-1,-1)).rgb; c+=texture(uTex,vUV+uTexel*vec2(0,-1)).rgb*2.0; c+=texture(uTex,vUV+uTexel*vec2(1,-1)).rgb;
  c+=texture(uTex,vUV+uTexel*vec2(-1,0)).rgb*2.0; c+=texture(uTex,vUV).rgb*4.0; c+=texture(uTex,vUV+uTexel*vec2(1,0)).rgb*2.0;
  c+=texture(uTex,vUV+uTexel*vec2(-1,1)).rgb; c+=texture(uTex,vUV+uTexel*vec2(0,1)).rgb*2.0; c+=texture(uTex,vUV+uTexel*vec2(1,1)).rgb;
  fragColor=vec4(c/16.0*uGain,1.0);
}`;
POST.streak = GLSL_HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uStride;
void main(){
  vec3 c=vec3(0.0); float wsum=0.0;
  for(int i=-12;i<=12;i++){ float w=exp(-float(i*i)/50.0); c+=texture(uTex,vUV+vec2(float(i)*uStride*uTexel.x,0.0)).rgb*w; wsum+=w; }
  fragColor=vec4(c/wsum,1.0);
}`;

// ---------------------------------------------------------------- final
POST.final = GLSL_HEAD + GLSL_LIB + `
uniform sampler2D uComp, uBloom, uStreak, uTxt;
uniform vec4 uBloomP;   // amount, streak amount, dirt, -
uniform vec4 uGrade;    // exposure, contrast, saturation, warmth
uniform vec4 uLift;     // shadow tint rgb, amount
uniform vec4 uGain;     // highlight tint rgb, amount
uniform vec4 uLens;     // CA amount, vignette, grain, distortion
uniform vec4 uBars;     // bar height (fraction of half-height covered), slit glow, txtOverBars, fade
uniform vec4 uTint;     // rgb multiply, mix
uniform vec4 uLine;     // opening hairline: extent, intensity, thickness px, -
float dirt(vec2 uv){
  vec2 a=vec2(uRes.x/uRes.y,1.0);
  float d=0.0;
  for(int i=0;i<14;i++){ vec3 h=hash32(vec2(float(i),3.7)); vec2 c=h.xy*a; float r=0.03+0.12*h.z; d+=smoothstep(r,r*0.6,length(uv*a-c))*(0.3+0.7*hash11(float(i)*1.3)); }
  d+=fbm(uv*a*6.0,4)*0.6;
  return d;
}
void main(){
  vec2 uv=vUV;
  vec2 asp=vec2(uRes.x/uRes.y,1.0);
  vec2 cq=(uv-0.5);
  float r2=dot(cq*asp,cq*asp);
  uv=0.5+cq*(1.0+uLens.w*r2);
  vec2 dir=(uv-0.5);
  float ca=uLens.x*(0.4+r2*2.2);
  vec3 col;
  col.r=texture(uComp,uv+dir*ca).r;
  col.g=texture(uComp,uv).g;
  col.b=texture(uComp,uv-dir*ca).b;
  vec3 bl=texture(uBloom,uv).rgb;
  vec3 st=texture(uStreak,uv).rgb;
  float dd=dirt(uv);
  col+=bl*uBloomP.x*(1.0+dd*uBloomP.z);
  col+=st*vec3(0.55,0.75,1.4)*uBloomP.y;
  col*=uGrade.x;
  // white balance / warmth
  col*=vec3(1.0+uGrade.w*0.08,1.0,1.0-uGrade.w*0.10);
  col=aces(col);
  // split toning
  float l=luma(col);
  col=mix(col, col*uLift.rgb*2.0, uLift.a*(1.0-smoothstep(0.0,0.45,l)));
  col=mix(col, col*uGain.rgb*1.6, uGain.a*smoothstep(0.35,1.0,l));
  // contrast + saturation
  col=mix(vec3(l),col,uGrade.z);
  col=sat(col);
  col=col*col*(3.0-2.0*col)*uGrade.y + col*(1.0-uGrade.y);
  col=mix(col,col*uTint.rgb,uTint.a);
  // vignette
  float vig=1.0-uLens.y*smoothstep(0.15,1.0,r2*1.6);
  col*=vig;
  // grain
  float g=hash12(vUV*uRes+fract(uTime*7.13)*1000.0)+hash12(vUV*uRes*1.37+fract(uTime*3.7)*500.0)-1.0;
  col+=g*uLens.z*(0.35+0.65*(1.0-l))*0.6;
  // letterbox
  float y=abs(vUV.y-0.5)*2.0;
  float barEdge=1.0-uBars.x;
  float inBar=step(barEdge,y);
  vec3 barCol=vec3(0.0);
  barCol+=vec3(1.0,0.55,0.25)*exp(-max(y-barEdge,0.0)*uRes.y*0.12)*uBars.y*inBar;   // clamp: exp overflow -> Inf*0 = NaN
  col=mix(col,barCol,inBar);
  if(uBars.z>0.0){ vec4 tx=texture(uTxt,vUV); col=mix(col, aces(tx.rgb*1.2), inBar*tx.a*uBars.z); }
  if(uLine.y>0.0){
    float dy=abs(vUV.y-0.5)*uRes.y;
    float dx=abs(vUV.x-0.5)*2.0;
    float ext=smoothstep(uLine.x,uLine.x-0.15,dx);
    col+=vec3(1.0,0.78,0.55)*uLine.y*ext*(exp(-dy*dy/(uLine.z*uLine.z))+0.25*exp(-dy/(uLine.z*6.0)));
  }
  col*=1.0-uBars.w;
  col+=(hash12(vUV*uRes+uTime)-0.5)/255.0;
  fragColor=vec4(sat(col),1.0);
}`;
