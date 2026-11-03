import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/campus/vendor/three.module.js';
import {loadValley,auditValleyY} from '../scripts/audit-explorer-y.mjs';
import {stabilizeMountainY} from '../public/explorer/game/valley-rendering.mjs';

test('decoded Y retains its complete footprint and clear terrain at corners, edges and centers',async()=>{
  const {scene}=await loadValley(),report=auditValleyY(scene);
  assert.equal(report.triangles.y,54);assert.equal(report.triangles.ground,3878);
  assert.ok(Math.abs(report.projectedAreaMeters2-report.metadata.projectedAreaMeters2)<.01);
  assert.equal(report.sampledClearance.count,54*7);assert.equal(report.sampledClearance.missingGroundSamples,0);
  assert.ok(Math.abs(report.sampledClearance.min-.025)<.00001);
  assert.ok(Math.abs(report.sampledClearance.max-.025)<.00001);
  for(const view of report.depth.views.slice(0,3)){
    assert.equal(view.samples,54);assert.ok(view.minDepthCodes>0&&view.maxDepthCodes<1,'campus perspective separation is sub-step under the stated 24-bit depth assumption');
  }
});

test('game Y depth bias changes only the material and grouping of decoded triangles',async()=>{
  const {scene}=await loadValley(),mesh=scene.getObjectByProperty('isMesh',true),geometry=mesh.geometry,terrainMaterial=mesh.material;
  const attributes=new Map(Object.entries(geometry.attributes));
  const triangles=()=>{const ix=geometry.index,result=[];for(let i=0;i<ix.count;i+=3)result.push([ix.getX(i),ix.getX(i+1),ix.getX(i+2)].join(','));return result.sort();};
  const before=triangles(),result=stabilizeMountainY(scene);
  assert.deepEqual(result,{groundTriangles:3878,yTriangles:54});assert.deepEqual(triangles(),before);
  for(const [name,attribute]of attributes)assert.equal(geometry.getAttribute(name),attribute,`${name} remains byte-for-byte unchanged`);
  assert.deepEqual(geometry.groups,[{start:0,count:3878*3,materialIndex:0},{start:3878*3,count:54*3,materialIndex:1}]);
  assert.equal(mesh.material[0],terrainMaterial);assert.equal(terrainMaterial.polygonOffset,false);
  const yMaterial=mesh.material[1];assert.notEqual(yMaterial,terrainMaterial);
  assert.equal(yMaterial.polygonOffset,true);assert.equal(yMaterial.polygonOffsetFactor,-1);assert.equal(yMaterial.polygonOffsetUnits,-1);
  assert.equal(yMaterial.depthTest,true);assert.equal(yMaterial.depthWrite,true);assert.equal(yMaterial.transparent,false);assert.equal(yMaterial.side,THREE.FrontSide);
  assert.equal(stabilizeMountainY(scene),null,'repeated setup does not create extra materials or groups');
});

test('unrecognized or changed white scenery is not silently split into a Y',async()=>{
  const {scene}=await loadValley(),mesh=scene.getObjectByProperty('isMesh',true),index=mesh.geometry.index,material=mesh.material;
  mesh.userData.mountainY.triangles++;
  assert.equal(stabilizeMountainY(scene),null);assert.equal(mesh.geometry.index,index);assert.equal(mesh.material,material);
  delete mesh.userData.mountainY;
  assert.equal(stabilizeMountainY(scene),null);assert.equal(mesh.geometry.index,index);assert.equal(mesh.material,material);
});
