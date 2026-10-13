// VIEWMODEL — first-person overlay drawn in screen space (premultiplied RGBA):
// gloved hand + lantern, gauntlet + sword (ignite, slash trail), open hand reaching, whipping branches.
// P0 lanternOn, pivot.xy, scale | P1 swing rot, flame, -, handOn
// P2 swordOn, hand.xy, scale    | P3 angle, ignite, trail, trailFrom
// P4 reachOn, pos.xy, scale     | P5 angle, open, fallingLanternOn, -
// P6 env rim rgb, ambient       | P7 softness, warm tint mix, -, -
// P8 branch A on, progress, angle, offset | P9 branch B on, progress, angle, offset
// P10 falling lantern pos.xy, scale, rot
'use strict';

const VM = {};

VM.frag = `
float PXW;
vec4 over(vec4 dst, vec4 src){ return src+dst*(1.0-src.a); }
vec2 gradOf(float d0, float dx, float dy){ vec2 g=vec2(dx-d0,dy-d0); return g/max(length(g),1e-6); }
// 2D lit material: d<0 inside, n outward normal, warm light coming from direction wdir with strength w
vec4 mat2D(float d, vec2 n, vec3 alb, vec2 wdir, float w, vec3 wcol, float soft){
  float a=smoothstep(soft,-soft,d);
  if(a<=0.0) return vec4(0.0);
  float edge=exp(-max(-d,0.0)/(0.010+soft));
  vec3 c=alb*(0.25+uP[6].w);
  float rimE=pow(sat(dot(n,normalize(vec2(-0.55,0.85)))),1.5)*edge;
  c+=uP[6].rgb*rimE*0.55;
  float lw=sat(dot(n,wdir)*0.8+0.2);
  c+=wcol*w*(alb*2.5*lw+0.35*edge*pow(sat(dot(n,wdir)),2.0));
  return vec4(c*a,a);
}
// ---------------------------------------------------------------- lantern (local units: body height 1, pivot at (0,0.80))
float lanternMetal(vec2 q){
  float d=sdBox2(q-vec2(0.0,-0.47),vec2(0.30,0.035))-0.01;
  d=min(d,sdBox2(q-vec2(0.0,-0.535),vec2(0.21,0.022)));
  float cy=q.y-0.47; float cw=mix(0.31,0.09,sat(cy/0.15));
  d=min(d,max(abs(q.x)-cw,max(-cy,cy-0.15))-0.004);
  d=min(d,length(q-vec2(0.0,0.645))-0.032);
  float ring=abs(length(q-vec2(0.0,0.78))-0.115)-0.02;
  ring=max(ring,0.66-q.y);
  d=min(d,ring);
  float xs[4]=float[4](-0.27,-0.105,0.115,0.27);
  for(int i=0;i<4;i++){ float w=(i==0||i==3)?0.026:0.014; d=min(d,sdBox2(q-vec2(xs[i],0.0),vec2(w,0.45))); }
  d=min(d,sdBox2(q-vec2(0.0,0.435),vec2(0.30,0.018)));
  d=min(d,sdBox2(q-vec2(0.0,-0.425),vec2(0.30,0.018)));
  // cross wires on the glass
  d=min(d,abs(sdBox2(q-vec2(0.0,0.0),vec2(0.27,0.30)))-0.004+step(0.105,abs(q.x))*step(abs(q.x),0.27)*10.0);
  return d;
}
vec4 lantern(vec2 q, float flameI, float t){
  vec2 fc=vec2(0.0,-0.08);
  float dm=lanternMetal(q);
  float glass=sdBox2(q,vec2(0.27,0.43));
  vec4 res=vec4(0.0);
  float soft=PXW*1.5+uP[7].x;
  if(glass<soft){
    float side=(abs(q.x)>0.11)?0.55:1.0;
    float soot=0.55+0.45*fbm(q*vec2(9.0,5.0)+3.0,4);
    soot*=1.0-0.6*smoothstep(0.15,0.43,q.y);
    float lf=exp(-length((q-fc)*vec2(1.0,0.7))*4.0);
    vec3 gc=vec3(1.0,0.48,0.14)*(0.35+1.8*lf)*soot*side*flameI;
    // candle
    float cd=sdBox2(q-vec2(0.0,-0.27),vec2(0.045,0.13))-0.01;
    gc=mix(gc,vec3(0.9,0.75,0.55)*0.6*flameI*(0.4+0.6*smoothstep(-0.4,-0.15,q.y)),smoothstep(PXW,-PXW,cd));
    // flame
    vec2 fq=q-fc;
    fq.x+=0.016*sin(t*17.0+fq.y*22.0)*sat(fq.y*4.0+0.3)+0.008*sin(t*7.3);
    float fw=0.06*sat(1.0-fq.y/0.24)*sqrt(sat(fq.y/0.04+1.0));
    float fd=length(vec2(fq.x/(fw+1e-3),(fq.y-0.05)/0.16));
    gc+=vec3(1.0,0.5,0.12)*smoothstep(1.0,0.35,fd)*3.0*flameI+vec3(1.0,0.92,0.7)*smoothstep(0.55,0.0,fd)*5.0*flameI;
    float a=smoothstep(soft,-soft,glass);
    res=vec4(gc*a,a);
  }
  if(dm<soft+0.02){
    float e=0.004;
    vec2 n=gradOf(dm,lanternMetal(q+vec2(e,0.0)),lanternMetal(q+vec2(0.0,e)));
    vec2 wdir=normalize(fc-q);
    float inside=1.0-smoothstep(0.0,0.35,length(q-fc)*0.6);
    vec4 m=mat2D(dm,n,vec3(0.035,0.03,0.028),wdir,flameI*(0.6+inside),vec3(1.0,0.5,0.18),soft);
    res=over(res,m);
  }
  return res;
}
// ---------------------------------------------------------------- gloved hand holding the lantern ring (hand space: pivot origin, lantern units)
float gloveHand(vec2 h){
  float fist=sdBox2(rot(0.28)*(h-vec2(-0.015,0.05)),vec2(0.15,0.09))-0.05;
  for(int i=0;i<4;i++){ vec2 k=vec2(-0.10+float(i)*0.07,0.13-float(i)*0.012); fist=smin(fist,length(h-k)-0.042,0.02); }
  vec2 fa=sdSeg2h(h,vec2(-0.10,0.02),vec2(-1.55,-1.45));
  float arm=fa.x-mix(0.12,0.26,fa.y);
  float d=smin(fist,arm,0.06);
  // sleeve folds wobble
  d+=0.012*sin(fa.y*40.0+h.x*3.0)*smoothstep(0.15,0.3,fa.y);
  return d;
}
vec4 handLantern(vec2 h, vec2 flameH, float flameI){
  float d=gloveHand(h);
  float soft=PXW*1.5+uP[7].x;
  if(d>soft+0.02) return vec4(0.0);
  float e=0.004;
  vec2 n=gradOf(d,gloveHand(h+vec2(e,0.0)),gloveHand(h+vec2(0.0,e)));
  vec2 wdir=normalize(flameH-h);
  float fall=1.0/(1.0+dot(flameH-h,flameH-h)*2.5);
  vec3 alb=vec3(0.035,0.026,0.02)*(0.75+0.5*fbm(h*14.0,3));
  return mat2D(d,n,alb,wdir,flameI*fall*1.6,vec3(1.0,0.5,0.18),soft);
}
// ---------------------------------------------------------------- sword (sword space: x along blade, hand at origin)
float bladeSDF(vec2 s){
  float L=2.1;
  float w=mix(0.06,0.042,sat(s.x/L))*sat((L-s.x)/0.32);
  return max(abs(s.y)-w,max(0.08-s.x,s.x-L));
}
float hiltSDF(vec2 s){
  float g=sdBox2(s-vec2(0.04,0.0),vec2(0.026,0.19))-0.008;
  g=min(g,length(s-vec2(0.04,0.2))-0.034); g=min(g,length(s-vec2(0.04,-0.2))-0.034);
  g=min(g,sdBox2(s-vec2(-0.13,0.0),vec2(0.14,0.03)));
  g=min(g,length(s-vec2(-0.29,0.0))-0.045);
  return g;
}
float gauntletSDF(vec2 p, vec2 s){ // p screen-space relative to hand / scale, s sword space
  float fist=sdBox2(s-vec2(-0.12,0.0),vec2(0.12,0.085))-0.045;
  vec2 fa=sdSeg2h(p,vec2(0.0,-0.02),vec2(1.35,-1.45));
  float arm=fa.x-mix(0.11,0.24,fa.y);
  float d=smin(fist,arm,0.05);
  return d;
}
vec4 sword(vec2 uv, float t){
  vec2 H=uP[2].yz; float sc=uP[2].w; float ang=uP[3].x; float ign=uP[3].y;
  vec2 p=(uv-H)/sc;
  vec2 s=rot(-ang)*p;
  float soft=PXW*1.5/sc+uP[7].x/sc;
  vec4 res=vec4(0.0);
  // slash trail (behind the blade)
  float tr=uP[3].z;
  if(tr>0.0){
    float r=length(p); float th=atan(-p.y,p.x);      // same clockwise convention as the blade angle
    float a0=uP[3].w; float span=ang-a0;
    float dth=atan(sin(th-a0),cos(th-a0));
    float f=dth/span;
    if(f>0.0 && f<1.0 && r>0.3 && r<2.15){
      float rp=smoothstep(0.95,1.45,r)*smoothstep(2.2,1.9,r);   // crescent near the tip, not a filled fan
      float streak=0.6+0.4*fbm(vec2(r*9.0,f*3.0-t*2.0),3);
      float k=pow(f,1.8)*rp*streak*tr;
      float edge=exp(-pow((1.0-f)*10.0,2.0))*rp*tr;          // crisp leading edge right behind the blade
      vec3 c=fireCol(0.7+0.8*k)*k*2.2+vec3(1.0,0.9,0.72)*edge*3.2;
      res=over(res,vec4(c,min(1.0,k*0.4+edge*0.45)));
    }
  }
  // blade
  float db=bladeSDF(s);
  if(db<soft+0.12){
    float e=0.003;
    vec2 n=gradOf(db,bladeSDF(s+vec2(e,0.0)),bladeSDF(s+vec2(0.0,e)));
    n=rot(ang)*n;
    float a=smoothstep(soft,-soft,db);
    float L=2.1;
    float w=mix(0.06,0.042,sat(s.x/L))*sat((L-s.x)/0.32);
    float v=s.y/max(w,1e-3);
    vec3 steel=vec3(0.06,0.06,0.065)*(0.6+0.8*smoothstep(-1.0,1.0,v));
    steel+=uP[6].rgb*0.35*(0.5+0.5*sin(s.x*2.4+0.6))*smoothstep(0.2,1.0,v);
    steel+=vec3(1.0,0.75,0.5)*exp(-pow((v-0.85)*6.0,2.0))*0.5;
    steel*=1.0-0.45*exp(-v*v*30.0)*step(0.12,s.x)*step(s.x,L*0.72);
    vec3 hot=fireCol(0.85);
    float along=smoothstep(ign*L+0.05,ign*L-0.15,s.x);
    float edgeHot=smoothstep(0.55,1.0,abs(v));               // the edges glow, the steel stays readable
    vec3 bc=mix(steel,steel*0.6+hot*(0.25+0.9*edgeHot),along*sat(ign*4.0));
    res=over(res,vec4(bc*a,a));
    // flames licking upward off the blade
    if(ign>0.0){
      float fd=max(db,0.0);
      vec2 fp=vec2(s.x*4.0-t*7.0,s.y*22.0+t*0.7);
      float fl=fbm(fp,4)*0.7+0.3*fbm(fp*vec2(0.5,2.0)+4.0,3);
      float flame=exp(-fd*fd/0.0022)*smoothstep(0.30,0.72,fl)*along*step(0.08,s.x)*smoothstep(2.1,1.6,s.x);
      vec3 fc=fireCol(0.7+0.5*flame)*flame*1.4*ign;
      res=over(res,vec4(fc,flame*0.2*ign));
    }
  }
  // hilt
  float dh=hiltSDF(s);
  if(dh<soft+0.02){
    float e=0.003; vec2 n=rot(ang)*gradOf(dh,hiltSDF(s+vec2(e,0.0)),hiltSDF(s+vec2(0.0,e)));
    res=over(res,mat2D(dh,n,vec3(0.05,0.038,0.025),vec2(0.0,1.0),ign*0.8,vec3(1.0,0.5,0.15),soft));
  }
  // gauntlet
  float dg=gauntletSDF(p,s);
  if(dg<soft+0.02){
    float e=0.003;
    vec2 n=gradOf(dg,gauntletSDF(p+vec2(e,0.0),rot(-ang)*(p+vec2(e,0.0))),gauntletSDF(p+vec2(0.0,e),rot(-ang)*(p+vec2(0.0,e))));
    vec2 fa=sdSeg2h(p,vec2(0.0,-0.02),vec2(1.35,-1.45));
    float plates=smoothstep(0.03,0.0,abs(fract(fa.y*7.0)-0.5)-0.44);
    vec3 alb=vec3(0.05,0.048,0.05)*(0.8+0.6*fbm(p*12.0,3))*(1.0-0.5*plates);
    vec4 m=mat2D(dg,n,alb,normalize(vec2(-0.6,0.8)),ign*0.9+0.2,vec3(1.0,0.5,0.16),soft);
    m.rgb+=vec3(0.9,0.8,0.7)*plates*0.06*m.a*(0.5+ign);
    res=over(res,m);
  }
  return res;
}
// ---------------------------------------------------------------- open hand reaching (hand space: palm at origin, fingers +y)
float reachSDF(vec2 q, float open){
  float d=sdEllipse2(q,vec2(0.15,0.17));
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec2 b=vec2(-0.10+fi*0.068,0.12);
    float an=(-0.28+fi*0.18)*mix(0.4,1.0,open);
    float L=vec4(0.20,0.25,0.24,0.19)[i]*mix(0.55,1.0,open);
    vec2 tip=b+vec2(sin(an),cos(an))*L;
    vec2 sh=sdSeg2h(q,b,tip);
    d=smin(d,sh.x-mix(0.036,0.026,sh.y),0.03);
  }
  vec2 th=sdSeg2h(q,vec2(0.11,-0.02),vec2(0.11,-0.02)+vec2(0.9,0.45)*0.19*mix(0.6,1.0,open));
  d=smin(d,th.x-mix(0.042,0.03,th.y),0.04);
  vec2 fa=sdSeg2h(q,vec2(0.0,-0.10),vec2(-0.05,-1.7));
  d=smin(d,fa.x-mix(0.13,0.22,fa.y),0.07);
  return d;
}
vec4 reach(vec2 uv){
  vec2 P=uP[4].yz; float sc=uP[4].w;
  vec2 q=rot(-uP[5].x)*(uv-P)/sc;
  float open=uP[5].y;
  float d=reachSDF(q,open);
  float soft=(PXW*1.5+uP[7].x)/sc;
  if(d>soft+0.02) return vec4(0.0);
  float e=0.003;
  vec2 n=rot(uP[5].x)*gradOf(d,reachSDF(q+vec2(e,0.0),open),reachSDF(q+vec2(0.0,e),open));
  vec2 toC=normalize(-uv+vec2(0.0,0.0001));
  vec3 alb=vec3(0.03,0.022,0.018)*(0.8+0.4*fbm(q*10.0,3));
  return mat2D(d,n,alb,toC,1.3,vec3(1.0,0.45,0.15),soft);
}
// ---------------------------------------------------------------- branch whipping past the lens
vec4 branch(vec2 uv, vec4 B, float seed){
  float ang=B.z; vec2 dir=vec2(cos(ang),sin(ang)); vec2 nrm=vec2(-dir.y,dir.x);
  float off=mix(-1.6,1.6,B.y)+B.w;
  vec2 q=vec2(dot(uv,dir),dot(uv,nrm)-off);
  float w=0.05+0.02*noise(vec2(q.x*3.0,seed));
  float d=abs(q.y+0.06*sin(q.x*2.0+seed))-w;
  for(int i=0;i<4;i++){ float fi=float(i); float bx=-0.7+fi*0.45+0.1*hash11(seed+fi);
    vec2 tw=sdSeg2h(q,vec2(bx,0.0),vec2(bx+0.25,(hash11(seed*3.0+fi)>0.5?1.0:-1.0)*0.32));
    d=min(d,tw.x-mix(0.025,0.006,tw.y)); }
  float soft=0.035+uP[7].x;
  float a=smoothstep(soft,-soft,d)*B.x;
  vec3 c=vec3(0.006,0.007,0.009)+uP[6].rgb*0.05*exp(-max(-d,0.0)/0.03);
  return vec4(c*a,a);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  PXW=1.0/uRes.y;
  float t=uTime;
  vec4 col=vec4(0.0);
  // falling lantern (drawn behind hands)
  if(uP[5].z>0.5){
    vec2 q=rot(-uP[10].w)*(uv-uP[10].xy)/uP[10].z;
    if(abs(q.x)<0.6 && abs(q.y)<1.0) col=over(col,lantern(q,uP[1].y,t));
    col.rgb+=vec3(1.0,0.5,0.15)*exp(-length(uv-uP[10].xy)/(uP[10].z*0.6))*0.25*uP[1].y;
  }
  if(uP[4].x>0.5) col=over(col,reach(uv));
  if(uP[0].x>0.5){
    float sc=uP[0].w; vec2 P=uP[0].yz;
    vec2 h=(uv-P)/sc;
    vec2 q=rot(-uP[1].x)*h+vec2(0.0,0.80);
    vec4 L=vec4(0.0);
    if(abs(q.x)<0.6 && q.y>-0.7 && q.y<1.0) L=lantern(q,uP[1].y,t);
    // soft light spill around the lantern
    vec2 fcH=rot(uP[1].x)*(vec2(0.0,-0.08)-vec2(0.0,0.80));
    float glow=exp(-length(h-fcH)*1.2)*0.10*uP[1].y;
    col.rgb+=vec3(1.0,0.48,0.15)*glow*(1.0-col.a);
    col=over(col,L);
    if(uP[1].w>0.5) col=over(col,handLantern(h,fcH,uP[1].y));
  }
  if(uP[2].x>0.5) col=over(col,sword(uv,t));
  if(uP[8].x>0.0) col=over(col,branch(uv,uP[8],3.0));
  if(uP[9].x>0.0) col=over(col,branch(uv,uP[9],11.0));
  fragColor=col;
}`;

VM.pack = function (o = {}) {
  const L = o.lantern, S = o.sword, H = o.reach, F = o.falling, A = o.branchA, Bb = o.branchB;
  const env = o.env || [0.5, 0.6, 0.8], amb = o.amb === undefined ? 0.05 : o.amb;
  return [
    L ? 1 : 0, ...(L ? L.pos : [0, 0]), L ? L.scale : 0.3,
    L ? L.rot || 0 : 0, (L || F) ? ((L || F).flame === undefined ? 1 : (L || F).flame) : 0, 0, L && L.hand !== false ? 1 : 0,
    S ? 1 : 0, ...(S ? S.pos : [0, 0]), S ? S.scale : 0.4,
    S ? S.ang : 0, S ? S.ignite || 0 : 0, S ? S.trail || 0 : 0, S ? S.trailFrom || 0 : 0,
    H ? 1 : 0, ...(H ? H.pos : [0, 0]), H ? H.scale : 0.3,
    H ? H.ang || 0 : 0, H ? (H.open === undefined ? 1 : H.open) : 1, F ? 1 : 0, 0,
    ...env, amb,
    o.soft || 0, 0, 0, 0,
    A ? A.on === undefined ? 1 : A.on : 0, A ? A.p : 0, A ? A.ang : 0, A ? A.off || 0 : 0,
    Bb ? Bb.on === undefined ? 1 : Bb.on : 0, Bb ? Bb.p : 0, Bb ? Bb.ang : 0, Bb ? Bb.off || 0 : 0,
    ...(F ? F.pos : [0, 0]), F ? F.scale : 0.1, F ? F.rot || 0 : 0,
    0, 0, 0, 0,
  ];
};

// camera basis (matches the forest shader) and a world point along a screen ray
VM.basis = function (ro, ta, roll = 0) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const cw = norm(sub(ta, ro));
  const cu = norm(cross(cw, [Math.sin(roll), Math.cos(roll), 0]));
  const cv = cross(cu, cw);
  return { cw, cu, cv };
};
VM.worldAt = function (ro, ta, roll, fl, uv, dist) {
  const { cw, cu, cv } = VM.basis(ro, ta, roll);
  const d = [0, 1, 2].map(i => uv[0] * cu[i] + uv[1] * cv[i] + fl * cw[i]);
  const l = Math.hypot(...d);
  return [0, 1, 2].map(i => ro[i] + d[i] / l * dist);
};
