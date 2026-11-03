import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createAudio} from '../public/explorer/game/audio.mjs';

const UNIT = .044571444392204285;

async function actorModule() {
  const three = new URL('../public/campus/vendor/three.module.js', import.meta.url).href;
  const text = (await readFile(new URL('../public/explorer/game/actors.mjs', import.meta.url), 'utf8'))
    .replace("'/campus/vendor/three.module.js'", JSON.stringify(three));
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
}

test('procedural actors use campus scale, preserve foot transforms, and release every GPU resource once', async () => {
  const document = globalThis.document;
  globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => ({fillRect() {}, fillText() {}})})};
  try {
    const factories = await actorModule();
    const scene = new THREE.Scene();
    for (const name of ['createPlayer', 'createScooter', 'createCat', 'createCosmo', 'createCar', 'createMarker', 'createBench']) {
      const actor = factories[name](scene);
      assert.equal(actor.group.parent, scene, name);
      assert.deepEqual(actor.group.scale.toArray(), [UNIT, UNIT, UNIT]);
      actor.group.position.set(2, 1, -4); actor.group.rotation.y = .7;
      for (let i = 0; i < 120; i++) actor.update?.(1 / 60, {speed: 3, grounded: true, running: true, dance: true});
      assert.deepEqual(actor.group.position.toArray(), [2, 1, -4], 'animation must not move the physics-controlled foot anchor');
      actor.group.updateMatrixWorld(true);
      const geometry = new Set(), materials = new Set(), textures = new Set();
      actor.group.traverse(object => {
        for (const value of object.matrixWorld.elements) assert.ok(Number.isFinite(value), name + ' finite transforms');
        if (object.geometry) geometry.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material) continue; materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      assert.ok(geometry.size > 0);
      const size = new THREE.Box3().setFromObject(actor.group).getSize(new THREE.Vector3()).divideScalar(UNIT);
      assert.ok(size.y > .1 && size.y < 4, name + ' physical size');
      const resources = [...geometry, ...materials, ...textures], disposalCounts = new Map();
      for (const resource of resources) resource.addEventListener('dispose', () => disposalCounts.set(resource, (disposalCounts.get(resource) || 0) + 1));
      actor.dispose();
      assert.equal(actor.group.parent, null);
      for (const resource of resources) assert.equal(disposalCounts.get(resource), 1, name + ' disposes unique geometry/material/texture');
    }
    assert.equal(scene.children.length, 0);
  } finally {
    if (document === undefined) delete globalThis.document; else globalThis.document = document;
  }
});

function fakeAudio() {
  const originals = new Map(['AudioContext', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
  let id = 0, clock = 0;
  const intervals = new Map(), timeouts = new Map(), sources = [], contexts = [];
  class Param {
    constructor(value = 0) {this.value = value;}
    cancelScheduledValues() {}
    setTargetAtTime(value) {this.value = value;}
    setValueAtTime(value) {this.value = value;}
    linearRampToValueAtTime(value) {this.value = value;}
    exponentialRampToValueAtTime(value) {this.value = value;}
  }
  class Node {
    constructor(source = false) {
      for (const key of ['gain', 'frequency', 'Q', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Param();
      if (source) sources.push(this);
    }
    connect(destination) {this.connected=destination;}
    disconnect() {this.disconnected = true;}
    start(at) {this.startAt = at;}
    stop(at = clock) {this.stopAt = at;}
  }
  class Context {
    constructor() {contexts.push(this); this.state = 'suspended'; this.sampleRate = 24000; this.destination = new Node();}
    get currentTime() {return clock;}
    createGain() {return new Node();}
    createDynamicsCompressor() {return new Node();}
    createBiquadFilter() {return new Node();}
    createDelay() {return new Node();}
    createOscillator() {return new Node(true);}
    createBufferSource() {return new Node(true);}
    createBuffer(channels, length) {return {getChannelData: () => new Float32Array(length)};}
    async resume() {this.state = 'running';}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  globalThis.AudioContext = Context;
  globalThis.setInterval = callback => {intervals.set(++id, callback); return id;};
  globalThis.clearInterval = id => intervals.delete(id);
  globalThis.setTimeout = callback => {timeouts.set(++id, callback); return id;};
  globalThis.clearTimeout = id => timeouts.delete(id);
  return {
    contexts, intervals, timeouts, sources,
    advance(seconds) {
      clock += seconds;
      for (const callback of intervals.values()) callback();
      for (const source of sources) if (!source.ended && source.stopAt <= clock) {source.ended = true; source.onended?.();}
    },
    flushTimeouts() {const pending = [...timeouts.values()]; timeouts.clear(); for (const callback of pending) callback();},
    restore() {for (const [key, value] of originals) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}}
  };
}

test('sound remains opt-in, bounded over a long session, and releases timers/context on exit', async () => {
  const fake = fakeAudio(); const audio = createAudio();
  try {
    assert.equal(fake.contexts.length, 0, 'creating the game must not start audio');
    await audio.start();
    assert.equal(fake.contexts.length, 1); assert.equal(fake.intervals.size, 1);
    await audio.start(); assert.equal(fake.intervals.size, 1, 'repeated interaction must not multiply schedulers');
    let peak = 0;
    for (let i = 0; i < 6000; i++) {
      fake.advance(.05);
      peak = Math.max(peak, fake.sources.filter(source => !source.ended).length);
    }
    assert.ok(peak < 40, 'five-minute soundtrack has bounded concurrent voices');
    const beforeStall = fake.sources.length;
    fake.advance(120);
    assert.ok(fake.sources.length - beforeStall < 20, 'a tab stall must not emit a backlog of notes');
    audio.setMood('night'); audio.chime('quest');
    audio.pause(); assert.equal(fake.intervals.size, 0);
    fake.flushTimeouts(); await Promise.resolve(); assert.equal(fake.contexts[0].state, 'suspended');
    audio.resume(); await Promise.resolve(); await Promise.resolve(); assert.equal(fake.intervals.size, 1);
    audio.setEnabled(false); assert.equal(fake.intervals.size, 0);
    audio.dispose(); assert.equal(fake.contexts[0].state, 'closed');
    assert.equal(fake.intervals.size, 0); assert.equal(fake.timeouts.size, 0);
    await audio.start(); assert.equal(fake.contexts.length, 1, 'disposed game cannot restart its audio');
  } finally {audio.dispose(); fake.restore();}
});

test('muted start produces no music scheduler and denied audio resume is recoverable', async () => {
  const fake = fakeAudio(); const muted = createAudio();
  try {
    muted.setEnabled(false); await muted.start(); assert.equal(fake.intervals.size, 0);
    assert.equal(fake.contexts.length, 0, 'a muted player needs no audio context');
    muted.setEnabled(true); assert.equal(fake.contexts.length, 0);
    await muted.start(); assert.equal(fake.intervals.size, 1);
    muted.pause(); fake.flushTimeouts(); await Promise.resolve();
    fake.contexts[0].resume = async () => {throw new Error('NotAllowedError');};
    muted.resume(); await Promise.resolve(); await Promise.resolve(); assert.equal(fake.intervals.size, 0);
    fake.contexts[0].resume = async () => {fake.contexts[0].state = 'running';};
    await muted.start(); assert.equal(fake.intervals.size, 1, 'later explicit Play retries failed browser activation');
  } finally {muted.dispose(); fake.restore();}
});

test('level cosmetics recolor existing materials and airborne actors hide their ground shadow', async () => {
  const document = globalThis.document;
  globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => ({fillRect() {}, fillText() {}})})};
  const actors = [];
  try {
    const factories = await actorModule(), scene = new THREE.Scene();
    for (const name of ['createPlayer', 'createScooter']) {
      const actor = factories[name](scene); actors.push(actor);
      const before = new Set(); actor.group.traverse(object => {if (object.material) before.add(object.material);});
      const colors = [];
      for (const level of [1, 2, 3, 100, 1]) {
        actor.setStyle({level});
        const after = new Set(); actor.group.traverse(object => {if (object.material) after.add(object.material);});
        assert.deepEqual(after, before, 'cosmetics must reuse materials without allocations');
        const name = actor.group.name === 'Student explorer' ? 'Explorer jacket' : 'Scooter deck';
        colors.push([...after].find(material => material.name === name).color.getHex());
      }
      assert.notEqual(colors[0], colors[1]); assert.notEqual(colors[1], colors[2]);
      assert.equal(colors[2], colors[3], 'higher levels retain the highest authored palette');
      assert.equal(colors[0], colors[4], 'reset restores the starting palette');
    }
    const player = actors[0], shadow = player.group.getObjectByName('Ground shadow');
    assert.ok(shadow); assert.equal(shadow.castShadow, false); assert.equal(shadow.material.depthWrite, false);
    player.update(1 / 60, {grounded: false}); assert.equal(shadow.visible, false, 'no floating shadow during jumps');
    player.update(1 / 60, {grounded: true}); assert.equal(shadow.visible, true);
  } finally {
    for (const actor of actors) actor.dispose();
    if (document === undefined) delete globalThis.document; else globalThis.document = document;
  }
});

test('the articulated student bends knees and elbows, blends movement, and keeps slow walking in meters', async () => {
  const {createPlayer} = await actorModule(), player = createPlayer(new THREE.Scene());
  try {
    player.group.position.set(4, 2, -3); player.group.rotation.y = 1.2;
    for (const name of ['Left hip', 'Right hip', 'Left knee', 'Right knee', 'Left ankle', 'Right ankle', 'Left shoulder', 'Right shoulder', 'Left elbow', 'Right elbow']) assert.ok(player.group.getObjectByName(name), name);
    for (let frame = 0; frame < 60; frame++) player.update(1 / 60, {speed: .3});
    assert.equal(player.group.userData.animationState, 'walk', 'a slow analog walk must not be misread as fast native-unit movement');
    const kneeSamples = [];
    for (let frame = 0; frame < 90; frame++) {
      player.update(1 / 60, {speed: 5.8, running: true});
      kneeSamples.push(player.group.getObjectByName('Left knee').rotation.x);
    }
    assert.equal(player.group.userData.animationState, 'run');
    assert.ok(Math.max(...kneeSamples) - Math.min(...kneeSamples) > .6, 'running includes an articulated leg recovery');
    assert.ok(player.group.getObjectByName('Left elbow').rotation.x < -.65, 'run pose bends the elbow');
    assert.deepEqual(player.group.position.toArray(), [4, 2, -3]); assert.equal(player.group.rotation.y, 1.2);
    for (let frame = 0; frame < 150; frame++) player.update(1 / 60, {});
    assert.equal(player.group.userData.animationState, 'idle');
    assert.ok(Math.abs(player.group.getObjectByName('Left hip').rotation.x) < .001, 'leg swing settles after releasing movement');
    assert.ok(Math.abs(player.group.getObjectByName('Left knee').rotation.x - .035) < .001, 'running knee fold returns to rest');
    player.group.position.set(0, 0, 0); player.group.rotation.y = 0;
    const bounds = new THREE.Box3().setFromObject(player.group);
    assert.ok(bounds.min.y > -1e-6 && bounds.min.y < .01 * UNIT, 'standing shoes meet the foot-level anchor');
    assert.ok(bounds.max.y / UNIT > 1.7 && bounds.max.y / UNIT < 2, 'the student keeps a plausible height');
    let triangles = 0;
    player.group.traverse(object => {if (object.geometry) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;});
    assert.ok(triangles < 12000, 'articulation stays within a small procedural character budget');
  } finally {player.dispose();}
});

test('jumping, descending, landing and scooter controls have distinct recoverable body poses', async () => {
  const {createPlayer} = await actorModule(), player = createPlayer(new THREE.Scene());
  try {
    for (let i = 0; i < 30; i++) player.update(1 / 60, {grounded: false, verticalSpeed: 4});
    const risingKnee = player.group.getObjectByName('Left knee').rotation.x;
    assert.equal(player.group.userData.animationState, 'jump');
    for (let i = 0; i < 30; i++) player.update(1 / 60, {grounded: false, verticalSpeed: -3});
    assert.equal(player.group.userData.animationState, 'fall');
    assert.ok(risingKnee - player.group.getObjectByName('Left knee').rotation.x > .3);
    for (let i = 0; i < 30; i++) player.update(1 / 60, {grounded: true, landing: 1});
    assert.ok(player.group.getObjectByName('Right knee').rotation.x > .6, 'landing absorbs the impact with the knees');
    for (let i = 0; i < 30; i++) player.update(1 / 60, {riding: true, speed: 6, turn: 1, braking: true});
    assert.equal(player.group.userData.animationState, 'brake');
    assert.ok(player.group.getObjectByName('Explorer pelvis').rotation.z < -.1, 'the rider leans into steering');
    assert.ok(player.group.getObjectByName('Explorer torso').rotation.x < -.06, 'braking shifts the rider back');
    assert.ok(player.group.getObjectByName('Left shoulder').rotation.x < -.4, 'rider arms reach toward the handlebar');
    for (let i = 0; i < 120; i++) player.update(1 / 60, {});
    assert.ok(Math.abs(player.group.getObjectByName('Explorer pelvis').rotation.z) < .001);
    assert.ok(Math.abs(player.group.getObjectByName('Explorer torso').rotation.x) < .001);
  } finally {player.dispose();}
});

test('paused postcards explicitly apply wave, dance and relax without advancing the animation clock', async () => {
  const {createPlayer} = await actorModule(), player = createPlayer(new THREE.Scene());
  try {
    player.group.position.set(3, 2, -1); player.group.rotation.y = .8;
    const arm = player.group.getObjectByName('Right shoulder');
    player.update(0, {emote: true});
    assert.equal(arm.rotation.z, 0, 'an ordinary zero-delta render must retain the blended pose');
    player.update(0, {emote: true, instant: true});
    assert.ok(arm.rotation.z > 2.5, 'Capture postcard can apply the chosen wave while simulation is paused');
    const wave = arm.rotation.toArray();
    player.update(0, {emote: true, instant: true});
    assert.deepEqual(arm.rotation.toArray(), wave, 'repeated paused capture keeps the same gesture phase');
    player.update(0, {dance: true, instant: true});
    assert.ok(arm.rotation.z > 1.2 && arm.rotation.z < 1.4);
    assert.ok(player.group.getObjectByName('Left shoulder').rotation.z < -1.2, 'dance applies both arms immediately');
    player.update(0, {instant: true});
    assert.ok(Math.abs(arm.rotation.z - .055) < 1e-12, 'Relax removes the prior photo gesture immediately');
    assert.equal(player.group.userData.animationState, 'idle');
    assert.deepEqual(player.group.position.toArray(), [3, 2, -1]); assert.equal(player.group.rotation.y, .8);
  } finally {player.dispose();}
});

test('crash and trip poses stay above ground, preserve the physics anchor, and recover without stuck gestures', async () => {
  const {createPlayer} = await actorModule(), player = createPlayer(new THREE.Scene());
  try {
    for (const kind of ['crash', 'trip']) for (const direction of [-1, 1]) {
      player.group.position.set(1, 0, -2); player.group.rotation.y = .7;
      for (let i = 0; i <= 30; i++) {
        player.update(1 / 60, {grounded: true, emote: true, dance: true, stumble: {kind, phase: i / 30, direction}});
        assert.deepEqual(player.group.position.toArray(), [1, 0, -2]); assert.equal(player.group.rotation.y, .7);
        const bounds = new THREE.Box3().setFromObject(player.group);
        assert.ok(bounds.min.y > -1e-6, `${kind} keeps hands, shoes and backpack above the local ground plane`);
      }
      player.update(1 / 60, {stumble: {kind, phase: .4, direction}});
      assert.equal(player.group.userData.animationState, kind);
      assert.ok(new THREE.Box3().setFromObject(player.group).getSize(new THREE.Vector3()).y / UNIT < 1.1, 'a fall changes the silhouette into a low recovery pose');
      assert.equal(Math.sign(player.group.getObjectByName('Explorer pelvis').rotation.z), direction);
      for (let frame = 0; frame < 180; frame++) player.update(1 / 60, {});
      assert.equal(player.group.userData.animationState, 'idle');
      assert.ok(Math.abs(player.group.getObjectByName('Explorer pelvis').rotation.x) < .001);
      assert.ok(Math.abs(player.group.getObjectByName('Explorer pelvis').position.z) < .001);
      assert.ok(Math.abs(player.group.getObjectByName('Right shoulder').rotation.z - .055) < .001, 'fall and wave states leave no raised arm behind');
    }
  } finally {player.dispose();}
});

test('obstruction falls recoil away from impact and keep the leading silhouette inside the collision radius', async () => {
  const {createPlayer} = await actorModule(), player = createPlayer(new THREE.Scene()), point = new THREE.Vector3();
  try {
    const heading = .7, anchor = new THREE.Vector3(1, 0, -2);
    player.group.position.copy(anchor); player.group.rotation.order = 'YXZ'; player.group.rotation.y = heading;
    for (const riding of [false, true]) for (const kind of ['trip', 'crash']) for (const angle of [0, Math.PI / 2, Math.PI]) for (const slope of riding ? [-.18, 0, .18] : [0]) {
      player.group.rotation.x = slope; player.group.rotation.z = slope * .5;
      const impactYaw = heading + angle, forward = new THREE.Vector3(Math.sin(impactYaw), 0, Math.cos(impactYaw)), radius = riding ? .45 : .32;
      for (let frame = 1; frame < 40; frame++) {
        player.update(1 / 60, {riding, grounded: true, stumble: {kind, phase: frame / 40, direction: frame % 2 ? 1 : -1, impactYaw}});
        player.group.updateMatrixWorld(true);
        let leading = -Infinity;
        player.group.getObjectByName('Explorer pelvis').traverse(object => {
          if (!object.isMesh) return;
          const bounds = object.geometry.boundingBox;
          for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
            point.set(x, y, z).applyMatrix4(object.matrixWorld).sub(anchor);
            leading = Math.max(leading, point.dot(forward) / UNIT);
          }
        });
        assert.ok(leading <= radius + 1e-6, `${kind}, riding=${riding}, angle=${angle}, phase=${frame / 40}: body stays behind the obstructed capsule edge (${leading}m)`);
        assert.deepEqual(player.group.position.toArray(), anchor.toArray()); assert.equal(player.group.rotation.y, heading);
      }
      player.update(1 / 60, {riding, grounded: true, stumble: {kind, phase: .4, direction: 1, impactYaw}});
      player.group.updateMatrixWorld(true);
      const head = player.group.getObjectByName('Explorer head').getWorldPosition(point).sub(anchor);
      assert.ok(head.dot(forward) / UNIT < -.35, 'head recoils into the space behind the impact, including shift-lock side/back movement');
    }
  } finally {player.dispose();}
});

test('scooter steering, brake lamp and recoverable tip preserve heading and terrain roll', async () => {
  const {createScooter} = await actorModule(), scooter = createScooter(new THREE.Scene());
  try {
    scooter.group.position.set(2, 1, 3); scooter.group.rotation.y = -.4;
    for (let frame = 0; frame < 30; frame++) scooter.update(1 / 60, {speed: 5, turn: 1, braking: true, groundRoll: .12});
    assert.equal(scooter.group.rotation.z, .12); assert.equal(scooter.group.rotation.y, -.4);
    assert.deepEqual(scooter.group.position.toArray(), [2, 1, 3]);
    assert.ok(scooter.group.getObjectByName('Scooter steering').rotation.y > .3);
    const brake = scooter.group.getObjectByName('Scooter frame').children.find(object => object.material?.name === 'Scooter brake light').material;
    assert.ok(brake.emissiveIntensity > 1);
    scooter.update(1 / 60, {groundRoll: .12, stumble: {kind: 'crash', phase: .4, direction: -1}});
    assert.ok(scooter.group.getObjectByName('Scooter frame').rotation.z < -1.2, 'scooter tips with the crash');
    for (let frame = 0; frame < 150; frame++) scooter.update(1 / 60, {groundRoll: .12});
    assert.equal(scooter.group.rotation.z, .12);
    assert.ok(Math.abs(scooter.group.getObjectByName('Scooter frame').rotation.z) < .001);
    assert.ok(Math.abs(scooter.group.getObjectByName('Scooter frame').position.y) < .001);
    assert.ok(Math.abs(scooter.group.getObjectByName('Scooter steering').rotation.y) < .001);
    assert.equal(brake.emissiveIntensity, .3);
  } finally {scooter.dispose();}
});

test('the music puzzle plays three distinct ordered tones and respects mute', async () => {
  const fake = fakeAudio(), audio = createAudio();
  try {
    await audio.start();
    const tones = [];
    for (let index = 0; index < 3; index++) {
      const before = fake.sources.length; audio.playNote(index);
      assert.equal(fake.sources.length - before, 2, 'one gentle fundamental and a quiet overtone');
      tones.push(fake.sources[before].frequency.value);
    }
    assert.ok(tones[0] < tones[1] && tones[1] < tones[2], 'three puzzle buttons sound audibly distinct');
    const beforeInvalid = fake.sources.length; audio.playNote(-1); audio.playNote(3); audio.playNote('invalid');
    assert.equal(fake.sources.length, beforeInvalid, 'invalid puzzle keys do not emit arbitrary notes');
    audio.setEnabled(false); audio.playNote(1); audio.chime('pet');
    assert.equal(fake.sources.length, beforeInvalid, 'muted puzzle and pet sounds stay silent');
  } finally {audio.dispose(); fake.restore();}
});

test('synthesized puzzle effects honor their own mixer even when recorded audio is unavailable',async()=>{
 const fake=fakeAudio(),audio=createAudio();
 try{audio.setMix({musicVolume:0,effectsVolume:0});await audio.start();const before=fake.sources.length;audio.playNote(0);const output=fake.sources[before].connected.connected.connected;assert.equal(output.gain.value,0);audio.setMix({effectsVolume:.4});assert.equal(output.gain.value,.4);audio.pause();fake.flushTimeouts();}finally{audio.dispose();fake.restore();}
});

test('campus life instances have finite transforms before the first paused render and release GPU resources',async()=>{
 const original=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({},{get:(target,key)=>target[key]??(()=>{})})})};
 let scenery;
 try{
  const three=new URL('../public/campus/vendor/three.module.js',import.meta.url).href,content=new URL('../public/explorer/game/content.mjs',import.meta.url).href;
  const text=(await readFile(new URL('../public/explorer/game/scenery.mjs',import.meta.url),'utf8')).replace("'/campus/vendor/three.module.js'",JSON.stringify(three)).replace(/'\.\/content\.mjs(?:\?v=[^']+)?'/,JSON.stringify(content));
  const {createScenery}=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
  const scene=new THREE.Scene();scenery=createScenery(scene,{groundHeight:()=>1,move:p=>({...p})});
  const verify=()=>scene.traverse(o=>{if(o.instanceMatrix)for(const n of o.instanceMatrix.array)assert.ok(Number.isFinite(n),'finite instanced placement');});
  verify();scenery.update(.016,1,{night:true});verify();
  const resources=new Set();scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);for(const value of Object.values(o.material))if(value?.isTexture)resources.add(value);}});
  const disposed=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));scenery.dispose();for(const resource of resources)assert.equal(disposed.get(resource),1);assert.equal(scene.children.length,0);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
