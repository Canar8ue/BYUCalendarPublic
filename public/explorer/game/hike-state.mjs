/** Additive, renderer-free progress for the sourced Y Trail.
 * Route coordinates come from the hiking asset, never an invented switchback.
 * The runtime supplies physical contact and successful photo-capture evidence.
 */
const UNIT = .044571444392204285;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const idValue = value => typeof value === 'string' && /^[a-z0-9][a-z0-9:-]{0,63}$/.test(value);
const unique = (values, allowed) => Array.isArray(values) ? [...new Set(values.slice(0, 128).filter(value => allowed.has(value)))] : [];
const finitePoint = value => !!value && Number.isFinite(value.x) && Number.isFinite(value.z);

export const HIKE_REWARDS = Object.freeze([
  Object.freeze({id:'hike:ascent', xp:80}),
  Object.freeze({id:'hike:cleanup', xp:30}),
  Object.freeze({id:'hike:postcard', xp:30}),
  Object.freeze({id:'hike:descent', xp:40}),
]);

const fallbackCheckpoints = [
  {id:'trailhead', name:'Y Trailhead', kind:'trailhead'},
  ...Array.from({length:12}, (_, i) => ({id:`turn-${i + 1}`, name:`Trail checkpoint ${i + 1}`, kind:'turn'})),
  {id:'summit', name:'Top of the Y', kind:'summit'},
];

export function hikeCheckpoints(route) {
  if (!Array.isArray(route?.checkpoints)) return fallbackCheckpoints;
  const points = route.checkpoints.slice(0, 64).filter(point => object(point) && idValue(point.id));
  if (!points.length || new Set(points.map(point => point.id)).size !== points.length) return [];
  return points;
}

const revisionOf = route => typeof route?.revision === 'string' && route.revision.length <= 80 ? route.revision : null;
const withStoredOrder = (state, route) => route || (Array.isArray(state?.checkpointOrder) && state.checkpointOrder.length > 1 ? {revision:state.terrainRevision, checkpoints:state.checkpointOrder.map(id => ({id,name:fallbackCheckpoints.find(point => point.id === id)?.name || id.replaceAll('-', ' ')}))} : undefined);
const prefix = (values, ordered) => {
  const result = [];
  for (let i = 0; i < ordered.length; i++) {
    if (!values.includes(ordered[i])) break;
    result.push(ordered[i]);
  }
  return result;
};

/** These are explicitly fictional quest props placed along real route anchors. */
export function buildHikeActivities(route) {
  const checkpoints = hikeCheckpoints(route).filter(finitePoint);
  const supplied = (list, type) => Array.isArray(list) ? list.slice(0, 12).filter(point => object(point) && finitePoint(point) && idValue(point.id)).map(point => ({...point, type})) : null;
  const suppliedCleanup = supplied(route?.cleanup, 'cleanup'), suppliedPhotos = supplied(route?.photos, 'photo');
  const anchor = fraction => checkpoints[Math.min(checkpoints.length - 1, Math.max(1, Math.round((checkpoints.length - 1) * fraction)))];
  const cleanup = suppliedCleanup || [.25, .5, .75].map((fraction, i) => ({...(checkpoints.length ? anchor(fraction) : {}), id:`cleanup-${i + 1}`, name:`Fictional cleanup stop ${i + 1}`, type:'cleanup', checkpointId:checkpoints.length ? anchor(fraction).id : null}));
  const photos = suppliedPhotos || [.5, 1].map((fraction, i) => ({...(checkpoints.length ? anchor(fraction) : {}), id:i ? 'summit-view' : 'valley-view', name:i ? 'A postcard from the Y' : 'The valley opens up', type:'photo', checkpointId:checkpoints.length ? anchor(fraction).id : null}));
  return {cleanup, photos};
}

export function createHikeState(route) {
  return {version:1, terrainRevision:revisionOf(route), checkpointOrder:hikeCheckpoints(route).map(point => point.id), started:false, metCaleb:false, companion:true, reached:[], descent:[], lastCheckpoint:null, cleanup:[], photos:[], summitSeen:false, postcard:false, returned:false, inHike:false};
}

export function validateHikeState(raw, route) {
  const state = createHikeState(route);
  if (!object(raw) || raw.version !== 1) return state;
  if (!route && Array.isArray(raw.checkpointOrder) && raw.checkpointOrder.length > 1 && raw.checkpointOrder.length <= 64 && raw.checkpointOrder.every(idValue) && new Set(raw.checkpointOrder).size === raw.checkpointOrder.length) state.checkpointOrder = [...raw.checkpointOrder];
  const effectiveRoute = withStoredOrder(state, route), checkpoints = hikeCheckpoints(effectiveRoute), order = checkpoints.map(point => point.id), allowed = new Set(order), activities = buildHikeActivities(effectiveRoute);
  state.started = raw.started === true;
  state.metCaleb = raw.metCaleb === true;
  state.companion = raw.companion !== false;
  state.reached = state.started ? prefix(unique(raw.reached, allowed), order) : [];
  const summit = order.at(-1), ascended = order.length > 1 && state.reached.length === order.length;
  state.summitSeen = ascended && raw.summitSeen === true;
  state.descent = state.summitSeen ? prefix(unique(raw.descent, allowed), order.slice(0, -1).reverse()) : [];
  state.cleanup = state.started ? unique(raw.cleanup, new Set(activities.cleanup.map(point => point.id))) : [];
  state.photos = state.started ? unique(raw.photos, new Set(activities.photos.map(point => point.id))) : [];
  if (!state.summitSeen) state.photos = state.photos.filter(id => id !== activities.photos.at(-1)?.id);
  state.postcard = state.summitSeen && state.photos.includes(activities.photos.at(-1)?.id);
  state.returned = state.summitSeen && state.descent.length === order.length - 1 && raw.returned === true;
  const storedRevision = typeof raw.terrainRevision === 'string' && raw.terrainRevision.length <= 80 ? raw.terrainRevision : null;
  // With no streamed route yet, retain bounded known IDs but never use a saved
  // coordinate as ground. Once the current route arrives, a revision mismatch
  // clears the unsafe location while keeping supported story completion.
  const revisionMatches = !route || storedRevision === state.terrainRevision;
  if (!route) state.terrainRevision = storedRevision;
  state.lastCheckpoint = revisionMatches && state.reached.includes(raw.lastCheckpoint) ? raw.lastCheckpoint : null;
  state.inHike = revisionMatches && !!state.lastCheckpoint && raw.inHike === true;
  // Do not infer summit attendance from a free-form completed/reward ledger.
  if (!summit) state.inHike = false;
  return state;
}

export function completedHikeRewards(state, route) {
  const effectiveRoute = withStoredOrder(state, route), order = hikeCheckpoints(effectiveRoute), activities = buildHikeActivities(effectiveRoute);
  const flags = [order.length > 1 && state.reached?.length === order.length, activities.cleanup.length > 0 && activities.cleanup.every(point => state.cleanup?.includes(point.id)), state.postcard === true, state.returned === true];
  return HIKE_REWARDS.filter((_, i) => flags[i]);
}

function near(context, point, meters = 4) {
  if (!finitePoint(context.position) || !finitePoint(point) || context.riding === true || context.grounded !== true) return false;
  if (Math.hypot(context.position.x - point.x, context.position.z - point.z) > meters * UNIT) return false;
  return !Number.isFinite(point.y) || Number.isFinite(context.position.y) && Math.abs(context.position.y - point.y) < 3 * UNIT;
}

function checkpointDistance(point, route) {
  if (Number.isFinite(point?.distanceMeters)) return point.distanceMeters;
  const samples = route?.points || route?.route;
  return Number.isInteger(point?.pointIndex) && Number.isFinite(samples?.[point.pointIndex]?.distanceMeters) ? samples[point.pointIndex].distanceMeters : null;
}

/** Proximity alone cannot complete a segment after an assisted resume. */
export function walkedHikeSegment(context, from, to, route) {
  if (!from || !to || context.assisted === true || context.fromCheckpoint !== from.id || !Number.isFinite(context.walkedMeters) || context.walkedMeters < 0 || context.walkedMeters > 1e6) return false;
  const a = checkpointDistance(from,route), b = checkpointDistance(to,route);
  const length = a !== null && b !== null ? Math.abs(b - a) : finitePoint(from) && finitePoint(to) ? Math.hypot(to.x - from.x,to.z - from.z) / UNIT : null;
  return length !== null && length > 0 && context.walkedMeters >= Math.max(.5,length * .8);
}

const unchanged = message => ({changed:false, message, rewards:[]});

export function applyHikeAction(state, action, context = {}, route) {
  if (!object(state) || state.version !== 1 || typeof action !== 'string' || !object(context)) return unchanged('No hiking action.');
  const checkpoints = hikeCheckpoints(route), order = checkpoints.map(point => point.id), trailhead = checkpoints[0], summit = checkpoints.at(-1), activities = buildHikeActivities(route);
  const before = completedHikeRewards(state, route).map(reward => reward.id);
  const changed = (message, extra = {}) => ({changed:true, message, rewards:completedHikeRewards(state, route).filter(reward => !before.includes(reward.id)), ...extra});
  if (action === 'decline') return unchanged('The trail will be here when you are ready.');
  if (action === 'start') {
    if (checkpoints.length < 2 || !near(context, trailhead, 8)) return unchanged('Park the scooter and meet Caleb on foot at the trailhead.');
    const fresh = !state.started;
    state.started = true;state.metCaleb = true;state.inHike = true;state.terrainRevision = revisionOf(route);state.checkpointOrder = [...order];state.lastCheckpoint = trailhead.id;
    if (!state.reached.length) state.reached.push(trailhead.id);
    return changed(fresh ? 'Caleb: One bend at a time. Let’s follow the trail, and leave the hillside as we found it.' : 'Caleb: Good to see you again. Your unlocked trail checkpoints are still in the journal.');
  }
  if (action === 'leave-hike') {
    if (!state.inHike) return unchanged('You are already back on campus.');
    state.inHike = false;
    return changed('Assisted return to campus. Your hike progress is saved; a walked descent remains available.', {travel:'campus'});
  }
  if (action === 'companion:on' || action === 'companion:off') {
    const enabled = action === 'companion:on';
    if (state.companion === enabled) return unchanged(enabled ? 'Caleb is joining you.' : 'Caleb will wait nearby.');
    state.companion = enabled;return changed(enabled ? 'Caleb: I’ll keep you company.' : 'Caleb: Take your time. I’ll see you at the next stop.');
  }
  if (!state.started) return unchanged('Meet Caleb at the trailhead first.');
  if (action.startsWith('resume:')) {
    const id = action.slice(7), point = checkpoints.find(value => value.id === id);
    if (!point || !state.reached.includes(id) || !finitePoint(point) || context.routeLoaded !== true || state.terrainRevision !== revisionOf(route)) return unchanged('Walk to that checkpoint before using assisted resume.');
    state.inHike = true;state.lastCheckpoint = id;
    return changed('Assisted resume at '+point.name+'. The real trail is unchanged.', {travel:'checkpoint', checkpoint:id});
  }
  if (action.startsWith('visit:') || action.startsWith('checkpoint:')) {
    const id = action.slice(action.indexOf(':') + 1), point = checkpoints.find(value => value.id === id);
    if (!state.inHike || !point || !near(context, point)) return unchanged('Reach the checkpoint on foot to mark it.');
    let updated = false;
    const ascentNext = order[state.reached.length] === id;
    if (ascentNext) {
      const previous = checkpoints[state.reached.length - 1];
      if (!walkedHikeSegment(context,previous,point,route)) return unchanged('Walk the complete segment from the preceding checkpoint.');
      state.reached.push(id);updated = true;
    }
    // Descent has its own ordered evidence. Assisted travel cannot advance it.
    const descending = order.slice(0, -1).reverse();
    if (state.summitSeen && descending[state.descent.length] === id) {
      const previousId = state.descent.at(-1) || summit.id, previous = checkpoints.find(value => value.id === previousId);
      if (!walkedHikeSegment(context,previous,point,route)) return unchanged('Continue the walked descent from its preceding checkpoint. Assisted resume does not complete a trail segment.');
      state.descent.push(id);updated = true;
    }
    if (!state.reached.includes(id)) return unchanged('Stay on the trail and reach the preceding checkpoint first.');
    if (state.lastCheckpoint !== id) {state.lastCheckpoint = id;updated = true;}
    return updated ? changed(point.name+' reached. This checkpoint can be resumed from the journal.') : unchanged('This checkpoint is already in your journal.');
  }
  if (action === 'summit') {
    if (!state.inHike || state.reached.length !== order.length || !near(context, summit, 8)) return unchanged('Follow the complete ascent to the top of the Y.');
    if (state.summitSeen) return unchanged('Caleb: Same valley, a different light. Take all the time you want.');
    state.summitSeen = true;state.lastCheckpoint = summit.id;
    return changed('Caleb: There it is—the whole valley. A quiet moment is a good souvenir. Take a postcard, then follow the same trail down.');
  }
  if (action.startsWith('cleanup:')) {
    const id = action.slice(8), point = activities.cleanup.find(value => value.id === id);
    if (!state.inHike || !point || state.cleanup.includes(id) || !near(context, point)) return unchanged('Find an uncollected fictional cleanup prop beside the trail.');
    state.cleanup.push(id);
    return changed(state.cleanup.length === activities.cleanup.length ? 'Caleb: All our fictional cleanup props are packed out. Thanks for caring for this place.' : 'Fictional cleanup prop packed out. Leave the real hillside as you found it.');
  }
  if (action.startsWith('photo:')) {
    const id = action.slice(6), point = activities.photos.find(value => value.id === id);
    if (!state.inHike || !point || state.photos.includes(id) || !near(context, point, 7) || context.photoCaptured !== true) return unchanged('Use Photo mode at the viewpoint to capture this composition.');
    if (point === activities.photos.at(-1) && !state.summitSeen) return unchanged('Talk to Caleb at the top before taking your upper-Y postcard.');
    state.photos.push(id);
    if (point === activities.photos.at(-1)) state.postcard = true;
    return changed(state.postcard ? 'A postcard from the Y. Your photograph is the souvenir.' : 'The valley photograph joins your hiking journal.');
  }
  if (action === 'return') {
    if (!state.inHike || !state.summitSeen || state.descent.length !== order.length - 1 || !near(context, trailhead, 8)) return unchanged('Walk the trail’s checkpoints in reverse order to complete the descent. Assisted return is always available.');
    if (state.returned) return unchanged('Caleb: A climb, a way down, and a new story. Welcome back.');
    state.returned = true;
    return changed('Caleb: Back where we started, with a different view of things. Ascent and descent complete.');
  }
  return unchanged('That hiking step is not available here yet.');
}

export function hikeStatus(state, route) {
  const effectiveRoute = withStoredOrder(state, route), checkpoints = hikeCheckpoints(effectiveRoute), activities = buildHikeActivities(effectiveRoute);
  const next = !state.started ? checkpoints[0] : state.reached.length < checkpoints.length ? checkpoints[state.reached.length] : !state.summitSeen ? checkpoints.at(-1) : state.descent.length < checkpoints.length - 1 ? checkpoints.slice(0, -1).reverse()[state.descent.length] : state.returned ? null : checkpoints[0];
  const text = !state.started ? 'Meet Caleb on foot at the Y Trailhead.' : state.returned ? 'The complete ascent and descent are in your journal.' : state.reached.length < checkpoints.length ? `Follow the trail to ${next?.name || 'the next checkpoint'}.` : !state.summitSeen ? 'Talk to Caleb at the top of the Y.' : state.descent.length < checkpoints.length - 1 ? `Follow the descent to ${next?.name || 'the trailhead'}.` : 'Talk to Caleb back at the trailhead.';
  return {title:'Y Trail',text,next,target:next,value:state.reached.length,started:state.started,complete:state.returned,ascent:state.reached.length,total:checkpoints.length,descent:state.descent.length,cleanup:state.cleanup.length,cleanupTotal:activities.cleanup.length,photos:state.photos.length,photoTotal:activities.photos.length};
}

export function hikeObjectives(state, route) {
  const status = hikeStatus(state, route), activities = buildHikeActivities(route);
  return [
    {id:'hike', title:status.title, text:status.text, complete:state.returned, value:state.reached.length + state.descent.length, total:Math.max(1, status.total * 2 - 1)},
    {id:'hike-cleanup', title:'Leave it better', text:'Optional fictional cleanup props beside the trail.', complete:activities.cleanup.length > 0 && state.cleanup.length === activities.cleanup.length, value:state.cleanup.length, total:activities.cleanup.length},
    {id:'hike-postcard', title:'A postcard from the Y', text:'Optional viewpoint photographs and an upper-Y postcard.', complete:state.postcard, value:state.photos.length, total:activities.photos.length},
  ];
}

export function calebConversation(state, checkpoint, route) {
  const checkpoints = hikeCheckpoints(route), index = checkpoints.findIndex(point => point.id === checkpoint);
  if (index === 0) return state.returned ? 'A climb, a way down, and a new story. I think that’s a good afternoon.' : state.summitSeen ? 'Almost home. The trailhead feels different when you’ve seen it from up there.' : 'I’m Caleb. I like a walk with room for a conversation. Park your scooter here; we’ll follow the trail on foot.';
  if (index === checkpoints.length - 1) return state.summitSeen ? 'There’s no timer for this view. A photograph, a long breath, and then the same trail home.' : 'There it is—the whole valley. Look how the familiar campus has become one small part of the picture.';
  const lines = [
    'At a bend I look back for a second. A small stretch of trail can hold a surprising amount of progress.',
    'We can stop whenever you want. I’m collecting moments today, not a fastest time.',
    'The next bend is enough to think about. The summit will still be there when we get to it.',
    'I like how the view changes before you notice you’ve climbed. Same valley, a little more sky.',
    'Those cleanup props are part of our story. Out here, caring for a place starts with what we bring in and take home.',
    'A photo is a good souvenir. We can leave the hillside exactly where it is.',
  ];
  return lines[Math.max(0, index - 1) % lines.length];
}
