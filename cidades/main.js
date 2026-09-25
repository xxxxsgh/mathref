import * as THREE from 'three';
import { CITIES } from './data.js';
import { R, D, INK, upAt, eastAt, latLonOf, buildCity, updateWorld, blocked, glowMat } from './world.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// ?city=jaipur ou #jaipur (o hash funciona também onde a query string não chega)
const cfg = CITIES[params.get('city') || location.hash.slice(1)];
const sound = new Sound();

if (cfg) enterCity(cfg); else showHome();

// ─── tela inicial ───────────────────────────────────────────────────────────
function planetSVG(c) {
  const J = c.id === 'jaipur';
  const cols = J ? ['#e2957f', '#d98672', '#f0a488', '#e8c48a', '#dc8b6f'] : ['#e9d9a8', '#d8b56a', '#b9cfa8', '#a84a3a', '#e0a88e'];
  let seed = J ? 7 : 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let b = '';
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * 360 + r() * 4, h = 12 + r() * 20, w = 12 + r() * 8, f = cols[i % cols.length];
    b += `<g transform="rotate(${a.toFixed(1)})"><rect x="${-w / 2}" y="${-92 - h}" width="${w}" height="${h + 6}" fill="${f}" stroke="#231a26" stroke-width="2.5"/>`;
    if (J && r() < 0.4) b += `<path d="M${-w / 4} ${-92 - h} q${w / 4} ${-w / 2} ${w / 2} 0z" fill="#f6e7d0" stroke="#231a26" stroke-width="2"/>`;
    if (!J && r() < 0.4) b += `<rect x="${-3}" y="${-92 - h - 6}" width="7" height="6" fill="#26262b"/>`;
    if (r() < 0.3) b += `<circle cx="${w / 2 + 6}" cy="${-100}" r="7" fill="#5f8f4a" stroke="#231a26" stroke-width="2"/>`;
    b += '</g>';
  }
  const ground = J ? '#d9b98a' : '#a9b58a', train = J ? '#7a1f2b' : '#eee2bf';
  return `<svg viewBox="-150 -150 300 300" aria-hidden="true">
    <g class="spin">${b}<circle r="92" fill="${ground}" stroke="#231a26" stroke-width="3"/>
    ${!J ? '<path d="M-20 -91 q-14 90 8 182" stroke="#5d8fa8" stroke-width="16" fill="none"/>' : '<circle cx="-30" cy="40" r="18" fill="#5d9ab0" stroke="#231a26" stroke-width="2"/>'}
    </g>
    <ellipse rx="112" ry="24" fill="none" stroke="#231a26" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round" transform="rotate(-10)"/>
    <g transform="rotate(-10)"><rect x="-14" y="-6" width="28" height="12" rx="3" fill="${train}" stroke="#231a26" stroke-width="2.5">
      <animateMotion dur="${J ? 9 : 12}s" repeatCount="indefinite" path="M-112 0 a112 24 0 1 0 224 0 a112 24 0 1 0 -224 0"/></rect></g>
  </svg>`;
}

function showHome() {
  const home = $('#home'); home.hidden = false;
  const box = home.querySelector('.cities');
  for (const c of Object.values(CITIES)) {
    const btn = document.createElement('button');
    btn.className = 'city'; btn.style.setProperty('--accent', c.accent);
    btn.innerHTML = `
      <div class="slot">${planetSVG(c)}</div>
      <div class="words">
        <div class="script" lang="${c.lang}">${c.script}</div>
        <div class="latin">${c.latin}<small>${c.nick}</small></div>
        <p class="about">${c.about}</p>
      </div>
      <ol class="route">${c.stations.map((s) => `<li><span class="n" lang="${c.lang}">${s.deva}</span><span class="l">${s.latin}</span></li>`).join('')}</ol>
      <span class="step">Caminhar por ${c.latin} →</span>`;
    btn.onclick = () => { home.hidden = true; try { history.replaceState(null, '', '#' + c.id); } catch {} enterCity(c); };
    box.appendChild(btn);
  }
}

// ─── entrada na cidade ──────────────────────────────────────────────────────
async function enterCity(cfg) {
  document.title = `${cfg.latin} · Duas Cidades`;
  const card = $('#card'); card.classList.remove('gone');
  card.style.setProperty('--accent', cfg.accent);
  const sc = card.querySelector('.card-script'); sc.textContent = cfg.script; sc.lang = cfg.lang;
  card.querySelector('.card-latin').textContent = `${cfg.latin} — ${cfg.nick}`;
  const go = $('#go');
  card.querySelector('.card-back').onclick = (e) => { e.preventDefault(); try { history.replaceState(null, '', location.pathname); } catch {} location.reload(); };

  const fam = cfg.lang === 'bn' ? '"Noto Serif Bengali"' : '"Tiro Devanagari Hindi"';
  await Promise.race([Promise.all([document.fonts.load(`700 40px ${fam}`, cfg.script), document.fonts.load('700 20px Mukta')]), new Promise((r) => setTimeout(r, 2500))]);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

  const game = startGame(cfg);
  go.disabled = false; go.textContent = 'Entrar';
  go.onclick = () => {
    card.classList.add('gone');
    $('#hud').hidden = false;
    sound.start();
    game.begin();
  };
}

// ─── o jogo ─────────────────────────────────────────────────────────────────
function startGame(cfg) {
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xa8d8e8, 30, 150);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  const amb = new THREE.AmbientLight(0xffffff, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  const moon = new THREE.DirectionalLight(0x8fa6ff, 0.4);
  scene.add(amb, sun, moon, sun.target, moon.target);

  const world = buildCity(cfg, scene);

  // céu: estrelas, sol e lua
  const starPos = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1500); starPos.set([v.x, v.y, v.z], i * 3); }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xfff6e0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
  const discTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#fff'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t; })();
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xfff1c0, fog: false, depthWrite: false }));
  const moonSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xdfe6ff, fog: false, depthWrite: false }));
  sunSp.scale.setScalar(120); moonSp.scale.setScalar(60); scene.add(sunSp, moonSp);

  // chuva
  const DROPS = 1400;
  const rainPos = new Float32Array(DROPS * 6), rainSeed = [];
  for (let i = 0; i < DROPS; i++) rainSeed.push([(Math.random() - 0.5) * 50, Math.random() * 30, (Math.random() - 0.5) * 50]);
  const rain = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPos, 3)),
    new THREE.LineBasicMaterial({ color: 0xc8d4e6, transparent: true, opacity: 0.55 }));
  rain.matrixAutoUpdate = false; rain.frustumCulled = false; rain.visible = false; scene.add(rain);

  // alfinete para a vista do planeta
  const pin = new THREE.Group();
  const pinMat = new THREE.MeshBasicMaterial({ color: 0xe8492a });
  const pc = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 12), pinMat); pc.rotation.x = Math.PI; pc.position.y = 2;
  const pb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), pinMat); pb.position.y = 5;
  const po = new THREE.Mesh(new THREE.SphereGeometry(1.95, 16, 12), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })); po.position.y = 5;
  pin.add(pc, pb, po); pin.visible = false; scene.add(pin);

  // ─── estado do jogador ───
  const st0 = cfg.stations[0];
  const pos = upAt(3.3, st0.lon - 2).multiplyScalar(R);
  const fwd = eastAt(st0.lon - 2).clone();
  let pitch = -0.05, lookDX = 0, lookDY = 0;
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  let auto = false, riding = null, planet = false, planetT = 0, hideHud = false, raining = false, rainAmt = 0;
  let hours = 16.6, hoursTarget = 16.6;
  const orbitDir = new THREE.Vector3(), orbitUp = new THREE.Vector3(); let orbitDist = 3.2 * R;
  let t = 0, last = performance.now(), running = false, bob = 0;
  let lastLm = null, toastTimer = 0, talkTimer = 0;
  const trainPrev = { stopped: true };

  // ─── HUD ───
  const toastEl = $('#toast'), talkEl = $('#talk'), promptEl = $('#prompt'), modeEl = $('#mode'), coordsEl = $('#coords');
  function toast(native, latin, desc = '') {
    toastEl.querySelector('.t-native').textContent = native; toastEl.querySelector('.t-native').lang = cfg.lang;
    toastEl.querySelector('.t-latin').textContent = latin;
    toastEl.querySelector('.t-desc').textContent = desc;
    toastEl.classList.add('on'); toastTimer = 4.5;
  }
  function talk(npc) {
    const idx = npc.role.lines[npc.line % npc.role.lines.length]; npc.line++;
    const [n, tr, pt] = cfg.lines[idx];
    talkEl.querySelector('.k-who').textContent = npc.role.who;
    const kn = talkEl.querySelector('.k-native'); kn.textContent = n; kn.lang = cfg.lang;
    talkEl.querySelector('.k-translit').textContent = tr;
    talkEl.querySelector('.k-pt').textContent = pt;
    talkEl.classList.add('on'); talkTimer = 6; npc.talking = 6;
  }

  // ─── entrada ───
  const isTouch = matchMedia('(pointer: coarse)').matches;
  addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
    keys.add(e.code); action(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  function action(code) {
    if (code === 'KeyE') interact();
    else if (code === 'KeyP') togglePlanet();
    else if (code === 'KeyT') { hoursTarget = Math.round(hoursTarget + 3); toast('', `${fmtHour(((hoursTarget % 24) + 24) % 24)}`, ''); }
    else if (code === 'KeyK') { raining = !raining; toast('', raining ? 'Chuva de monção' : 'O céu abriu', ''); }
    else if (code === 'KeyM') { const on = sound.toggle(); toast('', on ? 'Som ligado' : 'Som desligado'); }
    else if (code === 'KeyV') auto = !auto;
    else if (code === 'KeyH') { hideHud = !hideHud; $('#hud').classList.toggle('hide', hideHud); }
  }
  canvas.addEventListener('click', () => { if (running && !isTouch && !planet && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  let dragging = false;
  canvas.addEventListener('mousedown', () => { dragging = true; });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (!running) return;
    if (document.pointerLockElement === canvas || dragging) { lookDX += e.movementX * 0.0024; lookDY += e.movementY * 0.0024; }
  });
  canvas.addEventListener('wheel', (e) => { if (planet) orbitDist = THREE.MathUtils.clamp(orbitDist * (1 + e.deltaY * 0.001), 1.5 * R, 5 * R); }, { passive: true });

  // toque: joystick à esquerda, olhar à direita
  const joyEl = $('#joy'), knob = $('#knob');
  let joyId = null, joyO = null, lookId = null, lookP = null;
  canvas.addEventListener('touchstart', (e) => {
    for (const tc of e.changedTouches) {
      if (tc.clientX < innerWidth * 0.45 && joyId === null) { joyId = tc.identifier; joyO = [tc.clientX, tc.clientY]; }
      else if (lookId === null) { lookId = tc.identifier; lookP = [tc.clientX, tc.clientY]; }
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    for (const tc of e.changedTouches) {
      if (tc.identifier === joyId) {
        let dx = tc.clientX - joyO[0], dy = tc.clientY - joyO[1]; const m = Math.hypot(dx, dy);
        if (m > 50) { dx *= 50 / m; dy *= 50 / m; }
        joy.x = dx / 50; joy.y = -dy / 50; knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (tc.identifier === lookId) {
        lookDX += (tc.clientX - lookP[0]) * 0.005; lookDY += (tc.clientY - lookP[1]) * 0.005; lookP = [tc.clientX, tc.clientY];
      }
    }
  }, { passive: true });
  const endTouch = (e) => {
    for (const tc of e.changedTouches) {
      if (tc.identifier === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; }
      if (tc.identifier === lookId) lookId = null;
    }
  };
  canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
  for (const b of document.querySelectorAll('#tbtns button')) b.addEventListener('click', (e) => { e.preventDefault(); action(b.dataset.k); });
  void joyEl;

  // ─── ações ───
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  // o que está ao alcance do E: a pessoa ou o vagão mais perto
  function target() {
    let best = null, bd = 2.8;
    for (const n of world.npcs) { const d = upAt(n.lat, n.lon, _v).multiplyScalar(R).distanceTo(pos); if (d < bd) { bd = d; best = { npc: n }; } }
    for (const c of world.train.cars) { _w.setFromMatrixPosition(c.group.matrix); const d = _w.distanceTo(pos) - 1.2; if (d < bd) { bd = d; best = { car: c }; } }
    return best;
  }
  function interact() {
    if (planet) return;
    if (riding) {
      const ll = latLonOf(pos);
      for (const la of [2.7, -3.3]) {
        if (!blocked(world, la, ll.lon)) { riding = null; pos.copy(upAt(la, ll.lon)).multiplyScalar(R); toast('', 'Você desceu', ''); return; }
      }
      toast('', 'Aqui não dá para descer', 'Espere o próximo trecho.');
      return;
    }
    const tg = target();
    if (tg?.npc) { talk(tg.npc); return; }
    if (tg?.car) { riding = world.train.cars[world.train.cars.length - 1]; auto = false; toast('', cfg.trainKind === 'tram' ? 'Pendurado no estribo do bonde' : 'No estribo do último vagão', 'E para descer.'); }
  }
  function togglePlanet() {
    planet = !planet;
    if (planet) {
      if (document.pointerLockElement) document.exitPointerLock();
      const up = pos.clone().normalize();
      orbitDir.copy(up).multiplyScalar(Math.cos(0.55)).addScaledVector(fwd, -Math.sin(0.55)).normalize();
      orbitUp.copy(fwd).multiplyScalar(Math.cos(0.55)).addScaledVector(up, Math.sin(0.55)).normalize();
      orbitDist = 3.2 * R;
    }
  }

  // ─── movimento ───
  const PR = 0.35;
  function resolve(p) {
    const n = _v.copy(p).normalize();
    for (let it = 0; it < 2; it++) {
      for (const o of world.obstacles) pushOut(n, o.n, o.r + PR / R);
      for (const vh of world.vehicles) pushOut(n, upAt(vh.lat, vh.lon, _w), 1.5 / R);
      if (!riding) for (const c of world.train.cars) { _w.setFromMatrixPosition(c.group.matrix).normalize(); pushOut(n, _w, 1.9 / R); }
    }
    p.copy(n).multiplyScalar(R);
  }
  const _d = new THREE.Vector3();
  function pushOut(n, c, r) {
    const dot = n.dot(c);
    if (dot <= Math.cos(r)) return;
    _d.copy(n).addScaledVector(c, -dot);
    if (_d.lengthSq() < 1e-12) _d.copy(fwd).multiplyScalar(-1);
    _d.normalize();
    n.copy(c).multiplyScalar(Math.cos(r)).addScaledVector(_d, Math.sin(r));
  }
  function tryStep(delta) {
    const np = pos.clone().add(delta).setLength(R);
    resolve(np);
    const ll = latLonOf(np);
    for (const b of world.blockers) if (b(ll.lat, ll.lon)) return false;
    pos.copy(np); return true;
  }

  const right = new THREE.Vector3(), back = new THREE.Vector3(), up = new THREE.Vector3(), mv = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const fpQuat = new THREE.Quaternion(), fpPos = new THREE.Vector3(), orbQuat = new THREE.Quaternion(), orbPos = new THREE.Vector3();

  function step(dt) {
    up.copy(pos).normalize();
    if (!planet) {
      fwd.applyAxisAngle(up, -lookDX);
      pitch = THREE.MathUtils.clamp(pitch - lookDY, -1.35, 1.35);
    } else {
      const q = new THREE.Quaternion().setFromAxisAngle(orbitUp, -lookDX * 1.4); orbitDir.applyQuaternion(q);
      const ax = new THREE.Vector3().crossVectors(orbitUp, orbitDir).normalize();
      const q2 = new THREE.Quaternion().setFromAxisAngle(ax, lookDY * 1.4); orbitDir.applyQuaternion(q2); orbitUp.applyQuaternion(q2);
      orbitDir.applyAxisAngle(orbitUp, dt * 0.03);
    }
    lookDX = lookDY = 0;
    right.crossVectors(fwd, up).normalize();

    let moving = false, run = false;
    if (riding) {
      const c = riding;
      const lonR = c.lon - (c.len / 2 - 0.6) / R / D;
      pos.copy(upAt(0.95, lonR)).multiplyScalar(R);
    } else if (!planet) {
      let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + joy.y;
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joy.x;
      if (auto) f = Math.max(f, 1);
      mv.copy(fwd).multiplyScalar(f).addScaledVector(right, s);
      if (mv.lengthSq() > 1) mv.normalize();
      run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(joy.x, joy.y) > 0.95;
      const speed = run ? 9 : 4.4;
      if (mv.lengthSq() > 0.001) {
        moving = true;
        mv.multiplyScalar(speed * dt);
        if (!tryStep(mv)) {
          const a = fwd.clone().multiplyScalar(mv.dot(fwd)), b = right.clone().multiplyScalar(mv.dot(right));
          if (!tryStep(a)) tryStep(b);
        }
      } else resolve(pos); // empurrado por carros e pelo trem
    }
    up.copy(pos).normalize();
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    right.crossVectors(fwd, up).normalize();
    bob += dt * (moving ? (run ? 13 : 8.5) : 0);

    // câmera em primeira pessoa
    back.copy(fwd).negate();
    m4.makeBasis(right, up, back);
    fpQuat.setFromRotationMatrix(m4).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    const eye = riding ? 2.1 : 1.65 + Math.sin(bob) * (moving ? 0.05 : 0);
    fpPos.copy(up).multiplyScalar(R + eye);

    // vista do planeta
    planetT = THREE.MathUtils.clamp(planetT + (planet ? dt : -dt) / 1.3, 0, 1);
    const e = planetT * planetT * (3 - 2 * planetT);
    if (planetT > 0) {
      orbPos.copy(orbitDir).multiplyScalar(orbitDist);
      m4.lookAt(orbPos, new THREE.Vector3(0, 0, 0), orbitUp); orbQuat.setFromRotationMatrix(m4);
      camera.position.lerpVectors(fpPos, orbPos, e);
      camera.quaternion.slerpQuaternions(fpQuat, orbQuat, e);
    } else { camera.position.copy(fpPos); camera.quaternion.copy(fpQuat); }
    pin.visible = planetT > 0.3;
    if (pin.visible) {
      pin.position.copy(up).multiplyScalar(R + 0.5 + Math.abs(Math.sin(t * 3)) * 1.5);
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
    scene.fog.far = THREE.MathUtils.lerp(raining ? 90 : 150, 4000, e);
    scene.fog.near = THREE.MathUtils.lerp(raining ? 10 : 30, 3000, e);
    return { moving, run };
  }

  // ─── céu ───
  const KEYS = [
    { s: -1, sky: 0x0e1430, sun: 0, sunC: 0xffffff, amb: 0.42, moon: 0.55, glow: 1 },
    { s: -0.12, sky: 0x1a2046, sun: 0, sunC: 0xff8a5c, amb: 0.48, moon: 0.5, glow: 1 },
    { s: 0.0, sky: 0x6b4a78, sun: 0.5, sunC: 0xff8a5c, amb: 0.62, moon: 0.2, glow: 0.85 },
    { s: 0.12, sky: 0xf0a860, sun: 1.7, sunC: 0xffb070, amb: 0.85, moon: 0, glow: 0.45 },
    { s: 0.35, sky: 0xa8d8e8, sun: 2.4, sunC: 0xfff1d6, amb: 1.0, moon: 0, glow: 0.18 },
    { s: 1, sky: 0x8fcbe6, sun: 2.6, sunC: 0xffffff, amb: 1.05, moon: 0, glow: 0.18 },
  ];
  const cA = new THREE.Color(), cB = new THREE.Color(), sky = new THREE.Color(), rainSky = new THREE.Color(0x7d8590), dim = new THREE.Color(0x3a3342);
  const sunDir = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3();
  function updateSky(dt) {
    hours += (hoursTarget - hours) * Math.min(1, dt * 1.5) + dt * 0.04; hoursTarget += dt * 0.04;
    const h = ((hours % 24) + 24) % 24;
    const ll = latLonOf(pos);
    eastAt(ll.lon, east); north.crossVectors(up, east).normalize();
    const th = ((h - 6) / 24) * Math.PI * 2;
    sunDir.copy(east).multiplyScalar(Math.cos(th)).addScaledVector(up, Math.sin(th) * 0.92).addScaledVector(north, -0.38).normalize();
    const s = up.dot(sunDir);
    let i = 0; while (i < KEYS.length - 2 && s > KEYS[i + 1].s) i++;
    const a = KEYS[i], b = KEYS[i + 1], f = THREE.MathUtils.clamp((s - a.s) / (b.s - a.s), 0, 1);
    const lerp = (x, y) => x + (y - x) * f;
    rainAmt += ((raining ? 1 : 0) - rainAmt) * Math.min(1, dt * 0.8);
    sky.copy(cA.set(a.sky)).lerp(cB.set(b.sky), f).lerp(rainSky, rainAmt * 0.55 * (s > -0.1 ? 1 : 0.3));
    scene.background = sky; scene.fog.color.copy(sky);
    sun.color.copy(cA.set(a.sunC)).lerp(cB.set(b.sunC), f);
    sun.intensity = lerp(a.sun, b.sun) * (1 - rainAmt * 0.6);
    sun.position.copy(sunDir).multiplyScalar(300);
    moon.position.copy(sunDir).multiplyScalar(-300);
    moon.intensity = lerp(a.moon, b.moon);
    amb.intensity = lerp(a.amb, b.amb);
    const g = lerp(a.glow, b.glow);
    glowMat.color.copy(dim).lerp(cA.set(0xffffff), g);
    stars.material.opacity = THREE.MathUtils.clamp(-s * 5, 0, 1) * (1 - rainAmt);
    stars.position.copy(camera.position);
    sunSp.position.copy(camera.position).addScaledVector(sunDir, 1200); sunSp.material.color.copy(sun.color); sunSp.visible = rainAmt < 0.7;
    moonSp.position.copy(camera.position).addScaledVector(sunDir, -1200); moonSp.visible = rainAmt < 0.7;
    sound.update(g > 0.8 ? 1 : 0, rainAmt);
    return h;
  }

  function updateRain(dt) {
    rain.visible = rainAmt > 0.05;
    if (!rain.visible) return;
    rain.material.opacity = 0.55 * rainAmt;
    const ll = latLonOf(pos);
    eastAt(ll.lon, east); const south = new THREE.Vector3().crossVectors(east, up);
    rain.matrix.makeBasis(east, up, south).setPosition(pos);
    const p = rain.geometry.attributes.position;
    for (let i = 0; i < DROPS; i++) {
      const s = rainSeed[i]; s[1] -= dt * 34; if (s[1] < 0) s[1] += 30;
      p.setXYZ(i * 2, s[0], s[1], s[2]); p.setXYZ(i * 2 + 1, s[0] - 0.05, s[1] + 0.8, s[2]);
    }
    p.needsUpdate = true;
  }

  function fmtHour(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

  // ─── laço ───
  const events = [];
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    events.length = 0;
    const tr = updateWorld(world, dt, t, up.copy(pos).normalize(), events);
    const { run } = step(dt);
    const h = updateSky(dt);
    updateRain(dt);

    // sons e avisos do trem
    const head = world.train.cars[0];
    _w.setFromMatrixPosition(head.group.matrix);
    const vol = Math.max(0, 1 - _w.distanceTo(pos) / 70);
    if (trainPrev.stopped && !tr.stopped) cfg.trainKind === 'tram' ? sound.bell(riding ? 1 : vol) : sound.horn(riding ? 1 : vol);
    if (!trainPrev.stopped && tr.stopped) {
      if (cfg.trainKind === 'tram') sound.bell(riding ? 0.7 : vol * 0.7);
      if (riding) { const s = cfg.stations[tr.station]; toast(s.deva, s.latin, cfg.trainKind === 'tram' ? 'Parada do bonde' : 'Estação'); }
    }
    trainPrev.stopped = tr.stopped;
    for (const ev of events) if (ev.type === 'honk' && cfg.id === 'kolkata') sound.honk(Math.max(0, 1 - ev.n.clone().multiplyScalar(R).distanceTo(pos) / 40));

    // marcos
    if (!riding && !planet) {
      let found = null;
      for (const lm of world.landmarks) if (up.dot(lm.n) > Math.cos(lm.r)) { found = lm; break; }
      if (found && found !== lastLm) toast(found.deva, found.latin, found.desc);
      if (found || (lastLm && up.dot(lastLm.n) < Math.cos(lastLm.r * 1.4))) lastLm = found;
    }

    // HUD
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('on'); }
    if (talkTimer > 0) { talkTimer -= dt; if (talkTimer <= 0) talkEl.classList.remove('on'); }
    let prompt = '';
    if (!planet) {
      if (riding) prompt = 'E — descer';
      else { const tg = target(); if (tg?.npc) prompt = `E — conversar (${tg.npc.role.who})`; else if (tg?.car) prompt = `E — subir no ${cfg.trainKind === 'tram' ? 'bonde' : 'trem'}`; }
    }
    promptEl.textContent = prompt; promptEl.classList.toggle('on', !!prompt && talkTimer <= 0);
    modeEl.textContent = planet ? 'Vista do planeta' : riding ? (cfg.trainKind === 'tram' ? 'No bonde' : 'No trem') : auto ? 'Andando sozinho' : run ? 'Correndo' : 'A pé';
    const ll = latLonOf(pos);
    coordsEl.textContent = `${fmtHour(h)} · ${Math.abs(ll.lat).toFixed(1)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(1)}°${ll.lon >= 0 ? 'L' : 'O'}`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // primeiro quadro atrás do cartão (compila shaders)
  step(0); updateSky(0); renderer.render(scene, camera);
  window.__game = { world, pos, fwd, action, info: () => ({ ...renderer.info.render, geo: renderer.info.memory.geometries }), setHours: (x) => { hours = hoursTarget = x; }, look: (dx, dy) => { lookDX += dx; lookDY += dy; }, keys };

  return {
    begin() {
      running = true; last = performance.now();
      requestAnimationFrame(frame);
      const s = cfg.stations[0];
      setTimeout(() => toast(cfg.script, `${cfg.latin} · ${s.latin}`, `Você está na plataforma. ${world.npcs.length} pessoas e ${world.buildings} prédios por aí.`), 400);
      if (!isTouch) canvas.requestPointerLock?.();
    },
  };
}
