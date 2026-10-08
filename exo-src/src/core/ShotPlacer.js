/**
 * Aplica um preset de screenshot: modo, posição (lat/lon/alt ou âncora num
 * corpo celeste), hora local, rumo (número ou "olhar para" um corpo),
 * inclinação (número ou relativa ao horizonte geométrico), FOV e clima.
 */
import { Vector3 } from 'three';
import { latLonFromDir, tangentFrame, headingOf, elevationOf, horizonDip } from './Geo.js';

const _v = new Vector3();

export function findBody(ctx, q) {
  const uni = ctx.services.universe;
  if (!uni || !q) return null;
  return uni.findBody?.(q) || uni.bodies?.().find((b) => b.id === q || b.kind === q) || null;
}

/** lat/lon (graus) de onde `body` aparece a `elevation` graus, no azimute `azimuth` em torno da sub-posição. */
export function anchorLatLon(ctx, body, elevation = 15, azimuth = 0, alt = 1.7) {
  const planet = ctx.services.planet;
  const c = planet.center || ctx.space.planetCenter;
  const R = planet.radius;
  const bp = body.position;
  const m = new Vector3(bp.x - c.x, bp.y - c.y, bp.z - c.z).normalize();
  const fr = tangentFrame(m);
  const az = (azimuth * Math.PI) / 180;
  const perp = fr.north.clone().multiplyScalar(Math.cos(az)).addScaledVector(fr.east, Math.sin(az));
  const u = new Vector3();
  const elAt = (a) => {
    u.copy(m).multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a)).normalize();
    const r = R + (planet.heightAt?.(u) || 0) + alt;
    _v.set(bp.x - (c.x + u.x * r), bp.y - (c.y + u.y * r), bp.z - (c.z + u.z * r));
    return elevationOf(u, _v);
  };
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (elAt(mid) > elevation) lo = mid;
    else hi = mid;
  }
  elAt((lo + hi) / 2);
  return latLonFromDir(u);
}

export function applyShot(ctx, preset) {
  const p = ctx.player;
  const cam = preset.camera || {};
  const planet = ctx.services.planet;
  p.view = preset.view || 'first';
  let lat = cam.lat ?? 0;
  let lon = cam.lon ?? 0;
  if (cam.anchor) {
    const body = findBody(ctx, cam.anchor.body);
    if (body && body.position) ({ lat, lon } = anchorLatLon(ctx, body, cam.anchor.elevation ?? 15, cam.anchor.azimuth ?? 0, cam.alt ?? 1.7));
  }
  p.place({ mode: preset.mode, lat, lon, alt: cam.alt, heading: 0, pitch: 0, fov: cam.fov });
  const sky = ctx.services.sky;
  if (preset.timeOfDay != null) sky?.setTime?.(preset.timeOfDay);
  // rumo
  let heading = cam.heading ?? 0;
  if (cam.look) {
    const up = p.up.clone();
    let v = null;
    if (cam.look.body === 'sun' || cam.look.body === 'star') v = sky?.sunDirection?.clone?.() || null;
    else {
      const b = findBody(ctx, cam.look.body);
      if (b?.position) v = new Vector3(b.position.x - p.worldPos.x, b.position.y - p.worldPos.y, b.position.z - p.worldPos.z);
    }
    if (v) heading = headingOf(up, v) + (cam.look.offset ?? 0);
  }
  // inclinação
  let pitch = typeof cam.pitch === 'number' ? cam.pitch : 0;
  if (cam.pitch && typeof cam.pitch === 'object' && 'horizon' in cam.pitch) {
    const altEye = p.mode === 'walk' ? (cam.alt ?? p.eyeHeight) : p.altitude;
    pitch = -horizonDip(planet.radius, altEye) + cam.pitch.horizon;
  }
  p.place({ lat, lon, alt: cam.alt, heading, pitch, fov: cam.fov });
  const w = ctx.services.weather;
  if (preset.weather && w?.set) w.set(preset.weather);
  return { lat, lon, heading, pitch };
}
