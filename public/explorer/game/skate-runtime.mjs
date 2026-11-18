import * as THREE from '/campus/vendor/three.module.js';
import {UNIT} from './content.mjs?v=20261105rider6';
import {createSkateState, stepSkate, bankSkateLine, SKATE_CHALLENGES, validateSkateStats} from './skateboard.mjs?v=20261105rider6';
import {createSkateRagdoll} from './skate-ragdoll.mjs?v=20261105rider6';
import {createSkateboard, createSkateSpots} from './skate-art.mjs?v=20261105rider6';
import {clipDistrictMotion} from './district-collision.mjs?v=20261105rider6';
import {SKATE_POSE} from './skate-pose.mjs?v=20261105rider6';
import {resolveSkateBoard} from './skate-boards.mjs?v=20261105rider6';
import {isPavingTransition} from './world.mjs?v=20261105rider6';

export function createSkateRuntime({scene, world, player, getProgress, toast, persist, audio}) {
  const board = createSkateboard(scene), spots = createSkateSpots(scene, world);
  board.group.visible = false;
  let state = null, ragdoll = null, ragdollArt = null, marker = null, safe = null, active = false, recent = '', recentUntil = 0;
  let recovery = null, checkpointClock = 0, lastCourseView = null;
  const completed = new Set(SKATE_CHALLENGES.filter(c => (getProgress().skate?.[c.metric] || 0) >= c.target).map(c => c.id));
  // Keep all ordinary campus collision and the surveyed model intact. The
  // fictional course provides its own height/contact outside that footprint.
  const original = Object.fromEntries(['groundHeight', 'supportHeight', 'groundPose', 'groundSurface', 'move', 'cameraPosition'].map(key => [key, world[key].bind(world)]));
  world.groundHeight = (x, z, y) => spots.contains(x, z) ? spots.height(x, z) : original.groundHeight(x, z, y);
  world.supportHeight = (x, z, y, radius) => spots.contains(x, z) ? spots.height(x, z) : original.supportHeight(x, z, y, radius);
  world.groundSurface = (x, z, y) => spots.contains(x, z) ? 3 : original.groundSurface(x, z, y);
  world.groundPose = (x, z, heading, y) => {
    if (!spots.contains(x, z)) return original.groundPose(x, z, heading, y);
    const h = spots.height(x, z), r = .35 * UNIT, dx = Math.sin(heading) * r, dz = Math.cos(heading) * r;
    const front = spots.height(x + dx, z + dz) ?? h, back = spots.height(x - dx, z - dz) ?? h;
    return {height: h, pitch: -Math.atan2(front - back, 2 * r), roll: 0};
  };
  world.move = (p, delta, radius, options) => {
    if (!spots.contains(p.x, p.z)) return original.move(p, delta, radius, options);
    const obstacles=spots.obstacles.filter(o=>p.y<o.top-(o.rail?.15:0)*UNIT&&p.y+1.7*UNIT>o.bottom);
    const clipped=clipDistrictMotion(p,delta,obstacles,radius);
    const next = new THREE.Vector3(p.x + clipped.x, p.y, p.z + clipped.z);
    if (!spots.contains(next.x, next.z)) return p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
    return next;
  };
  world.cameraPosition = (target, desired) => {
    if (!spots.contains(target.x, target.z)) return original.cameraPosition(target, desired);
    const result = desired.clone();
    const ground = spots.height(result.x, result.z);
    if (Number.isFinite(ground)) result.y = Math.max(result.y, ground + .35 * UNIT);
    return result;
  };
  const sample = (x, z, y) => {const h = world.groundHeight(x * UNIT, z * UNIT, y * UNIT); return Number.isFinite(h) ? h / UNIT : null;};
  const isCurb = (from, to) => {
    if (spots.contains(from.x * UNIT, from.z * UNIT) || spots.contains(to.x * UNIT, to.z * UNIT)) return false;
    const source = world.groundSurface(from.x * UNIT, from.z * UNIT, from.y * UNIT);
    const target = world.groundSurface(to.x * UNIT, to.z * UNIT, to.y * UNIT);
    return isPavingTransition(source, target);
  };
  const move = (p, d, radius) => {
    const result = world.move(new THREE.Vector3(p.x * UNIT, p.y * UNIT, p.z * UNIT), new THREE.Vector3(d.x * UNIT, 0, d.z * UNIT), radius * UNIT, {grounded: false, skating: true, rolling: state.grounded});
    return {x: result.x / UNIT, y: p.y, z: result.z / UNIT};
  };
  function stats() {return getProgress().skate ||= validateSkateStats();}
  function clearRagdoll() {ragdollArt?.dispose();ragdoll?.dispose();ragdoll = ragdollArt = null; recovery = null; player.group.visible = true;}
  function start(point, {setMarker = true} = {}) {
    clearRagdoll(); active = true;recent = '';recentUntil = 0;
    completed.clear();for(const c of SKATE_CHALLENGES)if(stats()[c.metric]>=c.target)completed.add(c.id);
    const p = point || {...player.group.position, heading: player.group.rotation.y};
    const y = world.supportHeight(p.x, p.z, p.y) ?? player.group.position.y;
    const selected = resolveSkateBoard(getProgress().cosmetics?.deck);
    state = createSkateState({x: p.x / UNIT, y: y / UNIT, z: p.z / UNIT, heading: p.heading || 0, board: selected.id});
    board.setStyle(selected.id);
    player.group.position.set(p.x, y, p.z); player.group.rotation.set(0, state.heading, 0, 'YXZ');
    safe = {x: p.x, y, z: p.z, heading: state.heading}; if (setMarker) marker = {...safe};
    board.group.visible = true;board.group.position.copy(player.group.position);board.group.rotation.y = state.heading;board.update(0, state);
  }
  function stop() {
    if (state && active && !state.bail) bankSkateLine(state, stats());
    active = false; board.group.visible = false; clearRagdoll();
  }
  function beginBail() {
    board.group.position.set(state.position.x*UNIT,state.position.y*UNIT,state.position.z*UNIT);board.group.rotation.y=state.heading;board.update(0,state);
    ragdoll = createSkateRagdoll({position: state.position, velocity: state.bail.velocity, heading: state.heading, boardPose: board.rigidPose(),riderPose:player.ragdollPose?.(),sample,
      obstacles:spots.obstacles.map(o=>({...o,x:o.x/UNIT,z:o.z/UNIT,radius:o.radius/UNIT,bottom:o.bottom/UNIT,top:o.top/UNIT})),
      rails: spots.rails, walls: (x, z, radius) => (world.wallsNear?.(x * UNIT, z * UNIT, radius * UNIT) || []).map(w => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / UNIT])))});
    ragdollArt = player.createRagdoll?.(ragdoll);
    board.group.visible = true;board.updateRigid(ragdoll.board);ragdollArt?.update();
    recent = state.bail.reason; recentUntil = state.clock + 4;
    audio.foley('crash', 3, 1); persist();
  }
  return {start, stop, spots, board,
    setBoard(id) {
      const selected = resolveSkateBoard(id);
      if (state) state.board = selected.id;
      board.setStyle(selected.id);
    },
    get active() {return active;}, get state() {return state;},
    get marker() {return marker;},
    clearMarker() {marker = null;},
    get recovering() {return recovery;},
    resetMarker() {if (!marker) return; start(marker, {setMarker: false});},
    setMarker() {if (!active || !state.grounded || state.bail || Math.hypot(state.velocity.x, state.velocity.z) > 2) {toast('Slow down on the ground to set a marker'); return;}
      marker = {x: state.position.x * UNIT, y: state.position.y * UNIT, z: state.position.z * UNIT, heading: state.heading}; toast('Session marker set', 'R returns here.');},
    suspend() {if (state) {
      state.jumpHeld = false; state.charge = 0; state.popBuffer = 0; state.sprinting = false;
      // A paused planted stroke cannot finish driving when input has cleared.
      if (state.push) Object.assign(state.push, {active: false, phase: 1, contact: false, force: 0, load: 0});
    }},
    step(dt, input) {
      if (!active) return;
      if (ragdoll) {
        ragdoll.step(dt); state.clock += dt;
        const p = ragdoll.position;
        const torsoVelocity = ragdoll.parts[0].body.velocity;
        Object.assign(state.velocity, {x: torsoVelocity.x, y: torsoVelocity.y, z: torsoVelocity.z});
        player.group.position.set(p.x * UNIT, (p.y - .65) * UNIT, p.z * UNIT);
        recovery = {kind: 'skate', phase: Math.min(1, ragdoll.elapsed / 4.5)};
        if ((ragdoll.elapsed > 2.4 && ragdoll.settled) || ragdoll.elapsed > 4.5) start(safe || marker, {setMarker: false});
        return;
      }
      const oldContact = state.push?.contact, oldPhase = state.push?.phase;
      const oldX = state.position.x, oldY = state.position.y, oldZ = state.position.z, oldHeading = state.heading, oldPitch = state.pitch;
      const events = stepSkate(state, input, dt, {sample, move, isCurb, rails: spots.rails, stats: stats()});
      if (oldContact && !state.push.contact && state.push.plantPosition) {
        // Lift-off belongs to the same fixed-step timeline as planting. A slow
        // render must not leave a shoe behind until its first recovery frame.
        const t = state.push.active ? THREE.MathUtils.clamp((state.push.driveEnd - oldPhase) / Math.max(1e-8, state.push.phase - oldPhase), 0, 1) : 1;
        const anchor = state.push.plantPosition;
        const foot = new THREE.Vector3(anchor.x - THREE.MathUtils.lerp(oldX, state.position.x, t),
          anchor.y - THREE.MathUtils.lerp(oldY, state.position.y, t), anchor.z - THREE.MathUtils.lerp(oldZ, state.position.z, t));
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.lerp(oldPitch, state.pitch, t), THREE.MathUtils.lerp(oldHeading, state.heading, t), 0, 'YXZ'));
        foot.applyQuaternion(rotation.invert());
        state.push.releaseFoot = {x: foot.x, y: foot.y, z: foot.z};
      }
      if (state.push?.active && !state.push.contact) {
        // Sample the pavement beside the board, where the shoe will plant.
        // The pose controller retains this world contact through the drive.
        const x = SKATE_POSE.plantX, z = SKATE_POSE.plantZ * (state.push.direction || 1), h = state.heading;
        state.push.groundHeight = sample(state.position.x + Math.cos(h) * x + Math.sin(h) * z,
          state.position.z - Math.sin(h) * x + Math.cos(h) * z, state.position.y) ?? state.position.y;
      }
      for (const event of events) {
        if (event.type === 'push') {
          // Capture contact on the fixed physics tick, independent of when a
          // render first sees this stroke. Turns cannot slide a planted shoe.
          const foot = new THREE.Vector3(SKATE_POSE.plantX, 0, (SKATE_POSE.plantZ - state.push.plantedDistance) * state.push.direction);
          foot.applyEuler(new THREE.Euler(state.pitch, state.heading, 0, 'YXZ'));
          foot.x += state.position.x;foot.z += state.position.z;
          state.push.plantPosition = {x: foot.x, y: sample(foot.x, foot.z, state.position.y) ?? state.position.y, z: foot.z};
          state.push.releaseFoot = null;
          state.push.groundHeight = state.push.plantPosition.y;
          audio.foley('skatePush', world.groundSurface(state.position.x * UNIT, state.position.z * UNIT), .6);
        }
        if (event.type === 'pop') audio.foley('skatePop', 3, .65);
        if (event.type === 'land') {audio.foley('skateLand', 3, Math.min(1, event.impact / 9)); recent = event.tricks.join(' + '); recentUntil = state.clock + 2.5;}
        if (event.type === 'grind') {recent = '50-50 grind'; recentUntil = state.clock + 2; audio.chime('checkpoint');}
        if (event.type === 'bank') {persist(); audio.chime('discover');}
      }
      if (state.bail) {beginBail(); return;}
      const p = state.position; player.group.position.set(p.x * UNIT, p.y * UNIT, p.z * UNIT); player.group.rotation.y = state.heading;
      checkpointClock += dt;
      if (state.grounded && checkpointClock > .5 && Math.hypot(state.velocity.x, state.velocity.z) < 14 && !input.crouch) {
        checkpointClock = 0; safe = {x: p.x * UNIT, y: p.y * UNIT, z: p.z * UNIT, heading: state.heading};
      }
      for (const challenge of SKATE_CHALLENGES) if (!completed.has(challenge.id) && stats()[challenge.metric] >= challenge.target) {
        completed.add(challenge.id); toast(challenge.title, 'Skate challenge complete'); audio.chime('quest'); persist();
      }
    },
    update(dt) {
      const courseView = spots.contains(player.group.position.x, player.group.position.z);
      spots.root.visible = courseView;
      if(courseView !== lastCourseView){world.setCourseView?.(courseView);lastCourseView=courseView;}
      if (!active) return;
      if (ragdoll) {ragdollArt?.update();board.updateRigid(ragdoll.board);return;}
      board.group.visible = true; board.group.position.copy(player.group.position); board.group.rotation.y = state.heading;
      board.update(dt, state);
    },
    hud() {
      if (!active) return null;
      const combo = state.combo, line = state.lastLine;
      return {score: Math.round(combo.base * combo.multiplier), multiplier: combo.multiplier, board: resolveSkateBoard(state.board),
        tricks: combo.tricks.slice(-3).join(' + '), charge: state.charge / .65,
        recent: recentUntil > state.clock ? recent : '', grounded: state.grounded,
        status: state.bail ? 'BAIL · R TO RETRY' : state.rail ? '50-50 GRIND' : state.manualTime > .3 ? 'MANUAL' : !state.grounded ? 'AIR' : state.switched ? 'SWITCH' : 'SKATE',
        line: line && line.score > 0 && line.until > state.clock ? line : null, best: stats().bestLine, stats: stats()};
    },
    dispose() {stop(); board.dispose(); spots.dispose();},
  };
}
