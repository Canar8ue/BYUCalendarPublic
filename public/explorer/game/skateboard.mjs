// Skate simulation uses meters, seconds and radians. Rendering converts once at
// the campus boundary. No camera direction or render-frame delta enters physics.
import {resolveSkateBoard} from './skate-boards.mjs?v=20261105rider6';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const speedOf = s => Math.hypot(s.velocity.x, s.velocity.z);
const tricks = Object.freeze({kickflip: {seconds: .48, points: 150}, heelflip: {seconds: .48, points: 150}, shove: {seconds: .42, points: 120}});
// The board and rider respond as one load while riding. A push is a finite
// planted stroke, not a velocity jump or a motor that runs while the foot lifts.
export const SKATE_MOTION = Object.freeze({mass: 82, pushSeconds: .72, sprintSeconds: .55, pushPlant: .18, maxPushSpeed: 9.8, sprintPushSpeed: 13, sprintForce: 1.4, maxPushLateralLoad: 3.2});
export const SKATE_CHALLENGES = Object.freeze([
  {id: 'first-ollie', title: 'First pop', text: 'Land an ollie.', metric: 'ollies', target: 1},
  {id: 'flip', title: 'Grip side up', text: 'Land a flip trick.', metric: 'flips', target: 1},
  {id: 'rail', title: 'On the coping', text: 'Grind for 5 meters.', metric: 'grindMeters', target: 5},
  {id: 'line', title: 'Keep it rolling', text: 'Bank a 1,000 point line.', metric: 'bestLine', target: 1000},
  {id: 'hill', title: 'Gravity does the work', text: 'Reach 70 km/h.', metric: 'topSpeed', target: 70 / 3.6},
  {id: 'air', title: 'Hang time', text: 'Stay airborne for 1.5 seconds and land.', metric: 'bestAir', target: 1.5},
]);
export function validateSkateStats(raw = {}) {
  const result = {};
  for (const key of ['total', 'bestLine', 'ollies', 'flips', 'bails', 'grindMeters', 'topSpeed', 'bestAir']) {
    result[key] = Number.isFinite(raw?.[key]) ? clamp(raw[key], 0, key === 'topSpeed' ? 40 : key === 'bestAir' ? 60 : 1e9) : 0;
  }
  return result;
}
export function createSkateState({x = 0, y = 0, z = 0, heading = 0, board = 'classic'} = {}) {
  return {position: {x, y, z}, velocity: {x: 0, y: 0, z: 0}, heading, board: resolveSkateBoard(board).id,
    grounded: true, normal: {x: 0, y: 1, z: 0}, charge: 0, pushClock: 0, sprinting: false,
    push: {active: false, cycleIndex: 0, phase: 1, contact: false, force: 0, load: 0, seconds: SKATE_MOTION.pushSeconds, driveStart: .18, driveEnd: .54, plantedDistance: 0, peakForce: 0, direction: 1},
    turnRate: 0, acceleration: 0, braking: 0, compression: .025, compressionVelocity: 0, landingImpact: 0,
    jumpHeld: false, popBuffer: 0, airTime: 0, airSpin: 0, takeoffHeading: heading,
    trick: null, airTricks: [], grabTime: 0, manualTime: 0, rail: null, railCooldown: 0,
    combo: {base: 0, multiplier: 1, tricks: [], idle: 0}, lastLine: null,
    bail: null, pitch: 0, lean: 0, landing: 0, clock: 0, switched: false};
}
function addTrick(s, name, points) {
  const repeated = s.combo.tricks.filter(t => t === name).length;
  s.combo.base += Math.round(points / (1 + repeated * .6));
  s.combo.multiplier = Math.min(8, new Set([...s.combo.tricks, name]).size);
  s.combo.tricks = [...s.combo.tricks, name].slice(-16);
  s.combo.idle = 0;
}
export function bankSkateLine(s, stats) {
  if (!s.combo.base) return null;
  const line = {score: Math.round(s.combo.base * s.combo.multiplier), tricks: [...s.combo.tricks], banked: true};
  stats.total = Math.min(1e9, stats.total + line.score);
  stats.bestLine = Math.max(stats.bestLine, line.score);
  s.lastLine = {...line, until: s.clock + 3};
  s.combo = {base: 0, multiplier: 1, tricks: [], idle: 0};
  return line;
}
export function bailSkater(s, reason = 'Bailed', stats) {
  if (s.bail) return;
  s.bail = {reason, velocity: {...s.velocity}, heading: s.heading};
  s.lastLine = {score: Math.round(s.combo.base * s.combo.multiplier), banked: false, until: s.clock + 3};
  s.combo = {base: 0, multiplier: 1, tricks: [], idle: 0};
  s.rail = null;
  s.sprinting = false;
  cancelPush(s);
  if (stats) stats.bails = Math.min(1e9, stats.bails + 1);
}
function beginAir(s) {
  s.grounded = false; s.sprinting = false; s.airTime = 0; s.airSpin = 0;
  s.takeoffHeading = s.heading; s.airTricks = []; s.grabTime = 0;
  cancelPush(s); s.turnRate = 0;
}
function cancelPush(s) {
  Object.assign(s.push, {active: false, phase: 1, contact: false, force: 0, load: 0});
}
function drivePush(s, input, dt, travel, forward, events) {
  const push = s.push;
  if (input.crouch || input.brake || input.slide || input.manual || s.braking > .2) {
    cancelPush(s); return;
  }
  s.sprinting = !!input.sprint;
  // A loaded carve needs both feet to hold the deck. Reaching for pavement
  // under that lateral force would twist the support leg and locked shoe;
  // resume the next stroke when the rider unwinds into a gentler turn.
  if (Math.abs(s.turnRate) * speedOf(s) > SKATE_MOTION.maxPushLateralLoad) {
    cancelPush(s); return;
  }
  const speed = Math.abs(travel);
  const profile = resolveSkateBoard(s.board);
  const pushLimit = (input.sprint ? SKATE_MOTION.sprintPushSpeed : SKATE_MOTION.maxPushSpeed) * profile.topSpeed;
  if (!push.active && (input.push || input.sprint) && speed < pushLimit) {
    // The pelvis must stay supported by the foot on the deck while the other
    // shoe stays planted. Limit its sweep to about half a meter, shortening
    // contact as the rider rolls faster instead of stretching the leg.
    const driveSeconds = Math.min(.26, .58 / (speed + 2.5));
    const seconds = input.sprint ? SKATE_MOTION.sprintSeconds : SKATE_MOTION.pushSeconds;
    Object.assign(push, {active: true, cycleIndex: push.cycleIndex + 1, phase: 0, contact: false, force: 0, load: 0,
      seconds, driveStart: SKATE_MOTION.pushPlant, driveEnd: SKATE_MOTION.pushPlant + driveSeconds / seconds,
      plantedDistance: 0, peakForce: (1400 + speed * 160) * clamp(1 - speed / 24, .35, 1) * (input.sprint ? SKATE_MOTION.sprintForce : 1) * profile.acceleration,
      direction: speed > .35 ? Math.sign(travel) : s.switched ? -1 : 1});
  }
  if (!push.active) return;
  const before = push.phase, after = Math.min(1, before + dt / push.seconds);
  const start = Math.max(before, push.driveStart), end = Math.min(after, push.driveEnd);
  push.phase = after;
  push.contact = after >= push.driveStart && after < push.driveEnd;
  push.load = push.contact ? Math.sin(Math.PI * (after - push.driveStart) / (push.driveEnd - push.driveStart)) : 0;
  push.force = push.peakForce * push.load;
  if (end > start) {
    // Integrate the sine exactly across the step, including partial contact
    // boundaries, so a planted stroke transfers the same impulse at 60/120 Hz.
    const span = push.driveEnd - push.driveStart;
    const impulse = push.peakForce * push.seconds * span / Math.PI *
      (Math.cos(Math.PI * (start - push.driveStart) / span) - Math.cos(Math.PI * (end - push.driveStart) / span));
    const delta = impulse / SKATE_MOTION.mass;
    s.velocity.x += forward.x * delta * push.direction; s.velocity.z += forward.z * delta * push.direction;
    push.plantedDistance += Math.max(0, travel * push.direction + delta * .5) * (end - start) * push.seconds;
    if (before < push.driveStart) events.push({type: 'push', cycleIndex: push.cycleIndex});
  }
  // Releasing the input lets the planted stroke finish before both feet return
  // to the deck. The next stroke takes its cadence from the current input.
  if (after >= 1) cancelPush(s);
  s.pushClock = (1 - push.phase) * push.seconds;
}
function absorbLoad(s, dt, crouch) {
  const target = s.grounded || s.rail ? .025 + (crouch ? .215 : 0) + s.braking * .035 : .025;
  const frequency = 14, delta = s.compression - target, c = s.compressionVelocity + frequency * delta, decay = Math.exp(-frequency * dt);
  s.compression = target + (delta + c * dt) * decay;
  s.compressionVelocity = (s.compressionVelocity - frequency * c * dt) * decay;
  if (s.compression > .34 || s.compression < .005) {
    s.compression = clamp(s.compression, .005, .34); s.compressionVelocity = 0;
  }
}
function startTrick(s, name) {
  if (s.grounded || s.rail || s.trick || !tricks[name]) return;
  s.trick = {name, elapsed: 0, ...tricks[name]};
}
function sampleNormal(sample, x, z, y) {
  const h = sample(x, z, y);
  if (!Number.isFinite(h)) return null;
  const r = .20;
  // Do not average the vertical back of a kicker into the riding surface just
  // before takeoff. At discontinuities, the connected side defines the normal.
  const gradient = (plus, minus) => {
    const forward = ((plus ?? h) - h) / r, back = (h - (minus ?? h)) / r;
    return Math.abs(forward - back) > 1 && Math.min(Math.abs(forward), Math.abs(back)) < .8
      ? (Math.abs(forward) < Math.abs(back) ? forward : back) : (forward + back) / 2;
  };
  const dx = gradient(sample(x + r, z, y), sample(x - r, z, y));
  const dz = gradient(sample(x, z + r, y), sample(x, z - r, y));
  const length = Math.hypot(dx, 1, dz);
  return {height: h, normal: {x: -dx / length, y: 1 / length, z: -dz / length}};
}
export {sampleNormal as sampleSkateSurface};
export function nearestRail(point, rails, tolerance = .40) {
  let nearest = null;
  for (const rail of rails || []) {
    const dx = rail.b.x - rail.a.x, dz = rail.b.z - rail.a.z, length = Math.hypot(dx, dz);
    if (length < .1) continue;
    const t = clamp(((point.x - rail.a.x) * dx + (point.z - rail.a.z) * dz) / (length * length), 0, 1);
    const x = rail.a.x + dx * t, z = rail.a.z + dz * t, y = rail.a.y + (rail.b.y - rail.a.y) * t;
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < tolerance && Math.abs(point.y - y) < .22 && (!nearest || distance < nearest.distance)) nearest = {rail, t, x, y, z, dx: dx / length, dz: dz / length, length, distance};
  }
  return nearest;
}
// Called at 120 Hz. move() must sweep walls without snapping the vertical axis.
export function stepSkate(s, input, dt, {sample, move, isCurb, rails = [], stats = validateSkateStats()} = {}) {
  const events = [];
  dt = Number.isFinite(dt) ? clamp(dt, 0, 1 / 60) : 0;
  if (!dt || s.bail) return events;
  s.sprinting = false;
  s.clock += dt; s.landing = Math.max(0, s.landing - dt * 3);
  s.landingImpact *= Math.exp(-dt * 8);
  s.railCooldown = Math.max(0, s.railCooldown - dt);
  const v = s.velocity, p = s.position, steer = clamp(input.steer || 0, -1, 1);
  const previousForwardSpeed = v.x * Math.sin(s.heading) + v.z * Math.cos(s.heading);
  s.braking += ((input.brake && s.grounded ? 1 : 0) - s.braking) * (1 - Math.exp(-dt * 15));
  const held = !!input.crouch, released = s.jumpHeld && !held;
  if (input.pop) s.popBuffer = .12;
  s.popBuffer = Math.max(0, s.popBuffer - dt);
  if (held && (s.grounded || s.rail)) s.charge = Math.min(.65, s.charge + dt);
  if ((released || s.popBuffer > 0) && (s.grounded || s.rail)) {
    const rail = !!s.rail;
    beginAir(s); s.rail = null; s.railCooldown = .3;
    v.y = Math.max(0, v.y) + (3.9 + Math.min(1, s.charge / .5) * 1.5) * resolveSkateBoard(s.board).pop;
    s.charge = 0; s.popBuffer = 0;
    s.airTricks.push('Ollie'); events.push({type: 'pop', rail});
  }
  s.jumpHeld = held;
  if (input.bail) {bailSkater(s, 'Bailed', stats); return [{type: 'bail', reason: 'Bailed'}];}
  if (s.trick) {
    s.trick.elapsed += dt;
    if (s.trick.elapsed >= s.trick.seconds) {
      const name = {kickflip: 'Kickflip', heelflip: 'Heelflip', shove: 'Pop shove-it'}[s.trick.name];
      s.airTricks.push(name); s.trick = null;
    }
  }
  if (input.trick) startTrick(s, input.trick);
  if (s.rail) {
    const r = s.rail, direction = r.direction;
    // Gravity along sloped rails and low grinding friction preserve speed.
    r.speed = Math.max(0, r.speed + (-9.81 * (r.rail.b.y - r.rail.a.y) / r.length * direction - .38) * dt);
    r.t += r.speed * direction * dt / r.length;
    if (r.t <= 0 || r.t >= 1 || r.speed < .7) {
      beginAir(s); s.rail = null; s.railCooldown = .35;
      v.x = r.dx * r.speed * direction; v.z = r.dz * r.speed * direction; v.y = 0;
    } else {
      p.x = r.rail.a.x + (r.rail.b.x - r.rail.a.x) * r.t;
      p.z = r.rail.a.z + (r.rail.b.z - r.rail.a.z) * r.t;
      p.y = r.rail.a.y + (r.rail.b.y - r.rail.a.y) * r.t;
      v.x = r.dx * r.speed * direction; v.z = r.dz * r.speed * direction;
      s.combo.base += r.speed * dt * 18;
      stats.grindMeters += r.speed * dt;
      s.combo.idle = 0; s.heading = Math.atan2(v.x, v.z);
      cancelPush(s); s.turnRate = 0; absorbLoad(s, dt, held);
      return events;
    }
  }
  let surface = sampleNormal(sample, p.x, p.z, p.y);
  if (!surface) {bailSkater(s, 'Out of bounds', stats); return [{type: 'bail', reason: 'Out of bounds'}];}
  const wasGrounded = s.grounded;
  if (s.grounded) {
    s.normal = surface.normal;
    const n = surface.normal;
    // Project gravity onto the contact plane. The board keeps accelerating
    // downhill after the push input is released, and spends energy uphill.
    v.x += 9.81 * n.y * n.x * dt; v.z += 9.81 * n.y * n.z * dt;
    const speed = speedOf(s), forward = {x: Math.sin(s.heading), z: Math.cos(s.heading)};
    const travel = v.x * forward.x + v.z * forward.z;
    // Truck steering builds over a fraction of a second. At speed the rider's
    // lateral load limits curvature; stationary boards cannot swivel in place.
    // The deck and the rolling direction rotate through the same angle in either stance.
    const turnRate = Math.min(2.5 / (1 + speed * .075) * speed / (speed + .8), 7.5 / Math.max(1, speed));
    const targetTurn = -steer * turnRate;
    s.turnRate += (targetTurn - s.turnRate) * (1 - Math.exp(-dt * (input.slide ? 7 : 10)));
    s.heading += s.turnRate * dt;
    forward.x = Math.sin(s.heading); forward.z = Math.cos(s.heading);
    const side = {x: forward.z, z: -forward.x};
    const lateral = v.x * side.x + v.z * side.z;
    const grip = input.slide ? .9 : 11;
    v.x -= side.x * lateral * Math.min(1, grip * dt);
    v.z -= side.z * lateral * Math.min(1, grip * dt);
    drivePush(s, input, dt, travel, forward, events);
    const rolling = .10 + speed * speed * .0022 + s.braking * 7.2 + (input.slide ? 1.6 : 0);
    const damping = Math.max(0, 1 - rolling * dt / Math.max(.01, speed));
    v.x *= damping; v.z *= damping;
    v.y = -(v.x * n.x + v.z * n.z) / Math.max(.25, n.y);
    // A positive Z bank tilts the rider's up vector toward local -X. Use
    // signed travel so the load points into the curve in regular and fakie.
    s.lean += (clamp(-s.turnRate * travel / 9.81, -.48, .48) - s.lean) * (1 - Math.exp(-dt * 8));
    if (input.manual && speed > 1.5 && !held) {
      s.manualTime += dt; s.combo.idle = 0;
      if (s.manualTime > .3 && !s.combo.tricks.includes('Manual')) addTrick(s, 'Manual', 80);
      if (s.manualTime > .3) s.combo.base += dt * 45;
    } else s.manualTime = 0;
  } else {
    s.airTime += dt; v.y -= 9.81 * dt;
    s.airSpin -= steer * 4.8 * dt; s.heading = s.takeoffHeading + s.airSpin;
    if (input.grab) s.grabTime += dt;
    s.lean *= Math.exp(-dt * 4);
  }
  const limit = Math.min(40, 34 * resolveSkateBoard(s.board).topSpeed), horizontal = speedOf(s);
  if (horizontal > limit) {v.x *= limit / horizontal; v.z *= limit / horizontal;}
  const before = {...p}, requested = {x: v.x * dt, y: v.y * dt, z: v.z * dt};
  const next = move ? move(p, requested, .27) : {x: p.x + requested.x, y: p.y, z: p.z + requested.z};
  p.x = next.x; p.z = next.z;
  const distanceSquared = requested.x ** 2 + requested.z ** 2;
  const fraction = distanceSquared > 1e-10 ? ((p.x - before.x) * requested.x + (p.z - before.z) * requested.z) / distanceSquared : 1;
  if (horizontal * clamp(1 - fraction, 0, 1) > 2.2) {
    bailSkater(s, 'Heavy impact', stats); events.push({type: 'bail', reason: 'Heavy impact'}); return events;
  }
  if (fraction < .85 && distanceSquared > 1e-10) {
    v.x = (p.x - before.x) / dt; v.z = (p.z - before.z) / dt;
  }
  p.y += requested.y;
  surface = sampleNormal(sample, p.x, p.z, p.y);
  if (!surface) {bailSkater(s, 'Out of bounds', stats); return [{type: 'bail', reason: 'Out of bounds'}];}
  const drop = p.y - surface.height;
  // Campus paving is slightly proud of the terrain. Let the wheels follow a
  // small curb down while keeping real ledges and skatepark lips ballistic.
  if (wasGrounded && drop > .035 && (drop > .24 || !isCurb?.(before, p))) beginAir(s);
  const rail = !s.grounded && v.y <= 1 && !s.trick && s.railCooldown <= 0 && horizontal > 1.5 ? nearestRail(p, rails) : null;
  if (rail) {
    const along = v.x * rail.dx + v.z * rail.dz;
    if (Math.abs(along) > horizontal * .55) {
      s.rail = {...rail, speed: Math.abs(along), direction: Math.sign(along)};
      Object.assign(p, {x: rail.x, y: rail.y, z: rail.z});
      addTrick(s, '50-50 grind', 150); events.push({type: 'grind'}); return events;
    }
  }
  const contactVelocity=v.x*surface.normal.x+v.y*surface.normal.y+v.z*surface.normal.z;
  if (s.grounded || (contactVelocity <= 0 && p.y <= surface.height + .025)) {
    if (!s.grounded) {
      const n = surface.normal, impact = -(v.x * n.x + v.y * n.y + v.z * n.z);
      const spinError = Math.abs(wrap(s.airSpin - Math.round(s.airSpin / Math.PI) * Math.PI));
      if (s.trick || spinError > .82 || impact > 11.5) {
        const reason = s.trick ? 'Catch the board before landing' : spinError > .82 ? 'Landed sideways' : 'Heavy landing';
        bailSkater(s, reason, stats); events.push({type: 'bail', reason}); return events;
      }
      const landed = [...s.airTricks];
      const rotations = Math.round(Math.abs(s.airSpin) / Math.PI);
      if (rotations) landed.push((rotations * 180) + (s.airSpin < 0 ? ' frontside' : ' backside'));
      if (s.grabTime > .15) landed.push('Indy grab');
      if (!landed.length && s.airTime > .25) landed.push('Air');
      for (const name of landed) addTrick(s, name, name === 'Ollie' ? 60 : name === 'Air' ? 80 : name.includes('side') ? rotations * 180 : 150);
      if (landed.includes('Ollie')) stats.ollies++;
      stats.flips += landed.filter(t => /flip/i.test(t)).length;
      stats.bestAir = Math.max(stats.bestAir, s.airTime);
      s.switched = rotations % 2 === 1 ? !s.switched : s.switched;
      s.heading = s.takeoffHeading + Math.round(s.airSpin / Math.PI) * Math.PI;
      s.landing = clamp(impact / 9, .15, 1);
      s.landingImpact = impact;
      s.compressionVelocity += Math.max(0, impact) * .34;
      // The legs absorb normal impact; tire scrub costs a little forward
      // momentum on a hard landing without turning ordinary ollies into stops.
      const retained = 1 - clamp((impact - 2) * .008, 0, .065);
      v.x *= retained; v.z *= retained;
      events.push({type: 'land', tricks: landed, impact});
      s.trick = null;
    }
    s.grounded = true; p.y = surface.height;
    s.normal = surface.normal;
    v.y = -(v.x * s.normal.x + v.z * s.normal.z) / Math.max(.25, s.normal.y);
    const slope = v.x * Math.sin(s.heading) + v.z * Math.cos(s.heading);
    s.pitch = -Math.atan2(v.y * Math.sign(slope || 1), Math.max(.1, speedOf(s)));
  }
  if (!s.grounded) s.pitch *= Math.exp(-dt * 3);
  const forwardSpeed = v.x * Math.sin(s.heading) + v.z * Math.cos(s.heading);
  s.acceleration += (clamp((forwardSpeed - previousForwardSpeed) / dt, -14, 14) - s.acceleration) * (1 - Math.exp(-dt * 10));
  absorbLoad(s, dt, held);
  stats.topSpeed = Math.max(stats.topSpeed, speedOf(s));
  if (s.grounded && !s.manualTime && s.combo.base) {
    s.combo.idle += dt;
    if (s.combo.idle > 2.2) {const line = bankSkateLine(s, stats); if (line) events.push({type: 'bank', ...line});}
  }
  if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) {
    Object.assign(p, before); Object.assign(v, {x: 0, y: 0, z: 0}); bailSkater(s, 'Reset needed', stats);
  }
  return events;
}
