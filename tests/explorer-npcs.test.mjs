import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../public/campus/vendor/three.module.js';
import {UNIT} from '../public/explorer/game/content.mjs';
import {createCampusLife} from '../public/explorer/game/activities.mjs';
import {DISTRICT_POINTS as P} from '../public/explorer/game/district-content.mjs';
const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('/campus/vendor/'))return {url:vendor+specifier.slice('/campus/vendor/'.length),shortCircuit:true};return next(specifier,context);}});
const {createDistrict}=await import('../public/explorer/game/npcs.mjs');
const plane={groundHeight:()=>1,supportHeight:()=>1,move:(from,delta)=>new THREE.Vector3(from.x+(delta.x||0),1,from.z+(delta.z||0))};
const far={x:-20,z:-20};
function fixture({getRoute=()=>[]}={}){
 const scene=new THREE.Scene(),state=createCampusLife(),district=createDistrict(scene,plane,{getState:()=>state,getRoute});
 const tick=(seconds,options={})=>{for(let i=0;i<Math.ceil(seconds/.1);i++){state.clock+=.1;district.update(.1,state.clock,{player:far,reducedMotion:true,...options});}};
 return {scene,state,district,tick,person:id=>district.getCharacters().find(n=>n.id===id)};
}

test('five recurring students preserve meter scale, distinct accessories and finite poses',()=>{
 const f=fixture();
 assert.deepEqual(f.district.getCharacters().map(n=>n.id),['maya','eli','nora','jun','sofia']);
 assert.equal(new Set(f.district.getCharacters().map(n=>n.color)).size,5);
 for(const id of ['maya','eli','nora','jun','sofia']){
  const p=f.person(id),group=f.scene.getObjectByName(p.name);assert.deepEqual(group.scale.toArray(),[UNIT,UNIT,UNIT]);
  const before=group.position.toArray();f.district.interact(id,'handoff');f.tick(.1,{player:{x:p.x,z:p.z-UNIT}});
  assert.deepEqual(group.position.toArray(),before,'gestures preserve the grounded physics anchor');
  assert.equal(f.person(id).gesture,'handoff');
  group.updateMatrixWorld(true);group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
 }
 const jun=f.scene.getObjectByName('Jun');assert.ok(jun.getObjectByName('Music case'));
 assert.ok(f.scene.getObjectByName('Sofia').getObjectByName('Camera'));
 assert.ok(f.scene.getObjectByName('Eli').getObjectByName('Left hip'));
 f.district.interact('nora','point');f.tick(.1);assert.equal(f.person('nora').gesture,'point');f.district.dispose();
});

test('tray, pennant bases and hung photo board acknowledge supported saved outcomes',()=>{
 const f=fixture(),root=f.scene.getObjectByName('Cookie Corner and recurring students');
 assert.equal(f.district.diagnostics.cookies,12);assert.equal(f.district.diagnostics.pennants,0);
 const bases=[];root.traverse(o=>{if(o.name==='Pennant stop')bases.push(o);});assert.equal(bases.length,3);assert.ok(bases.every(o=>o.visible));
 f.state.maya.cookie='sugar';f.state.maya.pennants=['library','arts','lane'];f.state.maya.stage=3;
 f.state.sofia.photos=['library','arts'];f.state.sofia.stage=2;f.tick(.1);
 assert.equal(f.district.diagnostics.cookies,11);assert.equal(f.district.diagnostics.pennants,3);assert.equal(f.district.diagnostics.photos,0,'captured drafts are not already on the final board');
 f.state.sofia.stage=3;f.tick(.1);assert.equal(f.district.diagnostics.photos,2);
 f.state.maya.stage=5;f.tick(.1);assert.ok(root.getObjectByName('Maya’s fictional cookie stand'));
 f.district.dispose();
});

test('missing navigation holds students at safe anchors and paused updates freeze movement and schedules',()=>{
 const f=fixture();const before=f.person('jun');f.state.jun.stage=1;f.tick(15);
 assert.equal(f.person('jun').x,before.x);assert.equal(f.person('jun').z,before.z);
 const clock=f.district.diagnostics.clock,frames=f.district.diagnostics.frames;
 f.district.update(10,1000,{player:far,paused:true});assert.equal(f.district.diagnostics.frames,frames);assert.equal(f.district.diagnostics.clock,clock);f.district.dispose();
});

test('a walker retains progress through route junctions instead of replanning backwards every four seconds',()=>{
 let plans=0;
 const f=fixture({getRoute:(from,to)=>{plans++;return [{x:from.x,z:from.z},{x:12,z:1},{x:to.x,z:to.z}];}});
 f.state.jun.stage=1;f.tick(250);
 const jun=f.person('jun');assert.equal(jun.atDestination,true);assert.ok(Math.hypot(jun.x-P.music.x,jun.z-P.music.z)<4*UNIT);assert.equal(plans,1,'a static destination retains its reviewed corridor');f.district.dispose();
});

test('escort reload places Eli beside the saved player and leaves a stable foot contact',()=>{
 const f=fixture();f.state.eli.stage=1;f.district.reset();const player={x:1,z:2};f.tick(.1,{player});
 const eli=f.person('eli');assert.ok(Math.hypot(eli.x-player.x,eli.z-player.z)<2*UNIT);assert.equal(eli.y,1);f.district.dispose();
});

test('district GPU geometry, shared materials and sign textures dispose once across repeated exits',()=>{
 const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
 try{
  const f=fixture(),resources=new Set();
  f.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat){resources.add(mat);for(const value of Object.values(mat))if(value?.isTexture)resources.add(value);}});
  assert.ok([...resources].some(r=>r.isTexture),'real sign texture lifecycle is included');
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  f.district.dispose();f.district.dispose();assert.equal(f.scene.children.length,0);for(const resource of resources)assert.equal(counts.get(resource),1);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('name labels face the orbiting camera and hide before obstructing a close view',()=>{
 const f=fixture(),maya=f.person('maya'),group=f.scene.getObjectByName('Maya'),label=group.getObjectByName('Name label');
 const player={x:maya.x,z:maya.z-5*UNIT},cameraPosition={x:maya.x,z:maya.z+7*UNIT};
 f.district.update(.1,.1,{player,cameraPosition,reducedMotion:true});group.updateMatrixWorld(true);
 const front=new THREE.Vector3(0,0,1).applyQuaternion(label.getWorldQuaternion(new THREE.Quaternion()));
 assert.ok(front.z>.99,'the sign faces the camera even when the player stands on the opposite side');
 assert.equal(label.visible,true);
 f.district.update(.1,.2,{player,cameraPosition:{x:maya.x,z:maya.z+UNIT},reducedMotion:true});
 assert.equal(label.visible,false,'very close nameplates do not fill the camera');f.district.dispose();
});

test('named student draw instances follow the visible tier without changing quest positions',()=>{
 const f=fixture(),maya=f.person('maya'),students=f.district.getCharacters();
 const batches=f.scene.children[0].children.filter(o=>o.name.startsWith('Distant students: '));
 assert.equal(batches.length,5);
 const player={x:maya.x+60*UNIT,z:maya.z};
 const expected=students.filter(c=>{
  const meters=Math.hypot(c.x-player.x,c.z-player.z)/UNIT;
  return meters>=48&&meters<=150;
 });
 f.district.update(0,0,{player});
 assert.equal(f.scene.getObjectByName('Maya').visible,false);
 assert.ok(expected.some(c=>c.id==='maya'));
 for(const batch of batches){assert.equal(batch.count,expected.length);assert.equal(batch.visible,true);}
 const matrix=new THREE.Matrix4();
 batches[0].getMatrixAt(0,matrix);
 assert.ok(Math.abs(matrix.elements[12]-expected[0].x)<1e-6);
 assert.ok(Math.abs(matrix.elements[14]-expected[0].z)<1e-6);
 const version=batches[0].instanceMatrix.version;
 f.district.update(0,0,{player});
 assert.equal(batches[0].instanceMatrix.version,version,'a stationary stand-in does not upload another matrix');
 f.district.update(0,0,{player:far});
 assert.ok(batches.every(batch=>batch.count===0&&!batch.visible));
 assert.deepEqual(f.district.getCharacters(),students);
 f.district.update(0,0,{player:maya});
 assert.equal(f.scene.getObjectByName('Maya').visible,true);
 f.district.dispose();
});
