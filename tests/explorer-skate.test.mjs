import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkateState, stepSkate, bankSkateLine, bailSkater, validateSkateStats, nearestRail} from '../public/explorer/game/skateboard.mjs';
import {skateSpotHeight, SPOT_STARTS, downhillCenter} from '../public/explorer/game/skate-spots.mjs';
import {createSkateRagdoll} from '../public/explorer/game/skate-ragdoll.mjs';
import {createProgress, validateProgress} from '../public/explorer/game/progress.mjs';

const speed = s => Math.hypot(s.velocity.x, s.velocity.z);
function simulation({sample = () => 0, position = {}, rails = [], move} = {}) {
  const state = createSkateState(position), stats = validateSkateStats(), events = [];
  return {state, stats, events, run(seconds, input = {}) {
    for (let i = 0; i < Math.round(seconds * 120); i++) events.push(...stepSkate(state, typeof input === 'function' ? input(i) : input, 1 / 120, {sample, rails, move, stats}));
    return state;
  }};
}
test('pushing builds momentum and releasing push coasts instead of decelerating to a target speed', () => {
  const t = simulation(); t.run(4, {push: true}); const initial = speed(t.state);
  assert.ok(initial > 7 && initial < 11); t.run(2);
  assert.ok(speed(t.state) > initial * .8); assert.ok(t.state.position.z > 20);
});

test('Shift alone makes planted pushes stronger and more frequent and reaches a faster cruising pace', () => {
  const normal=simulation(), sprint=simulation();
  normal.run(1/120,{push:true});sprint.run(1/120,{sprint:true});
  assert.ok(sprint.state.push.peakForce>normal.state.push.peakForce*1.35);
  normal.run(4-1/120,{push:true});sprint.run(4-1/120,{sprint:true});
  assert.ok(speed(sprint.state)>speed(normal.state)+2,'harder pushes visibly increase rolling pace');
  assert.ok(sprint.state.position.z>normal.state.position.z*1.3,'the faster pace moves the rider meaningfully farther over the same time');
  assert.ok(sprint.events.filter(e=>e.type==='push').length>normal.events.filter(e=>e.type==='push').length);
  assert.equal(sprint.state.sprinting,true);
  const faster=simulation();faster.state.velocity.z=10.5;
  faster.run(.6,{sprint:true});
  assert.ok(faster.events.some(e=>e.type==='push'),'Shift permits a push above the normal cruising ceiling');
  const coast=simulation();coast.state.velocity.z=14;
  coast.run(1,{sprint:true});
  assert.equal(coast.events.filter(e=>e.type==='push').length,0,'very fast downhill travel still coasts without a motor');
});

test('sprint transfers no force before contact, during recovery or in air', () => {
  const push=simulation();push.run(.095,{sprint:true});
  assert.equal(speed(push.state),0,'Shift does not skip the ground-plant anticipation');
  for(let i=0;i<90;i++){
    const previous=speed(push.state), phase=push.state.push.phase, end=push.state.push.driveEnd;
    push.run(1/120);
    if(phase>end&&phase<1)assert.ok(speed(push.state)<=previous+1e-8,'the returning shoe cannot accelerate the board');
  }
  assert.equal(push.state.sprinting,false);
  assert.equal(push.events.filter(e=>e.type==='push').length,1,'letting go allows only the already-started stroke to finish');
  const airborne=simulation({position:{y:5}});airborne.state.grounded=false;airborne.state.velocity.z=5;
  airborne.run(.5,{sprint:true});
  assert.equal(airborne.events.filter(e=>e.type==='push').length,0);assert.equal(airborne.state.push.force,0);assert.equal(airborne.state.velocity.z,5);
  assert.equal(airborne.state.sprinting,false);
});

test('harder sprint pushes preserve short planted sweeps, reverse stance and gentle-carve contacts', () => {
  for(const initial of [0,4,8,12.9])for(const direction of [-1,1]){
    const t=simulation();t.state.velocity.z=initial*direction;t.state.switched=direction<0;
    t.run(1/120,{push:true,sprint:true});let maximum=0;
    for(let i=0;i<100;i++){t.run(1/120);maximum=Math.max(maximum,t.state.push.plantedDistance);}
    assert.ok(maximum>0&&maximum<.55,`${initial}/${direction} contact stays within leg reach: ${maximum}`);
    assert.equal(t.state.bail,null);assert.equal(Math.sign(t.state.velocity.z),direction);
  }
  const gentle=simulation();gentle.state.velocity.z=6;gentle.run(.6,{push:true,sprint:true,steer:.2});
  assert.ok(gentle.events.some(e=>e.type==='push'));assert.equal(gentle.state.bail,null);
});
test('a push anticipates contact, drives through a finite planted stroke, and returns to coast', () => {
  const t = simulation();
  t.run(.12, {push: true});
  assert.equal(speed(t.state), 0, 'lifting and reaching the foot cannot propel the board');
  assert.equal(t.events.filter(e => e.type === 'push').length, 0);
  let largestStep = 0, previous = speed(t.state), maximumPlant = 0;
  for (let i = 0; i < 75; i++) {
    t.run(1 / 120);
    const current = speed(t.state);
    largestStep = Math.max(largestStep, current - previous); previous = current;
    maximumPlant = Math.max(maximumPlant, t.state.push.plantedDistance);
  }
  assert.ok(speed(t.state) > 2.4 && speed(t.state) < 2.65, 'one stroke transfers a bounded human-scale impulse');
  assert.ok(largestStep < .16, 'the force is spread over contact instead of an instantaneous speed kick');
  assert.ok(maximumPlant > .2 && maximumPlant < .55);
  assert.equal(t.events.filter(e => e.type === 'push').length, 1);
  assert.equal(t.state.push.active, false); assert.equal(t.state.push.phase, 1);
  assert.equal(t.state.push.force, 0); assert.equal(t.state.push.contact, false);
  const coast = speed(t.state); t.run(.2); assert.ok(speed(t.state) < coast);
});
test('faster pushes shorten shoe contact so a planted foot never drags meters behind the rider', () => {
  const spans = [];
  for (const initial of [0, 4, 8, 9.7]) {
    const t = simulation(); t.state.velocity.z = initial;
    t.run(1 / 120, {push: true}); spans.push(t.state.push.driveEnd - t.state.push.driveStart);
    let distance = 0;
    for (let i = 0; i < 100; i++) {
      t.run(1 / 120); distance = Math.max(distance, t.state.push.plantedDistance);
    }
    assert.ok(distance > 0 && distance < .55, `${initial} m/s planted travel: ${distance}`);
    assert.equal(t.state.bail, null);
  }
  assert.ok(spans[0] > spans[1] && spans[1] > spans[2] && spans[2] > spans[3]);
});
test('a push has comparable travel and impulse at 60 and 120 Hz, with no force during recovery', () => {
  function run(hz) {
    const state = createSkateState(); let previous = 0;
    for (let i = 0; i < hz * 4; i++) {
      const phase = state.push.phase;
      stepSkate(state, {push: true}, 1 / hz, {sample: () => 0});
      if (state.push.phase > state.push.driveEnd && phase > state.push.driveEnd && phase < 1) {
        assert.ok(speed(state) <= previous + 1e-8, 'recovering the foot cannot add momentum');
      }
      previous = speed(state);
    }
    return state;
  }
  const slow = run(60), fast = run(120);
  assert.ok(Math.abs(speed(slow) - speed(fast)) < .15);
  assert.ok(Math.abs(slow.position.z - fast.position.z) < .3);
});
test('switch pushes reinforce backward travel and never become a hidden forward motor', () => {
  const t = simulation(); t.state.velocity.z = -4; t.state.switched = true;
  t.run(.5, {push: true});
  assert.ok(t.state.velocity.z < -4.5); assert.equal(t.state.push.direction, -1);
  const fast = simulation(); fast.state.velocity.z = -13; fast.state.switched = true;
  fast.run(1, {push: true});
  assert.equal(fast.events.filter(e => e.type === 'push').length, 0);
  assert.ok(fast.state.velocity.z < -12, 'fast switch travel coasts instead of braking against propulsion');
});
test('crouching, braking, manual balance and leaving the surface cancel foot propulsion', () => {
  for (const interrupt of [{crouch: true}, {brake: true}, {manual: true}, {slide: true}, {pop: true}]) {
    const t = simulation(); t.run(.2, {push: true});
    t.run(1 / 120, {...interrupt, push: true});
    assert.equal(t.state.push.active, false); assert.equal(t.state.push.force, 0);
  }
});
test('gravity accelerates a coasting board downhill and slows an uphill board with no motor', () => {
  const down = simulation({sample: (_, z) => -z * .22}); down.run(18);
  assert.ok(speed(down.state) > 22); assert.equal(down.state.bail, null);
  const up = simulation({sample: (_, z) => z * .22}); up.state.velocity.z = 10; up.run(3);
  assert.ok(speed(up.state) < 5);
});
test('brakes and powerslides shed momentum while a high speed board cannot pivot instantly', () => {
  const coast = simulation(), brake = simulation(), slide = simulation();
  for (const t of [coast, brake, slide]) t.state.velocity.z = 12;
  coast.run(1); brake.run(1, {brake: true}); slide.run(1, {slide: true, steer: .6});
  assert.ok(speed(brake.state) < speed(coast.state) - 5);
  assert.ok(speed(slide.state) < speed(coast.state)); assert.ok(Math.abs(slide.state.heading) < 2);
});
test('carving builds and releases angular momentum while a stationary board stays planted', () => {
  const stopped = simulation(); stopped.run(1, {steer: 1}); assert.equal(stopped.state.heading, 0);
  const moving = simulation(); moving.state.velocity.z = 12;
  moving.run(.1, {steer: 1});
  const heading = moving.state.heading;
  assert.ok(heading < 0 && heading > -.04, 'the trucks and body load into the turn');
  moving.run(.1);
  assert.ok(moving.state.heading < heading, 'the carve unwinds smoothly after steering releases');
  moving.run(1);
  assert.ok(Math.abs(moving.state.turnRate) < .001);
  assert.ok(Math.abs(moving.state.lean) < .01);
});
test('bank weight points into measured lateral acceleration in both regular and fakie turns', () => {
  for (const travel of [-8, 8]) for (const steer of [-.6, .6]) {
    const t = simulation(); t.state.velocity.z = travel; t.state.switched = travel < 0;
    t.run(.8, {steer}); const before = {...t.state.velocity};
    t.run(1 / 120, {steer});
    const {heading, lean, velocity} = t.state;
    const lateralAcceleration = ((velocity.x - before.x) * Math.cos(heading) - (velocity.z - before.z) * Math.sin(heading)) * 120;
    // A rider/deck bank about local Z has up.x = -sin(bank). Its weight
    // shift must share the measured inward acceleration, even in reverse.
    assert.ok(-Math.sin(lean) * lateralAcceleration > .1, `${travel} m/s, steer ${steer}: lean ${lean}, acceleration ${lateralAcceleration}`);
  }
});
test('a loaded hard carve keeps both feet on the board and resumes pushing as it unwinds', () => {
  const t = simulation(); t.state.velocity.z = 8;
  t.run(.3, {steer: 1});
  const heading = t.state.heading, initial = speed(t.state);
  t.run(.4, {push: true, steer: 1});
  assert.equal(t.state.push.active, false); assert.equal(t.state.push.force, 0);
  assert.equal(t.events.filter(e => e.type === 'push').length, 0);
  assert.ok(t.state.heading < heading - .25, 'turning continues while the rider keeps both feet planted');
  assert.ok(speed(t.state) > initial * .85, 'the board keeps its momentum through the turn');
  t.run(1.2, {push: true});
  assert.ok(t.events.some(e => e.type === 'push'), 'holding push resumes strokes as lateral load releases');
  const gentle = simulation(); gentle.state.velocity.z = 6;
  gentle.run(.6, {push: true, steer: .2});
  assert.ok(gentle.events.some(e => e.type === 'push'), 'a gentle turn still permits a grounded push');
});
test('loading a sharp carve cancels a stroke before its planted force can twist the support leg', () => {
  const t = simulation(); t.state.velocity.z = 8;
  t.run(.05, {push: true}); assert.equal(t.state.push.active, true);
  t.run(.25, {push: true, steer: 1});
  assert.equal(t.state.push.active, false); assert.equal(t.state.push.force, 0);
  assert.equal(t.events.filter(e => e.type === 'push').length, 0);
});
test('landing impact compresses the legs over time and heavier landings absorb more load', () => {
  function land(impact) {
    const t = simulation({position: {y: .025}}); t.state.grounded = false; t.state.velocity.y = -impact;
    t.run(1 / 120);
    const initial = t.state.compression; let peak = initial;
    for (let i = 0; i < 50; i++) {t.run(1 / 120); peak = Math.max(peak, t.state.compression);}
    assert.equal(t.state.bail, null); assert.ok(peak > initial);
    assert.ok(peak < .34);
    t.run(1); assert.ok(Math.abs(t.state.compression - .025) < .001);
    return peak;
  }
  assert.ok(land(7) > land(3) + .02);
  const crouch = simulation(); crouch.run(.4, {crouch: true});
  assert.ok(crouch.state.compression > .23);
  const compressed = crouch.state.compression; crouch.run(1 / 120);
  assert.ok(crouch.state.compression > compressed - .025, 'pop extends the legs continuously');
});
test('charged ollies pop once on release, have ballistic air time, and bank a landed line once', () => {
  const t = simulation(); t.run(.4, {crouch: true}); assert.equal(t.state.grounded, true);
  t.run(1 / 120); assert.equal(t.state.grounded, false); assert.ok(t.state.velocity.y > 4.8);
  t.run(1.5); assert.equal(t.state.grounded, true); assert.equal(t.stats.ollies, 1);
  t.run(3); assert.equal(t.stats.total, 60); t.run(4); assert.equal(t.stats.total, 60);
  assert.equal(t.events.filter(e => e.type === 'pop').length, 1);
});
test('landed flips and grabs add distinct tricks to one combo', () => {
  const t = simulation(); t.run(.5, {crouch: true}); t.run(.05);
  t.run(1 / 120, {trick: 'kickflip'}); t.run(1.4, {grab: true});
  assert.equal(t.state.bail, null); assert.equal(t.stats.flips, 1);
  assert.ok(t.state.combo.tricks.includes('Kickflip')); assert.ok(t.state.combo.tricks.includes('Indy grab'));
  t.run(3); assert.ok(t.stats.bestLine >= 1000);
});
test('an unfinished flip or sideways landing bails and forfeits the open combo', () => {
  const t = simulation(); t.state.grounded = false; t.state.position.y = .08; t.state.velocity.y = -2;
  t.run(1 / 120, {trick: 'heelflip'}); t.run(.2);
  assert.match(t.state.bail.reason, /Catch/); assert.equal(t.stats.total, 0); assert.equal(t.stats.bails, 1);
  const sideways = simulation(); sideways.state.grounded = false; sideways.state.position.y = .06;
  sideways.state.airSpin = Math.PI / 2; sideways.state.velocity.y = -2; sideways.run(.1);
  assert.match(sideways.state.bail.reason, /sideways/);
});
test('a completed half turn lands switch and a steep drop requires a safe impact speed', () => {
  const t = simulation(); t.state.grounded = false; t.state.position.y = .04; t.state.airSpin = Math.PI; t.state.velocity.z = 7; t.state.velocity.y = -2;
  t.run(.1); assert.equal(t.state.bail, null); assert.equal(t.state.switched, true);
  const drop = simulation(); drop.state.grounded = false; drop.state.position.y = .04; drop.state.velocity.y = -14; drop.run(.1);
  assert.match(drop.state.bail.reason, /Heavy landing/);
});
test('both steering directions carve the same way before and after landing a 180', () => {
  for (const spin of [-1, 1]) for (const steer of [-1, 1]) {
    const regular = simulation(), fakie = simulation();
    regular.state.velocity.z = fakie.state.velocity.z = 7;
    fakie.run(.45, {crouch: true});
    fakie.run(1 / 120, {steer: spin});
    fakie.run(.65, {steer: spin});
    fakie.run(.55);
    assert.ok(fakie.events.some(e => e.type === 'land' && e.tricks.some(t => t.startsWith('180 '))));
    assert.equal(fakie.state.switched, true);
    for (const t of [regular, fakie]) {
      const previousX = t.state.position.x;
      t.run(.5, {steer});
      assert.ok(-steer * (t.state.position.x - previousX) > .3);
      assert.ok(-steer * t.state.velocity.x > .8);
    }
  }
});
test('crests launch the board instead of gluing it to the reverse side of a ramp', () => {
  const t = simulation({sample: (_, z) => z <= 2 ? z * .3 : 0});
  t.state.velocity.z = 8; t.run(.5); assert.equal(t.state.grounded, false); assert.ok(t.state.position.y > .4);
});
test('an airborne board contacts an uphill transition while still rising vertically',()=>{
  const t=simulation({sample:(_,z)=>z*.5,position:{y:.08}});
  t.state.grounded=false;t.state.velocity.z=8;t.state.velocity.y=1;
  t.run(.1);assert.equal(t.state.grounded,true);assert.equal(t.state.bail,null);
  assert.ok(Math.abs(t.state.position.y-t.state.position.z*.5)<1e-8);
});
test('rail detection, travel, scoring and pop-off use the physical rail segment', () => {
  const rail = {id: 'test', a: {x: 0, y: .6, z: 0}, b: {x: 0, y: .6, z: 12}};
  assert.ok(nearestRail({x: .1, y: .7, z: 3}, [rail])); assert.equal(nearestRail({x: 2, y: .7, z: 3}, [rail]), null);
  const t = simulation({position: {x: .1, y: .7, z: 2}, rails: [rail]}); t.state.grounded = false; t.state.velocity.z = 6; t.state.velocity.y = -1;
  t.run(.03); assert.equal(t.state.rail?.rail.id, 'test'); assert.equal(t.state.position.x, 0);
  t.run(.7); assert.ok(t.stats.grindMeters > 3); assert.ok(t.state.combo.tricks.includes('50-50 grind'));
  t.run(.1, {crouch: true}); t.run(.01); assert.equal(t.state.rail, null); assert.ok(t.state.velocity.y > 3);
});
test('swept head-on collisions bail while glancing travel preserves motion', () => {
  const t = simulation({move: p => ({...p})}); t.state.velocity.z = 12; t.run(.02);
  assert.match(t.state.bail.reason, /impact/); assert.equal(t.state.position.z, 0);
  const glance = simulation({move: (p, d) => ({x: p.x + d.x * .9, y: p.y, z: p.z + d.z * .9})});
  glance.state.velocity.z = 12; glance.run(.02); assert.equal(glance.state.bail, null);
});

test('solid impacts cause a ragdoll-triggering bail at normal cruising speeds and in air', () => {
  for (const airborne of [false, true]) {
    const t = simulation({position: {y: airborne ? 1 : 0}, move: p => ({...p})});
    t.state.grounded = !airborne; t.state.velocity.z = 3;
    t.run(1 / 120);
    assert.equal(t.state.bail?.reason, 'Heavy impact');
    assert.ok(t.state.bail.velocity.z > 2.9);
  }
  const slow = simulation({move: p => ({...p})}); slow.state.velocity.z = .5;
  slow.run(.1); assert.equal(slow.state.bail, null); assert.equal(speed(slow.state), 0);
});

test('board acceleration, cruising speed and jump distance change through the actual controller', () => {
  const ride = (board, seconds) => {
    const state = createSkateState({board});
    for (let i = 0; i < seconds * 120; i++) stepSkate(state, {sprint:true}, 1 / 120, {sample:()=>0});
    return state;
  };
  assert.ok(ride('cherry', 1).velocity.z > ride('classic', 1).velocity.z * 1.1);
  assert.ok(ride('bolt', 25).velocity.z > ride('classic', 25).velocity.z + 1.5);
  const jump = board => {
    const state = createSkateState({board}); state.velocity.z = 6; state.charge = .5;
    stepSkate(state, {pop:true}, 1 / 120, {sample:()=>0});
    let peak = 0;
    for (let i = 0; i < 240 && !state.grounded; i++) {
      stepSkate(state, {}, 1 / 120, {sample:()=>0});
      peak = Math.max(peak, state.position.y);
    }
    assert.equal(state.bail, null); assert.equal(state.grounded, true);
    return {peak, distance:state.position.z};
  };
  const regular = jump('classic'), springy = jump('bloom');
  assert.ok(springy.peak > regular.peak * 1.25);
  assert.ok(springy.distance > regular.distance * 1.1);
});
test('pause and malformed time cannot advance physics or mint points', () => {
  const t = simulation(); const before = structuredClone(t.state);
  for (const dt of [0, -10, NaN, Infinity]) stepSkate(t.state, {push: true}, dt, {sample: () => 0});
  // Infinite time is rejected, and zero or negative time has no effect.
  assert.deepEqual(t.state, before);
});
test('save migration preserves quests and adds bounded skating records without trusting invalid counters', () => {
  const p = createProgress(); assert.equal(p.skate.bestLine, 0);
  const older = validateProgress({version: 2, visited: ['hbll'], skate: {bestLine: 1200, topSpeed: 500, total: Infinity, bails: -4}});
  assert.deepEqual(older.visited, ['hbll']); assert.equal(older.skate.bestLine, 1200); assert.equal(older.skate.topSpeed, 40); assert.equal(older.skate.total, 0); assert.equal(older.skate.bails, 0);
});
test('bails are idempotent and banked points remain safe after later crashes', () => {
  const s = createSkateState(), stats = validateSkateStats(); s.combo.base = 500; s.combo.multiplier = 2;
  assert.equal(bankSkateLine(s, stats).score, 1000); assert.equal(bankSkateLine(s, stats), null);
  bailSkater(s, 'test', stats); bailSkater(s, 'repeat', stats);
  assert.equal(stats.total, 1000); assert.equal(stats.bails, 1);
});
test('fictional descent drops about 65 m, joins the yard continuously, and has a clear center lane', () => {
  const top = SPOT_STARTS.downhill.z;
  assert.ok(skateSpotHeight(downhillCenter(top), top) > 64);
  assert.ok(Math.abs(skateSpotHeight(0, -12.001) - skateSpotHeight(0, -11.999)) < .001);
  const t = simulation({position: {x: downhillCenter(top), y: skateSpotHeight(downhillCenter(top), top), z: top}, sample: skateSpotHeight});
  t.run(23, i => ({push: i < 120, brake: t.state.position.z > -8}));
  assert.equal(t.state.bail, null); assert.ok(t.stats.topSpeed > 70 / 3.6);
  assert.ok(t.state.position.z > -20); assert.ok(t.state.position.z < 94);
});
test('rigid body ragdoll has angular joint limits, separates the board, collides with terrain and settles', () => {
  const r = createSkateRagdoll({position: {x: 0, y: 0, z: 0}, velocity: {x: 2, y: 0, z: 10}, sample: () => 0});
  assert.equal(r.parts.length, 12); assert.equal(r.joints.length, 10);
  assert.ok(r.joints.every(j => j.angle > 0 && j.twistAngle > 0 && !j.collideConnected));
  for (let i = 0; i < 720; i++) r.step(1 / 120);
  for (const part of r.parts) {assert.ok(part.body.position.y > -.1, part.name + ' above ground'); assert.ok(Number.isFinite(part.body.position.x));}
  const board = r.parts.find(p => p.name === 'board').body;
  assert.ok(board.position.distanceTo(r.position) > .3); assert.ok(r.position.z > 1); assert.equal(r.settled, true);
  // Constraints must still hold the joints together after a hard tumble.
  for (const joint of r.joints) {
    const a = joint.bodyA.pointToWorldFrame(joint.pivotA), b = joint.bodyB.pointToWorldFrame(joint.pivotB);
    assert.ok(a.distanceTo(b) < .12);
  }
  r.dispose(); assert.equal(r.physics.bodies.length, 0); assert.equal(r.physics.constraints.length, 0);
});
