import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createSkateState, stepSkate} from '../public/explorer/game/skateboard.mjs';
import {createSkatePose, skateBoardPose, SKATE_POSE} from '../public/explorer/game/skate-pose.mjs';

const UNIT = .044571444392204285;
async function playerFactory() {
  const url = new URL('../public/explorer/game/actors.mjs', import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace("'/campus/vendor/three.module.js'", JSON.stringify(new URL('../public/campus/vendor/three.module.js', import.meta.url).href))
    .replace(/from '(\.\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, url).href));
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).createPlayer;
}
function posePlayer(player, state, dt = 1 / 60, instant = false) {
  player.group.position.set(state.position.x * UNIT, state.position.y * UNIT, state.position.z * UNIT);
  player.group.rotation.set(state.pitch, state.heading, 0, 'YXZ');
  player.update(dt, {skating: state, riding: true, speed: Math.hypot(state.velocity.x, state.velocity.z), grounded: state.grounded, instant});
  player.group.updateMatrixWorld(true);
}
function sole(player, side) {
  return new THREE.Vector3(0, -SKATE_POSE.soleHeight, .067)
    .applyMatrix4(player.group.getObjectByName(side + ' ankle').matrixWorld).divideScalar(UNIT);
}
function targetWorld(player, side) {
  const foot = player.group.userData.skatePose[side.toLowerCase()];
  return new THREE.Vector3(foot.x, foot.y, foot.z).applyMatrix4(player.group.matrixWorld).divideScalar(UNIT);
}

test('IK soles actually meet the deck and planted road at varied slopes, banks and switch stances', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  try {
    for (const direction of [-1, 1]) for (const pitch of [-.22, 0, .22]) for (const lean of [-.35, 0, .35]) {
      const state = createSkateState({heading: .6}); state.pitch = pitch; state.lean = lean;
      Object.assign(state.push, {active: true, cycleIndex: 1, phase: .3, contact: true, load: 1, direction, plantedDistance: .20, groundHeight: 0});
      posePlayer(player, state, 0, true);
      for (const side of ['Left', 'Right']) assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6, `${direction}/${pitch}/${lean} ${side} sole meets contact`);
      const pushing = direction > 0 ? 'Right' : 'Left';
      assert.ok(Math.abs(sole(player, pushing).y) < 1e-6, 'the pushing shoe touches actual pavement');
      assert.ok(player.group.getObjectByName('Explorer pelvis').position.y > .55, 'a normal plant has usable knee room');
    }
  } finally {player.dispose();}
});

test('ground contacts stay planted through board travel and carving, then lift without a slope pop', () => {
  const controller = createSkatePose(), state = createSkateState({heading: .3});
  state.pitch = .22; state.lean = .3;
  Object.assign(state.push, {active: true, cycleIndex: 3, phase: .2, contact: true, direction: 1, groundHeight: 0, driveStart: .18, driveEnd: .4});
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const world = foot => {
    rotation.setFromEuler(new THREE.Euler(state.pitch, state.heading, 0, 'YXZ'));
    matrix.compose(new THREE.Vector3(state.position.x, state.position.y, state.position.z), rotation, new THREE.Vector3(1, 1, 1));
    return new THREE.Vector3(foot.x, foot.y, foot.z).applyMatrix4(matrix);
  };
  let pose = controller.update(state, 1 / 60), anchor = world(pose.right);
  state.position.z += .18; state.position.y -= .04; state.heading += .07; state.push.phase = .39999;
  pose = controller.update(state, 1 / 60);
  assert.ok(world(pose.right).distanceTo(anchor) < 1e-9, 'the force-bearing foot does not treadmill as the board moves');
  const before = world(pose.right);
  state.push.phase = .40001; state.push.contact = false;
  pose = controller.update(state, 0);
  assert.ok(world(pose.right).distanceTo(before) < .0001, 'lift-off begins at the exact sloped ground contact');
  state.push.phase = .8; state.position.z += 2;
  pose = controller.update(state, 1 / 60);
  assert.ok(pose.right.z > -.6, 'the recovering foot travels with the rider instead of dragging behind');
});

test('pushing at jogging and cruising speeds keeps anatomically reachable legs through complete recovery', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  try {
    for (const speed of [0, 4, 8, 9.7]) {
      const state = createSkateState(); state.velocity.z = speed;
      let lowest = Infinity, contacts = 0;
      for (let i = 0; i < 100; i++) {
        stepSkate(state, {push: i === 0}, 1 / 120, {sample: () => 0}); state.push.groundHeight = 0;
        posePlayer(player, state, 1 / 120);
        lowest = Math.min(lowest, player.group.getObjectByName('Explorer pelvis').position.y);
        for (const side of ['Left', 'Right']) assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6, `${speed}m/s ${i} ${side} limb reaches its target`);
        if (player.group.userData.skatePose.right.contact === 'ground') {contacts++; assert.ok(Math.abs(sole(player, 'Right').y) < 1e-6);}
      }
      assert.ok(contacts > 0); assert.ok(lowest > .55, `${speed}m/s hips remain above ${lowest.toFixed(3)}m`);
    }
  } finally {player.dispose();}
});

test('the sprint posture leans the torso down the line of travel without moving the planted shoes', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  const torso = player.group.getObjectByName('Explorer torso'), rotation = new THREE.Quaternion();
  const chestForward = () => new THREE.Vector3(0, 1, 0).applyQuaternion(torso.getWorldQuaternion(rotation)).z;
  try {
    for (const direction of [-1, 1]) {
      const state = createSkateState(); state.velocity.z = direction * 5; state.switched = direction < 0;
      posePlayer(player, state, 0, true);
      const neutral = chestForward();
      let contacts = 0;
      for (let i = 0; i < 120; i++) {
        stepSkate(state, {sprint: true}, 1 / 120, {sample: () => 0});
        posePlayer(player, state, 1 / 120);
        for (const side of ['Left', 'Right']) {
          assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6);
          if (player.group.userData.skatePose[side.toLowerCase()].contact === 'ground') {
            contacts++;
            assert.ok(Math.abs(sole(player, side).y) < 1e-6);
          }
        }
      }
      assert.ok(direction * (chestForward() - neutral) > .18);
      assert.ok(contacts > 0);
      for (let i = 0; i < 120; i++) {
        stepSkate(state, {}, 1 / 120, {sample: () => 0});
        posePlayer(player, state, 1 / 120);
      }
      assert.ok(Math.abs(chestForward() - neutral) < .02);
    }
  } finally {player.dispose();}
});

test('charge, air tricks, manual and landing have distinct poses; switch cancellation returns the moving foot', () => {
  const controller = createSkatePose(), state = createSkateState();
  const standing = controller.update(state, 0, true).body.y;
  state.compression = .25;
  assert.ok(controller.update(state, 0, true).body.y < standing - .2);
  state.manualTime = .4;
  const board = skateBoardPose(state);
  assert.ok(board.pitch < -.15 && board.lift > .04);
  state.rail = {id: 'test-rail'};
  assert.equal(skateBoardPose(state).pitch, 0, 'a captured 50-50 grind aligns both trucks even if prior manual time persists');
  state.rail = null;
  state.grounded = false; state.trick = {name: 'kickflip', elapsed: .24, seconds: .48}; state.airTime = .3;
  let pose = controller.update(state, 0, true);
  assert.ok(pose.left.y > .4 && pose.right.y > .4, 'flipping deck clears both shoes');
  state.grounded = true; state.trick = null; state.manualTime = 0;
  Object.assign(state.push, {active: true, cycleIndex: 4, phase: .3, contact: true, direction: -1, groundHeight: 0});
  pose = controller.update(state, 0, true);
  const plantedLeft = {...pose.left};
  state.push.active = false; state.push.phase = 1;
  pose = controller.update(state, 0);
  assert.ok(Math.hypot(pose.left.x - plantedLeft.x, pose.left.y - plantedLeft.y, pose.left.z - plantedLeft.z) < 1e-9);
  assert.equal(pose.right.contact, 'deck', 'cancelling a reverse stroke leaves its supporting foot planted');
});

test('repeated paused poses are stable and leaving the skateboard restores walking limbs', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  try {
    const state = createSkateState(); state.lean = .3;
    posePlayer(player, state, 0, true);
    const before = sole(player, 'Left');
    for (let i = 0; i < 20; i++) posePlayer(player, state, 0);
    assert.ok(sole(player, 'Left').distanceTo(before) < 1e-12);
    for (let i = 0; i < 180; i++) player.update(1 / 60, {});
    assert.equal(player.group.userData.animationState, 'idle');
    assert.equal(player.group.userData.skatePose, undefined);
    assert.ok(Math.abs(player.group.getObjectByName('Left hip').rotation.x) < .001);
  } finally {player.dispose();}
});

test('30, 60 and 120 Hz rendering retain the same planted contact and similar physical weight shifts', async () => {
  const createPlayer = await playerFactory(), results = [];
  for (const fps of [30, 60, 120]) {
    const player = createPlayer(new THREE.Scene()), state = createSkateState();
    state.velocity.z = 4;
    const samples = [];
    try {
      for (let tick = 1; tick <= 360; tick++) {
        stepSkate(state, {push: tick < 220, steer: tick > 180 ? .3 : 0}, 1 / 120, {sample: () => 0});
        state.push.groundHeight = 0;
        if (tick % (120 / fps) === 0) {
          posePlayer(player, state, 1 / fps);
          const pose = player.group.userData.skatePose;
          for (const side of ['Left', 'Right']) assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6);
          if (pose.right.contact === 'ground') assert.ok(Math.abs(sole(player, 'Right').y) < 1e-6);
          if (tick % 60 === 0) samples.push(player.group.getObjectByName('Explorer pelvis').position.clone());
        }
      }
      results.push(samples);
    } finally {player.dispose();}
  }
  for (let rate = 1; rate < results.length; rate++) for (let i = 0; i < results[0].length; i++) {
    assert.ok(results[0][i].distanceTo(results[rate][i]) < .035, 'render frequency cannot materially change body weight or reach');
  }
});

test('high-speed carving keeps both feet reachable at low rendering rates without collapsing the pelvis', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  try {
    for (const initial of [8, 9.7]) for (const direction of [-1, 1]) for (const fps of [30, 60, 120]) {
      const state = createSkateState(); state.velocity.z = direction * initial; state.switched = direction < 0;
      let lowest = Infinity;
      for (let tick = 1; tick <= 480; tick++) {
        stepSkate(state, {push: true, steer: -1}, 1 / 120, {sample: () => 0}); state.push.groundHeight = 0;
        if (tick % (120 / fps) === 0) {
          posePlayer(player, state, 1 / fps);
          lowest = Math.min(lowest, player.group.getObjectByName('Explorer pelvis').position.y);
          for (const side of ['Left', 'Right']) assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6, `${initial}/${direction}/${fps} planted legs reach the board`);
        }
      }
      assert.ok(lowest > .55, `${initial}/${direction}/${fps}: hips stay in a skating posture (${lowest.toFixed(3)}m)`);
    }
  } finally {player.dispose();}
});

test('actual rider lean and center of mass move into both turns while riding forward or fakie', async () => {
  const createPlayer = await playerFactory(), player = createPlayer(new THREE.Scene());
  const worldRotation = new THREE.Quaternion(), up = new THREE.Vector3(), inward = new THREE.Vector3(), massShift = new THREE.Vector3();
  try {
    for (const direction of [-1, 1]) for (const steer of [-.65, .65]) for (const heading of [.3, 1.7]) {
      const state = createSkateState({heading});
      state.velocity.x = Math.sin(heading) * 7 * direction; state.velocity.z = Math.cos(heading) * 7 * direction;
      state.switched = direction < 0;
      posePlayer(player, state, 0, true);
      const neutralX = player.group.getObjectByName('Explorer pelvis').position.x;
      for (let tick = 0; tick < 180; tick++) {
        stepSkate(state, {steer}, 1 / 120, {sample: () => 0});
        if (tick % 2 === 1) posePlayer(player, state, 1 / 60);
      }
      // Positive yaw turns the actual velocity toward its right-hand normal.
      // Using measured travel also covers a board rolling backward in fakie.
      inward.set(state.velocity.z, 0, -state.velocity.x).normalize().multiplyScalar(Math.sign(state.turnRate));
      const pelvis = player.group.getObjectByName('Explorer pelvis');
      up.set(0, 1, 0).applyQuaternion(pelvis.getWorldQuaternion(worldRotation));
      assert.ok(up.dot(inward) > .12, `${direction}/${steer}/${heading}: the actual body banks into centripetal acceleration`);
      massShift.set(pelvis.position.x - neutralX, 0, 0).applyQuaternion(player.group.quaternion);
      assert.ok(massShift.dot(inward) > .015, 'the hips shift toward the center of the carve');
      for (const side of ['Left', 'Right']) assert.ok(sole(player, side).distanceTo(targetWorld(player, side)) < 1e-6, 'banking keeps both shoes on the deck');
    }
  } finally {player.dispose();}
});
