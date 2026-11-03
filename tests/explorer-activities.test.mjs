import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIT} from '../public/explorer/game/content.mjs';
import {ACTIVITIES,ACTIVITY_REWARDS,NPC_DEFINITIONS,DISTRICT_POINTS as P,RHYTHM_SEQUENCE} from '../public/explorer/game/district-content.mjs';
import {createCampusLife,validateCampusLife,applyCampusAction,activityTarget,activityStatus,activityObjectives,characterAnchor,completedActivityRewards,isActivityComplete} from '../public/explorer/game/activities.mjs';
import {getConversation} from '../public/explorer/game/dialogue.mjs';

const talk=(s,id,position=characterAnchor(s,id))=>({position,npcId:id,npcPosition:position});
const act=(s,id,context)=>{const result=applyCampusAction(s,id,context);assert.equal(result.changed,true,id+': '+result.message);return result;};
const at=(position,extra={})=>({position,grounded:true,travelled:.15,...extra});
const serial=s=>validateCampusLife(JSON.parse(JSON.stringify(s)));

test('campus-life migration is additive, bounded and does not import arbitrary rewards',()=>{
  for(const raw of [null,undefined,[],{},42,{version:0},{version:2}])assert.deepEqual(validateCampusLife(raw),createCampusLife());
  const s=validateCampusLife({version:1,clock:Infinity,met:['maya','maya','invented'],talks:{maya:1000,nora:-1,__proto__:999},completed:['cookie-stand','invented'],maya:{stage:5,cookie:'invented',pennants:['library','bad'],cards:['eli','eli']},nora:{stage:5,gate:2,masteryGate:999,crashes:-20},jun:{stage:-1},sofia:{stage:3,photos:['library','library','fake']}});
  assert.deepEqual(s.met,['maya']);assert.equal(s.talks.maya,99);assert.equal(s.clock,0);assert.equal(s.maya.stage,1);assert.equal(s.nora.stage,2);assert.equal(s.nora.masteryGate,0);assert.equal(s.sofia.stage,1);assert.deepEqual(s.completed,[]);
  assert.deepEqual(completedActivityRewards(s),[]);
});

test('authored district has stable identities, distinct roles and finite outdoor targets',()=>{
  assert.equal(new Set(NPC_DEFINITIONS.map(n=>n.id)).size,5);assert.equal(new Set(NPC_DEFINITIONS.map(n=>n.accessory)).size,5);
  for(const a of ACTIVITIES){const n=NPC_DEFINITIONS.find(n=>n.id===a.npcId);assert.ok(n);assert.ok(n.bio);assert.ok(a.xp>0);for(const p of [n.home,n.work,n.leisure,activityTarget(createCampusLife(),a.id)])assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));}
  assert.equal(new Set(ACTIVITY_REWARDS.map(r=>r.id)).size,5);
  assert.equal(activityTarget(createCampusLife(),'invented'),null);
});

test('inconsistent imported substages normalize to a reachable next objective',()=>{
  const s=validateCampusLife({version:1,maya:{stage:2,cookie:'oat',pennants:['library','arts','lane']},nora:{stage:2,gate:3},sofia:{stage:1,photos:['library','arts']}});
  assert.equal(s.maya.stage,3);assert.equal(s.nora.stage,3);assert.equal(s.sofia.stage,2);
  for(const a of ACTIVITIES)assert.ok(activityTarget(s,a.id));
  const fresh=validateCampusLife({version:1,maya:{stage:0,cookie:'sugar',pennants:['library'],cards:['eli']}});
  assert.equal(fresh.maya.cookie,null);assert.deepEqual(fresh.maya.pennants,[]);
});

test('conversations are pure, authored and offer decline without forcing a quest',()=>{
  const s=createCampusLife(),before=JSON.stringify(s);
  for(const npc of NPC_DEFINITIONS){const dialogue=getConversation(s,npc.id);assert.equal(dialogue.npcId,npc.id);assert.ok(dialogue.text.length>50);assert.ok(dialogue.choices.some(c=>c.action==='decline'));assert.ok(dialogue.objective);}
  assert.equal(JSON.stringify(s),before);assert.equal(getConversation(s,'fake'),null);
  assert.equal(applyCampusAction(s,'decline').changed,false);assert.deepEqual(s,createCampusLife());
  assert.equal(applyCampusAction(s,'meet:maya',talk(s,'maya',{x:500,z:500})).changed,true,'runtime may supply an actually moved character position');
});

test('actions reject wrong character, missing proximity, unknown and out-of-order steps',()=>{
  const s=createCampusLife();
  for(const [id,context] of [
    ['maya:finish',talk(s,'maya')],['eli:finish',talk(s,'eli')],['jun:rhythm',{notes:RHYTHM_SEQUENCE}],
    ['sofia:photo:library',at(P.library,{framing:1})],['maya:start',talk(s,'eli')],['maya:start',{}],
    ['maya:start',{...talk(s,'maya'),position:{x:P.stand.x+10,z:P.stand.z}}],['nora:gate',at(P.gates[0],{riding:true,speed:1,gateIndex:0})],['unknown',{}],
  ])assert.equal(applyCampusAction(s,id,context).changed,false,id);
  assert.deepEqual(s,createCampusLife());
});

test('cookie choice and physical pennants survive reload; cards require named recipients',()=>{
  let s=createCampusLife();act(s,'maya:start',talk(s,'maya'));act(s,'maya:cookie:sugar',talk(s,'maya'));
  assert.equal(s.maya.cookie,'sugar');assert.equal(applyCampusAction(s,'maya:cookie:oat',talk(s,'maya')).changed,false);
  assert.equal(applyCampusAction(s,'maya:pennant:library',at(P.arts)).changed,false);
  act(s,'maya:pennant:library',at(P.library));s=serial(s);assert.deepEqual(s.maya.pennants,['library']);
  for(const p of P.pennants.slice(1))act(s,'maya:pennant:'+p.id,at(p));
  assert.equal(s.maya.stage,3);assert.equal(activityTarget(s,'cookie-stand').npcId,'eli');
  assert.equal(applyCampusAction(s,'maya:card:eli',talk(s,'jun')).changed,false);
  for(const id of ['eli','jun','sofia']){act(s,'maya:card:'+id,talk(s,id));assert.equal(applyCampusAction(s,'maya:card:'+id,talk(s,id)).changed,false);}
  const reward=act(s,'maya:finish',talk(s,'maya')).reward;assert.deepEqual(reward,{id:'activity:cookie-stand',xp:60});
  s=serial(s);assert.equal(applyCampusAction(s,'maya:finish',talk(s,'maya')).changed,false);assert.equal(s.maya.cookie,'sugar');assert.deepEqual(s.completed,['cookie-stand']);
});

test('Eli cannot finish an escort without both people arriving; later errand changes his memory',()=>{
  let s=createCampusLife();act(s,'eli:start',talk(s,'eli'));
  assert.equal(applyCampusAction(s,'eli:arrive',at(P.jkb,{companionPosition:P.library})).changed,false);
  assert.equal(applyCampusAction(s,'eli:arrive',at(P.jkb)).changed,false);
  act(s,'eli:arrive',at(P.jkb,{companionPosition:P.jkb}));s=serial(s);
  assert.deepEqual(characterAnchor(s,'eli'),P.jkb);assert.match(getConversation(s,'eli').text,/JKB/);
  act(s,'eli:errand',talk(s,'eli'));assert.equal(activityTarget(s,'newcomer').npcId,'maya');
  act(s,'eli:collect',talk(s,'maya'));s=serial(s);assert.equal(s.eli.stage,4);
  assert.deepEqual(act(s,'eli:finish',talk(s,'eli')).reward,{id:'activity:newcomer',xp:50});
  assert.match(getConversation(s,'eli').text,/welcome card/i);
});

test('Nora requires measured braking and ordered mounted gates; mastery requires a final brake',()=>{
  let s=createCampusLife();act(s,'nora:start',talk(s,'nora'));
  const brake=at(P.nora,{riding:true,braking:true,speed:.8,previousSpeed:3});
  for(const extra of [{riding:false},{braking:false},{speed:2},{previousSpeed:0},{position:P.moa}])assert.equal(applyCampusAction(s,'nora:brake',{...brake,...extra}).changed,false);
  act(s,'nora:brake',brake);assert.equal(s.nora.stage,2);
  assert.equal(applyCampusAction(s,'nora:gate',at(P.gates[1],{riding:true,speed:2,gateIndex:1})).changed,false);
  for(const extra of [{speed:0},{travelled:0},{grounded:false}])assert.equal(applyCampusAction(s,'nora:gate',at(P.gates[0],{riding:true,speed:2,gateIndex:0,...extra})).changed,false,'stationary and airborne gate contact stays safe');
  for(let i=0;i<3;i++)act(s,'nora:gate',at(P.gates[i],{riding:true,speed:3,gateIndex:i}));
  assert.equal(s.nora.stage,3);act(s,'nora:mastery',talk(s,'nora'));
  act(s,'nora:crash');s=serial(s);assert.equal(s.nora.crashes,1);assert.match(getConversation(s,'nora').text,/spill/);
  assert.equal(applyCampusAction(s,'nora:gate',at(P.gates[0],{riding:true,speed:5,gateIndex:0})).changed,false);
  for(let i=0;i<2;i++)act(s,'nora:gate',at(P.gates[i],{riding:true,speed:3,gateIndex:i}));
  assert.equal(applyCampusAction(s,'nora:gate',at(P.gates[2],{riding:true,speed:3,gateIndex:2})).changed,false);
  assert.deepEqual(act(s,'nora:gate',at(P.gates[2],{riding:true,braking:true,speed:1,gateIndex:2})).reward,{id:'activity:scooter-school',xp:60});
  assert.equal(isActivityComplete(serial(s),'scooter-school'),true);
});

test('Jun requires the visual phrase at Music, then a real invitation and stand gathering',()=>{
  let s=createCampusLife();act(s,'jun:start',talk(s,'jun'));
  assert.deepEqual(characterAnchor(s,'jun'),P.music);
  assert.equal(applyCampusAction(s,'jun:rhythm',{...talk(s,'jun'),notes:[0]}).changed,false);
  assert.equal(applyCampusAction(s,'jun:rhythm',{...talk(s,'jun',P.arts),notes:[...RHYTHM_SEQUENCE]}).changed,false);
  act(s,'jun:rhythm',{...talk(s,'jun'),notes:[...RHYTHM_SEQUENCE]});s=serial(s);
  assert.equal(activityTarget(s,'campus-duet').npcId,'maya');act(s,'jun:invite',talk(s,'maya'));
  assert.deepEqual(characterAnchor(s,'jun'),P.stand);assert.deepEqual(act(s,'jun:finish',talk(s,'jun')).reward,{id:'activity:campus-duet',xp:50});
  assert.equal(applyCampusAction(s,'jun:rhythm',{...talk(s,'jun'),notes:RHYTHM_SEQUENCE}).changed,false);
});

test('Sofia checks specific positions and camera framing, then fills a persistent photo board',()=>{
  let s=createCampusLife();act(s,'sofia:start',talk(s,'sofia'));
  for(const context of [at(P.moa,{framing:1}),at(P.library,{framing:.2}),at(P.library,{framing:NaN})])assert.equal(applyCampusAction(s,'sofia:photo:library',context).changed,false);
  act(s,'sofia:photo:library',at(P.library,{framing:.8}));s=serial(s);
  assert.equal(activityTarget(s,'photo-board').id,'arts');
  act(s,'sofia:photo:arts',at(P.arts,{framing:.8}));assert.equal(s.sofia.stage,2);
  assert.equal(applyCampusAction(s,'sofia:finish',talk(s,'sofia',P.moa)).changed,false);
  assert.deepEqual(act(s,'sofia:finish',talk(s,'sofia')).reward,{id:'activity:photo-board',xp:50});
  s=serial(s);assert.deepEqual(s.sofia.photos,['library','arts']);assert.equal(activityTarget(s,'photo-board'),null);
});

test('all five district stories finish, reload, revisit and award exactly one known reward each',()=>{
  let s=createCampusLife();const rewards=[];
  const run=(id,context)=>{const result=act(s,id,context);if(result.reward)rewards.push(result.reward);};
  for(const n of NPC_DEFINITIONS)run('meet:'+n.id,talk(s,n.id));
  run('maya:start',talk(s,'maya'));run('maya:cookie:chocolate',talk(s,'maya'));
  for(const p of P.pennants)run('maya:pennant:'+p.id,at(p));
  run('eli:start',talk(s,'eli'));run('eli:arrive',at(P.jkb,{companionPosition:P.jkb}));run('eli:errand',talk(s,'eli'));run('eli:collect',talk(s,'maya'));run('eli:finish',talk(s,'eli'));
  run('nora:start',talk(s,'nora'));run('nora:brake',at(P.nora,{riding:true,braking:true,speed:.5,previousSpeed:3}));
  for(let i=0;i<3;i++)run('nora:gate',at(P.gates[i],{riding:true,speed:3,gateIndex:i}));run('nora:mastery',talk(s,'nora'));
  for(let i=0;i<3;i++)run('nora:gate',at(P.gates[i],{riding:true,braking:true,speed:2,gateIndex:i}));
  run('jun:start',talk(s,'jun'));run('jun:rhythm',{...talk(s,'jun'),notes:RHYTHM_SEQUENCE});run('jun:invite',talk(s,'maya'));run('jun:finish',talk(s,'jun'));
  run('sofia:start',talk(s,'sofia'));for(const p of P.photos)run('sofia:photo:'+p.id,at(p,{framing:.8}));run('sofia:finish',talk(s,'sofia'));
  for(const id of ['eli','jun','sofia'])run('maya:card:'+id,talk(s,id));run('maya:finish',talk(s,'maya'));
  s=serial(s);assert.equal(s.completed.length,5);assert.equal(rewards.length,5);assert.equal(new Set(rewards.map(r=>r.id)).size,5);assert.equal(rewards.reduce((n,r)=>n+r.xp,0),270);
  assert.equal(activityObjectives(s).filter(a=>a.status==='completed').length,5);
  for(const a of ACTIVITIES){assert.equal(activityStatus(s,a.id).value,a.total);assert.equal(activityTarget(s,a.id),null);}
  for(const npc of NPC_DEFINITIONS){const result=applyCampusAction(s,'meet:'+npc.id,talk(s,npc.id));assert.equal(result.reward,undefined);assert.ok(getConversation(s,npc.id).text);}
});

test('interaction radii use native meter conversion and exclude distant activity evidence',()=>{
  const s=createCampusLife();act(s,'sofia:start',talk(s,'sofia'));
  assert.equal(applyCampusAction(s,'sofia:photo:library',at({x:P.library.x+5.1*UNIT,z:P.library.z},{framing:1})).changed,false);
  assert.equal(applyCampusAction(s,'sofia:photo:library',at({x:P.library.x+4.9*UNIT,z:P.library.z},{framing:1})).changed,true);
});
