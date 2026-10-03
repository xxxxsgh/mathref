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
const FOV_K = 0.48; // fator do FOV no menu (≈ lente de 60–70 mm)

export class Hero {
  constructor(ctx, host, { dist = 5.2, side = 0.55 } = {}) {
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
    const gy = ctx.collision?.groundHeight?.(x, z, 3) ?? pose.position[1] ?? 0;
    const y = Number.isFinite(gy) ? gy : 0;

    const e = en.spawn({ position: [x, y, z], yaw: 0, variant: 2 });
    const li = en.list?.indexOf(e) ?? -1;
    if (li >= 0) en.list.splice(li, 1);
    if (e.colliderId != null) ctx.collision.remove(e.colliderId);
    try { e.brain?.releaseCover?.(); } catch {}
    if (!e.anim?.update) throw new Error('animador do soldado indisponível');
    this.e = e;
    // de frente para a câmera, girado em 3/4
    this.baseYaw = Math.atan2(cx - x, cz - z) + 0.5;
    e.group.rotation.set(0, this.baseYaw, 0);
    if (e.group.parent !== ctx.scene) ctx.scene.add(e.group);
    const p = e.anim.p;
    p.speed = 0; p.aim = 0.1; p.aimYaw = -0.3; p.aimPitch = -0.06; p.crouch = 0; p.lean = 0;
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
    ctx.player.fovFactors.set('hud-menu', FOV_K);
    this.offset = new THREE.Vector3(0, -0.42, 0);
    ctx.player.viewOffset.add(this.offset);
    this.t = 0;
    this.ok = true;
  }

  render(dt) {
    if (!this.ok) return;
    this.t += dt;
    const e = this.e;
    // respiração / troca de apoio sutil (o animador cuida do idle)
    e.group.rotation.y = this.baseYaw + Math.sin(this.t * 0.25) * 0.03;
    e.anim.update(Math.min(dt, 1 / 20));
  }

  dispose() {
    if (!this.ok) return;
    this.ok = false;
    const ctx = this.ctx;
    try {
      ctx.player.fovFactors.delete('hud-menu');
      ctx.player.viewOffset.sub(this.offset);
      ctx.scene.remove(this.e.group);
      ctx.scene.remove(this.blob);
      this.blob.geometry.dispose();
      this.blob.material.dispose();
      this.tex.dispose();
    } catch {}
  }
}
