import {UNIT} from './content.mjs?v=20261102polish6';
import {CAMPUS_ACTIVITIES, CAMPUS_NPCS, CAMPUS_DISTRICTS} from './campus-content.mjs?v=20261102polish6';

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finitePoint = point => object(point) && Number.isFinite(point.x) && Number.isFinite(point.z);
const nearby = (a, b, radius = 4 * UNIT) => finitePoint(a) && finitePoint(b) && Math.hypot(a.x - b.x, a.z - b.z) <= radius;
const activityById = id => CAMPUS_ACTIVITIES.find(activity => activity.id === id);
const personById = id => CAMPUS_NPCS.find(person => person.id === id);
const recordFor = (state, id) => object(state?.activities) && Object.hasOwn(state.activities, id) ? state.activities[id] : null;
const unchanged = message => ({changed: false, message});
const safeSeconds = step => Math.max(3, Number.isFinite(step?.seconds) ? step.seconds : 3);

function validReceipts(record, activity, full = false) {
  return record?.started === true && Array.isArray(record.steps) && object(record.answers) &&
    (full ? record.steps.length === activity.steps.length : record.steps.length <= activity.steps.length) &&
    activity.steps.slice(0, record.steps.length).every((step, index) => {
      return record.steps[index] === step.id && (step.type !== 'choice' || step.choices?.some(choice => choice.correct === true && record.answers[step.id] === choice.id));
    });
}

function supportedCompletion(state, activity) {
  const record = recordFor(state, activity.id);
  return record?.finished === true && validReceipts(record, activity, true);
}

function requirementsMet(state, activity) {
  return (activity.requires || []).every(id => {
    const dependency = activityById(id);
    return dependency && supportedCompletion(state, dependency);
  });
}

export function createCampusActivities() {
  return {
    version: 1, met: [], talks: {}, completed: [],
    activities: Object.fromEntries(CAMPUS_ACTIVITIES.map(activity => [activity.id, {started: false, steps: [], answers: {}, finished: false}])),
  };
}

// Save receipts are ordered, known steps. An imported completion list, an
// unsupported final flag or a skipped puzzle cannot award a story reward.
export function validateCampusActivities(raw) {
  const state = createCampusActivities();
  if (!object(raw) || raw.version !== 1) return state;
  const people = CAMPUS_NPCS.map(person => person.id);
  state.met = Array.isArray(raw.met) ? [...new Set(raw.met.filter(id => people.includes(id)))] : [];
  if (object(raw.talks)) for (const id of people) {
    const count = raw.talks[id];
    if (Number.isInteger(count) && count > 0) state.talks[id] = Math.min(count, 99);
  }
  for (const activity of CAMPUS_ACTIVITIES) {
    const input = recordFor(raw, activity.id), record = state.activities[activity.id];
    if (!object(input) || input.started !== true) continue;
    record.started = true;
    for (const [index, step] of activity.steps.entries()) {
      if (!Array.isArray(input.steps) || input.steps[index] !== step.id) break;
      if (step.type === 'choice') {
        const answer = step.choices?.find(choice => choice.correct === true && choice.id === input.answers?.[step.id]);
        if (!answer) break;
        record.answers[step.id] = answer.id;
      }
      record.steps.push(step.id);
    }
    record.finished = input.finished === true && record.steps.length === activity.steps.length;
  }
  // A missing/invalid prerequisite also invalidates downstream work. Iterate
  // to closure so input order cannot rescue an unsupported dependency chain.
  for (let pass = 0; pass < CAMPUS_ACTIVITIES.length; pass++) {
    let reset = false;
    for (const activity of CAMPUS_ACTIVITIES) if (state.activities[activity.id].started && !requirementsMet(state, activity)) {
      state.activities[activity.id] = {started: false, steps: [], answers: {}, finished: false};
      reset = true;
    }
    if (!reset) break;
  }
  state.completed = CAMPUS_ACTIVITIES.filter(activity => supportedCompletion(state, activity)).map(activity => activity.id);
  return state;
}

export function completedCampusRewards(state) {
  return CAMPUS_ACTIVITIES.filter(activity => supportedCompletion(state, activity)).map(activity => ({id: 'campus:' + activity.id, xp: activity.xp, activityId: activity.id}));
}

export function currentCampusStep(state, id) {
  const activity = activityById(id), record = recordFor(state, id);
  if (!activity || !validReceipts(record, activity) || record.finished) return null;
  return activity.steps[record.steps.length] || null;
}

export function campusActivityStatus(state, id) {
  const activity = activityById(id);
  if (!activity) return {title: 'Campus life', text: 'Meet a student at an outdoor stand.', value: 0, total: 1, status: 'available'};
  const record = recordFor(state, id), person = personById(activity.npcId), complete = supportedCompletion(state, activity), unlocked = requirementsMet(state, activity);
  const step = currentCampusStep(state, id), total = activity.steps.length + 2;
  const status = complete ? 'completed' : record?.started ? 'active' : unlocked ? 'available' : 'locked';
  const names = (activity.requires || []).map(dependency => activityById(dependency)?.title || dependency).join(', ');
  const text = complete ? activity.revisit || activity.outcome : !unlocked ? 'First finish ' + names + '.' :
    !record?.started ? 'Meet ' + person.name + ' to begin: ' + activity.description :
      step ? step.label : 'Return to ' + person.name + ' and see what changed.';
  return {title: activity.title, text, status, value: complete ? total : record?.started ? Math.min(total - 1, record.steps.length + 1) : 0, total};
}

export function campusActivityObjectives(state) {
  return CAMPUS_ACTIVITIES.map(activity => {
    const person = personById(activity.npcId), district = CAMPUS_DISTRICTS.find(value => value.id === activity.district);
    return {...campusActivityStatus(state, activity.id), id: activity.id, npcId: person.id, name: person.name, color: person.color,
      description: activity.description, reward: activity.reward || activity.xp + ' XP', district: activity.district,
      districtName: district?.name || activity.district, duration: activity.duration};
  });
}

export function campusActivityTarget(state, id) {
  const activity = activityById(id);
  if (!activity || supportedCompletion(state, activity) || !requirementsMet(state, activity)) return null;
  const person = personById(activity.npcId), step = currentCampusStep(state, id);
  if (!step) return {...person.work, npcId: person.id, activityId: activity.id, label: 'Talk to ' + person.name};
  return {...step.point, ...(step.npcId ? {npcId: step.npcId} : {}), activityId: activity.id, stepId: step.id, label: step.label, type: step.type};
}

export function getCampusConversation(state, npcId) {
  const person = personById(npcId);
  if (!person) return null;
  const owned = CAMPUS_ACTIVITIES.filter(activity => activity.npcId === npcId), choices = [], paragraphs = [];
  const repeat = (state.talks?.[npcId] || 0) > 1;
  paragraphs.push(repeat ? person.repeat || person.greeting : person.greeting);
  for (const activity of owned) {
    const record = recordFor(state, activity.id), status = campusActivityStatus(state, activity.id);
    if (status.status === 'completed') {paragraphs.push(activity.revisit || activity.outcome); continue;}
    if (record?.started) {
      if (record.steps.length === activity.steps.length) {
        paragraphs.push(activity.outcome);
        const action = 'campus:finish:' + activity.id;
        choices.push({id: action, action, label: 'Finish: ' + activity.title});
      } else paragraphs.push(activity.accepted + ' ' + status.text);
      continue;
    }
    const action = 'campus:start:' + activity.id;
    if (status.status !== 'locked') paragraphs.push(activity.offer);
    choices.push({id: action, action, label: 'Begin: ' + activity.title,
      ...(status.status === 'locked' ? {disabled: true, hint: status.text} : {})});
  }
  choices.push({id: 'later', label: 'See you in a bit.', action: 'decline'});
  return {id: 'campus:' + npcId, npcId, name: person.name, role: person.role, color: person.color,
    text: paragraphs.filter(Boolean).join('\n\n'), choices,
    objective: owned.map(activity => campusActivityStatus(state, activity.id)).find(status => status.status === 'active')?.text || 'Choose a story or explore at your own pace.'};
}

export function getCampusStepConversation(state, id) {
  const activity = activityById(id), step = currentCampusStep(state, id);
  if (!activity || !step) return null;
  const person = personById(activity.npcId), action = 'campus:step:' + id + ':' + step.id;
  const choices = step.type === 'choice' ? (step.choices || []).map(choice => ({id: choice.id, label: choice.label,
    action: 'campus:answer:' + id + ':' + choice.id})) : [{id: 'step:' + step.id, label: step.label, action}];
  choices.push({id: 'later', label: 'Come back later.', action: 'decline'});
  return {id: 'step:' + id, npcId: 'step:' + id, name: activity.title, role: step.label, color: person.color,
    text: step.prompt || step.label, choices, objective: campusActivityStatus(state, id).text};
}

function hasCarriedItem(activity, record, step) {
  if (typeof step.item !== 'string' || !step.item) return false;
  let held = false;
  for (let index = 0; index < record.steps.length; index++) {
    const previous = activity.steps[index];
    if (previous.item !== step.item) continue;
    held = previous.type !== 'deliver';
  }
  return held;
}

// The runtime measures dwell and travel from the beginning of this exact step,
// clearing transient evidence on pause, import/reset and discontinuous travel.
export function applyCampusActivityAction(state, action, context = {}) {
  if (!object(state) || state.version !== 1 || typeof action !== 'string' || !object(context)) return unchanged('No campus activity is available.');
  if (action === 'decline') return unchanged('Come back whenever you like.');
  const onFoot = context.grounded === true && context.riding !== true;
  const talkTo = id => onFoot && context.npcId === id && nearby(context.position, context.npcPosition);
  if (action.startsWith('campus:meet:')) {
    const id = action.slice('campus:meet:'.length), person = personById(id);
    if (!person || !talkTo(id)) return unchanged('Step closer on foot to talk.');
    const previous = state.talks[id] || 0, first = !state.met.includes(id);
    if (first) state.met.push(id);
    state.talks[id] = Math.min(99, previous + 1);
    return first || previous < 99 ? {changed: true, message: 'You spoke with ' + person.name + '.'} : unchanged('Good to see you again.');
  }
  const [, kind, id, detail, extra] = action.split(':');
  if (!action.startsWith('campus:') || extra !== undefined) return unchanged('That campus step is not available.');
  const activity = activityById(id), record = recordFor(state, id);
  if (!activity || !object(record) || !requirementsMet(state, activity)) return unchanged('Finish the earlier story first.');
  if (supportedCompletion(state, activity)) return unchanged(activity.revisit || 'This story is complete. Come back to say hello.');
  if (kind === 'start') {
    if (detail !== undefined || record.started || !talkTo(activity.npcId)) return unchanged('Meet the host on foot to begin.');
    record.started = true;
    return {changed: true, message: activity.accepted || activity.description};
  }
  if (!record.started) return unchanged('Talk to the host before beginning this story.');
  if (kind === 'finish') {
    if (detail !== undefined || !validReceipts(record, activity, true) || !talkTo(activity.npcId)) return unchanged('Finish the route, then return to its host on foot.');
    record.finished = true;
    state.completed = CAMPUS_ACTIVITIES.filter(value => supportedCompletion(state, value)).map(value => value.id);
    return {changed: true, message: activity.outcome, reward: {id: 'campus:' + activity.id, xp: activity.xp}};
  }
  const step = currentCampusStep(state, id);
  if (!step || !onFoot) return unchanged('Park the scooter and continue on foot.');
  if (step.type === 'deliver') {
    if (!talkTo(step.npcId) || !hasCarriedItem(activity, record, step)) return unchanged('Carry the supplies to their recipient and speak nearby.');
  } else if (!nearby(context.position, step.point)) return unchanged('Follow the story to its next outdoor stop.');
  let answer;
  if (step.type === 'choice') {
    if (kind !== 'answer') return unchanged('Read the clue and choose an answer.');
    answer = step.choices?.find(choice => choice.id === detail);
    if (!answer) return unchanged('Choose one of the answers shown.');
    if (answer.correct !== true) return unchanged(answer.feedback || 'Read the clue and try another answer. There is no penalty.');
  } else {
    if (kind !== 'step' || detail !== step.id) return unchanged('Complete the current story step first.');
    if (step.type === 'observe' && (!Number.isFinite(context.dwell) || context.dwell < safeSeconds(step) || !Number.isFinite(context.speed) || context.speed < 0 || context.speed > .2)) {
      return unchanged('Pause on foot here for ' + safeSeconds(step) + ' seconds and take in the scene.');
    }
    if (step.type === 'visit' && (!Number.isFinite(context.travelled) || context.travelled < 8)) return unchanged('Walk the route here; arriving by a jump in location does not complete the walk.');
    if (!['interact', 'observe', 'visit', 'deliver'].includes(step.type)) return unchanged('That activity is not ready yet.');
  }
  if (answer) record.answers[step.id] = answer.id;
  record.steps.push(step.id);
  return {changed: true, message: step.complete || answer?.feedback || 'A small change, ready for the next step.'};
}
