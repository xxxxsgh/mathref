/**
 * Camuflagens da arma primária (progressão): padrões PROCEDURAIS pintados
 * em canvas (tileáveis) e aplicados pelos materiais que a feature weapon
 * publica em `services.weapon.materials` — sem tocar na pasta weapon.
 *
 * Como: encadeia o `onBeforeCompile` existente do material (o detalhe
 * triplanar da weapon, que declara `vWObj`/`vWObjN` = posição/normal no
 * espaço do objeto) e injeta, ANTES do bloco de desgaste, uma amostragem
 * triplanar da camuflagem que substitui a cor base — o desgaste de quina,
 * a sujeira e os arranhões da weapon continuam por cima. Se o shader não
 * tiver essas variáveis (a weapon mudou), cai para um tom sólido na cor
 * média do padrão. `customProgramCacheKey` ganha o id da camuflagem.
 *
 * Materiais pintados: `receiver` (receptor/trilhos superiores) e `tan`
 * (guarda-mão e coronha) — é onde uma pintura de arma de verdade vai.
 */
export const CAMO_TARGETS = ['tan', 'receiver'];

/** Paletas e desenho de cada padrão (cores em sRGB). */
const PAT = {
  woodland: { base: '#4a4f36', cols: ['#2b2f22', '#6b5a3c', '#1d1f19', '#7b7a52'], kind: 'blob', scale: 1 },
  digital: { base: '#6b6e6c', cols: ['#3e4142', '#8d908c', '#24272a', '#575b5c'], kind: 'pixel', scale: 1 },
  tiger: { base: '#6a6a48', cols: ['#22231b', '#3d4029', '#8a8358'], kind: 'stripe', scale: 1 },
  arctic: { base: '#c9cdcf', cols: ['#8e9599', '#e8eaea', '#5d6468'], kind: 'pixel', scale: 1.4 },
  ember: { base: '#2a1d18', cols: ['#7a2a14', '#c8551e', '#120e0d', '#e39a3c'], kind: 'blob', scale: 0.8 },
  gilded: { base: '#8f6b2c', cols: ['#c79d48', '#5c4219', '#e6c77a'], kind: 'flow', scale: 1 },
};

let _rng = 1;
const rnd = () => ((_rng = (_rng * 16807) % 2147483647) / 2147483647);

/** Desenha o padrão num canvas `n×n` tileável. */
export function camoCanvas(id, n = 256) {
  const p = PAT[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  if (!p) return cv;
  _rng = 7 + id.length * 131;
  g.fillStyle = p.base;
  g.fillRect(0, 0, n, n);
  // desenha com wrap (cada forma repetida nos 9 vizinhos) → tileável
  const wrap = (fn) => { for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  if (p.kind === 'blob' || p.kind === 'flow') {
    for (const [ci, c] of p.cols.entries()) {
      const count = p.kind === 'flow' ? 7 : 16 - ci * 2;
      for (let k = 0; k < count; k++) {
        const cx = rnd() * n, cy = rnd() * n, r = (p.kind === 'flow' ? 30 : 18 + rnd() * 26) * p.scale;
        const pts = [];
        const m = 9;
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2;
          const rr = r * (0.55 + rnd() * 0.7);
          pts.push([cx + Math.cos(a) * rr * (p.kind === 'flow' ? 2.4 : 1.3), cy + Math.sin(a) * rr * 0.8]);
        }
        wrap(() => {
          g.fillStyle = c;
          g.beginPath();
          // curva suave pelos pontos médios
          for (let i = 0; i <= m; i++) {
            const a = pts[i % m], b = pts[(i + 1) % m];
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            if (i === 0) g.moveTo(mx, my);
            else g.quadraticCurveTo(a[0], a[1], mx, my);
          }
          g.fill();
        });
      }
    }
  } else if (p.kind === 'pixel') {
    const s = Math.round(8 * p.scale);
    for (const c of p.cols) {
      for (let k = 0; k < 26; k++) {
        let x = Math.floor(rnd() * (n / s)) * s, y = Math.floor(rnd() * (n / s)) * s;
        const len = 4 + Math.floor(rnd() * 9);
        g.fillStyle = c;
        for (let i = 0; i < len; i++) {
          wrap(() => g.fillRect(x, y, s, s));
          if (rnd() < 0.5) x += s * (rnd() < 0.5 ? 1 : -1);
          else y += s * (rnd() < 0.5 ? 1 : -1);
          x = (x + n) % n; y = (y + n) % n;
        }
      }
    }
  } else if (p.kind === 'stripe') {
    for (const [ci, c] of p.cols.entries()) {
      for (let k = 0; k < 9 - ci * 2; k++) {
        const y0 = rnd() * n, th = 5 + rnd() * 9, amp = 6 + rnd() * 10, ph = rnd() * 6;
        wrap(() => {
          g.fillStyle = c;
          g.beginPath();
          for (let x = 0; x <= n; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.045 + ph) * amp - th * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.07 + ph))));
          for (let x = n; x >= 0; x -= 8) g.lineTo(x, y0 + Math.sin(x * 0.045 + ph) * amp + th * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.05 + ph * 2))));
          g.fill();
        });
      }
    }
  }
  // granulado de impressão
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() - 0.5) * 14;
    img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Amostra de UI (data URL) para o seletor de camuflagem do loadout. */
const _sw = new Map();
export function camoSwatch(id, n = 96) {
  if (id === 'none') return '';
  if (!_sw.has(id)) _sw.set(id, camoCanvas(id, n).toDataURL('image/png'));
  return _sw.get(id);
}

const avg = (id) => {
  const p = PAT[id];
  return p ? p.base : null;
};

/**
 * Aplica a camuflagem `id` ('none' = acabamento de fábrica) nos materiais
 * publicados pela weapon. Retorna true se aplicou por shader, 'tint' se
 * caiu para tom sólido, false se a weapon não publica materiais.
 */
export function applyCamo(THREE, weapon, id) {
  const M = weapon?.materials;
  if (!M) return false;
  let mode = true;
  for (const key of CAMO_TARGETS) {
    const mat = M[key];
    if (!mat) continue;
    const ud = (mat.userData.hudCamo ||= {
      prev: mat.onBeforeCompile,
      key: mat.customProgramCacheKey?.bind(mat),
      color: mat.color.clone(),
      uni: { tHudCamo: { value: null }, uHudCamo: { value: 0 }, uHudCamoScale: { value: 7.5 } },
      ok: null,
    });
    if (ud.tex) ud.tex.dispose();
    ud.tex = null;
    mat.color.copy(ud.color);
    if (id && id !== 'none' && PAT[id]) {
      const t = new THREE.CanvasTexture(camoCanvas(id, 256));
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      ud.tex = t;
      ud.uni.tHudCamo.value = t;
      ud.uni.uHudCamo.value = 1;
      if (ud.ok === false) {
        // shader incompatível: tom sólido
        mat.color.set(avg(id)).multiplyScalar(0.8);
        mode = 'tint';
      }
    } else {
      ud.uni.uHudCamo.value = 0;
    }
    if (!ud.wrapped) {
      ud.wrapped = true;
      mat.onBeforeCompile = (sh, r) => {
        ud.prev?.call(mat, sh, r);
        const fs = sh.fragmentShader;
        if (!/varying vec3 vWObj;/.test(fs) || !/varying vec3 vWObjN;/.test(fs) || !fs.includes('#include <map_fragment>')) {
          ud.ok = false;
          return;
        }
        ud.ok = true;
        Object.assign(sh.uniforms, ud.uni);
        sh.fragmentShader = fs
          .replace('varying vec3 vWObjN;', 'varying vec3 vWObjN;\nuniform sampler2D tHudCamo;\nuniform float uHudCamo, uHudCamoScale;')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
  if (uHudCamo > 0.5) {
    vec3 cN = normalize(vWObjN);
    vec3 cb = pow(abs(cN), vec3(4.0)); cb /= (cb.x + cb.y + cb.z);
    vec3 cp = vWObj * uHudCamoScale;
    vec3 cc = texture(tHudCamo, cp.zy).rgb * cb.x + texture(tHudCamo, cp.xz).rgb * cb.y + texture(tHudCamo, cp.xy).rgb * cb.z;
    diffuseColor.rgb = cc * 0.92;
  }`,
          );
      };
      mat.customProgramCacheKey = () => (ud.key ? ud.key() : '') + '|hudcamo';
      // recompila UMA vez; depois trocar de camuflagem só mexe nos uniforms
      mat.needsUpdate = true;
    }
  }
  return mode;
}
