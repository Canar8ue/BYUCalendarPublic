import test from 'node:test';
import assert from 'node:assert/strict';
import {medalFor,formatTime,stepBoost,crossedCheckpoint,createGhostRecorder,recordGhost,validateGhost,ghostAt,MAX_GHOST_POINTS} from '../public/explorer/game/racing.mjs';
import {createProgress,recordTrial,getSummary,validateProgress,equipCosmetic} from '../public/explorer/game/progress.mjs';
import {TRIALS,MAIN_CHAPTERS,LOST_ITEMS,TUNE_NOTES,PHOTO_SPOTS,SPAWN} from '../public/explorer/game/content.mjs';
import {questTarget,questStatus} from '../public/explorer/game/quest-state.mjs';

test('medals include exact thresholds and race clocks carry rounded minutes',()=>{
 assert.equal(medalFor(32,32),'gold');assert.equal(medalFor(43.2,32),'silver');assert.equal(medalFor(43.21,32),'bronze');
 for(const n of [0,-1,NaN,Infinity,undefined])assert.equal(medalFor(n,32),null);
 assert.equal(formatTime(59.99),'1:00.0');assert.equal(formatTime(0),'0:00.0');assert.equal(formatTime(92.3),'1:32.3');
});

test('boost runs out, stays empty while held, and recharges on release',()=>{
 let charge=1;
 for(let i=0;i<240;i++)charge=stepBoost(charge,true,true,1/60).charge;
 assert.equal(charge,0);assert.equal(stepBoost(charge,true,true,1/60).active,false);
 assert.equal(stepBoost(charge,true,true,1).charge,0);
 const restored=stepBoost(charge,false,true,3);assert.equal(restored.active,false);assert.ok(restored.charge>.5);
 assert.equal(stepBoost(1,false,false,10).charge,1);
});

test('swept checkpoints catch boost-speed crossings but reject nearby parallel rides',()=>{
 const point={x:0,z:0};
 assert.equal(crossedCheckpoint({x:-1,z:0},{x:1,z:0},point,.1),true);
 assert.equal(crossedCheckpoint({x:-1,z:.2},{x:1,z:.2},point,.1),false);
 assert.equal(crossedCheckpoint(point,point,point,.1),true);
 assert.equal(crossedCheckpoint({x:1,z:0},{x:2,z:0},point,.1),false);
});

test('long runs have bounded ghosts with the start and finish intact',()=>{
 const r=createGhostRecorder();
 for(let i=0;i<=36000;i++)recordGhost(r,i/10,{x:2,y:1,z:3},.3,8,i===36000);
 assert.ok(r.points.length<=MAX_GHOST_POINTS);assert.equal(r.points[0][0],0);assert.equal(r.points.at(-1)[0],3600);
 assert.deepEqual(validateGhost(r.points,3600),r.points);
 const p=ghostAt(r.points,123.45);assert.equal(p.x,2);assert.equal(p.z,3);assert.equal(p.speed,8);
 assert.equal(ghostAt(r.points,-1),null);assert.equal(ghostAt(r.points,3601),null);
});

test('ghost interpolation follows the short turn across the angle seam',()=>{
 const points=[[0,0,1,0,3.1,6],[1,2,1,4,-3.1,8]],p=ghostAt(points,.5);
 assert.equal(p.x,1);assert.equal(p.z,2);assert.equal(p.speed,7);assert.ok(Math.abs(p.yaw-Math.PI)<.001);
 assert.equal(validateGhost([[0,0,1,0,0,1],[0,0,1,0,0,1]],1),null);
 assert.equal(validateGhost([[0,0,1,0,0,1],[1,1000,1,0,0,1]],1),null);
 assert.equal(validateGhost(points,2),null,'a ghost must end at its recorded finish time');
});

test('a personal best keeps its matching ghost; slower and malformed imports cannot replace it',()=>{
 let state=createProgress();const id=TRIALS[0].id,ghost=[[0,2,1,3,0,0],[30,3,1,4,0,8]];
 recordTrial(state,id,30,ghost);assert.deepEqual(state.bestRuns[id],ghost);
 recordTrial(state,id,31,[[0,2,1,3,0,0],[31,3,1,4,0,8]]);assert.deepEqual(state.bestRuns[id],ghost);
 state=validateProgress(JSON.parse(JSON.stringify(state)));assert.deepEqual(state.bestRuns[id],ghost);
 assert.equal(getSummary(state).xp,75);
 recordTrial(state,id,29,[[0,2,1,3,0,0],[29,999,1,4,0,8]]);assert.equal(state.bestRuns[id],undefined);assert.equal(state.bestTimes[id],29);
 const old=validateProgress({version:2,bestTimes:{[id]:32}});assert.equal(old.bestTimes[id],32);assert.deepEqual(old.bestRuns,{});
});

test('medal upgrades reward once and gold cosmetics survive save validation',()=>{
 let state=createProgress();assert.equal(equipCosmetic(state,'outfit','racer'),false);
 recordTrial(state,TRIALS[0].id,100);assert.equal(getSummary(state).xp,30);
 recordTrial(state,TRIALS[0].id,40);assert.equal(getSummary(state).xp,45);
 recordTrial(state,TRIALS[0].id,30);assert.equal(getSummary(state).xp,75);
 recordTrial(state,TRIALS[0].id,29);assert.equal(getSummary(state).xp,75);
 assert.equal(equipCosmetic(state,'outfit','racer'),true);assert.equal(equipCosmetic(state,'deck','comet'),false);
 for(const t of TRIALS.slice(1))recordTrial(state,t.id,t.targetSeconds);
 assert.equal(equipCosmetic(state,'deck','comet'),true);state=validateProgress(state);
 assert.equal(state.cosmetics.deck,'comet');assert.equal(state.cosmetics.outfit,'racer');assert.equal(getSummary(state).xp,225);
});

test('main tracking reaches each page and finally returns to the departure board',()=>{
 const p=createProgress();assert.equal(questTarget(p).id,'hbll');
 for(const chapter of MAIN_CHAPTERS){p.visited.push(...chapter.locations);assert.equal(questTarget(p).id,chapter.id);p.fragments.push(chapter.id);}
 assert.deepEqual(questTarget(p),SPAWN);p.quests.push('main');assert.equal(questTarget(p),null);assert.equal(questStatus(p).text,'Quest complete');
});

test('quest tracking points to the owner and puzzle after collection, and clears completed quests',()=>{
 const p=createProgress();p.items=LOST_ITEMS.map(i=>i.id);p.notes=TUNE_NOTES.map(i=>i.id);p.photos=PHOTO_SPOTS.map(i=>i.id);
 assert.ok(questTarget(p,'lost-found').x===SPAWN.x-.15);assert.match(questStatus(p,'lost-found').text,/Return/);
 assert.equal(questStatus(p,'lost-found').value,3);assert.equal(questStatus(p,'lost-found').total,4);
 assert.deepEqual(questTarget(p,'music'),TUNE_NOTES.at(-1));assert.match(questStatus(p,'music').text,/Play/);
 for(const q of ['cat','cosmo','delivery','lost-found','music','photo']){p.quests.push(q);assert.equal(questTarget(p,q),null);}
 assert.equal(questTarget(p,'free'),null);
});

test('free roam, quest tracking, route hints, and ghost preferences round-trip old and new saves',()=>{
 const state=createProgress();state.trackedQuest='free';state.settings.routeHints=false;state.settings.showGhost=false;
 const restored=validateProgress(JSON.parse(JSON.stringify(state)));
 assert.equal(restored.trackedQuest,'free');assert.equal(restored.settings.routeHints,false);assert.equal(restored.settings.showGhost,false);
 assert.equal(validateProgress({...state,trackedQuest:'moon'}).trackedQuest,'main');
 assert.equal(validateProgress({version:1,visited:['hbll']}).settings.showGhost,true);
 assert.equal(validateProgress({...state,trackedQuest:'cat'}).trackedQuest,'cat');
});
