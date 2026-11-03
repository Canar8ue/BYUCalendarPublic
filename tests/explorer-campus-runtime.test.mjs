import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {UNIT} from '../public/explorer/game/content.mjs';
import {NPC_DEFINITIONS} from '../public/explorer/game/district-content.mjs';
import {CAMPUS_ACTIVITIES as ACTIVITIES, CAMPUS_NPCS as PEOPLE} from '../public/explorer/game/campus-content.mjs';
import {createProgress, validateProgress, claimReward, getSummary, advanceCat, discover, saveProgress, loadProgress} from '../public/explorer/game/progress.mjs';
import {applyCampusActivityAction, completedCampusRewards} from '../public/explorer/game/campus-state.mjs';

const adapterURL = 'data:text/javascript;base64,' + Buffer.from(`
let harness;
export function setHarness(value){harness=value;}
export function createCampusWorld(){return harness.campus;}
export function createDistrictUI({onAction}){harness.emit=onAction;return harness.ui;}
`).toString('base64');
const adapter = await import(adapterURL);
let source = await readFile(new URL('../public/explorer/game/campus-network.mjs', import.meta.url), 'utf8');
source = source.replace(/from '(\.\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(
  ['./campus-world.mjs', './district-ui.mjs'].includes(path.split('?')[0]) ? adapterURL : new URL('../public/explorer/game/' + path.slice(2), import.meta.url).href));
const {createCampusNetworkRuntime} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const clone = value => JSON.parse(JSON.stringify(value));
const ownerContext = activity => {
  const p = PEOPLE.find(person => person.id === activity.npcId).work;
  return {position: {...p}, npcId: activity.npcId, npcPosition: {...p}, grounded: true, riding: false};
};
const stepContext = step => ({position: {...step.point}, grounded: true, riding: false, speed: 0, travelled: 8,
  dwell: Math.max(3, step.seconds || 3), ...(step.npcId ? {npcId: step.npcId, npcPosition: {...step.point}} : {})});
const stepAction = (activity, step) => step.type === 'choice' ? 'campus:answer:' + activity.id + ':' + step.choices.find(choice => choice.correct).id :
  'campus:step:' + activity.id + ':' + step.id;
function pureAction(progress, action, context) {
  const result = applyCampusActivityAction(progress.campusActivities, action, context);
  assert.equal(result.changed, true, action + ': ' + result.message);
  if (result.reward) claimReward(progress, result.reward.id, result.reward.xp);
  return result;
}
function completePure(progress, activity) {
  if (progress.campusActivities.activities[activity.id].finished) return;
  for (const id of activity.requires || []) completePure(progress, ACTIVITIES.find(value => value.id === id));
  pureAction(progress, 'campus:start:' + activity.id, ownerContext(activity));
  for (const step of activity.steps) pureAction(progress, stepAction(activity, step), stepContext(step));
  return pureAction(progress, 'campus:finish:' + activity.id, ownerContext(activity));
}
function prepareType(h, type) {
  const activity = ACTIVITIES.find(value => value.steps.some(step => step.type === type));
  for (const id of activity.requires || []) completePure(h.progress, ACTIVITIES.find(value => value.id === id));
  pureAction(h.progress, 'campus:start:' + activity.id, ownerContext(activity));
  for (const step of activity.steps) {
    if (step.type === type) return {activity, step};
    pureAction(h.progress, stepAction(activity, step), stepContext(step));
  }
}

function harness() {
  const progress = createProgress(), characters = PEOPLE.map(person => ({...person.work, id: person.id, name: person.name, role: person.role, color: person.color}));
  const oldCharacters = NPC_DEFINITIONS.map(person => ({...person.work, id: person.id, name: person.name}));
  const h = {progress, characters, oldCharacters, paused: false, saves: 0, rewards: [], tracked: [], toasts: [], gestures: [],
    legacyCalls: [], campusCalls: [], player: {position: {...PEOPLE[0].work}, grounded: true, riding: false}, disposed: []};
  h.legacy = {
    isOpen: false, update: (...args) => h.legacyCalls.push(['update', ...args]),
    getCharacters: () => oldCharacters, getObstacles: () => [{id: 'old-counter'}], getAnchors: () => [{id: 'old-anchor'}],
    targets: () => [{...oldCharacters[0], id: 'legacy-target', npcId: 'maya', label: 'Talk to Maya'}],
    target: id => ({id, legacyTarget: true}), interact: point => h.legacyCalls.push(['interact', point]),
    preparePhoto: camera => {h.legacyCalls.push(['photo', camera]);return () => {h.legacyPhotoCommitted = true;};},
    suspend: () => h.legacyCalls.push(['suspend']), reset: () => h.legacyCalls.push(['reset']),
    close() {this.isOpen = false;h.legacyCalls.push(['close']);}, dispose: () => h.disposed.push('legacy'),
  };
  h.campus = {getCharacters: () => characters, update: (...args) => h.campusCalls.push(['update', ...args]),
    getObstacles: () => [{id: 'new-counter'}], getAnchors: () => [{id: 'new-anchor'}],
    interact: (...args) => h.gestures.push(args), reset: () => h.campusCalls.push(['reset']), dispose: () => h.disposed.push('campus')};
  h.ui = {isOpen: false, panel: null,
    showConversation(value) {this.isOpen = true;this.panel = 'conversation';h.conversation = value;},
    showJournal(value) {this.isOpen = true;this.panel = 'journal';h.journal = value;},
    close() {this.isOpen = false;this.panel = null;}, dispose() {this.close();h.disposed.push('ui');}};
  adapter.setHarness(h);
  const runtime = createCampusNetworkRuntime({legacy: h.legacy, scene: {}, world: {}, navigation: {findPath: () => []},
    getProgress: () => h.progress, getPlayer: () => h.player,
    pause() {h.paused = true;runtime.suspend();}, resume() {h.paused = false;},
    track(id) {h.tracked.push(id);h.progress.trackedQuest = id;}, persist() {h.saves++;},
    reward(value) {h.rewards.push(value);claimReward(h.progress, value.id, value.xp);},
    toast: (...args) => h.toasts.push(args), openHike: () => {h.hikeOpened = true;}});
  h.runtime = runtime;
  h.person = id => [...characters, ...oldCharacters].find(person => person.id === id);
  h.tick = (position, extra = {}) => {
    h.player.position = {...position};
    h.player.grounded = extra.grounded !== false;
    h.player.riding = extra.riding === true;
    runtime.update(.1, 1, {position: h.player.position, grounded: h.player.grounded, riding: h.player.riding,
      enabled: !h.paused, speed: 0, ...extra});
  };
  h.talk = id => {
    h.tick(h.person(id));
    runtime.interact(runtime.targets().find(point => point.campusNPC && point.npcId === id));
  };
  h.choose = action => {
    const choice = h.conversation.choices.find(value => value.action === action);
    assert.ok(choice, 'dialogue offers ' + action);
    h.emit('districtChoice', {npcId: h.conversation.npcId, action, choiceId: choice.id});
  };
  h.close = () => h.emit('districtClose');
  h.openStep = (activity, step) => {
    h.tick(step.npcId ? h.person(step.npcId) : step.point);
    const point = runtime.targets().find(value => value.campusStep === activity.id && value.stepId === step.id);
    assert.ok(point, 'current physical target ' + step.id);runtime.interact(point);
  };
  return h;
}

test('campus network completes a story through actual UI callbacks and grants its registered reward once', () => {
  const h = harness(), activity = ACTIVITIES.find(value => value.id === 'club-stamp-circuit');
  const legacyState = clone(h.progress.campusLife), hikeState = clone(h.progress.hike);
  h.talk(activity.npcId);assert.equal(h.paused, true);assert.equal(h.runtime.isOpen, true);
  h.choose('campus:start:' + activity.id);h.close();
  assert.equal(h.progress.trackedQuest, 'campus:' + activity.id);
  for (const step of activity.steps) {
    h.openStep(activity, step);assert.equal(h.paused, true);
    h.choose(stepAction(activity, step));assert.equal(h.paused, false);
  }
  h.talk(activity.npcId);h.choose('campus:finish:' + activity.id);
  assert.deepEqual(h.rewards, [{id: 'campus:' + activity.id, xp: activity.xp}]);
  assert.equal(getSummary(h.progress).xp, activity.xp);
  const saves = h.saves;
  h.emit('districtChoice', {npcId: activity.npcId, choiceId: 'campus:finish:' + activity.id, action: 'campus:finish:' + activity.id});
  assert.equal(h.saves, saves);assert.equal(h.rewards.length, 1);
  assert.deepEqual(h.progress.campusLife, legacyState);assert.deepEqual(h.progress.hike, hikeState);
  h.runtime.dispose();h.runtime.dispose();assert.deepEqual(h.disposed.sort(), ['campus', 'legacy', 'ui']);
});

test('delivery targets and validation follow the live recipient while a conversation is open', () => {
  const h = harness(), {activity, step} = prepareType(h, 'deliver'), recipient = h.person(step.npcId);
  h.openStep(activity, step);const before = h.progress.campusActivities.activities[activity.id].steps.length;
  recipient.x += 20 * UNIT;
  assert.equal(h.runtime.target('campus:' + activity.id).x, recipient.x);
  const target = h.runtime.targets().find(point => point.campusStep === activity.id);
  assert.equal(target.x, recipient.x);
  h.choose(stepAction(activity, step));
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before, 'a recipient who moved out of reach cannot receive the parcel');
  h.player.position = {x: recipient.x, z: recipient.z};h.choose(stepAction(activity, step));
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before + 1);
  h.runtime.dispose();
});

test('stale step choices and callbacks after reset/import cannot advance another objective', () => {
  const h = harness(), {activity, step} = prepareType(h, 'interact');h.openStep(activity, step);
  const oldMenu = clone(h.conversation), oldChoice = oldMenu.choices[0];
  pureAction(h.progress, stepAction(activity, step), stepContext(step));
  const before = clone(h.progress.campusActivities), saves = h.saves;
  h.emit('districtChoice', {npcId: oldMenu.npcId, action: oldChoice.action, choiceId: oldChoice.id});
  assert.deepEqual(h.progress.campusActivities, before);assert.equal(h.saves, saves);
  h.progress = validateProgress(createProgress());h.runtime.reset();
  h.emit('districtChoice', {npcId: oldMenu.npcId, action: oldChoice.action, choiceId: oldChoice.id});
  assert.equal(h.runtime.isOpen, false);assert.deepEqual(h.progress.campusActivities.completed, []);
  assert.equal(h.rewards.length, 0);h.runtime.dispose();
});

test('observation dwell clears across pause and disabled updates cannot contribute', () => {
  const h = harness(), {activity, step} = prepareType(h, 'observe'), before = h.progress.campusActivities.activities[activity.id].steps.length;
  for (let index = 0; index < 35; index++) h.tick(step.point);
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before);
  h.runtime.openJournal();
  for (let index = 0; index < 100; index++) h.tick(step.point, {enabled: false});
  h.close();for (let index = 0; index < 15; index++) h.tick(step.point);
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before, 'pre-pause dwell is not reusable');
  for (let index = 0; index < 45; index++) h.tick(step.point);
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before + 1);
  assert.equal(h.rewards.length, 0);h.runtime.dispose();
});

test('a teleport cannot reuse earlier travel and a visit completes after measured walking', () => {
  const h = harness(), {activity, step} = prepareType(h, 'visit'), before = h.progress.campusActivities.activities[activity.id].steps.length;
  h.tick({x: step.point.x + 100 * UNIT, z: step.point.z});
  for (let index = 1; index <= 50; index++) h.tick({x: step.point.x + (100 + index * .2) * UNIT, z: step.point.z});
  h.tick(step.point);for (let index = 0; index < 15; index++) h.tick(step.point);
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before, 'a fast-travel arrival does not inherit the earlier walk');
  h.tick({x: step.point.x - 8.5 * UNIT, z: step.point.z});
  for (let index = 1; index <= 44; index++) h.tick({x: step.point.x + (-8.5 + index * .2) * UNIT, z: step.point.z}, {speed: 2});
  assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before + 1);
  h.runtime.dispose();
});

test('visit movement evidence clears on pause, import/reset and riding interruptions', () => {
  for (const interruption of ['pause', 'import', 'riding']) {
    const h = harness(), {activity, step} = prepareType(h, 'visit'), before = h.progress.campusActivities.activities[activity.id].steps.length;
    const start = {x: step.point.x - 8 * UNIT, z: step.point.z};h.tick(start);
    for (let index = 1; index <= 20; index++) h.tick({x: start.x + index * .2 * UNIT, z: start.z}, {speed: 2});
    if (interruption === 'pause') {h.runtime.openJournal();h.close();}
    if (interruption === 'import') {h.progress = validateProgress(clone(h.progress));h.runtime.reset();}
    if (interruption === 'riding') h.tick(h.player.position, {riding: true});
    for (let index = 21; index <= 40; index++) h.tick({x: start.x + index * .2 * UNIT, z: start.z}, {speed: 2});
    assert.equal(h.progress.campusActivities.activities[activity.id].steps.length, before, interruption + ' clears the earlier four metres');
    h.runtime.dispose();
  }
});

test('network journal, map, photo, targets and disposal preserve the legacy adapters', () => {
  const h = harness();h.runtime.openJournal();
  assert.equal(h.journal.objectives.length, 24);assert.equal(h.journal.characters.length, 11);assert.equal(h.journal.hike, true);
  assert.ok(h.journal.objectives.some(value => value.id === 'activity:cookie-stand'));
  assert.ok(h.journal.objectives.some(value => value.id === 'campus:club-stamp-circuit'));
  assert.equal(h.journal.districts.length, 6);
  h.emit('districtTrack', 'activity:cookie-stand');assert.equal(h.tracked.at(-1), 'activity:cookie-stand');assert.equal(h.paused, false);
  assert.equal(h.runtime.target('activity:cookie-stand').legacyTarget, true);
  const point = h.runtime.targets().find(value => value.id === 'legacy-target');h.runtime.interact(point);
  assert.ok(h.legacyCalls.some(([kind, value]) => kind === 'interact' && value === point));
  assert.equal(h.runtime.getCharacters().length, 11);assert.equal(h.runtime.getObstacles().length, 2);assert.equal(h.runtime.getAnchors().length, 2);
  assert.equal(h.runtime.getMapActivities().length, 6);
  h.runtime.preparePhoto('camera')();assert.equal(h.legacyPhotoCommitted, true);
  h.runtime.openJournal();h.emit('districtHike');assert.equal(h.hikeOpened, true);assert.equal(h.runtime.isOpen, false);
  h.runtime.dispose();
});

test('malformed and invented tracking callbacks are ignored at the journal boundary', () => {
  const h = harness();h.runtime.openJournal();
  for (const payload of [undefined, null, 1, {}, 'activity:invented', 'campus:invented']) assert.doesNotThrow(() => h.emit('districtTrack', payload));
  assert.deepEqual(h.tracked, []);h.runtime.dispose();
});

test('following a later locked story resolves every prerequisite level to a reachable objective', () => {
  const h = harness(), later = ACTIVITIES.find(activity => activity.requires?.some(id => ACTIVITIES.find(value => value.id === id).requires?.length));
  assert.ok(later, 'authored stories contain a multi-level follow-through chain');
  let expected = later;
  for (let index = 0; index < ACTIVITIES.length && expected.requires.length; index++) expected = ACTIVITIES.find(value => value.id === expected.requires[0]);
  h.runtime.openJournal();h.emit('districtTrack', 'campus:' + later.id);
  assert.equal(h.tracked.at(-1), 'campus:' + expected.id);
  assert.ok(h.runtime.target(h.tracked.at(-1)), 'the selected prerequisite has a host and a route');
  h.runtime.dispose();
});

test('a distant or airborne choice uses the live player and old owner menus close on import', () => {
  const h = harness(), {activity, step} = prepareType(h, 'choice');h.openStep(activity, step);
  const before = clone(h.progress.campusActivities), action = stepAction(activity, step);
  h.player.position.x += 20 * UNIT;h.choose(action);assert.deepEqual(h.progress.campusActivities, before);
  h.player.position = {...step.point};h.player.grounded = false;h.choose(action);assert.deepEqual(h.progress.campusActivities, before);
  h.close();h.player.grounded = true;h.progress = createProgress();h.runtime.reset();
  const first = ACTIVITIES.find(value => !value.requires.length);h.talk(first.npcId);
  const menu = clone(h.conversation), choice = menu.choices.find(value => value.action === 'campus:start:' + first.id);
  assert.ok(choice);
  h.progress = validateProgress(createProgress());h.runtime.reset();
  h.emit('districtChoice', {npcId: menu.npcId, choiceId: choice.id, action: choice.action});
  assert.equal(h.progress.campusActivities.activities[first.id].started, false);
  assert.equal(h.runtime.isOpen, false);h.runtime.dispose();
});

test('old saves preserve adventure, district and hike state while receiving fresh campus activities', () => {
  const state = createProgress();advanceCat(state);discover(state, 'hbll');state.trackedQuest = 'activity:cookie-stand';
  state.campusLife.maya = {stage: 2, cookie: 'oat', pennants: [], cards: []};
  const expected = validateProgress(clone(state));delete state.campusActivities;
  const migrated = validateProgress(state);
  assert.equal(migrated.version, 2);assert.equal(migrated.catStep, 1);assert.equal(getSummary(migrated).xp, getSummary(expected).xp);
  assert.deepEqual(migrated.campusLife, expected.campusLife);assert.deepEqual(migrated.hike, expected.hike);
  assert.equal(migrated.trackedQuest, 'activity:cookie-stand');assert.deepEqual(migrated.campusActivities.completed, []);
});

test('registered rewards, step receipts and tracking survive save/load without accepting claims-only imports', () => {
  const activity = ACTIVITIES.find(value => value.id === 'club-stamp-circuit'), state = createProgress();advanceCat(state);
  const baseline = getSummary(state).xp;
  state.claims['campus:' + activity.id] = activity.xp;
  const forged = validateProgress(state);assert.equal(getSummary(forged).xp, baseline);assert.equal(forged.claims['campus:' + activity.id], undefined);
  completePure(forged, activity);forged.trackedQuest = 'campus:' + activity.id;
  delete forged.claims['campus:' + activity.id];
  const restored = validateProgress(forged);assert.equal(getSummary(restored).xp, baseline + activity.xp);
  assert.equal(claimReward(restored, 'campus:' + activity.id, activity.xp), false);
  assert.equal(claimReward(restored, 'campus:invented', 25), false);
  const values = new Map(), storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
  assert.equal(saveProgress(restored, storage), true);const loaded = loadProgress(storage);
  assert.equal(loaded.trackedQuest, 'campus:' + activity.id);assert.equal(getSummary(loaded).xp, baseline + activity.xp);
  assert.deepEqual(completedCampusRewards(loaded.campusActivities), [{id: 'campus:' + activity.id, xp: activity.xp, activityId: activity.id}]);
  assert.equal(validateProgress({...loaded, trackedQuest: 'campus:invented'}).trackedQuest, 'main');
});
