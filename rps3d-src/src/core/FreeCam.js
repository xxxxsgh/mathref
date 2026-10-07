// Câmera livre de depuração (modo 'free'): WASD + mouse, Shift acelera,
// Space/Ctrl sobe/desce. Nenhum sistema controla a câmera nesse modo —
// cenários de captura costumam usá-lo para posicionar a câmera à mão.
import { Euler } from 'three/webgpu';

const e = new Euler(0, 0, 0, 'YXZ');
export function freeCam(ctx, dt) {
  if (ctx.mode !== 'free' || ctx.freeCamLocked) return;
  const { camera, input } = ctx;
  const l = input.takeLook();
  e.setFromQuaternion(camera.quaternion);
  e.y -= l.x * 0.0022;
  e.x = Math.max(-1.55, Math.min(1.55, e.x - l.y * 0.0022));
  e.z = 0;
  camera.quaternion.setFromEuler(e);
  const sp = (input.down('boost') ? 2000 : 40) * (ctx.freeCamSpeed || 1) * dt;
  camera.translateX(input.axis('moveX') * sp);
  camera.translateZ(-input.axis('moveY') * sp);
  camera.translateY(input.axis('vertical') * sp);
}
