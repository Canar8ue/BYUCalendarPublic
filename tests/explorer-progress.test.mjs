import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNIT, SPAWN, SCOOTER_STAND, LOCATIONS, CAT_TRAIL, COSMO_SPOTS, SECRETS, TRIALS, QUESTS, MAIN_CHAPTERS, LOST_ITEMS, TUNE_NOTES, PHOTO_SPOTS} from '../public/explorer/game/content.mjs';
import {SAVE_KEY, createProgress, validateProgress, loadProgress, saveProgress, claimReward, discover, advanceCat, findCosmo, completeQuest, collectSecret, recordTrial, collectQuestItem, getLevel, getSummary, recoverFragment, finishAdventure, equipCosmetic, getAchievements} from '../public/explorer/game/progress.mjs';

const memoryStorage = () => {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
};

test('explorer discoveries award XP exactly once across save/reload and repeat entry', () => {
  const state = createProgress(), storage = memoryStorage();
  assert.equal(discover(state, 'hbll'), true);
  assert.equal(discover(state, 'hbll'), false);
  assert.equal(discover(state, 'not-a-building'), false);
  assert.equal(getSummary(state).xp, 10);
  assert.equal(saveProgress(state, storage), true);
  const resumed = loadProgress(storage);
  assert.equal(discover(resumed, 'hbll'), false);
  assert.deepEqual(resumed.visited, ['hbll']);
  assert.equal(getSummary(resumed).xp, 10);
});

test('explorer reward registry rejects unknown claims and wrong amounts', () => {
  const state = createProgress();
  assert.equal(claimReward(state, 'visit:hbll', 999999), false);
  assert.equal(claimReward(state, 'visit:unknown', 10), false);
  assert.equal(claimReward(state, '__proto__', 10), false);
  assert.equal(claimReward(state, 'visit:hbll', 10), true);
  assert.equal(claimReward(state, 'visit:hbll', 10), false);
  assert.equal(getSummary(state).xp, 10);
});

test('main chapters stay ordered when districts are discovered out of sequence', () => {
  const state = createProgress();
  for (const id of MAIN_CHAPTERS[1].locations) discover(state, id);
  assert.equal(getSummary(state).mainChapter, 1);
  assert.equal(Object.hasOwn(state.claims, 'chapter:long-way'), false);
  for (const id of MAIN_CHAPTERS[0].locations) discover(state, id);
  assert.equal(recoverFragment(state,'long-way'),false,'later fragments cannot be collected out of order');
  assert.equal(recoverFragment(state,'orientation'),true);
  assert.equal(recoverFragment(state,'long-way'),true);
  assert.equal(getSummary(state).mainChapter, 3);
  assert.equal(state.claims['chapter:orientation'], 30);
  assert.equal(state.claims['chapter:long-way'], 40);
});

test('four district fragments complete the main adventure once', () => {
  const state = createProgress();
  assert.equal(finishAdventure(state),false);
  for (const chapter of MAIN_CHAPTERS){
    assert.equal(recoverFragment(state,chapter.id),false,'fragment needs its chapter discoveries');
    for(const id of chapter.locations)discover(state,id);
    assert.equal(getSummary(state).mainComplete,false,'discoveries alone do not finish the story');
    assert.equal(recoverFragment(state,chapter.id),true);
    assert.equal(recoverFragment(state,chapter.id),false,'no duplicate fragment rewards');
  }
  assert.equal(finishAdventure(state),true);
  assert.equal(finishAdventure(state),false);
  assert.equal(getSummary(state).mainComplete, true);
  assert.equal(state.quests.includes('main'), true);
  const xp = getSummary(state).xp;
  assert.equal(completeQuest(state, 'main'), false);
  for (const location of LOCATIONS) discover(state, location.id);
  const restored = validateProgress(state);
  assert.equal(getSummary(restored).mainComplete, true);
  assert.equal(state.claims['quest:main'], 100);
  assert.equal(getSummary(restored).xp, getSummary(state).xp);
  assert.ok(getSummary(restored).xp >= xp);
});

test('cat checkpoint resumes and final interaction grants one resolution reward', () => {
  const state = createProgress();
  for (let i = 0; i < 3; i++) advanceCat(state);
  const resumed = validateProgress(JSON.parse(JSON.stringify(state)));
  assert.equal(resumed.catStep, 3);
  assert.equal(getSummary(resumed).xp, 30);
  for (let i = 3; i < CAT_TRAIL.length; i++) advanceCat(resumed);
  assert.equal(resumed.catStep, CAT_TRAIL.length);
  assert.equal(resumed.quests.includes('cat'), true);
  assert.equal(getSummary(resumed).xp, 140);
  assert.equal(advanceCat(resumed), false);
  assert.equal(completeQuest(resumed, 'cat'), false);
  assert.equal(getSummary(validateProgress(resumed)).xp, 140);
});

test('Cosmo sightings remain saved and the final cameo reward is idempotent', () => {
  let state = createProgress();
  findCosmo(state);
  state = validateProgress(state);
  assert.equal(state.cosmoStep, 1);
  findCosmo(state); findCosmo(state);
  assert.equal(state.quests.includes('cosmo'), true);
  assert.equal(findCosmo(state), false);
  assert.equal(getSummary(state).xp, 145);
  assert.ok(getSummary(state).unlocked.includes('cosmo-wave'));
});

test('belongings need returning, photographs finish their quest, and notes unlock a separate puzzle', () => {
  const state = createProgress();
  for (const [kind, values, quest] of [['items', LOST_ITEMS, 'lost-found'], ['notes', TUNE_NOTES, 'music'], ['photos', PHOTO_SPOTS, 'photo']]) {
    assert.equal(collectQuestItem(state, kind, values[0].id), true);
    assert.equal(collectQuestItem(state, kind, values[0].id), false);
    assert.equal(collectQuestItem(state, kind, 'unknown'), false);
    for (const value of values.slice(1)) collectQuestItem(state, kind, value.id);
    assert.equal(state.quests.includes(quest),kind==='photos');
  }
  assert.equal(collectQuestItem(state, 'invented', 'unknown'), false);
  const summary = getSummary(validateProgress(state));
  assert.equal(summary.itemCount, LOST_ITEMS.length);
  assert.equal(summary.noteCount, TUNE_NOTES.length);
  assert.equal(summary.photoCount, PHOTO_SPOTS.length);
  assert.equal(summary.xp, 60);
  assert.equal(completeQuest(state,'lost-found'),true);
  assert.equal(completeQuest(state, 'music'), true);
  assert.equal(completeQuest(state, 'music'), false);
  assert.equal(getSummary(validateProgress(state)).xp, 180);
});

test('secret replay and improved scooter times cannot farm XP', () => {
  const state = createProgress();
  assert.equal(collectSecret(state, SECRETS[0].id), true);
  assert.equal(collectSecret(state, SECRETS[0].id), false);
  assert.equal(recordTrial(state, TRIALS[0].id, 40), true);
  assert.equal(recordTrial(state, TRIALS[0].id, 35), true);
  assert.equal(recordTrial(state, TRIALS[0].id, 55), true);
  assert.equal(state.bestTimes[TRIALS[0].id], 35);
  assert.equal(getSummary(state).xp, 60, 'one postcard, one finish, and one silver medal');
  assert.equal(getSummary(validateProgress(state)).xp, 60);
});

test('save validation filters invented IDs, caps step counts, and distrusts aggregate XP', () => {
  const raw = {version: 1, xp: 9999999, visited: ['hbll', 'hbll', 'moon'], claims: {'visit:hbll': 999, 'visit:moon': 10, 'secret:page-zero': 15}, catStep: 999, cosmoStep: -4, deliveryStep: 999, items: ['blue-notebook', 'unknown'], secrets: ['page-zero', 'unknown']};
  const state = validateProgress(raw);
  assert.deepEqual(state.visited, ['hbll']);
  assert.deepEqual(state.items, ['blue-notebook']);
  assert.equal(state.claims['visit:hbll'], 10);
  assert.equal(Object.hasOwn(state.claims, 'visit:moon'), false);
  assert.equal(state.catStep, CAT_TRAIL.length);
  assert.equal(state.cosmoStep, 0);
  assert.equal(state.deliveryStep, 2);
  assert.equal(getSummary(state).xp, 165);
});

test('legacy development saves migrate supported discoveries without trusting XP', () => {
  const state = validateProgress({version: 0, visited: ['hbll', 'jkb'], xp: 7000, checkpoint: {...SPAWN}});
  assert.equal(state.version, 2);
  assert.equal(getSummary(state).xp, 20);
  assert.deepEqual(state.visited, ['hbll', 'jkb']);
});

test('unknown future versions and malformed storage recover to fresh progress', () => {
  for (const raw of [null, [], 'bad', {version: 99, visited: ['hbll']}]) assert.deepEqual(validateProgress(raw), createProgress());
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, '{not json');
  assert.deepEqual(loadProgress(storage), createProgress());
  storage.setItem(SAVE_KEY, ' '.repeat(100001));
  assert.deepEqual(loadProgress(storage), createProgress());
});

test('disabled or full browser storage never throws or pretends progress was saved', () => {
  const blocked = {getItem() {throw new Error('SecurityError');}, setItem() {throw new Error('QuotaExceededError');}};
  assert.deepEqual(loadProgress(blocked), createProgress());
  assert.equal(saveProgress(createProgress(), blocked), false);
  assert.equal(saveProgress(createProgress(), null), false);
  assert.deepEqual(loadProgress(null), createProgress());
});

test('checkpoint and settings validation reject invalid numeric positions', () => {
  for (const checkpoint of [{x: NaN, z: 0}, {x: Infinity, z: 0}, {x: 0, z: -10000}]) assert.deepEqual(validateProgress({version: 1, checkpoint}).checkpoint, SPAWN);
  const state = validateProgress({version: 1, checkpoint: {x: 5.45, z: 3.25}, deliveryStep: 1, settings: {music: false, volume: 3, quality: 'ultra-moon', reducedMotion: true}});
  assert.deepEqual(state.checkpoint, {x: 5.45, z: 3.25});
  assert.equal(state.deliveryStep, 1);
  assert.deepEqual(state.settings, {...createProgress().settings,music:false,volume:1,reducedMotion:true});
});

test('delivery started state and sky preference survive an interrupted journey', () => {
  const state = createProgress(), storage = memoryStorage();
  state.deliveryStarted = true;
  state.settings.time = 'night';
  saveProgress(state, storage);
  const resumed = loadProgress(storage);
  assert.equal(resumed.deliveryStarted, true);
  assert.equal(resumed.deliveryStep, 1);
  assert.equal(resumed.settings.time, 'night');
  completeQuest(resumed, 'delivery');
  assert.equal(resumed.deliveryStep, 2);
  assert.equal(loadProgress({getItem: () => JSON.stringify(resumed)}).deliveryStep, 2);
});

test('bad trial results are ignored during import and live play', () => {
  const state = createProgress();
  for (const value of [NaN, Infinity, -5, 0, 999999, '30']) assert.equal(recordTrial(state, 'central-loop', value), false);
  assert.equal(recordTrial(state, 'imaginary-race', 30), false);
  const restored = validateProgress({version: 1, bestTimes: {'central-loop': 30, 'arts-run': -1, 'northbound': '15', 'made-up': 20}});
  assert.deepEqual(restored.bestTimes, {'central-loop': 30});
  assert.equal(getSummary(restored).xp, 75, 'a gold finish includes its finish and medal rewards');
});

test('XP levels use reward ledger and meaningful progress reaches later levels', () => {
  const state = createProgress();
  assert.equal(getLevel(state), 1);
  for (const location of LOCATIONS) discover(state, location.id);
  assert.equal(getSummary(state).xp, 240,'walking around alone does not claim the story rewards');
  assert.equal(getLevel(state), 4);
  assert.equal(getSummary(state).visitedCount, 24);
});

test('version-one adventures keep every earned fragment, finale and cosmetic opportunity',()=>{
 const old={version:1,visited:MAIN_CHAPTERS.flatMap(c=>c.locations),quests:['main'],claims:Object.fromEntries(MAIN_CHAPTERS.map(c=>['chapter:'+c.id,c.xp])),settings:{volume:.2}};
 const migrated=validateProgress(old);
 assert.equal(migrated.version,2);assert.equal(migrated.fragments.length,4);assert.equal(migrated.introSeen,true);assert.equal(migrated.finaleSeen,true);
 assert.equal(getSummary(migrated).mainComplete,true);assert.equal(finishAdventure(migrated),false);
 assert.equal(getSummary(validateProgress(migrated)).xp,getSummary(migrated).xp);
});

test('cosmetics unlock through levels or quests, survive migration, and reject invented choices',()=>{
 const state=createProgress();assert.equal(equipCosmetic(state,'outfit','plum'),false);assert.equal(equipCosmetic(state,'wallet','gold'),false);
 assert.equal(equipCosmetic(state,'outfit','invented'),false);
 for(const p of LOCATIONS)discover(state,p.id);
 assert.equal(equipCosmetic(state,'outfit','plum'),true);assert.equal(equipCosmetic(state,'outfit','cat'),false);
 for(let i=0;i<6;i++)advanceCat(state);
 assert.equal(equipCosmetic(state,'outfit','cat'),true);
 assert.equal(validateProgress(state).cosmetics.outfit,'cat');
 assert.equal(validateProgress({version:2,cosmetics:{outfit:'cat',deck:'cosmo'}}).cosmetics.outfit,'classic');
});

test('new mixer, camera, photo and day-cycle preferences validate without losing other progress',()=>{
 const state=validateProgress({version:2,visited:['hbll'],settings:{musicVolume:-10,ambienceVolume:7,effectsVolume:'no',voiceVolume:0,cycle:true,invertY:true,captions:false,cameraDistance:100,sensitivity:.1,photoFrame:'cinema'}});
 assert.equal(state.settings.musicVolume,0);assert.equal(state.settings.ambienceVolume,1);assert.equal(state.settings.effectsVolume,.7);assert.equal(state.settings.voiceVolume,0);
 assert.equal(state.settings.cameraDistance,2);assert.equal(state.settings.sensitivity,.5);assert.equal(state.settings.photoFrame,'cinema');assert.equal(state.settings.captions,false);assert.deepEqual(state.visited,['hbll']);
 assert.equal(getAchievements(state).find(a=>a.id==='first-steps').complete,true);
 assert.equal(getAchievements(state).find(a=>a.id==='story').complete,false);
});

test('content has stable unique identities and complete finite quest geometry', () => {
  assert.equal(LOCATIONS.length, 24);
  assert.equal(CAT_TRAIL.length, 6);
  assert.equal(COSMO_SPOTS.length, 3);
  assert.equal(SECRETS.length, 12);
  assert.equal(TRIALS.length, 3);
  assert.equal(QUESTS.filter(quest => quest.id !== 'main').length, 6);
  assert.equal(UNIT, .044571444392204285);
  for (const list of [LOCATIONS, CAT_TRAIL, COSMO_SPOTS, SECRETS, TRIALS, QUESTS, LOST_ITEMS, TUNE_NOTES, PHOTO_SPOTS]) assert.equal(new Set(list.map(value => value.id)).size, list.length);
  for (const anchor of [SPAWN, SCOOTER_STAND, ...LOCATIONS, ...CAT_TRAIL, ...COSMO_SPOTS, ...SECRETS, ...LOST_ITEMS, ...TUNE_NOTES, ...PHOTO_SPOTS, ...TRIALS.flatMap(trial => trial.points)]) assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.z));
});

test('outdoor gameplay anchors do not reuse rooftop pins or enter source building bounds', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/campus/coordinates.json', import.meta.url), 'utf8'));
  const buildings = catalog.features.filter(feature => ['campus_building', 'campus_structure'].includes(feature.category) && feature.status === 'modeled');
  const points = [SPAWN, SCOOTER_STAND, ...LOCATIONS, ...CAT_TRAIL, ...COSMO_SPOTS, ...SECRETS, ...LOST_ITEMS, ...TUNE_NOTES, ...PHOTO_SPOTS, ...TRIALS.flatMap(trial => trial.points)];
  for (const point of points) {
    const blocked = buildings.find(feature => point.x >= feature.bounds.min[0] - .04 && point.x <= feature.bounds.max[0] + .04 && point.z >= feature.bounds.min[2] - .04 && point.z <= feature.bounds.max[2] + .04);
    assert.equal(blocked, undefined, `${point.id ?? 'spawn/stand'} is inside ${blocked?.name}`);
  }
  for (const location of LOCATIONS) assert.ok(catalog.features.some(feature => feature.code === location.code && feature.status === 'modeled'), `Missing modeled source for ${location.id}`);
});
