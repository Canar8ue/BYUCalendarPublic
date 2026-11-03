import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('optional valley stays within its download and GPU geometry budgets',()=>{
  const bytes=readFileSync(new URL('../public/campus/valley_lod.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert(bytes.length<=50_000,'Keep the texture-free scenery under 50 KB');
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const primitives=gltf.meshes.flatMap(mesh=>mesh.primitives);
  assert.equal(primitives.length,1,'Scenery should add just one draw call');
  assert.equal(gltf.textures?.length??0,0);
  assert.equal(gltf.images?.length??0,0);
  assert.equal(gltf.animations?.length??0,0);
  const triangles=primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);
  assert(triangles<=5_000,'Keep scenery below about 1% of campus triangles');
  assert(primitives.every(p=>p.attributes._FEATURE_ID===undefined),'Backdrop must not join building picking');
});
