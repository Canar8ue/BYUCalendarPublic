import * as THREE from '../public/campus/vendor/three.module.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {UNIT,SPAWN} from '../public/explorer/game/content.mjs';
import {CAMPUS_NPCS,CAMPUS_STANDS,CAMPUS_ACTIVITIES} from '../public/explorer/game/campus-content.mjs';
import {createCampusLife} from '../public/explorer/game/activities.mjs';
import {createRouteGraph} from '../public/explorer/game/navigation.mjs';
import {NAVIGATION_URL} from '../public/explorer/game/navigation-data.mjs';
import {clipDistrictMotion} from '../public/explorer/game/district-collision.mjs';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const canvas=()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});

export async function auditCampusActivities() {
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:vendor+'three.module.js',shortCircuit:true};if(specifier.startsWith('/campus/vendor/'))return {url:vendor+specifier.slice('/campus/vendor/'.length),shortCircuit:true};return next(specifier,context);}});
  const assetFiles=new Map([['/explorer/campus/campus_web.glb',new URL('../public/explorer/campus/campus_web.glb',import.meta.url)],['/explorer/campus/coordinates.json',new URL('../public/explorer/campus/coordinates.json',import.meta.url)],['/campus/valley_lod.glb',new URL('../public/campus/valley_lod.glb',import.meta.url)]]);
  const server=createServer(async(req,res)=>{try{const file=assetFiles.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}res.end(await readFile(file));}catch{res.writeHead(500);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
  const origin='http://127.0.0.1:'+server.address().port,nativeFetch=globalThis.fetch,NativeRequest=globalThis.Request;
  const saved={document:globalThis.document,ProgressEvent:globalThis.ProgressEvent};
  const local=input=>typeof input==='string'&&(input.startsWith('/campus/')||input.startsWith('/explorer/campus/'))?origin+input:input;
  globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,{type},values);}};
  globalThis.Request=class extends NativeRequest{constructor(input,options){super(local(input),options);}};
  globalThis.fetch=(input,options)=>nativeFetch(local(input),options);
  globalThis.document={createElement:canvas};
  let world,legacy,campus;
  try {
    const [{createWorld},{createDistrict},{createCampusWorld}]=await Promise.all([import('../public/explorer/game/world.mjs'),import('../public/explorer/game/npcs.mjs'),import('../public/explorer/game/campus-world.mjs')]);
    const start=performance.now(),scene=new THREE.Scene();world=await createWorld({scene});
    const graph=createRouteGraph(JSON.parse(await readFile(new URL('../public'+NAVIGATION_URL,import.meta.url),'utf8')));
    const rawMove=world.move.bind(world),failures=[],life=createCampusLife();
    let activityState={version:1,met:[],talks:{},activities:{},completed:[]};
    const clear=(a,b,radius=.32*UNIT)=>{const y=world.groundHeight(a.x,a.z);if(!Number.isFinite(y))return false;const next=world.move({...a,y},{x:b.x-a.x,z:b.z-a.z},radius);return distance(next,b)<.015;};
    const getRoute=(from,to)=>{const path=graph.findPath(from,to,clear);return path.length?[{x:from.x,z:from.z},...path,{x:to.x,z:to.z}]:[];};
    legacy=createDistrict(scene,world,{getState:()=>life,getRoute});
    campus=createCampusWorld(scene,world,{getState:()=>activityState,getRoute,getLegacyCharacters:()=>legacy.getCharacters()});
    const allObstacles=()=>[...legacy.getObstacles(),...campus.getObstacles()];
    world.move=(from,motion,radius,options)=>rawMove(from,clipDistrictMotion(from,motion,allObstacles(),radius),radius,options);
    campus.update(0,0,{player:SPAWN,reducedMotion:true});
    const graphReview={edges:0,blocked:[],preExistingBlocked:[]};
    const edgeClear=(move,a,b)=>{const y=world.groundHeight(a.x,a.z);if(!Number.isFinite(y))return false;return distance(move({...a,y},{x:b.x-a.x,z:b.z-a.z},.45*UNIT),b)<.015;};
    for(let id=0;id<graph.nodes.length;id++)for(const edge of graph.nodes[id].edges){if(edge.id<=id)continue;graphReview.edges++;const a=graph.nodes[id],b=graph.nodes[edge.id];if(!edgeClear(rawMove,a,b)||!edgeClear(rawMove,b,a))graphReview.preExistingBlocked.push([id,edge.id]);else if(!edgeClear(world.move,a,b)||!edgeClear(world.move,b,a))graphReview.blocked.push([id,edge.id]);}
    if(graphReview.blocked.length)failures.push({kind:'navigation',blocked:graphReview.blocked});
    const reachable=(id,point)=>{const path=getRoute(SPAWN,point),blocked=path.filter((p,i)=>i&&!clear(path[i-1],p)).length,y=world.supportHeight(point.x,point.z);const item={id,x:point.x,z:point.z,pathPoints:path.length,blockedSegments:blocked,grounded:Number.isFinite(y)};if(!path.length||blocked||!item.grounded)failures.push({kind:'anchor',...item});return item;};
    const characters=campus.getCharacters(),anchors=characters.map(c=>({...reachable('npc:'+c.id,c),groundErrorMeters:Math.abs(c.y-world.supportHeight(c.x,c.z))/UNIT}));
    for(const c of anchors)if(c.groundErrorMeters>.01)failures.push({kind:'foot-contact',...c});
    const uniquePoints=new Map();for(const a of CAMPUS_ACTIVITIES)for(const step of a.steps)if(step.point)uniquePoints.set(step.point.id||`${step.point.x}:${step.point.z}`,step.point);
    const activityPoints=[...uniquePoints].map(([id,p])=>reachable(id,p));
    const propAnchors=campus.getAnchors().filter(p=>p.walkable).map(p=>{const ground=world.groundHeight(p.x,p.z),support=world.supportHeight(p.x,p.z),distanceToAnchor=distance(p,uniquePoints.get(p.activityPointId))/UNIT;const item={...p,groundErrorMeters:Math.abs(p.y-support)/UNIT,distanceToAnchorMeters:distanceToAnchor};if(!Number.isFinite(ground)||item.groundErrorMeters>.01||distanceToAnchor>4)failures.push({kind:'prop-placement',...item});return item;});
    const routeChecks=[];
    for(const definition of CAMPUS_NPCS)for(const phase of ['home','work','leisure']){
      const point=definition[phase];if(!point)continue;
      const character=characters.find(c=>c.id===definition.id),route=getRoute(character,point),blocked=route.filter((p,i)=>i&&!clear(route[i-1],p)).length;
      routeChecks.push({id:definition.id,phase,pathPoints:route.length,blockedSegments:blocked});if(!route.length||blocked)failures.push({kind:'routine-route',id:definition.id,phase});
    }
    // Keep every owner active while verifying their actual return-to-counter
    // behavior and grounded updates. No artificial teleport completes a walk.
    for(const definition of CAMPUS_NPCS){const a=CAMPUS_ACTIVITIES.find(a=>a.npcId===definition.id);activityState.activities[a.id]={started:true,steps:[],answers:{},finished:false};}
    const far={x:-40,z:-40};let maxGroundError=0,nonFinitePoses=0;
    for(let i=0;i<120;i++){campus.update(.1,i*.1,{player:far,reducedMotion:true});for(const c of campus.getCharacters())maxGroundError=Math.max(maxGroundError,Math.abs(c.y-world.supportHeight(c.x,c.z))/UNIT);}
    scene.updateMatrixWorld(true);scene.getObjectByName('Campus neighborhoods and recurring students').traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))nonFinitePoses++;});
    if(maxGroundError>.01||nonFinitePoses)failures.push({kind:'poses',maxGroundError,nonFinitePoses});
    const root=scene.getObjectByName('Campus neighborhoods and recurring students');
    const visualCost=()=>{const geos=new Set(),mats=new Set(),textures=new Set();let visibleDrawCalls=0,visibleTriangles=0;
      root.traverse(o=>{if(o.isMesh)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
      root.traverseVisible(o=>{if(o.isMesh){visibleDrawCalls++;visibleTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
      let geometryBytes=0;for(const g of geos){for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;if(g.index)geometryBytes+=g.index.array.byteLength;}
      return {uniqueGeometries:geos.size,materials:mats.size,textures:textures.size,geometryBytes,textureRGBABytes:[...textures].reduce((sum,t)=>sum+(t.image?.width||0)*(t.image?.height||0)*4,0),visibleDrawCalls,visibleTriangles};};
    const artCost=[];for(const stand of CAMPUS_STANDS){campus.update(0,20,{player:stand.point,reducedMotion:true});artCost.push({id:stand.id,...visualCost()});}
    // Exercise two complete game-time routine cycles against the real ground,
    // furniture and all five original students. Paths alone cannot prove that
    // the incremental controller actually leaves its anchor and follows them.
    activityState={version:1,met:[],talks:{},completed:[],activities:{}};campus.reset();
    const walks=new Map(campus.getCharacters().map(c=>[c.id,{id:c.id,meters:0,arrivals:0,maxGroundErrorMeters:0,blockedFrames:{},previous:c,wasArrived:true}]));
    for(let i=0;i<14400;i++){
      campus.update(.1,i*.1,{player:far,reducedMotion:true});const diagnostics=campus.diagnostics.navigation;
      for(const c of campus.getCharacters()){
        const walk=walks.get(c.id);walk.meters+=distance(c,walk.previous)/UNIT;walk.maxGroundErrorMeters=Math.max(walk.maxGroundErrorMeters,Math.abs(c.y-world.supportHeight(c.x,c.z))/UNIT);
        if(c.atDestination&&!walk.wasArrived)walk.arrivals++;const blocked=diagnostics.find(n=>n.id===c.id)?.blocked;if(blocked)walk.blockedFrames[blocked]=(walk.blockedFrames[blocked]||0)+1;
        walk.previous=c;walk.wasArrived=c.atDestination;
      }
    }
    const routineTraversal=[...walks.values()].map(walk=>({id:walk.id,meters:walk.meters,arrivals:walk.arrivals,maxGroundErrorMeters:walk.maxGroundErrorMeters,blockedFrames:walk.blockedFrames}));
    for(const walk of routineTraversal)if(walk.meters<10||walk.maxGroundErrorMeters>.01)failures.push({kind:'routine-traversal',...walk});
    activityState={version:1,met:[],talks:{},completed:CAMPUS_ACTIVITIES.map(a=>a.id),activities:Object.fromEntries(CAMPUS_ACTIVITIES.map(a=>[a.id,{started:true,steps:a.steps.map(s=>s.id),answers:{},finished:true}]))};
    campus.reset();campus.update(0,0,{player:SPAWN,reducedMotion:true});
    const completedProps=campus.diagnostics.booths;if(completedProps.some(b=>b.completed!==CAMPUS_ACTIVITIES.filter(a=>a.npcId===b.npcId).length))failures.push({kind:'outcome-props'});
    return {createdAt:new Date().toISOString(),modelSha256:createHash('sha256').update(await readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url))).digest('hex'),elapsedMs:Math.round(performance.now()-start),inventory:{newCharacters:characters.length,newStands:CAMPUS_STANDS.length,newActivities:CAMPUS_ACTIVITIES.length,uniqueActivityPoints:activityPoints.length,sharedPointProps:propAnchors.length},graphReview,anchors,activityPoints,propAnchors,routeChecks,routineTraversal,poseChecks:{maxGroundErrorMeters:maxGroundError,nonFinitePoses},artCost,completedProps,failures};
  } finally {
    campus?.dispose();legacy?.dispose();world?.dispose();server.close();hook.deregister();globalThis.fetch=nativeFetch;globalThis.Request=NativeRequest;
    if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
    if(saved.ProgressEvent===undefined)delete globalThis.ProgressEvent;else globalThis.ProgressEvent=saved.ProgressEvent;
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const report=await auditCampusActivities();await mkdir(new URL('../tmp/',import.meta.url),{recursive:true});await writeFile(new URL('../tmp/explorer-campus-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
