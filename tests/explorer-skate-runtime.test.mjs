import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createProgress} from '../public/explorer/game/progress.mjs';
import {createCollisionIndex} from '../public/explorer/game/world.mjs';
const UNIT = .044571444392204285;
const artUrl = new URL('../public/explorer/game/skate-art.mjs', import.meta.url);
async function browserModule(url, replacements = {}) {
  let source = await readFile(url, 'utf8');
  source = source.replaceAll("'/campus/vendor/three.module.js'", JSON.stringify(new URL('../public/campus/vendor/three.module.js', import.meta.url).href));
  source = source.replace(/from '(\.\.?\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(replacements[path.split('?')[0]] || new URL(path, url).href));
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}
const fakeDocument = {createElement: () => ({width: 0, height: 0, getContext: () => ({fillRect() {}, fillText() {}})})};

test('board and course art stay in the meter frame, hide until selected, and release unique GPU assets', async () => {
  const saved = globalThis.document; globalThis.document = fakeDocument;
  try {
    const art = await import(await browserModule(artUrl)), scene = new THREE.Scene();
    const board = art.createSkateboard(scene), spots = art.createSkateSpots(scene, {groundHeight: () => 1});
    assert.deepEqual(board.group.scale.toArray(), [UNIT, UNIT, UNIT]); assert.equal(spots.root.visible, false);
    const top = spots.start('downhill'), bottom = spots.start('yard');
    assert.ok(spots.height(top.x, top.z) - spots.height(bottom.x, bottom.z) > 64 * UNIT);
    for (const rail of spots.rails) assert.ok(rail.a.y > spots.height(rail.a.x * UNIT, rail.a.z * UNIT) / UNIT);
    const trunks = spots.root.getObjectByName('Course pine trunks'), grass = spots.root.children[0];
    const ray = new THREE.Raycaster(), matrix = new THREE.Matrix4(), root = new THREE.Vector3();
    const downward = new THREE.Vector3(0, -1, 0);
    spots.root.updateMatrixWorld(true);
    assert.equal(trunks.count, 110);
    for (let i = 0; i < trunks.count; i++) {
      trunks.getMatrixAt(i, matrix);
      for (let side = 0; side < 6; side++) {
        const angle = side * Math.PI / 3;
        root.set(.2 * Math.sin(angle), -.9, .2 * Math.cos(angle));
        root.applyMatrix4(matrix).applyMatrix4(trunks.matrixWorld);
        ray.set(root.clone().add(new THREE.Vector3(0, UNIT, 0)), downward);
        const ground = ray.intersectObject(grass, false)[0];
        assert.ok(ground && root.y <= ground.point.y, `pine ${i} root ${side} sits below the rendered grass`);
      }
    }
    const geometry = new Set(), materials = new Set(), textures = new Set(), instances = [];
    scene.traverse(o => {if (o.geometry) geometry.add(o.geometry); if (o.material) {materials.add(o.material); if(o.material.map)textures.add(o.material.map);} if(o.isInstancedMesh)instances.push(o);});
    const resources = [...geometry, ...materials, ...textures, ...instances], counts = new Map();
    for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
    board.dispose(); spots.dispose(); assert.equal(scene.children.length, 0);
    for(const resource of resources)assert.equal(counts.get(resource),1,resource.type);
  } finally {if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});

test('the visible board pivots a manual around the rear truck and wheels roll about their physical axles', async () => {
  const {createSkateboard} = await import(await browserModule(artUrl)), scene = new THREE.Scene(), board = createSkateboard(scene);
  try {
    const deck = board.group.getObjectByName('Skateboard deck frame'), wheels = [];
    board.group.traverse(o => {if (o.name === 'Skateboard wheel axle') wheels.push(o);});
    const state = {grounded:true,heading:0,pitch:0,lean:0,velocity:{x:0,z:5},manualTime:1};
    board.update(.05, state);board.group.updateMatrixWorld(true);
    assert.ok(deck.rotation.x < -.15, 'the nose rises with manual balance');
    const centers = wheels.map(w => w.getWorldPosition(new THREE.Vector3()).divideScalar(UNIT));
    assert.ok(centers.filter(p=>p.z<0).every(p=>Math.abs(p.y-.055)<.002), 'rear truck supports the board');
    assert.ok(centers.filter(p=>p.z>0).every(p=>p.y>.14), 'front truck leaves the road');
    const angle=wheels[0].rotation.x;
    board.update(.05,{...state,velocity:{x:0,z:-5}});
    assert.ok(Math.abs(wheels[0].rotation.x)<1e-10,'switch travel reverses axle rotation');
    assert.ok(angle>0);assert.equal(wheels[0].children[0].rotation.z,Math.PI/2,'wheel mesh remains aligned with its axle');
    for (const lean of [-.48, 0, .48]) for (const manualTime of [0, 1]) {
      board.update(0,{...state,lean,manualTime});board.group.updateMatrixWorld(true);
      let bottom=Infinity;
      for(const axle of wheels)for(const child of axle.children){
        const positions=child.geometry.attributes.position,point=new THREE.Vector3();
        for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(child.matrixWorld);bottom=Math.min(bottom,point.y/UNIT);}
      }
      assert.ok(bottom>=-1e-6,`actual tire vertices stay above the road while banking ${lean} / manual ${manualTime}: ${bottom}`);
      assert.ok(bottom<.003,'the loaded wheels keep supporting the board');
    }
  } finally {board.dispose();}
});

test('the exact riding skateboard transfers to a rigid body without changing any visible part or transform', async () => {
  const {createSkateboard}=await import(await browserModule(artUrl)),board=createSkateboard(new THREE.Scene());
  try {
    for(const extra of [{manualTime:0},{manualTime:1},{grounded:false,airTime:.15,airTricks:['Ollie'],trick:{name:'kickflip',elapsed:.17,seconds:.48}}]){
      board.group.position.set(.8,.9,-.4);board.group.rotation.y=.7;
      board.update(0,{grounded:true,heading:.7,pitch:.2,lean:.3,velocity:{x:0,z:4},...extra});board.group.updateMatrixWorld(true);
      const before=[];board.group.traverse(o=>{if(o.isMesh)before.push({object:o,geometry:o.geometry,material:o.material,matrix:o.matrixWorld.clone()});});
      const pose=board.rigidPose();board.updateRigid({position:pose.position,quaternion:pose.quaternion});board.group.updateMatrixWorld(true);
      for(const part of before){
        assert.equal(part.object.geometry,part.geometry);assert.equal(part.object.material,part.material);
        part.matrix.elements.forEach((value,i)=>assert.ok(Math.abs(value-part.object.matrixWorld.elements[i])<1e-12,'a crash hands off the complete rendered pose'));
      }
      assert.equal(board.group.children[0].name,'Skateboard deck frame');
    }
  } finally {board.dispose();}
});

test('runtime samples the push shoe pavement and pausing cancels an unfinished drive', async () => {
  const saved=globalThis.document;globalThis.document=fakeDocument;
  let runtime;
  try {
    const art=await browserModule(artUrl);
    const {createSkateRuntime}=await import(await browserModule(new URL('../public/explorer/game/skate-runtime.mjs',import.meta.url),{'./skate-art.mjs':art}));
    const scene=new THREE.Scene(),player={group:new THREE.Group()},progress=createProgress();scene.add(player.group);
    const height=(x,z)=>1+(x-2.85)*.12+(z+1)*.03;
    const world={groundHeight:height,supportHeight:height,groundPose:()=>({pitch:0,roll:0}),groundSurface:()=>3,move:(p,d)=>p.clone().add(d),cameraPosition:(_,p)=>p.clone(),wallsNear:()=>[]};
    runtime=createSkateRuntime({scene,world,player,getProgress:()=>progress,toast(){},persist(){},audio:{foley(){},chime(){}}});
    runtime.start({x:2.85,z:-1,heading:0});runtime.step(1/120,{push:true});
    const state=runtime.state;
    const expected=height((state.position.x+.31)*UNIT,(state.position.z+.18)*UNIT)/UNIT;
    assert.ok(Math.abs(state.push.groundHeight-expected)<1e-8,'plant uses the actual adjacent surface');
    for(let i=0;i<22;i++)runtime.step(1/120,{push:true});
    assert.ok(state.push.contact&&state.push.force>0);
    runtime.suspend();assert.equal(state.push.active,false);assert.equal(state.push.contact,false);assert.equal(state.push.force,0);
    runtime.step(1/120,{});assert.equal(state.push.active,false,'cleared held input cannot restart the stroke');
    runtime.start({x:2.85,z:-1,heading:0});
    for(let i=0;i<23;i++)runtime.step(1/120,{push:true});
    const stroke=runtime.state.push;
    assert.ok(stroke.plantPosition&&stroke.contact,'the force-bearing plant is captured on its fixed tick');
    for(let i=0;i<80&&stroke.contact;i++)runtime.step(1/120,{});
    assert.ok(stroke.releaseFoot&&Object.values(stroke.releaseFoot).every(Number.isFinite),'lift-off is captured before the next render');
    assert.ok(stroke.releaseFoot.z>-.5&&stroke.releaseFoot.z<.2,'recovery begins within leg reach');
  } finally {runtime?.dispose();if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});

test('live skating runtime freezes recovery while paused, restores from a bail, and preserves the session marker', async () => {
  const saved = globalThis.document; globalThis.document = fakeDocument;
  try {
    const art = await browserModule(artUrl);
    const {createSkateRuntime} = await import(await browserModule(new URL('../public/explorer/game/skate-runtime.mjs', import.meta.url), {'./skate-art.mjs': art}));
    const scene = new THREE.Scene(), progress = createProgress(), player = {group: new THREE.Group()};scene.add(player.group);
    const world = {groundHeight:()=>1,supportHeight:()=>1,groundPose:()=>({height:1,pitch:0,roll:0}),groundSurface:()=>3,
      move:(p,d)=>p.clone().add(d),cameraPosition:(_,p)=>p.clone(),wallsNear:()=>[],setCourseView:v=>world.courseView=v};
    let saves = 0;
    const runtime = createSkateRuntime({scene,world,player,getProgress:()=>progress,toast(){},persist(){saves++;},audio:{foley(){},chime(){}}});
    runtime.start(runtime.spots.start('yard')); runtime.update(0); assert.equal(world.courseView,true);
    const marker = {...runtime.marker};
    for(let i=0;i<120;i++)runtime.step(1/120,{push:true});
    assert.ok(player.group.position.z > marker.z); assert.ok(runtime.state.velocity.z > 2);
    const boardId=runtime.board.group.uuid,assets=new Set(),disposed=[];
    runtime.board.group.traverse(o=>{if(o.geometry)assets.add(o.geometry);if(o.material)assets.add(o.material);});
    for(const asset of assets)asset.addEventListener('dispose',()=>disposed.push(asset));
    runtime.step(1/120,{bail:true});assert.equal(player.group.visible,true);assert.equal(progress.skate.bails,1);
    assert.equal(runtime.board.group.uuid,boardId);assert.equal(runtime.board.group.visible,true,'the same complete skateboard remains visible during a crash');
    assert.equal(scene.getObjectByName('Skater crash body'),undefined,'the crash never creates a replacement character');
    const bailBoardPosition=runtime.board.group.position.clone();
    for(let i=0;i<24;i++)runtime.step(1/120,{});runtime.update(0);
    assert.ok(runtime.board.group.position.distanceTo(bailBoardPosition)>.01*UNIT,'the original board follows the loose rigid body');
    const phase=runtime.recovering;runtime.update(0);runtime.suspend();assert.deepEqual(runtime.recovering,phase,'rendering and pausing do not advance a ragdoll');
    for(let i=0;i<650;i++)runtime.step(1/120,{});
    assert.equal(player.group.visible,true);assert.equal(runtime.state.bail,null);assert.equal(runtime.recovering,null);
    assert.equal(runtime.board.group.uuid,boardId);assert.equal(disposed.length,0,'recovering disposes the crash body without disposing the riding board');
    runtime.resetMarker();assert.ok(Math.abs(player.group.position.z-marker.z)<1e-8);assert.ok(Math.abs(player.group.position.x-marker.x)<1e-8);
    const rail=runtime.spots.rails.find(r=>r.id==='flat');
    runtime.start({x:rail.a.x*UNIT,z:(rail.a.z-4)*UNIT,heading:0});runtime.state.velocity.z=7;
    for(let i=0;i<100&&!runtime.state.bail;i++)runtime.step(1/120,{});
    assert.ok(runtime.state.bail,'a rider on the ground hits the visible rail instead of passing through it');
    assert.ok(player.group.position.z<rail.a.z*UNIT);runtime.resetMarker();
    assert.ok(saves>0);runtime.stop();assert.equal(runtime.active,false);
    player.group.position.set(2.85,1,-1);runtime.update(0);assert.equal(world.courseView,false);
    runtime.dispose();player.group.removeFromParent();assert.equal(scene.children.length,0);
  } finally {if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});

test('the skateboard rolls up and down a campus curb while full-height walls still cause impacts', async () => {
  const saved = globalThis.document; globalThis.document = fakeDocument;
  let runtime;
  try {
    const art = await browserModule(artUrl);
    const {createSkateRuntime} = await import(await browserModule(new URL('../public/explorer/game/skate-runtime.mjs', import.meta.url), {'./skate-art.mjs': art}));
    const point = (x, y, z) => [x * UNIT, y * UNIT, z * UNIT];
    const floor = (left, right, y, surface) => {
      const a = point(left, y, -2), b = point(left, y, 20), c = point(right, y, 20), d = point(right, y, -2);
      return [{kind:'ground', surface, a, b, c}, {kind:'ground', surface, a, b:c, c:d}];
    };
    const world = createCollisionIndex([
      ...floor(-5, 0, 0, 2), ...floor(0, 5, .13, 3),
      // This curb face's remote uphill end used to block its whole length.
      {kind:'wall', a:point(0, 0, -2), b:point(0, .70, 20), c:point(0, .13, -2)},
      {kind:'wall', a:point(-.12, 0, 3), b:point(-.12, .35, 5), c:point(-.12, .35, 3)},
      {kind:'wall', a:point(2.5, .13, -2), b:point(2.5, 2.6, 2), c:point(2.5, .13, 2)},
      {kind:'wall', a:point(2.5, .13, -2), b:point(2.5, 2.6, 2), c:point(2.5, 2.6, -2)},
      {kind:'wall', a:point(2.5, .13, 3), b:point(2.5, .48, 5), c:point(2.5, .48, 3)}
    ]);
    const scene = new THREE.Scene(), player = {group:new THREE.Group()}, progress = createProgress();
    runtime = createSkateRuntime({scene, world, player, getProgress:()=>progress, toast(){}, persist(){}, audio:{foley(){},chime(){}}});
    for (const z of [0, 4]) {
      for (const direction of [-1, 1]) {
        runtime.start({x:-direction * .65 * UNIT, z:z * UNIT, heading:direction * Math.PI / 2});
        runtime.state.velocity.x = direction * 8;
        for (let i = 0; i < 22; i++) {
          runtime.step(1 / 120, {});
          assert.equal(runtime.state.bail, null);
          assert.equal(runtime.state.grounded, true);
        }
        assert.ok(runtime.state.position.x * direction > .55);
        assert.ok(Math.abs(runtime.state.position.y - (direction > 0 ? .13 : 0)) < 1e-9);
      }
      for (let i = 0; i < 40 && !runtime.state.bail; i++) runtime.step(1 / 120, {});
      assert.equal(runtime.state.bail?.reason, 'Heavy impact');
      assert.ok(runtime.state.position.x < 2.5);
    }
  } finally {runtime?.dispose();if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}
});

test('terrain skirts above continuous ground do not act as walls while authored low obstacles stay solid', () => {
  const point=(x,y,z)=>[x*UNIT,y*UNIT,z*UNIT];
  const ground=[
    {kind:'ground',surface:1,a:point(-4,0,-4),b:point(-4,0,4),c:point(4,0,4)},
    {kind:'ground',surface:1,a:point(-4,0,-4),b:point(4,0,4),c:point(4,0,-4)}
  ];
  const triangle={kind:'wall',a:point(0,0,-3),b:point(0,.32,3),c:point(0,.32,-3)};
  for(const terrain of [true,false]){
    const world=createCollisionIndex([...ground,{...triangle,terrain}]);
    const start={x:-.28*UNIT,y:0,z:0};
    const result=world.move(start,{x:.5*UNIT,z:0},.27*UNIT,{grounded:false,skating:true,rolling:true});
    if(terrain)assert.ok(result.x>.20*UNIT,'terrain mesh skirt is traversable above continuous ground');
    else assert.ok(result.x<-.26*UNIT,'the same geometry authored as an obstacle stays solid');
  }
});
