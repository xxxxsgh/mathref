/**
 * Recuo e dispersão.
 *
 * Recuo: cada tiro soma o passo do padrão da arma a um DESLOCAMENTO de mira
 * (pitch/yaw). A câmera mostra esse deslocamento e as balas o seguem — o
 * jogador compensa puxando o mouse para baixo. Quando para de atirar, o
 * deslocamento volta a zero (recuperação), mas o que o jogador compensou
 * fica: é controle de spray de verdade, não animação.
 *
 * O "kick" não é instantâneo: entra em ~40 ms, o que deixa o spray legível.
 */
const DEG = Math.PI / 180;

export class RecoilSystem {
  constructor() {
    this.pitch = 0;
    this.yaw = 0;
    this.targetPitch = 0;
    this.targetYaw = 0;
    this.shotIndex = 0;
    this.sinceShot = 10;
    /** dispersão extra acumulada pelos tiros (bloom) */
    this.bloom = 0;
  }

  /**
   * @param {import('./WeaponData.js').WeaponDef} def
   * @param {() => number} rng
   */
  addShot(def, rng) {
    const pat = def.pattern;
    if (pat.length) {
      const [p, y] = pat[Math.min(Math.floor(this.shotIndex), pat.length - 1)];
      const jitter = 0.9 + rng() * 0.2;
      this.targetPitch += p * DEG * jitter;
      this.targetYaw += (y + (rng() - 0.5) * 0.12) * DEG;
    }
    this.shotIndex++;
    this.sinceShot = 0;
    this.bloom = Math.min(def.spreadMax, this.bloom + def.spreadPerShot);
  }

  /**
   * @param {number} dt
   * @param {import('./WeaponData.js').WeaponDef} def
   */
  update(dt, def) {
    this.sinceShot += dt;
    // kick entra rápido
    const a = 1 - Math.exp(-dt * 28);
    this.pitch += (this.targetPitch - this.pitch) * a;
    this.yaw += (this.targetYaw - this.yaw) * a;
    // recupera quando o spray para
    if (this.sinceShot > def.interval * 1.4) {
      const r = Math.exp(-dt * def.recoilRecover);
      this.targetPitch *= r;
      this.targetYaw *= r;
      if (this.sinceShot > 0.32) this.shotIndex = Math.max(0, this.shotIndex - dt * 30);
    }
    this.bloom = Math.max(0, this.bloom - def.spreadRecover * dt);
  }

  reset() {
    this.pitch = this.yaw = this.targetPitch = this.targetYaw = 0;
    this.shotIndex = 0;
    this.bloom = 0;
  }

  /**
   * Dispersão atual (raio do cone, em rad).
   * @param {import('./WeaponData.js').WeaponDef} def
   * @param {{ speed: number, grounded: boolean, crouching: boolean, sprinting: boolean, zoomed?: boolean }} s
   */
  spread(def, s) {
    let v = s.crouching ? def.spreadCrouch : def.spreadBase;
    v += Math.max(0, s.speed - 0.6) * def.spreadMove;
    if (!s.grounded) v += def.spreadAir;
    if (s.sprinting) v += def.spreadMove * 3;
    v += this.bloom;
    if (s.zoomed) v *= 0.08;
    return v;
  }
}
