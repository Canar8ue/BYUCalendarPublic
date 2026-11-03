import test from 'node:test';
import assert from 'node:assert/strict';
import {detectImpact, startStumble, advanceStumble, approachSpeed} from '../public/explorer/game/locomotion.mjs';
import {createCollisionIndex} from '../public/explorer/game/world.mjs';
import {UNIT} from '../public/explorer/game/content.mjs';

const hit = options => detectImpact({speed: 6, requested: {x: .1, z: 0}, actual: {x: 0, z: 0}, riding: true, grounded: true, cooldown: 0, ...options});

test('scooter crashes and running trips require a substantial grounded obstruction', () => {
  assert.equal(hit().kind, 'crash');
  assert.equal(hit({speed: 4.5, riding: false, running: true}).kind, 'trip');
  for (const options of [{speed: 3.9}, {grounded: false}, {cooldown: .01}, {riding: false, running: false}, {riding: false, running: true, speed: 3.7}]) assert.equal(hit(options), null);
});

test('normal travel, glancing slides, and tiny or invalid requests do not cause falls', () => {
  assert.equal(hit({actual: {x: .1, z: 0}}), null);
  assert.equal(hit({requested: {x: .1, z: .1}, actual: {x: 0, z: .1}}), null);
  assert.equal(hit({requested: {x: .1, z: .03}, actual: {x: .1, z: 0}}), null);
  assert.equal(hit({speed: 4.1, actual: {x: .02, z: 0}}), null, 'effective impact speed is below the crash threshold');
  for (const options of [{requested: {x: 0, z: 0}}, {requested: {x: 1e-8, z: 0}}, {requested: {x: NaN, z: 0}}, {actual: {x: Infinity, z: 0}}, {speed: NaN}, {cooldown: NaN}]) assert.equal(hit(options), null);
  assert.equal(detectImpact(), null);
});

test('impact classification is independent of movement heading and simulation frequency', () => {
  for (const yaw of [0, .7, 2.3, Math.PI]) for (const fps of [30, 60, 120]) {
    const distance = 8 / fps, requested = {x: Math.sin(yaw) * distance, z: Math.cos(yaw) * distance};
    assert.equal(hit({speed: 8, requested, actual: {x: requested.x * .1, z: requested.z * .1}}).kind, 'crash');
    assert.equal(hit({speed: 8, requested, actual: requested}), null);
  }
});

test('real collision movement causes a direct scooter crash or sprint trip while preserving safe wall slides', () => {
  const vector = (x,y,z) => [x*UNIT,y*UNIT,z*UNIT];
  const index = createCollisionIndex([
    {kind:'ground',surface:1,a:vector(-5,0,-5),b:vector(5,0,5),c:vector(5,0,-5)},
    {kind:'ground',surface:1,a:vector(-5,0,-5),b:vector(-5,0,5),c:vector(5,0,5)},
    {kind:'wall',a:vector(0,0,-4),b:vector(0,2,4),c:vector(0,0,4)},
  ]);
  const move = ({speed=6,riding=true,running=false,heading=0,fps=60}={}) => {
    const radius=riding?.45:.32,from={x:-(radius+.005)*UNIT,y:0,z:0};
    const requested={x:Math.cos(heading)*speed/fps,z:Math.sin(heading)*speed/fps};
    const to=index.move(from,{x:requested.x*UNIT,z:requested.z*UNIT},radius*UNIT,{grounded:true});
    const actual={x:(to.x-from.x)/UNIT,z:(to.z-from.z)/UNIT};
    assert.ok(to.x<=-radius*UNIT,'collision must keep the capsule on its original side');
    return {impact:detectImpact({speed,requested,actual,riding,running,grounded:true,cooldown:0}),actual,requested};
  };
  for (const fps of [30,60,120]) {
    assert.equal(move({fps}).impact?.kind,'crash');
    assert.equal(move({speed:5.2,riding:false,running:true,fps}).impact?.kind,'trip');
    assert.equal(move({speed:2.6,riding:false,fps}).impact,null,'walking into the same wall stays safe');
    const slide=move({heading:Math.PI/4,fps});
    assert.equal(slide.impact,null,'an oblique collision must not count as a head-on crash');
    assert.ok(Math.abs(slide.actual.z-slide.requested.z)<1e-10,'the collision solver preserves movement along the wall');
  }
});

test('recovery is immutable, paused by zero time, bounded after stalls, and completes at every fixed rate', () => {
  for (const kind of ['trip', 'crash']) {
    const initial = startStumble(kind, -1), paused = advanceStumble(initial, 0);
    assert.deepEqual(paused, initial);
    assert.equal(initial.elapsed, 0);
    assert.equal(advanceStumble(initial, 20).elapsed, .1);
    assert.deepEqual(advanceStumble(initial, NaN), initial);
    for (const fps of [30, 60, 120]) {
      let state = initial, frames = 0, previousPhase = 0;
      while (state && frames < 300) {
        state = advanceStumble(state, 1 / fps); frames++;
        if (state) {assert.ok(state.phase >= previousPhase && state.phase < 1); previousPhase = state.phase; assert.equal(state.direction, -1);}
      }
      assert.equal(state, null);
      assert.ok(Math.abs(frames / fps - initial.duration) <= 1 / fps + 1e-9);
    }
  }
  assert.equal(startStumble('unknown'), null);
  assert.equal(startStumble('constructor'), null);
  assert.equal(advanceStumble({kind: 'trip', elapsed: NaN}, .01), null);
});

test('speed approaches its target without overshoot and the brake stops faster than coasting', () => {
  assert.equal(approachSpeed(0, 6.5, 1 / 60, {riding: true}), 5.8 / 60);
  assert.ok(approachSpeed(8, 0, .1, {riding: true, braking: true}) < approachSpeed(8, 0, .1, {riding: true}));
  assert.equal(approachSpeed(.1, 0, .1, {riding: true, braking: true}), 0);
  assert.equal(approachSpeed(6.49, 6.5, .1, {riding: true}), 6.5);
  assert.equal(approachSpeed(2, 6, 0), 2);
  assert.equal(approachSpeed(2, 6, NaN), 2);
  assert.equal(approachSpeed(2, 6, -1), 2);
  assert.equal(approachSpeed(NaN, Infinity, .1), 0);
});

test('acceleration and braking agree across ordinary frame rates', () => {
  for (const fps of [30, 60, 120]) {
    let speed = 0;
    for (let i = 0; i < fps; i++) speed = approachSpeed(speed, 8.5, 1 / fps, {riding: true});
    assert.ok(Math.abs(speed - 5.8) < 1e-9);
    for (let i = 0; i < fps / 2; i++) speed = approachSpeed(speed, 8.5, 1 / fps, {riding: true, braking: true});
    assert.equal(speed, 0);
  }
});
