// Paletas de superfície por bioma (sRGB → linear na hora de virar uniform).
// Cada corpo deriva variações a partir do seed (dois planetas do mesmo bioma
// nunca têm exatamente o mesmo tom), mantendo a identidade visual do bioma.
import * as THREE from 'three/webgpu';
import { Rng } from '../../core/Rng.js';

const BASE = {
  // exuberante: prados teal e dourados, florestas azul-esverdeadas com
  // manchas violeta (vegetação alienígena), rocha cinza-ocre, areia clara
  lush: {
    deep: '#03182c', shallow: '#0f6f7c', sand: '#cdbb8e', seabed: '#3d5a52',
    lowA: '#4d7f34', lowB: '#8a9a3c', forest: '#173f33', alien: '#4b2a63',
    rock: '#5f574f', rock2: '#8b8174', high: '#7b7a6a', snow: '#eef3f6', wet: '#22402a', glow: '#55ffd0',
  },
  ocean: {
    deep: '#021a33', shallow: '#0d8a9a', sand: '#e6d6a6', seabed: '#2f6a6a',
    lowA: '#3b8a43', lowB: '#7fa54a', forest: '#14462c', alien: '#2b5a4a',
    rock: '#5a544e', rock2: '#8a8070', high: '#6f6a5a', snow: '#f2f5f8', wet: '#1f4a30', glow: '#ffd27a',
  },
  toxic: {
    deep: '#1f2c06', shallow: '#7fa21a', sand: '#7d7a3a', seabed: '#3a4012',
    lowA: '#6f8f1c', lowB: '#b7c43a', forest: '#2a3510', alien: '#5c1f6e',
    rock: '#3e3a2c', rock2: '#5d553a', high: '#4f4a36', snow: '#c8d49a', wet: '#2c3a0e', glow: '#b6ff3a',
  },
  // desértico: dunas laranja, mesetas com estratos vermelho/ocre/creme
  desert: {
    deep: '#5a2c18', shallow: '#8a4a26', sand: '#d68a45', seabed: '#e8c28a',
    lowA: '#c97a3e', lowB: '#e3b27a', forest: '#7a3a22', alien: '#b5562c',
    rock: '#8e4426', rock2: '#c6834e', high: '#e6c08e', snow: '#efe2c8', wet: '#4a2414', glow: '#ff9a40',
  },
  // gelado: neve, gelo azul, gretas profundas, rocha escura
  ice: {
    deep: '#0d2c4a', shallow: '#2e6f9e', sand: '#cfdbe4', seabed: '#7fa8c4',
    lowA: '#e9f0f6', lowB: '#c9dbe8', forest: '#7cb6dc', alien: '#3f86bd',
    rock: '#2d343e', rock2: '#55606c', high: '#f6f9fc', snow: '#ffffff', wet: '#1b5a8a', glow: '#9fe8ff',
  },
  // vulcânico: basalto, cinza, enxofre, ferrugem, lava
  volcanic: {
    deep: '#0c0a0a', shallow: '#1a1312', sand: '#3a3330', seabed: '#2a201c',
    lowA: '#1b1716', lowB: '#3d3633', forest: '#5a3a24', alien: '#a8932c',
    rock: '#141111', rock2: '#2a2321', high: '#4d4642', snow: '#77706a', wet: '#0a0808', glow: '#ff5a14',
  },
  // morto/irradiado: regolito, mares escuros, ejeção clara
  dead: {
    deep: '#1c1b1a', shallow: '#2a2826', sand: '#6d6862', seabed: '#3a3735',
    lowA: '#5f5a55', lowB: '#7e7870', forest: '#3a3633', alien: '#4c4741',
    rock: '#433f3b', rock2: '#6a645d', high: '#9a948a', snow: '#c4beb4', wet: '#262422', glow: '#6fd0ff',
  },
  gas: {
    deep: '#c9a27a', shallow: '#8a5a3a', sand: '#e8d2b0', seabed: '#6a7fa8',
    lowA: '#f2e6d0', lowB: '#b0784c', forest: '#5a3a2a', alien: '#d9b98a',
    rock: '#7a5236', rock2: '#e0c8a0', high: '#a8b8d0', snow: '#fff4e0', wet: '#4a2f22', glow: '#ffffff',
  },
};

/** Paleta linear (THREE.Color) com variação leve por seed. */
export function paletteFor(body) {
  const base = BASE[body.type] || BASE.dead;
  const r = new Rng((body.seed ^ 0x9e37) >>> 0);
  const hueJ = (body.type === 'gas' ? 0.04 : 0.025);
  const out = {};
  for (const [k, hex] of Object.entries(base)) {
    const c = new THREE.Color(hex);
    const hsl = {}; c.getHSL(hsl);
    c.setHSL((hsl.h + r.range(-hueJ, hueJ) + 1) % 1, Math.min(1, hsl.s * r.range(0.9, 1.1)), hsl.l * r.range(0.94, 1.06));
    out[k] = c; // Color.setHSL trabalha no espaço de trabalho (linear) já convertido do hex sRGB
  }
  return out;
}
