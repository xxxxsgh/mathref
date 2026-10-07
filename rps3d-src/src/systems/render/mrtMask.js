// Registro de materiais que NÃO devem gravar velocidade no MRT (partículas,
// feixes, trilhas — transparentes/aditivos). Com o MRT ativo, recebem
// mrtNode = mrt({velocity: vec4(0)}): alfa 0 → a mistura deixa o valor de
// velocidade do fundo intacto. Sem MRT, mrtNode precisa ser null (senão a
// saída do material vira só a velocidade).
import { mrt, vec4 } from 'three/tsl';

const mats = new Set();
let active = false;

export function maskVelocity(material) {
  mats.add(material);
  material.mrtNode = active ? mrt({ velocity: vec4(0) }) : null;
  return material;
}

export function setVelocityMRT(on) {
  active = on;
  for (const m of mats) {
    m.mrtNode = on ? mrt({ velocity: vec4(0) }) : null;
    m.needsUpdate = true;
  }
}

export function forget(material) {
  mats.delete(material);
}
