import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/campus/vendor/three.module.js';
import {createProgress,claimReward,getSummary} from '../public/explorer/game/progress.mjs';
import {characterAnchor,validateCampusLife} from '../public/explorer/game/activities.mjs';
import {DISTRICT_POINTS as P} from '../public/explorer/game/district-content.mjs';
import {UNIT} from '../public/explorer/game/content.mjs';

// Exercise the real runtime and state engine, substituting only the browser
// modal and the GPU scene. These adapters expose their normal event boundary.
const adapterURL='data:text/javascript;base64,'+Buffer.from(`
let harness;
export function setHarness(value){harness=value;}
export function createDistrict(){return harness.district;}
export function createDistrictUI({onAction}){harness.emit=onAction;return harness.ui;}
`).toString('base64');
const adapter=await import(adapterURL);
let source=await readFile(new URL('../public/explorer/game/campus-life.mjs',import.meta.url),'utf8');
source=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(['./npcs.mjs','./district-ui.mjs'].includes(path.split('?')[0])?adapterURL:new URL('../public/explorer/game/'+path.slice(2),import.meta.url).href));
source=source.replace("'/campus/vendor/three.module.js'",JSON.stringify(new URL('../public/campus/vendor/three.module.js',import.meta.url).href));
const {createCampusLifeRuntime}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function harness(overrides={}){
  const progress=createProgress();
  progress.campusLife=validateCampusLife({...progress.campusLife,...overrides});
  const h={progress,world:{features:[]},player:{position:{...P.stand}},paused:false,saves:0,track:[],toasts:[],gestures:[],disposed:0};
  const characters=['maya','eli','nora','jun','sofia'].map(id=>({id,name:id,x:characterAnchor(progress.campusLife,id).x,z:characterAnchor(progress.campusLife,id).z}));
  h.district={update(){},getCharacters:()=>characters,interact:(...args)=>h.gestures.push(args),getObstacles:()=>[],getAnchors:()=>[],reset(){},dispose(){h.disposed++;}};
  h.ui={panel:null,isOpen:false,showConversation(value){this.panel='conversation';this.isOpen=true;h.conversation=value;},showJournal(value){this.panel='journal';this.isOpen=true;h.journal=value;},showRhythm(value){this.panel='rhythm';this.isOpen=true;h.rhythm=value;},close(){this.isOpen=false;this.panel=null;},dispose(){h.disposed++;}};
  adapter.setHarness(h);
  const runtime=createCampusLifeRuntime({
    scene:{},world:h.world,navigation:{findPath:()=>[]},getProgress:()=>progress,getPlayer:()=>h.player,
    pause(){h.paused=true;runtime?.suspend();},resume(){h.paused=false;},track(id){h.track.push(id);progress.trackedQuest=id;},persist(){h.saves++;},reward(value){claimReward(progress,value.id,value.xp);},toast:(...args)=>h.toasts.push(args),playNote(){},openPhoto(){h.photoOpen=true;},
  });
  h.runtime=runtime;
  h.person=id=>characters.find(n=>n.id===id);
  h.talk=id=>{h.player.position={x:h.person(id).x,z:h.person(id).z};runtime.interact(runtime.targets().find(t=>t.npcId===id));};
  h.choose=action=>{const choice=h.conversation.choices.find(c=>c.action===action);assert.ok(choice,'available dialogue choice '+action);h.emit('districtChoice',{npcId:h.conversation.npcId,action,choiceId:choice.id});};
  h.step=(position,extra={})=>{h.player.position={...position};runtime.update(.11,1,{position:h.player.position,grounded:true,speed:0,...extra});};
  return h;
}

test('district conversations pause, validate the current choice and resume without premature rewards',()=>{
  const h=harness();h.talk('maya');assert.equal(h.paused,true);assert.equal(h.conversation.name,'Maya');assert.deepEqual(h.progress.campusLife.met,['maya']);
  const saves=h.saves;
  h.emit('districtChoice',{npcId:'eli',action:'maya:start',choiceId:'maya:start'});
  assert.equal(h.progress.campusLife.maya.stage,0);assert.equal(h.saves,saves);
  h.choose('maya:start');h.choose('maya:cookie:chocolate');assert.equal(h.progress.campusLife.maya.stage,2);assert.equal(getSummary(h.progress).xp,0);
  h.emit('districtClose');assert.equal(h.paused,false);assert.equal(h.runtime.isOpen,false);
  assert.equal(h.progress.campusLife.maya.cookie,'chocolate');
  h.runtime.dispose();h.runtime.dispose();assert.equal(h.disposed,2,'each adapter disposes once');
});

test('cookie story completion crosses real runtime callbacks and grants exactly one registered reward',()=>{
  const h=harness();h.talk('maya');h.choose('maya:start');h.choose('maya:cookie:oat');h.emit('districtClose');
  for(const point of P.pennants){h.player.position={x:point.x,z:point.z};h.runtime.interact(h.runtime.targets().find(p=>p.action==='maya:pennant:'+point.id));}
  for(const id of ['eli','jun','sofia']){h.talk(id);h.choose('maya:card:'+id);h.emit('districtClose');}
  h.talk('maya');h.choose('maya:finish');assert.equal(h.progress.campusLife.maya.stage,5);assert.equal(getSummary(h.progress).xp,60);
  const saves=h.saves;
  h.emit('districtChoice',{npcId:'maya',action:'maya:finish',choiceId:'maya:finish'});
  assert.equal(h.saves,saves);assert.equal(getSummary(h.progress).xp,60);h.runtime.dispose();
});

test('cross-character dialogue tracks the owner of the action instead of the speaker',()=>{
  const h=harness({maya:{stage:2,cookie:'sugar',pennants:[],cards:[]},eli:{stage:3},jun:{stage:2}});
  h.talk('maya');h.choose('eli:collect');assert.equal(h.progress.campusLife.eli.stage,4);
  assert.equal(h.track.at(-1),'activity:newcomer','Maya handing Eli’s welcome card must keep the Eli objective');
  h.choose('jun:invite');assert.equal(h.progress.campusLife.jun.stage,3);
  assert.equal(h.track.at(-1),'activity:campus-duet','inviting Maya belongs to Jun’s story');
  h.runtime.dispose();
});

test('tracking uses a named character’s actual moving position and leaves object targets fixed',()=>{
  const h=harness();h.person('maya').x+=.1;h.person('maya').z+=.2;
  const moving=h.runtime.target('activity:cookie-stand');assert.equal(moving.x,h.person('maya').x);assert.equal(moving.z,h.person('maya').z);
  h.progress.campusLife.maya={stage:2,cookie:'sugar',pennants:[],cards:[]};
  assert.equal(h.runtime.target('activity:cookie-stand').x,P.pennants[0].x);
  assert.equal(h.runtime.target('main'),null);h.runtime.dispose();
});

test('suspended movement cannot reuse a previous fast ride to satisfy Nora’s braking lesson',()=>{
  const h=harness({nora:{stage:1,gate:0,masteryGate:0,crashes:0}});
  h.step(P.nora,{riding:true,speed:3});h.runtime.suspend();
  h.step(P.nora,{riding:true,braking:true,speed:.5});assert.equal(h.progress.campusLife.nora.stage,1);
  h.step(P.nora,{riding:true,speed:3});h.step({...P.nora,x:P.nora.x+.06*UNIT},{riding:true,braking:true,speed:.5});
  assert.equal(h.progress.campusLife.nora.stage,2);h.runtime.dispose();
});

test('Nora gate progression requires measured grounded travel and rejects a stationary mount',()=>{
  const h=harness({nora:{stage:2,gate:0,masteryGate:0,crashes:0}}),gate=P.gates[0];
  h.step(gate,{riding:true,speed:0});assert.equal(h.progress.campusLife.nora.gate,0);
  h.step({...gate,x:gate.x+.1*UNIT},{riding:true,speed:2,grounded:false});assert.equal(h.progress.campusLife.nora.gate,0);
  h.runtime.suspend();h.step(gate,{riding:true,speed:2});assert.equal(h.progress.campusLife.nora.gate,0);
  h.step({...gate,x:gate.x+.1*UNIT},{riding:true,speed:2});assert.equal(h.progress.campusLife.nora.gate,1);
  h.runtime.dispose();
});

test('reset removes prior-world travel evidence before a newly restored gate challenge',()=>{
  const h=harness({nora:{stage:2,gate:0,masteryGate:0,crashes:0}}),gate=P.gates[0];
  h.step({...gate,x:gate.x-.2*UNIT},{riding:true,speed:2});
  h.runtime.reset();h.step(gate,{riding:true,speed:2});
  assert.equal(h.progress.campusLife.nora.gate,0,'a restored checkpoint cannot count the old scene displacement as riding');
  h.runtime.dispose();
});

test('disabled simulation pauses story clock and cannot complete physical actions',()=>{
  const h=harness({eli:{stage:1},nora:{stage:1,gate:0,masteryGate:0,crashes:0}});
  Object.assign(h.person('eli'),{x:P.jkb.x,z:P.jkb.z});const clock=h.progress.campusLife.clock;
  h.step(P.jkb,{enabled:false,riding:true,braking:true,speed:.5});
  assert.equal(h.progress.campusLife.clock,clock);assert.equal(h.progress.campusLife.eli.stage,1);assert.equal(h.progress.campusLife.nora.stage,1);
  h.step(P.jkb);assert.equal(h.progress.campusLife.eli.stage,2);
  h.runtime.dispose();
});

test('Jun’s visual phrase is accepted only inside his active rehearsal and correct location',()=>{
  const h=harness({jun:{stage:1}});Object.assign(h.person('jun'),{x:P.music.x,z:P.music.z});h.talk('jun');h.choose('jun:play');assert.equal(h.ui.panel,'rhythm');
  h.emit('districtRhythmComplete',{notes:[0,1,2]});assert.equal(h.progress.campusLife.jun.stage,1);
  h.emit('districtRhythmComplete',{notes:[0,1,2,1,0,3]});assert.equal(h.progress.campusLife.jun.stage,2);
  h.emit('districtClose');h.emit('districtRhythmComplete',{notes:[0,1,2,1,0,3]});assert.equal(h.progress.campusLife.jun.stage,2);
  assert.equal(getSummary(h.progress).xp,0);h.runtime.dispose();
});

function photoFixture(){
  const h=harness({sofia:{stage:1,photos:[]}}),center=new THREE.Vector3(P.library.x,.15,P.library.z+.5);
  h.player.position={x:P.library.x,z:P.library.z};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.24,.3,.15),new THREE.MeshBasicMaterial());mesh.position.copy(center);
  mesh.geometry.setAttribute('_feature_id',new THREE.Float32BufferAttribute(new Array(mesh.geometry.getAttribute('position').count).fill(42),1));
  const model=new THREE.Group();model.add(mesh);model.updateMatrixWorld(true);
  h.world.model=model;h.world.features=[{code:'HBLL',featureIndex:42,bounds:{min:[center.x-.12,0,center.z-.075],max:[center.x+.12,.3,center.z+.075]}}];
  const camera=new THREE.PerspectiveCamera(65,1,.001,100);camera.position.set(P.library.x,.12,P.library.z-.18);camera.lookAt(center);camera.updateMatrixWorld();
  return {h,center,camera,mesh,cleanup(){h.runtime.dispose();model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}

test('Sofia photo commit keeps shutter-time position and camera evidence through asynchronous PNG completion',()=>{
  const f=photoFixture(),{h,camera}=f;
  const commit=h.runtime.preparePhoto(camera);h.player.position={x:P.moa.x,z:P.moa.z};camera.lookAt(camera.position.clone().add(new THREE.Vector3(0,10,0)));
  commit();assert.deepEqual(h.progress.campusLife.sofia.photos,['library']);const saves=h.saves;
  commit();assert.equal(h.saves,saves,'one PNG callback cannot stamp twice');assert.equal(getSummary(h.progress).xp,0);f.cleanup();
});

test('Sofia does not stamp an offscreen or vertically absent building',()=>{
  const f=photoFixture(),{h,camera}=f;
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.sin(50*Math.PI/180),0,Math.cos(50*Math.PI/180))));
  h.runtime.preparePhoto(camera)();assert.deepEqual(h.progress.campusLife.sofia.photos,[],'50-degree horizontal offset lies outside the photographed frame');
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(0,100,1)));
  h.runtime.preparePhoto(camera)();assert.deepEqual(h.progress.campusLife.sofia.photos,[],'a sky photograph cannot earn the building composition');f.cleanup();
});

test('Sofia photo composition must see its intended feature before foreground geometry',()=>{
  const f=photoFixture(),{h,camera,center}=f;
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.05),new THREE.MeshBasicMaterial());blocker.position.copy(camera.position).lerp(center,.5);
  blocker.geometry.setAttribute('_feature_id',new THREE.Float32BufferAttribute(new Array(blocker.geometry.getAttribute('position').count).fill(99),1));
  h.world.model.add(blocker);h.world.model.updateMatrixWorld(true);
  h.runtime.preparePhoto(camera)();assert.deepEqual(h.progress.campusLife.sofia.photos,[],'a wall in front of the subject blocks the stamp');f.cleanup();
});

test('pending photo callbacks cannot award a reset/imported progress object or a disposed game',()=>{
  const f=photoFixture(),{h,camera}=f,commit=h.runtime.preparePhoto(camera);
  h.progress.campusLife=validateCampusLife({...h.progress.campusLife});commit();assert.deepEqual(h.progress.campusLife.sofia.photos,[]);
  const disposedCommit=h.runtime.preparePhoto(camera);h.runtime.dispose();disposedCommit();assert.deepEqual(h.progress.campusLife.sofia.photos,[]);f.cleanup();
});
