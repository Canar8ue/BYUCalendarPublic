// Read-only decoded-asset audit. No Blender project or external packages needed.
import {registerHooks} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/campus/vendor/three.module.js';
import {UNIT} from '../public/explorer/game/content.mjs';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
let loaderReady=false;
export async function loadValley(){
  if(!loaderReady){registerHooks({resolve(s,c,next){return s==='three'?{url:vendor+'three.module.js',shortCircuit:true}:next(s,c);}});loaderReady=true;}
  const [{GLTFLoader},{MeshoptDecoder},bytes]=await Promise.all([
    import('../public/campus/vendor/addons/loaders/GLTFLoader.js'),
    import('../public/campus/vendor/meshopt_decoder.module.js'),
    readFile(new URL('../public/campus/valley_lod.glb',import.meta.url))
  ]);
  const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  scene.updateMatrixWorld(true);
  return {scene,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function auditValleyY(scene,{near=.0035,far=1600}={}){
  const mesh=scene.getObjectByProperty('isMesh',true),p=mesh.geometry.getAttribute('position'),color=mesh.geometry.getAttribute('color'),ix=mesh.geometry.index;
  const metadata=mesh.userData.mountainY,letter=[],ground=[];
  for(let i=0;i<ix.count;i+=3){const ids=[0,1,2].map(k=>ix.getX(i+k));(ids.every(id=>color.getX(id)>.99&&color.getY(id)>.99&&color.getZ(id)>.99)?letter:ground).push(ids);}
  const points=ids=>ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld));
  const triangles=ground.map(points),cross=(a,b,x,z)=>(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
  function height(x,z){let result=-Infinity;for(const [a,b,c]of triangles){const area=cross(a,b,c.x,c.z),u=cross(b,c,x,z)/area,v=cross(c,a,x,z)/area,w=1-u-v;if(Math.min(u,v,w)>=-1e-6)result=Math.max(result,a.y*u+b.y*v+c.y*w);}return result;}
  let area=0,min=Infinity,max=-Infinity,count=0,missingGroundSamples=0;const box=new THREE.Box3();
  for(const ids of letter){
    const [a,b,c]=points(ids);area+=b.clone().sub(a).cross(c.clone().sub(a)).y/2;
    for(const v of [a,b,c,a.clone().add(b).multiplyScalar(.5),b.clone().add(c).multiplyScalar(.5),c.clone().add(a).multiplyScalar(.5),a.clone().add(b).add(c).multiplyScalar(1/3)]){
      box.expandByPoint(v);const groundY=height(v.x,v.z);if(!Number.isFinite(groundY)){missingGroundSamples++;continue;}
      const gap=v.y-groundY;min=Math.min(min,gap);max=Math.max(max,gap);count++;
    }
  }
  const geometry=mesh.geometry.clone().setIndex(ground.flat()),surface=new THREE.Mesh(geometry,Array.isArray(mesh.material)?mesh.material[0]:mesh.material);
  surface.matrixWorld.copy(mesh.matrixWorld);
  const ray=new THREE.Raycaster(),views=[];
  for(const [name,from]of [['central-campus',[0,1,0]],['south-campus',[-6,.9,20]],['north-campus',[0,1,-15]],['near-letter',[80,26,4]]]){
    const camera=new THREE.PerspectiveCamera(65,16/9,near,far);camera.position.fromArray(from);camera.lookAt(box.getCenter(new THREE.Vector3()));camera.updateMatrixWorld();
    let minDepthCodes=Infinity,maxDepthCodes=0,samples=0;
    for(const ids of letter){const [a,b,c]=points(ids),center=a.add(b).add(c).multiplyScalar(1/3),direction=center.clone().sub(camera.position).normalize();ray.set(camera.position,direction);const hit=ray.intersectObject(surface).find(h=>h.distance>center.distanceTo(camera.position)-.0001);if(!hit)continue;const dz=Math.abs(center.clone().project(camera).z-hit.point.clone().project(camera).z)/2,depthCodes=dz*(2**24-1);minDepthCodes=Math.min(minDepthCodes,depthCodes);maxDepthCodes=Math.max(maxDepthCodes,depthCodes);samples++;}
    views.push({name,camera:from,samples,minDepthCodes,maxDepthCodes});
  }
  geometry.dispose();
  return {metadata,triangles:{y:letter.length,ground:ground.length},bounds:box,projectedAreaMeters2:area/UNIT**2,
    sampledClearance:{count,min,max,missingGroundSamples},depth:{near,far,nearFarRatio:far/near,bitsAssumed:24,
      assumption:'Perspective projection with assumed 24-bit fixed depth. Sample views aim at the Y center; they are not recorded live game cameras.',views}};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const {scene,sha256}=await loadValley(),report={sha256,...auditValleyY(scene)};
  const output=resolve(process.argv[2]||'tmp/explorer-y-audit.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
