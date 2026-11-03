// The follow camera looks along (sin(yaw), 0, cos(yaw)). Its screen-right
// vector is (-cos(yaw), 0, sin(yaw)); world +X is left when yaw is zero.
export function movementDirection(strafe, forward, yaw) {
  if (![strafe, forward, yaw].every(Number.isFinite)) return {x: 0, z: 0};
  return {x: Math.sin(yaw) * forward - Math.cos(yaw) * strafe, z: Math.cos(yaw) * forward + Math.sin(yaw) * strafe};
}

// Preserve a partial thumbstick push while keeping combined keyboard/touch
// input and diagonals within the same speed limit as a single direction.
export function normalizeMoveInput(x, z) {
  x = Number.isFinite(x) ? x : 0;
  z = Number.isFinite(z) ? z : 0;
  const length = Math.hypot(x, z);
  if (length > 1) {
    const scale = Math.max(Math.abs(x), Math.abs(z));
    const scaledLength = Math.hypot(x / scale, z / scale);
    return {x: (x / scale) / scaledLength, z: (z / scale) / scaledLength, magnitude: 1};
  }
  return {x, z, magnitude: length};
}

// Camera-forward is +Z at zero yaw, so a rightward mouse drag decreases yaw.
// Shared by drag, pointer lock and touch to keep all three inputs consistent.
export function lookDirection(yaw, pitch, dx, dy, {sensitivity = 1, invertY = false} = {}) {
  const finite = value => Number.isFinite(value) ? value : 0;
  const factor = Number.isFinite(sensitivity) ? Math.max(.5, Math.min(2, sensitivity)) : 1;
  return {yaw: finite(yaw) - finite(dx) * .003 * factor,
    pitch: Math.max(-.30, Math.min(1.20, finite(pitch) + finite(dy) * .003 * factor * (invertY ? -1 : 1)))};
}

export function zoomDistance(current, wheelDelta) {
  const distance = Number.isFinite(current) ? current : 1;
  const delta = Number.isFinite(wheelDelta) ? Math.max(-120, Math.min(120, wheelDelta)) : 0;
  return Math.max(.5, Math.min(2, distance * Math.exp(delta * .0015)));
}
