// Read-only, real-source hiking audit. It uses the same DEM sampler, visible
// meshes and movement boundary as the game, with no browser/GPU requirement.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/campus/vendor/three.module.js';
import {HIKE_UNIT as U,createHikeSurface,loadHikingWorld,maskValleyForHike} from '../public/explorer/game/hike-world.mjs';
import {loadValley} from './audit-explorer-y.mjs';
import {stabilizeMountainY} from '../public/explorer/game/valley-rendering.mjs';

const root=new URL('../public/explorer/hike/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)/U;

export async function loadHikeAssets(){
  const [manifest,bytes]=await Promise.all([readFile(new URL('route.json',root)),readFile(new URL('heights.bin',root))]);
  const data=JSON.parse(manifest),heights=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(hash(bytes),data.terrain.sha256,'terrain source hash must match manifest');
  return {data,heights,hashes:{manifest:hash(manifest),terrain:hash(bytes)},bytes:{manifest:manifest.length,terrain:bytes.length}};
}

export function auditHikeSurface(data,heights){
  const surface=createHikeSurface(data,heights),traversal=[];
  let maxSourceContactErrorMeters=0,maxShoePenetrationMeters=0,cameraChecks=0,minCameraClearanceMeters=Infinity;
  for(const path of surface.routes){
    for(const point of path.points){
      const ground=surface.groundHeight(point.x,point.z);
      assert.ok(Number.isFinite(ground),'every sourced point needs terrain');
      maxSourceContactErrorMeters=Math.max(maxSourceContactErrorMeters,Math.abs(ground-point.y)/U);
    }
    for(const maxStepMeters of [.09,.78])for(const direction of [1,-1]){
      const points=direction===1?path.points:[...path.points].reverse();
      let position={...points[0],y:surface.supportHeight(points[0].x,points[0].z)},steps=0,walkedMeters=0;
      for(let i=1;i<points.length;i++){
        const target=points[i];let guard=0;
        while(gap(position,target)>1e-5){
          const dx=target.x-position.x,dz=target.z-position.z,length=Math.hypot(dx,dz),amount=Math.min(length,maxStepMeters*U),old={...position};
          position=surface.move(position,{x:dx/length*amount,z:dz/length*amount},.32*U);
          const travelled=gap(position,old);
          assert.ok(travelled>1e-7,`blocked ${path.id} direction ${direction} at point ${i} (${JSON.stringify(position)})`);
          assert.ok(surface.walkable(position.x,position.z,.32*U),'movement must retain the player inside the path');
          walkedMeters+=travelled;steps++;
          assert.ok(++guard<1000,'route target must be reachable without an unbounded loop');
          position.y=surface.supportHeight(position.x,position.z);
          for(const [ox,oz]of [[.2,0],[-.2,0],[0,.2],[0,-.2]]){
            const floor=surface.groundHeight(position.x+ox*U,position.z+oz*U);
            if(floor!==null)maxShoePenetrationMeters=Math.max(maxShoePenetrationMeters,(floor-position.y)/U);
          }
        }
      }
      traversal.push({route:path.id,direction,maxStepMeters,steps,walkedMeters,endErrorMeters:gap(position,points.at(-1))});
    }
  }
  for(let i=0;i<surface.route.length;i+=11){
    const p=surface.route[i],target={x:p.x,y:surface.supportHeight(p.x,p.z)+1.3*U,z:p.z};
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const desired={x:p.x+Math.sin(angle)*5*U,y:target.y+.4*U,z:p.z+Math.cos(angle)*5*U};
      const camera=surface.cameraPosition(target,desired),floor=surface.groundHeight(camera.x,camera.z);
      assert.ok(Number.isFinite(floor),'camera sample remains on the detailed tile');
      const clearance=(camera.y-floor)/U;
      assert.ok(clearance>=.20,`camera intersected slope at main point ${i}`);
      minCameraClearanceMeters=Math.min(minCameraClearanceMeters,clearance);cameraChecks++;
    }
  }
  assert.ok(maxSourceContactErrorMeters<.001,'sourced route/checkpoint elevations must match the physical triangulated DEM');
  assert.ok(maxShoePenetrationMeters<.001,'shoe support must clear the visible terrain');
  assert.ok(surface.checkpoints.at(-1).y>20,'the real upper Y exceeds the former campus-only height limit');
  const endpoints=surface.routes.slice(1).map(path=>{
    const ends=[path.points[0],path.points.at(-1)].map((p,end)=>{
      let best={distanceMeters:Infinity,route:null};
      for(const other of surface.routes.filter(route=>route.id!==path.id))for(let i=0;i<other.points.length-1;i++){
        const a=other.points[i],b=other.points[i+1],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
        const fraction=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
        const distanceMeters=Math.hypot(p.x-a.x-dx*fraction,p.z-a.z-dz*fraction)/U;
        if(distanceMeters<best.distanceMeters)best={distanceMeters,route:other.id};
      }
      return {end,...best};
    });
    const connection=ends.reduce((a,b)=>a.distanceMeters<b.distanceMeters?a:b);
    assert.ok(connection.distanceMeters<.05,'every optional branch must connect to another sourced path');
    return {route:path.id,connection,ends};
  });
  return {stats:surface.stats,sourceContact:{maxErrorMeters:maxSourceContactErrorMeters},shoeContact:{maxPenetrationMeters:maxShoePenetrationMeters},
    camera:{checks:cameraChecks,minClearanceMeters:minCameraClearanceMeters},traversal,branches:endpoints};
}

export async function auditHikeGeometry(data,heights){
  // The loader still validates its real HTTP boundary; this adapter returns the
  // checked-in self-hosted bytes, never contacts an upstream data service.
  const originalFetch=globalThis.fetch,scene=new THREE.Scene(),urls=[];
  let world;
  try{
    globalThis.fetch=async url=>{
      urls.push(String(url));
      if(String(url).startsWith('/explorer/hike/route.json'))return new Response(JSON.stringify(data));
      if(String(url).startsWith('/explorer/hike/heights.bin'))return new Response(heights.slice().buffer);
      throw Error('Unexpected hiking asset request: '+url);
    };
    world=await loadHikingWorld({scene,THREE});
  }finally{globalThis.fetch=originalFetch;}
  try{
    assert.equal(urls.length,2,'hiking uses a manifest and one terrain tile');
    const letter=world.group.getObjectByName('Y at source scale and location'),p=letter.geometry.attributes.position;
    let min=Infinity,max=-Infinity,samples=0,area=0;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),box=new THREE.Box3();
    for(let i=0;i<p.count;i+=3){
      a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);box.expandByPoint(a);box.expandByPoint(b);box.expandByPoint(c);
      area+=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/2/U**2;
      for(const q of [a,b,c,a.clone().add(b).multiplyScalar(.5),b.clone().add(c).multiplyScalar(.5),c.clone().add(a).multiplyScalar(.5),a.clone().add(b).add(c).multiplyScalar(1/3)]){
        const floor=world.groundHeight(q.x,q.z),clearance=(q.y-floor)/U;
        assert.ok(Number.isFinite(clearance));min=Math.min(min,clearance);max=Math.max(max,clearance);samples++;
      }
    }
    assert.ok(min>.035&&max<.045,'actual-scale Y follows every terrain triangle at a four-centimetre render lift');
    assert.equal(letter.material.depthTest,true);assert.equal(letter.material.depthWrite,true);assert.equal(letter.material.polygonOffset,true);
    assert.equal(data.y.scale,1);assert.equal(data.y.widthScale,1);assert.equal(data.y.northOffsetMeters,0);
    const {scene:valley,sha256:valleyHash}=await loadValley();stabilizeMountainY(valley);
    const originalGeometry=new Map();valley.traverse(o=>{if(o.isMesh)originalGeometry.set(o,o.geometry);});
    const before=world.route.map(q=>world.groundHeight(q.x,q.z));world.matchBoundary(valley);
    const after=world.route.map(q=>world.groundHeight(q.x,q.z));
    const routeChangeMeters=Math.max(...before.map((v,i)=>Math.abs(v-after[i])/U));
    assert.ok(routeChangeMeters<1e-8,'coarse scenery boundary matching cannot change any trail elevation');
    const terrain=world.group.getObjectByName('USGS hiking terrain'),position=terrain.geometry.attributes.position,t=data.terrain,ray=new THREE.Raycaster(),origin=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
    let seamChecks=0,maxSeamErrorMeters=0;
    for(let row=0;row<t.height;row++)for(let col=0;col<t.width;col++)if(row===0||row===t.height-1||col===0||col===t.width-1){
      const i=row*t.width+col,x=position.getX(i),z=position.getZ(i);origin.set(x,1000,z);ray.set(origin,down);
      const hit=ray.intersectObject(valley,true).find(h=>!h.object.userData?.mountainY||!h.object.geometry.getAttribute('color')||![h.face.a,h.face.b,h.face.c].every(id=>{const color=h.object.geometry.getAttribute('color');return color.getX(id)>.99&&color.getY(id)>.99&&color.getZ(id)>.99;}));
      if(hit){const error=Math.abs(position.getY(i)-hit.point.y)/U;maxSeamErrorMeters=Math.max(maxSeamErrorMeters,error);seamChecks++;}
    }
    assert.ok(seamChecks>100,'boundary should meet the coarse hillside');assert.ok(maxSeamErrorMeters<.002,'detailed/coarse border closes without a terrain seam');
    const restore=maskValleyForHike(valley,world.bounds,THREE);
    let remainingOverlap=0,remainingDecorative=0;
    valley.traverse(mesh=>{if(!mesh.isMesh)return;const positions=mesh.geometry.attributes.position,color=mesh.geometry.attributes.color;for(let i=0;i<positions.count;i+=3){const center=new THREE.Vector3();for(let j=0;j<3;j++)center.add(new THREE.Vector3().fromBufferAttribute(positions,i+j).applyMatrix4(mesh.matrixWorld));center.multiplyScalar(1/3);if(center.x>world.bounds.minX+1e-5&&center.x<world.bounds.maxX-1e-5&&center.z>world.bounds.minZ+1e-5&&center.z<world.bounds.maxZ-1e-5)remainingOverlap++;if(mesh.userData?.mountainY&&color&&[0,1,2].every(j=>color.getX(i+j)>.99&&color.getY(i+j)>.99&&color.getZ(i+j)>.99))remainingDecorative++;}});
    assert.equal(remainingOverlap,0);assert.equal(remainingDecorative,0);restore();for(const [mesh,geometry]of originalGeometry)assert.equal(mesh.geometry,geometry,'leaving restores exact original valley geometry');
    let drawCalls=0,triangles=0;world.group.traverse(o=>{if(o.isMesh){drawCalls+=o.geometry.groups.length||1;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
    return {stats:world.stats,drawCalls,triangles,actualY:{triangles:p.count/3,projectedAreaMeters2:area,bounds:box,clearance:{samples,minMeters:min,maxMeters:max},depthTest:letter.material.depthTest,polygonOffset:letter.material.polygonOffset},
      scenery:{valleySha256:valleyHash,borderChecks:seamChecks,maxBorderErrorMeters:maxSeamErrorMeters,maxTrailChangeMeters:routeChangeMeters,overlappingTriangles:remainingOverlap,decorativeYTriangles:remainingDecorative,restored:true}};
  }finally{world.dispose();}
}

export async function auditHikeAssets(){
  const {data,heights,hashes,bytes}=await loadHikeAssets();
  return {revision:data.revision,hashes,bytes,coordinates:{unit:data.unit,origin:data.origin},measuredSourceStats:data.stats,
    surface:auditHikeSurface(data,heights),geometry:await auditHikeGeometry(data,heights),
    limits:['Mapped bends are game checkpoints, not surveyed numbered signs.','Campus-to-trailhead travel is assisted, not a modeled street connection.','Automated traversal/contact is not human pacing or physical-phone performance evidence.']};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const report=await auditHikeAssets(),output=resolve(process.argv[2]||'tmp/explorer-hike-audit.json');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
