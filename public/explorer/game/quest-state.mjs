import {SPAWN, LOCATIONS, MAIN_CHAPTERS, FRAGMENTS, CAT_TRAIL, COSMO_SPOTS, LOST_ITEMS, TUNE_NOTES, PHOTO_SPOTS, QUESTS} from './content.mjs?v=20261102polish6';
import {activityTarget, activityStatus} from './activities.mjs?v=20261102polish6';
import {campusActivityTarget,campusActivityStatus} from './campus-state.mjs?v=20261102polish6';

export function questTarget(progress, selected = 'main') {
  if (selected.startsWith('campus:')) return campusActivityTarget(progress.campusActivities, selected.slice(7));
  if (selected.startsWith('activity:')) return activityTarget(progress.campusLife, selected.slice(9));
  if (selected === 'free' || progress.quests.includes(selected)) return null;
  const owner = {x: SPAWN.x - .15, z: SPAWN.z + .12};
  if (selected === 'cat') return CAT_TRAIL[progress.catStep];
  if (selected === 'cosmo') return COSMO_SPOTS[progress.cosmoStep];
  if (selected === 'delivery') return progress.deliveryStarted ? LOCATIONS.find(l => l.id === 'eb') : owner;
  if (selected === 'lost-found') return LOST_ITEMS.find(i => !progress.items.includes(i.id)) || owner;
  if (selected === 'music') return TUNE_NOTES.find(i => !progress.notes.includes(i.id)) || TUNE_NOTES.at(-1);
  if (selected === 'photo') return PHOTO_SPOTS.find(i => !progress.photos.includes(i.id));
  const chapter = MAIN_CHAPTERS.find(c => !progress.fragments.includes(c.id));
  return chapter ? LOCATIONS.find(l => chapter.locations.includes(l.id) && !progress.visited.includes(l.id)) || FRAGMENTS.find(f => f.id === chapter.id) : SPAWN;
}

export function questStatus(progress, selected = 'main') {
  if (selected.startsWith('campus:')) return campusActivityStatus(progress.campusActivities, selected.slice(7));
  if (selected.startsWith('activity:')) return activityStatus(progress.campusLife, selected.slice(9));
  const target = questTarget(progress, selected), title = QUESTS.find(q => q.id === selected)?.title || 'Free roam';
  if (!target) return {title, text: selected === 'free' ? 'Explore campus' : 'Quest complete', value: 1, total: 1};
  if (selected === 'main') {
    const chapter = MAIN_CHAPTERS.find(c => !progress.fragments.includes(c.id));
    return {title: chapter?.title || 'The way back', text: chapter ? target.number ? 'Collect the glowing page' : 'Discover ' + target.name : 'Return to the departure board', value: progress.fragments.length, total: 4};
  }
  if (selected === 'cat') return {title, text: CAT_TRAIL[progress.catStep].hint, value: progress.catStep, total: CAT_TRAIL.length};
  if (selected === 'cosmo') return {title, text: COSMO_SPOTS[progress.cosmoStep].hint, value: progress.cosmoStep, total: COSMO_SPOTS.length};
  if (selected === 'delivery') return {title, text: progress.deliveryStarted ? 'Deliver the notebook to Engineering' : 'Meet the student by the departure board', value: progress.deliveryStep, total: 2};
  if (selected === 'lost-found') return {title, text: target.name ? 'Find the ' + target.name.toLowerCase() : 'Return the belongings to their owner', value: progress.items.length, total: LOST_ITEMS.length + 1};
  if (selected === 'music') return {title, text: progress.notes.length === TUNE_NOTES.length ? 'Play the melody at the Music Building' : 'Find the ' + target.name.toLowerCase(), value: progress.notes.length, total: TUNE_NOTES.length + 1};
  return {title, text: 'Photograph the ' + target.name.replace(' postcard', ''), value: progress.photos.length, total: PHOTO_SPOTS.length};
}
