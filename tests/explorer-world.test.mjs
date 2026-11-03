import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollisionIndex} from '../public/explorer/game/world.mjs';

const floor=(y=0)=>[
 {kind:'ground',a:[-2,y,-2],b:[2,y,2],c:[2,y,-2]},
 {kind:'ground',a:[-2,y,-2],b:[-2,y,2],c:[2,y,2]}
];
const wall={kind:'wall',a:[0,0,-1],b:[0,2,1],c:[0,0,1]};

test('ground interpolates slopes and rejects missing ground',()=>{
 const index=createCollisionIndex([{kind:'ground',a:[0,0,0],b:[0,2,2],c:[2,0,0]}]);
 assert.equal(index.groundHeight(.5,.5),.5);
 assert.equal(index.groundHeight(4,4),null);
});

test('road overlay wins over terrain, elevated decorative surfaces cannot become ground',()=>{
 const index=createCollisionIndex([...floor(0),...floor(.01),...floor(3)]);
 assert.equal(index.groundHeight(.4,.3),.01);
});

test('labelled paving follows the visible surface and bridges support both deck and underpass',()=>{
 const layer=(y,surface)=>floor(y).map(t=>({...t,surface}));
 const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-10,message);
 const index=createCollisionIndex([...layer(0,1),...layer(.0045,3),...layer(.17,7),...layer(.4,7)]);
 near(index.groundHeight(.4,.3),.0045);
 near(index.groundHeight(.4,.3,.0045),.0045,'walking below a bridge cannot teleport onto it');
 near(index.groundHeight(.4,.3,.17),.17,'a reachable lower deck must survive another deck overhead');
 near(index.groundHeight(.4,.3,.4),.4);
 assert.equal(index.groundSurface(.4,.3,.0045),3,'the path keeps its surface below the bridge');
 assert.equal(index.groundSurface(.4,.3,.17),7,'the reachable bridge deck supplies its own surface');
 assert.equal(index.groundSurface(4,4,.17),null);
 const visible=createCollisionIndex([...layer(0,1),...layer(.03,2)]);
 near(visible.groundHeight(.4,.3),.03,'explicit ground semantics replace the old overlay height cutoff');
});

test('shoe footprint and scooter wheel contacts stay above a sloping surface',()=>{
 const index=createCollisionIndex([
  {kind:'ground',surface:1,a:[-2,-.2,-2],b:[2,.2,2],c:[2,-.2,-2]},
  {kind:'ground',surface:1,a:[-2,-.2,-2],b:[-2,.2,2],c:[2,.2,2]}
 ]);
 assert.ok(index.supportHeight(0,0,0)>0,'uphill shoe edge cannot sit below the ground');
 const pose=index.groundPose(0,0,0,0);
 assert.ok(Math.abs(pose.pitch+Math.atan(.1))<1e-10);
 assert.ok(Math.abs(pose.height)<1e-10);
 assert.ok(Math.abs(pose.roll)<1e-10);
 assert.equal(index.supportHeight(10,10),null);
 assert.equal(index.groundPose(10,10),null);
});

test('narrow paving triangles created at terrain seams still support the player',()=>{
 const index=createCollisionIndex([...floor().map(t=>({...t,surface:1})),
  {kind:'ground',surface:3,a:[0,.004,0],b:[0,.004,.002],c:[.00002,.004,0]}]);
 assert.ok(Math.abs(index.groundHeight(.000005,.0005)-.004)<1e-10);
});

test('long grounded movements refresh elevation before testing later walls',()=>{
 const index=createCollisionIndex([
  {kind:'ground',surface:1,a:[-2,0,-2],b:[2,.2,2],c:[2,.2,-2]},
  {kind:'ground',surface:1,a:[-2,0,-2],b:[-2,0,2],c:[2,.2,2]},
  {kind:'wall',a:[0,0,-1],b:[0,.06,1],c:[0,0,1]}
 ]);
 const result=index.move({x:-1,y:.05,z:0},{x:2,z:0},.015);
 assert.ok(result.x>.99,'a wall below the new elevation must not block the player');
 assert.ok(Math.abs(result.y-.15)<1e-8,'support must advance with the player');
 const airborne=index.move({x:-1,y:.2,z:0},{x:2,z:0},.015,{grounded:false});
 assert.equal(airborne.y,.2,'airborne motion keeps vertical physics in the player controller');
});

test('substeps prevent crossing thin wall and allow sliding',()=>{
 const index=createCollisionIndex([...floor(),wall]);
 const p=index.move({x:-.5,y:0,z:0},{x:1,z:.4},.04);
 assert.ok(p.x<=-.039,'must remain on original side of wall');
 assert.ok(p.z>.3,'movement along wall should remain possible');
 assert.equal(p.y,0,'gravity belongs to player controller');
});

test('high overhead walls do not block a grounded player',()=>{
 const index=createCollisionIndex([...floor(),{...wall,a:[0,1,-1],b:[0,2,1],c:[0,1,1]}]);
 assert.ok(index.move({x:-.5,y:0,z:0},{x:1,z:0},.04).x>.4);
});

test('walk cannot enter missing terrain or suddenly climb a cliff',()=>{
 const index=createCollisionIndex(floor());
 const p=index.move({x:1.9,y:0,z:0},{x:1,z:0},.04);
 assert.ok(p.x<=2);
 const cliff=createCollisionIndex([...floor(),{kind:'ground',a:[2,1,-2],b:[4,1,2],c:[4,1,-2]},{kind:'ground',a:[2,1,-2],b:[2,1,2],c:[4,1,2]}]);
 assert.ok(cliff.move({x:1.9,y:0,z:0},{x:1,z:0},.04).x<=2);
});

test('camera is brought in before a building wall',()=>{
 const index=createCollisionIndex([...floor(),wall]);
 const p=index.cameraPosition({x:-.5,y:.05,z:0},{x:.5,y:.1,z:0});
 assert.ok(p.x<0);
});

test('invalid geometry and invalid movements remain bounded',()=>{
 const index=createCollisionIndex([...floor(),{kind:'ground',a:[NaN,0,0],b:[0,0,1],c:[1,0,0]}]);
 const origin={x:0,y:0,z:0};
 assert.deepEqual(index.move(origin,{x:NaN,z:0}),origin);
 assert.equal(index.groundHeight(Infinity,0),null);
 assert.equal(index.stats.groundTriangles,2);
});
