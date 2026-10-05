/**
 * Miniaturas dos mapas para o seletor (SVG esquemático, estilo carta
 * tática, vista de cima). Só o mapa carregado existe na cena — o outro não
 * pode ser fotografado — então os dois usam o mesmo desenho vetorial, para
 * ficarem consistentes. Mapa desconhecido: quarteirões sorteados pelo id.
 */
const BG = '#0e1215', ROAD = '#1a2024', WALK = '#2a3338', BLD = '#4a5a63', BLD2 = '#3a4850', EDGE = 'rgba(214,232,240,.55)', AMB = '#e2b45a';

const rect = (x, y, w, h, f, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`;
const bld = (x, y, w, h, light = false) => rect(x + 2, y + 2, w, h, 'rgba(0,0,0,.45)') + rect(x, y, w, h, light ? BLD : BLD2, `stroke="${EDGE}" stroke-width=".7"`);

function street() {
  let s = rect(0, 0, 200, 100, BG);
  // avenida (eixo longo na horizontal) + calçadas + cruzamento + ruela
  s += rect(0, 30, 200, 40, WALK) + rect(0, 37, 200, 26, ROAD);
  s += rect(118, 0, 22, 100, WALK) + rect(122, 0, 14, 100, ROAD);
  s += rect(58, 0, 6, 30, ROAD);
  s += `<path d="M0,50 H118 M140,50 H200" stroke="${AMB}" stroke-opacity=".6" stroke-width="1" stroke-dasharray="5 4"/>`;
  // quarteirões
  for (const [x, w] of [[4, 22], [30, 26], [66, 24], [94, 20], [146, 26], [176, 22]]) s += bld(x, 4, w, 22, x % 3 === 0);
  for (const [x, w] of [[4, 30], [38, 18], [60, 30], [94, 20], [146, 18], [168, 30]]) s += bld(x, 74, w, 22, x % 4 === 0);
  // prédio jogável R4 (contorno âmbar) + carros/barreiras
  s += rect(94, 74, 20, 22, 'none', `stroke="${AMB}" stroke-width="1.2" stroke-dasharray="3 2"`);
  for (const [x, y] of [[20, 40], [74, 54], [100, 41], [160, 55], [184, 42]]) s += rect(x, y, 9, 5, '#68757c', 'stroke="#0b0d0f" stroke-width=".6"');
  for (const x of [46, 50, 54]) s += rect(x, 47, 3, 6, '#8b8f86');
  // posto de controle
  s += `<path d="M150,37 V63" stroke="#c94c3c" stroke-width="2" stroke-dasharray="3 2"/>`;
  return s;
}

function factory() {
  let s = rect(0, 0, 200, 100, BG);
  // pátio (piso de concreto)
  s += rect(4, 4, 192, 92, '#1b2125');
  // galpão de máquinas com pórticos e ponte rolante
  s += rect(14, 10, 112, 64, '#33414a', `stroke="${EDGE}" stroke-width=".9"`);
  for (let x = 14; x <= 126; x += 14) s += `<path d="M${x},10 V74" stroke="rgba(214,232,240,.18)" stroke-width=".8"/>`;
  s += `<path d="M20,10 V74 M108,10 V74" stroke="${AMB}" stroke-opacity=".75" stroke-width="1.6"/>`; // trilhos da ponte
  s += rect(18, 38, 94, 4, AMB, 'fill-opacity=".55"'); // ponte rolante
  // máquinas no piso
  for (const [x, y, w, h] of [[30, 18, 16, 12], [56, 20, 12, 16], [80, 16, 18, 10], [36, 52, 14, 12], [70, 50, 20, 14]]) s += rect(x, y, w, h, '#56636a', 'stroke="#0b0d0f" stroke-width=".6"');
  // passarela oeste (tracejada) e ponte
  s += `<path d="M17,12 V72 M17,40 H124" stroke="#9fb4bf" stroke-width="1.4" stroke-dasharray="2 2"/>`;
  // escritórios de dois pisos (vidraça)
  s += bld(134, 10, 56, 30, true);
  for (let x = 138; x < 188; x += 8) s += rect(x, 13, 5, 3, 'rgba(160,200,220,.45)');
  // doca + carreta + contêineres
  s += rect(134, 48, 56, 8, '#2f3a40', `stroke="${EDGE}" stroke-width=".6"`);
  s += rect(140, 60, 34, 9, '#5b6168', 'stroke="#0b0d0f" stroke-width=".6"');
  for (const [x, y, c] of [[24, 82, '#7a3b27'], [52, 82, '#2f4f6b'], [80, 82, '#4a5a34'], [178, 62, '#7a3b27']]) s += rect(x, y, x > 170 ? 12 : 24, x > 170 ? 26 : 10, c, 'stroke="#0b0d0f" stroke-width=".6"');
  return s;
}

function generic(id) {
  let h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const r = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  let s = rect(0, 0, 200, 100, BG) + rect(0, 42, 200, 16, ROAD);
  for (let i = 0; i < 10; i++) s += bld(r() * 180, r() < 0.5 ? 4 + r() * 20 : 62 + r() * 18, 10 + r() * 22, 10 + r() * 14, r() < 0.5);
  return s;
}

export function mapThumb(id, w = 200, h = 100) {
  const body = id === 'street' ? street() : id === 'factory' ? factory() : generic(id);
  // grade de carta + rosa dos ventos mínima
  let grid = '';
  for (let x = 20; x < 200; x += 20) grid += `M${x},0 V100 `;
  for (let y = 20; y < 100; y += 20) grid += `M0,${y} H200 `;
  return `<svg width="${w}" height="${h}" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice">${body}<path d="${grid}" stroke="rgba(255,255,255,.05)" stroke-width=".6"/><g transform="translate(188,12)"><path d="M0,-7 L3,3 L0,1 L-3,3 Z" fill="${AMB}"/></g></svg>`;
}
