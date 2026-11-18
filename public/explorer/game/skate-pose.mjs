// Meter-based contact targets shared by rider and board art. No renderer,
// timers, or model assets are needed to evaluate a skating pose.
import {SKATE_MOTION} from './skateboard.mjs?v=20261105rider6';

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
const ease = t => {t = clamp(t, 0, 1); return t * t * (3 - 2 * t);};
const mix = (a, b, t) => a + (b - a) * t;
export const SKATE_POSE = Object.freeze({deckHeight: .145, plantX: .31, plantZ: .18, soleHeight: .13});

export function skateBoardPose(state, out = {}) {
  const air = !state?.grounded && !state?.rail;
  const t = clamp(state?.airTime, 0, 5);
  const pop = air && state?.airTricks?.includes('Ollie') ? (1 - ease(t / .24)) * .27 : 0;
  const manual = state?.grounded && !state?.rail ? ease((state?.manualTime || 0) / .20) * .19 : 0;
  out.pitch = manual || pop ? -manual - pop : 0;
  out.roll = clamp(state?.lean, -.48, .48) * .22;
  // Rotate around the back truck so a manual leaves its wheels on the road.
  out.lift = -.25 * Math.sin(out.pitch) + .161 * Math.abs(Math.sin(out.roll)) + .055 * (1 - Math.cos(out.roll)) + .055 * (1 - Math.cos(out.pitch));
  out.offsetZ = -.25 * (1 - Math.cos(out.pitch));
  const trick = state?.trick, phase = trick ? clamp(trick.elapsed / trick.seconds, 0, 1) : 0;
  const rotation = ease(phase) * Math.PI * 2;
  out.flip = trick && trick.name !== 'shove' ? rotation * (trick.name === 'heelflip' ? -1 : 1) : 0;
  out.shove = trick?.name === 'shove' ? rotation : 0;
  return out;
}

function rotate(point, heading, pitch, roll, out) {
  const cz = Math.cos(roll), sz = Math.sin(roll), cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(heading), sy = Math.sin(heading);
  const x = point.x * cz - point.y * sz, y = point.x * sz + point.y * cz;
  const py = y * cx - point.z * sx, z = y * sx + point.z * cx;
  out.x = x * cy + z * sy; out.y = py; out.z = -x * sy + z * cy;
  return out;
}
function unrotate(point, heading, pitch, roll, out) {
  const cy = Math.cos(heading), sy = Math.sin(heading), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  const x = point.x * cy - point.z * sy, z = point.x * sy + point.z * cy;
  const y = point.y * cx + z * sx, pz = -point.y * sx + z * cx;
  out.x = x * cz + y * sz; out.y = -x * sz + y * cz; out.z = pz;
  return out;
}
function deckFoot(foot, z, board) {
  const y = SKATE_POSE.deckHeight, c = Math.cos(board.pitch), s = Math.sin(board.pitch), bankY = y * Math.cos(board.roll);
  foot.x = -y * Math.sin(board.roll); foot.y = bankY * c - z * s + board.lift;
  foot.z = bankY * s + z * c + board.offsetZ;
  foot.yaw = Math.PI / 2 + (z > 0 ? -.20 : .07); foot.pitch = board.pitch; foot.roll = board.roll; foot.contact = 'deck';
}

export function createSkatePose() {
  const pose = {body: {x: 0, y: .94, z: 0}, left: {}, right: {}, board: {}, load: 0, direction: 1, pushPhase: 'coast', acceleration: 0, turn: 0};
  const plant = {x: 0, y: 0, z: 0}, point = {x: 0, y: 0, z: 0}, delta = {x: 0, y: 0, z: 0}, groundPoint = {x: 0, y: 0, z: 0};
  const lastLocal = {x: 0, y: 0, z: 0}, recoveryPoint = {x: 0, y: 0, z: 0}, returnPoint = {x: 0, y: 0, z: 0};
  let source = null, plantCycle = -1, recoverCycle = -1, planted = false, wasActive = false, lastPhase = 1, lastDirection = 1, returnTime = .18, returnDirection = 1;
  return {reset() {source = null; planted = false; plantCycle = -1;}, update(state, dt = 0, instant = false) {
    const fresh = source !== state; source = state;
    if (fresh) {planted = false; plantCycle = recoverCycle = -1; wasActive = false; returnTime = .18;}
    const board = skateBoardPose(state, pose.board), push = state?.push || {};
    const p = state?.position || {x: 0, y: 0, z: 0}, heading = state?.heading || 0, pitch = state?.pitch || 0, roll = 0;
    const grounded = !!state?.grounded || !!state?.rail;
    const travel = (state?.velocity?.x || 0) * Math.sin(heading) + (state?.velocity?.z || 0) * Math.cos(heading);
    const direction = push.active ? (push.direction === -1 ? -1 : 1) : grounded && Math.abs(travel) > .35 ? Math.sign(travel) : state?.switched ? -1 : 1;
    pose.direction = direction;
    deckFoot(pose.left, .24, board); deckFoot(pose.right, -.24, board);
    const foot = direction > 0 ? pose.right : pose.left;
    const deckYaw = foot.yaw;
    const rearZ = -.24 * direction, phase = clamp(push.phase, 0, 1), start = push.driveStart || .18, end = push.driveEnd || .54;
    const active = grounded && push.active && phase < 1;
    point.x = SKATE_POSE.plantX; point.y = 0; point.z = SKATE_POSE.plantZ * direction;
    rotate(point, heading, pitch, roll, delta);
    if (Number.isFinite(push.groundHeight)) delta.y = push.groundHeight - p.y;
    unrotate(delta, heading, pitch, roll, groundPoint);
    let support = 0;
    pose.pushPhase = grounded ? 'coast' : 'air';
    if (active) {
      const stride = clamp(push.plantedDistance, 0, .90);
      support = ease(phase / start) * (1 - ease((phase - end) / (1 - end)));
      if (phase < start) {
        const t = ease(phase / start);
        foot.x = mix(foot.x, groundPoint.x, t); foot.y = mix(foot.y, groundPoint.y, t) + Math.sin(Math.PI * t) * .13;
        foot.z = mix(foot.z, groundPoint.z, t); foot.yaw = mix(deckYaw, direction > 0 ? 0 : Math.PI, t); foot.pitch = board.pitch * (1 - t); foot.roll = board.roll * (1 - t); foot.contact = 'air';
        pose.pushPhase = 'reach'; planted = false;
      } else if (phase <= end && push.contact) {
        if (!planted || plantCycle !== push.cycleIndex) {
          // Recover the start of a contact even if a render skipped its first
          // fixed step. Once planted this point remains fixed in world space.
          point.x = SKATE_POSE.plantX; point.y = 0; point.z = direction * (SKATE_POSE.plantZ - stride);
          rotate(point, heading, pitch, roll, plant);
          plant.x += p.x; plant.y += p.y; plant.z += p.z;
          if (Number.isFinite(push.groundHeight)) plant.y = push.groundHeight;
          if (push.plantPosition && [push.plantPosition.x, push.plantPosition.y, push.plantPosition.z].every(Number.isFinite)) Object.assign(plant, push.plantPosition);
          plantCycle = push.cycleIndex; planted = true;
        }
        delta.x = plant.x - p.x; delta.y = plant.y - p.y; delta.z = plant.z - p.z;
        unrotate(delta, heading, pitch, roll, foot);
        foot.yaw = direction > 0 ? 0 : Math.PI; foot.pitch = 0; foot.roll = -roll; foot.contact = 'ground';
        pose.pushPhase = 'drive';
      } else {
        const t = ease((phase - end) / (1 - end));
        if (!planted || plantCycle !== push.cycleIndex) {
          point.x = SKATE_POSE.plantX; point.y = 0; point.z = direction * (SKATE_POSE.plantZ - stride);
          rotate(point, heading, pitch, roll, plant); plant.x += p.x; plant.y += p.y; plant.z += p.z;
          if (Number.isFinite(push.groundHeight)) plant.y = push.groundHeight;
          plantCycle = push.cycleIndex; planted = true;
        }
        if (recoverCycle !== push.cycleIndex) {
          delta.x = plant.x - p.x; delta.y = plant.y - p.y; delta.z = plant.z - p.z;
          // Rendering may first see recovery well after the fixed-step lift.
          // Undo that travel before caching the local release point. Runtime
          // supplies the exact fixed-step point; the velocity fallback also
          // keeps offline previews and low-frequency renders within leg reach.
          const lag = Math.max(0, phase - end) * (push.seconds ?? SKATE_MOTION.pushSeconds);
          delta.x += (state?.velocity?.x || 0) * lag;
          delta.y += (state?.velocity?.y || 0) * lag;
          delta.z += (state?.velocity?.z || 0) * lag;
          unrotate(delta, heading, pitch, roll, recoveryPoint);
          if (push.releaseFoot && [push.releaseFoot.x, push.releaseFoot.y, push.releaseFoot.z].every(Number.isFinite)) Object.assign(recoveryPoint, push.releaseFoot);
          recoverCycle = push.cycleIndex;
        }
        foot.x = mix(recoveryPoint.x, foot.x, t); foot.y = mix(recoveryPoint.y, foot.y, t) + Math.sin(Math.PI * t) * .22;
        foot.z = mix(recoveryPoint.z, foot.z, t); foot.yaw = mix(direction > 0 ? 0 : Math.PI, deckYaw, t); foot.pitch = board.pitch * t; foot.roll = board.roll * t; foot.contact = 'air';
        pose.pushPhase = 'recover';
      }
    } else {
      planted = false;
      if (grounded && (state?.braking || 0) > .08 && !state?.manualTime && !state?.rail) {
        const t = ease(state.braking);
        foot.x = mix(foot.x, .31, t); foot.y = mix(foot.y, 0, t); foot.z = mix(foot.z, rearZ - .08 * direction, t);
        foot.yaw = mix(deckYaw, direction > 0 ? 0 : Math.PI, t); foot.pitch = board.pitch * (1 - t); foot.roll = board.roll * (1 - t);
        foot.contact = t > .99 ? 'ground' : 'air'; support = t; pose.pushPhase = 'brake';
      }
    }
    if (wasActive && !active && lastPhase < .94) {
      returnTime = 0; returnDirection = lastDirection;
      Object.assign(returnPoint, lastLocal);
    }
    if (!active && returnTime < .18) {
      const returning = returnDirection > 0 ? pose.right : pose.left;
      returnTime = Math.min(.18, returnTime + clamp(dt, 0, .1));
      const t = ease(returnTime / .18);
      returning.x = mix(returnPoint.x, returning.x, t); returning.y = mix(returnPoint.y, returning.y, t) + Math.sin(Math.PI * t) * .12;
      returning.z = mix(returnPoint.z, returning.z, t); returning.contact = 'air';
    }
    if (!grounded) {
      const trick = state?.trick, t = trick ? clamp(trick.elapsed / trick.seconds, 0, 1) : 0;
      const clearance = trick ? .04 + Math.sin(Math.PI * t) * .24 : .018;
      for (const [index, f] of [pose.left, pose.right].entries()) {f.y += clearance; f.x += (index ? 1 : -1) * clearance * .24; f.contact = 'air';}
    }
    const compression = Number.isFinite(state?.compression) ? clamp(state.compression, 0, .34) : clamp(state?.charge / .65, 0, 1) * .24;
    const airTuck = !grounded ? ease((state?.airTime || 0) / .16) * .07 : 0;
    const load = clamp(push.load, 0, 1), acceleration = clamp(state?.acceleration, -10, 10), turn = clamp(state?.turnRate, -3, 3);
    const sprint = state?.sprinting ? 1 : 0;
    const targetY = .965 - compression - support * .045 - airTuck - sprint * .018;
    const targetX = -.025 - support * .035 - clamp(state?.lean, -.48, .48) * .14;
    const targetZ = direction * (support * .13 + sprint * .032) - acceleration * .007;
    const alpha = fresh || instant ? 1 : 1 - Math.exp(-clamp(dt, 0, .1) * 18);
    pose.body.x = mix(pose.body.x, targetX, alpha); pose.body.y = mix(pose.body.y, targetY, alpha); pose.body.z = mix(pose.body.z, targetZ, alpha);
    pose.load = support * .65 + load * .35; pose.acceleration = acceleration; pose.turn = turn;
    if (active) {
      Object.assign(lastLocal, {x: foot.x, y: foot.y, z: foot.z});
    }
    wasActive = active; lastPhase = phase; lastDirection = direction;
    return pose;
  }};
}
