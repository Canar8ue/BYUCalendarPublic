import {SPAWN, LOCATIONS, CAT_TRAIL, COSMO_SPOTS, SECRETS, TRIALS, QUESTS, MAIN_CHAPTERS, LOST_ITEMS, TUNE_NOTES, PHOTO_SPOTS, OUTFITS, DECKS} from './content.mjs?v=20261102polish6';
import {medalFor, validateGhost} from './racing.mjs?v=20261102polish6';
import {ACTIVITIES, ACTIVITY_REWARDS} from './district-content.mjs?v=20261102polish6';
import {createCampusLife, validateCampusLife} from './activities.mjs?v=20261102polish6';
import {CAMPUS_ACTIVITIES} from './campus-content.mjs?v=20261102polish6';
import {createCampusActivities,validateCampusActivities,completedCampusRewards} from './campus-state.mjs?v=20261102polish6';
import {HIKE_REWARDS,createHikeState,validateHikeState,completedHikeRewards} from './hike-state.mjs?v=20261102polish6';

export const SAVE_KEY = 'byucalendar-explorer-v1';
export const LEVEL_THRESHOLDS = Object.freeze([0, 50, 120, 220, 350, 500, 700, 950, 1250, 1600]);
const ids = values => new Set(values.map(value => value.id));
const locations = ids(LOCATIONS), secrets = ids(SECRETS), trials = ids(TRIALS), quests = ids(QUESTS);
const itemIds = ids(LOST_ITEMS), noteIds = ids(TUNE_NOTES), photoIds = ids(PHOTO_SPOTS);
const rewards = new Map([
  ...LOCATIONS.map(value => [`visit:${value.id}`, 10]),
  ...CAT_TRAIL.map((_, index) => [`cat:step:${index + 1}`, 10]),
  ...COSMO_SPOTS.map((_, index) => [`cosmo:sighting:${index + 1}`, 15]),
  ...SECRETS.map(value => [`secret:${value.id}`, 15]),
  ...TRIALS.map(value => [`trial:${value.id}`, 30]),
  ...TRIALS.flatMap(value => [[`silver:${value.id}`, 15], [`gold:${value.id}`, 30]]),
  ...QUESTS.map(value => [`quest:${value.id}`, value.xp]),
  ...MAIN_CHAPTERS.map(value => [`chapter:${value.id}`, value.xp]),
  ...ACTIVITY_REWARDS.map(value => [value.id, value.xp]),
  ...CAMPUS_ACTIVITIES.map(value => ['campus:' + value.id, value.xp]),
  ...HIKE_REWARDS.map(value => [value.id, value.xp]),
]);
const uniqueKnown = (values, allowed) => Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string' && allowed.has(value)))] : [];
const count = (value, maximum) => Number.isInteger(value) ? Math.min(maximum, Math.max(0, value)) : 0;
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function createProgress() {
  return {version: 2, claims: {}, visited: [], fragments: [], introSeen: false, trackedQuest:'main', finaleSeen: false, catStep: 0, cosmoStep: 0, deliveryStep: 0, deliveryStarted: false, quests: [], secrets: [], items: [], notes: [], photos: [], bestTimes: {}, bestRuns: {}, campusLife:createCampusLife(), campusActivities:createCampusActivities(), hike:createHikeState(), cosmetics:{outfit:'classic',deck:'classic'}, settings: {music: true, volume: .55, musicVolume:.55, ambienceVolume:.5, effectsVolume:.7, voiceVolume:.85, quality: 'auto', reducedMotion: false, time: 'sunset', cycle:false, routeHints:true, showGhost:true, sensitivity:1, cameraDistance:1, invertY:false, captions:true, photoFrame:'postcard'}, checkpoint: {...SPAWN}};
}

export function claimReward(state, id, xp) {
  const expected = rewards.get(id);
  if (!expected || xp !== expected || Object.hasOwn(state.claims, id)) return false;
  state.claims[id] = expected;
  return true;
}

function syncMain(state) {
  for (const chapter of MAIN_CHAPTERS) {
    if (!state.fragments.includes(chapter.id)) break;
    claimReward(state, `chapter:${chapter.id}`, chapter.xp);
  }
}

export function recoverFragment(state,id) {
  const chapter=MAIN_CHAPTERS.find(c=>!state.fragments.includes(c.id));
  if(!chapter||chapter.id!==id||!chapter.locations.every(location=>state.visited.includes(location)))return false;
  state.fragments.push(id);syncMain(state);return true;
}
export function finishAdventure(state) {
  if(state.fragments.length!==MAIN_CHAPTERS.length||state.quests.includes('main'))return false;
  state.finaleSeen=true;return completeQuest(state,'main');
}
export function cosmeticUnlocked(state,choice) {
  return !!choice&&(!choice.level||getLevel(state)>=choice.level)&&(!choice.quest||state.quests.includes(choice.quest))&&(!choice.activity||state.campusLife?.completed.includes(choice.activity))&&(!choice.gold||TRIALS.filter(t=>medalFor(state.bestTimes[t.id],t.targetSeconds)==='gold').length>=choice.gold);
}
export function equipCosmetic(state,kind,id) {
  const choices=kind==='outfit'?OUTFITS:kind==='deck'?DECKS:[];
  if(!cosmeticUnlocked(state,choices.find(c=>c.id===id)))return false;
  state.cosmetics[kind]=id;return true;
}
export function getAchievements(state) {
  return [
    ['first-steps','A good wrong turn','Discover your first landmark',state.visited.length,1],
    ['field-guide','Campus regular','Discover twelve landmarks',state.visited.length,12],
    ['all-places','Every corner has a story','Stamp all 24 places',state.visited.length,24],
    ['cat-person','Chosen by the cat','Finish Paws and Effect',state.catStep,CAT_TRAIL.length],
    ['cougar','Three cheers','Find every Cosmo cameo',state.cosmoStep,COSMO_SPOTS.length],
    ['postmaster','Wish you were here','Capture all three compositions',state.photos.length,PHOTO_SPOTS.length],
    ['collector','Keeper of small things','Find twelve secret postcards',state.secrets.length,SECRETS.length],
    ['rider','The long way, faster','Finish every scooter trial',TRIALS.filter(t=>state.bestTimes[t.id]).length,TRIALS.length],
    ['gold-rider','A very smooth line','Earn gold on all three routes',TRIALS.filter(t=>state.bestTimes[t.id]&&state.bestTimes[t.id]<=t.targetSeconds).length,TRIALS.length],
    ['story','Adventure complete','Recover all four pages and return to the departure board',state.quests.includes('main')?1:0,1],
    ['stories','No story left behind','Finish all seven adventures',state.quests.length,QUESTS.length],
  ].map(([id,title,description,value,target])=>({id,title,description,value:Math.min(value,target),target,complete:value>=target}));
}

export function discover(state, id) {
  if (!locations.has(id) || state.visited.includes(id)) return false;
  state.visited.push(id);
  claimReward(state, `visit:${id}`, 10);
  syncMain(state);
  return true;
}

export function completeQuest(state, id) {
  const quest = QUESTS.find(value => value.id === id);
  if (!quest || state.quests.includes(id)) return false;
  state.quests.push(id);
  if (id === 'delivery') {state.deliveryStep = 2; state.deliveryStarted = true;}
  claimReward(state, `quest:${id}`, quest.xp);
  return true;
}

export function advanceCat(state) {
  if (state.catStep >= CAT_TRAIL.length) return false;
  state.catStep += 1;
  claimReward(state, `cat:step:${state.catStep}`, 10);
  if (state.catStep === CAT_TRAIL.length) completeQuest(state, 'cat');
  return true;
}

export function findCosmo(state) {
  if (state.cosmoStep >= COSMO_SPOTS.length) return false;
  state.cosmoStep += 1;
  claimReward(state, `cosmo:sighting:${state.cosmoStep}`, 15);
  if (state.cosmoStep === COSMO_SPOTS.length) completeQuest(state, 'cosmo');
  return true;
}

export function collectSecret(state, id) {
  if (!secrets.has(id) || state.secrets.includes(id)) return false;
  state.secrets.push(id);
  claimReward(state, `secret:${id}`, 15);
  return true;
}

export function recordTrial(state, id, seconds, ghost) {
  if (!trials.has(id) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return false;
  state.bestRuns ||= {};
  if (!state.bestTimes[id] || seconds < state.bestTimes[id]) {
    state.bestTimes[id] = seconds;
    const valid = validateGhost(ghost, seconds);
    if (valid) state.bestRuns[id] = valid;
    else delete state.bestRuns[id];
  }
  claimReward(state, `trial:${id}`, 30);
  const medal=medalFor(seconds,TRIALS.find(t=>t.id===id).targetSeconds);
  if(medal==='silver'||medal==='gold')claimReward(state,`silver:${id}`,15);
  if(medal==='gold')claimReward(state,`gold:${id}`,30);
  return true;
}

export function collectQuestItem(state, kind, id) {
  const table = {items: itemIds, notes: noteIds, photos: photoIds};
  if (!table[kind]?.has(id) || state[kind].includes(id)) return false;
  state[kind].push(id);
  // Found belongings must still be returned to their owner.
  // The collected notes unlock the puzzle; its solved action awards the quest.
  if (state.photos.length === PHOTO_SPOTS.length) completeQuest(state, 'photo');
  return true;
}

export function getLevel(state) {
  const xp = Object.values(state.claims).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  return LEVEL_THRESHOLDS.filter(threshold => xp >= threshold).length;
}

export function getSummary(state) {
  const xp = Object.values(state.claims).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const level = getLevel(state);
  const chapterIndex = MAIN_CHAPTERS.findIndex(chapter => !state.fragments.includes(chapter.id));
  const complete = chapterIndex === -1;
  const mainComplete=state.quests.includes('main');
  return {xp, level, nextLevelXp: LEVEL_THRESHOLDS[level] ?? null, levelStartXp: LEVEL_THRESHOLDS[level - 1], visitedCount: state.visited.length, totalLocations: LOCATIONS.length, completedQuests: state.quests.length, totalQuests: QUESTS.length, catStep: state.catStep, cosmoStep: state.cosmoStep, deliveryStep: state.deliveryStep, itemCount: state.items.length, totalItems: LOST_ITEMS.length, noteCount: state.notes.length, totalNotes: TUNE_NOTES.length, photoCount: state.photos.length, totalPhotos: PHOTO_SPOTS.length, fragments:state.fragments.length, mainChapter: complete ? MAIN_CHAPTERS.length : chapterIndex + 1, mainTitle: mainComplete ? 'Adventure complete' : complete?'The way back':MAIN_CHAPTERS[chapterIndex].title, mainObjective: mainComplete ? 'All four pages recovered.' : complete?'Bring the four fragments to the departure board where you started.':MAIN_CHAPTERS[chapterIndex].locations.every(id=>state.visited.includes(id))?'Recover the glowing page fragment at '+LOCATIONS.find(l=>l.id===MAIN_CHAPTERS[chapterIndex].locations.at(-1)).name+'.':MAIN_CHAPTERS[chapterIndex].objective, mainComplete, percent: Math.round((state.visited.length + state.quests.length + state.secrets.length + Object.keys(state.bestTimes).length) / (LOCATIONS.length + QUESTS.length + SECRETS.length+TRIALS.length) * 100), unlocked: [...(level >= 2 ? ['sunset-deck'] : []), ...(state.quests.includes('cat') ? ['cat-sticker'] : []), ...(state.quests.includes('cosmo') ? ['cosmo-wave'] : []), ...(state.quests.includes('photo') ? ['golden-frame'] : []), ...(state.quests.includes('music') ? ['evening-melody'] : [])]};
}

// Version zero is the development-preview format. Preserve supported progress
// through this migration, but never trust a legacy aggregate XP counter.
export function validateProgress(raw) {
  const state = createProgress();
  if (!object(raw) || ![0,1,2].includes(raw.version)) return state;
  state.visited = uniqueKnown(raw.visited, locations);
  state.quests = uniqueKnown(raw.quests, quests);
  state.secrets = uniqueKnown(raw.secrets, secrets);
  state.items = uniqueKnown(raw.items, itemIds);
  state.notes = uniqueKnown(raw.notes, noteIds);
  state.photos = uniqueKnown(raw.photos, photoIds);
  state.campusLife = validateCampusLife(raw.campusLife);
  state.campusActivities = validateCampusActivities(raw.campusActivities);
  state.hike = validateHikeState(raw.hike);
  state.catStep = count(raw.catStep, CAT_TRAIL.length);
  state.cosmoStep = count(raw.cosmoStep, COSMO_SPOTS.length);
  state.deliveryStep = count(raw.deliveryStep, 2);
  if (raw.deliveryStarted === true) state.deliveryStep = Math.max(1, state.deliveryStep);
  if (state.quests.includes('delivery')) state.deliveryStep = 2;
  state.deliveryStarted = state.deliveryStep > 0;
  if (object(raw.claims)) for (const [id, value] of Object.entries(raw.claims)) if (rewards.has(id) && value === rewards.get(id) && (!id.startsWith('campus:') || state.campusActivities.completed.includes(id.slice(7)))) state.claims[id] = value;
  state.fragments=uniqueKnown(raw.fragments,ids(MAIN_CHAPTERS));
  if(raw.version<2)state.fragments=MAIN_CHAPTERS.filter(c=>Object.hasOwn(state.claims,'chapter:'+c.id)).map(c=>c.id);
  state.trackedQuest=raw.trackedQuest==='free'||quests.has(raw.trackedQuest)||ACTIVITIES.some(a=>'activity:'+a.id===raw.trackedQuest)||CAMPUS_ACTIVITIES.some(a=>'campus:'+a.id===raw.trackedQuest)?raw.trackedQuest:'main';
  state.introSeen=raw.introSeen===true||raw.version<2&&state.visited.length>0;
  state.finaleSeen=raw.finaleSeen===true||state.quests.includes('main');
  for (const id of state.visited) claimReward(state, `visit:${id}`, 10);
  for (const id of state.secrets) claimReward(state, `secret:${id}`, 15);
  for (const id of state.quests) claimReward(state, `quest:${id}`, QUESTS.find(quest => quest.id === id).xp);
  for (const reward of ACTIVITY_REWARDS) if (state.campusLife.completed.includes(reward.id.replace('activity:', ''))) claimReward(state, reward.id, reward.xp);
  for (const reward of completedHikeRewards(state.hike)) claimReward(state, reward.id, reward.xp);
  for (const reward of completedCampusRewards(state.campusActivities)) claimReward(state, reward.id, reward.xp);
  for (let step = 1; step <= state.catStep; step++) claimReward(state, `cat:step:${step}`, 10);
  for (let step = 1; step <= state.cosmoStep; step++) claimReward(state, `cosmo:sighting:${step}`, 15);
  if (state.catStep === CAT_TRAIL.length) completeQuest(state, 'cat');
  if (state.cosmoStep === COSMO_SPOTS.length) completeQuest(state, 'cosmo');
  if (object(raw.bestTimes)) for (const [id, seconds] of Object.entries(raw.bestTimes)) recordTrial(state, id, seconds, raw.bestRuns?.[id]);
  if (object(raw.settings)) {
    if (typeof raw.settings.music === 'boolean') state.settings.music = raw.settings.music;
    if (Number.isFinite(raw.settings.volume)) state.settings.volume = Math.max(0, Math.min(1, raw.settings.volume));
    if (['auto', 'low', 'medium', 'high'].includes(raw.settings.quality)) state.settings.quality = raw.settings.quality;
    if (typeof raw.settings.reducedMotion === 'boolean') state.settings.reducedMotion = raw.settings.reducedMotion;
    if (['day', 'sunset', 'night'].includes(raw.settings.time)) state.settings.time = raw.settings.time;
    for(const key of ['musicVolume','ambienceVolume','effectsVolume','voiceVolume'])if(Number.isFinite(raw.settings[key]))state.settings[key]=Math.max(0,Math.min(1,raw.settings[key]));
    for(const key of ['cycle','invertY','captions','routeHints','showGhost'])if(typeof raw.settings[key]==='boolean')state.settings[key]=raw.settings[key];
    for(const key of ['sensitivity','cameraDistance'])if(Number.isFinite(raw.settings[key]))state.settings[key]=Math.max(.5,Math.min(2,raw.settings[key]));
    if(['postcard','clean','cinema'].includes(raw.settings.photoFrame))state.settings.photoFrame=raw.settings.photoFrame;
  }
  if(object(raw.cosmetics)){equipCosmetic(state,'outfit',raw.cosmetics.outfit);equipCosmetic(state,'deck',raw.cosmetics.deck);}
  if (object(raw.checkpoint) && Number.isFinite(raw.checkpoint.x) && Number.isFinite(raw.checkpoint.z) && raw.checkpoint.x >= -65 && raw.checkpoint.x <= 55 && raw.checkpoint.z >= -80 && raw.checkpoint.z <= 50) state.checkpoint = {x: raw.checkpoint.x, z: raw.checkpoint.z};
  syncMain(state);
  return state;
}

function storageOrDefault(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function loadProgress(storage) {
  try {
    const text = storageOrDefault(storage)?.getItem(SAVE_KEY);
    if (!text || text.length > 100_000) return createProgress();
    return validateProgress(JSON.parse(text));
  } catch {
    return createProgress();
  }
}

export function saveProgress(state, storage) {
  try {
    const target = storageOrDefault(storage);
    if (!target?.setItem) return false;
    target.setItem(SAVE_KEY, JSON.stringify(validateProgress(state)));
    return true;
  } catch {
    return false;
  }
}
