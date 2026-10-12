import{C as e,E as t,F as n,G as r,I as i,M as a,St as o,U as s,ct as c,d as l,f as u,g as d,i as f,j as p,nt as m,st as h,vt as g,z as _}from"./three-EnWzsccR.js";var v={clear:{coverage:null,typeBias:0,storm:0,darkness:0,precip:0,fog:0,fogH:1200,fogTint:[1,1,1],lightning:0,wind:7,cirrus:.75,detail:.6,lens:0,heat:0},cloudy:{coverage:.82,typeBias:-.2,storm:.1,darkness:.2,precip:0,fog:4e-5,fogH:1500,fogTint:[.85,.88,.92],lightning:0,wind:10,cirrus:.3,detail:.55,lens:0,heat:0},storm:{coverage:.84,typeBias:.35,storm:1,darkness:.8,precip:1,fog:7e-5,fogH:1100,fogTint:[.4,.45,.52],lightning:.14,wind:17,cirrus:0,detail:.45,lens:1,heat:0},acid:{coverage:.9,typeBias:.35,storm:.6,darkness:.55,precip:.85,fog:45e-5,fogH:1400,fogTint:[.78,.95,.36],lightning:.05,wind:11,cirrus:0,detail:.48,lens:1,heat:0},blizzard:{coverage:.97,typeBias:-.5,storm:.25,darkness:.45,precip:1,fog:.0016,fogH:900,fogTint:[.86,.91,1],lightning:0,wind:21,cirrus:0,detail:.5,lens:1,heat:0},dust:{coverage:.3,typeBias:-.25,storm:0,darkness:.15,precip:1,fog:.0011,fogH:650,fogTint:null,lightning:0,wind:19,cirrus:.3,detail:.6,lens:1,heat:.35},heat:{coverage:.12,typeBias:-.3,storm:0,darkness:0,precip:.35,fog:28e-5,fogH:500,fogTint:null,lightning:0,wind:9,cirrus:.5,detail:.6,lens:.4,heat:1}},y={clear:null,cloudy:null,storm:`rain`,acid:`acid`,blizzard:`snow`,dust:`dust`,heat:`dust`},b={lush:.5,ocean:.58,frozen:.52,toxic:.6,radioactive:.4,scorched:.24,barren:.18,exotic:.46},x={lush:[[`clear`,6],[`cloudy`,2],[`storm`,1.5]],ocean:[[`clear`,5],[`cloudy`,3],[`storm`,2]],frozen:[[`clear`,4],[`cloudy`,2],[`blizzard`,2.5]],toxic:[[`clear`,4],[`cloudy`,2],[`acid`,2.5]],radioactive:[[`clear`,4],[`dust`,1.5],[`acid`,1.2]],scorched:[[`clear`,4],[`heat`,2.5],[`dust`,2]],barren:[[`clear`,6],[`dust`,2]],exotic:[[`clear`,5],[`cloudy`,2],[`storm`,1]]},S=[`typeBias`,`storm`,`darkness`,`precip`,`fog`,`fogH`,`lightning`,`wind`,`cirrus`,`detail`,`lens`,`heat`,`coverage`];function C(e,{cover:t=.45,dustTint:n=[.9,.62,.35]}={}){let r=v[e]||v.clear,i={...r};return i.coverage=r.coverage==null?t:r.coverage,i.fogTint=(r.fogTint||n).slice(),i}function ee(e,t,n,r){for(let i of S)e[i]=t[i]+(n[i]-t[i])*r;return e.fogTint=[0,1,2].map(e=>t.fogTint[e]+(n.fogTint[e]-t.fogTint[e])*r),e}function w(e){return{...e,fogTint:e.fogTint.slice()}}var T=`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aSeed;
attribute vec2 aCorner;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uOffset;
uniform mat3 uFrame;      // local (leste, cima, norte) → render
uniform vec3 uVel;        // velocidade local (m/s)
uniform vec3 uCamVel;     // velocidade local da câmera
uniform float uSize;
uniform float uStretch;   // s de exposição do risco
uniform float uKind;      // 0 chuva, 1 neve, 2 poeira
uniform float uCount;     // fração de partículas ativas (intensidade)
uniform float uFar;
varying vec2 vC;
varying float vA;
void main() {
  float isOn = step(aSeed.w, uCount);
  float sp = 0.75 + 0.5 * fract(aSeed.w * 7.31);
  vec3 vel = uVel * sp;
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  if (uKind > 0.5) {
    // balanço (neve/poeira): turbulência por partícula
    float ph = aSeed.w * 40.0;
    p += vec3(sin(uTime * 1.3 + ph), 0.35 * sin(uTime * 0.9 + ph * 1.7), cos(uTime * 1.1 + ph * 0.7)) * (uKind > 1.5 ? 2.5 : 0.7);
  }
  p = mod(p - uOffset, uBox) - uBox * 0.5;
  vec3 w = uFrame * p;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float dist = -mv.z;
  vec3 rel = uFrame * (vel - uCamVel);
  vec3 vv = (viewMatrix * vec4(rel, 0.0)).xyz;
  vec3 a = mv.xyz;
  vec3 b = mv.xyz - vv * uStretch;
  float size = uSize * (uKind > 1.5 ? (0.4 + 2.2 * fract(aSeed.w * 13.7)) : (0.6 + 0.8 * fract(aSeed.w * 3.3)));
  // nunca mais fino que ~1 pixel (senão some no SwiftShader/baixa resolução)
  float pix = dist * 2.0 / (projectionMatrix[1][1] * uFar);
  float fat = max(1.0, pix / max(size, 1e-4));
  size *= fat;
  vec3 pos;
  if (uKind < 0.5) {
    // risco: lado perpendicular ao risco na tela
    vec3 d = b - a;
    vec3 side = normalize(cross(d + vec3(1e-5, 0.0, 0.0), a));
    pos = mix(a, b, aCorner.y) + side * aCorner.x * size;
  } else {
    pos = a + vec3(aCorner.x, aCorner.y * 2.0 - 1.0, 0.0) * size;
  }
  vC = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  float fadeNear = smoothstep(0.25, 1.2, dist);
  float fadeFar = 1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p));
  vA = isOn / fat * fadeNear * fadeFar * (dist > 0.0 ? 1.0 : 0.0);
  gl_Position = projectionMatrix * vec4(pos, 1.0);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}`,E=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uAlpha;
uniform float uKind;
varying vec2 vC;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  float m;
  if (uKind < 0.5) m = (1.0 - vC.x * vC.x) * smoothstep(-1.0, -0.6, vC.y) * (1.0 - smoothstep(0.6, 1.0, vC.y));
  else {
    float r = length(vC);
    m = uKind > 1.5 ? pow(max(0.0, 1.0 - r), 2.0) : smoothstep(1.0, 0.35, r);
  }
  float a = m * vA * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`,D={rain:{kind:0,count:1e4,box:[40,40,40],vel:[0,-11,0],size:.006,stretch:.06,alpha:.3},acid:{kind:0,count:9e3,box:[40,40,40],vel:[0,-8,0],size:.016,stretch:.05,alpha:.55},snow:{kind:1,count:9e3,box:[34,34,34],vel:[0,-1.4,0],size:.035,stretch:0,alpha:.9},dust:{kind:2,count:2600,box:[60,30,60],vel:[0,-.2,0],size:.9,stretch:0,alpha:.09}},O=class{constructor(e,a=1){this.ctx=e,this.scene=new h,this.layers={};for(let[o,l]of Object.entries(D)){let u=Math.max(200,Math.round(l.count*a)),f=new i;f.setAttribute(`position`,new t([0,0,0,0,0,0,0,0,0,0,0,0],3)),f.setAttribute(`aCorner`,new t([-1,0,1,0,1,1,-1,1],2)),f.setIndex([0,1,2,0,2,3]);let p=new Float32Array(u*4),m=e.seed.derive(`weather`,`particles`,o);for(let e=0;e<u*4;e++)p[e]=m.next();f.setAttribute(`aSeed`,new n(p,4)),f.instanceCount=u;let h=new c({vertexShader:T,fragmentShader:E,uniforms:{uTime:{value:0},uBox:{value:new g(...l.box)},uOffset:{value:new g},uFrame:{value:new s},uVel:{value:new g(...l.vel)},uCamVel:{value:new g},uSize:{value:l.size},uStretch:{value:l.stretch},uKind:{value:l.kind},uCount:{value:0},uFar:{value:1},uColor:{value:new d(1,1,1)},uAlpha:{value:l.alpha}},transparent:!0,depthWrite:!1,depthTest:!0,side:2,blending:5,blendEquation:100,blendSrc:201,blendDst:205}),_=new r(f,h);_.frustumCulled=!1,_.visible=!1,this.scene.add(_),this.layers[o]={mesh:_,mat:h,cfg:l}}this._frame=new s}update({time:e,levels:t,frame:n,camLocal:r,camVel:i,wind:a,colors:o,viewH:s=540}){this._frame.set(n.east.x,n.up.x,n.north.x,n.east.y,n.up.y,n.north.y,n.east.z,n.up.z,n.north.z);let c=!1;for(let[n,l]of Object.entries(this.layers)){let u=t[n]||0;if(l.mesh.visible=u>.01,!l.mesh.visible)continue;c=!0;let d=l.mat.uniforms;d.uTime.value=e,d.uFrame.value.copy(this._frame);let f=d.uBox.value;d.uOffset.value.set(k(r.x,f.x),k(r.y,f.y),k(r.z,f.z));let p=l.cfg.kind,m=p===0?.55:p===1?.9:1;d.uVel.value.set(l.cfg.vel[0]+a.x*m,l.cfg.vel[1]+a.y*m,l.cfg.vel[2]+a.z*m),d.uCamVel.value.copy(i),d.uCount.value=u,d.uColor.value.copy(o[n]||o.rain),d.uFar.value=s}return c}render(e,t){e.render(this.scene,t)}dispose(){for(let e of Object.values(this.layers))e.mesh.geometry.dispose(),e.mat.dispose()}};function k(e,t){return e-Math.floor(e/t)*t}var A=`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aOther;
attribute vec3 aInfo;     // x = lado (−1/1), y = largura (m), z = brilho
varying float vSide;
varying float vB;
void main() {
  vec4 a = modelViewMatrix * vec4(position, 1.0);
  vec4 b = modelViewMatrix * vec4(aOther, 1.0);
  vec3 d = b.xyz - a.xyz;
  vec3 side = normalize(cross(d + vec3(1e-4, 0.0, 0.0), a.xyz));
  // largura mínima em pixels: o raio continua visível de longe
  float w = max(aInfo.y, -a.z * 0.0016);
  a.xyz += side * aInfo.x * w;
  vSide = aInfo.x;
  vB = aInfo.z;
  gl_Position = projectionMatrix * a;
  #include <logdepthbuf_vertex>
}`,j=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uFlash;
varying float vSide;
varying float vB;
void main() {
  #include <logdepthbuf_fragment>
  float core = 1.0 - smoothstep(0.0, 1.0, abs(vSide));
  float a = core * core * vB * uFlash;
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor * a, 0.0);
}`;function M(e,t,n,r,i,a,o,s){let c=[e.clone(),t.clone()],l=e.distanceTo(t),u=l*.16,d=t.clone().sub(e).normalize(),f=new g;for(let e=0;e<r;e++){let e=[c[0]];for(let t=0;t<c.length-1;t++){let r=c[t],i=c[t+1],a=r.clone().add(i).multiplyScalar(.5);f.set(n()-.5,n()-.5,n()-.5),f.addScaledVector(d,-f.dot(d)).multiplyScalar(2*u),a.add(f),e.push(a,i)}c=e,u*=.55}for(let e=0;e<c.length-1;e++){let t=e/(c.length-1);if(o.push([c[e],c[e+1],i*(1-.5*t),a]),s>0&&n()<.045&&t<.85){let t=c[e+1].clone().sub(c[e]).normalize();f.set(n()-.5,n()-.6,n()-.5).normalize(),t.add(f.multiplyScalar(1.2)).normalize();let u=l*(.08+.2*n()),d=c[e].clone().addScaledVector(t,u);M(c[e],d,n,Math.max(3,r-2),i*.45,a*.55,o,s-1)}}}var N=class{constructor(t){this.ctx=t,this.group=new p,this.group.name=`weather:lightning`,this.mat=new c({vertexShader:A,fragmentShader:j,uniforms:{uColor:{value:new d(.8,.86,1).multiplyScalar(90)},uFlash:{value:0}},transparent:!0,depthWrite:!1,depthTest:!0,blending:5,blendEquation:100,blendSrc:201,blendDst:201,side:2}),this.mesh=new r(new u,this.mat),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.group.add(this.mesh),this.anchor=null,this.light=new e(13162239,0),this.light.name=`weather:flash`,t.scene.add(this.light,this.light.target),this.strike=null,this.flash=0,this.worldPos=new g,this.color=[.78,.84,1]}strikeAt(e,t,n,r=null){let i=n>>>0||1,a=()=>{i=i+1831565813>>>0;let e=i;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},o=new g(e.x,e.y,e.z),s=new g(t.x-e.x,t.y-e.y,t.z-e.z),c=new g(0,0,0),d=[];M(s,c,a,8,9,1,d,3);let f=d.length,p=new Float32Array(f*4*3),m=new Float32Array(f*4*3),h=new Float32Array(f*4*3),_=new Uint32Array(f*6);for(let e=0;e<f;e++){let[t,n,r,i]=d[e],a=n.clone().multiplyScalar(2).sub(t),o=[[t,n,-1],[t,n,1],[n,a,1],[n,a,-1]];for(let t=0;t<4;t++){let[n,a,s]=o[t],c=(e*4+t)*3;p[c]=n.x,p[c+1]=n.y,p[c+2]=n.z,m[c]=a.x,m[c+1]=a.y,m[c+2]=a.z,h[c]=s,h[c+1]=r,h[c+2]=i}_.set([e*4,e*4+1,e*4+2,e*4,e*4+2,e*4+3],e*6)}let v=new u;v.setAttribute(`position`,new l(p,3)),v.setAttribute(`aOther`,new l(m,3)),v.setAttribute(`aInfo`,new l(h,3)),v.setIndex(new l(_,1)),this.mesh.geometry.dispose(),this.mesh.geometry=v,this.anchor&&this.anchor.remove(),this.anchor=this.ctx.space.registerFloating(this.group,o),this.worldPos.set(e.x+s.x*.85,e.y+s.y*.85,e.z+s.z*.85),this.strike={t:0,pulses:[0,.07+a()*.05,.19+a()*.08,.32+a()*.1],hold:r,ground:o}}update(e,t){let n=this.strike;if(!n){this.flash=0,this.mesh.visible=!1,this.light.intensity=0;return}let r;if(n.hold!=null)r=n.hold;else{n.t+=e,r=0;for(let e of n.pulses){let t=n.t-e;t>=0&&(r=Math.max(r,Math.exp(-t/.045)*(e===0?1:.75)))}n.t>.9&&(this.strike=null,r=0)}this.flash=r,this.mat.uniforms.uFlash.value=r,this.mesh.visible=r>.02;let i=t.space.origin,a=1/(1+(Math.hypot(n.ground.x-i.x,n.ground.y-i.y,n.ground.z-i.z)/5e3)**2);this.light.intensity=r*9*a,this.light.position.set(this.worldPos.x-i.x,this.worldPos.y-i.y,this.worldPos.z-i.z).normalize().multiplyScalar(100),this.light.target.position.set(0,0,0),this.light.target.updateMatrixWorld()}dispose(){var e;(e=this.anchor)==null||e.remove(),this.mesh.geometry.dispose(),this.mat.dispose(),this.ctx.scene.remove(this.light,this.light.target)}},P=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,F=`
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uSrc, vUv).rgb, 1.0); }`,I=`
uniform sampler2D uSrc;
uniform float uTime;
uniform float uAspect;
uniform float uRain;
uniform float uAcid;
uniform float uSnow;
uniform float uDust;
uniform float uHeat;
uniform vec3 uDustTint;
uniform vec3 uAcidTint;
uniform vec3 uLight;      // radiância de referência (brilho das gotas/geada)
varying vec2 vUv;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.0)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.07 + 3.1; a *= 0.5; }
  return s;
}

// camada de gotas paradas: devolve (deslocamento.xy, máscara, brilho)
vec4 drops(vec2 uv, float scale, float amount, float seed) {
  vec2 p = vec2(uv.x * uAspect, uv.y) * scale;
  vec2 id = floor(p);
  vec4 best = vec4(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 c = id + vec2(x, y);
    vec2 r = h22(c + seed);
    if (r.x > amount) continue;
    vec2 ctr = c + 0.2 + 0.6 * h22(c + seed + 7.0);
    float rad = 0.12 + 0.3 * r.y;
    vec2 d = p - ctr;
    d.y *= 1.0 + 0.25 * r.y;           // gotas levemente alongadas
    float dist = length(d);
    if (dist < rad) {
      float m = smoothstep(rad, rad * 0.78, dist);
      vec2 n = d / rad;
      float spec = pow(max(0.0, 1.0 - length(n - vec2(-0.35, 0.4))), 6.0);
      if (m > best.z) best = vec4(-n * (0.035 + 0.25 * rad / scale), m, spec);
    }
  }
  return best;
}

// gotas escorrendo com rastro
vec4 runs(vec2 uv, float amount) {
  vec2 p = vec2(uv.x * uAspect * 7.0, uv.y);
  float col = floor(p.x);
  float r = h21(vec2(col, 3.7));
  if (r > amount * 0.6) return vec4(0.0);
  float speed = 0.05 + 0.12 * h21(vec2(col, 9.1));
  float y = fract(h21(vec2(col, 1.3)) - uTime * speed);
  float x = fract(p.x) - 0.5 + 0.08 * sin(uv.y * 40.0 + col);
  float dy = uv.y - y;
  float head = smoothstep(0.022, 0.012, length(vec2(x * 0.14, dy * 1.4)));
  float trail = smoothstep(0.06, 0.0, abs(x)) * smoothstep(0.0, 0.02, dy) * (1.0 - smoothstep(0.02, 0.32, dy)) * 0.55;
  float m = max(head, trail * step(0.0, dy));
  return vec4(vec2(-x * 0.012, 0.004), m, head * 0.6);
}

void main() {
  vec2 uv = vUv;
  vec4 acc = vec4(0.0);          // cor pré-multiplicada + alfa
  float wet = max(uRain, uAcid);
  if (wet > 0.01) {
    vec4 a = drops(uv, 16.0, 0.22 * wet, 1.0);
    vec4 b = drops(uv, 7.0, 0.16 * wet, 5.0);
    vec4 c = runs(uv, wet);
    vec4 d = a;
    if (b.z > d.z) d = b;
    if (c.z > d.z) d = c;
    if (d.z > 0.0) {
      vec3 col = texture2D(uSrc, uv + d.xy).rgb * (0.8 + 0.2 * d.z) + uLight * d.w * 0.35;
      col = mix(col, col * uAcidTint, uAcid / max(wet, 1e-3) * 0.65);
      float al = d.z * 0.75;
      acc = vec4(col * al, al);
    }
    // borrão leve de água no vidro
    float film = fbm(uv * vec2(uAspect, 1.0) * 3.0 + 4.0) * 0.18 * wet;
    acc = acc + vec4(texture2D(uSrc, uv).rgb * film, film) * (1.0 - acc.a);
  }
  if (uSnow > 0.01) {
    vec2 q = uv * vec2(uAspect, 1.0);
    float e = min(min(uv.x, 1.0 - uv.x) * uAspect, min(uv.y, 1.0 - uv.y));
    float n = fbm(q * 9.0) * 0.7 + fbm(q * 32.0) * 0.3;
    float frost = smoothstep(0.0, 0.22, (0.24 + 0.1 * uSnow) - e + (n - 0.5) * 0.25) * uSnow;
    // agulhas de cristal
    float needles = pow(abs(sin((q.x * 0.7 + q.y) * 140.0 + n * 18.0) * sin((q.x - q.y * 0.6) * 120.0 + n * 11.0)), 18.0);
    vec3 bg = texture2D(uSrc, uv + (n - 0.5) * 0.02).rgb;
    vec3 fc = mix(bg * 0.7 + uLight * 0.55 * vec3(0.85, 0.92, 1.0), uLight * 1.1, needles * 0.6);
    float al = clamp(frost * (0.55 + 0.35 * n), 0.0, 0.92);
    // flocos grudados
    vec4 fl = drops(uv, 30.0, 0.18 * uSnow, 11.0);
    float fa = fl.z * 0.85;
    fc = mix(fc, uLight * 1.2, fa);
    al = max(al, fa);
    acc = vec4(fc * al, al) + acc * (1.0 - al);
  }
  if (uDust > 0.01) {
    vec2 q = uv * vec2(uAspect, 1.0);
    float e = min(min(uv.x, 1.0 - uv.x) * uAspect, min(uv.y, 1.0 - uv.y));
    float grime = fbm(q * 6.0 + 9.0);
    float m = (smoothstep(0.35, 0.0, e) * 0.5 + 0.2 * grime) * uDust;
    float streak = smoothstep(0.75, 1.0, fbm(vec2(q.x * 2.0 + q.y * 9.0, q.y * 1.0) * 4.0)) * 0.35 * uDust;
    float al = clamp(m * 0.55 + streak, 0.0, 0.7);
    vec3 col = uDustTint * (dot(uLight, vec3(0.33)) * 0.9 + 0.02);
    acc = vec4(col * al, al) + acc * (1.0 - al);
  }
  if (uHeat > 0.01) {
    float k = uHeat * (0.25 + 0.75 * smoothstep(0.75, 0.2, uv.y));
    vec2 off = vec2(sin(uv.y * 90.0 + uTime * 6.0 + sin(uv.x * 23.0) * 2.0), cos(uv.x * 70.0 + uTime * 5.0)) * 0.0022 * k;
    vec3 col = texture2D(uSrc, uv + off).rgb;
    float al = clamp(k, 0.0, 1.0) * 0.9 * (1.0 - acc.a);
    acc = acc + vec4(col * al, al);
  }
  gl_FragColor = acc;
}`,L=class{constructor(e){this.ctx=e,this.src=new o(1,1,{type:a,format:m,depthBuffer:!1,stencilBuffer:!1,minFilter:_,magFilter:_,generateMipmaps:!1}),this.mCopy=new c({uniforms:{uSrc:{value:null}},vertexShader:P,fragmentShader:F,depthTest:!1,depthWrite:!1}),this.u={uSrc:{value:this.src.texture},uTime:{value:0},uAspect:{value:1.7},uRain:{value:0},uAcid:{value:0},uSnow:{value:0},uDust:{value:0},uHeat:{value:0},uDustTint:{value:new g(.9,.6,.35)},uAcidTint:{value:new g(.8,1,.4)},uLight:{value:new g(1,1,1)}},this.mLens=new c({uniforms:this.u,vertexShader:P,fragmentShader:I,depthTest:!1,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.quad=new f(this.mCopy),this.active=!1}render(e){if(!this.active||!e)return;let t=this.ctx.renderer,n=Math.max(1,e.width>>1),r=Math.max(1,e.height>>1);(this.src.width!==n||this.src.height!==r)&&this.src.setSize(n,r),this.u.uAspect.value=e.width/Math.max(1,e.height);let i=t.getRenderTarget(),a=t.autoClear;t.autoClear=!1,this.mCopy.uniforms.uSrc.value=e.texture,this.quad.material=this.mCopy,t.setRenderTarget(this.src),this.quad.render(t),this.quad.material=this.mLens,t.setRenderTarget(e),this.quad.render(t),t.setRenderTarget(i),t.autoClear=a}dispose(){this.src.dispose(),this.mCopy.dispose(),this.mLens.dispose(),this.quad.dispose()}},R=[`rain`,`acid`,`snow`,`dust`],z={name:`weather`,order:20,async init(e){var t;let n=((t=e.shot)==null||(t=t.preset)==null?void 0:t.params)||{};this.P=n,this.ctx=e;let r=e.seed.derive(`weather`,`cycle`,e.start.galaxy,e.start.systemIndex,e.start.planetIndex);this.rnd=r,this.precip=new O(e,e.quality.particleBudget??1),this.lightning=new N(e),this.precip.scene.add(this.lightning.group),this.lens=new L(e),this.removeParticles=e.pipeline.addPass(`afterWorld`,(e,t)=>this.renderParticles(t),{order:14,owner:`weather`}),this.removeLens=e.pipeline.addPass(`afterCockpit`,(e,t)=>this.lens.render(t),{order:5,owner:`weather`});let i=this.envInfo(e),a=this.S={name:`clear`,prev:`clear`,from:C(`clear`,i),to:C(`clear`,i),cur:C(`clear`,i),t:1,dur:12,levels:{rain:0,acid:0,snow:0,dust:0},kind:null,nextChange:90+r.range(0,120),nextStrike:3,boltPlaced:!1,env:i,windAngle:r.range(0,Math.PI*2),frame:null,frameAnchor:null};this.auto=!e.shot&&n.weatherAuto!==!1&&e.params.get(`weatherAuto`)!==`0`;let o=this,s=new g(6,0,2),c={coverage:i.cover,typeBias:0,storm:0,darkness:0,detail:.45,cirrus:.75,density:1},l={density:0,height:1200,color:[.5,.5,.5],maxDist:6e4},u={get flash(){return o.lightning.flash},get worldPos(){return o.lightning.strike?o.lightning.worldPos:null},color:o.lightning.color};this.pub={wind:s,cloud:c,fog:l};let d={get weather(){return a.name},get state(){return a.name},get blend(){return a.t},get cloudCoverage(){return c.coverage},get intensity(){return Math.max(a.levels.rain,a.levels.acid,a.levels.snow,a.levels.dust)},get precipitation(){return a.kind},get levels(){return a.levels},get wetness(){return Math.min(1,a.levels.rain+a.levels.acid)},wind:s,cloud:c,fog:l,lightning:u,get auto(){return o.auto},set auto(e){o.auto=!!e},set(t,{transition:n}={}){o.setWeather(e,t,n)},strike(t){o.randomStrike(e,t)},get _internal(){return o}};this.api=e.provide(`weather`,d),this.offs=[e.bus.on(`planet:enter`,()=>{a.env=this.envInfo(e),this.setWeather(e,`clear`,0)}),e.bus.on(`system:enter`,()=>{a.env=this.envInfo(e),this.setWeather(e,`clear`,0)})],!e.shot&&this.auto&&this.setWeather(e,this.pickCycle(),0)},envInfo(e){var t,n;let r=this.P,i=(t=e.services.universe)==null?void 0:t.currentPlanet,a=e.services.planet,o=r.biome||r.atmoBiome||(i==null?void 0:i.biome)||`lush`,s=15;try{var c;let t=new g().copy(e.player.worldPos).sub(e.space.planetCenter).normalize();s=(a==null||(c=a.biomeAt)==null||(c=c.call(a,t))==null?void 0:c.temperature)??s}catch{}o===`frozen`&&(s=Math.min(s,-10));let l=((i==null?void 0:i.seed)??7)%1e3/1e3-.5,u=Math.min(.85,Math.max(.08,(b[o]??.45)+l*.16)),d=(a==null||(n=a.palette)==null?void 0:n.sand)||[.6,.45,.28],f=Math.max(d[0],d[1],d[2],.001),p=[d[0]/f,d[1]/f,d[2]/f].map(e=>.25+.75*e);return{biome:o,temperature:s,cover:u,dustTint:p}},pickCycle(){let e=x[this.S.env.biome]||x.lush;return this.rnd.weighted(e)},kindFor(e){let t=this.S.env,n=y[e]??null;return n===`rain`&&t.temperature<-2&&(n=`snow`),n===`rain`&&(t.biome===`toxic`||t.biome===`radioactive`)&&(n=`acid`),n},setWeather(e,t,n){v[t]||(t=`clear`);let r=this.S,i=r.name;r.from=w(r.cur),r.to=C(t,r.env);let a=this.kindFor(t);t===`storm`&&a===`acid`&&(r.to=C(`acid`,r.env)),t===`storm`&&a===`snow`&&(r.to=C(`blizzard`,r.env));let o=this.P.weatherIntensity;if(typeof o==`number`&&(r.to.precip*=o),r.name=t,r.kind=a,r.t=0,r.dur=e.shot?0:n??12,r.dur<=0){r.t=1,r.cur=w(r.to);for(let e of R)r.levels[e]=e===a?r.to.precip:0}i!==t&&e.bus.emit(`weather:change`,{weather:t,prev:i})},randomStrike(e,t=null,n=null){var r,i;let a=e.services.planet,o=e.services.clouds,s=e.space.planetCenter,c=e.space.origin,l;if(t)l=new g(t.x,t.y,t.z);else{var u;let e=new g(c.x-s.x,c.y-s.y,c.z-s.z).normalize(),t=new g(0,1,0).cross(e).normalize();Number.isFinite(t.x)||t.set(1,0,0);let n=e.clone().cross(t),r=this.rnd.range(0,Math.PI*2),i=this.rnd.range(2e3,14e3),o=(a==null?void 0:a.radius)||12e4,d=e.clone().multiplyScalar(o).addScaledVector(t,Math.cos(r)*i).addScaledVector(n,Math.sin(r)*i).normalize(),f=(a==null||(u=a.heightAt)==null?void 0:u.call(a,d))??0;l=d.multiplyScalar(o+Math.max(f,(a==null?void 0:a.seaLevel)??-1e9)).add(s)}let d=(a==null?void 0:a.radius)||12e4,f=(o==null?void 0:o.layer)||{bottom:2100},p=Math.max(0,(a==null?void 0:a.seaLevel)??0),m=Math.hypot(l.x-s.x,l.y-s.y,l.z-s.z),h=(d+p+f.bottom+500)/m,_=new g((l.x-s.x)*h+s.x,(l.y-s.y)*h+s.y,(l.z-s.z)*h+s.z);_.x+=this.rnd.range(-600,600),_.z+=this.rnd.range(-600,600),this.lightning.strikeAt(l,_,this.rnd.u32(),n);let v=Math.hypot(l.x-c.x,l.y-c.y,l.z-c.z);e.bus.emit(`weather:lightning`,{worldPos:l,distance:v}),(r=e.services.audio)==null||(i=r.play)==null||i.call(r,`thunder`,l,{volume:Math.min(1,4e3/Math.max(500,v))})},placeShotBolt(e,t){var n;let r=e.services.planet,i=e.space.planetCenter,a=e.player.cameraWorld||e.space.origin,o=new g(a.x-i.x,a.y-i.y,a.z-i.z).normalize(),s=new g(0,0,-1).applyQuaternion(e.player.cameraQuat||e.camera.quaternion);s.addScaledVector(o,-s.dot(o)).normalize(),s.applyAxisAngle(o,-(t.az??0)*Math.PI/180);let c=(r==null?void 0:r.radius)||12e4,l=t.dist??5e3,u=o.clone().multiplyScalar(c).addScaledVector(s,l).normalize(),d=(r==null||(n=r.heightAt)==null?void 0:n.call(r,u))??0,f=u.multiplyScalar(c+Math.max(d,(r==null?void 0:r.seaLevel)??-1e9)).add(i);this.randomStrike(e,f,t.flash??1)},frame(e,t){var n;let r=this.S,{space:i,player:a}=t,o=t.services.sky,s=t.time.world||0,c=!t.time.frozen,l=c?Math.min(.25,Math.max(0,e)):0;if(r.t<1){r.t=Math.min(1,r.t+l/Math.max(.01,r.dur));let e=r.t*r.t*(3-2*r.t);ee(r.cur,r.from,r.to,e)}for(let e of R){let t=e===r.kind?r.to.precip:0,n=l/Math.max(2,r.dur*.6);r.dur<=0||!c?r.levels[e]=r.t>=1?t:r.levels[e]:r.levels[e]+=Math.max(-n,Math.min(n,t-r.levels[e]))}if(this.auto&&c&&(r.nextChange-=l,r.nextChange<=0)){let e=this.pickCycle();this.setWeather(t,e,18),r.nextChange=e===`clear`?this.rnd.range(160,360):this.rnd.range(90,220)}let u=r.cur,f=this.pub;Object.assign(f.cloud,{coverage:u.coverage,typeBias:u.typeBias,storm:u.storm,darkness:u.darkness,detail:u.detail,cirrus:u.cirrus,density:1}),r.windAngle+=l*.004;let p=1+.25*Math.sin(s*.37)*Math.sin(s*.11+1.3),m=u.wind*p;f.wind.set(Math.cos(r.windAngle)*m,0,Math.sin(r.windAngle)*m);let h=i.planetCenter,_=i.origin,v=_.x-h.x,y=_.y-h.y,b=_.z-h.z,x=Math.hypot(v,y,b)||1,S=(r._up||=new g).set(v/x,y/x,b/x);if(!r.frame||!r.frameAnchor||Math.hypot(_.x-r.frameAnchor.x,_.y-r.frameAnchor.y,_.z-r.frameAnchor.z)>4e3){let e=new g(0,1,0).cross(S);e.lengthSq()<1e-8&&e.set(1,0,0),e.normalize();let t=S.clone().cross(e).normalize();r.frame={east:e,up:S.clone(),north:t},r.frameAnchor={x:_.x,y:_.y,z:_.z}}let C=r.frame,w=(r._cl||=new g).set(v*C.east.x+y*C.east.y+b*C.east.z,v*C.up.x+y*C.up.y+b*C.up.z,v*C.north.x+y*C.north.y+b*C.north.z),T=a.velocity||new g,E=(r._cv||=new g).set(T.dot(C.east),T.dot(C.up),T.dot(C.north)),D=(r._wl||=new g).set(f.wind.x,0,f.wind.z),O=o==null?void 0:o.ambient,k=((O==null?void 0:O.intensity)??.5)/Math.PI,A=(O==null?void 0:O.color)||{r:.6,g:.7,b:.9},j=(o==null?void 0:o.sunColor)||{r:1,g:1,b:1},M=(o==null?void 0:o.sunIntensity)??3,N=(o==null?void 0:o.sunDirection)||S,P=Math.max(0,N.dot(S)),F=M*(1-.8*u.darkness)*Math.min(1,P*4),I=[A.r*k,A.g*k,A.b*k],L=[j.r*F,j.g*F,j.b*F],z=this.lightning.flash*2.5,B=(e,t)=>[0,1,2].map(n=>I[n]*e+L[n]*t/Math.PI+z*.3),V=B(.95*(1-.45*u.darkness),.35);f.fog.density=u.fog,f.fog.height=u.fogH,f.fog.color=V.map((e,t)=>e*u.fogTint[t]),f.fog.maxDist=8e4;let H=r._col||={rain:new d,acid:new d,snow:new d,dust:new d},U=B(2.2,.3);H.rain.setRGB(U[0]*.85,U[1]*.9,U[2]),H.acid.setRGB(U[0]*.9,U[1]*1.1,U[2]*.45);let W=B(1.15,.55);H.snow.setRGB(W[0],W[1],W[2]*1.05);let G=B(.9,.5),K=r.env.dustTint;H.dust.setRGB(G[0]*K[0],G[1]*K[1],G[2]*K[2]);let q=1-Math.min(1,Math.max(0,((a.altitude??0)-1800)/1200)),J=r._lv||={};for(let e of R)J[e]=r.levels[e]*q;this.particlesOn=this.precip.update({time:s,levels:J,frame:C,camLocal:w,camVel:E,wind:D,colors:H,viewH:t.pipeline.height||540});let Y=this.P.weatherBolt;t.shot&&Y&&!r.boltPlaced&&t.services.planet?(r.boltPlaced=!0,this.placeShotBolt(t,Y)):c&&u.lightning>.001&&(r.nextStrike-=l,r.nextStrike<=0&&(this.randomStrike(t),r.nextStrike=-Math.log(Math.max(1e-4,this.rnd.next()))/u.lightning)),this.lightning.update(c?l:0,t),this.particlesOn=this.particlesOn||this.lightning.mesh.visible;let X=a.view!==`third`&&(a.mode===`walk`||((n=t.cockpit)==null?void 0:n.visible)),Z=this.lens.u,Q=u.lens*+!!X*q;Z.uRain.value=r.levels.rain*Q,Z.uAcid.value=r.levels.acid*Q,Z.uSnow.value=r.levels.snow*Q*.85,Z.uDust.value=r.levels.dust*Q*.8,Z.uHeat.value=u.heat*(X?1:.6),Z.uTime.value=s,Z.uDustTint.value.set(K[0],K[1],K[2]);let $=B(1,.4);Z.uLight.value.set($[0],$[1],$[2]),this.lens.active=Z.uRain.value+Z.uAcid.value+Z.uSnow.value+Z.uDust.value+Z.uHeat.value>.01},renderParticles(e){if(!this.particlesOn||!e)return;let t=this.ctx.renderer,n=t.getRenderTarget(),r=t.autoClear;t.autoClear=!1,t.setRenderTarget(e),this.precip.render(t,this.ctx.camera),t.setRenderTarget(n),t.autoClear=r},dispose(e){var t,n,r,i,a;for(let e of this.offs||[])e();(t=this.removeParticles)==null||t.call(this),(n=this.removeLens)==null||n.call(this),(r=this.precip)==null||r.dispose(),(i=this.lightning)==null||i.dispose(),(a=this.lens)==null||a.dispose()}};export{z as default};
//# sourceMappingURL=weather-DWswnyNB.js.map