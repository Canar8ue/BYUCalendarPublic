import test from 'node:test';
import assert from 'node:assert/strict';
import {OUTFITS,DECKS,MAIN_CHAPTERS,UNIT} from '../public/explorer/game/content.mjs';
import {createProgress,validateProgress,saveProgress,loadProgress,claimReward,getSummary,discover,recoverFragment,advanceCat,findCosmo,equipCosmetic,cosmeticUnlocked} from '../public/explorer/game/progress.mjs';
import {createCampusLife,applyCampusAction,characterAnchor} from '../public/explorer/game/activities.mjs';
import {DISTRICT_POINTS as P,ACTIVITY_REWARDS} from '../public/explorer/game/district-content.mjs';
import {questTarget,questStatus} from '../public/explorer/game/quest-state.mjs';
import {clipDistrictMotion} from '../public/explorer/game/district-collision.mjs';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const context=(s,id)=>{const p=characterAnchor(s.campusLife,id);return {position:p,npcPosition:p,npcId:id,grounded:true};};
const at=(position,extra={})=>({position,grounded:true,travelled:.15,...extra});
const action=(s,id,c)=>{const result=applyCampusAction(s.campusLife,id,c);assert.equal(result.changed,true,id+': '+result.message);if(result.reward)assert.equal(claimReward(s,result.reward.id,result.reward.xp),true);return result;};
function cookieStory(s){
  action(s,'maya:start',context(s,'maya'));action(s,'maya:cookie:chocolate',context(s,'maya'));
  for(const p of P.pennants)action(s,'maya:pennant:'+p.id,at(p));
  for(const id of ['eli','jun','sofia'])action(s,'maya:card:'+id,context(s,id));
  return action(s,'maya:finish',context(s,'maya'));
}
function workshopStory(s){
  action(s,'nora:start',context(s,'nora'));
  action(s,'nora:brake',at(P.nora,{riding:true,braking:true,speed:.5,previousSpeed:3}));
  for(let i=0;i<3;i++)action(s,'nora:gate',at(P.gates[i],{riding:true,speed:3,gateIndex:i}));
  action(s,'nora:mastery',context(s,'nora'));
  for(let i=0;i<3;i++)action(s,'nora:gate',at(P.gates[i],{riding:true,braking:true,speed:2,gateIndex:i}));
}
const approx=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);

test('pre-district version 1 and 2 saves gain fresh campus life and preserve earned main/cat progress',()=>{
  const s=createProgress();for(const id of MAIN_CHAPTERS[0].locations)discover(s,id);recoverFragment(s,MAIN_CHAPTERS[0].id);
  advanceCat(s);advanceCat(s);findCosmo(s);s.settings.volume=.23;s.checkpoint={x:2.85,z:-.15};s.trackedQuest='cat';
  const expectedXP=getSummary(s).xp;
  for(const version of [1,2]){
    const legacy=JSON.parse(JSON.stringify(s));legacy.version=version;delete legacy.campusLife;
    const migrated=validateProgress(legacy);
    assert.deepEqual(migrated.campusLife,createCampusLife());assert.deepEqual(migrated.visited,s.visited);assert.deepEqual(migrated.fragments,s.fragments);
    assert.equal(migrated.catStep,2);assert.equal(migrated.cosmoStep,1);assert.equal(migrated.settings.volume,.23);assert.deepEqual(migrated.checkpoint,s.checkpoint);assert.equal(migrated.trackedQuest,'cat');
    assert.equal(getSummary(migrated).xp,expectedXP);assert.equal(questTarget(migrated,'cat').id,questTarget(s,'cat').id);
  }
});

test('partial district work and activity tracking persist through real save/load with useful next objectives',()=>{
  const s=createProgress(),memory=storage();s.trackedQuest='activity:cookie-stand';
  action(s,'maya:start',context(s,'maya'));action(s,'maya:cookie:sugar',context(s,'maya'));action(s,'maya:pennant:library',at(P.library));
  assert.equal(saveProgress(s,memory),true);const loaded=loadProgress(memory);
  assert.equal(loaded.trackedQuest,'activity:cookie-stand');assert.equal(loaded.campusLife.maya.cookie,'sugar');assert.deepEqual(loaded.campusLife.maya.pennants,['library']);
  assert.equal(questTarget(loaded,loaded.trackedQuest).id,'arts');assert.equal(questStatus(loaded,loaded.trackedQuest).status,'active');assert.match(questStatus(loaded,loaded.trackedQuest).text,/1\/3/);
  assert.deepEqual(loaded.fragments,[]);assert.equal(getSummary(loaded).xp,0);
  assert.equal(validateProgress({...loaded,trackedQuest:'activity:invented'}).trackedQuest,'main');
});

test('completed activity state and one-time registered XP survive save/reload without changing old quests',()=>{
  const s=createProgress(),memory=storage();advanceCat(s);const base=getSummary(s).xp;
  const finish=cookieStory(s);assert.deepEqual(finish.reward,{id:'activity:cookie-stand',xp:60});assert.equal(getSummary(s).xp,base+60);
  assert.equal(claimReward(s,finish.reward.id,finish.reward.xp),false);assert.equal(claimReward(s,finish.reward.id,999),false);
  assert.equal(claimReward(s,'activity:invented',60),false);assert.equal(claimReward(s,'activity:photo-board',60),false,'known rewards still require their registered amount');
  s.trackedQuest='activity:cookie-stand';assert.equal(saveProgress(s,memory),true);const loaded=loadProgress(memory);
  assert.equal(getSummary(loaded).xp,base+60);assert.deepEqual(loaded.campusLife.completed,['cookie-stand']);assert.equal(loaded.claims['activity:cookie-stand'],60);
  assert.equal(loaded.catStep,1);assert.deepEqual(loaded.quests,[]);assert.equal(questTarget(loaded,loaded.trackedQuest),null);assert.equal(questStatus(loaded,loaded.trackedQuest).status,'completed');
  assert.equal(applyCampusAction(loaded.campusLife,'maya:finish',context(loaded,'maya')).changed,false);assert.equal(claimReward(loaded,'activity:cookie-stand',60),false);
  assert.equal(getSummary(validateProgress(loaded)).xp,base+60);
});

test('completed-stage recovery reconstructs a missing activity claim once',()=>{
  const s=createProgress();cookieStory(s);delete s.claims['activity:cookie-stand'];assert.equal(getSummary(s).xp,0);
  const recovered=validateProgress(s);assert.equal(recovered.claims['activity:cookie-stand'],60);assert.equal(getSummary(recovered).xp,60);
  assert.equal(getSummary(validateProgress(recovered)).xp,60);assert.equal(ACTIVITY_REWARDS.find(r=>r.id==='activity:cookie-stand').xp,60);
});

test('forged and duplicate completed arrays derive from substages and cannot unlock unearned cosmetics on import',()=>{
  const raw=createProgress();raw.campusLife.completed=['cookie-stand','cookie-stand','scooter-school','invented'];raw.cosmetics={outfit:'cookiecrew',deck:'workshop'};
  const loaded=validateProgress(raw);assert.deepEqual(loaded.campusLife.completed,[]);assert.equal(getSummary(loaded).xp,0);assert.deepEqual(loaded.cosmetics,{outfit:'classic',deck:'classic'});
  cookieStory(loaded);loaded.campusLife.completed.push('cookie-stand','invented','scooter-school');const normalized=validateProgress(loaded);
  assert.deepEqual(normalized.campusLife.completed,['cookie-stand']);assert.equal(getSummary(normalized).xp,60);
});

test('cookiecrew outfit and Nora workshop deck unlock through their own completed stories and remain equipped',()=>{
  const s=createProgress(),memory=storage(),outfit=OUTFITS.find(o=>o.id==='cookiecrew'),deck=DECKS.find(d=>d.id==='workshop');
  assert.ok(outfit,'cookie crew outfit is in the wardrobe');assert.ok(deck,'Nora workshop deck is in the wardrobe');assert.equal(deck.color,'#65b8aa');
  assert.equal(cosmeticUnlocked(s,outfit),false);assert.equal(cosmeticUnlocked(s,deck),false);assert.equal(equipCosmetic(s,'outfit','cookiecrew'),false);assert.equal(equipCosmetic(s,'deck','workshop'),false);
  cookieStory(s);assert.equal(cosmeticUnlocked(s,outfit),true);assert.equal(cosmeticUnlocked(s,deck),false);assert.equal(equipCosmetic(s,'outfit','cookiecrew'),true);
  workshopStory(s);assert.equal(cosmeticUnlocked(s,deck),true);assert.equal(equipCosmetic(s,'deck','workshop'),true);
  assert.equal(saveProgress(s,memory),true);const loaded=loadProgress(memory);assert.deepEqual(loaded.cosmetics,{outfit:'cookiecrew',deck:'workshop'});assert.equal(getSummary(loaded).xp,120);
  assert.deepEqual(loaded.campusLife.completed,['cookie-stand','scooter-school']);assert.deepEqual(loaded.quests,[]);
});

test('swept booth furniture collision stops high-speed tunneling before the visible counter',()=>{
  const obstacles=[{x:0,z:0,radius:.55*UNIT}],from={x:-3*UNIT,z:0},motion={x:6*UNIT,z:0};
  const clipped=clipDistrictMotion(from,motion,obstacles,.32*UNIT),reach=(.55+.32)*UNIT;
  assert.ok(clipped.x>0&&clipped.x<motion.x);assert.ok(from.x+clipped.x<=-reach);approx(clipped.z,0);
  const empty=clipDistrictMotion(from,motion,[],.32*UNIT);assert.deepEqual(empty,motion);
});

test('near misses and exact tangent glances do not stop travel along furniture',()=>{
  const obstacles=[{x:0,z:0,radius:.7}],radius=.3;
  const miss=clipDistrictMotion({x:-2,z:1.01},{x:4,z:0},obstacles,radius);assert.deepEqual(miss,{x:4,z:0});
  const tangent=clipDistrictMotion({x:-2,z:1},{x:4,z:0},obstacles,radius);assert.deepEqual(tangent,{x:4,z:0});
});

test('players restored inside furniture can leave outward while deeper inward movement stops',()=>{
  const obstacle=[{x:0,z:0,radius:1}],from={x:.6,z:0};
  assert.deepEqual(clipDistrictMotion(from,{x:2,z:0},obstacle,.1),{x:2,z:0});
  const inward=clipDistrictMotion(from,{x:-.2,z:0},obstacle,.1);approx(inward.x,0);approx(inward.z,0);
  assert.deepEqual(clipDistrictMotion(from,{x:0,z:0},obstacle,.1),{x:0,z:0});
});

test('swept collision chooses the first obstacle and split steps reach the same safe stopping point',()=>{
  const from={x:-3,z:0},motion={x:7,z:0},obstacles=[{x:2,z:0,radius:.5},{x:0,z:0,radius:.5}],radius=.3;
  const whole=clipDistrictMotion(from,motion,obstacles,radius),position={...from};
  for(let i=0;i<70;i++){const next=clipDistrictMotion(position,{x:.1,z:0},obstacles,radius);position.x+=next.x;position.z+=next.z;}
  approx(position.x,from.x+whole.x,.0011);approx(position.z,0);assert.ok(position.x<-.8);
  const reversed=clipDistrictMotion(from,motion,[...obstacles].reverse(),radius);approx(reversed.x,whole.x);approx(reversed.z,whole.z);
});
