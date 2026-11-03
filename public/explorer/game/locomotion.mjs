// Pure arcade movement rules. Speeds and displacements are meters/second and
// meters; the controller converts the campus presentation scale at its edge.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const validVector = value => value && Number.isFinite(value.x) && Number.isFinite(value.z);
const stepTime = dt => Number.isFinite(dt) ? clamp(dt, 0, .1) : 0;
const STUMBLE_SECONDS = Object.freeze({trip: 1.35, crash: 1.9});

/** Hard obstruction, rather than chance, causes falls. Wall slides stay safe. */
export function detectImpact({speed, requested, actual, riding = false, running = false, grounded = false, cooldown = 0} = {}) {
  if (!grounded || !Number.isFinite(cooldown) || cooldown > 0 || !Number.isFinite(speed) || !validVector(requested) || !validVector(actual)) return null;
  if (!riding && !running) return null;
  const threshold = riding ? 4 : 3.8;
  if (speed < threshold) return null;
  const distanceSquared = requested.x ** 2 + requested.z ** 2;
  if (!Number.isFinite(distanceSquared) || distanceSquared < 1e-10) return null;
  // A glancing wall projects most movement along its tangent. A head-on stop
  // loses almost all forward travel. Ratios keep the rule independent of fps.
  const forwardTravel = (requested.x * actual.x + requested.z * actual.z) / distanceSquared;
  const lost = clamp(1 - forwardTravel, 0, 1);
  if (lost < .72) return null;
  const impactSpeed = speed * lost;
  if (impactSpeed < threshold) return null;
  return {kind: riding ? 'crash' : 'trip', severity: clamp(impactSpeed / (riding ? 12 : 6), .25, 1)};
}

export function startStumble(kind, direction = 1) {
  if (!Object.hasOwn(STUMBLE_SECONDS, kind)) return null;
  const duration = STUMBLE_SECONDS[kind];
  return {kind, elapsed: 0, duration, phase: 0, direction: direction < 0 ? -1 : 1};
}

// Fixed-step callers advance recovery only while the game is unpaused.
export function advanceStumble(state, dt) {
  if (!state || !Object.hasOwn(STUMBLE_SECONDS, state.kind) || !Number.isFinite(state.elapsed) || state.elapsed < 0) return null;
  const duration = STUMBLE_SECONDS[state.kind];
  const elapsed = state.elapsed + stepTime(dt);
  if (elapsed >= duration - 1e-9) return null;
  return {...state, elapsed, duration, phase: clamp(elapsed / duration, 0, 1), direction: state.direction < 0 ? -1 : 1};
}

/** Bounded acceleration keeps the scooter weighty and the brake deliberate. */
export function approachSpeed(current, target, dt, {riding = false, braking = false} = {}) {
  current = Number.isFinite(current) ? Math.max(0, current) : 0;
  target = Number.isFinite(target) ? Math.max(0, target) : 0;
  if (braking) target = 0;
  const accelerating = target > current;
  const rate = braking ? 18 : riding ? (accelerating ? 5.8 : 4.8) : (accelerating ? 14 : 19);
  const amount = rate * stepTime(dt);
  return current + clamp(target - current, -amount, amount);
}
