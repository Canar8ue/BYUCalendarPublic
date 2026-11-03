import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createProgress,validateProgress,saveProgress,loadProgress,claimReward,getSummary} from '../public/explorer/game/progress.mjs';
import {UNIT} from '../public/explorer/game/content.mjs';

// Keep the actual runtime/state engine, scene objects, reward registry and save
// validation. Only browser modal controls, actor meshes and a drawing canvas are
// replaced. Each UI method follows its real open/close callback contract.
const adapterURL='data:text/javascript;base64,'+Buffer.from(`
let harness;
export function setHarness(value){harness=value;}
export function createHikeUI(options){harness.emit=options.onAction;harness.uiOptions=options;harness.notify=options.onOpenChange;return harness.ui;}
export function createPlayer(scene){return harness.actor(scene,'caleb');}
export function createScooter(scene){return harness.actor(scene,'scooter');}
`).toString('base64');
const adapter=await import(adapterURL);
let source=await readFile(new URL('../public/explorer/game/hike-runtime.mjs',import.meta.url),'utf8');
source=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(['./actors.mjs','./hike-ui.mjs'].includes(path.split('?')[0])?adapterURL:new URL('../public/explorer/game/'+path.slice(2),import.meta.url).href));
source=source.replace("'/campus/vendor/three.module.js'",JSON.stringify(new URL('../public/campus/vendor/three.module.js',import.meta.url).href));
const {createHikeRuntime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {fillRect(){},fillText(){}};}};}};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function fixtureRoute(){
  const points=Array.from({length:121},(_,i)=>({x:i*.5*UNIT,y:1,z:0,distanceMeters:i*.5}));
  return {revision:'20261102hike1',points,route:points,checkpoints:[
    {...points[0],id:'trailhead',name:'Y Trailhead',kind:'trailhead',pointIndex:0},
    {...points[60],id:'turn-1',name:'Mapped bend',kind:'turn',pointIndex:60},
    {...points[120],id:'summit',name:'Top of the Y',kind:'summit',pointIndex:120},
  ]};
}
function harness({load,raw}={}){
  const route=fixtureRoute(),progress=raw?validateProgress(raw):createProgress();
  const h={route,progress,scene:new THREE.Scene(),player:{position:new THREE.Vector3(-1,1,-1),grounded:true,riding:false},paused:false,saves:0,loads:0,unloads:0,returns:0,photoOpen:0,actors:[],toasts:[],rewards:[],placed:[]};
  const zone={data:route,route:route.points,checkpoints:route.checkpoints,stats:{heightBytes:100},nearestRoute(x,z){return {distanceMeters:Math.max(0,Math.min(60,x/UNIT)),distance:Math.abs(z)};}};
  h.zone=zone;
  h.world={loadHike(onProgress){h.loads++;return load?load({h,zone,onProgress}):Promise.resolve(zone);},unloadHike(){h.unloads++;},supportHeight(){return 1;},move(position,delta){return new THREE.Vector3(position.x+delta.x,1,position.z+delta.z);}};
  h.actor=(scene,kind)=>{const actor={kind,group:new THREE.Group(),disposed:0,updates:0,setStyle(){},update(){this.updates++;},dispose(){this.disposed++;this.group.removeFromParent();}};scene.add(actor.group);h.actors.push(actor);return actor;};
  h.ui={isOpen:false,panel:null,disposed:0,open(panel){const was=this.isOpen;this.isOpen=true;this.panel=panel;if(!was)h.notify(true);},openTrailhead(){this.open('trailhead');},openJournal(){this.open('journal');},openCheckpoint(id){this.open('checkpoint');h.openCheckpoint=id;},setLoading(message){this.open('loading');h.loadingMessage=message;},setError(message){this.open('error');h.error=message;},close({notify=true}={}){const was=this.isOpen;this.isOpen=false;this.panel=null;if(was&&notify){h.notify(false);h.emit('close');}},dispose(){this.close({notify:false});this.disposed++;}};
  adapter.setHarness(h);
  const runtime=createHikeRuntime({scene:h.scene,world:h.world,getProgress:()=>h.progress,getPlayer:()=>({...h.player,position:h.player.position.clone()}),pause(){h.paused=true;},resume(){h.paused=false;},placePlayer(point){h.player.position.set(point.x,point.y,point.z);h.player.riding=false;h.player.grounded=true;h.placed.push(point.id);},returnToCampus(){h.returns++;h.player.position.set(-1,1,-1);},persist(){h.saves++;},reward(item){h.rewards.push(item);claimReward(h.progress,item.id,item.xp);},toast(...args){h.toasts.push(args);},openPhoto(){h.photoOpen++;}});
  h.runtime=runtime;
  h.move=(meters,{grounded=true,riding=false,enabled=true,dt=.1}={})=>{h.player.position.set(meters*UNIT,1,0);h.player.grounded=grounded;h.player.riding=riding;runtime.update(dt,{position:h.player.position,grounded,riding,enabled,reducedMotion:true});};
  h.walk=(from,to)=>{const direction=Math.sign(to-from)||1;h.move(from);for(let p=from+direction*.25;direction>0?p<=to:p>=to;p+=direction*.25)h.move(p);h.move(to);h.move(to);};
  h.cleanup=()=>runtime.dispose();
  return h;
}

test('opening or declining the hike performs no terrain request; travel parks the ride and keeps the campus checkpoint',async()=>{
  const h=harness(),checkpoint={...h.progress.checkpoint};
  h.runtime.open();assert.equal(h.ui.panel,'trailhead');assert.equal(h.loads,0);assert.equal(h.paused,true);
  h.emit('close');assert.equal(h.paused,false);assert.equal(h.loads,0);
  h.player.riding=true;await h.runtime.travel();
  assert.equal(h.loads,1);assert.equal(h.runtime.active,true);assert.equal(h.runtime.loading,false);assert.equal(h.player.riding,false);assert.deepEqual(h.progress.hike.reached,['trailhead']);
  assert.deepEqual(h.progress.checkpoint,checkpoint);assert.equal(getSummary(h.progress).xp,0);h.cleanup();
});

test('hiking failure returns safely, exposes retry, and retry starts with no lost progress',async()=>{
  let fail=true;const h=harness({load:({zone})=>fail?Promise.reject(new Error('offline')):Promise.resolve(zone)});
  const warn=console.warn;console.warn=()=>{};
  try{await h.runtime.travel();}finally{console.warn=warn;}
  assert.equal(h.runtime.active,false);assert.equal(h.runtime.loading,false);assert.equal(h.returns,1);assert.equal(h.ui.panel,'error');assert.equal(h.paused,true);assert.match(h.error,/trail could not load/i);
  fail=false;h.emit('retry');await settle();assert.equal(h.runtime.active,true);assert.equal(h.progress.hike.started,true);assert.equal(h.paused,false);h.cleanup();
});

test('closing an in-flight trip cancels its late arrival without placing the player',async()=>{
  const request=deferred(),h=harness({load:()=>request.promise});
  const trip=h.runtime.travel();assert.equal(h.runtime.loading,true);h.emit('close');
  assert.equal(h.runtime.loading,false);assert.equal(h.runtime.active,false);assert.equal(h.paused,false);assert.equal(h.unloads,1);
  request.resolve(h.zone);await trip;assert.deepEqual(h.placed,[]);assert.equal(h.runtime.active,false);assert.equal(h.progress.hike.started,false);assert.equal(h.actors.length,0);h.cleanup();
});

test('disposing while loading ignores late completion and never creates hiking art',async()=>{
  const request=deferred(),h=harness({load:()=>request.promise});const trip=h.runtime.travel();h.runtime.dispose();h.runtime.dispose();request.resolve(h.zone);await trip;
  assert.equal(h.runtime.active,false);assert.equal(h.runtime.loading,false);assert.equal(h.ui.disposed,1);assert.equal(h.actors.length,0);assert.deepEqual(h.placed,[]);
});

test('a continuous on-foot ascent and descent crosses runtime callbacks and rewards once',async()=>{
  const h=harness(),checkpoint={...h.progress.checkpoint};await h.runtime.travel();h.walk(0,30);assert.deepEqual(h.progress.hike.reached,['trailhead','turn-1']);h.walk(30,60);
  assert.deepEqual(h.progress.hike.reached,['trailhead','turn-1','summit']);assert.equal(h.progress.hike.summitSeen,true);assert.equal(getSummary(h.progress).xp,80);
  h.walk(60,30);assert.deepEqual(h.progress.hike.descent,['turn-1']);h.walk(30,0);assert.deepEqual(h.progress.hike.descent,['turn-1','trailhead']);h.emit('return');
  assert.equal(h.progress.hike.returned,true);assert.equal(getSummary(h.progress).xp,120);h.emit('return');assert.equal(getSummary(h.progress).xp,120);assert.deepEqual(h.progress.checkpoint,checkpoint);h.cleanup();assert.ok(h.actors.every(actor=>actor.disposed===1));assert.equal(h.scene.children.length,0);
});

test('airborne or mounted movement and a direct warp cannot unlock hiking checkpoints',async()=>{
  const h=harness();await h.runtime.travel();h.move(60);h.move(60);assert.deepEqual(h.progress.hike.reached,['trailhead']);assert.equal(h.progress.hike.summitSeen,false);
  h.move(0);h.walk(0,0);for(let m=0;m<=30;m+=.25)h.move(m,{riding:true});assert.deepEqual(h.progress.hike.reached,['trailhead']);
  for(let m=30;m>=0;m-=.25)h.move(m,{grounded:false});assert.deepEqual(h.progress.hike.reached,['trailhead']);assert.equal(getSummary(h.progress).xp,0);h.cleanup();
});

test('only reached checkpoints can be resumed, and assistance cannot complete the next descent segment',async()=>{
  const h=harness();await h.runtime.travel('summit');assert.equal(h.placed.at(-1),'trailhead');h.walk(0,30);h.walk(30,60);await h.runtime.travel('turn-1');
  assert.equal(h.placed.at(-1),'turn-1');assert.deepEqual(h.progress.hike.descent,[]);for(let i=0;i<8;i++)h.move(30);assert.deepEqual(h.progress.hike.descent,[]);
  assert.equal(getSummary(h.progress).xp,80);h.cleanup();
});

test('photo mode needs a rendered-photo commit in the valley direction and cannot farm a reward',async()=>{
  const h=harness();await h.runtime.travel();h.walk(0,30);h.walk(30,60);
  const camera={getWorldDirection(vector){return vector.set(-1,0,0);}},wrong={getWorldDirection(vector){return vector.set(1,0,0);}};
  assert.equal(h.runtime.preparePhoto(wrong),null);const commit=h.runtime.preparePhoto(camera);assert.equal(typeof commit,'function');assert.equal(h.progress.hike.postcard,false);assert.equal(getSummary(h.progress).xp,80);
  commit();assert.equal(h.progress.hike.postcard,true);assert.equal(getSummary(h.progress).xp,110);commit();assert.equal(getSummary(h.progress).xp,110);
  h.emit('take-photo',{id:'summit-view'});assert.equal(h.photoOpen,1);h.cleanup();
});

test('a stale photo commit cannot stamp a different trip and save reload preserves earned hiking claims',async()=>{
  const h=harness();await h.runtime.travel();h.walk(0,30);h.walk(30,60);
  const commit=h.runtime.preparePhoto({getWorldDirection(v){return v.set(-1,0,0);}});assert.equal(typeof commit,'function');h.runtime.leave();commit();assert.equal(h.progress.hike.postcard,false);
  const store={value:null,setItem(key,value){this.value=value;},getItem(){return this.value;}};
  assert.equal(saveProgress(h.progress,store),true);const restored=loadProgress(store);assert.deepEqual(restored.hike.reached,['trailhead','turn-1','summit']);assert.equal(restored.hike.summitSeen,true);assert.equal(restored.claims['hike:ascent'],80);assert.equal(getSummary(restored).xp,80);assert.deepEqual(restored.checkpoint,h.progress.checkpoint);h.cleanup();
});

test('paused or disabled update does not add walked-segment evidence',async()=>{
  const h=harness();await h.runtime.travel();for(let m=0;m<=30;m+=.25)h.move(m,{enabled:false});h.move(30);h.move(30);
  assert.deepEqual(h.progress.hike.reached,['trailhead'],'movement during a disabled update must not count as an ascent segment');h.cleanup();
});

test('interacting with a reached checkpoint advances the runtime segment origin',async()=>{
  const h=harness();await h.runtime.travel();
  // Reach the first bend before the periodic proximity scan executes, then
  // press Use. Both paths must update the same physical-segment anchor.
  for(let m=0;m<=30;m+=.25)h.move(m,{dt:.001});
  h.runtime.interact(h.runtime.targets().find(point=>point.id==='turn-1'));
  assert.deepEqual(h.progress.hike.reached,['trailhead','turn-1']);h.emit('close');h.walk(30,60);
  assert.deepEqual(h.progress.hike.reached,['trailhead','turn-1','summit'],'Use at a checkpoint must not leave the previous segment origin behind');h.cleanup();
});

test('direct gameplay departure clears hiking presence while preserving the unlocked checkpoint',async()=>{
  const h=harness();await h.runtime.travel();h.walk(0,30);h.runtime.leave({notify:false});
  assert.equal(h.runtime.active,false);assert.equal(h.progress.hike.inHike,false);assert.equal(h.progress.hike.lastCheckpoint,'turn-1');assert.equal(h.progress.hike.returned,false);assert.equal(getSummary(h.progress).xp,0);h.cleanup();
});

test('a saved hiking checkpoint remains dormant on campus until an explicit streamed resume',async()=>{
  const first=harness();await first.runtime.travel();first.walk(0,30);const raw=JSON.parse(JSON.stringify(first.progress));first.cleanup();
  const restored=harness({raw});assert.equal(restored.loads,0);assert.equal(restored.runtime.active,false);assert.deepEqual(restored.progress.hike.reached,['trailhead','turn-1']);assert.deepEqual(restored.player.position.toArray(),[-1,1,-1]);
  restored.runtime.open();assert.equal(restored.loads,0);assert.equal(restored.ui.panel,'trailhead');await restored.runtime.travel('turn-1');assert.equal(restored.placed.at(-1),'turn-1');assert.equal(restored.runtime.active,true);assert.deepEqual(restored.progress.checkpoint,first.progress.checkpoint);restored.cleanup();
});

test('three hiking enter/exit cycles dispose every authored actor and retain the same reward ledger',async()=>{
  const h=harness(),checkpoint={...h.progress.checkpoint};
  for(let i=0;i<3;i++){
    await h.runtime.travel();assert.equal(h.actors.length,(i+1)*2);h.runtime.leave({notify:false});assert.equal(h.runtime.active,false);assert.equal(h.scene.children.length,0);assert.ok(h.actors.every(actor=>actor.disposed===1));
  }
  assert.equal(h.loads,3);assert.equal(h.unloads,3);assert.deepEqual(h.progress.checkpoint,checkpoint);assert.deepEqual(h.progress.claims,{});h.cleanup();
});

test('a side spur keeps Caleb and route hints on that spur instead of interpreting its local distance as the main ascent',async()=>{
  const h=harness();
  // The branch joins thirty metres along the main trail. Its local distance
  // starts at zero; those metres cannot index the beginning of the main path.
  const branch=Array.from({length:41},(_,i)=>({x:30*UNIT,y:1,z:i*.5*UNIT,distanceMeters:i*.5}));
  h.zone.data.branches=[{id:'base-spur',points:branch}];
  h.zone.routes=[{id:'main',points:h.zone.route},{id:'base-spur',points:branch}];
  h.zone.nearestRoute=(x,z)=>z>.00001?{routeId:'base-spur',distanceMeters:Math.max(0,Math.min(20,z/UNIT)),distance:Math.abs(x-30*UNIT)}:{routeId:'main',distanceMeters:Math.max(0,Math.min(60,x/UNIT)),distance:Math.abs(z)};
  await h.runtime.travel();h.walk(0,30);
  const alongSpur=(meters,dt=.1)=>{
    h.player.position.set(30*UNIT,1,meters*UNIT);
    h.runtime.update(dt,{position:h.player.position,grounded:true,riding:false,enabled:true,reducedMotion:true});
  };
  for(let meters=.25;meters<=20;meters+=.25)alongSpur(meters);
  for(let i=0;i<30;i++)alongSpur(20);
  const caleb=h.actors.find(actor=>actor.kind==='caleb');
  assert.ok(Math.hypot(caleb.group.position.x-30*UNIT,caleb.group.position.z-20*UNIT)<8*UNIT,'Caleb must remain near the hiker on the actual side spur');
  const hints=h.scene.getObjectByProperty('isInstancedMesh',true),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  assert.ok(hints.count>0,'the side spur has visible route hints');
  for(let i=0;i<hints.count;i++){
    hints.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(point.x-30*UNIT)<.001*UNIT,'branch hints follow the spur x coordinate');
  }
  h.cleanup();
});
