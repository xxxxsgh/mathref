// Presets de screenshot do sistema deepspace (?shot=<nome>).
// Cada um põe o jogo num estado representativo: sistema, posição/orientação
// da câmera (origem flutuante: escrevemos camWorld + camera.quaternion) e
// efeitos ligados. `state.shotCam` é chamado todo frame (câmera em movimento).
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();

/** Orienta a câmera de `from` olhando para `to` (mundo), com `up`. */
export function aim(ctx, from, to, up = new THREE.Vector3(0, 1, 0), roll = 0) {
  ctx.player.camWorld.copy(from);
  ctx.player.pos.copy(from);
  const dir = to.clone().sub(from).normalize();
  _m.lookAt(new THREE.Vector3(), dir, up);
  ctx.camera.quaternion.setFromRotationMatrix(_m);
  if (roll) ctx.camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  ctx.camera.updateMatrixWorld();
}

function useSystem(ctx, id) {
  if (ctx.universe.systemId !== id) ctx.universe.setSystem(id);
  return ctx.universe.system;
}

/** Mantém a câmera do shot (outros sistemas podem tentar mexer). */
function hold(state, ctx, from, to, up, roll, vel = null) {
  const pos = from.clone();
  state.shotCam = (dt, c) => {
    if (vel) { pos.addScaledVector(vel, dt); to = to.clone().addScaledVector(vel, dt); }
    aim(c, pos, to, up, roll);
    if (vel) c.player.vel.copy(vel);
  };
  aim(ctx, from, to, up, roll);
}

/** Lente mais limpa nos quadros de apresentação (menos fantasmas do flare). */
function flareSoft(c) { c.services.rendering?.setFlare?.({ ghosts: 0.12 }); }

export function registerShots(ctx, state, api) {
  const reg = (name, fn) => ctx.shots.register(name, async (c) => {
    c.game.setMode('cinematic', { shot: name });
    await fn(c);
  });

  // Kessa — Fenda de Órion: nebulosa roxa/azul dominando o céu, estrela amarela
  // e Verídia em crescente em primeiro plano; os outros planetas ao longe.
  reg('deepspace-kessa', async (c) => {
    const sys = useSystem(c, 'kessa');
    const ver = sys.bodies.find((b) => b.name === 'Verídia');
    const R = ver.radius;
    const up = new THREE.Vector3(0, 1, 0);
    const toStar = sys.star.pos.clone().sub(ver.pos).normalize();
    // câmera atrás do terminador: Verídia em crescente gordo, sol na outra ponta do quadro
    const k = c.params;
    const ang = THREE.MathUtils.degToRad(Number(k.get('ang') || 110));
    const dist = Number(k.get('dist') || 3.8);
    const camDir = toStar.clone().applyAxisAngle(up, ang).normalize();
    const from = ver.pos.clone().addScaledVector(camDir, R * dist).addScaledVector(up, R * Number(k.get('up') || 0.55));
    const toPlanet = ver.pos.clone().sub(from).normalize();
    const mixK = Number(k.get('mix') || 0.36);
    const lookDir = toPlanet.clone().multiplyScalar(1 - mixK).addScaledVector(toStar, mixK).normalize();
    hold(state, c, from, from.clone().add(lookDir), up, Number(k.get('roll') || 0.12));
    flareSoft(c);
  });

  // Buraco negro com disco de acreção e lente gravitacional
  reg('deepspace-blackhole', async (c) => {
    const id = c.universe.galaxy.systems.find((s) => s.starType === 'black_hole' && s.nebula)?.id
      || c.universe.galaxy.systems.find((s) => s.starType === 'black_hole').id;
    const sys = useSystem(c, id);
    const acc = sys.star.accretion;
    const n = state.bh?.normal.clone() || new THREE.Vector3(0, 1, 0);
    const dist = sys.star.radius * Number(c.params.get('bhd') || 34);
    const dir = new THREE.Vector3(0.82, 0, 0.57).projectOnPlane(n).normalize()
      .applyAxisAngle(n, THREE.MathUtils.degToRad(Number(c.params.get('bha') || -14)));
    const from = dir.clone().multiplyScalar(dist).addScaledVector(n, dist * Number(c.params.get('bhe') || 0.12));
    const look = sys.star.pos.clone().addScaledVector(n, -acc.outer * 0.05);
    hold(state, c, from, look, n, 0.0);
  });

  // Dentro do Cinturão da Fenda, perto do Refúgio Cinza: um colosso em
  // primeiro plano com luz de recorte do sol e o campo sumindo na distância.
  reg('deepspace-belt', async (c) => {
    useSystem(c, 'kessa');
    const a = 2.04, R = 1.535e7;
    const probe = new THREE.Vector3(Math.cos(a) * R, 3000, Math.sin(a) * R);
    // o maior asteroide perto da sonda vira o herói do quadro
    const near = api.asteroidsNear(probe, 60000);
    const hero = near.filter((x) => x.radius > 700).sort((x, y) => y.radius - x.radius)[0] || near[0];
    const toStar = hero.pos.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(toStar, new THREE.Vector3(0, 1, 0)).normalize();
    // câmera do lado do sol (fase ~45°): faces iluminadas com sombras longas,
    // o campo atrás do herói aceso e sumindo na névoa do cinturão
    const Rh = hero.radius;
    const ph = THREE.MathUtils.degToRad(Number(c.params.get('ph') || 78));
    const camDir = toStar.clone().multiplyScalar(Math.cos(ph)).addScaledVector(side, Math.sin(ph)).normalize();
    const from = hero.pos.clone().addScaledVector(camDir, Rh * 3.1).add(new THREE.Vector3(0, Rh * 0.6, 0));
    const look = hero.pos.clone().addScaledVector(side, -Rh * 0.6).addScaledVector(toStar, -Rh * 0.9);
    hold(state, c, from, look, new THREE.Vector3(0, 1, 0), -0.1);
  });

  // Viagem quântica em direção a Verídia
  reg('deepspace-quantum', async (c) => {
    const sys = useSystem(c, 'kessa');
    const ver = sys.bodies.find((b) => b.name === 'Verídia');
    const ash = sys.bodies.find((b) => b.name === 'Ashar');
    const dir = ver.pos.clone().sub(ash.pos).normalize();
    const from = ash.pos.clone().lerp(ver.pos, 0.35).add(new THREE.Vector3(0, 2e5, 0));
    const vel = dir.clone().multiplyScalar(2.0e6);
    hold(state, c, from, from.clone().add(dir.clone().multiplyScalar(1e6)).add(new THREE.Vector3(0, -1.2e5, 0)), new THREE.Vector3(0, 1, 0), 0.05, vel);
    c.bus.emit('quantum:start', { target: ver.id, dir });
    state.warp?.skipSpool?.();
  });

  // Salto entre sistemas (túnel de hiperespaço)
  reg('deepspace-jump', async (c) => {
    const sys = useSystem(c, 'halden');
    const from = new THREE.Vector3(9.0e6, 4e5, -1.9e6);
    const dir = new THREE.Vector3(-0.3, 0.05, -1).normalize();
    hold(state, c, from, from.clone().addScaledVector(dir, 1e6), new THREE.Vector3(0, 1, 0), 0, dir.clone().multiplyScalar(3e5));
    api.jumpFx('start', { to: 'kessa', skipCharge: true });
  });

  // Céu de Halden (abertura): núcleo hegemônico, Via Láctea brilhante
  reg('deepspace-halden', async (c) => {
    const sys = useSystem(c, 'halden');
    const aurora = sys.bodies.find((b) => b.name === 'Aurora');
    const up = new THREE.Vector3(0, 1, 0);
    // câmera sobre o terminador de Aurora: metade dia (mar, nuvens, brilho do
    // sol no oceano), metade noite com as luzes da colônia; o sol no limbo
    const R = aurora.radius;
    const sA = sys.star.pos.clone().sub(aurora.pos).normalize();
    const camDir = sA.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(Number(c.params.get('ang') || 96))).normalize();
    const from = aurora.pos.clone().addScaledVector(camDir, R * 3.3).addScaledVector(up, R * 0.5);
    const toA = aurora.pos.clone().sub(from).normalize();
    const toS = sys.star.pos.clone().sub(from).normalize();
    const lookDir = toA.clone().multiplyScalar(0.7).addScaledVector(toS, 0.3).addScaledVector(up, 0.06).normalize();
    hold(state, c, from, from.clone().add(lookDir), up, 0.06);
    flareSoft(c);
  });

  // Tempestade de íons
  reg('deepspace-ionstorm', async (c) => {
    const sys = useSystem(c, 'kessa');
    const s = state.storms?.list?.[0];
    if (!s) return;
    state.storms.forceBolt = true; // quadro com descarga ativa
    const from = s.pos.clone().add(new THREE.Vector3(s.radius * 1.9, s.radius * 0.25, s.radius * 0.8));
    hold(state, c, from, s.pos.clone(), new THREE.Vector3(0, 1, 0), 0.05);
  });

  // Campo de destroços (restos da batalha perto do Refúgio Cinza)
  reg('deepspace-debris', async (c) => {
    useSystem(c, 'kessa');
    const f = state.debris?.fields.find((x) => x.id.includes('refugio')) || state.debris?.fields[0];
    if (!f) return;
    const ps = state.debris.pieces(f);
    const big = ps.filter((p) => p.size > 25)[0] || ps[0];
    const toStar = big.pos.clone().negate().normalize();
    const side = new THREE.Vector3().crossVectors(toStar, new THREE.Vector3(0, 1, 0)).normalize();
    const from = big.pos.clone().addScaledVector(side, big.size * 3.2).addScaledVector(toStar, big.size * 1.5).add(new THREE.Vector3(0, big.size * 0.8, 0));
    hold(state, c, from, big.pos.clone().addScaledVector(side, -big.size * 2), new THREE.Vector3(0, 1, 0), 0.1);
  });

  // Debug: ?shot=deepspace-look&sys=kessa&from=x,y,z&dir=x,y,z
  reg('deepspace-look', async (c) => {
    const p = c.params;
    useSystem(c, p.get('sys') || 'kessa');
    const v = (s, d) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : d);
    const from = v(p.get('from'), new THREE.Vector3(1.03e7, 2.4e5, 3.78e6));
    const dir = v(p.get('dir'), new THREE.Vector3(0, 0, -1)).normalize();
    hold(state, c, from, from.clone().add(dir), new THREE.Vector3(0, 1, 0), 0);
  });
}
