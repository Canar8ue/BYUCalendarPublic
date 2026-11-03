import * as THREE from '../public/campus/vendor/three.module.js';
import {readFile,writeFile} from 'node:fs/promises';
import {LOCATIONS,SPAWN,UNIT,CAT_TRAIL,FRAGMENTS,COSMO_SPOTS,LOST_ITEMS,TUNE_NOTES,PHOTO_SPOTS,SECRETS,TRIALS} from '../public/explorer/game/content.mjs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
// GLTFLoader uses fetch. Serve only the three local model inputs on an ephemeral
// loopback port; this offline build tool needs neither the app nor credentials.
const assetFiles=new Map([
 ['/explorer/campus/campus_web.glb',new URL('../public/explorer/campus/campus_web.glb',import.meta.url)],
 ['/explorer/campus/coordinates.json',new URL('../public/explorer/campus/coordinates.json',import.meta.url)],
 ['/campus/valley_lod.glb',new URL('../public/campus/valley_lod.glb',import.meta.url)]
]);
const assetServer=createServer(async(req,res)=>{try{const file=assetFiles.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}res.writeHead(200);res.end(await readFile(file));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>assetServer.listen(0,'127.0.0.1',resolve));assetServer.unref();const assetOrigin='http://127.0.0.1:'+assetServer.address().port;
const base=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return {url:base+'three.module.js',shortCircuit:true};
 if(specifier.startsWith('/campus/vendor/'))return {url:base+specifier.slice('/campus/vendor/'.length),shortCircuit:true};
 return next(specifier,context);
}});
globalThis.ProgressEvent=class {constructor(type,values){this.type=type;Object.assign(this,values);}};
const nativeFetch=globalThis.fetch;
const NativeRequest=globalThis.Request;
const localAsset=input=>typeof input==='string'&&(input.startsWith('/campus/')||input.startsWith('/explorer/campus/'))?assetOrigin+input:input;
globalThis.Request=class extends NativeRequest{constructor(input,options){super(localAsset(input),options);}};
globalThis.fetch=(input,options)=>nativeFetch(localAsset(input),options);
const {createWorld,createCollisionIndex}=await import('../public/explorer/game/world.mjs');
const start=performance.now(),world=await createWorld({scene:new THREE.Scene()});
console.log('Collision',JSON.stringify(world.stats),'prepared',Math.round(performance.now()-start),'ms','heap',Math.round(process.memoryUsage().heapUsed/1048576),'MB');
if(process.argv.includes('--audit-ground')){
 const triangles=[];const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
 world.model.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.getAttribute('position'),s=mesh.geometry.getAttribute('_surface'),ix=mesh.geometry.index;if(!s)throw Error('Missing semantic ground attribute');for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(n=>ix?ix.getX(i+n):i+n),surface=Math.round(s.getX(ids[0]));if(!surface)continue;[a,b,c].forEach((v,n)=>v.fromBufferAttribute(p,ids[n]).applyMatrix4(mesh.matrixWorld));normal.crossVectors(b.clone().sub(a),c.clone().sub(a));if(normal.length()<1e-10||normal.y/normal.length()<.6)continue;triangles.push({kind:'ground',surface,a:a.toArray(),b:b.toArray(),c:c.toArray()});}});
 const terrain=createCollisionIndex(triangles.filter(t=>t.surface===1));
 const samples={},errors=[];
 for(let i=0;i<triangles.length;i++){
  const t=triangles[i];if(t.surface===1||i%11)continue;
  const x=(t.a[0]+t.b[0]+t.c[0])/3,z=(t.a[2]+t.b[2]+t.c[2])/3,y=(t.a[1]+t.b[1]+t.c[1])/3;
  const base=terrain.groundHeight(x,z);if(base===null)continue;
  const item=samples[t.surface]??={samples:0,minGap:Infinity,maxGap:-Infinity,maxContactError:0};item.samples++;item.minGap=Math.min(item.minGap,y-base);item.maxGap=Math.max(item.maxGap,y-base);
  const height=world.groundHeight(x,z,t.surface===7?y:undefined),error=y-height;
  item.maxContactError=Math.max(item.maxContactError,error);
  if(error>.00001||height===null||t.surface!==7&&(y-base<-.0003||y-base>.012))errors.push({surface:t.surface,x,z,y,base,height});
 }
 const report={modelSha256:createHash('sha256').update(await readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url))).digest('hex'),stats:world.stats,samples,errors};
 await writeFile('tmp/explorer-grounding-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,errors:errors.length,firstErrors:errors.slice(0,3)},null,2));world.dispose();assetServer.close();if(errors.length)process.exitCode=1;else console.log('GROUND_CONTACT_AUDIT_PASSED');
}else{
// Use the larger scooter footprint, so a reviewed route supports both modes.
const step=.10,radius=.45*UNIT,results=[],quant=p=>({x:Math.round(p.x/step),z:Math.round(p.z/step)}),cache=new Map();
const reuse=process.argv.includes('--verify-existing')||process.argv.includes('--extend');
const previousResults=reuse?JSON.parse(await readFile('tmp/explorer-route-audit.json','utf8')).results:[];
const targets=[...LOCATIONS,...CAT_TRAIL.map(p=>({...p,id:'cat:'+p.id})),...FRAGMENTS.map(p=>({...p,id:'fragment:'+p.id})),...COSMO_SPOTS.map(p=>({...p,id:'cosmo:'+p.id})),...LOST_ITEMS,...TUNE_NOTES,...PHOTO_SPOTS,...SECRETS,...TRIALS.flatMap(t=>t.points.map((p,i)=>({...p,id:'trial:'+t.id+':'+i})))];
const priorById=new Map(previousResults.map(r=>[r.id,r])),byCoordinate=new Map();
for(const p of targets)if(priorById.has(p.id))byCoordinate.set(p.x+','+p.z,priorById.get(p.id));
const selection=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:null;
const key=(x,z)=>x+','+z;
class Heap{items=[];push(n){const a=this.items;a.push(n);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].estimate<=n.estimate)break;a[i]=a[p];i=p;}a[i]=n;}pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].estimate<a[c].estimate)c++;if(a[c].estimate>=last.estimate)break;a[i]=a[c];i=c;}a[i]=last;}return first;}get length(){return this.items.length;}}
function height(x,z){const k=key(x,z);if(!cache.has(k))cache.set(k,world.groundHeight(x*step,z*step));return cache.get(k);}
function route(from,to){
 const s=quant(from),target=quant(to),open=new Heap(),best=new Map([[key(s.x,s.z),0]]),parents=new Map(),closed=new Set();let examined=0;open.push({...s,cost:0,estimate:0});
 while(open.length&&examined<100000){const n=open.pop(),nk=key(n.x,n.z);if(closed.has(nk))continue;closed.add(nk);examined++;if(Math.hypot(n.x-target.x,n.z-target.z)<1.6){let p=n,path=[];while(p){path.push({x:p.x*step,z:p.z*step});p=parents.get(key(p.x,p.z));}return {pass:true,nodes:examined,points:path.reverse()};}
  const y=height(n.x,n.z);if(y===null)continue;
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,z=n.z+dz;if(x<-310||x>270||z<-390||z>290)continue;const cost=n.cost+Math.hypot(dx,dz),k=key(x,z);if(closed.has(k)||cost>=(best.get(k)??Infinity)||height(x,z)===null)continue;const next=world.move({x:n.x*step,y,z:n.z*step},{x:dx*step,z:dz*step},radius);if(Math.hypot(next.x-x*step,next.z-z*step)>.015)continue;const back=world.move({x:x*step,y:height(x,z),z:z*step},{x:-dx*step,z:-dz*step},radius);if(Math.hypot(back.x-n.x*step,back.z-n.z*step)>.015)continue;best.set(k,cost);parents.set(k,n);open.push({x,z,cost,estimate:cost+Math.hypot(target.x-x,target.z-z)});}
 }
 return {pass:false,nodes:examined};
}
function traversable(a,b){
 const y=world.groundHeight(a.x,a.z),backY=world.groundHeight(b.x,b.z);
 if(y===null||backY===null)return false;
 const next=world.move({...a,y},{x:b.x-a.x,z:b.z-a.z},radius);
 const back=world.move({...b,y:backY},{x:a.x-b.x,z:a.z-b.z},radius);
 return Math.hypot(next.x-b.x,next.z-b.z)<.015&&Math.hypot(back.x-a.x,back.z-a.z)<.015;
}
for(const target of targets.filter(t=>!selection||t.id===selection)){
 const coordinate=target.x+','+target.z,cached=byCoordinate.get(coordinate);
 const valid=cached?.pass&&cached.points.every((p,i)=>!i||traversable(cached.points[i-1],p));
 const result=valid?cached:route(SPAWN,target);
 results.push({...result,id:target.id});byCoordinate.set(coordinate,result);
 console.log(target.id,result.pass?'reachable':'NO ROUTE',result.nodes,valid?'(revalidated)':'');
}
const report={stats:world.stats,memory:process.memoryUsage(),elapsedMs:Math.round(performance.now()-start),results};
await writeFile('tmp/explorer-route-audit.json',JSON.stringify(report,null,2));
if(results.length!==targets.length||results.some(r=>!r.pass)||selection){world.dispose();assetServer.close();throw Error('Navigation requires a successful complete route audit.');}
const nodes=[],edges=[],lookup=new Map(),edgeSet=new Set();let reverseFailures=0;
for(const result of results){let previous=null;for(const point of result.points){const x=Math.round(point.x/step),z=Math.round(point.z/step),k=key(x,z);if(!lookup.has(k)){lookup.set(k,nodes.length);nodes.push([x,z]);}const index=lookup.get(k);if(previous!==null&&index!==previous){const signature=[previous,index].sort((a,b)=>a-b).join(',');if(!edgeSet.has(signature)){const a=nodes[previous],b=nodes[index],p={x:b[0]*step,z:b[1]*step,y:world.groundHeight(b[0]*step,b[1]*step)},back=world.move(p,{x:(a[0]-b[0])*step,z:(a[1]-b[1])*step},radius);if(Math.hypot(back.x-a[0]*step,back.z-a[1]*step)>.015)reverseFailures++;edgeSet.add(signature);edges.push([previous,index]);}}previous=index;}}
world.dispose();assetServer.close();if(reverseFailures)throw Error('Route segments need reverse-traversal review: '+reverseFailures);
const modelSha256=createHash('sha256').update(await readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url))).digest('hex');
const text=JSON.stringify({version:1,step,modelSha256,nodes,edges}),hash=createHash('sha256').update(text).digest('hex').slice(0,12),name='navigation-'+hash+'.json';
await writeFile(new URL('../public/explorer/'+name,import.meta.url),text+'\n');
await writeFile(new URL('../public/explorer/game/navigation-data.mjs',import.meta.url),`// Generated by scripts/build-explorer-navigation.mjs after collision review.\nexport const NAVIGATION_URL='/explorer/${name}';\n`);
console.log('Saved verified navigation network',name,nodes.length,'nodes',edges.length,'two-way edges.');
}
