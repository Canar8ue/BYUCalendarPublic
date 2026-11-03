// Read-only checks of the decoded Part 2 game assets, using the shipped loader.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../public/campus/vendor/three.module.js';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(s,c,next){return s==='three'?{url:vendor+'three.module.js',shortCircuit:true}:next(s,c);}});
const [{GLTFLoader},{MeshoptDecoder},bytes,catalogText]=await Promise.all([
  import('../public/campus/vendor/addons/loaders/GLTFLoader.js'),
  import('../public/campus/vendor/meshopt_decoder.module.js'),
  readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url)),
  readFile(new URL('../public/explorer/campus/coordinates.json',import.meta.url),'utf8')
]);
const catalog=JSON.parse(catalogText),features=new Map(catalog.features.map(f=>[f.featureIndex,f]));
assert.equal(catalog.features.length,527);
assert.equal(new Set(catalog.features.map(f=>f.id)).size,527);
const targets=new Map(['r4871647','w60110296'].map(id=>{
  const feature=catalog.features.find(f=>f.id===id);assert.ok(feature,id);
  assert.match(feature.notes,/November 2026 Part 2/);
  return [feature.featureIndex,{feature,positions:[],colors:[]}];
}));
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
const point=new THREE.Vector3(),seen=new Set(),surfaces=new Set();let triangles=0;
gltf.scene.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.getAttribute('_feature_id'),s=mesh.geometry.getAttribute('_surface'),color=mesh.geometry.getAttribute('color'),ix=mesh.geometry.index;
  assert.ok(ids&&s&&color,'Feature, surface and vertex colors must survive export.');
  assert.equal(mesh.material.side,THREE.FrontSide);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.opacity,1);
  for(let i=0;i<ix.count;i+=3){
    const vertices=[0,1,2].map(j=>ix.getX(i+j)),id=Math.round(ids.getX(vertices[0])),surface=Math.round(s.getX(vertices[0]));
    assert.ok(vertices.every(v=>Math.round(ids.getX(v))===id&&Math.round(s.getX(v))===surface),'Mixed triangle semantics');
    assert.ok(!id||features.has(id),'Unknown feature ID');
    triangles++;if(id)seen.add(id);surfaces.add(surface);
    const target=targets.get(id);if(!target)continue;
    assert.equal(surface,0,'Buildings must not become walkable ground.');
    for(const v of vertices){point.fromBufferAttribute(p,v).applyMatrix4(mesh.matrixWorld);target.positions.push(...point.toArray());target.colors.push(color.getX(v),color.getY(v),color.getZ(v));}
  }
});
assert.equal(seen.size,516);assert.deepEqual([...surfaces].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
const meshes=new Map();
for(const {feature,positions,colors}of targets.values()){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true}));mesh.updateMatrixWorld(true);meshes.set(feature.code,mesh);
}
const ray=new THREE.Raycaster(),fixtures=[];
function hit(code,origin,direction){ray.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));return ray.intersectObject(meshes.get(code),false)[0];}
function fixture(name,code,origin,direction,check){const first=hit(code,origin,direction);assert.ok(check(first),name);fixtures.push({name,point:first?.point.toArray()??null});return first;}
const near=(a,b,tolerance=.005)=>Math.abs(a-b)<tolerance;
fixture('JSB eastern spire survives batching and quantization','JSB',[-5.4484,3,19.526],[0,-1,0],h=>h&&near(h.point.y,1.6507,.007));
fixture('JSB north frontage is low and closed','JSB',[-5.8,3,19.75],[0,-1,0],h=>h&&near(h.point.y,1.105));
fixture('JSB southern roof retained','JSB',[-5.7,3,20.8],[0,-1,0],h=>h&&near(h.point.y,1.37998));
fixture('Oversized north forecourt canopy removed','JSB',[-6.2,3,18.43],[0,-1,0],h=>!h);
function glass(h,mesh){if(!h)return false;const c=mesh.geometry.getAttribute('color'),v=h.face.a;return c.getX(v)<.2&&c.getZ(v)>.17;}
fixture('North recessed glazing is visible in front of its backing','JSB',[-5.8,1,19],[0,0,1],h=>h&&near(h.point.z,19.533)&&glass(h,meshes.get('JSB')));
fixture('West large glass bay is visible','JSB',[-8,1.15,19.25],[1,0,0],h=>h&&glass(h,meshes.get('JSB')));
fixture('Recessed entrance canopy has a visible underside','JSB',[-6.34,.80,19.50],[0,1,0],h=>h&&near(h.point.y,1.0575));
const center=[-13.3394500254,22.6695030731],front=[-.8708717965,.4915102381],long=[.4915102381,.8708717965];
const maeserPoint=(x,y)=>[center[0]+front[0]*x+long[0]*y,3,center[1]+front[1]*x+long[1]*y];
for(const y of [-.70,.70])fixture('Maeser registered long end '+y,'MSRB',maeserPoint(0,y),[0,-1,0],h=>h&&near(h.point.y,1.34));
for(const [x,y]of [[.60,.60],[-.33,.60]])fixture('Maeser oversized rectangular corner cleared '+x,'MSRB',maeserPoint(x,y),[0,-1,0],h=>!h);

// A dense four-side/roof sample compares ordinary culling with diagnostic
// double-sided intersections. Misses outside irregular footprints are expected.
const exterior={};
for(const [code,mesh]of meshes){
  const {min:lo,max:hi}=mesh.geometry.boundingBox,defects=[];let hits=0,misses=0;
  function probe(origin,direction,kind){
    ray.set(origin,direction);mesh.material.side=THREE.DoubleSide;const both=ray.intersectObject(mesh,false)[0];
    if(!both){misses++;return;}hits++;
    if(both.face.normal.dot(direction)<=.1||kind!=='roof'&&Math.abs(both.face.normal.y)>.1)return;
    mesh.material.side=THREE.FrontSide;const frontHit=ray.intersectObject(mesh,false)[0];
    if(!frontHit||frontHit.distance-both.distance>.004)defects.push({kind,point:both.point.toArray()});
  }
  for(const axis of [0,2])for(const sign of [-1,1])for(let i=1;i<=40;i++)for(let j=1;j<=20;j++){
    const other=2-axis,origin=lo.clone().add(hi).multiplyScalar(.5),direction=new THREE.Vector3().setComponent(axis,-sign);
    origin.setComponent(axis,sign>0?hi.getComponent(axis)+1:lo.getComponent(axis)-1);origin.setComponent(other,lo.getComponent(other)+(hi.getComponent(other)-lo.getComponent(other))*i/41);origin.y=lo.y+(hi.y-lo.y)*j/21;
    probe(origin,direction,'side');
  }
  for(let i=1;i<=80;i++)for(let j=1;j<=100;j++)probe(new THREE.Vector3(lo.x+(hi.x-lo.x)*i/81,hi.y+1,lo.z+(hi.z-lo.z)*j/101),new THREE.Vector3(0,-1,0),'roof');
  mesh.material.side=THREE.FrontSide;
  exterior[code]={triangles:mesh.geometry.attributes.position.count/3,hits,misses,cullingDefects:defects};
  assert.deepEqual(defects,[],code+' exterior culling');
  mesh.geometry.dispose();mesh.material.dispose();
}
const report={createdAt:new Date().toISOString(),modelSha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,features:features.size,meshFeatures:seen.size,triangles,surfaces:[...surfaces].sort((a,b)=>a-b),fixtures,exterior,limits:'Sampled geometry/registration checks; dimensions and unseen elevations remain approximate. Human playtesting is separate.'};
await mkdir(new URL('../tmp/',import.meta.url),{recursive:true});await writeFile(new URL('../tmp/explorer-buildings-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('PART2_BUILDING_AUDIT_PASSED');
