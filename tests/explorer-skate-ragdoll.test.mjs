import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createSkateRagdoll} from '../public/explorer/game/skate-ragdoll.mjs';
import {createSkateState} from '../public/explorer/game/skateboard.mjs';
import {OUTFITS,UNIT} from '../public/explorer/game/content.mjs';
import {createProgress} from '../public/explorer/game/progress.mjs';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('/campus/vendor/'))return {url:vendor+specifier.slice('/campus/vendor/'.length),shortCircuit:true};
  return next(specifier,context);
}});
const {createPlayer}=await import('../public/explorer/game/actors.mjs');

function meshesOf(player){
  const meshes=[];
  player.group.updateWorldMatrix(true,true);
  player.group.traverse(object=>{
    if(object.isMesh)meshes.push({object,geometry:object.geometry,material:object.material,matrix:object.matrixWorld.clone()});
  });
  return meshes;
}
function comparePose(before){
  for(const mesh of before){
    assert.equal(mesh.object.geometry,mesh.geometry);
    assert.equal(mesh.object.material,mesh.material);
    if(mesh.object.name==='Ground shadow')continue;
    mesh.matrix.elements.forEach((value,index)=>assert.ok(Math.abs(value-mesh.object.matrixWorld.elements[index])<1e-10,'handoff preserves the complete character pose'));
  }
}

test('every outfit keeps the exact character, materials, face and pose through a rigid-body handoff',()=>{
  for(const outfit of OUTFITS)for(const direction of [-1,1]){
    const player=createPlayer(new THREE.Scene());
    let ragdoll,art;
    try{
      player.setStyle({level:5,jacket:outfit.jacket,backpack:outfit.pack});
      const state=createSkateState({heading:.7});
      state.switched=direction<0;state.lean=.3;state.pitch=.18;state.velocity.z=direction*5;
      Object.assign(state.push,{active:true,cycleIndex:1,phase:.3,contact:true,load:.8,direction,groundHeight:0,plantedDistance:.2});
      player.group.position.set(2.1,0,-.4);player.group.rotation.set(state.pitch,state.heading,0,'YXZ');
      player.update(0,{skating:state,grounded:true,instant:true});
      const before=meshesOf(player),pose=player.ragdollPose();
      const resources=new Set(before.flatMap(mesh=>[mesh.geometry,mesh.material])),disposed=[];
      for(const resource of resources)resource.addEventListener('dispose',()=>disposed.push(resource));
      ragdoll=createSkateRagdoll({position:{x:2.1/UNIT,y:0,z:-.4/UNIT},velocity:{x:1,y:0,z:5},heading:state.heading,riderPose:pose,sample:()=>0});
      for(const joint of ragdoll.joints){
        assert.ok(joint.bodyA.pointToWorldFrame(joint.pivotA).distanceTo(joint.bodyB.pointToWorldFrame(joint.pivotB))<1e-10);
      }
      art=player.createRagdoll(ragdoll);art.update();
      comparePose(before);
      assert.equal(player.group.visible,true);
      assert.equal(player.group.getObjectByName('Left eye').parent.name,'Explorer head');
      assert.equal(player.group.getObjectByName('Explorer jacket block').material.color.getHexString(),outfit.jacket.slice(1));
      const pack=before.find(mesh=>mesh.material.name==='Explorer backpack').material;
      assert.equal(pack.color.getHexString(),outfit.pack.slice(1));
      player.update(1/60,{skating:state,grounded:false});
      player.group.updateWorldMatrix(true,true);comparePose(before);
      assert.equal(player.group.userData.animationState,'ragdoll');
      player.group.position.add(new THREE.Vector3(.4,.2,-.3));
      player.group.rotation.set(-.3,-.8,.1);art.update();comparePose(before);
      for(let i=0;i<120;i++){
        ragdoll.step(1/120);player.update(1/120,{skating:state});art.update();
      }
      const moved=before.filter(mesh=>mesh.object.name!=='Ground shadow');
      assert.ok(moved.some(mesh=>new THREE.Vector3().setFromMatrixPosition(mesh.matrix).distanceTo(mesh.object.getWorldPosition(new THREE.Vector3()))>.05*UNIT));
      assert.equal(pack.color.getHexString(),outfit.pack.slice(1));
      assert.equal(disposed.length,0);
      art.dispose();art.dispose();
      player.group.position.set(2.1,0,-.4);player.group.rotation.set(state.pitch,state.heading,0,'YXZ');
      player.group.updateWorldMatrix(true,true);comparePose(before);
      player.update(0,{skating:state,grounded:true,instant:true});
      assert.match(player.group.userData.animationState,/^skate-/);
      assert.equal(disposed.length,0);
    }finally{art?.dispose();ragdoll?.dispose();player.dispose();}
  }
});

test('runtime crashes, outfit changes, retry and automatic recovery retain the live character resources',async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const {createSkateRuntime}=await import('../public/explorer/game/skate-runtime.mjs');
  const scene=new THREE.Scene(),player=createPlayer(scene),progress=createProgress();
  const world={groundHeight:()=>0,supportHeight:()=>0,groundPose:()=>({height:0,pitch:0,roll:0}),groundSurface:()=>3,move:(p,d)=>p.clone().add(d),cameraPosition:(_,p)=>p.clone(),wallsNear:()=>[]};
  const runtime=createSkateRuntime({scene,world,player,getProgress:()=>progress,toast(){},persist(){},audio:{foley(){},chime(){}}});
  const outfit=OUTFITS.find(outfit=>outfit.id==='sunset');
  const before=meshesOf(player),resources=new Set(before.flatMap(mesh=>[mesh.geometry,mesh.material])),disposed=[];
  for(const resource of resources)resource.addEventListener('dispose',()=>disposed.push(resource));
  try{
    for(const recover of ['retry','automatic']){
      player.setStyle({jacket:outfit.jacket,backpack:outfit.pack});
      runtime.start({x:2.85,z:-1,heading:.7});
      player.update(0,{skating:runtime.state,grounded:true,instant:true});
      runtime.state.velocity.z=4;
      runtime.step(1/120,{bail:true});runtime.update(0);
      assert.equal(player.group.visible,true);assert.ok(runtime.state.bail);
      for(let i=0;i<50;i++){runtime.step(1/120,{});player.update(1/120,{skating:runtime.state,grounded:false});runtime.update(1/120);}
      assert.equal(player.group.userData.animationState,'ragdoll');
      const paused=meshesOf(player);
      runtime.suspend();runtime.update(0);comparePose(paused);
      player.setStyle({jacket:'#bd674e',backpack:'#f0c877'});
      if(recover==='retry')runtime.resetMarker();
      else for(let i=0;i<650;i++){runtime.step(1/120,{});runtime.update(1/120);}
      assert.equal(runtime.state.bail,null);assert.equal(runtime.recovering,null);
      assert.equal(disposed.length,0);
      player.update(0,{skating:runtime.state,grounded:true,instant:true});
      assert.match(player.group.userData.animationState,/^skate-/);
      assert.equal(player.group.getObjectByName('Explorer jacket block').material.color.getHexString(),'bd674e');
      for(const mesh of before){assert.equal(mesh.object.geometry,mesh.geometry);assert.equal(mesh.object.material,mesh.material);}
    }
  }finally{
    runtime.dispose();assert.equal(disposed.length,0);player.dispose();
    assert.equal(disposed.length,resources.size);
    assert.equal(scene.children.length,0);
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
  }
});

test('posed riding, crouching and airborne bodies remain connected and settle after a tumble',()=>{
  for(const mode of ['coast','crouch','manual','air']){
    const player=createPlayer(new THREE.Scene());
    let ragdoll,art;
    try{
      const state=createSkateState({heading:1.4});
      state.velocity.x=6;state.velocity.z=2;
      if(mode==='crouch')state.compression=.25;
      if(mode==='manual')state.manualTime=1;
      if(mode==='air'){state.grounded=false;state.position.y=1;state.airTime=.3;}
      player.group.position.set(.4,state.position.y*UNIT,-.2);
      player.group.rotation.y=state.heading;
      player.update(0,{skating:state,grounded:state.grounded,instant:true});
      const pose=player.ragdollPose();
      ragdoll=createSkateRagdoll({position:{x:.4/UNIT,y:state.position.y,z:-.2/UNIT},velocity:{x:6,y:mode==='air'?-3:0,z:2},heading:state.heading,riderPose:pose,sample:()=>0});
      art=player.createRagdoll(ragdoll);
      for(let i=0;i<720;i++){ragdoll.step(1/120);if(i%4===0)art.update();}
      for(const joint of ragdoll.joints)assert.ok(joint.bodyA.pointToWorldFrame(joint.pivotA).distanceTo(joint.bodyB.pointToWorldFrame(joint.pivotB))<.12,mode+' limbs remain connected');
      for(const part of ragdoll.parts)assert.ok([part.body.position.x,part.body.position.y,part.body.position.z].every(Number.isFinite));
      assert.equal(ragdoll.settled,true,mode+' settles with the worn backpack and shoes');
    }finally{art?.dispose();ragdoll?.dispose();player.dispose();}
  }
});
