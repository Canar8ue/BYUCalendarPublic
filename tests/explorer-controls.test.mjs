import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/campus/vendor/three.module.js';
import {movementDirection, normalizeMoveInput, lookDirection, zoomDistance} from '../public/explorer/game/controls.mjs';

test('A/D and the joystick move to the correct screen side at every camera heading',()=>{
 for(const yaw of [0,.4,Math.PI/2,Math.PI,4.9,-2.1]){
  const camera=new THREE.PerspectiveCamera(65,1,.01,100);
  camera.position.set(-Math.sin(yaw)*5,2,-Math.cos(yaw)*5);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const [key,strafe] of [['A',-1],['D',1]]){
   const d=movementDirection(strafe,0,yaw),screen=new THREE.Vector3(d.x,0,d.z).project(camera),origin=new THREE.Vector3().project(camera);
   assert.equal(Math.sign(screen.x-origin.x),strafe,`${key} at heading ${yaw} moves to its screen side`);
  }
 }
});

test('analog movement preserves partial pushes and caps combined inputs and diagonals',()=>{
 assert.deepEqual(normalizeMoveInput(.3,.4),{x:.3,z:.4,magnitude:.5});
 for(const [x,z]of [[1,1],[-1,1],[2,-2],[4,0]]){
  const input=normalizeMoveInput(x,z);
  assert.ok(Math.abs(Math.hypot(input.x,input.z)-1)<1e-12);
  assert.equal(input.magnitude,1);
  assert.equal(Math.sign(input.x),Math.sign(x));assert.equal(Math.sign(input.z),Math.sign(z));
 }
 assert.deepEqual(normalizeMoveInput(0,0),{x:0,z:0,magnitude:0});
 assert.deepEqual(normalizeMoveInput(NaN,.5),{x:0,z:.5,magnitude:.5});
 assert.deepEqual(normalizeMoveInput(Infinity,-Infinity),{x:0,z:0,magnitude:0});
 const large=normalizeMoveInput(Number.MAX_VALUE,Number.MAX_VALUE);assert.ok(Math.abs(Math.hypot(large.x,large.z)-1)<1e-12);
 assert.deepEqual(movementDirection(1,0,NaN),{x:0,z:0});
});

test('W/S keep their forward/backward heading and diagonals stay orthogonal',()=>{
 for(const yaw of [0,.4,Math.PI/2,Math.PI,4.9,-2.1]){
  const w=movementDirection(0,1,yaw),s=movementDirection(0,-1,yaw),right=movementDirection(1,0,yaw);
  assert.ok(Math.abs(w.x-Math.sin(yaw))<1e-12);assert.ok(Math.abs(w.z-Math.cos(yaw))<1e-12);
  assert.ok(Math.abs(w.x+s.x)<1e-12&&Math.abs(w.z+s.z)<1e-12);
  assert.ok(Math.abs(w.x*right.x+w.z*right.z)<1e-12);
 }
});

test('mouse and touch look turn toward screen right and share bounded pitch and sensitivity',()=>{
 for(const yaw of [0,.4,Math.PI/2,Math.PI,-2.1]){
  const next=lookDirection(yaw,.3,20,0),forward=movementDirection(0,1,next.yaw),right=movementDirection(1,0,yaw);
  assert.ok(forward.x*right.x+forward.z*right.z>0,'dragging right turns the view right');
 }
 assert.equal(lookDirection(0,.3,0,20).pitch,.36);
 assert.equal(lookDirection(0,.3,0,20,{invertY:true}).pitch,.24);
 assert.equal(lookDirection(0,0,10,0,{sensitivity:2}).yaw,-.06);
 assert.equal(lookDirection(0,0,0,10000).pitch,1.2);
 assert.equal(lookDirection(0,0,0,-10000).pitch,-.3);
 assert.deepEqual(lookDirection(NaN,NaN,Infinity,NaN),{yaw:0,pitch:0});
});

test('wheel zoom is gradual, bounded and survives malformed browser deltas',()=>{
 assert.ok(zoomDistance(1,-100)<1);assert.ok(zoomDistance(1,100)>1);
 assert.equal(zoomDistance(.5,-10000),.5);assert.equal(zoomDistance(2,10000),2);
 assert.equal(zoomDistance(NaN,Infinity),1);
});
