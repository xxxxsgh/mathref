import{A as e,B as t,Dt as n,E as r,F as i,I as a,J as o,W as s,X as c,d as l,f as u,ht as d,i as f,jt as p,lt as m,mt as h,v as g,z as _}from"./three-Do4x7iGi.js";var v={clear:{coverage:null,typeBias:0,storm:0,darkness:0,precip:0,fog:0,fogH:1200,fogTint:[1,1,1],lightning:0,wind:7,cirrus:.75,detail:.6,lens:0,heat:0},cloudy:{coverage:.82,typeBias:-.2,storm:.1,darkness:.2,precip:0,fog:4e-5,fogH:1500,fogTint:[.85,.88,.92],lightning:0,wind:10,cirrus:.3,detail:.55,lens:0,heat:0},storm:{coverage:.7,typeBias:.35,storm:1,darkness:.75,precip:1,fog:3e-5,fogH:1100,fogTint:[.4,.45,.52],lightning:.14,wind:17,cirrus:0,detail:.45,lens:1,heat:0},acid:{coverage:.9,typeBias:.35,storm:.6,darkness:.55,precip:.85,fog:45e-5,fogH:1400,fogTint:[.78,.95,.36],lightning:.05,wind:11,cirrus:0,detail:.48,lens:1,heat:0},blizzard:{coverage:.97,typeBias:-.5,storm:.25,darkness:.45,precip:1,fog:.0016,fogH:900,fogTint:[.86,.91,1],lightning:0,wind:21,cirrus:0,detail:.5,lens:1,heat:0},dust:{coverage:.3,typeBias:-.25,storm:0,darkness:.15,precip:1,fog:.0011,fogH:650,fogTint:null,lightning:0,wind:19,cirrus:.3,detail:.6,lens:1,heat:.35},heat:{coverage:.12,typeBias:-.3,storm:0,darkness:0,precip:.35,fog:28e-5,fogH:500,fogTint:null,lightning:0,wind:9,cirrus:.5,detail:.6,lens:.4,heat:1}},y={clear:null,cloudy:null,storm:`rain`,acid:`acid`,blizzard:`snow`,dust:`dust`,heat:`dust`},b={lush:.5,ocean:.58,frozen:.52,toxic:.6,radioactive:.4,scorched:.24,barren:.18,exotic:.46},x={lush:[[`clear`,6],[`cloudy`,2],[`storm`,1.5]],ocean:[[`clear`,5],[`cloudy`,3],[`storm`,2]],frozen:[[`clear`,4],[`cloudy`,2],[`blizzard`,2.5]],toxic:[[`clear`,4],[`cloudy`,2],[`acid`,2.5]],radioactive:[[`clear`,4],[`dust`,1.5],[`acid`,1.2]],scorched:[[`clear`,4],[`heat`,2.5],[`dust`,2]],barren:[[`clear`,6],[`dust`,2]],exotic:[[`clear`,5],[`cloudy`,2],[`storm`,1]]},S=[`typeBias`,`storm`,`darkness`,`precip`,`fog`,`fogH`,`lightning`,`wind`,`cirrus`,`detail`,`lens`,`heat`,`coverage`];function C(e,{cover:t=.45,dustTint:n=[.9,.62,.35]}={}){let r=v[e]||v.clear,i={...r};return i.coverage=r.coverage==null?t:r.coverage,i.fogTint=(r.fogTint||n).slice(),i}function w(e,t,n,r){for(let i of S)e[i]=t[i]+(n[i]-t[i])*r;return e.fogTint=[0,1,2].map(e=>t.fogTint[e]+(n.fogTint[e]-t.fogTint[e])*r),e}function T(e){return{...e,fogTint:e.fogTint.slice()}}var E=`
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
  if (uKind < 1.5) {
    // risco (chuva) ou floco arrastado pelo vento (neve): lado perpendicular
    // ao risco na tela; a neve nunca fica menor que um disco
    vec3 d = b - a;
    if (uKind > 0.5) {
      float L = length(d);
      float Lmin = size * 2.0;
      if (L < Lmin) {
        d = (L > 1e-6 ? d / L : vec3(0.0, 1.0, 0.0)) * Lmin;
        b = a + d;
      }
      a -= d * 0.5;
      b -= d * 0.5;
      d = b - a;
    }
    vec3 side = normalize(cross(d + vec3(1e-5, 0.0, 0.0), a));
    pos = mix(a, b, aCorner.y) + side * aCorner.x * size * (uKind > 0.5 ? 1.0 : 0.5);
  } else {
    pos = a + vec3(aCorner.x, aCorner.y * 2.0 - 1.0, 0.0) * size;
  }
  vC = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  float fadeNear = smoothstep(0.25, 1.2, dist);
  float fadeFar = 1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p));
  vA = isOn / (uKind > 0.5 && uKind < 1.5 ? fat * fat : fat) * fadeNear * fadeFar * (dist > 0.0 ? 1.0 : 0.0);
  gl_Position = projectionMatrix * vec4(pos, 1.0);
  if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <logdepthbuf_vertex>
}`,D=`
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
}`,O={rain:{kind:0,count:14e3,box:[40,40,40],vel:[0,-11,0],size:.004,stretch:.05,alpha:.16},acid:{kind:0,count:12e3,box:[40,40,40],vel:[0,-8,0],size:.008,stretch:.05,alpha:.3},snow:{kind:1,count:12e3,box:[34,34,34],vel:[0,-1.4,0],size:.03,stretch:.022,alpha:.85},dust:{kind:2,count:2600,box:[60,30,60],vel:[0,-.2,0],size:.9,stretch:0,alpha:.09}},k=class{constructor(r,i=1){this.ctx=r,this.scene=new h,this.layers={};for(let[a,s]of Object.entries(O)){let l=Math.max(200,Math.round(s.count*i)),u=new t;u.setAttribute(`position`,new e([0,0,0,0,0,0,0,0,0,0,0,0],3)),u.setAttribute(`aCorner`,new e([-1,0,1,0,1,1,-1,1],2)),u.setIndex([0,1,2,0,2,3]);let f=new Float32Array(l*4),p=r.seed.derive(`weather`,`particles`,a);for(let e=0;e<l*4;e++)f[e]=p.next();u.setAttribute(`aSeed`,new _(f,4)),u.instanceCount=l;let m=new d({vertexShader:E,fragmentShader:D,uniforms:{uTime:{value:0},uBox:{value:new n(...s.box)},uOffset:{value:new n},uFrame:{value:new o},uVel:{value:new n(...s.vel)},uCamVel:{value:new n},uSize:{value:s.size},uStretch:{value:s.stretch},uKind:{value:s.kind},uCount:{value:0},uFar:{value:1},uColor:{value:new g(1,1,1)},uAlpha:{value:s.alpha}},transparent:!0,depthWrite:!1,depthTest:!0,side:2,blending:5,blendEquation:100,blendSrc:201,blendDst:205}),h=new c(u,m);h.frustumCulled=!1,h.visible=!1,this.scene.add(h),this.layers[a]={mesh:h,mat:m,cfg:s}}this._frame=new o}update({time:e,levels:t,frame:n,camLocal:r,camVel:i,wind:a,colors:o,viewH:s=540}){this._frame.set(n.east.x,n.up.x,n.north.x,n.east.y,n.up.y,n.north.y,n.east.z,n.up.z,n.north.z);let c=!1;for(let[n,l]of Object.entries(this.layers)){let u=t[n]||0;if(l.mesh.visible=u>.01,!l.mesh.visible)continue;c=!0;let d=l.mat.uniforms;d.uTime.value=e,d.uFrame.value.copy(this._frame);let f=d.uBox.value;d.uOffset.value.set(A(r.x,f.x),A(r.y,f.y),A(r.z,f.z));let p=l.cfg.kind,m=p===0?.55:p===1?.9:1;d.uVel.value.set(l.cfg.vel[0]+a.x*m,l.cfg.vel[1]+a.y*m,l.cfg.vel[2]+a.z*m),d.uCamVel.value.copy(i),d.uCount.value=u,d.uColor.value.copy(o[n]||o.rain),d.uFar.value=s}return c}render(e,t){e.render(this.scene,t)}dispose(){for(let e of Object.values(this.layers))e.mesh.geometry.dispose(),e.mat.dispose()}};function A(e,t){return e-Math.floor(e/t)*t}var j=`
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
}`,M=`
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
}`;function N(e,t,r,i,a,o,s,c){let l=[e.clone(),t.clone()],u=e.distanceTo(t),d=u*.16,f=t.clone().sub(e).normalize(),p=new n;for(let e=0;e<i;e++){let e=[l[0]];for(let t=0;t<l.length-1;t++){let n=l[t],i=l[t+1],a=n.clone().add(i).multiplyScalar(.5);p.set(r()-.5,r()-.5,r()-.5),p.addScaledVector(f,-p.dot(f)).multiplyScalar(2*d),a.add(p),e.push(a,i)}l=e,d*=.55}for(let e=0;e<l.length-1;e++){let t=e/(l.length-1);if(s.push([l[e],l[e+1],a*(1-.5*t),o]),c>0&&r()<.045&&t<.85){let t=l[e+1].clone().sub(l[e]).normalize();p.set(r()-.5,r()-.6,r()-.5).normalize(),t.add(p.multiplyScalar(1.2)).normalize();let n=u*(.08+.2*r()),d=l[e].clone().addScaledVector(t,n);N(l[e],d,r,Math.max(3,i-2),a*.45,o*.55,s,c-1)}}}var P=class{constructor(e){this.ctx=e,this.group=new i,this.group.name=`weather:lightning`,this.mat=new d({vertexShader:j,fragmentShader:M,uniforms:{uColor:{value:new g(.8,.86,1).multiplyScalar(90)},uFlash:{value:0}},transparent:!0,depthWrite:!1,depthTest:!0,blending:5,blendEquation:100,blendSrc:201,blendDst:201,side:2}),this.mesh=new c(new u,this.mat),this.mesh.frustumCulled=!1,this.mesh.visible=!1,this.group.add(this.mesh),this.anchor=null,this.light=new r(13162239,0),this.light.name=`weather:flash`,e.scene.add(this.light,this.light.target),this.strike=null,this.flash=0,this.worldPos=new n,this.color=[.78,.84,1]}strikeAt(e,t,r,i=null){let a=r>>>0||1,o=()=>{a=a+1831565813>>>0;let e=a;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},s=new n(e.x,e.y,e.z),c=new n(t.x-e.x,t.y-e.y,t.z-e.z),d=new n(0,0,0),f=[];N(c,d,o,8,9,1,f,3);let p=f.length,m=new Float32Array(p*4*3),h=new Float32Array(p*4*3),g=new Float32Array(p*4*3),_=new Uint32Array(p*6);for(let e=0;e<p;e++){let[t,n,r,i]=f[e],a=n.clone().multiplyScalar(2).sub(t),o=[[t,n,-1],[t,n,1],[n,a,1],[n,a,-1]];for(let t=0;t<4;t++){let[n,a,s]=o[t],c=(e*4+t)*3;m[c]=n.x,m[c+1]=n.y,m[c+2]=n.z,h[c]=a.x,h[c+1]=a.y,h[c+2]=a.z,g[c]=s,g[c+1]=r,g[c+2]=i}_.set([e*4,e*4+1,e*4+2,e*4,e*4+2,e*4+3],e*6)}let v=new u;v.setAttribute(`position`,new l(m,3)),v.setAttribute(`aOther`,new l(h,3)),v.setAttribute(`aInfo`,new l(g,3)),v.setIndex(new l(_,1)),this.mesh.geometry.dispose(),this.mesh.geometry=v,this.anchor&&this.anchor.remove(),this.anchor=this.ctx.space.registerFloating(this.group,s),this.worldPos.set(e.x+c.x*.85,e.y+c.y*.85,e.z+c.z*.85),this.strike={t:0,pulses:[0,.07+o()*.05,.19+o()*.08,.32+o()*.1],hold:i,ground:s}}update(e,t){let n=this.strike;if(!n){this.flash=0,this.mesh.visible=!1,this.light.intensity=0;return}let r;if(n.hold!=null)r=n.hold;else{n.t+=e,r=0;for(let e of n.pulses){let t=n.t-e;t>=0&&(r=Math.max(r,Math.exp(-t/.045)*(e===0?1:.75)))}n.t>.9&&(this.strike=null,r=0)}this.flash=r,this.mat.uniforms.uFlash.value=r,this.mesh.visible=r>.02;let i=t.space.origin,a=1/(1+(Math.hypot(n.ground.x-i.x,n.ground.y-i.y,n.ground.z-i.z)/5e3)**2);this.light.intensity=r*9*a,this.light.position.set(this.worldPos.x-i.x,this.worldPos.y-i.y,this.worldPos.z-i.z).normalize().multiplyScalar(100),this.light.target.position.set(0,0,0),this.light.target.updateMatrixWorld()}dispose(){var e;(e=this.anchor)==null||e.remove(),this.mesh.geometry.dispose(),this.mat.dispose(),this.ctx.scene.remove(this.light,this.light.target)}},F=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,I=`
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uSrc, vUv).rgb, 1.0); }`,L=`
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

// camada de gotas paradas: devolve (normal da gota xy, máscara, raio em uv)
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
    float rad = 0.1 + 0.28 * r.y * r.y;
    vec2 d = p - ctr;
    d.y *= 1.0 + 0.25 * r.y;           // gotas levemente alongadas
    float dist = length(d);
    if (dist < rad) {
      float m = smoothstep(rad, rad * 0.86, dist);
      if (m > best.z) best = vec4(d / rad, m, rad / scale);
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
  return vec4(vec2(x * 4.0, -0.3), m * 0.8, 0.006);
}

void main() {
  vec2 uv = vUv;
  vec4 acc = vec4(0.0);          // cor pré-multiplicada + alfa
  float wet = max(uRain, uAcid);
  if (wet > 0.01) {
    vec4 a = drops(uv, 18.0, 0.13 * wet, 1.0);
    vec4 b = drops(uv, 8.0, 0.07 * wet, 5.0);
    vec4 c = runs(uv, wet);
    vec4 d = a;
    if (b.z > d.z) d = b;
    if (c.z > d.z) d = c;
    if (d.z > 0.0) {
      // cada gota é uma lente: imagem do entorno INVERTIDA e reduzida
      vec2 n = d.xy;
      float ln = length(n);
      vec2 nu = vec2(n.x / uAspect, n.y);
      vec2 suv = clamp(uv - nu * d.w * 4.5, vec2(0.002), vec2(0.998));
      vec3 col = texture2D(uSrc, suv).rgb;
      // borda escura (refração rasante) e brilho especular do céu
      col *= mix(1.05, 0.22, smoothstep(0.45, 1.0, ln));
      float spec = pow(max(0.0, 1.0 - length(n - vec2(-0.35, 0.45)) * 2.2), 3.0);
      col += uLight * spec * 0.9;
      col = mix(col, col * uAcidTint, uAcid / max(wet, 1e-3) * 0.65);
      float al = d.z * 0.92;
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
    float frost = smoothstep(0.0, 0.16, (0.12 + 0.07 * uSnow) - e + (n - 0.5) * 0.2) * uSnow;
    // veios de cristal: cristas de um fBm (linhas ramificadas), mais finos longe da borda
    float rv = 1.0 - abs(fbm(q * 14.0 + n * 2.0) * 2.0 - 1.0);
    float rv2 = 1.0 - abs(fbm(q * 31.0 + 7.0) * 2.0 - 1.0);
    float needles = (pow(rv, 16.0) * 0.5 + pow(rv2, 20.0) * 0.3) * frost;
    vec3 bg = texture2D(uSrc, uv + (n - 0.5) * 0.02).rgb;
    vec3 fc = mix(bg * 0.55 + uLight * 0.6 * vec3(0.72, 0.86, 1.12), uLight * vec3(1.3, 1.45, 1.7), clamp(needles, 0.0, 1.0));
    float al = clamp(frost * (0.45 + 0.35 * n), 0.0, 0.8);
    // flocos grudados
    vec4 fl = drops(uv, 24.0, 0.07 * uSnow, 11.0);
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
}`,R=class{constructor(e){this.ctx=e,this.src=new p(1,1,{type:a,format:m,depthBuffer:!1,stencilBuffer:!1,minFilter:s,magFilter:s,generateMipmaps:!1}),this.mCopy=new d({uniforms:{uSrc:{value:null}},vertexShader:F,fragmentShader:I,depthTest:!1,depthWrite:!1}),this.u={uSrc:{value:this.src.texture},uTime:{value:0},uAspect:{value:1.7},uRain:{value:0},uAcid:{value:0},uSnow:{value:0},uDust:{value:0},uHeat:{value:0},uDustTint:{value:new n(.9,.6,.35)},uAcidTint:{value:new n(.8,1,.4)},uLight:{value:new n(1,1,1)}},this.mLens=new d({uniforms:this.u,vertexShader:F,fragmentShader:L,depthTest:!1,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.quad=new f(this.mCopy),this.active=!1}render(e){if(!this.active||!e)return;let t=this.ctx.renderer,n=Math.max(1,e.width>>1),r=Math.max(1,e.height>>1);(this.src.width!==n||this.src.height!==r)&&this.src.setSize(n,r),this.u.uAspect.value=e.width/Math.max(1,e.height);let i=t.getRenderTarget(),a=t.autoClear;t.autoClear=!1,this.mCopy.uniforms.uSrc.value=e.texture,this.quad.material=this.mCopy,t.setRenderTarget(this.src),this.quad.render(t),this.quad.material=this.mLens,t.setRenderTarget(e),this.quad.render(t),t.setRenderTarget(i),t.autoClear=a}dispose(){this.src.dispose(),this.mCopy.dispose(),this.mLens.dispose(),this.quad.dispose()}},z=[`rain`,`acid`,`snow`,`dust`],B={name:`weather`,order:20,async init(e){var t;let r=((t=e.shot)==null||(t=t.preset)==null?void 0:t.params)||{};this.P=r,this.ctx=e;let i=e.seed.derive(`weather`,`cycle`,e.start.galaxy,e.start.systemIndex,e.start.planetIndex);this.rnd=i,this.precip=new k(e,e.quality.particleBudget??1),this.lightning=new P(e),this.precip.scene.add(this.lightning.group),this.lens=new R(e),this.removeParticles=e.pipeline.addPass(`afterWorld`,(e,t)=>this.renderParticles(t),{order:14,owner:`weather`}),this.removeLens=e.pipeline.addPass(`afterCockpit`,(e,t)=>this.lens.render(t),{order:5,owner:`weather`});let a=this.envInfo(e),o=this.S={name:`clear`,prev:`clear`,from:C(`clear`,a),to:C(`clear`,a),cur:C(`clear`,a),t:1,dur:12,levels:{rain:0,acid:0,snow:0,dust:0},kind:null,nextChange:90+i.range(0,120),nextStrike:3,boltPlaced:!1,env:a,windAngle:i.range(0,Math.PI*2),frame:null,frameAnchor:null};this.auto=!e.shot&&r.weatherAuto!==!1&&e.params.get(`weatherAuto`)!==`0`;let s=this,c=new n(6,0,2),l={coverage:a.cover,typeBias:0,storm:0,darkness:0,detail:.45,cirrus:.75,density:1},u={density:0,height:1200,color:[.5,.5,.5],maxDist:6e4},d={get flash(){return s.lightning.flash},get worldPos(){return s.lightning.strike?s.lightning.worldPos:null},color:s.lightning.color};this.pub={wind:c,cloud:l,fog:u};let f={get weather(){return o.name},get state(){return o.name},get blend(){return o.t},get cloudCoverage(){return l.coverage},get intensity(){return Math.max(o.levels.rain,o.levels.acid,o.levels.snow,o.levels.dust)},get precipitation(){return o.kind},get levels(){return o.levels},get wetness(){return Math.min(1,o.levels.rain+o.levels.acid)},wind:c,cloud:l,fog:u,lightning:d,get auto(){return s.auto},set auto(e){s.auto=!!e},set(t,{transition:n}={}){s.setWeather(e,t,n)},strike(t){s.randomStrike(e,t)},get _internal(){return s}};this.api=e.provide(`weather`,f),this.offs=[e.bus.on(`planet:enter`,()=>{o.env=this.envInfo(e),this.setWeather(e,`clear`,0)}),e.bus.on(`system:enter`,()=>{o.env=this.envInfo(e),this.setWeather(e,`clear`,0)})],!e.shot&&this.auto&&this.setWeather(e,this.pickCycle(),0)},envInfo(e){var t,r;let i=this.P,a=(t=e.services.universe)==null?void 0:t.currentPlanet,o=e.services.planet,s=i.biome||i.atmoBiome||(a==null?void 0:a.biome)||`lush`,c=15;try{var l;let t=new n().copy(e.player.worldPos).sub(e.space.planetCenter).normalize();c=(o==null||(l=o.biomeAt)==null||(l=l.call(o,t))==null?void 0:l.temperature)??c}catch{}s===`frozen`&&(c=Math.min(c,-10));let u=((a==null?void 0:a.seed)??7)%1e3/1e3-.5,d=Math.min(.85,Math.max(.08,(b[s]??.45)+u*.16)),f=(o==null||(r=o.palette)==null?void 0:r.sand)||[.6,.45,.28],p=Math.max(f[0],f[1],f[2],.001),m=[f[0]/p,f[1]/p,f[2]/p].map(e=>.25+.75*e);return{biome:s,temperature:c,cover:d,dustTint:m}},pickCycle(){let e=x[this.S.env.biome]||x.lush;return this.rnd.weighted(e)},kindFor(e){let t=this.S.env,n=y[e]??null;return n===`rain`&&t.temperature<-2&&(n=`snow`),n===`rain`&&(t.biome===`toxic`||t.biome===`radioactive`)&&(n=`acid`),n},setWeather(e,t,n){v[t]||(t=`clear`);let r=this.S,i=r.name;r.from=T(r.cur),r.to=C(t,r.env);let a=this.kindFor(t);t===`storm`&&a===`acid`&&(r.to=C(`acid`,r.env)),t===`storm`&&a===`snow`&&(r.to=C(`blizzard`,r.env));let o=this.P.weatherIntensity;if(typeof o==`number`&&(r.to.precip*=o),r.name=t,r.kind=a,r.t=0,r.dur=e.shot?0:n??12,r.dur<=0){r.t=1,r.cur=T(r.to);for(let e of z)r.levels[e]=e===a?r.to.precip:0}i!==t&&e.bus.emit(`weather:change`,{weather:t,prev:i})},randomStrike(e,t=null,r=null){var i,a;let o=e.services.planet,s=e.services.clouds,c=e.space.planetCenter,l=e.space.origin,u;if(t)u=new n(t.x,t.y,t.z);else{var d;let e=new n(l.x-c.x,l.y-c.y,l.z-c.z).normalize(),t=new n(0,1,0).cross(e).normalize();Number.isFinite(t.x)||t.set(1,0,0);let r=e.clone().cross(t),i=this.rnd.range(0,Math.PI*2),a=this.rnd.range(2e3,14e3),s=(o==null?void 0:o.radius)||12e4,f=e.clone().multiplyScalar(s).addScaledVector(t,Math.cos(i)*a).addScaledVector(r,Math.sin(i)*a).normalize(),p=(o==null||(d=o.heightAt)==null?void 0:d.call(o,f))??0;u=f.multiplyScalar(s+Math.max(p,(o==null?void 0:o.seaLevel)??-1e9)).add(c)}let f=(o==null?void 0:o.radius)||12e4,p=(s==null?void 0:s.layer)||{bottom:2100},m=Math.max(0,(o==null?void 0:o.seaLevel)??0),h=Math.hypot(u.x-c.x,u.y-c.y,u.z-c.z),g=(f+m+p.bottom+500)/h,_=new n((u.x-c.x)*g+c.x,(u.y-c.y)*g+c.y,(u.z-c.z)*g+c.z);_.x+=this.rnd.range(-600,600),_.z+=this.rnd.range(-600,600),this.lightning.strikeAt(u,_,this.rnd.u32(),r);let v=Math.hypot(u.x-l.x,u.y-l.y,u.z-l.z);e.bus.emit(`weather:lightning`,{worldPos:u,distance:v}),(i=e.services.audio)==null||(a=i.play)==null||a.call(i,`thunder`,u,{volume:Math.min(1,4e3/Math.max(500,v))})},placeShotBolt(e,t){var r;let i=e.services.planet,a=e.space.planetCenter,o=e.player.cameraWorld||e.space.origin,s=new n(o.x-a.x,o.y-a.y,o.z-a.z).normalize(),c=new n(0,0,-1).applyQuaternion(e.player.cameraQuat||e.camera.quaternion);c.addScaledVector(s,-c.dot(s)).normalize(),c.applyAxisAngle(s,-(t.az??0)*Math.PI/180);let l=(i==null?void 0:i.radius)||12e4,u=t.dist??5e3,d=s.clone().multiplyScalar(l).addScaledVector(c,u).normalize(),f=(i==null||(r=i.heightAt)==null?void 0:r.call(i,d))??0,p=d.multiplyScalar(l+Math.max(f,(i==null?void 0:i.seaLevel)??-1e9)).add(a);this.randomStrike(e,p,t.flash??1)},frame(e,t){let r=this.S,{space:i,player:a}=t,o=t.services.sky,s=t.time.world||0,c=!t.time.frozen,l=c?Math.min(.25,Math.max(0,e)):0;if(r.t<1){r.t=Math.min(1,r.t+l/Math.max(.01,r.dur));let e=r.t*r.t*(3-2*r.t);w(r.cur,r.from,r.to,e)}for(let e of z){let t=e===r.kind?r.to.precip:0,n=l/Math.max(2,r.dur*.6);r.dur<=0||!c?r.levels[e]=r.t>=1?t:r.levels[e]:r.levels[e]+=Math.max(-n,Math.min(n,t-r.levels[e]))}if(this.auto&&c&&(r.nextChange-=l,r.nextChange<=0)){let e=this.pickCycle();this.setWeather(t,e,18),r.nextChange=e===`clear`?this.rnd.range(160,360):this.rnd.range(90,220)}let u=r.cur,d=this.pub;Object.assign(d.cloud,{coverage:u.coverage,typeBias:u.typeBias,storm:u.storm,darkness:u.darkness,detail:u.detail,cirrus:u.cirrus,density:1}),r.windAngle+=l*.004;let f=1+.25*Math.sin(s*.37)*Math.sin(s*.11+1.3),p=u.wind*f;d.wind.set(Math.cos(r.windAngle)*p,0,Math.sin(r.windAngle)*p);let m=i.planetCenter,h=i.origin,_=h.x-m.x,v=h.y-m.y,y=h.z-m.z,b=Math.hypot(_,v,y)||1,x=(r._up||=new n).set(_/b,v/b,y/b);if(!r.frame||!r.frameAnchor||Math.hypot(h.x-r.frameAnchor.x,h.y-r.frameAnchor.y,h.z-r.frameAnchor.z)>4e3){let e=new n(0,1,0).cross(x);e.lengthSq()<1e-8&&e.set(1,0,0),e.normalize();let t=x.clone().cross(e).normalize();r.frame={east:e,up:x.clone(),north:t},r.frameAnchor={x:h.x,y:h.y,z:h.z}}let S=r.frame,C=(r._cl||=new n).set(_*S.east.x+v*S.east.y+y*S.east.z,_*S.up.x+v*S.up.y+y*S.up.z,_*S.north.x+v*S.north.y+y*S.north.z),T=a.velocity||new n,E=(r._cv||=new n).set(T.dot(S.east),T.dot(S.up),T.dot(S.north)),D=(r._wl||=new n).set(d.wind.x,0,d.wind.z),O=o==null?void 0:o.ambient,k=((O==null?void 0:O.intensity)??.5)/Math.PI,A=(O==null?void 0:O.color)||{r:.6,g:.7,b:.9},j=(o==null?void 0:o.sunColor)||{r:1,g:1,b:1},M=(o==null?void 0:o.sunIntensity)??3,N=(o==null?void 0:o.sunDirection)||x,P=Math.max(0,N.dot(x)),F=M*(1-.8*u.darkness)*Math.min(1,P*4),I=[A.r*k,A.g*k,A.b*k],L=[j.r*F,j.g*F,j.b*F],R=this.lightning.flash*2.5,B=(e,t)=>[0,1,2].map(n=>I[n]*e+L[n]*t/Math.PI+R*.06*I[n]/Math.max(.001,(I[0]+I[1]+I[2])/3)),V=B(.95*(1-.45*u.darkness),.35);d.fog.density=u.fog,d.fog.height=u.fogH,d.fog.color=V.map((e,t)=>e*u.fogTint[t]),d.fog.maxDist=8e4;let H=r._col||={rain:new g,acid:new g,snow:new g,dust:new g},U=B(1.4,.2);H.rain.setRGB(U[0]*.85,U[1]*.9,U[2]),H.acid.setRGB(U[0]*.9,U[1]*1.1,U[2]*.45);let W=B(1.15,.55);H.snow.setRGB(W[0],W[1],W[2]*1.05);let G=B(.9,.5),K=r.env.dustTint;H.dust.setRGB(G[0]*K[0],G[1]*K[1],G[2]*K[2]);let q=1-Math.min(1,Math.max(0,((a.altitude??0)-1800)/1200)),J=r._lv||={};for(let e of z)J[e]=r.levels[e]*q;this.particlesOn=this.precip.update({time:s,levels:J,frame:S,camLocal:C,camVel:E,wind:D,colors:H,viewH:t.pipeline.height||540});let Y=this.P.weatherBolt;t.shot&&Y&&!r.boltPlaced&&t.services.planet?(r.boltPlaced=!0,this.placeShotBolt(t,Y)):c&&u.lightning>.001&&(r.nextStrike-=l,r.nextStrike<=0&&(this.randomStrike(t),r.nextStrike=-Math.log(Math.max(1e-4,this.rnd.next()))/u.lightning)),this.lightning.update(c?l:0,t),this.particlesOn=this.particlesOn||this.lightning.mesh.visible;let X=a.view!==`third`,Z=this.lens.u,Q=u.lens*+!!X*q;Z.uRain.value=r.levels.rain*Q,Z.uAcid.value=r.levels.acid*Q,Z.uSnow.value=r.levels.snow*Q*.85,Z.uDust.value=r.levels.dust*Q*.8,Z.uHeat.value=u.heat*(X?1:.6),Z.uTime.value=s,Z.uDustTint.value.set(K[0],K[1],K[2]);let $=B(1,.4);Z.uLight.value.set($[0],$[1],$[2]),this.lens.active=Z.uRain.value+Z.uAcid.value+Z.uSnow.value+Z.uDust.value+Z.uHeat.value>.01},renderParticles(e){if(!this.particlesOn||!e)return;let t=this.ctx.renderer,n=t.getRenderTarget(),r=t.autoClear;t.autoClear=!1,t.setRenderTarget(e),this.precip.render(t,this.ctx.camera),t.setRenderTarget(n),t.autoClear=r},dispose(e){var t,n,r,i,a;for(let e of this.offs||[])e();(t=this.removeParticles)==null||t.call(this),(n=this.removeLens)==null||n.call(this),(r=this.precip)==null||r.dispose(),(i=this.lightning)==null||i.dispose(),(a=this.lens)==null||a.dispose()}};export{B as default};
//# sourceMappingURL=weather-DhsIJ3XB.js.map