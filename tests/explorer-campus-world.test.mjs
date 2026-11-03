import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../public/campus/vendor/three.module.js';
import {UNIT} from '../public/explorer/game/content.mjs';
import {CAMPUS_STANDS,CAMPUS_ACTIVITIES} from '../public/explorer/game/campus-content.mjs';
import {auditCampusActivities} from '../scripts/audit-explorer-campus.mjs';

const vendor=new URL('../public/campus/vendor/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('/campus/vendor/'))return {url:vendor+specifier.slice('/campus/vendor/'.length),shortCircuit:true};return next(specifier,context);}});
const {createCampusWorld}=await import('../public/explorer/game/campus-world.mjs');
const far={x:-40,z:-40};
const fresh=()=>({version:1,met:[],talks:{},completed:[],activities:{}});
const entry=(a,count=0,finished=false)=>({started:true,steps:a.steps.slice(0,count).map(s=>s.id),answers:{},finished});
function fixture({getRoute=()=>[]}={}) {
  const scene=new THREE.Scene(),state=fresh();
  const plane={groundHeight:()=>1,supportHeight:()=>1,move:(from,delta)=>new THREE.Vector3(from.x+delta.x,1,from.z+delta.z)};
  const campus=createCampusWorld(scene,plane,{getState:()=>state,getRoute});
  const tick=(seconds,options={})=>{for(let i=0;i<Math.ceil(seconds/.1);i++)campus.update(.1,i*.1,{player:far,reducedMotion:true,...options});};
  return {scene,state,campus,tick};
}

test('six new hosts have distinct silhouettes, meter scale and finite handoff poses',()=>{
  const f=fixture();assert.equal(f.campus.getCharacters().length,6);assert.equal(new Set(f.campus.getCharacters().map(c=>c.color)).size,6);
  for(const c of f.campus.getCharacters()){
    const group=f.scene.getObjectByName(c.name);assert.deepEqual(group.scale.toArray(),[UNIT,UNIT,UNIT]);const before=group.position.toArray();
    f.campus.interact(c.id,'deliver');f.tick(.1,{player:c});assert.deepEqual(group.position.toArray(),before);assert.equal(f.campus.getCharacters().find(n=>n.id===c.id).gesture,'handoff');
    group.updateMatrixWorld(true);group.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
  assert.ok(f.scene.getObjectByName('Club badges'));assert.ok(f.scene.getObjectByName('Reading notebook'));assert.ok(f.scene.getObjectByName('Artist beret'));assert.ok(f.scene.getObjectByName('Fan pennant'));assert.ok(f.scene.getObjectByName('Volunteer satchel'));f.campus.dispose();
});

test('booth titles read normally from both approaches with two outward faces sharing one texture',()=>{
  const f=fixture();for(const stand of CAMPUS_STANDS){const front=f.scene.getObjectByName('Readable booth header: '+stand.title),back=f.scene.getObjectByName('Readable booth reverse: '+stand.title);assert.ok(front&&back);assert.equal(front.material,back.material);assert.equal(front.geometry,back.geometry);assert.equal(front.material.side,THREE.FrontSide);assert.equal(back.rotation.y,Math.PI);assert.ok(back.position.z<front.position.z);}f.campus.dispose();
});

test('step props coalesce, remain walkable and persist as changed studies with story result cards',()=>{
  const f=fixture(),a=CAMPUS_ACTIVITIES[0],keys=new Set(CAMPUS_ACTIVITIES.flatMap(a=>a.steps.filter(s=>s.prop).map(s=>s.point.id+':'+s.prop)));
  assert.equal(f.campus.diagnostics.props.length,keys.size);assert.ok(f.campus.diagnostics.props.every(p=>!p.visible));
  f.state.activities[a.id]=entry(a);f.tick(.1,{player:a.steps[0].point});
  const key=a.steps[0].point.id+':'+a.steps[0].prop;assert.ok(f.campus.diagnostics.props.find(p=>p.id===key).current>0);
  f.state.activities[a.id]=entry(a,a.steps.length,true);const restored=JSON.parse(JSON.stringify(f.state));Object.assign(f.state,restored);f.campus.reset();f.tick(.1,{player:a.steps[0].point});
  assert.ok(f.campus.diagnostics.props.find(p=>p.id===key).completed>0);const booth=f.campus.diagnostics.booths.find(b=>b.npcId===a.npcId);assert.deepEqual(booth.resultCards,[a.id]);
  const cards=[];f.scene.traverse(o=>{if(o.userData.walkableDecoration)cards.push(o);});assert.equal(cards.length,keys.size);assert.ok(cards.every(o=>o.userData.maxHeightMeters<=.025));
  assert.equal(f.campus.getObstacles().length,CAMPUS_STANDS.length*3,'only solid counters receive matching collision circles');f.campus.dispose();
});

test('carried supplies require a completed pickup and disappear after their matching delivery',()=>{
  const f=fixture(),a=CAMPUS_ACTIVITIES[0],pickup=a.steps.find(s=>s.type==='interact'&&s.item),deliverIndex=a.steps.findIndex(s=>s.type==='deliver'&&s.item===pickup.item);
  f.state.activities[a.id]=entry(a);f.tick(.1);assert.deepEqual(f.campus.diagnostics.carriedItems,[]);
  f.state.activities[a.id]=entry(a,1);f.tick(.1);assert.deepEqual(f.campus.diagnostics.carriedItems,[pickup.item]);
  f.state.activities[a.id]=entry(a,deliverIndex+1);f.tick(.1);assert.deepEqual(f.campus.diagnostics.carriedItems,[]);f.campus.dispose();
});

test('paused simulation and unavailable routes preserve safe host positions',()=>{
  const f=fixture(),before=f.campus.getCharacters(),clock=f.campus.diagnostics.clock;
  f.campus.update(.1,900,{player:far,paused:true});assert.equal(f.campus.diagnostics.clock,clock);assert.deepEqual(f.campus.getCharacters(),before);
  f.tick(270);for(const c of f.campus.getCharacters()){const original=before.find(p=>p.id===c.id);assert.equal(c.x,original.x);assert.equal(c.z,original.z);assert.equal(c.y,1);}
  assert.ok(f.campus.diagnostics.navigation.some(n=>n.blocked==='no-route'));f.campus.dispose();
});

test('an incoming delivery brings its host back by a retained route without teleporting',()=>{
  let plans=0;const f=fixture({getRoute:(from,to)=>{plans++;return [{x:from.x,z:from.z},{x:to.x,z:to.z}];}});
  const a=CAMPUS_ACTIVITIES.find(a=>a.steps.some(s=>s.type==='deliver'&&s.npcId==='owen')),index=a.steps.findIndex(s=>s.type==='deliver'&&s.npcId==='owen');
  f.state.activities[a.id]=entry(a,index);const original=f.campus.getCharacters().find(c=>c.id==='owen'),group=f.scene.getObjectByName('Owen');group.position.z-=2*UNIT;
  const displaced=group.position.z;f.tick(.1);assert.ok(group.position.z>displaced&&group.position.z<original.z,'one update walks only its measured distance');
  f.tick(2);assert.ok(Math.abs(group.position.z-original.z)<.65*UNIT);assert.equal(plans,1);f.campus.dispose();
});

test('campus art shares geometry and disposes textures and materials exactly once',()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
  try {
    const f=fixture(),resources=new Set();f.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});
    const counts=new Map([...resources].map(r=>[r,0]));for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));
    const textures=[...resources].filter(r=>r.isTexture);assert.equal(textures.length,18,'six name labels, six booth signs and six shared story atlases');
    f.campus.dispose();f.campus.dispose();assert.equal(f.scene.children.length,0);assert.ok([...counts.values()].every(n=>n===1));
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('actual decoded campus preserves every graph edge and grounds every new host, activity and prop',async()=>{
  const report=await auditCampusActivities();assert.deepEqual(report.failures,[]);assert.equal(report.inventory.newCharacters,6);assert.equal(report.inventory.newStands,6);assert.equal(report.inventory.newActivities,19);assert.equal(report.inventory.sharedPointProps,44);
  assert.equal(report.graphReview.edges,3845);assert.deepEqual(report.graphReview.preExistingBlocked,[]);assert.deepEqual(report.graphReview.blocked,[]);assert.ok(report.anchors.every(a=>a.pathPoints>1&&a.groundErrorMeters<.01));assert.ok(report.activityPoints.every(p=>p.pathPoints>1&&p.blockedSegments===0));
  assert.ok(report.propAnchors.every(p=>p.walkable&&p.distanceToAnchorMeters<4&&p.groundErrorMeters<.01));assert.ok(report.artCost.every(c=>c.textureRGBABytes<6_500_000&&c.geometryBytes<25_000));assert.ok(report.completedProps.every(b=>b.resultCards.length===b.completed));
  assert.ok(report.routineTraversal.every(w=>w.meters>1000&&w.arrivals>0&&w.maxGroundErrorMeters<.01));assert.ok(report.routineTraversal.every(w=>(w.blockedFrames.person||0)<100),'walkers yield rather than remaining in a head-on deadlock');
});
