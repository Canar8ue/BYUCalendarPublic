import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../public/campus/vendor/three.module.js';
import {LOCATIONS,UNIT} from '../public/explorer/game/content.mjs';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('/campus/vendor/'))return {url:vendor+specifier.slice('/campus/vendor/'.length),shortCircuit:true};
 return next(specifier,context);
}});
const {createScenery}=await import('../public/explorer/game/scenery.mjs');

test('scenery batches repeated lamps and keeps ambient collision near the player',()=>{
 const oldDocument=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({
  fillRect(){},strokeRect(){},fillText(){},beginPath(){},moveTo(){},bezierCurveTo(){},stroke(){},arc(){},fill(){},
 })})};
 try{
  const scene=new THREE.Scene(),queries=[];
  const world={groundHeight:()=>1,move(from,delta){
   queries.push(from);
   return {x:from.x+delta.x,y:from.y,z:from.z+delta.z};
  }};
  const scenery=createScenery(scene,world),root=scene.children[0];
  try{
   const lamps=root.children.filter(o=>o.name.startsWith('Lamp '));
   assert.equal(lamps.length,3);
   assert.ok(lamps.every(lamp=>lamp.isInstancedMesh&&lamp.count===Math.ceil(LOCATIONS.length/2)));
   const bulb=lamps.find(lamp=>lamp.name==='Lamp bulbs');
   scenery.update(0,0,{night:true});
   assert.equal(bulb.material.emissiveIntensity,2);
   const walkers=root.children.filter(o=>o.name==='Ambient walkers');
   assert.equal(walkers.length,3);
   const first=LOCATIONS[0],player={x:first.x+1.3*UNIT,z:first.z-1.2*UNIT};
   queries.length=0;
   scenery.update(.1,.1,{player});
   assert.ok(queries.length>0);
   assert.ok(queries.every(p=>Math.hypot(p.x-player.x,p.z-player.z)<49*UNIT));
   assert.ok(walkers.every(batch=>batch.visible));
   queries.length=0;
   scenery.update(.1,.2,{player:{x:1000,z:1000}});
   assert.equal(queries.length,0);
   assert.ok(walkers.every(batch=>batch.count===0&&!batch.visible));
   scenery.update(.1,.3,{player});
   assert.ok(walkers.every(batch=>batch.count>0&&batch.visible));
  }finally{scenery.dispose();}
  assert.equal(scene.children.length,0);
 }finally{
  if(oldDocument===undefined)delete globalThis.document;
  else globalThis.document=oldDocument;
 }
});
