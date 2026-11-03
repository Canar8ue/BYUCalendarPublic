import test from 'node:test';
import assert from 'node:assert/strict';
import {createHikeState, validateHikeState, applyHikeAction, completedHikeRewards, HIKE_REWARDS, hikeStatus, hikeObjectives, buildHikeActivities, walkedHikeSegment, calebConversation} from '../public/explorer/game/hike-state.mjs';
import {projectHikeMap} from '../public/explorer/game/hike-ui.mjs';

const U = .044571444392204285;
const checkpoints = [
  {id:'trailhead',name:'Y Trailhead',kind:'trailhead',x:0,y:0,z:0,pointIndex:0},
  {id:'turn-1',name:'Mapped bend 1',kind:'turn',x:100*U,y:10*U,z:0,pointIndex:1},
  {id:'turn-2',name:'Mapped bend 2',kind:'turn',x:100*U,y:20*U,z:100*U,pointIndex:2},
  {id:'summit',name:'Top of the Y',kind:'summit',x:200*U,y:30*U,z:100*U,pointIndex:3},
];
const route = {revision:'test-hike-1',checkpoints,route:checkpoints.map((point,i) => ({...point,distanceMeters:i*105}))};
const at = (point,extra={}) => ({position:{x:point.x,y:point.y,z:point.z},grounded:true,riding:false,...extra});
const walking = (point,from,extra={}) => at(point,{fromCheckpoint:from.id,walkedMeters:105,...extra});
function act(state,action,context,r=route) {const result = applyHikeAction(state,action,context,r);assert.equal(result.changed,true,action+': '+result.message);return result;}
function climb(state) {
  act(state,'start',at(checkpoints[0]));
  for (let i=1;i<checkpoints.length;i++) act(state,'visit:'+checkpoints[i].id,walking(checkpoints[i],checkpoints[i-1]));
  act(state,'summit',at(checkpoints.at(-1)));
}

test('old/malformed hiking saves initialize without changing unrelated progress',() => {
  for (const value of [undefined,null,[],42,{}, {version:0},{version:2}]) assert.deepEqual(validateHikeState(value),createHikeState());
  const state = validateHikeState({version:1,started:true,checkpointOrder:['bad','bad'],reached:['turn-2','summit'],descent:['trailhead'],cleanup:['bad','cleanup-1','cleanup-1'],photos:['bad'],postcard:true,returned:true,lastCheckpoint:{x:Infinity},inHike:true,claims:{'hike:ascent':999}},route);
  assert.deepEqual(state.reached,[]);assert.deepEqual(state.descent,[]);assert.deepEqual(state.cleanup,['cleanup-1']);assert.equal(state.postcard,false);assert.equal(state.returned,false);assert.equal(state.lastCheckpoint,null);assert.equal(state.inHike,false);assert.deepEqual(completedHikeRewards(state,route),[]);
});

test('checkpoints require ordered on-foot segments, not proximity or an assisted warp',() => {
  const state = createHikeState(route);
  for (const context of [{},at(checkpoints[0],{riding:true}),at(checkpoints[0],{grounded:false})]) assert.equal(applyHikeAction(state,'start',context,route).changed,false);
  act(state,'start',at(checkpoints[0]));
  assert.equal(applyHikeAction(state,'visit:turn-2',walking(checkpoints[2],checkpoints[0]),route).changed,false);
  for (const context of [at(checkpoints[1]),walking(checkpoints[1],checkpoints[0],{walkedMeters:1}),walking(checkpoints[1],checkpoints[0],{fromCheckpoint:'turn-2'}),walking(checkpoints[1],checkpoints[0],{assisted:true}),walking(checkpoints[1],checkpoints[0],{riding:true}),walking(checkpoints[1],checkpoints[0],{position:{...checkpoints[1],y:99}})]) assert.equal(applyHikeAction(state,'visit:turn-1',context,route).changed,false);
  act(state,'visit:turn-1',walking(checkpoints[1],checkpoints[0]));
  assert.deepEqual(state.reached,['trailhead','turn-1']);assert.equal(hikeStatus(state,route).target.id,'turn-2');
});

test('a complete climb and descent retain one-time derived rewards across a no-route save',() => {
  let state = createHikeState(route);climb(state);
  assert.deepEqual(completedHikeRewards(state,route).map(value=>value.id),['hike:ascent']);
  state = validateHikeState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(state.checkpointOrder,checkpoints.map(point=>point.id));assert.equal(state.summitSeen,true);assert.equal(state.terrainRevision,route.revision);
  state = validateHikeState(state,route);
  for (let i=checkpoints.length-2;i>=0;i--) act(state,'visit:'+checkpoints[i].id,walking(checkpoints[i],checkpoints[i+1]));
  const finish = act(state,'return',at(checkpoints[0]));assert.deepEqual(finish.rewards,[HIKE_REWARDS[3]]);
  assert.equal(applyHikeAction(state,'return',at(checkpoints[0]),route).changed,false);
  assert.deepEqual(completedHikeRewards(validateHikeState(state),route).map(value=>value.id),['hike:ascent','hike:descent']);
  assert.equal(hikeStatus(state,route).complete,true);assert.equal(hikeStatus(state,route).target,null);
});

test('checkpoint assistance only resumes reached points and cannot award descent',() => {
  const state = createHikeState(route);climb(state);
  assert.equal(applyHikeAction(state,'resume:invented',{routeLoaded:true},route).changed,false);
  assert.equal(applyHikeAction(state,'resume:turn-1',{},route).changed,false);
  const resume = act(state,'resume:turn-2',{routeLoaded:true});assert.equal(resume.travel,'checkpoint');
  for (const context of [at(checkpoints[2]),walking(checkpoints[2],checkpoints[2]),walking(checkpoints[2],checkpoints[3],{walkedMeters:0}),walking(checkpoints[2],checkpoints[3],{assisted:true})]) assert.equal(applyHikeAction(state,'visit:turn-2',context,route).changed,false);
  assert.deepEqual(state.descent,[]);assert.equal(applyHikeAction(state,'return',at(checkpoints[0]),route).changed,false);
  const leave = act(state,'leave-hike');assert.equal(leave.travel,'campus');assert.equal(state.returned,false);assert.equal(state.inHike,false);
  assert.deepEqual(completedHikeRewards(state,route).map(reward=>reward.id),['hike:ascent']);
});

test('revision migration retains completed stories and clears unsafe resume',() => {
  const state = createHikeState(route);climb(state);
  for (let i=checkpoints.length-2;i>=0;i--) act(state,'visit:'+checkpoints[i].id,walking(checkpoints[i],checkpoints[i+1]));
  act(state,'return',at(checkpoints[0]));
  const migrated = validateHikeState(state,{...route,revision:'test-hike-2'});
  assert.equal(migrated.lastCheckpoint,null);assert.equal(migrated.inHike,false);assert.equal(migrated.returned,true);assert.equal(migrated.terrainRevision,'test-hike-2');assert.deepEqual(completedHikeRewards(migrated,route),completedHikeRewards(state,route));
});

test('fictional cleanup and captured photographs are physical, optional, and cannot farm rewards',() => {
  let state = createHikeState(route);climb(state);const activities = buildHikeActivities(route);
  assert.equal(activities.cleanup.length,3);assert.ok(activities.cleanup.every(point=>point.name.startsWith('Fictional')));
  for (const point of activities.cleanup) act(state,'cleanup:'+point.id,at(point));
  assert.equal(applyHikeAction(state,'cleanup:'+activities.cleanup[0].id,at(activities.cleanup[0]),route).changed,false);
  for (const point of activities.photos) {
    assert.equal(applyHikeAction(state,'photo:'+point.id,at(point),route).changed,false,'a dialogue click is not photo capture');
    act(state,'photo:'+point.id,at(point,{photoCaptured:true}));
    assert.equal(applyHikeAction(state,'photo:'+point.id,at(point,{photoCaptured:true}),route).changed,false);
  }
  state = validateHikeState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.postcard,true);assert.equal(state.cleanup.length,3);assert.equal(state.photos.length,2);
  assert.deepEqual(completedHikeRewards(state,route).map(reward=>reward.id),['hike:ascent','hike:cleanup','hike:postcard']);
});

test('summit story and upper-Y postcard cannot be completed from a direct visit',() => {
  const state = createHikeState(route);act(state,'start',at(checkpoints[0]));
  assert.equal(applyHikeAction(state,'summit',at(checkpoints.at(-1)),route).changed,false);
  assert.equal(applyHikeAction(state,'photo:summit-view',at(checkpoints.at(-1),{photoCaptured:true}),route).changed,false);
  assert.equal(state.postcard,false);assert.equal(state.summitSeen,false);
});

test('checkpoint segment evidence uses sourced cumulative distance rather than chord length',() => {
  const from=checkpoints[0],to=checkpoints[1];
  assert.equal(walkedHikeSegment({fromCheckpoint:from.id,walkedMeters:83},from,to,route),false);
  assert.equal(walkedHikeSegment({fromCheckpoint:from.id,walkedMeters:84},from,to,route),true);
  assert.equal(walkedHikeSegment({fromCheckpoint:from.id,walkedMeters:Infinity},from,to,route),false);
});

test('Caleb has authored observations and objectives before optional assets load',() => {
  const state = createHikeState();assert.ok(calebConversation(state,'trailhead').includes('on foot'));
  assert.ok(hikeStatus(state).text.includes('Trailhead'));assert.equal(hikeObjectives(state).length,3);
  const scripted=checkpoints.map(point=>calebConversation(state,point.id,route));assert.ok(scripted.every(line=>line.length>50));assert.ok(new Set(scripted).size>=3);
  assert.equal(projectHikeMap(null),null);
});

test('journal projects the actual route and accepts both points and route asset fields',() => {
  const a=projectHikeMap(route),b=projectHikeMap({...route,points:route.route});
  assert.deepEqual(a,b);assert.equal(a.points.length,4);assert.ok(a.points[0].x<a.points[1].x);assert.equal(a.points[0].y,a.points[1].y);assert.equal(a.points[1].x,a.points[2].x);
  assert.ok(a.points.every(point=>point.x>=0&&point.y>=0&&point.x<=360&&point.y<=190));
});
