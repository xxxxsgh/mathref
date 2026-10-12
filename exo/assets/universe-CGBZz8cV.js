import{$ as e,F as t,G as n,K as r,L as i,M as a,P as o,Q as s,St as c,T as l,U as u,V as d,W as f,X as p,_t as m,at as h,ct as g,d as _,et as v,f as y,g as b,it as x,j as S,n as C,ot as w,p as T,pt as E,st as D,t as O,u as k,ut as A,v as j,vt as M,yt as N}from"./three-EnWzsccR.js";import{a as P,o as F,r as ee,s as te}from"./index-Hc-FT0ur.js";var ne=8e3,I=42e3,L=3600,R=31,z={O:{t:[3e4,42e3],ang:[.85,1.05],L:1e5,R:9,I:1.6,w:.15},B:{t:[1e4,3e4],ang:[.75,.95],L:800,R:4,I:1.4,w:.6},A:{t:[7500,1e4],ang:[.65,.85],L:20,R:1.8,I:1.2,w:1.5},F:{t:[6e3,7500],ang:[.55,.78],L:3,R:1.3,I:1.1,w:3},G:{t:[5200,6e3],ang:[.5,.75],L:1,R:1,I:1,w:4},K:{t:[3700,5200],ang:[.45,.62],L:.3,R:.75,I:.85,w:3},M:{t:[2400,3700],ang:[.36,.52],L:.04,R:.45,I:.65,w:2}},re=Object.keys(z);function ie(e){let t=e/100,n,r,i;t<=66?(n=255,r=99.4708025861*Math.log(t)-161.1195681661,i=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307):(n=329.698727446*(t-60)**-.1332047592,r=288.1221695283*(t-60)**-.0755148492,i=255);let a=e=>{let t=Math.max(0,Math.min(255,e))/255;return t<=.04045?t/12.92:((t+.055)/1.055)**2.4},o=[a(n),a(r),a(i)],s=Math.max(...o)||1;return o.map(e=>e/s)}var ae=`ka.ve.lo.ri.tha.mu.zen.or.is.ae.qu.ny.sol.dra.phe.xi.ul.an.te.mor.sy.el.vor.ise.ran.cae.tor.lu.nah.ost`.split(`.`),oe=[``,``,``,``,` Prime`,` Major`,` Minor`,`-IX`,`-IV`,`-VII`,` Tau`,` Sigma`];function B(e,t=2,n=3,r=!1){let i=e.int(t,n),a=``;for(let t=0;t<i;t++)a+=e.pick(ae);return a=a[0].toUpperCase()+a.slice(1),r&&(a+=e.pick(oe)),a}function se(e){return e=Math.imul(e^e>>>16,2146121005),e=Math.imul(e^e>>>15,2221713035),(e^e>>>16)>>>0}function ce(e,t,n,r){let i=e>>>0;return i=se(i^Math.imul(t|0,668265261)),i=se(i^Math.imul(r|0,374761393)),i=se(i^Math.imul(n|0,2654435761)),i}function le(e,t,n){let r=Math.floor(t),i=Math.floor(n),a=t-r,o=n-i,s=(t,n)=>ce(e^5369127,t,0,n)/4294967296,c=a*a*(3-2*a),l=o*o*(3-2*o),u=s(r,i),d=s(r+1,i),f=s(r,i+1),p=s(r+1,i+1);return u+(d-u)*c+(f-u)*l+(u-d-f+p)*c*l}var ue=2048,de=32,fe=32;function pe(e,t,n,r){return(((e+1024)*ue+(n+1024))*de+(t+16))*fe+r>>>0}function me(e){e>>>=0;let t=e%fe;e=Math.floor(e/fe);let n=e%de-16;e=Math.floor(e/de);let r=e%ue-1024;return{cx:Math.floor(e/ue)-1024,cy:n,cz:r,i:t}}function he(e,t=0){let n=e.derive(`galaxy`,t),r=e.hash(`galaxy`,t,`cells`),i=n.weighted([[2,2],[3,1.2],[4,2]]),a=n.range(15,22)*Math.PI/180,o=Math.tan(a),s=Math.sin(a),c=n.range(0,Math.PI*2),l=2400,u=B(n.derive(`name`),2,3);function d(e,t){if(e<600)return 0;let n=Math.log(Math.max(e,l)/l)/o,a=900+.05*e,u=0;for(let r=0;r<i;r++){let o=t-(c+r*Math.PI*2/i+n);o-=Math.round(o/(Math.PI*2))*Math.PI*2;let l=o*e*s/a,d=Math.exp(-l*l);d>u&&(u=d)}let d=le(r,e/2600+t*3.1,t*2.3+e/9e3);return u*(.55+.9*d)}function f(e,t,n){let r=Math.hypot(e,n),i=Math.atan2(n,e),a=Math.cosh(Math.min(30,t/260)),o=Math.exp(-r/ne)/(a*a),s=d(r,i),c=t*1.7,l=1.3*Math.exp(-(r*r+c*c)/(2*L*L)),u=r>42e3?0:r<42e3*.8?1:1-(r-I*.8)/(I*.2);return(o*(.16+1.05*s)+l)*u}function p(e,t,n){let r=Math.hypot(e,n),i=d(r,Math.atan2(n,e)),a=Math.exp(-(r*r)/(2*(L*1.4)**2));return re.map(e=>{let t=z[e].w;return(e===`O`||e===`B`)&&(t*=.35+2.6*i),e===`A`&&(t*=.7+1*i),(e===`K`||e===`M`)&&(t*=1+2.2*a+.4*(1-i)),(e===`O`||e===`B`||e===`A`)&&(t*=1-.85*a),[e,t]})}let m=new Map;function h(e,t,n){let i=`${e},${t},${n}`,a=m.get(i);if(a)return a;let o=Math.min(R,30*f((e+.5)*40,(t+.5)*40,(n+.5)*40)),s=te(F(ce(r,e,t,n))),c=0;if(o>1e-4){if(o<24){let e=Math.exp(-o),t=s.next();for(;t>e&&c<R;)c++,t*=s.next()}else c=Math.round(s.normal(o,Math.sqrt(o)));c=Math.max(0,Math.min(R,c))}a=[];for(let r=0;r<c;r++)a.push({code:pe(e,t,n,r),i:r,cell:[e,t,n],pos:[(e+.08+.84*s.next())*40,(t+.08+.84*s.next())*40,(n+.08+.84*s.next())*40]});return m.size>6e4&&m.clear(),m.set(i,a),a}let g=0;{let e=n.derive(`home`),t=I*e.range(.5,.56),r=c+e.int(0,i-1)*Math.PI*2/i+Math.log(t/l)/o,a=Math.floor(t*Math.cos(r)/40),s=Math.floor(t*Math.sin(r)/40),u=null;for(let e=0;e<40&&!u;e++)for(let t=-e;t<=e&&!u;t++)for(let n=-e;n<=e&&!u;n++)if(Math.max(Math.abs(t),Math.abs(n))===e)for(let e of[0,-1]){let r=h(a+t,e,s+n);if(r.length>=4){u=r[0];break}}g=u?u.code:pe(a,0,s,0)}let _=e=>(e>>>0^g)>>>0,v=e=>(e>>>0^g)>>>0;function y(e){let t=me(e);return h(t.cx,t.cy,t.cz)[t.i]||null}function b(e){e=Number(e)>>>0;let t=me(_(e)),n=h(t.cx,t.cy,t.cz);if(n.length)return v(n[t.i%n.length].code);for(let e=1;e<8;e++){let r=null,i=1/0;for(let a=-e;a<=e;a++)for(let o=-e;o<=e;o++)for(let e=-1;e<=1;e++){n=h(t.cx+a,t.cy+e,t.cz+o);for(let t of n){let n=a*a+e*e+o*o;n<i&&(i=n,r=t)}}if(r)return v(r.code)}return 0}let x=new Map;function S(n){let r=x.get(n);if(r)return r;let i=y(_(n)),a=i?i.pos:[0,0,0],o=e.derive(`galaxy`,t,`system`,n),s=o.weighted(p(a[0],a[1],a[2]));n===0&&(s=`G`);let c=z[s],l=o.range(c.t[0],c.t[1]),u=e.derive(`galaxy`,t,`system`,n,`binary`),d=n!==0&&u.chance(s===`O`||s===`B`?.45:.22);return r={index:n,id:`g${t}.s${n}`,pos:a,cls:s,temperature:l,color:ie(l),luminosity:c.L,binary:d,name:B(e.derive(`galaxy`,t,`system`,n,`name`),2,3,!0)},x.size>5e4&&x.clear(),x.set(n,r),r}function C(e){let t=y(_(b(e)));return t?t.pos:[0,0,0]}function w(e,t=300,n=4e3){let r=[],i=[Math.floor(e[0]/40),Math.floor(e[1]/40),Math.floor(e[2]/40)],a=Math.ceil(t/40),o=Math.min(a,14),s=t*t;for(let t=-a;t<=a;t++)for(let n=-a;n<=a;n++)if(!((t*t+n*n-2)*40*40>s))for(let a=-o;a<=o;a++){let o=i[1]+a;if(!(o<-16||o>15))for(let a of h(i[0]+t,o,i[2]+n)){let t=a.pos[0]-e[0],n=a.pos[1]-e[1],i=a.pos[2]-e[2],o=t*t+n*n+i*i;o<=s&&r.push({index:v(a.code),pos:a.pos,dist:Math.sqrt(o)})}}return r.sort((e,t)=>e.dist-t.dist),r.length>n&&(r.length=n),r}function T(e,t=1){let n=te(F(ce(r,777,t,3))),i=new Float32Array(e*3),a=new Float32Array(e),o=0,s=0;for(;o<e&&s++<e*40;){let e,t,r,s;if(n.next()<.2)e=n.normal(0,L*.9),r=n.normal(0,L*.9),t=n.normal(0,L*.9/1.7),s=2;else{let i=-8e3*Math.log(Math.max(1e-9,n.next()*n.next()));if(i>42e3)continue;let a=n.range(0,Math.PI*2),o=d(i,a);if(n.next()>(.16+1.05*o)/1.6)continue;let c=Math.min(.999999,Math.max(1e-6,n.next()));t=260/2*Math.log(c/(1-c)),e=i*Math.cos(a),r=i*Math.sin(a),s=o>.55?o>1.05?3:1:0}i[o*3]=e,i[o*3+1]=t,i[o*3+2]=r,a[o]=s,o++}return{pos:i.subarray(0,o*3),kind:a.subarray(0,o),count:o}}let E=null;function D(){if(E!=null)return E;let e=0,t=I*2/96;for(let n=0;n<96;n++)for(let r=0;r<96;r++){let i=-42e3+(n+.5)*t,a=-42e3+(r+.5)*t;for(let t=-8;t<8;t++){let n=(t+.5)*40*2;e+=Math.min(R,30*f(i,n,a))}}return E=Math.round(e*(t/40)**2*2),E}return{index:t,id:`g${t}`,name:u,arms:i,pitch:a,theta0:c,R0:l,RD:ne,HZ:260,RB:L,RMAX:I,CELL:40,gseed:r,homeCode:g,density:f,armAt:d,cell:h,resolve:b,star:S,position:C,systemsNear:w,sampleCloud:T,get systemCount(){return D()},toCode:_,toIndex:v}}function ge(e,t){return Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2])}var V=3e9,_e=5e5;function ve(e,t=1,n=1){let r=e*.025,i=e*.005,a=8e3/r*n,o=1200/i*n;return{radius:e*1.1,rayleigh:[58e-7*a*t,135e-7*a,331e-7*a],rayleighHeight:r,mie:21e-6*o,mieHeight:i,mieG:.76,sunIntensity:12}}var ye={O:.55,B:.4,A:.22,F:.1,G:0,K:-.12,M:-.25},be=[[.82,.74,.62],[.7,.78,.86],[.86,.66,.6],[.62,.66,.58],[.9,.84,.74]];function xe(e,t){return e>.42?t.weighted([[`scorched`,3],[`toxic`,1],[`barren`,1]]):e>.16?t.weighted([[`toxic`,2],[`scorched`,1],[`exotic`,1.2],[`radioactive`,1.2],[`lush`,.6]]):e>-.14?t.weighted([[`lush`,3],[`ocean`,1.6],[`exotic`,1],[`radioactive`,.5],[`toxic`,.5]]):e>-.4?t.weighted([[`frozen`,2],[`barren`,1.5],[`radioactive`,.6],[`lush`,.4]]):t.weighted([[`frozen`,3],[`barren`,2]])}function H(e){let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]}function Se(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function Ce(e,t,n,r=0){let i=t.index,a=t.star(n),o=e.derive(`galaxy`,i,`system`,n);o.next();let s=a.cls,c=z[s];o.next();let l=a.temperature,u=ie(l),d=o.range(c.ang[0],c.ang[1]),f=V*Math.tan(d*Math.PI/180/2)*2,p=o.range(-.25,.25),m=o.range(0,Math.PI*2),h=[Math.cos(p)*Math.cos(m),Math.sin(p),-Math.cos(p)*Math.sin(m)],g=`g${i}.s${n}`,_=[{id:`${g}.star0`,kind:`star`,name:a.name,class:s,spectralClass:s,temperature:l,color:u,intensity:c.I,luminosity:c.L,solarRadii:c.R,radius:f,angularSize:d,position:new P(h[0]*V,h[1]*V,h[2]*V),_sys:[h[0]*V,h[1]*V,h[2]*V]}];if(a.binary){let e=o.derive(`companion`),t=Math.min(6,Object.keys(z).indexOf(s)+e.int(1,3)),n=Object.keys(z)[t],r=z[n],i=e.range(r.t[0],r.t[1]),c=e.range(5,18)*Math.PI/180,l=e.range(0,Math.PI*2),u=H(Se([0,1,0],h)),d=Se(h,u),f=H([0,1,2].map(e=>h[e]*Math.cos(c)+(u[e]*Math.cos(l)+d[e]*Math.sin(l))*Math.sin(c))),p=V*e.range(1.1,1.4),m=e.range(r.ang[0],r.ang[1])*.85;_.push({id:`${g}.star1`,kind:`star`,name:`${a.name} B`,class:n,spectralClass:n,temperature:i,color:ie(i),intensity:r.I*.55,luminosity:r.L,solarRadii:r.R,radius:p*Math.tan(m*Math.PI/180/2)*2,angularSize:m,companion:!0,position:new P(f[0]*p,f[1]*p,f[2]*p),_sys:[f[0]*p,f[1]*p,f[2]*p]})}let v=o.derive(`layout`),y=v.range(-.12,.12),b=H([h[0],0,h[2]]),x=H([Math.sin(y)*-b[2],Math.cos(y),Math.sin(y)*b[0]]),S=H(Se(x,b)),C=(e,t,n=0)=>[0,1,2].map(r=>(b[r]*Math.cos(t)+S[r]*Math.sin(t))*e+x[r]*n),w=n===0,T=w?5:v.weighted([[2,.6],[3,1.4],[4,1.8],[5,1.4],[6,.8]]),E=[],D=0,O=ye[s]??0;for(let t=0;t<T;t++){let r=o.derive(`planet`,t),a,s,c=!1,l;if(t===0)a=r.range(11e4,14e4),s=w?`lush`:xe(O+v.range(-.12,.12),v.derive(`biome0`)),l=[0,0,0];else{D+=t===1?v.range(15e6,24e6):v.range(12e6,24e6);let e=v.range(-Math.PI,Math.PI)*(t===1?.5:1);l=C(D,e,v.range(-1,1)*12e5);let n=O+(l[0]*h[0]+l[1]*h[1]+l[2]*h[2])/8e7*.45+r.range(-.1,.1);c=w&&t===2||!w&&r.chance(n<0?.42:.18),c?(a=r.range(55e4,13e5),s=`gas`):(a=r.range(6e4,2e5),s=xe(n,r.derive(`biome`))),w&&t===1&&(s=`frozen`)}let u=`${g}.p${t}`,d=t===0&&w?B(r.derive(`name`),2,2):B(r.derive(`name`),2,3),f=null;c?f=ve(a,1,.6):s!==`barren`&&(f=ve(a,s===`scorched`?2.5:1));let p=null;if(t!==0){let e=r.derive(`rings`);(c&&e.chance(w?1:.6)||!c&&e.chance(.18))&&(p={inner:a*e.range(1.35,1.65),outer:a*e.range(2.1,2.9),color:e.pick(be),tilt:e.range(-.55,.55),seed:e.range(0,100)},w&&(p.tilt=.32))}let m={id:u,kind:`planet`,index:t,name:d,seed:e.hash(`galaxy`,i,`system`,n,`planet`,t),radius:a,biome:s,type:c?`gas`:`rocky`,landable:!c,gravity:c?24:9.8*Math.sqrt(a/12e4),seaLevel:s===`ocean`||s===`lush`?0:null,atmosphere:f,rings:p,moons:[],field:null,position:new P,_sys:l},_=t===0?r.int(1,2):c?r.int(1,3):r.int(0,2);for(let o=0;o<_;o++){let s=r.derive(`moon`,o),f,p,h;t===0?(f=o===0?s.range(32e3,45e3):s.range(12e3,4e4),p=a*s.range(5,9)+f,h=s.unitVector(),h[1]*=.4):(f=c?s.range(25e3,7e4):s.range(12e3,4e4),p=a*(c?s.range(3.2,6):s.range(5,9))+f,h=s.unitVector(),h[1]*=.4);let g=Math.hypot(h[0],h[1],h[2]),_=h.map(e=>e/g*p),v=s.derive(`kind`).weighted([[`barren`,3],[`frozen`,2],[`scorched`,1],[`toxic`,.4]]);m.moons.push({id:`${u}.m${o}`,kind:`moon`,index:o,parent:u,name:`${d} ${[`I`,`II`,`III`,`IV`][o]}`,seed:e.hash(`galaxy`,i,`system`,n,`planet`,t,`moon`,o),radius:f,biome:v,type:`rocky`,landable:!0,gravity:9.8*Math.sqrt(f/12e4),seaLevel:null,atmosphere:null,rings:null,position:new P,_sys:[l[0]+_[0],l[1]+_[1],l[2]+_[2]]})}let y=r.derive(`field`);(w&&t===0||y.chance(c?.6:.35))&&(m.field={inner:a*(c?2.2:3),outer:a*(c?5:7),density:y.range(.6,1.2),seed:y.u32(),tint:y.pick([[.42,.38,.34],[.3,.36,.4],[.46,.34,.3],[.36,.4,.34]])}),E.push(m)}let k=[],A=[0,0,0];for(let e of E)for(let t=0;t<3;t++)A[t]+=e._sys[t]/E.length;let j=o.derive(`belt`);if(w||j.chance(.62)){let e=Math.max(...E.map(e=>Math.hypot(e._sys[0]-A[0],e._sys[1]-A[1],e._sys[2]-A[2])),2e7)*j.range(.55,.85),t=j.range(25e5,55e5);k.push({id:`${g}.belt0`,kind:`belt`,inner:e-t,outer:e+t,thickness:j.range(5e5,13e5),normal:x.slice(),density:j.range(.7,1.3),seed:j.u32(),tint:j.pick([[.4,.37,.33],[.33,.37,.42],[.44,.35,.3]]),center:new P,_sys:A.slice()})}let M=[],N=o.derive(`station`);if(w||N.chance(.75)){let e=E[0],t=h,n=H([t[0]+N.range(-.6,.6),N.range(-.25,.25),t[2]+N.range(-.6,.6)]),r=e.radius*N.range(1.8,2.1);M.push({id:`${g}.station0`,kind:`station`,name:`Estação ${B(N.derive(`name`),2,2)}`,parent:e.id,radius:900,seed:N.u32(),spin:N.range(.01,.03),position:new P,_sys:n.map(e=>e*r)})}let F={id:g,index:n,galaxy:i,name:a.name,class:s,binary:_.length>1,galacticPosition:a.pos.slice(),stars:_,planets:E,belts:k,anchors:M,ecliptic:{normal:x,e1:b,e2:S},bodies:[],currentPlanetIndex:0};F.bodies=[..._];for(let e of E){F.bodies.push(e);for(let t of e.moons)F.bodies.push(t)}return Te(F,Math.max(0,Math.min(r,E.length-1))),F}function we(e){return[...e.bodies,...e.belts,...e.anchors]}function Te(e,t){let n=e.planets[t]||e.planets[0];if(!n.landable){let t=e.planets[0],r=1/0;for(let i of e.planets){if(!i.landable)continue;let e=Math.hypot(i._sys[0]-n._sys[0],i._sys[1]-n._sys[1],i._sys[2]-n._sys[2]);e<r&&(r=e,t=i)}n=t}let r=n._sys;for(let t of we(e))(t.kind===`belt`?t.center:t.position).set(t._sys[0]-r[0],t._sys[1]-r[1],t._sys[2]-r[2]);return e.currentPlanetIndex=e.planets.indexOf(n),n}function Ee(e,t,n=_e){return Math.hypot(e.x-t.x,e.y-t.y,e.z-t.z)/n}var U=`
vec3 u_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 u_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 u_perm(vec4 x) { return u_mod289(((x * 34.0) + 10.0) * x); }
vec4 u_tis(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = u_mod289(i);
  vec4 p = u_perm(u_perm(u_perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = u_tis(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, -3.1, 2.3);
    a *= 0.5;
  }
  return s / n;
}
float ridged(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0, w = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float r = 1.0 - abs(snoise(p));
    r *= r;
    s += a * r * w;
    w = clamp(r * 1.4, 0.0, 1.0);
    n += a;
    p = p * 2.07 + vec3(-2.3, 1.1, 0.7);
    a *= 0.5;
  }
  return s / n;
}
vec3 u_hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float u_hash1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
/** crateras: x = perfil (bacia negativa, borda positiva), y = id da célula */
vec2 craters(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float best = 8.0; vec3 bid = vec3(0.0); float bs = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 o = vec3(float(i), float(j), float(k));
    vec3 h = u_hash3(ip + o);
    vec3 r = o + h - fp;
    float d = dot(r, r);
    if (d < best) { best = d; bid = ip + o; bs = h.x; }
  }
  float d = sqrt(best) / (0.25 + 0.3 * bs);
  float bowl = smoothstep(1.0, 0.0, d);
  float rim = smoothstep(0.75, 1.0, d) * smoothstep(1.35, 1.0, d);
  float present = step(0.45, u_hash1(bid + 3.1));
  return vec2((rim * 0.6 - bowl * bowl) * present, u_hash1(bid));
}
`,De=3.4,Oe={lush:{c:[[.01,.035,.09],[.03,.14,.2],[.07,.2,.05],[.2,.26,.08],[.55,.5,.42]],cloud:[1,1,1],atm:[.32,.55,1],type:0,sea:.02,clouds:.55},ocean:{c:[[.005,.03,.1],[.02,.16,.26],[.2,.22,.1],[.3,.27,.15],[.7,.7,.68]],cloud:[1,1,1],atm:[.3,.55,1],type:0,sea:.22,clouds:.6},frozen:{c:[[.12,.2,.3],[.32,.45,.55],[.55,.62,.7],[.75,.8,.86],[.92,.95,1]],cloud:[.9,.95,1],atm:[.55,.75,1],type:3,sea:-1,clouds:.35},toxic:{c:[[.06,.08,.02],[.14,.18,.03],[.26,.32,.05],[.45,.46,.1],[.6,.62,.25]],cloud:[.8,.9,.45],atm:[.55,.85,.2],type:0,sea:-.12,clouds:.62},scorched:{c:[[.12,.03,.01],[.3,.08,.02],[.42,.15,.05],[.55,.27,.1],[.62,.45,.3]],cloud:[.9,.75,.6],atm:[1,.55,.25],type:4,sea:-1,clouds:.25},exotic:{c:[[.04,.02,.1],[.1,.25,.3],[.32,.08,.36],[.12,.42,.4],[.75,.55,.8]],cloud:[1,.85,1],atm:[.85,.45,1],type:0,sea:0,clouds:.4},radioactive:{c:[[.06,.06,.02],[.2,.22,.05],[.42,.42,.1],[.55,.36,.08],[.7,.65,.3]],cloud:[.95,.95,.7],atm:[.9,.85,.3],type:0,sea:-.2,clouds:.3},barren:{c:[[.12,.11,.1],[.2,.19,.17],[.3,.28,.25],[.4,.38,.35],[.55,.53,.5]],cloud:[1,1,1],atm:[.6,.6,.6],type:2,sea:-1,clouds:0},gas:{c:[[.55,.38,.24],[.8,.66,.48],[.42,.25,.18],[.9,.84,.7],[.62,.48,.42]],cloud:[1,1,1],atm:[.7,.75,1],type:1,sea:-1,clouds:0}},ke=[[[.55,.38,.24],[.8,.66,.48],[.42,.25,.18],[.9,.84,.7],[.62,.48,.42]],[[.2,.32,.55],[.5,.66,.85],[.12,.2,.42],[.78,.86,.95],[.32,.5,.7]],[[.5,.22,.36],[.85,.55,.62],[.32,.12,.3],[.95,.8,.78],[.62,.32,.5]],[[.3,.45,.2],[.62,.75,.35],[.18,.3,.14],[.85,.9,.6],[.4,.55,.3]],[[.6,.5,.35],[.88,.8,.62],[.4,.36,.3],[.95,.92,.85],[.7,.6,.48]]],Ae=`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
void main() {
  vObjN = normalize(position);
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRad = length(modelMatrix[0].xyz);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`,je=`
uniform vec4 uRing;   // inner, outer (raios do planeta), ativo, opacidade
uniform vec3 uRingN;  // normal do plano dos anéis (mundo)
uniform vec3 uRingCol;
uniform float uRingSeed;
float ringDensity(float r) {
  float t = (r - uRing.x) / max(1e-3, uRing.y - uRing.x);
  if (t < 0.0 || t > 1.0) return 0.0;
  float s = uRingSeed;
  float d = 0.55 + 0.25 * snoise(vec3(r * 9.0, s, 0.5)) + 0.18 * snoise(vec3(r * 31.0, s, 2.1)) + 0.1 * snoise(vec3(r * 97.0, s, 4.7));
  // divisões (lacunas)
  d *= 1.0 - 0.92 * smoothstep(0.035, 0.0, abs(t - 0.62 - 0.05 * sin(s))) ;
  d *= 1.0 - 0.7 * smoothstep(0.02, 0.0, abs(t - 0.86));
  d *= smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
  d *= 0.75 + 0.5 * t;
  d *= 0.72 + 0.28 * snoise(vec3(r * 260.0, s, 7.3)) + 0.12 * snoise(vec3(r * 820.0, s, 1.1));
  return clamp(d, 0.0, 1.0) * uRing.w;
}`,Me=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform int uType;          // 0 rochoso, 1 gasoso, 2 lua/estéril, 3 gelo, 4 lava
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uSea;
uniform float uSeed;
uniform float uCloud;
uniform vec3 uCloudCol;
uniform vec4 uAtm;          // cor + força
uniform vec3 uAxis;         // eixo de rotação (mundo)
uniform float uSpin;
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];    // já multiplicada pela iluminância
uniform float uTime;
uniform float uDetail;      // 0..1 (oitavas extras quando grande na tela)
uniform vec3 uFillDir;      // direção ao planeta atual (luz refletida por ele)
uniform vec3 uFillCol;
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
${U}
${je}

vec3 axisFrame(vec3 n) {
  vec3 ax = normalize(uAxis);
  vec3 t1 = normalize(cross(ax, abs(ax.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(ax, t1);
  vec3 q = vec3(dot(n, t1), dot(n, ax), dot(n, t2));
  float c = cos(uSpin), s = sin(uSpin);
  return vec3(c * q.x - s * q.z, q.y, s * q.x + c * q.z);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 q = axisFrame(normalize(vObjN));
  float lat = q.y;
  vec3 p = q + vec3(uSeed, uSeed * 0.37, -uSeed * 0.61);
  int oct = 4 + int(uDetail * 3.0);
  vec3 albedo;
  float h = 0.0;
  float water = 0.0;
  float cloud = 0.0;
  float emiss = 0.0;
  float rough = 1.0;
  if (uType == 1) {
    // ── gigante gasoso: jatos zonais, turbulência fluindo na longitude ──
    vec3 wq = vec3(q.x * 2.0, lat * 18.0, q.z * 2.0) + vec3(0.0, 0.0, uSeed);
    float t1 = fbm(wq, 3);
    vec3 wq2 = vec3(q.x * 5.0 + t1 * 1.4, lat * 46.0 + t1 * 2.2, q.z * 5.0 - t1);
    float w2 = fbm(wq2, oct);
    float band = lat * 8.5 + t1 * 0.55 + w2 * 0.22;
    float b1 = 0.5 + 0.5 * sin(band * 3.1416);
    float b2 = 0.5 + 0.5 * sin(band * 7.2 + 1.7);
    float b3 = 0.5 + 0.5 * sin(band * 16.0 + 0.4 + w2 * 2.0);
    albedo = mix(uC0, uC1, smoothstep(0.1, 0.9, b1));
    albedo = mix(albedo, uC3, smoothstep(0.5, 0.95, b2) * 0.75);
    albedo = mix(albedo, uC2, smoothstep(0.55, 1.0, b3) * 0.6);
    // faixas finas escuras e claras
    float lane = smoothstep(0.92, 1.0, 0.5 + 0.5 * sin(band * 29.0 + w2 * 4.0));
    albedo = mix(albedo, uC2 * 0.6, lane * 0.55);
    float bright = smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(band * 11.0 - 0.7 + t1 * 3.0));
    albedo = mix(albedo, uC3 * 1.15, bright * 0.5);
    // redemoinhos nas bordas das faixas (cisalhamento)
    float shear = abs(cos(band * 3.1416));
    float eddy = snoise(vec3(q.x * 9.0, lat * 70.0, q.z * 9.0) + w2 * 3.0);
    albedo *= 1.0 + 0.16 * eddy * shear;
    float stk = snoise(vec3(q.x * 12.0 + w2 * 2.0, lat * 150.0, q.z * 12.0));
    albedo *= 0.9 + 0.14 * stk;
    float turb = t1;
    // tempestade oval
    float lon = atan(q.z, q.x);
    float sl = 0.32 * sin(uSeed * 3.7);
    vec2 sd = vec2(mod(lon - uSeed * 1.9 + 3.14159, 6.28318) - 3.14159, (lat - sl) * 3.2);
    float r = length(sd * vec2(1.0, 1.6));
    float ang = atan(sd.y, sd.x) + 6.0 * exp(-r * 5.0);
    float swirl = 0.5 + 0.5 * sin(ang * 3.0 + r * 30.0 + w2 * 3.0);
    float storm = smoothstep(0.32, 0.0, r);
    albedo = mix(albedo, mix(uC4, uC3, swirl), storm * 0.85);
    // polos mais escuros
    albedo *= 1.0 - 0.35 * smoothstep(0.75, 0.98, abs(lat));
    h = w2 * 0.15;
  } else if (uType == 2) {
    // ── lua / mundo estéril: crateras e mares ──
    float base = fbm(p * 2.2, oct);
    vec2 c1 = craters(p * 4.0);
    vec2 c2 = craters(p * 11.0 + 7.0);
    vec2 c3 = craters(p * 29.0 + 3.0);
    float mare = smoothstep(0.05, 0.3, fbm(p * 1.1 + 4.0, 4));
    h = base * 0.5 + c1.x * 0.6 + c2.x * 0.3 + c3.x * 0.15 * uDetail;
    albedo = mix(uC2, uC3, smoothstep(-0.4, 0.5, base));
    albedo = mix(albedo, uC0, mare * 0.65);
    albedo *= 0.85 + 0.3 * c1.y * step(0.0, -c1.x);
    // raios claros das crateras jovens
    albedo = mix(albedo, uC4, smoothstep(0.1, 0.5, c1.x) * 0.5);
  } else {
    // ── rochoso / gelo / lava ──
    vec3 wq = p * 1.3;
    vec3 warp = vec3(fbm(wq + 3.1, 3), fbm(wq - 1.7, 3), fbm(wq + 8.3, 3));
    float cont = fbm(p * 1.05 + warp * 0.55, oct);
    float mtn = ridged(p * 4.0 + warp, oct - 1);
    h = cont + mtn * 0.22 * smoothstep(uSea, uSea + 0.15, cont);
    float land = uSea < -0.9 ? 1.0 : smoothstep(uSea, uSea + 0.012, cont);
    water = 1.0 - land;
    vec3 sea = mix(uC0, uC1, smoothstep(uSea - 0.28, uSea, cont));
    float hl = smoothstep(uSea, uSea + 0.4, h);
    float dry = smoothstep(0.1, 0.55, fbm(p * 2.6 - warp, 4)) * (1.0 - smoothstep(0.55, 0.8, abs(lat)));
    vec3 ground = mix(uC2, uC3, clamp(hl * 1.2 + dry * 0.5, 0.0, 1.0));
    ground = mix(ground, uC4, smoothstep(0.55, 0.85, mtn * hl * 1.3));
    if (uType == 3) {
      float crack = smoothstep(0.92, 0.99, ridged(p * 9.0 + warp * 2.0, 3));
      ground = mix(ground, uC0, crack * 0.8);
    }
    if (uType == 4) {
      float crack = smoothstep(0.88, 0.99, ridged(p * 7.0 + warp * 2.0, 4));
      emiss = crack * (1.0 - hl);
      ground = mix(ground, uC0, crack * 0.6);
    }
    // calotas polares
    float cap = smoothstep(0.78, 0.86, abs(lat) + 0.12 * fbm(p * 5.0, 3));
    ground = mix(ground, vec3(0.85, 0.9, 0.95), cap * (uType == 4 ? 0.0 : 1.0));
    sea = mix(sea, vec3(0.75, 0.82, 0.9), cap);
    water *= 1.0 - cap;
    albedo = mix(ground, sea, water);
    rough = mix(1.0, 0.15, water);
    // nuvens: duas camadas deformadas, ciclones
    if (uCloud > 0.0) {
      vec3 cq = q * 2.3 + vec3(uSeed * 1.3, 0.0, uTime * 0.004);
      vec3 cw = vec3(fbm(cq * 1.4, 3), fbm(cq * 1.4 + 5.2, 3), 0.0);
      float cl = fbm(cq + cw * 0.9 + vec3(0.0, lat * 2.0, 0.0), oct);
      float cl2 = fbm(vec3(q.x * 4.0, lat * 18.0, q.z * 4.0) + cw * 2.0 + uSeed, 3);
      cl = cl * 0.75 + cl2 * 0.25;
      cloud = smoothstep(0.42 - uCloud * 0.55, 0.62 - uCloud * 0.35, cl * 0.5 + 0.5);
      cloud *= 1.0 - 0.5 * smoothstep(0.85, 0.98, abs(lat));
    }
  }

  // relevo por derivadas de tela (bump)
  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  float R = vRad;
  float bumpK = (uType == 1 ? 0.004 : 0.03) * R * (1.0 - water) * (1.0 - cloud * 0.8);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  vec3 Nb = normalize(abs(det) * N - grad * bumpK);

  vec3 center = vCenter;
  vec3 col = vec3(0.0);
  float NV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NV, 2.6);
  for (int i = 0; i < 2; i++) {
    vec3 L = uSunDir[i];
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    float NL = dot(N, L);
    float NLb = dot(Nb, L);
    float term = smoothstep(-0.06, 0.18, NL);
    float diff = max(0.0, NLb * 0.85 + 0.15 * NL) * term;
    // sombra dos anéis sobre o planeta
    float rs = 1.0;
    if (uRing.z > 0.5) {
      float dn = dot(L, uRingN);
      if (abs(dn) > 1e-3) {
        float tt = dot(center - vWorldPos, uRingN) / dn;
        if (tt > 0.0) {
          float rr = length(vWorldPos + L * tt - center) / R;
          rs = 1.0 - 0.85 * ringDensity(rr);
        }
      }
    }
    vec3 surf = albedo * diff * rs;
    // reflexo especular do oceano
    vec3 H = normalize(L + V);
    float sp = pow(max(dot(N, H), 0.0), 160.0) * 3.0 + pow(max(dot(N, H), 0.0), 18.0) * 0.08;
    surf += water * sp * term * rs * (1.0 - cloud) * vec3(1.0, 0.95, 0.85);
    // nuvens (com sombra própria suave)
    vec3 cl = uCloudCol * max(0.0, NL * 0.9 + 0.1) * term * rs;
    surf = mix(surf * (1.0 - 0.35 * cloud), cl, cloud);
    // atmosfera sobre o disco: névoa na borda iluminada + avermelhado no terminador
    float lit = smoothstep(-0.25, 0.45, NL);
    vec3 atm = uAtm.rgb * uAtm.a;
    vec3 haze = atm * (fres * 1.6 + 0.08) * lit;
    vec3 warm = vec3(1.0, 0.45, 0.2) * smoothstep(0.25, 0.0, abs(NL - 0.02)) * fres * 0.6 * uAtm.a;
    surf = mix(surf, haze * 0.8, clamp(fres * uAtm.a * 0.9, 0.0, 0.9)) + haze * 0.35 + warm;
    if (uType == 1) surf *= 0.55 + 0.45 * pow(NV, 0.35);
    col += surf * E / 3.14159;
  }
  // luz refletida pelo planeta atual no lado noturno (planetshine)
  col += albedo * uFillCol * max(0.0, dot(N, uFillDir)) / 3.14159;
  // brilho noturno (lava) e ambiente estelar mínimo
  col += emiss * vec3(1.0, 0.32, 0.06) * 0.6;
  col += albedo * 0.0025;
  gl_FragColor = vec4(col, 1.0);
}`,Ne=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec4 uAtm;
uniform float uThick;
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main() {
  #include <logdepthbuf_fragment>
  vec3 c = vCenter;
  float Rs = vRad;
  float R = Rs / (1.0 + uThick);
  vec3 dir = normalize(vWorldPos - cameraPosition);
  float tc = dot(c - cameraPosition, dir);
  vec3 closest = cameraPosition + dir * tc;
  float b = length(closest - c);
  float hgt = (b - R) / (R * uThick);
  float g = hgt >= 0.0 ? exp(-hgt * 3.2) * smoothstep(1.0, 0.75, hgt) : exp(hgt * 40.0) * 0.6;
  vec3 sn = normalize(closest - c);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    vec3 L = uSunDir[i];
    float lit = smoothstep(-0.38, 0.32, dot(sn, L));
    float mu = dot(dir, L);
    float ph = 0.6 + 6.0 * hg(mu, 0.72);
    col += uAtm.rgb * E * lit * ph * g;
  }
  gl_FragColor = vec4(col * uAtm.a * 0.55, 1.0);
}`,Pe=`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vWorldPos;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`,Fe=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
uniform vec3 uCenter;
uniform float uR;
varying vec3 vLocal;
varying vec3 vWorldPos;
${U}
${je}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vLocal.xy);
  float a = ringDensity(r);
  if (a < 0.003) discard;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float tone = 0.8 + 0.35 * snoise(vec3(r * 55.0, uRingSeed, 9.0)) + 0.15 * snoise(vec3(r * 170.0, uRingSeed, 3.0));
  vec3 base = uRingCol * tone;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    vec3 L = uSunDir[i];
    float sL = dot(L, uRingN);
    float sV = dot(V, uRingN);
    // sombra do planeta: raio do fragmento até o sol cruza a esfera?
    vec3 oc = vWorldPos - uCenter;
    float bq = dot(oc, L);
    float cq = dot(oc, oc) - uR * uR;
    float disc = bq * bq - cq;
    float shadow = (disc > 0.0 && -bq - sqrt(disc) > 0.0) ? 0.04 : 1.0;
    float lit = sL * sV > 0.0 ? (0.35 + 0.65 * abs(sL)) : (1.0 - a) * 1.6 * (0.3 + 3.0 * hg(dot(-V, L), 0.6));
    col += base * E * lit * shadow / 3.14159;
  }
  gl_FragColor = vec4(col * a, a);
}`;function W(e){return new M(e[0],e[1],e[2])}var Ie=class{constructor(e){this.ctx=e,this.root=new S,this.root.name=`universe:bodies`,e.scene.add(this.root),this.geoHi=new A(1,160,96),this.geoLo=new A(1,56,36),this.items=[],this.sunDir=[new M(1,0,0),new M(1,0,0)],this.sunCol=[new M,new M],this.visible=!0}clear(){for(let e of this.items)e.handle.remove(),this.root.remove(e.mesh),e.mesh.traverse(e=>{var t,n;(t=e.material)==null||(n=t.dispose)==null||n.call(t),e.geometry&&e.geometry!==this.geoHi&&e.geometry!==this.geoLo&&e.geometry.dispose()});this.items=[]}build(e){this.clear();let t=e.planets[e.currentPlanetIndex];for(let n of e.planets){n!==t&&this.add(n);for(let e of n.moons)this.add(e)}this.current=t}add(e){let t=Oe[e.biome]||Oe.barren,r=Le(e.seed??7),i=(e,t=.12)=>e.map(e=>Math.max(.004,e*(1+(r()-.5)*2*t))),a=t.c.map(e=>i(e));e.biome===`gas`&&(a=ke[Math.floor(r()*ke.length)].map(e=>i(e,.08)));let o=t.type;e.kind===`moon`&&e.biome!==`frozen`&&(o=2);let s=e.rings?e.rings.tilt:(r()-.5)*.6,c=new M(0,Math.cos(s),Math.sin(s)),l=this.sunDir,u=this.sunCol,d={uRing:{value:new N(0,0,0,0)},uRingN:{value:c.clone()},uRingCol:{value:new M(.8,.7,.6)},uRingSeed:{value:0}};e.rings&&(d.uRing.value.set(e.rings.inner/e.radius,e.rings.outer/e.radius,1,.92),d.uRingCol.value.fromArray(e.rings.color),d.uRingSeed.value=e.rings.seed??1);let f=e.atmosphere?[...i(t.atm,.1),e.biome===`gas`?.55:1]:[0,0,0,0],p=new g({vertexShader:Ae,fragmentShader:Me,uniforms:{uType:{value:o},uC0:{value:W(a[0])},uC1:{value:W(a[1])},uC2:{value:W(a[2])},uC3:{value:W(a[3])},uC4:{value:W(a[4])},uSea:{value:t.sea+(r()-.5)*.12},uSeed:{value:r()*50},uCloud:{value:e.atmosphere?t.clouds*(.7+.6*r()):0},uCloudCol:{value:W(t.cloud)},uAtm:{value:new N(...f)},uAxis:{value:c},uSpin:{value:r()*6.28},uSunDir:{value:l},uSunCol:{value:u},uTime:{value:0},uDetail:{value:.5},uFillDir:{value:new M(0,1,0)},uFillCol:{value:new M},...d}});p.extensions={derivatives:!0};let m=new n(this.geoLo,p);m.name=`body:${e.id}`,m.scale.setScalar(e.radius),m.frustumCulled=!1;let _=null;if(e.atmosphere){let t=e.biome===`gas`?.035:.06;_=new n(this.geoLo,new g({vertexShader:Ae,fragmentShader:Ne,uniforms:{uAtm:p.uniforms.uAtm,uThick:{value:t},uSunDir:{value:l},uSunCol:{value:u}},blending:2,transparent:!0,depthWrite:!1})),_.scale.setScalar(1+t),_.renderOrder=2,_.frustumCulled=!1,m.add(_)}let v=null;if(e.rings){let t=new h(e.rings.inner/e.radius,e.rings.outer/e.radius,256,1),r=new M;v=new n(t,new g({vertexShader:Pe,fragmentShader:Fe,uniforms:{...d,uSunDir:{value:l},uSunCol:{value:u},uCenter:{value:r},uR:{value:1}},transparent:!0,depthWrite:!1,side:2,blending:5,blendSrc:201,blendDst:205})),v.rotation.x=s-Math.PI/2,v.renderOrder=3,v.frustumCulled=!1,m.add(v)}this.root.add(m);let y=this.ctx.space.registerFloating(m,e.position.clone(),{compress:!0});this.items.push({body:e,mesh:m,mat:p,halo:_,ring:v,handle:y})}syncPositions(){for(let e of this.items)e.handle.worldPos.copy(e.body.position)}frame(e,t,n,r){let i=e.services.sky,a=(i==null?void 0:i.suns)||[];for(let e=0;e<2;e++){var o;let t=n[e],r=((o=a[e])==null?void 0:o.direction)||(e===0?i==null?void 0:i.sunDirection:null);if(t&&r){this.sunDir[e].copy(r).normalize();let n=De*(t.intensity??1);this.sunCol[e].set(t.color[0]*n,t.color[1]*n,t.color[2]*n)}else this.sunCol[e].set(0,0,0)}if(this.root.visible=r,!r)return;let s=(e.pipeline.height||720)/(e.camera.fov*Math.PI/180),c=e.time.world,l=t.planets[t.currentPlanetIndex],u=l?{x:l.position.x,y:l.position.y,z:l.position.z,r:l.radius}:null;for(let e of this.items){let t=e.mesh,n=t.position.length(),r=Math.asin(Math.min(1,t.scale.x/Math.max(n,.001)))*s,i=r>90?this.geoHi:this.geoLo;if(t.geometry!==i&&(t.geometry=i,e.halo&&(e.halo.geometry=i)),t.visible=r>.4,e.mat.uniforms.uDetail.value=Math.min(1,Math.max(0,(r-40)/300)),u){let t=e.mat.uniforms.uFillDir.value;t.set(u.x-e.body.position.x,u.y-e.body.position.y,u.z-e.body.position.z);let n=t.length();t.divideScalar(n||1);let r=u.r/Math.max(n,u.r),i=.35*(.5+.5*-t.dot(this.sunDir[0]))*r*r*4;e.mat.uniforms.uFillCol.value.copy(this.sunCol[0]).multiplyScalar(i)}e.mat.uniforms.uTime.value=c,e.ring&&(e.ring.material.uniforms.uCenter.value.copy(t.position),e.ring.material.uniforms.uR.value=t.scale.x)}}dispose(){this.clear(),this.geoHi.dispose(),this.geoLo.dispose(),this.ctx.scene.remove(this.root)}};function Le(e){return e>>>=0,()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}var G={uSunDir:{value:[new M(1,0,0),new M(1,0,0)]},uSunCol:{value:[new M,new M]},uAmb:{value:new M(.012,.015,.022)}},Re=`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 color;
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vLocal;
varying vec2 vUv2;
varying float vScale;
void main() {
  mat4 m = modelMatrix;
  vec3 col = vec3(1.0);
  #ifdef USE_VCOLOR
  col = color;
  #endif
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  #ifdef USE_INSTANCING_COLOR
  col *= instanceColor;
  #endif
  vCol = col;
  vLocal = position;
  vUv2 = uv;
  vScale = length(m[0].xyz);
  vec4 wp = m * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`,ze=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
uniform vec3 uAmb;
uniform vec3 uColor;
uniform float uRough;
uniform float uMetal;
uniform float uBump;
uniform vec3 uEmis;
#ifdef USE_MAP
uniform sampler2D uMap;
uniform vec2 uMapRepeat;
#endif
#ifdef USE_EMISMAP
uniform sampler2D uEmisMap;
uniform vec2 uEmisRepeat;
#endif
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vLocal;
varying vec2 vUv2;
varying float vScale;
${U}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  if (dot(N, V) < 0.0 && !gl_FrontFacing) N = -N;
  vec3 albedo = uColor * vCol;
  #ifdef USE_MAP
  albedo *= texture2D(uMap, vUv2 * uMapRepeat).rgb;
  #endif
  #ifdef USE_ROCK
  {
    vec3 rp = vLocal * 5.0;
    float m1 = snoise(vLocal * 1.7 + 11.0);
    float m2 = snoise(vLocal * 11.0 - 3.0);
    float strata = 0.5 + 0.5 * sin(dot(vLocal, vec3(7.0, 13.0, 3.0)) + m1 * 4.0);
    albedo *= 0.84 + 0.18 * m1 + 0.08 * m2 + 0.08 * strata;
    // relevo fino por derivadas de tela (amplitude em fração do tamanho)
    float bh = snoise(rp) * 0.5 + abs(snoise(rp * 2.9)) * 0.3 + snoise(rp * 8.3) * 0.08;
    vec3 dpx = dFdx(vWorldPos), dpy = dFdy(vWorldPos);
    float hx = dFdx(bh), hy = dFdy(bh);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 gr = sign(det) * (hx * r1 + hy * r2);
    N = normalize(abs(det) * N - gr * vScale * uBump);
  }
  #endif
  float rough = uRough;
  float mineral = 0.0;
  #ifdef USE_ROCK
  // veios minerais: mais lisos e brilhantes (reflexo cristalino)
  mineral = smoothstep(0.55, 0.85, snoise(vLocal * 4.3 + 21.0)) * smoothstep(-0.2, 0.4, snoise(vLocal * 1.3 - 5.0));
  rough = mix(rough, 0.32, mineral);
  albedo = mix(albedo, albedo * vec3(0.8, 1.05, 1.2) + 0.03, mineral * 0.6);
  #endif
  float a = rough * rough;
  float shin = 2.0 / max(1e-3, a * a) - 2.0;
  vec3 F0 = mix(vec3(0.04 + 0.06 * mineral), albedo, uMetal);
  vec3 diffC = albedo * (1.0 - uMetal);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-8) continue;
    vec3 L = uSunDir[i];
    float NL = dot(N, L);
    float diff = max(0.0, NL * 0.92 + 0.08) * smoothstep(-0.08, 0.1, NL);
    vec3 H = normalize(L + V);
    float NH = max(dot(N, H), 0.0);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float spec = (shin + 8.0) / 25.13 * pow(NH, shin) * max(NL, 0.0);
    col += (diffC / 3.14159 * diff + F * spec * 0.25) * E;
  }
  // ambiente: céu estelar + leve "luz de preenchimento" de baixo
  float hemi = 0.65 + 0.35 * N.y;
  col += diffC * uAmb * hemi;
  // borda (atmosfera/poeira iluminada) para separar do fundo
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += albedo * uAmb * rim * 3.0;
  vec3 em = uEmis;
  #ifdef USE_EMISMAP
  em *= texture2D(uEmisMap, vUv2 * uEmisRepeat).rgb;
  #endif
  col += em;
  gl_FragColor = vec4(col, 1.0);
}`;function Be(e={}){let t={};e.vertexColors&&(t.USE_VCOLOR=``),e.rock&&(t.USE_ROCK=``),e.map&&(t.USE_MAP=``),e.emissiveMap&&(t.USE_EMISMAP=``);let n=new b(e.color??16777215),r=new b(e.emissive??0);return new g({vertexShader:Re,fragmentShader:ze,defines:t,uniforms:{...G,uColor:{value:new M(n.r,n.g,n.b)},uRough:{value:e.rough??.85},uMetal:{value:e.metal??0},uBump:{value:e.bump??.09},uEmis:{value:new M(r.r,r.g,r.b).multiplyScalar(e.emissiveIntensity??1)},uMap:{value:e.map||null},uMapRepeat:{value:new m(...e.mapRepeat||[1,1])},uEmisMap:{value:e.emissiveMap||null},uEmisRepeat:{value:new m(...e.emissiveRepeat||[1,1])}},side:e.side??0})}var Ve=new M;function He(e,t,n=1){var r;let i=e.services.sky,a=(i==null?void 0:i.suns)||[];for(let e=0;e<2;e++){var o;let n=t[e],r=((o=a[e])==null?void 0:o.direction)||(e===0?i==null?void 0:i.sunDirection:null);if(n&&r){G.uSunDir.value[e].copy(r).normalize();let t=3.4*(n.intensity??1);G.uSunCol.value[e].set(n.color[0]*t,n.color[1]*t,n.color[2]*t)}else G.uSunCol.value[e].set(0,0,0)}let s=((r=t[0])==null?void 0:r.color)||[1,1,1];Ve.set(.5+.5*s[0],.55+.5*s[1],.75+.5*s[2]).multiplyScalar(.016*n),G.uAmb.value.copy(Ve)}var K=1e3,Ue=5200,We=1800,Ge=5,Ke=45,q=[{detail:14,max:120},{detail:4,max:700},{detail:1,max:2600}],qe=4;function J(e,t,n,r){let i=(r^Math.imul(e,668265261)^Math.imul(t,374761393)^Math.imul(n,2654435761))>>>0;return i=Math.imul(i^i>>>15,739982445),i=Math.imul(i^i>>>12,695872825),((i^i>>>15)>>>0)/4294967296}function Je(e,t,n,r){let i=Math.floor(e),a=Math.floor(t),o=Math.floor(n),s=e-i,c=t-a,l=n-o,u=s*s*(3-2*s),d=c*c*(3-2*c),f=l*l*(3-2*l),p=(e,t,n)=>e+(t-e)*n;return p(p(p(J(i,a,o,r),J(i+1,a,o,r),u),p(J(i,a+1,o,r),J(i+1,a+1,o,r),u),d),p(p(J(i,a,o+1,r),J(i+1,a,o+1,r),u),p(J(i,a+1,o+1,r),J(i+1,a+1,o+1,r),u),d),f)*2-1}function Y(e,t,n,r,i=4){let a=.5,o=1,s=0,c=0;for(let l=0;l<i;l++)s+=a*Je(e*o,t*o,n*o,r+l*101),c+=a,a*=.5,o*=2.03;return s/c}function X(e){return e>>>=0,()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}function Ye(e){let t=9e3+e*7919,n=X(t),r=[];for(let e=0;e<7;e++){let e=n()*2-1,t=n()*Math.PI*2,i=Math.sqrt(1-e*e);r.push([i*Math.cos(t),e,i*Math.sin(t),.18+n()*.35,.08+n()*.1])}let i=.9+n()*.8,a=.08+n()*.1;return(e,n,o)=>{let s=1+.3*Y(e*i,n*i,o*i,t,3)+.08*Y(e*4.1,n*4.1,o*4.1,t+7,3),c=1-Math.abs(Je(e*2.6,n*2.6,o*2.6,t+11));s+=a*c*c*c;let l=Math.floor(s*9)/9;s=s*.7+l*.3,s+=.04*Math.abs(Je(e*9,n*9,o*9,t+3));for(let t of r){let r=Math.acos(Math.max(-1,Math.min(1,e*t[0]+n*t[1]+o*t[2])))/t[3];r<1.35&&(s+=r<1?-t[4]*(1-r*r):t[4]*.4*Math.sin((r-1)/.35*Math.PI))}return s}}function Xe(e,t){let n=new o(1,t);n.deleteAttribute(`normal`),n.deleteAttribute(`uv`),n=C(n,1e-5);let r=X(31+e*17),i=.75+r()*.5,a=.55+r()*.35,s=.8+r()*.4,c=Ye(e),l=n.attributes.position,u=new Float32Array(l.count*3);for(let t=0;t<l.count;t++){let n=l.getX(t),r=l.getY(t),o=l.getZ(t),d=Math.hypot(n,r,o);n/=d,r/=d,o/=d;let f=c(n,r,o);l.setXYZ(t,n*f*i,r*f*a,o*f*s);let p=Math.max(0,Math.min(1,(f-.82)/.4)),m=Math.max(0,Y(n*6,r*6,o*6,77+e,2)),h=.55+.45*p;u[t*3]=h*(.95+.25*m),u[t*3+1]=h*(.95+.2*m),u[t*3+2]=h*(.95+.1*m)}return n.setAttribute(`color`,new _(u,3)),n.computeVertexNormals(),n.computeBoundingSphere(),n}function Ze(){return Be({rock:!0,vertexColors:!0,rough:.78,metal:.02,bump:.022})}var Qe=`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute float aShade;
uniform float uPx;      // pixels por radiano
uniform float uFade;
varying float vA;
varying float vShade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float px = aSize / d * uPx;
  gl_PointSize = clamp(px, 1.0, 3.0);
  vA = clamp(px, 0.02, 1.0) * uFade * smoothstep(2000.0, 30000.0, d);
  vShade = aShade;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,$e=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
varying float vA;
varying float vShade;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(c)) * vA;
  gl_FragColor = vec4(uColor * vShade * a, 0.0);
}`,et=class{constructor(e){this.ctx=e,this.root=new S,this.root.name=`universe:asteroids`,e.scene.add(this.root),this.anchor=new P,this.anchorHandle=e.space.registerFloating(this.root,this.anchor),this.material=Ze(),this.meshes=[];for(let e=0;e<q.length;e++){let n=[];for(let r=0;r<qe;r++){let a=new i(Xe(r,q[e].detail),this.material,q[e].max);a.instanceColor=new t(new Float32Array(q[e].max*3),3),a.count=0,a.frustumCulled=!1,a.name=`asteroids:l${e}v${r}`,this.root.add(a),n.push(a)}this.meshes.push(n)}this.fields=[],this.dust=[],this.lastKey=``,this.count=0,this._m=new f,this._q=new v,this._s=new M,this._p=new M,this._c=new b}setSystem(e){this.fields=[];for(let t of e.planets)t.field&&this.fields.push({kind:`halo`,center:t.position,inner:t.field.inner,outer:t.field.outer,density:t.field.density,seed:t.field.seed,tint:t.field.tint,radius:t.radius});for(let t of e.belts)this.fields.push({kind:`belt`,center:t.center,normal:new M().fromArray(t.normal),inner:t.inner,outer:t.outer,thickness:t.thickness,density:t.density,seed:t.seed,tint:t.tint});this.buildDust(),this.lastKey=``}densityAt(e,t,n){let r=0,i=null;for(let a of this.fields){let o=e-a.center.x,s=t-a.center.y,c=n-a.center.z,l=0;if(a.kind===`halo`){let e=Math.hypot(o,s,c);if(e<a.inner*.95||e>a.outer*1.05)continue;let t=(e-a.inner)/(a.outer-a.inner);l=Math.sin(Math.PI*Math.min(1,Math.max(0,t)))**.6;let n=1/6e4,r=Y(o*n,s*n,c*n,a.seed,3);l*=Math.min(1.6,Math.max(.08,.6+r*1.5))*a.density,l*=Math.max(.15,.6+1.1*Y(o/7e3,s/7e3,c/7e3,a.seed+5,2)),l*=.45+.55*Math.exp(-((s/e)**2)/.18)}else{let e=a.normal,t=o*e.x+s*e.y+c*e.z,n=o-e.x*t,r=s-e.y*t,i=c-e.z*t,u=Math.hypot(n,r,i);if(u<a.inner||u>a.outer||Math.abs(t)>a.thickness*2.5)continue;let d=(u-a.inner)/(a.outer-a.inner);l=Math.sin(Math.PI*d)*Math.exp(-((t/a.thickness)**2));let f=1/9e4,p=Y(n*f,r*f,i*f,a.seed,3);l*=Math.min(1.6,Math.max(.08,.6+p*1.4))*a.density,l*=Math.max(.15,.6+1.1*Y(n/7e3,r/7e3,i/7e3,a.seed+5,2))}l>r&&(r=l,i=a)}return{d:r,field:i}}buildDust(){for(let e of this.dust)e.handle.remove(),this.ctx.scene.remove(e.points),e.points.geometry.dispose(),e.points.material.dispose();this.dust=[];for(let t of this.fields){let n=t.kind===`belt`?6e4:16e3,r=new Float32Array(n*3),i=new Float32Array(n),a=new Float32Array(n),o=X(t.seed^2748),s,c,l;t.kind===`belt`&&(l=t.normal,s=new M(1,0,0).cross(l),s.lengthSq()<1e-6&&s.set(0,0,1).cross(l),s.normalize(),c=new M().crossVectors(l,s));for(let e=0;e<n;e++){let n,u,d;if(t.kind===`belt`){let e=o()*Math.PI*2,r=t.inner+(t.outer-t.inner)*(.5+.5*Math.sin((o()-.5)*Math.PI)),i=(o()+o()+o()-1.5)*t.thickness*1.1;n=(s.x*Math.cos(e)+c.x*Math.sin(e))*r+l.x*i,u=(s.y*Math.cos(e)+c.y*Math.sin(e))*r+l.y*i,d=(s.z*Math.cos(e)+c.z*Math.sin(e))*r+l.z*i}else{let e=o()*2-1,r=o()*Math.PI*2,i=Math.sqrt(1-e*e),a=t.inner+(t.outer-t.inner)*(.5+.5*Math.sin((o()-.5)*Math.PI));n=i*Math.cos(r)*a,u=e*.35*a,d=i*Math.sin(r)*a}r[e*3]=n,r[e*3+1]=u,r[e*3+2]=d,i[e]=300+2500*o()**3,a[e]=.5+o()}let u=new y;u.setAttribute(`position`,new _(r,3)),u.setAttribute(`aSize`,new _(i,1)),u.setAttribute(`aShade`,new _(a,1));let d=new e(u,new g({vertexShader:Qe,fragmentShader:$e,uniforms:{uColor:{value:new M(...t.tint).multiplyScalar(2.2)},uPx:{value:800},uFade:{value:1}},transparent:!0,depthWrite:!1,blending:2}));d.frustumCulled=!1,d.name=`asteroids:dust:${t.kind}`,d.renderOrder=1,this.ctx.scene.add(d);let f=this.ctx.space.registerFloating(d,t.center.clone());this.dust.push({points:d,handle:f,field:t})}}syncPositions(){for(let e of this.dust)e.handle.worldPos.copy(e.field.center);this.lastKey=``}rebuild(e){let t=Math.floor(e.x/K),n=Math.floor(e.y/K),r=Math.floor(e.z/K),i=`${t},${n},${r}`;if(i===this.lastKey)return!1;this.lastKey=i,this.anchor.set((t+.5)*K,(n+.5)*K,(r+.5)*K);let a=this.meshes.map(e=>e.map(()=>0)),o=Math.ceil(Ue/K),s=this._m,c=this._q,l=this._s,u=this._p,d=this._c,f=0,p=(K/1e3)**3,m=(e,t,n,r,i,o,p,m)=>{let h=o/Math.max(p,1),g=h>.035?0:h>.007?1:2,_=Math.floor(e()*qe),v=g;for(;v<q.length&&a[v][_]>=q[v].max;)v++;if(v>=q.length)return;let y=a[v][_]++,b=e()*2-1,x=e()*Math.PI*2,S=e()*Math.PI*2,C=Math.sqrt(1-b*b);u.set(C*Math.cos(x),b,C*Math.sin(x)),c.setFromAxisAngle(u,S),l.setScalar(o),u.set(n-this.anchor.x,r-this.anchor.y,i-this.anchor.z),s.compose(u,c,l);let w=this.meshes[v][_];w.setMatrixAt(y,s);let T=t.tint,E=(.6+.6*e())*m,D=e();D<.16?d.setRGB(.16*E,.3*E,.34*E):D<.26?d.setRGB(.36*E,.19*E,.11*E):D<.4?d.setRGB(.11*E,.11*E,.12*E):d.setRGB(T[0]*E*.7,T[1]*E*.7,T[2]*E*.7),w.setColorAt(y,d),f++};for(let i=-6;i<=o;i++)for(let a=-6;a<=o;a++)for(let s=-6;s<=o;s++){let o=t+i,c=n+a,l=r+s,u=(o+.5)*K,d=(c+.5)*K,f=(l+.5)*K,h=Math.hypot(u-e.x,d-e.y,f-e.z);if(h>6200)continue;let{d:g,field:_}=this.densityAt(u,d,f);if(g<=.01)continue;let v=X(J(o,c,l,_.seed)*4294967296),y=h<2800,b=g*Ge*p,x=y?g*Ke*p:0;for(let[t,n]of[[b,!1],[x,!0]]){if(t<=0)continue;let r=0,i=Math.exp(-Math.min(t,60)),a=v();for(;a>i&&r<90;)r++,a*=v();for(let t=0;t<r;t++){let t=u+(v()-.5)*K,r=d+(v()-.5)*K,i=f+(v()-.5)*K,a=Math.hypot(t-e.x,r-e.y,i-e.z),o=n?We:Ue;if(a>o)continue;let s=n?3*7**v():25*7**v();!n&&v()<.015&&(s=300+1e3*v()),s*=Math.min(1,(o-a)/(o*.2)),!(s<1)&&(a<s*2.5+120||m(v,_,t,r,i,s,a,n?.9:1))}}}for(let e=0;e<q.length;e++)for(let t=0;t<qe;t++){let n=this.meshes[e][t];n.count=a[e][t],n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0),n.visible=n.count>0}return this.count=f,!0}frame(e,t){var n,r;let i=e.player.cameraWorld,a=(((n=e.player.velocity)==null||(r=n.length)==null?void 0:r.call(n))??0)>4e3;this.root.visible=t&&!a,t&&!a&&this.rebuild(i);let o=(e.pipeline.height||720)/(e.camera.fov*Math.PI/180);for(let e of this.dust)e.points.visible=t,e.points.material.uniforms.uPx.value=o}dispose(){this.anchorHandle.remove();for(let e of this.meshes)for(let t of e)t.geometry.dispose();this.material.dispose(),this.fields=[],this.buildDust(),this.ctx.scene.remove(this.root)}};function tt(e){let t=Le(e),n=document.createElement(`canvas`);n.width=n.height=512;let r=n.getContext(`2d`);r.fillStyle=`#8d9096`,r.fillRect(0,0,512,512);for(let e=0;e<140;e++){let e=16+t()*120,n=16+t()*90,i=t()*512,a=t()*512,o=120+t()*60;r.fillStyle=`rgb(${o},${o+3},${o+8})`,r.fillRect(i,a,e,n),r.strokeStyle=`rgba(30,32,36,0.8)`,r.lineWidth=1.5,r.strokeRect(i+.5,a+.5,e,n)}for(let e=0;e<10;e++){let e=t()*512,n=t()*512;r.fillStyle=t()<.5?`#c8662a`:`#d9b23a`,r.fillRect(e,n,40+t()*60,6)}for(let e=0;e<1500;e++)r.fillStyle=`rgba(20,20,20,${t()*.08})`,r.fillRect(t()*512,t()*512,2+t()*8,2+t()*8);let i=new T(n);i.colorSpace=w,i.wrapS=i.wrapT=x,i.anisotropy=4;let a=document.createElement(`canvas`);a.width=a.height=512;let o=a.getContext(`2d`);o.fillStyle=`#000`,o.fillRect(0,0,512,512);for(let e=0;e<24;e++){let n=512/24*e+8;for(let e=0;e<512;e+=9)t()<.55||(o.fillStyle=t()<.75?`rgba(255,${200+t()*40},${130+t()*60},1)`:`rgba(140,210,255,1)`,o.fillRect(e,n,5,4))}let s=new T(a);return s.colorSpace=w,s.wrapS=s.wrapT=x,{map:i,emis:s}}function nt(){let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`);t.fillStyle=`#0b1a3a`,t.fillRect(0,0,256,256),t.strokeStyle=`#5a7bb0`,t.lineWidth=2;for(let e=0;e<=8;e++)t.beginPath(),t.moveTo(e*256/8,0),t.lineTo(e*256/8,256),t.stroke(),t.beginPath(),t.moveTo(0,e*256/8),t.lineTo(256,e*256/8),t.stroke();let n=new T(e);return n.colorSpace=w,n.wrapS=n.wrapT=x,n}function rt(e=1){let t=Le(e),i=[],a=[],o=[],c=(e,t,n,r,i)=>{let a=new f().compose(new M(...n||[0,0,0]),new v().setFromEuler(new l(...r||[0,0,0])),new M(...i||[1,1,1]));t.applyMatrix4(a),e.push(t.index?t.toNonIndexed():t)};c(i,new E(430,34,20,160),[0,0,0]),c(i,new E(430,12,8,160),[0,0,42]),c(i,new E(430,12,8,160),[0,0,-42]),c(a,new j(464.5,464.5,14,160,1,!0),[0,0,0],[Math.PI/2,0,0]);for(let e=0;e<6;e++){let t=e/6*Math.PI*2;c(i,new j(9,9,370,10),[Math.cos(t)*235,Math.sin(t)*235,0],[0,0,t-Math.PI/2]),c(i,new k(30,30,60),[Math.cos(t)*390,Math.sin(t)*390,0],[0,0,t])}c(i,new j(70,70,360,32),[0,0,0],[Math.PI/2,0,0]),c(i,new j(95,70,60,32),[0,0,200],[Math.PI/2,0,0]),c(i,new j(70,95,60,32),[0,0,-200],[Math.PI/2,0,0]),c(i,new A(80,32,16,0,Math.PI*2,0,Math.PI/2),[0,0,-230],[-Math.PI/2,0,0]),c(i,new k(150,70,90),[0,0,270]),c(a,new s(120,44),[0,0,315.5]);for(let e=0;e<2;e++)c(a,new k(150,3,3),[0,e?37:-37,316]);for(let e of[-1,1]){c(i,new k(16,16,720),[e*0,0,0],[0,Math.PI/2,0]);for(let t=0;t<3;t++){let n=e*(570+t*150);c(o,new k(130,2,240),[n,0,0],[.35,0,0]),c(i,new k(150,8,8),[n,0,0])}c(i,new k(460,10,10),[e*710,0,0])}for(let e=0;e<90;e++){let e=t()*Math.PI*2,n=430+(t()<.5?30:-30);c(i,new k(8+t()*26,6+t()*18,8+t()*30),[Math.cos(e)*n,Math.sin(e)*n,(t()-.5)*50],[0,0,e])}for(let e=0;e<40;e++){let e=t()*Math.PI*2;c(i,new k(12+t()*20,12+t()*20,10+t()*40),[Math.cos(e)*75,Math.sin(e)*75,(t()-.5)*300],[0,0,e])}c(i,new j(2,2,220,6),[0,0,-380],[Math.PI/2,0,0]),c(i,new A(30,16,8,0,Math.PI*2,0,Math.PI/2),[0,60,-300],[0,0,0]),c(i,new E(250,20,14,120),[0,0,150]),c(a,new j(270.5,270.5,8,120,1,!0),[0,0,150],[Math.PI/2,0,0]);for(let e=0;e<4;e++){let t=e/4*Math.PI*2+Math.PI/4;c(i,new j(7,7,180,8),[Math.cos(t)*160,Math.sin(t)*160,150],[0,0,t-Math.PI/2]),c(i,new k(46,46,130),[Math.cos(t)*110,Math.sin(t)*110,-120],[0,0,t]),c(i,new j(16,22,90,12),[Math.cos(t)*110,Math.sin(t)*110,-230],[Math.PI/2,0,0])}for(let e=0;e<5;e++){let t=-160+e*70;c(i,new j(84+e%2*10,84+e%2*10,26,32),[0,0,t],[Math.PI/2,0,0])}for(let e=0;e<12;e++){let t=e/12*Math.PI*2;c(a,new A(4,6,4),[Math.cos(t)*466,Math.sin(t)*466,46])}let u=e=>e.map(e=>{for(let t of Object.keys(e.attributes))[`position`,`normal`,`uv`].includes(t)||e.deleteAttribute(t);return e}),d=tt(e),p=new S;p.name=`universe:station`;let m=new n(O(u(i)),Be({map:d.map,mapRepeat:[6,2],rough:.45,metal:.55,color:14212324})),h=new n(O(u(o)),Be({map:nt(),rough:.3,metal:.6,color:11189230,side:2})),g=new r({map:d.emis,color:new b(6,5,4)});d.emis.repeat.set(10,1);let _=new n(O(u(a)),g);p.add(m,h,_);for(let e of[m,h,_])e.frustumCulled=!1;return p.userData.dispose=()=>{for(let n of[m,h,_]){var e,t;n.geometry.dispose(),(e=n.material.map)==null||e.dispose(),(t=n.material.uniforms)==null||(t=t.uMap)==null||(t=t.value)==null||t.dispose(),n.material.dispose()}},{group:p,lightMesh:_}}var it=`
uniform float uArms;
uniform float uTanP;
uniform float uSinP;
uniform float uTheta0;
uniform float uR0;
uniform float uGSeed;
const float G_RD = 8000.0;
const float G_HZ = 260.0;
const float G_RB = 3600.0;
const float G_RMAX = 42000.0;
float galArm(float rr, float th) {
  if (rr < 600.0) return 0.0;
  float lr = log(max(rr, uR0) / uR0) / uTanP;
  float w = 900.0 + 0.05 * rr;
  float best = 0.0;
  for (int k = 0; k < 4; k++) {
    if (float(k) >= uArms) break;
    float ta = uTheta0 + float(k) * 6.2831853 / uArms + lr;
    float d = th - ta;
    d -= floor(d / 6.2831853 + 0.5) * 6.2831853;
    float s = d * rr * uSinP / w;
    best = max(best, exp(-s * s));
  }
  return best;
}
// emissão (rgb) e densidade de poeira no ponto
void galSample(vec3 p, out vec3 em, out float dust) {
  float rr = length(p.xz);
  float th = atan(p.z, p.x);
  float ch = cosh(min(30.0, p.y / (G_HZ * 1.5)));
  // perfil de LUZ: disco mais plano que o de contagem e com o centro
  // esvaziado (os braços entram até o bojo, como numa espiral real)
  float disk = exp(-rr / 11000.0) * (1.0 - 0.75 * exp(-rr * rr / (5500.0 * 5500.0))) / (ch * ch);
  float arm = galArm(rr, th);
  float clump = snoise(vec3(rr / 2600.0 + th * 3.1, th * 2.3, uGSeed)) * 0.5 + 0.5;
  float yb = p.y * 1.7;
  float rb = G_RB * 0.62;
  float bulge = 1.6 * exp(-(rr * rr + yb * yb) / (2.0 * rb * rb)) + 0.25 * exp(-(rr * rr + yb * yb * 2.0) / (2.0 * G_RB * G_RB));
  float edge = clamp(1.0 - (rr - G_RMAX * 0.8) / (G_RMAX * 0.2), 0.0, 1.0);
  float fine = snoise(p / 900.0 + uGSeed) * 0.5 + 0.5;
  float fine2 = snoise(p / 260.0 - uGSeed) * 0.5 + 0.5;
  vec3 eDisk = vec3(0.72, 0.8, 1.0) * disk * (0.1 + 2.0 * arm * (0.55 + 0.9 * clump)) * (0.55 + 0.9 * fine);
  float knots = smoothstep(0.5, 0.9, clump) * smoothstep(0.45, 0.85, fine) * smoothstep(0.4, 0.8, fine2);
  vec3 eNeb = mix(vec3(1.0, 0.25, 0.55), vec3(0.25, 0.55, 1.0), smoothstep(0.35, 0.75, snoise(p / 3000.0 + 7.0) * 0.5 + 0.5)) * disk * arm * knots * 3.5;
  vec3 eBul = vec3(1.0, 0.78, 0.5) * bulge * 1.3;
  em = (eDisk + eNeb + eBul) * edge;
  float chd = cosh(min(30.0, p.y / 110.0));
  // poeira concentrada na borda INTERNA dos braços (atrasada em ângulo)
  float armD = galArm(rr, th - 0.22);
  dust = exp(-rr / (G_RD * 1.3)) / (chd * chd) * (0.2 + 2.2 * armD * (0.4 + fine)) * edge * (0.5 + 1.0 * fine2);
}
`,at=`
precision highp float;
uniform vec3 uObs;          // posição do observador (al, referencial galáctico)
uniform mat3 uToGal;        // inercial → galáctico
varying vec2 vUv;
${U}
${it}
void main() {
  // texel → direção inercial (equiretangular: u = longitude, v = latitude)
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.14159265;
  vec3 dI = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
  vec3 d = normalize(uToGal * dI);
  vec3 acc = vec3(0.0);
  float T = 1.0;
  float t = 4.0;
  for (int i = 0; i < 96; i++) {
    float dt = t * 0.085 + 6.0;
    vec3 p = uObs + d * (t + dt * 0.5);
    float rr = length(p.xz);
    if (rr > G_RMAX * 1.05 && dot(p.xz, d.xz) > 0.0) break;
    if (abs(p.y) > 6000.0 && p.y * d.y > 0.0) break;
    vec3 em; float dust;
    galSample(p, em, dust);
    // estrelas a menos de ~1 500 al são resolvidas (o domo do céu as desenha):
    // a faixa é a luz NÃO resolvida, distante
    float far = smoothstep(700.0, 3200.0, t);
    acc += T * em * dt * 0.0009 * far;
    T *= exp(-dust * dt * 0.0013);
    t += dt;
    if (T < 0.01 || t > 70000.0) break;
  }
  // nuvens estelares e fendas escuras em escala angular (textura da faixa)
  float n1 = fbm(d * 7.0 + uGSeed, 5);
  float n2 = fbm(d * 23.0 - uGSeed, 4);
  acc *= (0.45 + 1.1 * smoothstep(-0.45, 0.55, n1)) * (0.75 + 0.5 * smoothstep(-0.3, 0.7, n2));
  gl_FragColor = vec4(acc, 1.0);
}`,ot=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,st=`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`,ct=`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform float uGain;
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float lon = atan(-d.z, d.x);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.14159265 + 0.5);
  vec3 c = texture2D(uTex, uv).rgb;
  gl_FragColor = vec4(c * uGain, 1.0);
}`;function lt(){return{uArms:{value:2},uTanP:{value:.25},uSinP:{value:.24},uTheta0:{value:0},uR0:{value:2400},uGSeed:{value:1}}}function ut(e,t){e.uArms.value=t.arms,e.uTanP.value=Math.tan(t.pitch),e.uSinP.value=Math.sin(t.pitch),e.uTheta0.value=t.theta0,e.uR0.value=t.R0,e.uGSeed.value=t.gseed%1e3/10}var dt=class{constructor(e){this.ctx=e,this.target=new c(1024,512,{type:a,depthBuffer:!1,generateMipmaps:!1}),this.target.texture.colorSpace=d,this.target.texture.wrapS=x,this.bakeMat=new g({vertexShader:ot,fragmentShader:at,uniforms:{uObs:{value:new M},uToGal:{value:new u},...lt()},depthTest:!1,depthWrite:!1}),this.quad=new n(new s(2,2),this.bakeMat),this.quad.frustumCulled=!1,this.bakeScene=new D,this.bakeScene.add(this.quad),this.bakeCam=new p(-1,1,1,-1,0,1),this.mat=new g({vertexShader:st,fragmentShader:ct,uniforms:{uTex:{value:this.target.texture},uGain:{value:0}},blending:2,transparent:!0,depthWrite:!1,side:1}),this.mesh=new n(new A(6e9,64,32),this.mat),this.mesh.name=`universe:galaxySky`,this.mesh.renderOrder=-990,this.mesh.frustumCulled=!1,e.scene.add(this.mesh),this.dirty=!1}set(e,t,n){let r=this.bakeMat.uniforms;r.uObs.value.fromArray(t.galacticPosition),ut(r,e);let i=new M().fromArray(n.normal),a=new M().fromArray(n.core),o=a.clone().addScaledVector(i,-a.dot(i)).normalize(),s=new M().crossVectors(o,i).normalize(),c=t.galacticPosition,l=new M(-c[0],0,-c[2]).normalize(),d=new M(-l.z,0,l.x),f=new u().set(l.x*o.x+d.x*s.x,l.x*o.y+d.x*s.y,l.x*o.z+d.x*s.z,i.x,i.y,i.z,l.z*o.x+d.z*s.x,l.z*o.y+d.z*s.y,l.z*o.z+d.z*s.z);r.uToGal.value.copy(f),this.dirty=!0}bake(){let e=this.ctx.renderer,t=e.getRenderTarget();e.setRenderTarget(this.target),e.render(this.bakeScene,this.bakeCam),e.setRenderTarget(t),this.dirty=!1}frame(e,t){var n;this.dirty&&this.bake(),this.mat.uniforms.uGain.value=t,this.mesh.visible=t>.001;let r=((n=e.services.sky)==null?void 0:n.rotation)??0;this.mesh.rotation.y=r}dispose(){this.ctx.scene.remove(this.mesh),this.mesh.geometry.dispose(),this.mat.dispose(),this.bakeMat.dispose(),this.quad.geometry.dispose(),this.target.dispose()}},ft=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,pt=`
precision highp float;
uniform float uPhase;
uniform float uTime;
uniform float uAspect;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
${U}
float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
vec3 streaks(vec2 uv, float r, float a, float layer, float speed, float len, float dens) {
  float N = 220.0 + layer * 140.0;
  float fa = (a / 6.2831853 + 0.5) * N;
  float ai = floor(fa);
  float fx = fract(fa) - 0.5;
  float hh = h1(ai + layer * 17.0);
  if (hh > dens) return vec3(0.0);
  float head = fract(hh * 13.7 + uTime * speed * (0.6 + hh));
  head = head * head * 1.6 + 0.02;
  float l = len * head * (0.5 + hh);
  float body = smoothstep(head - l, head, r) * step(r, head);
  float thin = smoothstep(0.5, 0.0, abs(fx) * (1.0 + 4.0 * r)) ;
  float b = body * thin * (0.4 + 1.6 * h1(ai * 3.1 + layer));
  vec3 c = mix(vec3(1.0), mix(uColA, uColB, h1(ai * 7.7)), 0.65);
  return c * b * (0.6 + 2.4 * head);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float p = uPhase;
  float charge = smoothstep(0.0, 0.16, p);
  float tunnel = smoothstep(0.1, 0.26, p) * (1.0 - smoothstep(0.8, 0.92, p));
  float exitF = smoothstep(0.82, 0.88, p) * (1.0 - smoothstep(0.88, 1.0, p));
  // riscos (3 camadas)
  float len = mix(0.02, 0.9, charge);
  vec3 col = vec3(0.0);
  col += streaks(uv, r, a, 0.0, 0.9, len, 0.55) * (0.35 + 0.5 * tunnel);
  col += streaks(uv, r, a + 0.013, 1.0, 1.4, len * 0.8, 0.4) * (0.25 + 0.5 * tunnel);
  col += streaks(uv, r, a - 0.021, 2.0, 2.3, len * 1.2, 0.3) * 0.6 * tunnel;
  // paredes do túnel: plasma em coordenadas cilíndricas (z = 1/r), mais forte perto da borda
  float z = 0.3 / max(r, 0.03) + uTime * 2.4;
  vec3 cyl = vec3(cos(a) * 1.3, sin(a) * 1.3, z * 0.5);
  float n1 = fbm(cyl, 5);
  float n2 = fbm(cyl * 2.1 + vec3(0.0, 0.0, uTime * 1.1), 3);
  float fil = pow(1.0 - abs(snoise(vec3(cos(a) * 3.0, sin(a) * 3.0, z * 1.4))), 6.0);
  float wallMask = smoothstep(0.1, 0.55, r);
  float wall = smoothstep(-0.2, 0.75, n1) * wallMask;
  vec3 wc = mix(uColA, uColB, smoothstep(-0.45, 0.55, n2));
  col += wc * wall * tunnel * (0.25 + 0.9 * r) * 0.9;
  col += mix(wc, vec3(1.0), 0.25) * fil * wallMask * tunnel * 0.8;
  float rings = pow(0.5 + 0.5 * sin(z * 7.0 + n2 * 2.5), 10.0) * wallMask;
  col += mix(uColB, vec3(1.0), 0.3) * rings * tunnel * 0.35;
  // fim do túnel: brilho pequeno e intenso, com halo colorido
  float core = exp(-r * 22.0) * 3.0 + exp(-r * 7.0) * 0.35;
  col += mix(vec3(0.9, 0.95, 1.0), uColA, 0.25) * core * (0.3 + 0.7 * tunnel);
  // clarão de carga e de saída
  col += mix(uColA, vec3(1.0), 0.6) * (smoothstep(0.08, 0.16, p) * (1.0 - smoothstep(0.16, 0.26, p))) * 1.2;
  col += vec3(1.0, 0.97, 0.95) * exitF * 4.0;
  // vinheta escura nas bordas durante o túnel
  float vig = smoothstep(1.3, 0.45, r);
  col *= mix(1.0, vig, tunnel * 0.5);
  float alpha = clamp(charge * 0.35 + tunnel * 0.93 + exitF, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`,mt=class{constructor(e){this.ctx=e,this.mat=new g({vertexShader:ft,fragmentShader:pt,uniforms:{uPhase:{value:0},uTime:{value:0},uAspect:{value:16/9},uColA:{value:new M(.25,.5,1)},uColB:{value:new M(.85,.3,1)}},depthTest:!1,depthWrite:!1,transparent:!0,blending:5,blendSrc:201,blendDst:205}),this.quad=new n(new s(2,2),this.mat),this.quad.frustumCulled=!1,this.scene=new D,this.scene.add(this.quad),this.cam=new p(-1,1,1,-1,0,1),this.active=!1,this.phase=0,this.time=0,this.remove=e.pipeline.addPass(`afterCockpit`,(e,t)=>this.render(t),{order:20,owner:`universe`})}setColor(e){let t=new b(e[0],e[1],e[2]),n={};t.getHSL(n);let r=+(n.h<.2||n.h>.9),i=new b().setHSL(.55+.06*r,.95,.5),a=new b().setHSL(.8+.06*r,.9,.5);this.mat.uniforms.uColA.value.set(i.r,i.g,i.b),this.mat.uniforms.uColB.value.set(a.r,a.g,a.b)}render(e){if(!this.active)return;let t=this.mat.uniforms;t.uPhase.value=this.phase,t.uTime.value=this.time,t.uAspect.value=e.width/Math.max(1,e.height);let n=this.ctx.renderer,r=n.autoClear;n.autoClear=!1,n.setRenderTarget(e),n.render(this.scene,this.cam),n.autoClear=r}dispose(){var e;(e=this.remove)==null||e.call(this),this.mat.dispose(),this.quad.geometry.dispose()}},Z=new M,Q=new M,$=new v,ht={name:`universe`,order:5,async init(e){var t;this.ctx=e;let n=e.start.galaxy??0,r=this.galaxy=he(e.seed,n);this.bodies=new Ie(e),this.asteroids=new et(e),this.sky=new dt(e),this.warp=new mt(e),this.station=null,this.warpState=null,this.spaceK=0,await((t=e.bootProgress)==null?void 0:t.call(e,`sistema estelar`,.3));let i=r.resolve(e.start.systemIndex??0);this.enter(i,e.start.planetIndex??0,{emit:!1});let a=this,o={get galaxy(){return a.galaxyInfo},get currentSystem(){return a.sys},get currentPlanet(){return a.sys.planets[a.sys.currentPlanetIndex]},get currentPlanetIndex(){return a.sys.currentPlanetIndex},get anchors(){return a.sys.anchors},bodies(){return a.sys.bodies},findBody(e){return a.findBody(e)},warpTo(e,t=0,n={}){return a.warpTo(e,t,n)},get warping(){return!!a.warpState},get warpPhase(){return a.warpState?a.warp.phase:0},enterPlanet(e){return a.enterPlanet(e)},systemInfo(e){return a.systemInfo(e)},travelTime(e,t){return Ee(e,t)},pulseSpeed:_e,scale:{starDistance:V,neighbors:[12e6,24e6],moons:[5,9],pulseSpeed:_e,lyPerCell:r.CELL}};this.galaxyInfo={index:r.index,id:r.id,name:r.name,get systemCount(){return r.systemCount},arms:r.arms,model:r,glsl:U+it,glslUniforms:{uArms:r.arms,uTanP:Math.tan(r.pitch),uSinP:Math.sin(r.pitch),uTheta0:r.theta0,uR0:r.R0,uGSeed:r.gseed%1e3/10}},this.api=e.provide(`universe`,o),this.offs=[e.bus.on(`quality:change`,()=>{this.bodies.lastPx=null})],e.shot||this.makeBanner()},enter(e,t=0,{emit:n=!0}={}){let r=this.ctx,i=Ce(r.seed,this.galaxy,e,t),a=r.seed.derive(`galaxy`,this.galaxy.index,`system`,e,`galactic`),o=new M().fromArray(i.ecliptic.normal),s=a.range(.35,1.25),c=new M(a.range(-1,1),0,a.range(-1,1)).normalize(),l=o.clone().applyAxisAngle(c,s).normalize(),u=new M(a.range(-1,1),a.range(-1,1),a.range(-1,1));return u.addScaledVector(l,-u.dot(l)).normalize(),i.galactic={normal:l.toArray(),core:u.toArray()},this.sys=i,this.bodies.build(i),this.asteroids.setSystem(i),this.buildStation(),this.sky.set(this.galaxy,i,i.galactic),n&&r.bus.emit(`system:enter`,{system:i,planet:i.planets[i.currentPlanetIndex]}),this.showBanner(),i},buildStation(){let e=this.ctx;if(this.station){var t,n;this.station.handle.remove(),e.scene.remove(this.station.group),(t=(n=this.station.group.userData).dispose)==null||t.call(n),this.station=null}let r=this.sys.anchors[0];if(!r)return;let i;try{i=rt(r.seed)}catch(t){e.report(`universe`,`station`,t);return}let a=i.group;e.scene.add(a);let o=e.space.registerFloating(a,r.position.clone()),s=this.sys.planets.find(e=>e.id===r.parent)||this.sys.planets[0];Z.set(s.position.x-r.position.x,s.position.y-r.position.y,s.position.z-r.position.z).normalize(),a.quaternion.setFromUnitVectors(Q.set(0,0,1),Z),this.station={group:a,handle:o,anchor:r,baseQ:a.quaternion.clone()}},findBody(e){let t=this.sys;if(!e||!t)return null;let n=t.bodies.find(t=>t.id===e)||t.anchors.find(t=>t.id===e);if(n)return n;let r=t.planets[t.currentPlanetIndex];if(e===`star`||e===`sun`)return t.stars[0];if(e===`moon`)return r.moons[0]||t.bodies.find(e=>e.kind===`moon`)||null;if(e===`planet`)return t.planets.find(e=>e!==r)||null;if(e===`station`)return t.anchors[0]||null;if(e===`gas`)return t.planets.find(e=>e.type===`gas`)||null;if(e===`ringed`)return t.planets.find(e=>e.rings&&e!==r)||null;let i=/^p(\d+)(?:\.m(\d+))?$/.exec(e);if(i){let e=t.planets[Number(i[1])];return e?i[2]==null?e:e.moons[Number(i[2])]||null:null}return null},systemInfo(e){let t=this.galaxy;e=t.resolve(e);let n=t.star(e),r=this.sys,i=null;try{i=e===r.index?r:Ce(this.ctx.seed,t,e,0)}catch{i=null}return{index:e,id:n.id,name:n.name,class:n.cls,temperature:n.temperature,color:n.color,binary:n.binary,position:n.pos,distance:ge(n.pos,r.galacticPosition),planets:i?i.planets.map(e=>({name:e.name,biome:e.biome,type:e.type,rings:!!e.rings,moons:e.moons.length})):[],belt:!!(i!=null&&i.belts.length),station:!!(i!=null&&i.anchors.length),current:e===r.index}},enterPlanet(e){let t=this.ctx,n=this.sys,r=n.planets[e];if(!r||!r.landable||e===n.currentPlanetIndex)return!1;let i=new P().copy(r.position);return Te(n,e),t.bus.emit(`space:recenter`,{offset:i}),this.bodies.build(n),this.asteroids.setSystem(n),this.station&&this.station.handle.worldPos.copy(this.station.anchor.position),t.bus.emit(`planet:enter`,{planet:r}),!0},warpTo(e,t=0,n={}){var r,i;let a=this.ctx,o=this.galaxy,s;if(typeof e==`number`)s=e;else{let t=/s(\d+)/.exec(String(e));s=t?Number(t[1]):0}if(s=o.resolve(s),!(n.tunnel??!a.shot))return this.enter(s,t),this.placeArrival(),Promise.resolve(this.sys);if(this.warpState)return this.warpState.promise;let c=o.star(s);this.warp.setColor(c.color);let l,u=new Promise(e=>l=e),d=a.services.render,f=d?{auto:d.autoExposure,exp:d.exposure}:null;if(d){var p;d.autoExposure=!1,(p=d.setExposure)==null||p.call(d,1)}return this.warpState={index:s,planetIndex:t,t:0,entered:!1,promise:u,resolve:l,held:0,prevExp:f},this.warp.active=!0,this.warp.phase=0,a.bus.emit(`universe:warp`,{phase:`start`,target:s}),(r=a.services.audio)==null||(i=r.play)==null||i.call(r,`warp`,null,{volume:.9}),u},placeArrival(){let e=this.ctx,t=this.sys.planets[this.sys.currentPlanetIndex],n=this.sys.stars[0].position,r=Z.set(n.x,n.y,n.z).normalize(),i=Q.set(-r.z,.25,r.x).normalize(),a=new M().copy(r).multiplyScalar(.55).add(i).normalize(),o=t.radius,s=new P().copy(a).multiplyScalar(o*3.1),c=e.player;c.place({mode:`space`,worldPos:s}),c.worldPos.copy(s),ee(new M().copy(a).negate().addScaledVector(i,.35).normalize(),new M(0,1,0),c.quaternion),c.velocity.set(0,0,0),c.snap()},updateWarp(e){let t=this.warpState,n=this.ctx;if(!t)return;t.t+=e;let r=this.warp;r.time+=e;let i;if(t.t<1?i=t.t/1*.16:!t.entered||t.t<4.5||t.held<6&&(n.workers.busy||n.ready.count)?(i=.16+Math.min(1,(t.t-1)/3.5)*.64,t.t>=4.5&&(t.held+=e)):(t.exitT=(t.exitT??0)+e,i=.8+Math.min(1,t.exitT/1.2)*.2),!t.entered&&t.t>1.4){t.entered=!0;try{this.enter(t.index,t.planetIndex),this.placeArrival()}catch(e){n.report(`universe`,`warp`,e)}n.bus.emit(`universe:warp`,{phase:`arrive`,target:t.index})}if(r.phase=i,i>=1){r.active=!1;let e=n.services.render;if(e&&t.prevExp){var a;e.autoExposure=t.prevExp.auto,t.prevExp.exp&&((a=e.setExposure)==null||a.call(e,t.prevExp.exp))}this.warpState=null,n.bus.emit(`universe:warp`,{phase:`end`,target:t.index}),t.resolve(this.sys)}},autoPlanet(){let e=this.ctx,t=e.player;if(t.mode===`walk`||this.warpState||e.shot)return;let n=this.sys,r=n.planets[n.currentPlanetIndex],i=t.worldPos,a=Math.hypot(i.x-r.position.x,i.y-r.position.y,i.z-r.position.z)/r.radius,o=-1,s=Math.min(a,4);n.planets.forEach((e,t)=>{if(!e.landable||e===r)return;let n=Math.hypot(i.x-e.position.x,i.y-e.position.y,i.z-e.position.z)/e.radius;n<s&&(s=n,o=t)}),o>=0&&this.enterPlanet(o)},update(e,t){var n;let r=(n=t.shot)==null||(n=n.preset)==null||(n=n.params)==null?void 0:n.uniCam;r&&this.applyShotCam(r)},applyShotCam(e){let t=this.ctx,n=this.findBody(e.body||`planet`);if(!n)return;let r=t.services.sky,i=(r==null?void 0:r.sunDirection)||Z.set(1,0,0),a=n.radius||1e3,o=e.distM??a*(e.dist??4),s=new M(i.x,0,i.z).normalize(),c=new M().crossVectors(s,new M(0,1,0)),l=(e.az??30)*Math.PI/180,u=(e.el??10)*Math.PI/180,d=new M().addScaledVector(s,Math.cos(u)*Math.cos(l)).addScaledVector(c,Math.cos(u)*Math.sin(l)).addScaledVector(new M(0,1,0),Math.sin(u)),f=n.position,p=t.player;p.mode!==`space`&&p.setMode(`space`),p.worldPos.set(f.x+d.x*o,f.y+d.y*o,f.z+d.z*o);let m=this.findBody(e.look||e.body)||n;ee(new M(m.position.x-p.worldPos.x,m.position.y-p.worldPos.y,m.position.z-p.worldPos.z).normalize(),new M(0,1,0),p.quaternion),e.yaw&&p.quaternion.multiply($.setFromAxisAngle(Q.set(0,1,0),e.yaw*Math.PI/180)),e.pitch&&p.quaternion.multiply($.setFromAxisAngle(Q.set(1,0,0),e.pitch*Math.PI/180)),e.roll&&p.quaternion.multiply($.setFromAxisAngle(Q.set(0,0,1),e.roll*Math.PI/180)),e.fov&&(p.fov=e.fov),p.velocity.set(0,0,0),p.snap()},frame(e,t){var n,r,i,a;let o=this.sys,s=(n=t.shot)==null||(n=n.preset)==null||(n=n.params)==null?void 0:n.uniWarp;if(s!=null){if(!this._shotWarp){this._shotWarp=!0;let e=this.galaxy.systemsNear(o.galacticPosition,120,8)[3];this.warp.setColor(this.galaxy.star(e?e.index:1).color)}this.warp.active=!0,this.warp.phase=s,this.warp.time=s*7.3+1.7}else this.updateWarp(t.time.frameDt||e);this.autoPlanet();let c=o.planets[o.currentPlanetIndex],l=t.space.origin,u=t.space.planetCenter,d=((r=t.services.planet)==null?void 0:r.radius)||c.radius,f=Math.hypot(l.x-u.x,l.y-u.y,l.z-u.z)-d,p=Math.max(1e3,(((i=c.atmosphere)==null?void 0:i.radius)??d*1.1)-d),m=Math.min(1,Math.max(0,(f-p*1.05)/(p*.6)));this.spaceK=m,He(t,o.stars,1);let h=m>.02||!((a=t.services.sky)!=null&&a.drawsBodies);if(this.bodies.frame(t,o,o.stars,h),this.asteroids.frame(t,m>.02),this.sky.frame(t,m*1),this.station){let e=this.station,n=e.group.position.length();e.group.visible=m>.02&&n<3e6;let r=t.time.world*e.anchor.spin%(Math.PI*2);e.group.quaternion.copy(e.baseQ).multiply($.setFromAxisAngle(Z.set(0,0,1),r))}this.tickBanner(e)},makeBanner(){let e=document.createElement(`div`);e.className=`uni-banner`,e.style.cssText=`position:absolute;left:50%;top:14%;transform:translateX(-50%);text-align:center;color:#e8f2ff;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;text-shadow:0 0 12px rgba(120,180,255,.8);opacity:0;transition:opacity .8s;pointer-events:none`,this.ctx.ui.appendChild(e),this.banner={el:e,t:0}},showBanner(){if(!this.banner||!this.sys)return;let e=this.sys,t=e.stars[0];this.banner.el.innerHTML=`<div style="font-size:26px;letter-spacing:.18em">${e.name}</div><div style="opacity:.75">classe ${t.class}${e.binary?` · binária`:``} · ${e.planets.length} planetas${e.belts.length?` · cinturão`:``}</div>`,this.banner.t=6},tickBanner(e){let t=this.banner;t&&(t.t>0&&!this.warpState?(t.t-=e,t.el.style.opacity=t.t>.8?`1`:`0`):t.el.style.opacity=`0`)},dispose(e){var t,n,r,i,a;for(let e of this.offs||[])e();if((t=this.bodies)==null||t.dispose(),(n=this.asteroids)==null||n.dispose(),(r=this.sky)==null||r.dispose(),(i=this.warp)==null||i.dispose(),this.station){var o,s;this.station.handle.remove(),e.scene.remove(this.station.group),(o=(s=this.station.group.userData).dispose)==null||o.call(s)}(a=this.banner)==null||a.el.remove()}};export{ht as default};
//# sourceMappingURL=universe-CGBZz8cV.js.map