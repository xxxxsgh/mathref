/**
 * Operador do menu principal ("hero shot") NO PRÓPRIO MUNDO.
 *
 * Em vez de um recorte iluminado em estúdio sobre um fundo desfocado, o
 * soldado (criado por `services.enemies.spawn` e retirado da IA/colisão)
 * fica de pé na rua, na frente da câmera do menu: recebe o sol, a sombra,
 * a AO, a névoa e a gradação do pipeline da feature rendering — a UI é que
 * fica por cima de uma cena 3D viva.
 *
 * Enquadramento de "teleobjetiva" pelos canais aditivos do jogador:
 * `fovFactors` (aperta o FOV → perspectiva comprimida, fundo maior e mais
 * enevoado) e `viewOffset` (câmera mais baixa, à altura do peito). Uma
 * sombra de contato discreta (decalque radial) assenta os pés no chão.
 *
 * Geometria/material são os compartilhados da feature enemies — nada é
 * descartado aqui além do decalque.
 */
const HERO_VFOV = 26; // FOV vertical do menu em graus (≈ lente de 85 mm em full frame)
const EYE_DROP = 1.15; // câmera desce até a altura da cintura (contra-plongée leve)

export class Hero {
  constructor(ctx, host, { dist = 6.1, side = 0.3 } = {}) {
    const THREE = ctx.THREE;
    const en = ctx.services.enemies;
    if (!en?.spawn) throw new Error('serviço enemies indisponível');
    this.ctx = ctx;
    const pose = ctx.shotPose('menu');
    if (!pose) throw new Error('pose do menu indisponível');
    // ── posição: à frente da câmera do menu, levemente à direita do centro
    const yaw = pose.yaw || 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // frente
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // direita
    const cx = pose.position[0], cz = pose.position[2];
    let x = cx + fx * dist + rx * side, z = cz + fz * dist + rz * side;
    // chão a partir da altura da câmera (o menu da FOUNDRY 9 fica numa passarela)
    const gy = ctx.collision?.groundHeight?.(x, z, (pose.position[1] || 0) + 3) ?? pose.position[1] ?? 0;
    const y = Number.isFinite(gy) ? gy : 0;

    const e = en.spawn({ position: [x, y, z], yaw: 0, variant: 2 });
    const li = en.list?.indexOf(e) ?? -1;
    if (li >= 0) en.list.splice(li, 1);
    if (e.colliderId != null) ctx.collision.remove(e.colliderId);
    try { e.brain?.releaseCover?.(); } catch {}
    if (!e.anim?.update) throw new Error('animador do soldado indisponível');
    this.e = e;
    // de frente para a câmera, girado em 3/4 PARA O SOL: o lado iluminado
    // do rosto/peito fica voltado para a lente (key natural, sem luz falsa)
    const toCam = Math.atan2(cx - x, cz - z);
    let turn = 0.5;
    const sun = ctx.services.world?.sun;
    if (sun) {
      const sx = sun.position.x - sun.target.position.x, sz = sun.position.z - sun.target.position.z;
      const toSun = Math.atan2(sx, sz);
      const d = Math.atan2(Math.sin(toSun - toCam), Math.cos(toSun - toCam));
      // sempre 3/4 (nunca de frente chapado), para o lado do sol
      turn = (d < 0 ? -1 : 1) * Math.max(0.5, Math.min(0.75, Math.abs(d) * 0.6));
    }
    this.baseYaw = toCam + turn;
    e.group.rotation.set(0, this.baseYaw, 0);
    if (e.group.parent !== ctx.scene) ctx.scene.add(e.group);
    const p = e.anim.p;
    p.speed = 0; p.aim = 0; p.aimYaw = -0.35; p.aimPitch = -0.06; p.crouch = 0; p.lean = 0;
    e.anim.update(0.5);
    e.anim.applyModelPose?.();

    // ── sombra de contato: disco radial escuro sob os pés
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.62)');
    gr.addColorStop(0.35, 'rgba(0,0,0,.38)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.tex = new THREE.CanvasTexture(cv);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.9),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.rotation.z = this.baseYaw;
    this.blob.position.set(x, y + 0.012, z);
    this.blob.renderOrder = 1;
    ctx.scene.add(this.blob);

    // ── lente: FOV mais fechado + câmera à altura do peito
    this.setLens();
    this.lowerEye();
    // profundidade de campo: o fundo (fora de uma elipse em volta do
    // operador) é desfocado por um backdrop-filter mascarado; a máscara
    // acompanha a projeção do soldado na tela
    this.dof = host.parentElement?.querySelector('.dof') || null;
    this._v = new THREE.Vector3();
    this.t = 0;
    this.ok = true;
  }

  /** FOV fixo do menu, qualquer que seja o FOV configurado pelo jogador */
  setLens() {
    const p = this.ctx.player;
    p.fovFactors.set('hud-menu', HERO_VFOV / (p.baseFov || 72));
  }

  /**
   * Câmera mais baixa: o canal viewOffset é REESCRITO por inteiro a cada
   * frame pela feature movement (bob) — somamos a queda depois dela (o HUD
   * roda por último). Se ninguém reescreveu desde a última soma, não soma
   * de novo (sem acumular quando a movement não está carregada).
   */
  lowerEye() {
    const vo = this.ctx.player.viewOffset;
    if (this._left !== undefined && Math.abs(vo.y - this._left) < 1e-9) return;
    vo.y -= EYE_DROP;
    this._left = vo.y;
  }

  render(dt) {
    if (!this.ok) return;
    this.setLens();
    this.lowerEye();
    this.t += dt;
    const e = this.e;
    // respiração / troca de apoio sutil (o animador cuida do idle)
    e.group.rotation.y = this.baseYaw + Math.sin(this.t * 0.25) * 0.03;
    e.anim.update(Math.min(dt, 1 / 20));
    this.placeDof();
  }

  placeDof() {
    if (!this.dof) return;
    const cam = this.ctx.camera, v = this._v, g = this.e.group.position;
    const sp = (y) => {
      v.set(g.x, g.y + y, g.z).project(cam);
      return [(v.x * 0.5 + 0.5) * 100, (0.5 - v.y * 0.5) * 100];
    };
    const [fx, fy] = sp(0), [, hy] = sp(1.9);
    const cx = fx, cy = (fy + hy) / 2, ry = Math.max(8, (fy - hy) * 0.75);
    const key = cx.toFixed(1) + cy.toFixed(1) + ry.toFixed(1);
    if (key === this._dk) return;
    this._dk = key;
    const m = `radial-gradient(ellipse ${(ry * 0.42).toFixed(1)}% ${ry.toFixed(1)}% at ${cx.toFixed(1)}% ${cy.toFixed(1)}%, transparent 55%, #000 100%)`;
    this.dof.style.webkitMaskImage = m;
    this.dof.style.maskImage = m;
    this.dof.style.opacity = 1;
  }

  dispose() {
    if (!this.ok) return;
    this.ok = false;
    const ctx = this.ctx;
    try {
      ctx.player.fovFactors.delete('hud-menu');
      const vo = ctx.player.viewOffset;
      if (this._left !== undefined && Math.abs(vo.y - this._left) < 1e-9) vo.y += EYE_DROP;
      ctx.scene.remove(this.e.group);
      ctx.scene.remove(this.blob);
      this.blob.geometry.dispose();
      this.blob.material.dispose();
      this.tex.dispose();
    } catch {}
  }
}
