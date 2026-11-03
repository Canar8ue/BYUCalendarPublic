import * as THREE from '../public/campus/vendor/three.module.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {UNIT,SPAWN} from '../public/explorer/game/content.mjs';
import {createCampusLife} from '../public/explorer/game/activities.mjs';
import {DISTRICT_POINTS as P} from '../public/explorer/game/district-content.mjs';
import {createRouteGraph} from '../public/explorer/game/navigation.mjs';
import {NAVIGATION_URL} from '../public/explorer/game/navigation-data.mjs';
import {clipDistrictMotion} from '../public/explorer/game/district-collision.mjs';
const base=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:base+'three.module.js',shortCircuit:true};if(specifier.startsWith('/campus/vendor/'))return {url:base+specifier.slice('/campus/vendor/'.length),shortCircuit:true};return next(specifier,context);}});
const assetFiles=new Map([['/explorer/campus/campus_web.glb',new URL('../public/explorer/campus/campus_web.glb',import.meta.url)],['/explorer/campus/coordinates.json',new URL('../public/explorer/campus/coordinates.json',import.meta.url)],['/campus/valley_lod.glb',new URL('../public/campus/valley_lod.glb',import.meta.url)]]);
const server=createServer(async(req,res)=>{try{const file=assetFiles.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}res.end(await readFile(file));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
const origin='http://127.0.0.1:'+server.address().port,nativeFetch=globalThis.fetch,NativeRequest=globalThis.Request;
const local=input=>typeof input==='string'&&(input.startsWith('/campus/')||input.startsWith('/explorer/campus/'))?origin+input:input;
globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,{type},values);}};
globalThis.Request=class extends NativeRequest{constructor(input,options){super(local(input),options);}};
globalThis.fetch=(input,options)=>nativeFetch(local(input),options);
const {createWorld}=await import('../public/explorer/game/world.mjs');
const {createDistrict}=await import('../public/explorer/game/npcs.mjs');
const start=performance.now(),scene=new THREE.Scene(),world=await createWorld({scene}),graph=createRouteGraph(JSON.parse(await readFile(new URL('../public'+NAVIGATION_URL,import.meta.url),'utf8')));
const clear=(a,b)=>{const y=world.groundHeight(a.x,a.z);if(!Number.isFinite(y))return false;const next=world.move({...a,y},{x:b.x-a.x,z:b.z-a.z},.32*UNIT);return Math.hypot(next.x-b.x,next.z-b.z)<.001;};
const getRoute=(from,to)=>{const route=graph.findPath(from,to,clear);return route.length?[{x:from.x,z:from.z},...route,{x:to.x,z:to.z}]:[];};
let s=createCampusLife();
// A deterministic canvas substitute counts production sign textures without
// requiring a graphics context. This audit never renders or writes model assets.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
const district=createDistrict(scene,world,{getState:()=>s,getRoute});
const originalMove=world.move.bind(world);world.move=(from,delta,radius,options)=>originalMove(from,clipDistrictMotion(from,delta,district.getObstacles(),radius),radius,options);
const failures=[],characters=()=>district.getCharacters(),byId=id=>characters().find(c=>c.id===id),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)/UNIT;
const art=scene.getObjectByName('Cookie Corner and recurring students');
// Furniture is new runtime collision. Recheck every existing graph edge so
// the district cannot silently obstruct an older quest or trial route hint.
const graphReview={edges:0,blocked:[],preExistingBlocked:[]};
const edgeClear=(move,a,b)=>{const y=world.groundHeight(a.x,a.z);if(!Number.isFinite(y))return false;const next=move({...a,y},{x:b.x-a.x,z:b.z-a.z},.45*UNIT);return Math.hypot(next.x-b.x,next.z-b.z)<.015;};
for(let id=0;id<graph.nodes.length;id++)for(const edge of graph.nodes[id].edges){if(edge.id<=id)continue;graphReview.edges++;const a=graph.nodes[id],b=graph.nodes[edge.id];if(!edgeClear(originalMove,a,b)||!edgeClear(originalMove,b,a))graphReview.preExistingBlocked.push([id,edge.id]);else if(!edgeClear(world.move,a,b)||!edgeClear(world.move,b,a))graphReview.blocked.push([id,edge.id]);}
if(graphReview.blocked.length)failures.push({kind:'existing-navigation',...graphReview});
function visualCost(){
 const geometry=new Set(),materials=new Set(),textures=new Set();let meshes=0;
 art.traverse(o=>{if(o.isMesh){meshes++;geometry.add(o.geometry);}for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
 let drawCalls=0,triangles=0;art.traverseVisible(o=>{if(!o.isMesh)return;drawCalls++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);});
 let geometryBytes=0;for(const geo of geometry){for(const attribute of Object.values(geo.attributes))geometryBytes+=attribute.array.byteLength;if(geo.index)geometryBytes+=geo.index.array.byteLength;}
 return {meshes,uniqueGeometries:geometry.size,uniqueMaterials:materials.size,textures:textures.size,geometryBytes,textureRGBABytes:[...textures].reduce((sum,t)=>sum+(t.image?.width||0)*(t.image?.height||0)*4,0),visibleDrawCalls:drawCalls,visibleTriangles:triangles};
}
district.update(0,0,{player:P.library,reducedMotion:true});const initialCost=visualCost();
const anchors=district.getAnchors(),routes=[];
for(const p of characters()){
 const route=getRoute(SPAWN,p);const blocked=route.filter((point,i)=>i&&!clear(route[i-1],point)).length;
 const floor=world.supportHeight(p.x,p.z);
 const item={id:p.id,groundErrorMeters:Math.abs(p.y-floor)/UNIT,pathPoints:route.length,blockedSegments:blocked,position:{x:p.x,z:p.z}};routes.push(item);
 if(!route.length||blocked||!Number.isFinite(floor)||item.groundErrorMeters>.01)failures.push({kind:'anchor',...item});
}
const step=(seconds,player)=>{for(let i=0;i<Math.ceil(seconds/.1);i++){s.clock+=.1;district.update(.1,s.clock,{player,reducedMotion:true});}};
const far={x:-20,z:-20};const transitions=[];
for(const [id,stage,target]of [['jun',1,P.music],['jun',3,P.stand],['sofia',2,P.stand]]){
 s[id].stage=stage;const before=byId(id),route=getRoute(before,target),routeMeters=route.reduce((sum,p,i)=>i?sum+distance(route[i-1],p):sum,0);let seconds=0;
 for(;seconds<600;seconds+=.1){step(.1,far);if(byId(id).atDestination)break;}
 const after=byId(id),item={id,stage,routeMeters,travelSeconds:Math.round(seconds*10)/10,from:{x:before.x,z:before.z},to:{x:after.x,z:after.z},distanceToTargetMeters:distance(after,target),arrived:after.atDestination,navigation:district.diagnostics.navigation.find(c=>c.id===id)};transitions.push(item);if(!after.atDestination||item.distanceToTargetMeters>4)failures.push({kind:'transition',...item});
}
// Follow a real reviewed route rather than teleporting the companion to finish.
s=createCampusLife();s.eli.stage=1;district.reset();let player={...P.library};step(.1,player);
const path=getRoute(player,P.jkb);let node=1;
for(let i=0;i<10000&&node<path.length;i++){
 const target=path[node],dx=target.x-player.x,dz=target.z-player.z,d=Math.hypot(dx,dz),travel=1.1*UNIT*.1;
 if(d<=travel){player={...target};node++;}else player={x:player.x+dx/d*travel,z:player.z+dz/d*travel};
 s.clock+=.1;district.update(.1,s.clock,{player,reducedMotion:true});
}
step(20,P.jkb);const eli=byId('eli'),escort={pathPoints:path.length,distanceToDestinationMeters:distance(eli,P.jkb),position:{x:eli.x,z:eli.z},arrived:eli.atDestination};if(!path.length||distance(eli,P.jkb)>4)failures.push({kind:'escort',...escort});
const finale=createCampusLife();finale.maya={stage:5,cookie:'sugar',pennants:['library','arts','lane'],cards:['eli','jun','sofia']};finale.jun.stage=4;finale.sofia={stage:3,photos:['library','arts']};s=finale;district.reset();district.update(0,0,{player:P.stand,reducedMotion:true});const gatheringCost=visualCost();
const report={createdAt:new Date().toISOString(),modelSha256:createHash('sha256').update(await readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url))).digest('hex'),elapsedMs:Math.round(performance.now()-start),anchors,graphReview,routes,transitions,escort,diagnostics:district.diagnostics,artCost:{initialLibrary:initialCost,completedGathering:gatheringCost},heapMB:Math.round(process.memoryUsage().heapUsed/1048576),failures};
await mkdir(new URL('../tmp/',import.meta.url),{recursive:true});
await writeFile(new URL('../tmp/explorer-district-visual-audit.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));district.dispose();world.dispose();server.close();if(failures.length)process.exitCode=1;
