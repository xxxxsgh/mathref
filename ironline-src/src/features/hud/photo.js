/**
 * Fotos do próprio mundo para a arte de perfil (calling cards, cartão de
 * evento, banner do passe) — no lugar de ilustrações genéricas.
 *
 * Como funciona: num frame qualquer, `pump()` (chamado no `frame` do HUD,
 * que roda ANTES do pipeline de render) move a câmera do jogador para a
 * pose da foto; o pipeline completo da feature rendering (céu, névoa, AO,
 * tonemap…) desenha esse frame; numa microtarefa logo depois do render —
 * ainda dentro do mesmo frame, antes de a tela ser composta — copiamos o
 * canvas. No frame seguinte o `syncCamera` do núcleo devolve a câmera.
 * Uma foto por frame; tudo acontece durante a tela de carga/menu.
 *
 * Gradação: normaliza a exposição (luminância média), dessatura de leve,
 * contraste suave, vinheta e grão fino — "foto de campo", não pôster.
 */
import { drawText } from './font.js';

export class Photos {
  static HOLD = 4;
  constructor(ctx) {
    this.ctx = ctx;
    this.queue = [];
    this.shots = new Map(); // chave → canvas graduado
    this.subs = [];
    this.busy = false;
  }

  /** pede uma foto; `pose` = { position:[x,y,z] (pés), yaw, pitch, fov } */
  want(key, pose) {
    if (this.shots.has(key) || this.queue.some((q) => q.key === key)) return;
    this.queue.push({ key, pose });
  }
  get(key) { return this.shots.get(key) || null; }
  /** fn(chave, canvas) quando cada foto fica pronta */
  onReady(fn) { this.subs.push(fn); }

  /** true enquanto há fotos pendentes ou em captura */
  get pending() { return this.busy || this.queue.length > 0; }

  /**
   * Chamado no `frame` do HUD (antes do pipeline). Cada foto segura a pose
   * por HOLD frames — o TAA/AO/exposição da feature rendering convergem —
   * e copia o canvas logo depois do render do último frame.
   */
  pump() {
    const ctx = this.ctx;
    if (!ctx.camera || !ctx.canvas) return;
    if (!this.job) {
      if (!this.queue.length) return;
      // só com o mundo carregado (senão a foto sai vazia)
      if (!ctx.services.world) { this.queue.length = 0; return; }
      this.job = this.queue.shift();
      this.job.n = 0;
      this.busy = true;
      this.vm0 = ctx.vm.visible;
    }
    const job = this.job;
    const cam = ctx.camera, THREE = ctx.THREE;
    const p = job.pose;
    const eye = ctx.player?.eyeHeight ?? 1.62;
    const fov0 = cam.fov;
    cam.position.set(p.position[0], p.position[1] + eye, p.position[2]);
    cam.quaternion.setFromEuler(new THREE.Euler(p.pitch || 0, p.yaw || 0, 0, 'YXZ'));
    if (p.fov) { cam.fov = p.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    ctx.vm.visible = false;
    job.n++;
    const last = job.n >= Photos.HOLD;
    // depois do pipeline deste frame (mesma tarefa → canvas ainda válido)
    Promise.resolve().then(() => {
      if (p.fov) { cam.fov = fov0; cam.updateProjectionMatrix(); }
      if (!last) return;
      try {
        const g = this.grade(ctx.canvas);
        if (g) {
          this.shots.set(job.key, g);
          for (const fn of this.subs) fn(job.key, g);
        }
      } catch (err) {
        console.warn('[hud] foto indisponível', err);
      } finally {
        this.job = null;
        this.busy = this.queue.length > 0;
        ctx.vm.visible = this.vm0;
      }
    });
  }

  grade(src) {
    const W = 960, H = Math.round((960 * src.height) / src.width);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 13) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
    const mean = sum / n;
    if (mean < 3) return null; // frame vazio
    // exposição: média alvo ~96/255 (fotos de jornal, sem estourar)
    const k = Math.min(2.2, Math.max(0.6, 96 / mean));
    let s = 77;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = d[i] * k, gg = d[i + 1] * k, b = d[i + 2] * k;
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        // dessatura 18% e puxa levemente para o neutro-quente
        r = l + (r - l) * 0.82 + 2; gg = l + (gg - l) * 0.82; b = l + (b - l) * 0.82 - 3;
        // contraste suave em S ao redor de 0.45
        const sc = (v) => { const t = Math.min(1, Math.max(0, v / 255)); return 255 * (t + (t - 0.45) * (1 - Math.abs(t - 0.45) * 2) * 0.18); };
        // vinheta + grão
        const nx = x / W - 0.5, ny = y / H - 0.5;
        const v = 1 - Math.min(0.42, (nx * nx + ny * ny) * 0.9);
        const gr = (rnd() - 0.5) * 7;
        d[i] = sc(r) * v + gr; d[i + 1] = sc(gg) * v + gr; d[i + 2] = sc(b) * v + gr;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

/**
 * Recorta uma foto (modo "cover", com ponto focal fx/fy em 0..1) num
 * canvas w×h e devolve data URL. `overlay(g, w, h)` desenha por cima
 * (degradês, títulos).
 */
export function cropPhoto(photo, w, h, { fx = 0.5, fy = 0.5, zoom = 1, overlay } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const s = Math.max(w / photo.width, h / photo.height) * zoom;
  const sw = w / s, sh = h / s;
  const sx = Math.min(photo.width - sw, Math.max(0, fx * photo.width - sw / 2));
  const sy = Math.min(photo.height - sh, Math.max(0, fy * photo.height - sh / 2));
  g.imageSmoothingQuality = 'high';
  g.drawImage(photo, sx, sy, sw, sh, 0, 0, w, h);
  overlay?.(g, w, h);
  return cv.toDataURL('image/jpeg', 0.9);
}

/**
 * Título sobre a foto: degradê escuro na base/esquerda e texto na fonte
 * própria — branco quente para o título, cinza para a linha de apoio.
 */
export function photoTitle(g, w, h, title, sub) {
  // leve escurecimento lateral para assentar emblemas/textos da UI
  const lg = g.createLinearGradient(0, 0, w, 0);
  lg.addColorStop(0, 'rgba(6,8,10,.42)');
  lg.addColorStop(0.55, 'rgba(6,8,10,.06)');
  lg.addColorStop(1, 'rgba(6,8,10,.3)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  if (!title) return;
  const bg = g.createLinearGradient(0, h * 0.35, 0, h);
  bg.addColorStop(0, 'rgba(6,8,10,0)');
  bg.addColorStop(1, 'rgba(6,8,10,.7)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const ts = Math.min(h * 0.17, (w * 0.7) / Math.max(1, title.length * 0.86));
  const x = Math.round(h * 0.12);
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = ts * 0.25;
  drawText(g, title, x, h * 0.2, { size: ts, weight: 1.9, tracking: 2.6, color: '#f3f0e8' });
  if (sub) drawText(g, sub, x + 1, h * 0.2 + ts * 1.5, { size: Math.min(h * 0.06, (w * 0.7) / Math.max(1, sub.length * 0.8)), weight: 1.6, tracking: 2.2, color: 'rgba(236,232,220,.8)' });
  g.shadowBlur = 0;
}
