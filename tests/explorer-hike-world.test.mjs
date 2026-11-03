import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createHikeManager} from '../public/explorer/game/world.mjs';
import {HIKE_UNIT as U,createHikeSurface,clipTriangleOutsideBounds,maskValleyForHike,loadHikingWorld} from '../public/explorer/game/hike-world.mjs';
import {auditHikeAssets} from '../scripts/audit-explorer-hike.mjs';

function fixture(){
  const points=[{x:2*U,y:.2*U,z:2*U},{x:8*U,y:.8*U,z:8*U}];
  const data={revision:'20261102hike1',unit:U,terrain:{url:'/explorer/hike/heights.bin',width:11,height:11,minX:0,minZ:0,stepX:U,stepZ:U},points,
    branches:[{id:'spur',points:[points[1],{x:8*U,y:.7*U,z:6*U}]}],
    checkpoints:[{...points[0],id:'trailhead',pointIndex:0,kind:'trailhead'},{...points[1],id:'top',pointIndex:1,kind:'top'}],
    y:{outline:[[3*U,3*U],[3*U,4*U],[4*U,4*U],[4*U,3*U]]}};
  const heights=Float32Array.from({length:121},(_,i)=>(i%11+Math.floor(i/11))*.05*U);
  return {data,heights};
}
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{const n=polygon[(i+1)%polygon.length];return sum+p[0]*n[2]-n[0]*p[2];},0))/2;

test('hiking sampler uses the exact terrain triangles, bounded movement and physical support',()=>{
  const {data,heights}=fixture(),world=createHikeSurface(data,heights);
  near(world.groundHeight(5*U,5*U),.5*U);
  assert.equal(world.groundHeight(-U,0),null);
  assert.equal(world.groundHeight(Infinity,0),null);
  assert.ok(world.supportHeight(5*U,5*U)>.5*U);
  assert.ok(world.groundPose(5*U,5*U).pitch<0);
  const start={x:2*U,y:.2*U,z:2*U};
  const up=world.move(start,{x:6*U,z:6*U});near(up.x,8*U);near(up.z,8*U);near(up.y,.8*U);
  const down=world.move(up,{x:-6*U,z:-6*U});near(down.x,start.x);near(down.z,start.z);near(down.y,start.y);
  const airborne=world.move({...start,y:U},{x:U,z:U},.32*U,{grounded:false});near(airborne.y,U);
  const blocked=world.move({x:5*U,y:.5*U,z:5*U},{x:-5*U,z:5*U});
  assert.ok(world.walkable(blocked.x,blocked.z,.32*U));assert.ok(blocked.x>U||blocked.z<9*U);
  assert.equal(world.nearestRoute(8*U,6*U).routeId,'spur');
  assert.equal(world.data.route,world.route);
  assert.equal(world.terrainHeight,world.groundHeight);
});

test('the full off-path hillside obstructs the camera, not only the trail strip',()=>{
  const {data,heights}=fixture();
  for(let row=0;row<11;row++)for(let col=0;col<11;col++)heights[row*11+col]=col*.4*U;
  const world=createHikeSurface(data,heights),target={x:5*U,y:2.5*U,z:U},desired={x:10*U,y:2.5*U,z:U};
  const camera=world.cameraPosition(target,desired);assert.ok(camera.x<desired.x);
  assert.ok(camera.y>=world.groundHeight(camera.x,camera.z)+.2*U);
});

test('untrusted/missing terrain and out-of-tile routes fail before creating geometry',()=>{
  const {data,heights}=fixture();
  assert.throws(()=>createHikeSurface(data,new Float32Array(5)),/incomplete/);
  assert.throws(()=>createHikeSurface({...data,unit:undefined},heights),/incomplete/);
  assert.throws(()=>createHikeSurface({...data,points:[data.points[0],{x:100,y:0,z:0}]},heights),/beyond/);
  assert.throws(()=>createHikeSurface({...data,checkpoints:[data.checkpoints[0],data.checkpoints[0]]},heights),/checkpoint/);
  heights[2]=NaN;assert.throws(()=>createHikeSurface(data,heights),/elevation/);
});

test('rectangular backdrop subtraction conserves the remainder and interpolates attributes',()=>{
  const triangle=[[-2,0,-2,0],[2,0,-2,4],[0,0,2,2]],bounds={minX:-.5,minZ:-.5,maxX:.5,maxZ:.5};
  const pieces=clipTriangleOutsideBounds(triangle,bounds);
  near(pieces.reduce((sum,p)=>sum+area(p),0),7);
  for(const vertex of pieces.flat())near(vertex[3],vertex[0]+2);
  assert.equal(clipTriangleOutsideBounds([[0,0,0],[.1,0,0],[0,0,.1]],bounds).length,0);
  near(clipTriangleOutsideBounds([[3,0,3],[4,0,3],[3,0,4]],bounds).reduce((sum,p)=>sum+area(p),0),.5);
});

test('backdrop masking restores geometry and removes the displaced decorative Y independently of the tile',()=>{
  const scene=new THREE.Group(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-2,0,-2,2,0,-2,0,0,2, 5,1,5,6,1,5,5,1,6],3));
  geometry.setAttribute('color',new THREE.Uint8BufferAttribute([100,125,75,100,125,75,100,125,75, 255,255,255,255,255,255,255,255,255],3,true));
  geometry.setAttribute('normal',new THREE.Int16BufferAttribute([0,32767,0,0,32767,0,0,32767,0,0,32767,0,0,32767,0,0,32767,0],3,true));geometry.setIndex([0,1,2,3,4,5]);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.userData.mountainY={triangles:1};scene.add(mesh);
  const restore=maskValleyForHike(scene,{minX:-.5,minZ:-.5,maxX:.5,maxZ:.5},THREE);
  assert.notEqual(mesh.geometry,geometry);const pos=mesh.geometry.attributes.position;
  let total=0;for(let i=0;i<pos.count;i+=3)total+=area([0,1,2].map(n=>[pos.getX(i+n),pos.getY(i+n),pos.getZ(i+n)]));near(total,7);
  assert.ok(Array.from(pos.array).every(value=>value<=2));
  assert.ok(Array.from(mesh.geometry.attributes.color.array).every(value=>value>=0&&value<=1),'compressed normalized colors retain their linear range');
  near(mesh.geometry.attributes.normal.getY(0),1);restore();assert.equal(mesh.geometry,geometry);
});

test('hiking lifecycle deduplicates loads, cancels late completion, restores the valley and permits retry',async()=>{
  let finish,attempts=0,disposed=0,masks=0,restored=0;
  const controller={dispose(){disposed++;}};
  const manager=createHikeManager({load:()=>{attempts++;return new Promise(resolve=>{finish=resolve;});},mask:()=>{masks++;return()=>{restored++;};}});
  const first=manager.loadHike(),again=manager.loadHike();assert.equal(first,again);await Promise.resolve();assert.equal(attempts,1);
  manager.unloadHike();finish(controller);await assert.rejects(first,{name:'AbortError'});assert.equal(manager.getHike(),null);assert.equal(disposed,1);
  const second=manager.loadHike();await Promise.resolve();finish(controller);await second;assert.equal(manager.getHike(),controller);assert.equal(masks,1);
  manager.refreshMask();assert.equal(restored,1);assert.equal(masks,2);
  manager.dispose();assert.equal(restored,2);assert.equal(disposed,2);await assert.rejects(manager.loadHike(),{name:'AbortError'});
});

test('failed downloads can retry; tile assets are fetched only by the explicit load',async t=>{
  const {data,heights}=fixture(),urls=[],scene=new THREE.Scene();let fail=true;
  t.mock.method(globalThis,'fetch',async url=>{urls.push(url);if(fail){fail=false;return new Response('',{status:503});}return String(url).includes('route.json')?new Response(JSON.stringify(data)):new Response(heights.buffer);});
  const manager=createHikeManager({load:options=>loadHikingWorld({scene,THREE,...options})});
  assert.equal(urls.length,0);await assert.rejects(manager.loadHike(),/could not download/);assert.equal(scene.children.length,0);
  const loaded=await manager.loadHike();assert.equal(urls.length,3);assert.equal(scene.children.length,1);
  assert.ok(loaded.group.getObjectByName('Y at source scale and location').material.depthTest);
  assert.ok(loaded.stats.yTriangles>0);manager.dispose();assert.equal(scene.children.length,0);
});

test('real sourced Y terrain traverses every route in both directions and closes the distant scenery seam',async()=>{
  const report=await auditHikeAssets();
  assert.equal(report.measuredSourceStats.mappedCheckpoints,12);
  assert.ok(report.measuredSourceStats.planLengthMeters>1800&&report.measuredSourceStats.planLengthMeters<1900);
  assert.ok(report.measuredSourceStats.elevationGainMeters>320&&report.measuredSourceStats.elevationGainMeters<340);
  assert.equal(report.surface.traversal.length,12);
  assert.ok(report.surface.traversal.every(route=>route.steps>1&&route.endErrorMeters<.001));
  assert.equal(report.geometry.stats.scrubInstances,180);assert.equal(report.geometry.stats.rockInstances,80);
  assert.equal(report.geometry.drawCalls,5);assert.ok(report.geometry.triangles<200_000);
  assert.ok(report.geometry.actualY.clearance.samples>10_000);
  assert.equal(report.geometry.scenery.restored,true);
  assert.equal(report.geometry.scenery.overlappingTriangles,0);
  assert.equal(report.geometry.scenery.decorativeYTriangles,0);
  assert.ok(report.geometry.scenery.maxBorderErrorMeters<.002);
});
