/**
 * Textura procedural de sujeira de lente (manchas, gotas secas, poeira e
 * "bokeh" hexagonal suave). Gerada uma vez em canvas — nada baixado.
 * Só aparece onde o bloom é forte (sol, clarões, janelas estouradas).
 */
import * as THREE from 'three';

export function makeLensDirt(seed = 7, w = 640, h = 360) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';

  // manchas grandes e difusas (gordura/dedo)
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.09;
    gr.addColorStop(0, `rgba(255,245,230,${a})`);
    gr.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // gotas secas: anéis com borda mais clara
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 16;
    const gr = g.createRadialGradient(x, y, r * 0.55, x, y, r);
    const a = 0.05 + rnd() * 0.09;
    gr.addColorStop(0, `rgba(255,255,255,${a * 0.35})`);
    gr.addColorStop(0.8, `rgba(255,250,240,${a})`);
    gr.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // bokeh hexagonal muito suave
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 26;
    g.fillStyle = `rgba(220,235,255,${0.03 + rnd() * 0.05})`;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  }
  // poeira fina
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h;
    g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.1})`;
    g.fillRect(x, y, 1 + (rnd() < 0.2 ? 1 : 0), 1);
  }
  // fiapos (riscos curvos)
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`;
    g.beginPath();
    let x = rnd() * w, y = rnd() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      g.quadraticCurveTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20, x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
