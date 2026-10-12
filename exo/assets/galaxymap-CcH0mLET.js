import{Dt as e,F as t,I as n,K as r,U as i,X as a,Y as o,at as s,bt as c,d as l,f as u,ht as d,jt as f,mt as p,nt as m,p as h,pt as g,q as _,rt as v,tt as y,v as b,yt as x}from"./three-Do4x7iGi.js";var S=320,C=400,w={O:[.55,.68,1],B:[.68,.8,1],A:[.88,.92,1],F:[1,.97,.88],G:[1,.9,.62],K:[1,.68,.38],M:[1,.45,.3]},T={O:2,B:1.7,A:1.35,F:1.15,G:1,K:.82,M:.62},E={lush:`exuberante`,ocean:`oceânico`,frozen:`congelado`,toxic:`tóxico`,scorched:`escaldante`,exotic:`exótico`,radioactive:`radioativo`,barren:`estéril`,gas:`gigante gasoso`},D=`
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
uniform float uGain;
varying vec3 vColor;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize * uScale / d;
  gl_PointSize = clamp(px * 0.35, 1.0, 3.0);
  // estrelas resolvidas por cima do volume: brilho cai com a distância, some muito perto
  vI = uGain * clamp(px * 0.12, 0.12, 1.0) * smoothstep(300.0, 2500.0, d);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`,O=`
varying vec3 vColor;
varying float vI;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float g = exp(-dot(c, c) * 9.0);
  gl_FragColor = vec4(vColor * vI * g, 1.0);
}`,k=`
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uScale;
uniform float uGain;
varying vec3 vColor;
varying float vSeed;
varying float vI;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize * uScale / d;
  gl_PointSize = clamp(px, 2.0, 420.0);
  vI = uGain * smoothstep(2.0, 12.0, px) * smoothstep(420.0, 160.0, px);
  vColor = aColor;
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`,A=`
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float f2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }`,j=`
varying vec3 vColor;
varying float vSeed;
varying float vI;
${A}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  vec2 q = c * 3.0 + vSeed;
  float w = f2(q + f2(q * 1.7) * 1.5);
  float a = smoothstep(1.0, 0.2, r) * smoothstep(0.35, 0.85, w);
  gl_FragColor = vec4(vColor * a * vI, 1.0);
}`;`${A}`;var M=`
attribute vec3 aColor;
attribute float aSize;
attribute float aFlag;
uniform float uPx;
uniform float uScale;
uniform vec3 uFocus;
uniform float uRadius;
varying vec3 vColor;
varying float vFlag;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(0.1, -mv.z);
  // tamanho em pixels: classe + leve perspectiva
  float px = uPx * aSize * clamp(900.0 / d, 0.5, 2.2);
  gl_PointSize = clamp(px, 2.0, 40.0);
  float df = length(position - uFocus);
  vFade = smoothstep(16000.0, 4000.0, d) * (uRadius > 0.0 ? pow(smoothstep(uRadius, uRadius * 0.15, df), 1.5) : 1.0) * (0.15 + 0.85 * pow(aSize / 2.0, 1.6));
  vColor = aColor;
  vFlag = aFlag;
  gl_Position = projectionMatrix * mv;
}`,N=`
varying vec3 vColor;
varying float vFlag;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float core = exp(-r * r * 40.0);
  float halo = exp(-r * 5.0) * 0.4;
  float spikes = (exp(-abs(c.x) * 70.0) + exp(-abs(c.y) * 70.0)) * exp(-r * 3.5) * 0.3;
  vec3 sat = pow(vColor, vec3(1.8));
  vec3 col = sat * (core * 5.0 + halo * 2.2 + spikes * 1.5) + vec3(core * 0.8);
  col *= 1.0 + vFlag * 1.5;
  gl_FragColor = vec4(col * vFade, 1.0);
}`,P=`
uniform float uSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
  gl_Position = projectionMatrix * mv;
}`,F=`
uniform vec3 uColor;
uniform float uTime;
uniform float uKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a;
  if (uKind < 0.5) {
    // seleção: anel duplo pulsante com marcas
    float ring = smoothstep(0.06, 0.0, abs(r - 0.78)) + 0.6 * smoothstep(0.04, 0.0, abs(r - (0.55 + 0.08 * sin(uTime * 3.0))));
    float ang = atan(c.y, c.x);
    float ticks = step(0.9, abs(sin(ang * 2.0 + uTime))) * smoothstep(0.1, 0.0, abs(r - 0.92));
    a = ring + ticks;
  } else {
    // atual: losango
    float dmd = abs(c.x) + abs(c.y);
    a = smoothstep(0.05, 0.0, abs(dmd - 0.36)) + smoothstep(0.2, 0.0, dmd) * 0.25;
  }
  gl_FragColor = vec4(uColor * a, 1.0);
}`,I=`
attribute float aT;
varying float vT;
void main() {
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,L=`
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
varying float vT;
void main() {
  float d = fract(vT * uLen / 14.0 - uTime * 0.8);
  float a = smoothstep(0.0, 0.1, d) * smoothstep(0.65, 0.5, d);
  gl_FragColor = vec4(uColor * (0.35 + a * 1.4), 1.0);
}`,R=`
attribute float aT;
uniform vec3 uA;
uniform vec3 uB;
uniform float uPx;
varying float vT;
void main() {
  vT = aT;
  vec3 p = mix(uA, uB, aT);
  // arco suave acima do plano
  p.y += sin(aT * 3.14159) * length(uB - uA) * 0.08;
  gl_PointSize = uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,z=`
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
varying float vT;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float g = exp(-dot(c, c) * 10.0);
  float d = fract(vT * uLen / 10.0 - uTime * 0.6);
  float a = 0.25 + 1.2 * smoothstep(0.0, 0.15, d) * smoothstep(0.7, 0.45, d);
  gl_FragColor = vec4(uColor * a * g, 1.0);
}`,B=`
varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,V=e=>`
precision highp float;
uniform vec3 uCamPos;
uniform float uVolGain;
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
varying vec2 vNdc;
${e}
void main() {
  vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0);
  vec3 rd = normalize(mat3(uCamWorld) * (v.xyz / v.w));
  vec3 ro = uCamPos;
  float t0 = 0.0, t1 = 2e5;
  const float H = 4500.0, RC = 46000.0;
  if (abs(rd.y) > 1e-5) {
    float ta = (-H - ro.y) / rd.y, tb = (H - ro.y) / rd.y;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (abs(ro.y) > H) t1 = -1.0;
  // cilindro
  vec2 o = ro.xz, d = rd.xz;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - RC * RC;
  float disc = b * b - a * c;
  if (disc < 0.0 || a < 1e-9) { if (c > 0.0) t1 = -1.0; }
  else {
    float s = sqrt(disc);
    t0 = max(t0, (-b - s) / a);
    t1 = min(t1, (-b + s) / a);
  }
  vec3 acc = vec3(0.0);
  if (t1 > t0) {
    float T = 1.0;
    float jit = fract(sin(dot(vNdc, vec2(12.9898, 78.233))) * 43758.5453);
    float t = t0;
    for (int i = 0; i < 110; i++) {
      vec3 p = ro + rd * t;
      float dt = clamp(abs(p.y) * 0.4 + (t - t0) * 0.012, 14.0, 1600.0);
      vec3 pp = ro + rd * (t + dt * jit);
      vec3 em; float dust;
      galSample(pp, em, dust);
      // perto da câmera as estrelas são pontos resolvidos (camada de pontos), não névoa
      float far = smoothstep(150.0, 2600.0, t + dt * jit);
      acc += T * em * dt * 0.0011 * far;
      T *= exp(-dust * dt * 0.0016);
      t += dt;
      if (t > t1 || T < 0.02) break;
    }
  }
  acc *= 0.7 * uVolGain;
  acc = acc / (1.0 + 0.45 * acc);
  gl_FragColor = vec4(acc, 1.0);
}`;function H(e){return e>>>=0,()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}var U={name:`galaxymap`,order:66,init(t){var n;this.ctx=t,this.open=!1,this.built=!1,this.focus=new e,this.cam={yaw:.6,pitch:.75,dist:900},this.camT={...this.cam},this.selected=null,this.hover=null,this.local=[],this.localCenter=null,this.time=0,this.labels=[];let r=((n=t.shot)==null||(n=n.preset)==null?void 0:n.params)||{};this.shotOpen=!!r.mapOpen,this.removePass=t.pipeline.addPass(`afterCockpit`,(e,t)=>this.render(t),{order:30,owner:`galaxymap`}),this.offs=[t.bus.on(`system:enter`,()=>{this.built&&this.onSystem()})];let i=this;this.api=t.provide(`galaxymap`,{get open(){return i.open},show:()=>this.setOpen(!0),hide:()=>this.setOpen(!1),toggle:()=>this.setOpen(!this.open),select:e=>this.select(e)}),this.shotOpen&&this.setOpen(!0)},get uni(){return this.ctx.services.universe},get model(){var e;return((e=this.uni)==null||(e=e.galaxy)==null?void 0:e.model)||null},build(){var n;let r=this.model;if(!r)return!1;let a=this.ctx;this.scene=new p,this.camera=new m(55,16/9,1,2e6),this.world=new t,this.scene.add(this.world);let o=H(r.gseed^24301),f=((n=a.quality)==null?void 0:n.level)===`low`?7e4:15e4,_=r.sampleCloud(f,1),v=new Float32Array(_.count*3),y=new Float32Array(_.count),w=[[1,.86,.72],[.62,.76,1],[1,.8,.52],[1,.42,.72]];for(let e=0;e<_.count;e++){let t=_.kind[e],n=w[t],r=o();t===1&&r<.25&&(n=[.5,.85,1]),t===3&&r<.4&&(n=[.45,.7,1]),t===0&&r<.3&&(n=[1,.7,.5]);let i=(t===2?.55:t===3?1.8:t===1?1.15:.5)*(.5+o());v[e*3]=n[0]*i,v[e*3+1]=n[1]*i,v[e*3+2]=n[2]*i,y[e]=(t===2?220:140)*(.5+o())}let T=new u;T.setAttribute(`position`,new l(new Float32Array(_.pos),3)),T.setAttribute(`aColor`,new l(v,3)),T.setAttribute(`aSize`,new l(y,1)),this.cloudMat=new d({vertexShader:D,fragmentShader:O,uniforms:{uScale:{value:500},uGain:{value:.5}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0});let E=new s(T,this.cloudMat);E.frustumCulled=!1,E.renderOrder=1,this.world.add(E);let A=(e,t,n,r,i,a,c,f)=>{let p=[],m=[],h=[],g=[];for(let i=0;i<_.count&&p.length/3<e;i+=7){if(!t(_.kind[i],i))continue;p.push(_.pos[i*3],_.pos[i*3+1]*.6,_.pos[i*3+2]);let e=n[Math.floor(o()*n.length)];m.push(...e),h.push(r[0]+(r[1]-r[0])*o()),g.push(o()*100)}let v=new u;v.setAttribute(`position`,new l(new Float32Array(p),3)),v.setAttribute(`aColor`,new l(new Float32Array(m),3)),v.setAttribute(`aSize`,new l(new Float32Array(h),1)),v.setAttribute(`aSeed`,new l(new Float32Array(g),1));let y=new d({vertexShader:k,fragmentShader:i,uniforms:{uScale:{value:500},uGain:{value:f}},blending:a===`multiply`?5:a,depthTest:!1,depthWrite:!1,transparent:!0});a===`multiply`&&(y.blendSrc=200,y.blendDst=202,y.blendSrcAlpha=200,y.blendDstAlpha=201);let b=new s(v,y);return b.frustumCulled=!1,b.renderOrder=c,this.world.add(b),y};this.nebMat=A(1400,e=>e===3||e===1&&o()<.15,[[.22,.45,1],[.85,.25,.75],[.25,.85,.95],[.55,.3,1]],[700,2200],j,2,2,.07),this.dustMat=null,this.buildVolume();let B=(()=>{let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`),n=t.createRadialGradient(256/2,256/2,0,256/2,256/2,256/2);n.addColorStop(0,`rgba(255,250,235,1)`),n.addColorStop(.12,`rgba(255,225,170,0.75)`),n.addColorStop(.4,`rgba(255,170,90,0.18)`),n.addColorStop(1,`rgba(0,0,0,0)`),t.fillStyle=n,t.fillRect(0,0,256,256);let r=new h(e);return r.colorSpace=g,r})();this.coreTex=B;let V=new c({map:B,color:new b(1.3,1.1,.85),blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),U=new x(V);U.scale.set(14e3,14e3,1),U.renderOrder=4,this.world.add(U);let W=new x(V.clone());W.material.color.setRGB(2.6,2.3,1.9),W.scale.set(4200,4200,1),W.renderOrder=4,this.world.add(W);{let t=2500,n=new Float32Array(t*3),r=new Float32Array(t*3),i=new Float32Array(t);for(let e=0;e<t;e++){let t=o()*2-1,a=o()*Math.PI*2,s=Math.sqrt(1-t*t);n.set([s*Math.cos(a)*6e5,t*6e5,s*Math.sin(a)*6e5],e*3);let c=.15+.5*o()**3;r.set([c,c,c*1.1],e*3),i[e]=.35+o()*.4}let a=new u;a.setAttribute(`position`,new l(n,3)),a.setAttribute(`aColor`,new l(r,3)),a.setAttribute(`aSize`,new l(i,1)),a.setAttribute(`aFlag`,new l(new Float32Array(t),1));let c=new s(a,new d({vertexShader:M,fragmentShader:N,uniforms:{uPx:{value:3},uScale:{value:500},uFocus:{value:new e},uRadius:{value:0}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0}));c.frustumCulled=!1,c.renderOrder=0,this.bg=c,this.scene.add(c)}this.localGeo=new u,this.localMat=new d({vertexShader:M,fragmentShader:N,uniforms:{uPx:{value:9},uScale:{value:500},uFocus:{value:new e},uRadius:{value:C}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this.localPts=new s(this.localGeo,this.localMat),this.localPts.frustumCulled=!1,this.localPts.renderOrder=6,this.world.add(this.localPts);let G=(t,n,r)=>{let i=new u;i.setAttribute(`position`,new l(new Float32Array(3),3));let a=new s(i,new d({vertexShader:P,fragmentShader:F,uniforms:{uSize:{value:r},uColor:{value:new e(...n)},uTime:{value:0},uKind:{value:t}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0}));return a.frustumCulled=!1,a.renderOrder=8,this.world.add(a),a};this.selMark=G(0,[1.6,1.25,.5],46),this.curMark=G(1,[.4,1.4,1.6],30);let K=new u;K.setAttribute(`position`,new l(new Float32Array(6),3)),K.setAttribute(`aT`,new l(new Float32Array([0,1]),1)),this.routeMat=new d({vertexShader:I,fragmentShader:L,uniforms:{uColor:{value:new e(1.4,1.1,.45)},uTime:{value:0},uLen:{value:100}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0});{let t=new Float32Array(400);for(let e=0;e<400;e++)t[e]=e/399;K.setAttribute(`position`,new l(new Float32Array(400*3),3)),K.setAttribute(`aT`,new l(t,1)),this.routeMat.vertexShader=R,this.routeMat.fragmentShader=z,this.routeMat.uniforms.uA={value:new e},this.routeMat.uniforms.uB={value:new e},this.routeMat.uniforms.uPx={value:4}}this.route=new s(K,this.routeMat),this.route.frustumCulled=!1,this.route.renderOrder=7,this.world.add(this.route);{let t=new Float32Array(483),n=new Float32Array(161);for(let e=0;e<=160;e++){let r=e/160*Math.PI*2;t.set([Math.cos(r)*S,0,Math.sin(r)*S],e*3),n[e]=e/160}let r=new u;r.setAttribute(`position`,new l(t,3)),r.setAttribute(`aT`,new l(n,1));let a=new d({vertexShader:I,fragmentShader:L,uniforms:{uColor:{value:new e(.18,.45,.6)},uTime:{value:0},uLen:{value:Math.PI*2*S*.25}},blending:2,depthTest:!1,depthWrite:!1,transparent:!0});this.rangeRing=new i(r,a),this.rangeRing.frustumCulled=!1,this.rangeRing.renderOrder=5,this.world.add(this.rangeRing),this.rangeMat=a}return this.buildUI(),this.built=!0,this.onSystem(),!0},buildVolume(){let t=this.uni.galaxy,i={uCamPos:{value:new e},uVolGain:{value:1},uCamWorld:{value:new o},uProjInv:{value:new o},uJit:{value:0}};for(let[e,n]of Object.entries(t.glslUniforms||{}))i[e]={value:n};this.volMat=new d({vertexShader:B,fragmentShader:V(t.glsl),uniforms:i,depthTest:!1,depthWrite:!1}),this.volRT=new f(4,4,{type:n,depthBuffer:!1}),this.volRT.texture.colorSpace=r,this.orthoCam=new y(-1,1,1,-1,0,1),this.volScene=new p;let s=new a(new v(2,2),this.volMat);s.frustumCulled=!1,this.volScene.add(s),this.compMat=new d({vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:`uniform sampler2D tVol; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tVol, vUv).rgb, 1.0); }`,uniforms:{tVol:{value:this.volRT.texture}},depthTest:!1,depthWrite:!1}),this.compScene=new p;let c=new a(new v(2,2),this.compMat);c.frustumCulled=!1,this.compScene.add(c),this.volKey=``},onSystem(){var e;let t=(e=this.uni)==null?void 0:e.currentSystem;if(!t)return;let n=t.galacticPosition;this.current={index:t.index,pos:n},this.focus.set(n[0],n[1],n[2]),this.localCenter=null,this.selected=null,this.refreshLocal(),this.updateInfo()},refreshLocal(){let t=this.model,n=this.cam.dist<3500||!this.current?this.focus:new e(...this.current.pos);if(this.localCenter&&this.localCenter.distanceTo(n)<90)return;this.localCenter=n.clone();let r=t.systemsNear([n.x,n.y,n.z],C,3500),i=r.length,a=new Float32Array(i*3),o=new Float32Array(i*3),s=new Float32Array(i),c=new Float32Array(i);this.local=r.map((e,n)=>{let r=t.star(e.index);a.set(e.pos,n*3);let i=w[r.cls];return o.set(i,n*3),s[n]=T[r.cls]*(r.binary?1.15:1),{index:e.index,pos:e.pos,star:r}}),this.localFlag=c;let u=this.localGeo;u.setAttribute(`position`,new l(a,3)),u.setAttribute(`aColor`,new l(o,3)),u.setAttribute(`aSize`,new l(s,1)),u.setAttribute(`aFlag`,new l(c,1)),u.computeBoundingSphere()},select(e){let t=this.model;if(e==null||!t){this.selected=null,this.updateInfo();return}e=t.resolve(e);let n=t.star(e);this.selected={index:e,pos:n.pos,star:n,info:this.uni.systemInfo(e)},this.updateInfo()},autoSelect(){let e=this.local.filter(e=>{let t=Math.hypot(e.pos[0]-this.current.pos[0],e.pos[1]-this.current.pos[1],e.pos[2]-this.current.pos[2]);return t>120&&t<300&&e.index!==this.current.index}),t=e=>({O:5,B:4,A:3,F:2,G:2,K:1,M:0})[e.star.cls]+(e.star.binary?1.5:0);e.sort((e,n)=>t(n)-t(e)),e[0]&&this.select(e[0].index)},buildUI(){let e=this.ctx,t=document.createElement(`div`);t.className=`gmap`,t.style.cssText=`position:absolute;inset:0;display:none;pointer-events:none;font-family:system-ui,"Segoe UI",sans-serif;color:#dfe9ff`,t.innerHTML=`
      <style>
        .gmap .panel{position:absolute;right:28px;top:50%;transform:translateY(-50%);width:300px;padding:18px 20px;background:linear-gradient(180deg,rgba(10,18,40,.72),rgba(6,10,24,.6));border:1px solid rgba(140,190,255,.28);border-radius:4px;backdrop-filter:blur(6px);box-shadow:0 0 40px rgba(60,120,255,.15)}
        .gmap h2{margin:0 0 2px;font-size:22px;letter-spacing:.12em;font-weight:600;text-transform:uppercase}
        .gmap .sub{font-size:11px;letter-spacing:.28em;text-transform:uppercase;opacity:.65;margin-bottom:12px}
        .gmap .row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px solid rgba(140,190,255,.12)}
        .gmap .row b{font-weight:600;color:#fff}
        .gmap .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;box-shadow:0 0 8px currentColor}
        .gmap .pl{font-size:12px;opacity:.85;line-height:1.6;margin-top:8px}
        .gmap .btn{margin-top:14px;width:100%;padding:10px 0;font:600 13px system-ui;letter-spacing:.3em;text-transform:uppercase;color:#0b1020;background:linear-gradient(90deg,#ffd27a,#ffb347);border:0;border-radius:2px;cursor:pointer;pointer-events:auto}
        .gmap .btn[disabled]{background:#3a4258;color:#8b93a8;cursor:default}
        .gmap .top{position:absolute;left:28px;top:24px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;opacity:.9;text-shadow:0 0 10px #000,0 0 3px #000}
        .gmap .top b{display:block;font-size:20px;letter-spacing:.16em;opacity:1;margin-top:4px}
        .gmap .hint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);font-size:11px;letter-spacing:.2em;opacity:.55;text-transform:uppercase;white-space:nowrap}
        .gmap .lbl{position:absolute;font-size:10px;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap;transform:translate(10px,-50%);text-shadow:0 0 6px #000;opacity:.8}
        .gmap .lbl.sel{font-size:12px;color:#ffd894;opacity:1}
        .gmap .lbl.cur{color:#8ff0ff;opacity:1}
      </style>
      <div class="top"></div>
      <div class="panel"></div>
      <div class="labels"></div>
      <div class="hint">arrastar: girar · roda: zoom · botão direito / WASD: mover · clique: selecionar · enter: saltar · M: fechar</div>`,e.ui.appendChild(t),this.ui={root:t,top:t.querySelector(`.top`),panel:t.querySelector(`.panel`),labels:t.querySelector(`.labels`)};let n=e.canvas,r=null,i=e=>{this.open&&(r={x:e.clientX,y:e.clientY,b:e.button,moved:0},e.preventDefault())},a=e=>{if(!this.open||(this.mouse={x:e.clientX,y:e.clientY},!r))return;let t=e.clientX-r.x,n=e.clientY-r.y;r.x=e.clientX,r.y=e.clientY,r.moved+=Math.abs(t)+Math.abs(n),r.b===2||e.shiftKey?this.pan(-t,-n):(this.camT.yaw-=t*.005,this.camT.pitch=Math.max(-1.45,Math.min(1.45,this.camT.pitch+n*.005)))},o=e=>{!this.open||!r||(r.moved<5&&r.b===0&&this.pick(e.clientX,e.clientY),r=null)},s=e=>{this.open&&(e.preventDefault(),this.camT.dist=Math.max(25,Math.min(14e4,this.camT.dist*Math.exp(e.deltaY*.0012))))},c=e=>{this.open&&e.preventDefault()};n.addEventListener(`pointerdown`,i),addEventListener(`pointermove`,a),addEventListener(`pointerup`,o),n.addEventListener(`wheel`,s,{passive:!1}),n.addEventListener(`contextmenu`,c),this.unlisten=()=>{n.removeEventListener(`pointerdown`,i),removeEventListener(`pointermove`,a),removeEventListener(`pointerup`,o),n.removeEventListener(`wheel`,s),n.removeEventListener(`contextmenu`,c)}},updateInfo(){if(!this.ui)return;let e=this.uni,t=e.galaxy,n=e.currentSystem,r=e=>Math.round(e).toLocaleString(`pt-BR`);this.ui.top.innerHTML=`galáxia ${t.name} · ~${r(t.systemCount/1e6)} milhões de sistemas<b>${n.name}</b>`;let i=this.selected;if(!i){this.ui.panel.innerHTML=`<h2>${n.name}</h2><div class="sub">sistema atual · classe ${n.class}</div><div class="pl">${n.planets.map(e=>`${e.name} — ${E[e.biome]||e.biome}`).join(`<br>`)}</div><div class="row"><span>alcance do salto</span><b>${S} al</b></div>`;return}let a=i.info,o=w[a.class].map(e=>Math.round(Math.min(1,e)*255)).join(`,`),s=a.distance,c=s<=S&&!a.current,l=Math.max(1,Math.ceil(s/S));this.ui.panel.innerHTML=`
      <h2>${a.name}</h2>
      <div class="sub"><span class="dot" style="color:rgb(${o});background:rgb(${o})"></span>classe ${a.class}${a.binary?` · binária`:``} · ${r(a.temperature)} K</div>
      <div class="row"><span>distância</span><b>${s.toFixed(1)} al</b></div>
      <div class="row"><span>saltos</span><b>${a.current?`—`:l}</b></div>
      <div class="row"><span>planetas</span><b>${a.planets.length}</b></div>
      <div class="row"><span>cinturão / estação</span><b>${a.belt?`sim`:`não`} / ${a.station?`sim`:`não`}</b></div>
      <div class="pl">${a.planets.map(e=>`${e.name} — ${E[e.biome]||e.biome}${e.rings?` · anéis`:``}${e.moons?` · ${e.moons} lua${e.moons>1?`s`:``}`:``}`).join(`<br>`)}</div>
      <button class="btn" ${c?``:`disabled`}>${a.current?`você está aqui`:c?`saltar`:`fora de alcance`}</button>`;let u=this.ui.panel.querySelector(`.btn`);u==null||u.addEventListener(`click`,()=>this.jump())},setOpen(e){let t=this.ctx;if(e===this.open||e&&!this.built&&!this.build())return;this.open=e,this.ui.root.style.display=e?`block`:`none`;let n=t.player,r=t.services.render;if(e){if(this.prev={move:n.moveEnabled,look:n.lookEnabled,auto:r==null?void 0:r.autoExposure,exp:r==null?void 0:r.exposure,layers:t.camera.layers.mask},t.camera.layers.disableAll(),!t.shot){var i,a;n.moveEnabled=!1,n.lookEnabled=!1,(i=(a=t.input).exitLock)==null||i.call(a),t.input.wantsLock=!1}if(r&&!t.shot){var o;r.autoExposure=!1,(o=r.setExposure)==null||o.call(r,1)}this.onSystem(),this.cam={...this.camT}}else if(this.prev&&(t.camera.layers.mask=this.prev.layers,n.moveEnabled=this.prev.move,n.lookEnabled=this.prev.look,t.shot||(t.input.wantsLock=!0),r&&this.prev.auto!=null)){var s;r.autoExposure=this.prev.auto,this.prev.exp&&((s=r.setExposure)==null||s.call(r,this.prev.exp))}t.bus.emit(`galaxymap:toggle`,{open:e})},pan(t,n){let r=this.cam.dist*.0016,i=new e(-Math.sin(this.cam.yaw),0,-Math.cos(this.cam.yaw)),a=new e(Math.cos(this.cam.yaw),0,-Math.sin(this.cam.yaw));this.focus.addScaledVector(a,t*r).addScaledVector(i,-n*r)},pick(t,n){let r=this.ctx.canvas.getBoundingClientRect(),i=(t-r.left)/r.width*2-1,a=-((n-r.top)/r.height)*2+1,o=new e,s=null,c=16/r.width*2;c*=c;for(let e of this.local){if(o.set(e.pos[0]-this.focus.x,e.pos[1]-this.focus.y,e.pos[2]-this.focus.z).project(this.camera),o.z>1)continue;let t=(o.x-i)**2+((o.y-a)*r.height/r.width)**2;t<c&&(c=t,s=e)}this.select(s?s.index:null)},jump(){let e=this.selected;!e||e.info.current||e.info.distance>S||(this.setOpen(!1),this.uni.warpTo(e.index,0,{tunnel:!0}))},update(e,t){let n=t.input;if(this.shotOpen)return;if(n.pressed(`map`)){var r,i;(r=n.consume)==null||r.call(n,`map`),(i=this.uni)!=null&&i.warping||this.setOpen(!this.open)}if(!this.open)return;if(n.pressed(`pause`)){var a;(a=n.consume)==null||a.call(n,`pause`),this.setOpen(!1);return}(n.down(`Enter`)||n.pressed(`interact`))&&this.jump(),n.down(`KeyC`)&&this.selected&&this.focus.set(...this.selected.pos);let o=120*e*60;n.action(`forward`)&&this.pan(0,-o*.06),n.action(`back`)&&this.pan(0,o*.06),n.action(`left`)&&this.pan(-o*.06,0),n.action(`right`)&&this.pan(o*.06,0)},frame(e,t){if(!this.open||!this.built)return;if(this.shotOpen&&!this._shotInit){var n,r;this._shotInit=!0;let e=t.shot.preset.params;if(e.mapCam&&Object.assign(this.camT,e.mapCam),((n=e.mapCam)==null?void 0:n.yaw)===`core`||typeof((r=e.mapCam)==null?void 0:r.coreYaw)==`number`){let t=this.current.pos;this.camT.yaw=Math.atan2(t[0],t[2])+(e.mapCam.coreYaw||0)}if(this.cam={...this.camT},e.mapSelect===`auto`?this.autoSelect():e.mapSelect!=null&&this.select(e.mapSelect),e.mapFocusMid&&this.selected){let e=this.current.pos,t=this.selected.pos;this.focus.set((e[0]+t[0])/2,(e[1]+t[1])/2,(e[2]+t[2])/2)}e.mapFocusToward&&(this.focus.multiplyScalar(1-e.mapFocusToward),this.localCenter=null,this.refreshLocal()),e.mapShift&&(this.cam={...this.camT},this.pan(e.mapShift[0],e.mapShift[1]))}this.time+=t.time.frozen?0:e;let i=1-Math.exp(-e*10);for(let e of[`yaw`,`pitch`,`dist`])this.cam[e]+=(this.camT[e]-this.cam[e])*(t.shot?1:i);this.refreshLocal()},render(e){if(!this.open||!this.built)return;let t=this.ctx.renderer,n=e.width,r=e.height,i=this.camera;i.aspect=n/Math.max(1,r);let a=this.cam;i.position.set(Math.sin(a.yaw)*Math.cos(a.pitch),Math.sin(a.pitch),Math.cos(a.yaw)*Math.cos(a.pitch)).multiplyScalar(a.dist),i.up.set(0,1,0),i.lookAt(0,0,0),i.near=Math.max(.5,a.dist*.002),i.far=2e6,i.updateProjectionMatrix(),i.updateMatrixWorld(),this.world.position.set(-this.focus.x,-this.focus.y,-this.focus.z),this.world.updateMatrixWorld(!0),this.bg.position.copy(i.position);let o=r/(2*Math.tan(i.fov*Math.PI/360));this.cloudMat.uniforms.uScale.value=o,this.nebMat.uniforms.uScale.value=o,this.localMat.uniforms.uPx.value=Math.max(4,r/110),this.localCenter&&this.localMat.uniforms.uFocus.value.copy(this.localCenter);let s=this.time,c=(e,t)=>{let n=e.geometry.attributes.position;n.setXYZ(0,t[0],t[1],t[2]),n.needsUpdate=!0};c(this.curMark,this.current.pos),this.curMark.material.uniforms.uSize.value=Math.max(22,r/26),this.rangeRing.position.set(this.current.pos[0],this.current.pos[1],this.current.pos[2]),this.rangeMat.uniforms.uTime.value=s*.2;let l=this.selected;this.selMark.visible=!!l,this.route.visible=!!l&&!l.info.current,l&&(c(this.selMark,l.pos),this.selMark.material.uniforms.uTime.value=s,this.selMark.material.uniforms.uSize.value=Math.max(34,r/15),this.routeMat.uniforms.uA.value.set(...this.current.pos),this.routeMat.uniforms.uB.value.set(...l.pos),this.routeMat.uniforms.uPx.value=Math.max(3,r/180),this.routeMat.uniforms.uTime.value=s,this.routeMat.uniforms.uLen.value=l.info.distance);let u=t.getClearColor(new b),d=t.getClearAlpha(),f=t.autoClear,p=Math.max(4,n>>1),m=Math.max(4,r>>1);(this.volRT.width!==p||this.volRT.height!==m)&&(this.volRT.setSize(p,m),this.volKey=``);let h=this.volMat.uniforms,g=_.smoothstep(a.dist,1200,9e3);h.uVolGain.value=.22+.78*g,this.cloudMat.uniforms.uGain.value=.5*(.25+.75*g),h.uCamPos.value.copy(i.position).add(this.focus),h.uCamWorld.value.copy(i.matrixWorld),h.uProjInv.value.copy(i.projectionMatrixInverse);let v=`${h.uCamPos.value.toArray().map(e=>e.toFixed(1))}|${i.quaternion.toArray().map(e=>e.toFixed(4))}|${p}|${h.uVolGain.value.toFixed(3)}`;t.autoClear=!1,v!==this.volKey&&(this.volKey=v,t.setRenderTarget(this.volRT),t.render(this.volScene,this.orthoCam)),t.setRenderTarget(e),t.setClearColor(66056,1),t.clear(!0,!0,!1),t.render(this.compScene,this.orthoCam),t.render(this.scene,i),t.autoClear=f,t.setClearColor(u,d),this.updateLabels(n,r)},updateLabels(){let t=this.ui.labels,n=this.ctx.canvas.getBoundingClientRect(),r=new e,i=[];if(this.current&&i.push({pos:this.current.pos,name:this.uni.currentSystem.name,cls:`cur`}),this.selected&&!this.selected.info.current&&i.push({pos:this.selected.pos,name:this.selected.info.name,cls:`sel`}),this.cam.dist<2500)for(let e of this.local.slice(1,10))this.selected&&e.index===this.selected.index||i.push({pos:e.pos,name:e.star.name,cls:``});for(;t.children.length<i.length;)t.appendChild(document.createElement(`div`));let a=[];[...t.children].forEach((e,t)=>{let o=i[t];if(!o){e.style.display=`none`;return}r.set(o.pos[0]-this.focus.x,o.pos[1]-this.focus.y,o.pos[2]-this.focus.z).project(this.camera);let s=(r.x+1)/2*n.width,c=(1-r.y)/2*n.height,l=()=>a.some(e=>Math.abs(e[0]-s)<110&&Math.abs(e[1]-c)<15),u=l();if(u&&o.cls){for(let e=0;e<3&&u;e++)c-=16,u=l();u=!1}if(r.z>1||Math.abs(r.x)>1.1||Math.abs(r.y)>1.1||u&&!o.cls){e.style.display=`none`;return}a.push([s,c]),e.style.display=`block`,e.className=`lbl ${o.cls}`,e.textContent=o.name,e.style.left=`${s}px`,e.style.top=`${c}px`})},dispose(){var e,t,n,r,i,a,o,s;for(let e of this.offs||[])e();(e=this.removePass)==null||e.call(this),(t=this.unlisten)==null||t.call(this),(n=this.ui)==null||n.root.remove(),(r=this.scene)==null||r.traverse(e=>{var t,n,r,i;(t=e.geometry)==null||(n=t.dispose)==null||n.call(t),(r=e.material)==null||(i=r.dispose)==null||i.call(r)}),(i=this.coreTex)==null||i.dispose(),(a=this.volRT)==null||a.dispose(),(o=this.volMat)==null||o.dispose(),(s=this.compMat)==null||s.dispose()}};export{U as default};
//# sourceMappingURL=galaxymap-CcH0mLET.js.map