import test from 'node:test';
import assert from 'node:assert/strict';
import {UNIT} from '../public/explorer/game/content.mjs';
import {CAMPUS_ACTIVITIES as ACTIVITIES, CAMPUS_NPCS as PEOPLE} from '../public/explorer/game/campus-content.mjs';
import {
  createCampusActivities, validateCampusActivities, applyCampusActivityAction, completedCampusRewards,
  campusActivityStatus, campusActivityObjectives, campusActivityTarget, currentCampusStep,
  getCampusConversation, getCampusStepConversation,
} from '../public/explorer/game/campus-state.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const record = (state, activity) => state.activities[activity.id];
const person = id => PEOPLE.find(value => value.id === id);
const ownerContext = activity => ({position: {...person(activity.npcId).work}, npcId: activity.npcId,
  npcPosition: {...person(activity.npcId).work}, grounded: true, riding: false});
const stepContext = step => ({position: {...step.point}, grounded: true, riding: false, speed: 0, travelled: 8,
  dwell: Math.max(3, step.seconds || 3), ...(step.npcId ? {npcId: step.npcId, npcPosition: {...step.point}} : {})});
const stepAction = (activity, step, choice) => step.type === 'choice' ?
  'campus:answer:' + activity.id + ':' + (choice || step.choices.find(value => value.correct).id) :
  'campus:step:' + activity.id + ':' + step.id;
const apply = (state, action, context) => {
  const result = applyCampusActivityAction(state, action, context);
  assert.equal(result.changed, true, action + ': ' + result.message);
  return result;
};
function complete(state, activity) {
  if (record(state, activity).finished) return;
  for (const id of activity.requires || []) complete(state, ACTIVITIES.find(value => value.id === id));
  if (!record(state, activity).started) apply(state, 'campus:start:' + activity.id, ownerContext(activity));
  for (const step of activity.steps.slice(record(state, activity).steps.length)) apply(state, stepAction(activity, step), stepContext(step));
  return apply(state, 'campus:finish:' + activity.id, ownerContext(activity));
}
function start(state, activity) {
  for (const id of activity.requires || []) complete(state, ACTIVITIES.find(value => value.id === id));
  apply(state, 'campus:start:' + activity.id, ownerContext(activity));
}
function atType(type) {
  const activity = ACTIVITIES.find(value => value.steps.some(step => step.type === type));
  assert.ok(activity, 'authored content contains a ' + type + ' activity');
  const state = createCampusActivities(); start(state, activity);
  for (const step of activity.steps) {
    if (step.type === type) return {state, activity, step};
    apply(state, stepAction(activity, step), stepContext(step));
  }
}

test('every authored campus story completes through ordered physical steps and grants once', () => {
  assert.equal(ACTIVITIES.length, 19);
  const state = createCampusActivities();
  for (const activity of ACTIVITIES) {
    const result = complete(state, activity);
    if (result) assert.deepEqual(result.reward, {id: 'campus:' + activity.id, xp: activity.xp});
    else assert.ok(completedCampusRewards(state).some(value => value.activityId === activity.id), 'a dependency already completed through its own return');
    assert.equal(campusActivityStatus(state, activity.id).status, 'completed');
    assert.equal(campusActivityTarget(state, activity.id), null);
    assert.equal(currentCampusStep(state, activity.id), null);
    const snapshot = copy(state);
    for (const action of ['campus:start:' + activity.id, 'campus:finish:' + activity.id, stepAction(activity, activity.steps[0])]) {
      assert.equal(applyCampusActivityAction(state, action, ownerContext(activity)).changed, false);
    }
    assert.deepEqual(state, snapshot, 'completed stories cannot be restarted to farm rewards');
  }
  assert.equal(completedCampusRewards(state).length, 19);
  assert.equal(new Set(completedCampusRewards(state).map(value => value.id)).size, 19);
  assert.deepEqual(new Set(state.completed), new Set(ACTIVITIES.map(value => value.id)));
  assert.deepEqual(validateCampusActivities(copy(state)), state);
});

test('every interrupted authored step survives normalization and exposes its next useful objective', () => {
  for (const activity of ACTIVITIES) {
    const state = createCampusActivities(); start(state, activity);
    for (const [index, step] of activity.steps.entries()) {
      const restored = validateCampusActivities(copy(state));
      assert.deepEqual(restored, state, activity.id + ' interrupted before ' + step.id);
      assert.equal(currentCampusStep(restored, activity.id).id, step.id);
      assert.equal(campusActivityTarget(restored, activity.id).stepId, step.id);
      assert.equal(campusActivityStatus(restored, activity.id).value, index + 1);
      assert.equal(campusActivityStatus(restored, activity.id).status, 'active');
      apply(state, stepAction(activity, step), stepContext(step));
    }
    const restored = validateCampusActivities(copy(state));
    assert.equal(currentCampusStep(restored, activity.id), null);
    assert.equal(campusActivityTarget(restored, activity.id).npcId, activity.npcId);
    assert.match(campusActivityStatus(restored, activity.id).text, /Return to/);
    assert.equal(completedCampusRewards(restored).some(value => value.activityId === activity.id), false, 'returning to the host is part of the story');
    apply(restored, 'campus:finish:' + activity.id, ownerContext(activity));
  }
});

test('declining and meeting preserve progress and never award a reward', () => {
  const state = createCampusActivities(), activity = ACTIVITIES[0], host = ownerContext(activity);
  const before = copy(state);
  assert.equal(applyCampusActivityAction(state, 'decline', host).changed, false);
  assert.deepEqual(state, before);
  for (let index = 0; index < 105; index++) applyCampusActivityAction(state, 'campus:meet:' + activity.npcId, host);
  assert.deepEqual(state.met, [activity.npcId]);
  assert.equal(state.talks[activity.npcId], 99);
  assert.deepEqual(completedCampusRewards(state), []);
  const lines = getCampusConversation(state, activity.npcId);
  assert.ok(lines.choices.some(choice => choice.action === 'decline'));
  assert.equal(lines.text.includes(person(activity.npcId).repeat), true);
});

test('accepting and finishing require the correct live host, grounded on foot and nearby', () => {
  const activity = ACTIVITIES.find(value => !value.requires?.length), state = createCampusActivities(), host = ownerContext(activity);
  for (const invalid of [
    {}, {...host, grounded: false}, {...host, riding: true}, {...host, npcId: 'invented'},
    {...host, npcPosition: undefined}, {...host, position: {x: host.position.x + 10 * UNIT, z: host.position.z}},
    {...host, position: {x: Infinity, z: 0}},
  ]) assert.equal(applyCampusActivityAction(state, 'campus:start:' + activity.id, invalid).changed, false);
  start(state, activity);
  assert.equal(applyCampusActivityAction(state, 'campus:finish:' + activity.id, host).changed, false);
  for (const step of activity.steps) apply(state, stepAction(activity, step), stepContext(step));
  assert.equal(applyCampusActivityAction(state, 'campus:finish:' + activity.id, {...host, npcId: 'invented'}).changed, false);
  // The live host can be elsewhere on the reviewed campus; its old anchor is
  // never substituted for the actual recipient position.
  const live = {x: host.position.x + 15 * UNIT, z: host.position.z + 5 * UNIT};
  assert.equal(applyCampusActivityAction(state, 'campus:finish:' + activity.id, {...host, npcPosition: live}).changed, false);
  apply(state, 'campus:finish:' + activity.id, {...host, position: live, npcPosition: live});
});

test('physical steps reject airborne, riding, distant and out-of-order interaction', () => {
  for (const type of ['interact', 'choice', 'observe', 'visit', 'deliver']) {
    const {state, activity, step} = atType(type), context = stepContext(step), action = stepAction(activity, step), before = copy(state);
    for (const invalid of [{...context, grounded: false}, {...context, riding: true},
      {...context, position: {x: step.point.x + 20 * UNIT, z: step.point.z}},
      {...context, position: {x: NaN, z: step.point.z}},
    ]) assert.equal(applyCampusActivityAction(state, action, invalid).changed, false, type);
    assert.equal(applyCampusActivityAction(state, 'campus:step:' + activity.id + ':invented', context).changed, false);
    assert.deepEqual(state, before);
  }
});

test('observations require a full stationary dwell and walking visits require measured travel', () => {
  const observing = atType('observe'), o = stepContext(observing.step), observe = stepAction(observing.activity, observing.step);
  for (const changes of [{dwell: 0}, {dwell: o.dwell - .01}, {dwell: NaN}, {speed: .21}, {speed: -1}, {speed: undefined}]) {
    assert.equal(applyCampusActivityAction(observing.state, observe, {...o, ...changes}).changed, false);
  }
  apply(observing.state, observe, o);
  const visiting = atType('visit'), v = stepContext(visiting.step), visit = stepAction(visiting.activity, visiting.step);
  for (const travelled of [undefined, NaN, -1, 0, 7.99]) assert.equal(applyCampusActivityAction(visiting.state, visit, {...v, travelled}).changed, false);
  apply(visiting.state, visit, {...v, travelled: 8});
});

test('puzzles show feedback without awarding guessed or nonexistent answers', () => {
  const {state, activity, step} = atType('choice'), context = stepContext(step), before = copy(state);
  const conversation = getCampusStepConversation(state, activity.id);
  assert.equal(conversation.npcId, 'step:' + activity.id);
  assert.equal(conversation.text, step.prompt);
  for (const wrong of step.choices.filter(choice => !choice.correct)) {
    const result = applyCampusActivityAction(state, stepAction(activity, step, wrong.id), context);
    assert.equal(result.changed, false);assert.equal(result.message, wrong.feedback);
  }
  assert.equal(applyCampusActivityAction(state, stepAction(activity, step, 'invented'), context).changed, false);
  assert.deepEqual(state, before);
  const answer = step.choices.find(choice => choice.correct);
  apply(state, stepAction(activity, step, answer.id), context);
  assert.equal(record(state, activity).answers[step.id], answer.id);
});

test('deliveries require the live correct recipient and the earlier pickup cannot be skipped', () => {
  const {state, activity, step} = atType('deliver'), context = stepContext(step), action = stepAction(activity, step);
  for (const invalid of [{...context, npcId: 'invented'}, {...context, npcPosition: undefined},
    {...context, npcPosition: {x: step.point.x + 20 * UNIT, z: step.point.z}}]) {
    assert.equal(applyCampusActivityAction(state, action, invalid).changed, false);
  }
  const fresh = createCampusActivities(); start(fresh, activity);
  assert.equal(applyCampusActivityAction(fresh, action, context).changed, false);
  const live = {x: step.point.x + 15 * UNIT, z: step.point.z};
  apply(state, action, {...context, position: live, npcPosition: live});
});

test('prerequisites stay locked until the earlier story is returned to its host', () => {
  const activity = ACTIVITIES.find(value => value.requires?.length);
  assert.ok(activity, 'the content contains a follow-through story chain');
  const state = createCampusActivities();
  assert.equal(campusActivityStatus(state, activity.id).status, 'locked');
  assert.equal(campusActivityTarget(state, activity.id), null);
  assert.equal(applyCampusActivityAction(state, 'campus:start:' + activity.id, ownerContext(activity)).changed, false);
  assert.ok(getCampusConversation(state, activity.npcId).choices.find(choice => choice.action === 'campus:start:' + activity.id).disabled);
  for (const id of activity.requires) complete(state, ACTIVITIES.find(value => value.id === id));
  assert.equal(campusActivityStatus(state, activity.id).status, 'available');
  start(state, activity);
  assert.equal(campusActivityStatus(state, activity.id).status, 'active');
});

test('old, malformed and forged completion payloads normalize to supported step receipts', () => {
  const fresh = createCampusActivities();
  for (const raw of [undefined, null, [], '', {version: 0}, {version: 2}, {version: '1'}]) assert.deepEqual(validateCampusActivities(raw), fresh);
  const raw = copy(fresh);raw.completed = ACTIVITIES.map(activity => activity.id);raw.met = ['invented', PEOPLE[0].id, PEOPLE[0].id];raw.talks = {[PEOPLE[0].id]: 999, invented: 999};
  for (const activity of ACTIVITIES) raw.activities[activity.id].finished = true;
  const clean = validateCampusActivities(raw);
  assert.deepEqual(clean.completed, []);assert.deepEqual(completedCampusRewards(clean), []);
  assert.deepEqual(clean.met, [PEOPLE[0].id]);assert.deepEqual(clean.talks, {[PEOPLE[0].id]: 99});
  const choiceActivity = ACTIVITIES.find(activity => activity.steps.some(step => step.type === 'choice'));
  const solved = createCampusActivities();complete(solved, choiceActivity);
  const puzzle = choiceActivity.steps.find(step => step.type === 'choice');delete solved.activities[choiceActivity.id].answers[puzzle.id];
  const pruned = validateCampusActivities(solved);
  assert.equal(pruned.activities[choiceActivity.id].finished, false);
  assert.equal(pruned.activities[choiceActivity.id].steps.length, choiceActivity.steps.indexOf(puzzle));
  assert.equal(completedCampusRewards(pruned).some(value => value.activityId === choiceActivity.id), false);
});

test('invalid prerequisites cascade through restored chains and receipt holes never finish a story', () => {
  const state = createCampusActivities();for (const activity of ACTIVITIES) complete(state, activity);
  const dependent = ACTIVITIES.find(activity => activity.requires?.length), dependency = ACTIVITIES.find(activity => activity.id === dependent.requires[0]);
  state.activities[dependency.id].steps = [];
  const restored = validateCampusActivities(state);
  assert.equal(restored.activities[dependent.id].started, false);
  assert.equal(restored.completed.includes(dependent.id), false);
  const standalone = ACTIVITIES.find(activity => !activity.requires?.length), broken = createCampusActivities();
  broken.activities[standalone.id] = {started: true, steps: new Array(standalone.steps.length), answers: {}, finished: false};
  assert.equal(applyCampusActivityAction(broken, 'campus:finish:' + standalone.id, ownerContext(standalone)).changed, false);
  assert.deepEqual(completedCampusRewards(broken), []);
});

test('journal, targets and conversations use known stories and stable action ids', () => {
  const state = createCampusActivities(), objectives = campusActivityObjectives(state);
  assert.equal(objectives.length, ACTIVITIES.length);
  assert.ok(objectives.every(value => value.name && value.color && value.districtName && value.total > 2));
  assert.equal(campusActivityTarget(state, 'invented'), null);
  assert.equal(getCampusConversation(state, 'invented'), null);
  assert.equal(getCampusStepConversation(state, 'invented'), null);
  for (const invalid of ['campus:finish:invented', 'campus:start:__proto__', 'campus:start:constructor', 'campus:step:invented:missing', 'other', null]) {
    assert.equal(applyCampusActivityAction(state, invalid, {}).changed, false);
  }
  for (const activity of ACTIVITIES.filter(value => !value.requires?.length)) {
    assert.equal(campusActivityTarget(state, activity.id).npcId, activity.npcId);
    const menu = getCampusConversation(state, activity.npcId);
    assert.ok(menu.choices.some(choice => choice.id === 'campus:start:' + activity.id && !choice.disabled));
  }
});
