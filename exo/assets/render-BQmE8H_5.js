import{$ as e,A as t,B as n,E as r,G as i,J as a,L as o,N as s,O as c,X as l,Y as u,_ as d,b as f,f as p,i as m,j as h,k as g,n as _,p as v,v as y,w as b,x,y as S,z as C}from"./three-CjNQKr8_.js";var w=`__exoCsmPatched`;function T(e){let t=m;t[w]||(t[w]={lights:t.lights_fragment_begin,pars:t.shadowmap_pars_fragment});let n=t[w],r=Math.max(2,e|0),i=``;for(let e=0;e<r;e++){let t=e===r-1;i+=`
    #if NUM_DIR_LIGHT_SHADOWS > ${e}
    {
      vec4 sc = vDirectionalShadowCoord[ ${e} ];
      vec3 c = sc.xyz / sc.w;
      float m = ${t?`0.0`:`0.03`};
      if ( c.x > m && c.x < 1.0 - m && c.y > m && c.y < 1.0 - m && c.z >= 0.0 && c.z <= 1.0 ) {
        float s = getShadow( directionalShadowMap[ ${e} ], directionalLightShadows[ ${e} ].shadowMapSize, directionalLightShadows[ ${e} ].shadowIntensity, directionalLightShadows[ ${e} ].shadowBias, directionalLightShadows[ ${e} ].shadowRadius, sc );
        ${t?`// última cascata: some suavemente perto da borda
        vec2 e = min( c.xy, 1.0 - c.xy );
        float f = smoothstep( 0.0, 0.12, min( e.x, e.y ) );
        return mix( 1.0, s, f );`:`return s;`}
      }
    }
    #endif`}let a=`${n.pars}
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  #ifndef EXO_CSM
  #define EXO_CSM ${r}
  #endif
  #if NUM_DIR_LIGHT_SHADOWS >= EXO_CSM
  float exoCsmShadow() {
    ${i}
    return 1.0;
  }
  #endif
#endif
`,o=/#if defined\( USE_SHADOWMAP \) && \( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS \)\s*\n\s*directionalLightShadow = directionalLightShadows\[ i \];\s*\n(.*getShadow\( directionalShadowMap\[ i \].*)\n\s*#endif/,s=n.lights.match(o);if(!s)throw Error(`CSM: lights_fragment_begin mudou nesta versão do three`);let c=n.lights.replace(o,`#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		#if defined( EXO_CSM ) && ( NUM_DIR_LIGHT_SHADOWS >= EXO_CSM ) && ( UNROLLED_LOOP_INDEX < EXO_CSM )
			#if ( UNROLLED_LOOP_INDEX == 0 )
			directLight.color *= ( directLight.visible && receiveShadow ) ? exoCsmShadow() : 1.0;
			#endif
		#else
		directionalLightShadow = directionalLightShadows[ i ];
${s[1]}
		#endif
		#endif`);t.shadowmap_pars_fragment=a,t.lights_fragment_begin=c}function E(){let e=m,t=e[w];t&&(e.lights_fragment_begin=t.lights,e.shadowmap_pars_fragment=t.pars)}var D={1:[.1,90],2:[.1,28,260],3:[.1,16,90,520],4:[.1,12,60,300,1500]},O=class{constructor(e){this.ctx=e,this.lights=[],this.count=0,this.enabled=!1,this.direction=new l(0,1,0),this.externalDir=null,this.size=2048,this._v=new l,this._r=new l,this._u=new l,this._c=new l,this.hiddenSun=null,this.radii=[],this.frame=0,this.prevO=new e.WorldPos,this.hasPrev=!1,this._t=new s,this.configure()}configure(){let e=this.ctx.quality,t=e.shadows?Math.max(1,Math.min(4,e.shadowCascades|0||1)):0,n=Math.max(512,Math.min(4096,e.shadowMapSize|0||2048));if(!(t===this.count&&n===this.size)){this.disposeLights(),this.count=t,this.size=n,t>=2&&T(t);for(let e=0;e<t;e++){let t=new f(16777215,e===0?3:0);t.name=`render:csm${e}`,t.castShadow=!0,t.shadow.mapSize.set(n,n),t.shadow.bias=-2e-4,t.shadow.radius=e===0?2.5:1.5,e>0&&t.color.setRGB(0,0,0),t.shadow.autoUpdate=!1,t.shadow.needsUpdate=!0,this.ctx.scene.add(t,t.target),this.lights.push(t)}this.radii=[]}}disposeLights(){for(let n of this.lights){var e,t;this.ctx.scene.remove(n,n.target),(e=n.shadow.map)==null||e.dispose(),(t=n.dispose)==null||t.call(n)}this.lights=[]}setLightDirection(e){this.externalDir=e?e.clone().normalize():null}update(){var e;let t=this.ctx,n=t.services.sky,r=n==null?void 0:n.sun;if(!this.count){this.restoreSun();return}r&&r!==this.lights[0]&&(this.hiddenSun!==r&&(this.restoreSun(),this.hiddenSun=r),r.visible=!1,r.castShadow=!1,this.lights[0].color.copy(r.color),this.lights[0].intensity=r.intensity);let i=this.externalDir||(n==null?void 0:n.sunDirection);i&&this.direction.copy(i).normalize();let a=this.lights[0].intensity>.001,o=((e=t.player)==null?void 0:e.altitude)??0,s=a&&o<4e3&&t.renderer.shadowMap.enabled;for(let e of this.lights)e.castShadow=t.renderer.shadowMap.enabled;if(this.enabled=s,!s){for(let e of this.lights)e.shadow.needsUpdate=!1;this.hasPrev=!1;return}let c=t.camera,l=D[this.count],u=Math.tan(h.degToRad(c.fov*.5)),d=u*c.aspect,f=this._v.set(0,0,-1).applyQuaternion(c.quaternion),p=this.direction,m=this._r.set(0,1,0).cross(p);m.lengthSq()<1e-6&&m.set(1,0,0).cross(p),m.normalize();let g=this._u.copy(p).cross(m).normalize(),_=t.space.origin,v=this.hasPrev?_.x-this.prevO.x:0,y=this.hasPrev?_.y-this.prevO.y:0,b=this.hasPrev?_.z-this.prevO.z:0,x=Math.hypot(v,y,b);this.prevO.copy(_);let S=!this.hasPrev;this.hasPrev=!0,this.frame++;let C=S||x>3;for(let e=0;e<this.count;e++){let t=this.lights[e],n=e===0?1:e===3?4:2,r=+(e===2);if(!(C||n===1||this.frame%n===r)){t.shadow.needsUpdate=!1,x>0&&t.shadow.matrix.multiply(this._t.makeTranslation(v,y,b));continue}t.shadow.needsUpdate=!0;let i=l[e],a=l[e+1],o=1+d*d+u*u,s=.5*(i+a)*o;s>a&&(s=a);let c=Math.sqrt((s-i)**2+i*i*(o-1)),h=Math.sqrt((s-a)**2+a*a*(o-1)),S=Math.max(c,h);S=Math.ceil(S*1.04+.5);let w=2*S/this.size,T=this._c.copy(f).multiplyScalar(s),E=T.x+_.x,D=T.y+_.y,O=T.z+_.z,k=m.x*E+m.y*D+m.z*O,A=g.x*E+g.y*D+g.z*O,j=Math.floor(k/w)*w-k,M=Math.floor(A/w)*w-A;T.addScaledVector(m,j).addScaledVector(g,M);let N=Math.min(3e3,200+S*3);t.target.position.copy(T),t.position.copy(T).addScaledVector(p,S+N);let P=t.shadow.camera;P.left=-S,P.right=S,P.top=S,P.bottom=-S,P.near=.5,P.far=2*S+N,P.updateProjectionMatrix(),t.shadow.normalBias=w*1.4,t.shadow.bias=-5e-5*(1+e),t.target.updateMatrixWorld(),t.updateMatrixWorld(),this.radii[e]=S}}restoreSun(){this.hiddenSun&&=(this.hiddenSun.visible=!0,null)}dispose(){this.disposeLights(),this.restoreSun(),E()}},k=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,A=`
uniform float uDepthMode;
uniform float uNear;
uniform float uFar;
// distância ao longo do eixo da câmera (m); céu → 1e12
float exoViewZ(float d) {
  if (uDepthMode < 0.5) {
    if (d <= 0.0) return 1e12;
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) return 1e12;
    return exp2(d * log2(uFar + 1.0)) - 1.0;
  }
  if (d >= 1.0) return 1e12;
  float ndc = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
}
// inverso: distância no eixo → valor de depth do modo atual
float exoDepthFromViewZ(float z) {
  if (uDepthMode < 0.5) {
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return clamp(dd / max(z, uNear) - c, 0.0, 1.0);
  } else if (uDepthMode < 1.5) {
    return clamp(log2(1.0 + z) / log2(uFar + 1.0), 0.0, 1.0);
  }
  float ndc = ((uFar + uNear) - 2.0 * uNear * uFar / max(z, uNear)) / (uFar - uNear);
  return clamp(ndc * 0.5 + 0.5, 0.0, 1.0);
}
`;function j(e){return{uDepthMode:{value:e.depthMode===`reversed`?0:e.depthMode===`log`?1:2},uNear:{value:e.camera.near},uFar:{value:e.camera.far}}}var M=`
float exoLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`,N=`
float exoHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float exoIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;function P(i,a,{type:o=r,format:s=n,filter:l=c,depth:u=!1,mips:d=!1,name:f=`exo.rt`}={}){let m=new e(Math.max(1,i|0),Math.max(1,a|0),{type:o,format:s,colorSpace:t,depthBuffer:u,stencilBuffer:!1,minFilter:d?g:l,magFilter:l,generateMipmaps:d,wrapS:p,wrapT:p});return m.texture.name=f,m}function F(e,t,n={}){return new i({uniforms:t,vertexShader:k,fragmentShader:e,depthTest:!1,depthWrite:!1,glslVersion:n.glsl3?b:null,...Object.fromEntries(Object.entries(n).filter(([e])=>e!==`glsl3`))})}var I=class{constructor(e){this.renderer=e,this.quad=new _(null)}draw(e,t){let n=this.renderer,r=n.autoClear;n.autoClear=!1,n.setRenderTarget(t),this.quad.material=e,this.quad.render(n),n.autoClear=r}dispose(){this.quad.dispose()}};function L(e,t,n){t=Math.max(1,t|0),n=Math.max(1,n|0),(e.width!==t||e.height!==n)&&e.setSize(t,n)}var R=`
uniform sampler2D tSrc;
uniform float uGain;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uGain, 1.0); }`,ee=`
${A}
${N}
uniform sampler2D tDepth;
uniform vec2 uTexel;      // 1/resolução do depth
uniform vec2 uTan;        // tan(fov/2)·aspect, tan(fov/2)
uniform float uProjScale; // pixels (meia-res) por metro a 1 m
uniform float uRadius;    // m
uniform float uIntensity;
uniform float uMaxDist;
uniform float uFrame;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float z = exoViewZ(texture2D(tDepth, uv).r);
  return vec3((uv * 2.0 - 1.0) * uTan * z, -z);
}

void main() {
  vec3 P = viewPos(vUv);
  float z = -P.z;
  if (z > uMaxDist) { gl_FragColor = vec4(1.0); return; }
  // normal pela menor diferença em cada eixo (sem halo nas bordas)
  vec3 px = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 nx = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 py = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 ny = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
  vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
  vec3 N = normalize(cross(dx, dy));
  float rad = uRadius * (1.0 + z * 0.012);
  float rPx = rad * uProjScale / z;
  if (rPx < 1.0) { gl_FragColor = vec4(1.0); return; }
  rPx = min(rPx, 90.0);
  float ang = exoIGN(gl_FragCoord.xy + uFrame * 7.0) * 6.2831853;
  float occ = 0.0;
  const int S = 12;
  for (int i = 0; i < S; i++) {
    float a = (float(i) + 0.5) / float(S);
    float th = a * 6.2831853 * 3.0 + ang;
    vec2 off = vec2(cos(th), sin(th)) * a * rPx * uTexel;
    vec3 Q = viewPos(vUv + off);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    float f = max(rad * rad - vv, 0.0) / (rad * rad);
    occ += f * max(vn - 0.02 * z * 0.01 - 0.01, 0.0) / (vv + 0.05 * rad * rad);
  }
  occ = occ * uIntensity * 2.0 / float(S);
  float fade = 1.0 - smoothstep(uMaxDist * 0.6, uMaxDist, z);
  float ao = clamp(1.0 - occ * fade, 0.0, 1.0);
  gl_FragColor = vec4(ao, z, 0.0, 1.0);
}`,z=`
uniform sampler2D tAO;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 c = texture2D(tAO, vUv).rg;
  float sum = c.r, w = 1.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel).rg;
      float k = exp(-abs(s.g - c.g) / max(c.g * 0.04, 0.05)) * (1.0 - 0.12 * float(abs(x) + abs(y)));
      sum += s.r * k;
      w += k;
    }
  }
  float ao = sum / w;
  // aplicação: curva suave (preserva meios-tons)
  gl_FragColor = vec4(vec3(mix(1.0, ao, 0.9)), 1.0);
}`,B=class{constructor(e){this.ctx=e,this.ao=P(1,1,{name:`exo.ao`}),this.blur=P(1,1,{name:`exo.aoBlur`}),this.uAO={...j(e),tDepth:{value:null},uTexel:{value:new u},uTan:{value:new u(1,1)},uProjScale:{value:100},uRadius:{value:1.6},uIntensity:{value:1.2},uMaxDist:{value:450},uFrame:{value:0}},this.mAO=F(ee,this.uAO),this.uBlur={tAO:{value:this.ao.texture},uTexel:{value:new u}},this.mBlur=F(z,this.uBlur),this.mApply=new i({uniforms:{tSrc:{value:this.blur.texture}},vertexShader:k,fragmentShader:`uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`,depthTest:!1,depthWrite:!1,blending:5,blendEquation:100,blendSrc:200,blendDst:202,blendSrcAlpha:200,blendDstAlpha:201})}render(e,t,n){let r=Math.max(1,t.width>>1),i=Math.max(1,t.height>>1);L(this.ao,r,i),L(this.blur,r,i);let a=this.uAO;a.tDepth.value=t.depthTexture,a.uTexel.value.set(1/r,1/i);let o=Math.tan(h.degToRad(n.fov*.5));a.uTan.value.set(o*n.aspect,o),a.uProjScale.value=i/(2*o),a.uFrame.value=this.ctx.shot?0:this.ctx.time.frame%64,e.draw(this.mAO,this.ao),this.uBlur.uTexel.value.set(1/r,1/i),e.draw(this.mBlur,this.blur),e.draw(this.mApply,t)}dispose(){this.ao.dispose(),this.blur.dispose(),this.mAO.dispose(),this.mBlur.dispose(),this.mApply.dispose()}},V=`
${A}
uniform sampler2D tDepth;
uniform vec2 uTan;          // tan(fov/2)·aspect, tan(fov/2) (sem jitter)
uniform mat4 uCamRot;       // câmera → espaço de render (só rotação)
uniform mat4 uPrevVP;       // projeção·visão do frame anterior
uniform vec3 uDeltaO;       // origem atual − origem anterior (m)
// uv do mesmo ponto do mundo no frame anterior (xy) e se é céu (z)
vec3 exoReproject(vec2 uv) {
  float z = exoViewZ(texture2D(tDepth, uv).r);
  vec3 vdir = vec3((uv * 2.0 - 1.0) * uTan, -1.0);
  vec4 clip;
  float sky = 0.0;
  if (z > 1e11) {
    vec3 d = (uCamRot * vec4(vdir, 0.0)).xyz;
    clip = uPrevVP * vec4(d, 0.0);
    sky = 1.0;
  } else {
    vec3 p = (uCamRot * vec4(vdir * z, 1.0)).xyz;
    clip = uPrevVP * vec4(p + uDeltaO, 1.0);
  }
  if (clip.w <= 0.0) return vec3(-1.0, -1.0, sky);
  return vec3(clip.xy / clip.w * 0.5 + 0.5, sky);
}
`;function H(e){return{...j(e),tDepth:{value:null},uTan:{value:new u(1,1)},uCamRot:{value:new s},uPrevVP:{value:new s},uDeltaO:{value:new l}}}var U=class{constructor(e){this.ctx=e,this.prevVP=new s,this.curVP=new s,this.prevO=new e.WorldPos,this.curO=new e.WorldPos,this.delta=new l,this.valid=!1,this.jump=!0,this._m=new s,this.speed=0,this.angSpeed=0,this._q=new C,this._qPrev=new C}update(e){let t=this.ctx.camera,n=this.ctx.space.origin;this.prevVP.copy(this.curVP),this.prevO.copy(this.curO),this._qPrev.copy(this._q),t.updateMatrixWorld(),this._m.copy(t.matrixWorld).invert(),this.curVP.multiplyMatrices(t.projectionMatrix,this._m),this.curO.copy(n),this._q.copy(t.quaternion),this.delta.set(n.x-this.prevO.x,n.y-this.prevO.y,n.z-this.prevO.z);let r=this.delta.length(),i=this.valid?this._q.angleTo(this._qPrev):0,a=Math.max(e,.001);this.speed=this.valid?r/a:0,this.angSpeed=i/a,this.jump=!this.valid||r>2e3||i>.6,this.valid=!0}fill(e){let t=this.ctx.camera,n=Math.tan(h.degToRad(t.fov*.5));e.uTan.value.set(n*t.aspect,n),e.uCamRot.value.makeRotationFromQuaternion(t.quaternion),e.uPrevVP.value.copy(this.prevVP),e.uDeltaO.value.copy(this.delta)}},W=`
${V}
${M}
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uReset;
varying vec2 vUv;
vec3 toY(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
// compressão reversível (tons altos não dominam a média)
vec3 tmap(vec3 c) { return c / (1.0 + exoLuma(c)); }
vec3 itmap(vec3 c) { return c / max(1.0 - exoLuma(c), 1e-4); }
void main() {
  vec3 c = tmap(max(texture2D(tCur, vUv).rgb, 0.0));
  if (uReset > 0.5) { gl_FragColor = vec4(itmap(c), 1.0); return; }
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 mn = vec3(1e9), mx = vec3(-1e9);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 s = toY(tmap(max(texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel).rgb, 0.0)));
      m1 += s; m2 += s * s;
      mn = min(mn, s); mx = max(mx, s);
    }
  }
  // caixa pela variância (mais justa que min/max: menos fantasma)
  vec3 mu = m1 / 9.0;
  vec3 sd = sqrt(max(m2 / 9.0 - mu * mu, 0.0));
  vec3 bmn = max(mn, mu - 1.25 * sd), bmx = min(mx, mu + 1.25 * sd);
  vec3 rp = exoReproject(vUv);
  vec2 puv = rp.xy;
  if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { gl_FragColor = vec4(itmap(c), 1.0); return; }
  vec3 h = toY(tmap(max(texture2D(tHist, puv).rgb, 0.0)));
  // recorte ao longo do segmento até o centro da caixa
  vec3 cc = 0.5 * (bmx + bmn), ext = 0.5 * (bmx - bmn) + 1e-4;
  vec3 v = h - cc;
  vec3 a = abs(v / ext);
  float ma = max(a.x, max(a.y, a.z));
  if (ma > 1.0) h = cc + v / ma;
  // mais peso no atual quando a câmera se move muito (menos borrão)
  float motion = length((puv - vUv) / uTexel);
  float w = clamp(uBlend + motion * 0.01, uBlend, 0.5);
  vec3 r = mix(fromY(h), c, w);
  gl_FragColor = vec4(itmap(r), 1.0);
}`,G=class e{constructor(e,t){this.ctx=e,this.hist=t,this.a=P(1,1,{name:`exo.taaA`}),this.b=P(1,1,{name:`exo.taaB`}),this.u={...H(e),tCur:{value:null},tHist:{value:null},uTexel:{value:new u},uBlend:{value:.1},uReset:{value:1}},this.mat=F(W,this.u),this.index=0,this.reset=!0,this.jx=0,this.jy=0}static halton(e,t){let n=1,r=0;for(;e>0;)n/=t,r+=e%t*n,e=Math.floor(e/t);return r}jitter(t,n,r){this.index=this.index%8+1,this.jx=(e.halton(this.index,2)-.5)*2/n,this.jy=(e.halton(this.index,3)-.5)*2/r;let i=t.projectionMatrix.elements;i[8]+=this.jx,i[9]+=this.jy,t.projectionMatrixInverse.copy(t.projectionMatrix).invert()}unjitter(e){let t=e.projectionMatrix.elements;t[8]-=this.jx,t[9]-=this.jy,e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}render(e,t,n){let r=t.width,i=t.height;(this.a.width!==r||this.a.height!==i)&&(this.reset=!0),L(this.a,r,i),L(this.b,r,i);let a=this.u;this.hist.fill(a),a.tDepth.value=n,a.tCur.value=t.texture,a.tHist.value=this.a.texture,a.uTexel.value.set(1/r,1/i),a.uReset.value=this.reset||this.hist.jump?1:0,a.uBlend.value=this.ctx.shot?.06:.1,e.draw(this.mat,this.b);let o=this.a;return this.a=this.b,this.b=o,this.reset=!1,this.a}dispose(){this.a.dispose(),this.b.dispose(),this.mat.dispose()}},K=`
${V}
${N}
uniform sampler2D tSrc;
uniform float uScale;
uniform float uMaxPx;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 rp = exoReproject(vUv);
  vec2 v = (vUv - rp.xy) * uScale;
  float len = length(v / uTexel);
  if (rp.x < -0.5 || len < 0.75) { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); return; }
  v *= min(1.0, uMaxPx / len);
  float j = exoIGN(gl_FragCoord.xy) - 0.5;
  vec3 acc = vec3(0.0);
  const int N = 10;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + j) / float(N - 1) - 0.5;
    acc += texture2D(tSrc, vUv - v * t).rgb;
  }
  gl_FragColor = vec4(acc / float(N), 1.0);
}`,q=class{constructor(e,t){this.ctx=e,this.hist=t,this.out=P(1,1,{name:`exo.mblur`}),this.u={...H(e),tSrc:{value:null},uScale:{value:0},uMaxPx:{value:40},uTexel:{value:new u}},this.mat=F(K,this.u),this.amount=0}strength(e){let t=this.hist,n=this.ctx.player;if(t.jump)return 0;let r=(n==null?void 0:n.mode)===`walk`?0:h.smoothstep(t.speed,120,1500),i=(n==null?void 0:n.mode)===`walk`?0:h.smoothstep(t.angSpeed,1.5,6)*.4,a=Math.max(r,i),o=1-Math.exp(-Math.max(e,0)*6);return this.amount+=(a-this.amount)*(this.ctx.shot?1:o),this.amount}render(e,t,n,r,i){L(this.out,t.width,t.height);let a=this.u;return this.hist.fill(a),a.tDepth.value=n,a.tSrc.value=t.texture,a.uTexel.value.set(1/t.width,1/t.height),a.uScale.value=r*Math.min(2,1/60/Math.max(i,1/240))*1.2,a.uMaxPx.value=12+40*r,e.draw(this.mat,this.out),this.out}dispose(){this.out.dispose(),this.mat.dispose()}},J=`
${M}
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + vec2(-0.25, -0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.25, -0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(-0.25, 0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.25, 0.25) * uTexel).rgb;
  float l = exoLuma(max(c * 0.25, 0.0));
  // peso central (o que se olha conta mais) e menos o topo (céu)
  vec2 d = (vUv - vec2(0.5, 0.45)) * vec2(1.2, 1.6);
  float w = exp(-dot(d, d) * 2.5) + 0.15;
  gl_FragColor = vec4(log2(clamp(l, 1e-4, 6e4)) * w, w, 0.0, 1.0);
}`,Y=`
uniform sampler2D tLum;
uniform sampler2D tPrev;
uniform float uLevel;
uniform float uRate;     // 0..1 (1 = instantâneo)
uniform float uKey;
uniform float uMin, uMax;
uniform float uComp;     // fração da adaptação (1 = total)
uniform float uBase;     // exposição base (pipeline.exposure)
uniform float uFirst;
varying vec2 vUv;
void main() {
  vec2 s = textureLod(tLum, vec2(0.5), uLevel).rg;
  float avg = exp2(s.r / max(s.g, 1e-5));
  // adaptação parcial: cenas claras continuam claras, escuras escuras
  float e = pow(uKey / max(avg, 1e-4), uComp);
  e = clamp(e, uMin, uMax) * uBase;
  float prev = texture2D(tPrev, vec2(0.5)).r;
  if (uFirst > 0.5 || !(prev > 0.0) || prev > 1e4) prev = e;
  // adapta em EV (log), não linear
  float r = exp2(mix(log2(prev), log2(e), uRate));
  gl_FragColor = vec4(r, avg, 0.0, 1.0);
}`,X=class{constructor(e){this.ctx=e,this.lum=P(128,128,{name:`exo.lum`,mips:!0}),this.a=P(1,1,{name:`exo.expA`,filter:o}),this.b=P(1,1,{name:`exo.expB`,filter:o}),this.uL={tSrc:{value:null},uTexel:{value:new u}},this.mL=F(J,this.uL),this.uA={tLum:{value:this.lum.texture},tPrev:{value:this.a.texture},uLevel:{value:7},uRate:{value:1},uKey:{value:.18},uMin:{value:.25},uMax:{value:3.5},uComp:{value:.72},uBase:{value:1},uFirst:{value:1}},this.mA=F(Y,this.uA),this.mFixed=F(`uniform float uE; void main(){ gl_FragColor = vec4(uE, 0.0, 0.0, 1.0); }`,{uE:{value:1}}),this.first=!0,this.auto=!0}get texture(){return this.a.texture}render(e,t,n,r){if(!this.auto)return this.mFixed.uniforms.uE.value=n,e.draw(this.mFixed,this.a),this.a.texture;this.uL.tSrc.value=t.texture,this.uL.uTexel.value.set(1/128,1/128),e.draw(this.mL,this.lum);let i=this.uA;i.tPrev.value=this.a.texture,i.uBase.value=n,i.uRate.value=this.first||this.ctx.shot?1:1-Math.exp(-Math.max(r,0)*1.6),i.uFirst.value=+!!this.first,e.draw(this.mA,this.b);let a=this.a;return this.a=this.b,this.b=a,this.first=!1,this.a.texture}dispose(){for(let e of[this.lum,this.a,this.b])e.dispose();this.mL.dispose(),this.mA.dispose(),this.mFixed.dispose()}},Z=`
${A}
${M}
uniform sampler2D tSrc;
uniform sampler2D tExp;
uniform sampler2D tSel;
uniform sampler2D tSelDepth;
uniform sampler2D tDepth;
uniform float uSel;
uniform float uThreshold;
uniform float uKnee;
uniform vec2 uTexel;  // da fonte
varying vec2 vUv;
vec3 karis(vec3 c) { return c / (1.0 + exoLuma(c)); }
void main() {
  float e = texture2D(tExp, vec2(0.5)).r;
  // 4 amostras bilineares com média de Karis (vaga-lumes não explodem)
  vec3 a = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 b = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 c = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 d = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  float wa = 1.0 / (1.0 + exoLuma(a * e)), wb = 1.0 / (1.0 + exoLuma(b * e));
  float wc = 1.0 / (1.0 + exoLuma(c * e)), wd = 1.0 / (1.0 + exoLuma(d * e));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd) * e;
  col = min(max(col, 0.0), vec3(200.0));
  // joelho suave
  float br = max(col.r, max(col.g, col.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = rq * rq / (4.0 * uKnee + 1e-4);
  float k = max(rq, br - uThreshold) / max(br, 1e-4);
  col *= k;
  if (uSel > 0.5) {
    float sd = texture2D(tSelDepth, vUv).r;
    float zs = exoViewZ(sd);
    float zw = exoViewZ(texture2D(tDepth, vUv).r);
    float vis = zs <= zw * 1.002 + 0.05 ? 1.0 : 0.0;
    col += max(texture2D(tSel, vUv).rgb, 0.0) * e * vis * 1.5;
  }
  gl_FragColor = vec4(col, 1.0);
}`,Q=`
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  // 13 amostras (Jimenez 2014)
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(r, 1.0);
}`,te=`
uniform sampler2D tLow;   // nível menor (já acumulado)
uniform sampler2D tHigh;  // nível atual (redução)
uniform vec2 uTexel;      // do nível menor
uniform float uRadius;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tLow, vUv + o * uTexel).rgb; }
void main() {
  vec3 t = s(vec2(0.0)) * 4.0
    + (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0
    + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
  t /= 16.0;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + t * uRadius, 1.0);
}`,ne=class{constructor(n){this.ctx=n,this.levels=6,this.down=[],this.up=[];for(let e=0;e<this.levels;e++)this.down.push(P(1,1,{name:`exo.bloomD${e}`})),e<this.levels-1&&this.up.push(P(1,1,{name:`exo.bloomU${e}`}));let i=new S(1,1,x);this.sel=new e(1,1,{type:r,depthBuffer:!0,depthTexture:i,colorSpace:t}),this.sel.texture.name=`exo.bloomSel`,this.uP={...j(n),tSrc:{value:null},tExp:{value:null},tSel:{value:this.sel.texture},tSelDepth:{value:i},tDepth:{value:null},uSel:{value:0},uThreshold:{value:1},uKnee:{value:.6},uTexel:{value:new u}},this.mP=F(Z,this.uP),this.uD={tSrc:{value:null},uTexel:{value:new u}},this.mD=F(Q,this.uD),this.uU={tLow:{value:null},tHigh:{value:null},uTexel:{value:new u},uRadius:{value:.85}},this.mU=F(te,this.uU),this.strength=.32,this.selective=new Set}register(e){var t;e&&(this.selective.add(e),(t=e.traverse)==null||t.call(e,e=>e.layers.enable(11)))}unregister(e){var t;e&&(this.selective.delete(e),(t=e.traverse)==null||t.call(e,e=>e.layers.disable(11)))}renderSelective(e,t){let n=this.ctx,r=!1;for(let e of this.selective)if(e.parent&&e.visible){r=!0;break}if(!r)return!1;L(this.sel,e,t);let i=n.renderer,a=n.camera,o=a.layers.mask,s=n.scene.background;return a.layers.set(11),n.scene.background=null,i.setRenderTarget(this.sel),i.setClearColor(0,0),i.clear(!0,!0,!1),i.render(n.scene,a),a.layers.mask=o,n.scene.background=s,!0}render(e,t,n,r){let i=Math.max(1,t.width>>1),a=Math.max(1,t.height>>1),o=i,s=a;for(let e=0;e<this.levels;e++)L(this.down[e],o,s),e<this.levels-1&&L(this.up[e],o,s),o=Math.max(1,o>>1),s=Math.max(1,s>>1);let c=this.renderSelective(i,a),l=this.uP;l.tSrc.value=t.texture,l.tExp.value=r,l.tDepth.value=n,l.uSel.value=+!!c,l.uTexel.value.set(.5/t.width,.5/t.height),e.draw(this.mP,this.down[0]);for(let t=1;t<this.levels;t++){let n=this.down[t-1];this.uD.tSrc.value=n.texture,this.uD.uTexel.value.set(1/n.width,1/n.height),e.draw(this.mD,this.down[t])}let u=this.down[this.levels-1];for(let t=this.levels-2;t>=0;t--)this.uU.tLow.value=u.texture,this.uU.tHigh.value=this.down[t].texture,this.uU.uTexel.value.set(1/u.width,1/u.height),e.draw(this.mU,this.up[t]),u=this.up[t];return this.up[0].texture}dispose(){for(let e of[...this.down,...this.up,this.sel])e.dispose();this.mP.dispose(),this.mD.dispose(),this.mU.dispose()}},re=`
${A}
${M}
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform sampler2D tExp;
uniform vec2 uSun;      // posição do sol na tela (uv)
uniform float uAspect;
uniform vec2 uTexel;    // da fonte
varying vec2 vUv;
void main() {
  // 4 amostras de profundidade: céu = 1 (borda suave)
  float sky = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1) - 0.5, float(i >> 1) - 0.5) * 2.0 * uTexel;
    float z = exoViewZ(texture2D(tDepth, vUv + o).r);
    float s = z > 1e11 ? 1.0 : 0.0;
    sky += s;
    col += texture2D(tSrc, vUv + o).rgb * s;
  }
  sky *= 0.25;
  col *= 0.25;
  float e = texture2D(tExp, vec2(0.5)).r;
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
  float r = length(d);
  // brilho do céu (já tem a cor do sol e do halo) com queda radial
  float fall = exp(-r * 3.2) + 0.25 * exp(-r * 0.9);
  vec3 c = min(col * e, vec3(6.0)) * fall;
  gl_FragColor = vec4(c, sky);
}`,ie=`
${N}
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uStep;   // fração do caminho até o sol por passada
uniform float uDecay;
varying vec2 vUv;
void main() {
  vec2 dir = (uSun - vUv);
  float j = exoIGN(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  float wsum = 0.0, w = 1.0;
  const int N = 20;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + j) / float(N) * uStep;
    vec2 uv = vUv + dir * t;
    acc += texture2D(tSrc, uv).rgb * w;
    wsum += w;
    w *= uDecay;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`,ae=class{constructor(e){this.ctx=e,this.mask=P(1,1,{name:`exo.rayMask`}),this.a=P(1,1,{name:`exo.raysA`}),this.b=P(1,1,{name:`exo.raysB`}),this.uM={...j(e),tSrc:{value:null},tDepth:{value:null},tExp:{value:null},uSun:{value:new u(.5,.5)},uAspect:{value:1},uTexel:{value:new u}},this.mM=F(re,this.uM),this.uR={tSrc:{value:null},uSun:{value:new u},uStep:{value:1},uDecay:{value:.96}},this.mR=F(ie,this.uR),this.sunUv=new u,this.intensity=0,this._v=new l,this.strength=1}prepare(){var e,t;let n=this.ctx,r=n.services.sky,i=r==null?void 0:r.sunDirection;if(!i)return 0;let a=n.camera,o=this._v.copy(i).applyQuaternion(a.quaternion.clone().invert());if(o.z>-.05)return this.intensity=0;let s=Math.tan(h.degToRad(a.fov*.5)),c=o.x/-o.z/(s*a.aspect),l=o.y/-o.z/s;this.sunUv.set(c*.5+.5,l*.5+.5);let u=Math.max(Math.abs(c),Math.abs(l)),d=1-h.smoothstep(u,1,1.9),f=(e=n.player)==null?void 0:e.up,p=f?i.dot(f):.3,m=h.smoothstep(p,-.06,.03),g=.55+.45*(1-h.smoothstep(p,.05,.6)),_=r==null?void 0:r.atmosphere,v=((t=n.player)==null?void 0:t.altitude)??0,y=_?1-h.smoothstep(v,8e3,4e4):1;return this.intensity=d*m*g*y*this.strength,this.intensity}render(e,t,n,r){let i=Math.max(1,t.width>>2),a=Math.max(1,t.height>>2);L(this.mask,i,a),L(this.a,i,a),L(this.b,i,a);let o=this.uM;o.tSrc.value=t.texture,o.tDepth.value=n,o.tExp.value=r,o.uSun.value.copy(this.sunUv),o.uAspect.value=t.width/t.height,o.uTexel.value.set(1/t.width,1/t.height),e.draw(this.mM,this.mask);let s=this.uR;s.uSun.value.copy(this.sunUv);let c=[[this.mask,this.a,.9,.97],[this.a,this.b,.33,.985],[this.b,this.a,.11,1]];for(let[t,n,r,i]of c)s.tSrc.value=t.texture,s.uStep.value=r,s.uDecay.value=i,e.draw(this.mR,n);return this.a.texture}dispose(){for(let e of[this.mask,this.a,this.b])e.dispose();this.mM.dispose(),this.mR.dispose()}},oe=`
${M}
${N}
uniform sampler2D tSrc;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform sampler2D tExp;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRayColor;
uniform float uCA;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec2 uAspect;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = IN * (color / 0.6);
  color = RRTAndODTFit(color);
  return clamp(OUT * color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  float e = texture2D(tExp, vec2(0.5)).r;
  vec2 d = vUv - 0.5;
  float r2 = dot(d * uAspect, d * uAspect);
  // aberração cromática radial, só nas bordas (r² ∝ distância do centro)
  vec2 ca = d * r2 * uCA;
  vec3 col;
  col.r = texture2D(tSrc, vUv - ca).r;
  col.g = texture2D(tSrc, vUv).g;
  col.b = texture2D(tSrc, vUv + ca).b;
  col = max(col, 0.0) * e;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col += texture2D(tRays, vUv).rgb * uRayColor * uRays;
  // vinheta física (cos⁴ suave)
  float vig = 1.0 - uVignette * smoothstep(0.08, 0.75, r2);
  col *= vig;
  vec3 m = aces(col);
  // gradação sutil: contraste em torno do cinza médio, saturação, sombras frias
  float l = exoLuma(m);
  m = mix(vec3(l), m, uSaturation);
  m = max(m, 0.0);
  m = pow(m, vec3(uContrast)) * pow(0.18, 1.0 - uContrast);
  m += uLift * (1.0 - smoothstep(0.0, 0.25, l));
  gl_FragColor = vec4(toSRGB(clamp(m, 0.0, 1.0)), 1.0);
}`,$=class{constructor(e){this.ctx=e,this.out=P(1,1,{name:`exo.ldr`,type:a}),this.black=new d(new Uint8Array([0,0,0,255]),1,1),this.black.needsUpdate=!0,this.u={tSrc:{value:null},tBloom:{value:this.black},tRays:{value:this.black},tExp:{value:null},uBloom:{value:0},uRays:{value:0},uRayColor:{value:new v(1,.9,.75)},uCA:{value:.006},uVignette:{value:.32},uSaturation:{value:1.12},uContrast:{value:1.07},uLift:{value:new l(0,.002,.006)},uAspect:{value:new u(1,1)}},this.mat=F(oe,this.u)}render(e,t,{bloom:n,bloomStrength:r,rays:i,rayStrength:a,rayColor:o,exposure:s}){L(this.out,t.width,t.height);let c=this.u;c.tSrc.value=t.texture,c.tBloom.value=n||this.black,c.uBloom.value=n?r:0,c.tRays.value=i||this.black,c.uRays.value=i?a:0,o&&c.uRayColor.value.copy(o),c.tExp.value=s;let l=t.width/t.height;return c.uAspect.value.set(l/Math.max(l,1),1/Math.max(l,1)),e.draw(this.mat,this.out),this.out}dispose(){this.out.dispose(),this.mat.dispose(),this.black.dispose()}},se=`
${N}
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFXAA;
uniform float uSharpen;
uniform float uGrain;
uniform float uSeed;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaa(vec2 uv) {
  vec3 rgbNW = texture2D(tSrc, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tSrc, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tSrc, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tSrc, uv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture2D(tSrc, uv).rgb;
  float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 A = 0.5 * (texture2D(tSrc, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 B = A * 0.5 + 0.25 * (texture2D(tSrc, uv - dir * 0.5).rgb + texture2D(tSrc, uv + dir * 0.5).rgb);
  float lB = lum(B);
  return (lB < lMin || lB > lMax) ? A : B;
}
void main() {
  vec3 c;
  if (uFXAA > 0.5) c = fxaa(vUv);
  else {
    c = texture2D(tSrc, vUv).rgb;
    if (uSharpen > 0.0) {
      // nitidez adaptativa leve (compensa a suavidade do TAA)
      vec3 n = texture2D(tSrc, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, uTexel.y)).rgb
             + texture2D(tSrc, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 mn = min(c, n * 0.25), mx = max(c, n * 0.25);
      vec3 hp = c - n * 0.25;
      float amt = uSharpen * (1.0 - clamp(length(hp) * 4.0, 0.0, 1.0));
      c = clamp(c + hp * amt, 0.0, 1.0);
    }
  }
  // grão de filme: mais visível nos meios-tons, quase nada no preto/branco
  float l = lum(c);
  float g = exoHash12(gl_FragCoord.xy + uSeed * 61.7) + exoHash12(gl_FragCoord.xy * 1.37 + uSeed * 17.3) - 1.0;
  c += g * uGrain * (0.35 + 0.65 * 4.0 * l * (1.0 - l));
  // dithering de 8 bits (sem bandas no céu)
  c += (exoIGN(gl_FragCoord.xy + uSeed) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`,ce=class{constructor(e){this.ctx=e,this.u={tSrc:{value:null},uTexel:{value:new u},uFXAA:{value:1},uSharpen:{value:0},uGrain:{value:.022},uSeed:{value:0}},this.mat=F(se,this.u)}render(e,t,{fxaa:n,sharpen:r,grain:i}){let a=this.u;a.tSrc.value=t.texture,a.uTexel.value.set(1/t.width,1/t.height),a.uFXAA.value=+!!n,a.uSharpen.value=r,a.uGrain.value=i,a.uSeed.value=this.ctx.shot?1:this.ctx.time.frame%97+1,e.draw(this.mat,null)}dispose(){this.mat.dispose()}},le=class{constructor(){this.u={tSrc:{value:null},uGain:{value:1}},this.mat=F(R,this.u)}render(e,t,n){this.u.tSrc.value=t,e.draw(this.mat,n)}dispose(){this.mat.dispose()}},ue=`
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDepth, vUv).r, 0.0, 0.0, 1.0); }`,de={name:`render`,order:90,async init(e){var t,n,i;let{renderer:a}=e;this.ctx=e,this.blit=new I(a),this.hist=new U(e),this.csm=new O(e),this.ssao=new B(e),this.taa=new G(e,this.hist),this.mb=new q(e,this.hist),this.exposure=new X(e),this.bloom=new ne(e),this.rays=new ae(e),this.composite=new $(e),this.final=new ce(e),this.copy=new le;let s=!!((t=(n=a.extensions).has)!=null&&t.call(n,`EXT_color_buffer_float`));this.worldDepth=P(1,1,{name:`exo.worldDepth`,type:s?x:r,filter:o}),this.mDepthCopy=F(ue,{tDepth:{value:null}}),this.raysTex=null;let c=((i=e.shot)==null||(i=i.preset)==null?void 0:i.params)||{};this.settings={baseExposure:1,fixedExposure:typeof c.renderExposure==`number`?c.renderExposure:null,ev:typeof c.renderEV==`number`?c.renderEV:0,bloomStrength:typeof c.renderBloom==`number`?c.renderBloom:.22,bloomThreshold:1,raysStrength:typeof c.renderGodrays==`number`?c.renderGodrays:1,grain:.02,debug:c.renderDebug||e.params.get(`rdebug`)||null},this.bloom.uP.uThreshold.value=this.settings.bloomThreshold,this.rays.strength=this.settings.raysStrength,this.removeAO=null,this.applyQuality(),this.offs=[e.bus.on(`quality:change`,()=>this.applyQuality()),e.bus.on(`renderer:restored`,()=>{this.taa.reset=!0,this.exposure.first=!0})],e.pipeline.install((e,t)=>this.renderChain(t),`render`),this.publish()},applyQuality(){var e;let t=this.ctx,n=t.quality,r=n.level||`high`,i=r===`high`||r===`ultra`;this.on={ssao:!!n.ssao,bloom:n.bloom!==!1&&r!==`low`,taa:!!n.taa&&((e=t.gpu)==null?void 0:e.webgl2)!==!1,motionBlur:!!n.motionBlur||i,rays:!!n.volumetrics,fxaa:!n.taa},this.csm.configure(),t.scene.traverse(e=>{let t=e.material;if(t)for(let e of Array.isArray(t)?t:[t])e.needsUpdate=!0}),this.on.ssao&&!this.removeAO?this.removeAO=t.pipeline.addPass(`afterWorld`,(e,t)=>this.ssao.render(this.blit,t,e.camera),{order:1,owner:`render`}):!this.on.ssao&&this.removeAO&&(this.removeAO(),this.removeAO=null),this.taa.reset=!0},publish(){let e=this,t=this.ctx,n={setBloom({strength:t,threshold:n,radius:r}={}){typeof t==`number`&&(e.settings.bloomStrength=t),typeof n==`number`&&(e.bloom.uP.uThreshold.value=n),typeof r==`number`&&(e.bloom.uU.uRadius.value=h.clamp(r,0,1.5))},registerSelectiveBloom(t){e.bloom.register(t)},unregisterSelectiveBloom(t){e.bloom.unregister(t)},shadows:{get csm(){return e.csm},get cascades(){return e.csm.count},setLightDirection(t){e.csm.setLightDirection(t)}},get exposure(){return e.settings.baseExposure},setExposure(t){typeof t==`number`&&t>0&&(e.settings.baseExposure=t)},get autoExposure(){return e.exposure.auto},set autoExposure(t){e.exposure.auto=!!t},setGodRays(t){typeof t==`number`&&(e.rays.strength=e.settings.raysStrength=t)},get stats(){return e.stats},readExposure(){let n=new Uint16Array(4);return t.renderer.readRenderTargetPixels(e.exposure.a,0,0,1,1,n),{exposure:y.fromHalfFloat(n[0]),avgLum:y.fromHalfFloat(n[1])}},get _internal(){return e},get passes(){return{...e.on}}};this.api=t.provide(`render`,n)},frame(e,t){var n;this.csm.update();let r=(n=t.services.sky)==null?void 0:n.envMap;r&&!t.scene.environment&&(t.scene.environment=r)},renderChain(e){let t=this.ctx,n=t.pipeline,r=t.camera,i=this.on,a=this.blit,o=this.settings,s=n.hdr;this.hist.update(e);let c=t.renderer.info.render,l=this.stats=this.stats||{},u=e=>{if(l[e]=`${c.calls}/${(c.triangles/1e3).toFixed(0)}k`,this.probeOn){let n=new Uint16Array(4);t.renderer.readRenderTargetPixels(s,s.width>>1,s.height>>2,1,1,n),l[`px_`+e]=[...n].map(e=>+y.fromHalfFloat(e).toFixed(3)).join(`,`)}};u(`start`);let d=i.taa;d&&this.taa.jitter(r,n.width,n.height);try{n.renderWorld(s),u(`w0`),n.runStage(`afterWorld`,s,e)}finally{d&&this.taa.unjitter(r)}let f=s.depthTexture;u(`world`);let p=s;d&&(p=this.taa.render(a,s,f));let m=i.motionBlur?this.mb.strength(e):0;m>.02&&(p=this.mb.render(a,p,f,m,e)),p!==s&&this.copy.render(a,p.texture,s);let h=(o.fixedExposure??o.baseExposure)*2**o.ev;this.exposure.auto=o.fixedExposure==null&&this.exposure.auto!==!1;let g=this.exposure.render(a,s,h,e),_=null;i.rays&&this.rays.prepare()>.01&&(_=this.rays.render(a,s,f,g));let b=t.cockpit,x=b.visible&&b.scene.children.length>b.baseChildren;x&&i.bloom&&this.bloom.selective.size&&(L(this.worldDepth,s.width,s.height),this.mDepthCopy.uniforms.tDepth.value=f,a.draw(this.mDepthCopy,this.worldDepth),f=this.worldDepth.texture),u(`preCockpit`),n.renderCockpit(s),n.runStage(`afterCockpit`,s,e),u(`cockpit`);let S=i.bloom?this.bloom.render(a,s,f,g):null,C=t.services.sky,w=this._rayColor||=new v;if(C!=null&&C.sunColor){let e=C.sunColor;w.setRGB(e.r??e[0]??1,e.g??e[1]??1,e.b??e[2]??1);let t=Math.max(w.r,w.g,w.b,1e-4);w.multiplyScalar(1/t)}else w.setRGB(1,.9,.75);let T=s,E=o.debug,D=this.composite.render(a,T,{bloom:E===`rays`?null:S,bloomStrength:o.bloomStrength,rays:_,rayStrength:1.5*this.rays.intensity*(x?.6:1),rayColor:w,exposure:g});this.final.render(a,D,{fxaa:i.fxaa,sharpen:d?.22:0,grain:o.grain}),u(`end`)},dispose(e){var t,n,r,i,a;for(let e of this.offs||[])e();(t=this.removeAO)==null||t.call(this),e.pipeline.reset(),(n=this.csm)==null||n.dispose();for(let e of[this.ssao,this.taa,this.mb,this.exposure,this.bloom,this.rays,this.composite,this.final,this.copy,this.blit])e==null||(r=e.dispose)==null||r.call(e);(i=this.worldDepth)==null||i.dispose(),(a=this.mDepthCopy)==null||a.dispose()}};export{de as default};
//# sourceMappingURL=render-BQmE8H_5.js.map