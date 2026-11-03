// Arcade rules shared by the live controller, save validation, and race menus.
export const MAX_GHOST_POINTS = 240;
export const BOOST_SECONDS = 2.8;
const finite = Number.isFinite;

export function medalFor(seconds, target) {
  if (!finite(seconds) || seconds <= 0 || !finite(target) || target <= 0) return null;
  return seconds <= target ? 'gold' : seconds <= target * 1.35 ? 'silver' : 'bronze';
}

export function formatTime(seconds) {
  if (!finite(seconds) || seconds < 0) return '—';
  const tenths = Math.round(seconds * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

export function stepBoost(charge, requested, moving, dt) {
  const active = requested && moving && charge > 0;
  return {active, charge: Math.max(0, Math.min(1, charge + (active ? -1 / BOOST_SECONDS : requested && moving ? 0 : .18) * Math.max(0, dt)))};
}

// Swept detection prevents a fast scooter from skipping a small checkpoint.
export function crossedCheckpoint(from, to, point, radius) {
  const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length)) : 0;
  return Math.hypot(from.x + dx * t - point.x, from.z + dz * t - point.z) <= radius;
}

export function createGhostRecorder() {return {points: [], interval: .35};}
export function recordGhost(recorder, seconds, position, yaw, speed, force = false) {
  const last = recorder.points.at(-1);
  if (last && (seconds <= last[0] || !force && seconds - last[0] < recorder.interval)) return;
  const round = n => Math.round(n * 10000) / 10000;
  const heading = ((yaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  recorder.points.push([seconds, position.x, position.y, position.z, heading, speed].map(round));
  if (recorder.points.length > MAX_GHOST_POINTS) {
    const end = recorder.points.at(-1);
    recorder.points = recorder.points.filter((_, i) => i % 2 === 0);
    if (recorder.points.at(-1) !== end) recorder.points.push(end);
    recorder.interval *= 2;
  }
}

export function validateGhost(points, seconds) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_GHOST_POINTS || !finite(seconds)) return null;
  let previous = -1;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 6 || !p.every(finite) || p[0] <= previous || p[0] < 0 || p[0] > seconds + .01 || p[1] < -65 || p[1] > 55 || p[2] < -20 || p[2] > 20 || p[3] < -80 || p[3] > 50 || Math.abs(p[4]) > Math.PI * 2 || p[5] < 0 || p[5] > 20) return null;
    previous = p[0];
  }
  if (points[0][0] !== 0 || Math.abs(points.at(-1)[0] - seconds) > .01) return null;
  return points.map(p => [...p]);
}

export function ghostAt(points, seconds) {
  if (!points?.length || seconds < 0 || seconds > points.at(-1)[0]) return null;
  let next = points.findIndex(p => p[0] >= seconds);
  if (next < 0) next = points.length - 1;
  const a = points[Math.max(0, next - 1)], b = points[next];
  const t = a === b ? 0 : (seconds - a[0]) / (b[0] - a[0]);
  const lerp = i => a[i] + (b[i] - a[i]) * t;
  const turn = ((b[4] - a[4] + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return {x: lerp(1), y: lerp(2), z: lerp(3), yaw: a[4] + turn * t, speed: lerp(5)};
}
