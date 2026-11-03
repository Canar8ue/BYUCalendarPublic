import {hikeCheckpoints, hikeStatus, hikeObjectives, calebConversation, buildHikeActivities} from './hike-state.mjs?v=20261102polish6';

let serial = 0;

/** Map geometry remains the sourced centerline; screen fitting changes no route. */
export function projectHikeMap(route, width = 360, height = 190) {
  const points = (route?.points || route?.route || []).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.z));
  if (points.length < 2 || !Number.isFinite(width) || !Number.isFinite(height) || width < 40 || height < 40) return null;
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const minZ = Math.min(...points.map(point => point.z)), maxZ = Math.max(...points.map(point => point.z));
  const scale = Math.min((width - 32) / Math.max(.001, maxX - minX), (height - 32) / Math.max(.001, maxZ - minZ));
  const offsetX = (width - (maxX - minX) * scale) / 2, offsetZ = (height - (maxZ - minZ) * scale) / 2;
  const project = point => ({x:offsetX + (point.x - minX) * scale, y:offsetZ + (point.z - minZ) * scale});
  return {width,height,points:points.map(project),branches:(route.branches||[]).map(branch=>({id:branch.id,points:branch.points.filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.z)).map(project)})),checkpoints:hikeCheckpoints(route).filter(point => Number.isFinite(point.x) && Number.isFinite(point.z)).map(point => ({...point,...project(point)}))};
}

export function createHikeUI({getState = () => ({}), getRoute = () => null, getActive = () => getState().inHike === true, onAction = () => {}, onOpenChange = () => {}} = {}) {
  const document = globalThis.document;
  if (!document?.body) throw new Error('Hike interface mount missing.');
  const instance = ++serial, titleId = `hike-title-${instance}`, descriptionId = `hike-description-${instance}`;
  const dialog = document.createElement('dialog');
  dialog.className = 'hike-dialog';dialog.setAttribute('aria-labelledby', titleId);dialog.setAttribute('aria-describedby', descriptionId);
  const header = node('header', 'hike-header'), heading = node('div');
  const title = node('h2', '', 'Y Trail');title.id = titleId;title.tabIndex = -1;
  heading.append(title);
  const dismiss = button('×', 'hike-close', () => close());dismiss.setAttribute('aria-label','Close hike journal');header.append(heading,dismiss);
  const body = node('div','hike-body'), footer = node('footer','hike-footer','');
  const credits=node('span','hike-attribution');
  const osm=node('a','','© OpenStreetMap contributors (ODbL)');osm.href='https://www.openstreetmap.org/copyright';osm.target='_blank';osm.rel='noopener';
  const usgs=node('a','','USGS 3DEP terrain');usgs.href='https://www.usgs.gov/3d-elevation-program';usgs.target='_blank';usgs.rel='noopener';
  credits.append(osm,document.createTextNode(' / '),usgs);footer.append(credits);
  dialog.append(header,body,footer);document.body.append(dialog);
  let disposed = false, previousFocus = null, panel = null, busy = false;

  function node(tag, className = '', text) {const element = document.createElement(tag);if (className) element.className = className;if (text !== undefined) element.textContent = text;return element;}
  function button(label, className, callback) {const element = node('button',className,label);element.type = 'button';element.addEventListener('click',callback);return element;}
  function action(label, name, data, primary = false) {
    return button(label,primary ? 'hike-primary' : 'hike-secondary', () => {if (!busy && !disposed) onAction(name,data);});
  }
  function open(kind, label) {
    if (disposed) return false;
    const wasOpen = dialog.open;
    if (!wasOpen) previousFocus = document.activeElement;
    panel = kind;busy = false;body.replaceChildren();title.textContent = label;dialog.dataset.panel = kind;dialog.removeAttribute('aria-busy');
    if (!wasOpen) {dialog.showModal();onOpenChange(true);}
    queueMicrotask(() => {if (!disposed && dialog.open) title.focus({preventScroll:true});});
    return true;
  }
  function close({notify = true} = {}) {
    if (disposed) return;
    const wasOpen = dialog.open;
    panel = null;busy = false;if (wasOpen) dialog.close();
    const focus = previousFocus;previousFocus = null;
    if (focus?.isConnected && typeof focus.focus === 'function') focus.focus({preventScroll:true});
    if (wasOpen && notify) {onOpenChange(false);onAction('close');}
  }
  function describe(text, className = '') {const p = node('p','hike-description '+className,text);p.id = descriptionId;body.append(p);return p;}
  function quote(text) {const card = node('div','hike-caleb');card.append(node('b','','Caleb'),node('div','hike-caleb-text',text));body.append(card);}
  function choices() {const list = node('div','hike-choices');body.append(list);return list;}
  function addMap(route, state) {
    const data = projectHikeMap(route);if (!data) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${data.width} ${data.height}`);svg.setAttribute('class','hike-map');svg.setAttribute('role','img');svg.setAttribute('aria-label','Sourced Y Trail centerline. East is right and north is up. Filled dots are reached checkpoints.');
    const path = document.createElementNS('http://www.w3.org/2000/svg','polyline');path.setAttribute('points',data.points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));path.setAttribute('class','hike-map-route');svg.append(path);
    for(const branch of data.branches){const spur=document.createElementNS('http://www.w3.org/2000/svg','polyline');spur.setAttribute('points',branch.points.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '));spur.setAttribute('class','hike-map-route');spur.setAttribute('stroke-dasharray','3 3');svg.append(spur);}
    for (const point of data.checkpoints) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.y);circle.setAttribute('r',point.id === state.lastCheckpoint ? '4.5' : '3');circle.setAttribute('class',state.reached?.includes(point.id) ? 'reached' : '');
      const label = document.createElementNS('http://www.w3.org/2000/svg','title');label.textContent = point.name || point.id;circle.append(label);svg.append(circle);
    }
    body.append(svg);
    const points = route.points || route.route, length = points.at(-1)?.distanceMeters;
    if (Number.isFinite(length)) body.append(node('p','hike-map-caption',`${(length / 1000).toFixed(2)} km to the top of the Y`));
    body.append(node('p','hike-map-caption','Checkpoints are marked at bends. Dashed paths lead to the lower Y.'));
  }
  function returnChoice(list) {if (getActive()) list.append(action('Assisted return to campus','leave-hike'));}
  function resumes(list, state, route) {
    if (!state.reached?.length) return;
    const label = node('label','hike-resume-label','Assisted resume at a reached checkpoint'), select = node('select','hike-resume');
    const checkpoints = hikeCheckpoints(route);
    for (const id of state.reached) {const point = checkpoints.find(value => value.id === id), option = node('option','',point?.name || id.replaceAll('-',' '));option.value = id;select.append(option);}
    select.value = state.lastCheckpoint || state.reached.at(-1);label.append(select);
    list.append(label,button('Resume selected checkpoint','hike-secondary',() => {if (!busy) onAction('resume:'+select.value);}));
  }
  function openTrailhead({atTrailhead = true} = {}) {
    const state = getState(), route = getRoute();
    if (!open('trailhead',atTrailhead ? 'Y Trailhead' : 'Y Trail')) return;
    describe(atTrailhead ? 'Leave your scooter at the trailhead.' : 'Use assisted travel to reach the trailhead.');
    quote(calebConversation(state,hikeCheckpoints(route)[0]?.id,route));
    addMap(route,state);
    const list = choices();
    list.append(action(atTrailhead ? state.started ? 'Continue from the trailhead' : 'Walk with Caleb' : 'Go to the Y Trailhead',atTrailhead ? 'start' : 'travel-trailhead',undefined,true));

    resumes(list,state,route);list.append(action('Open hiking journal','journal'));returnChoice(list);
    list.append(button('Close','hike-later',() => close()));
  }
  function openCheckpoint(id) {
    const state = getState(), route = getRoute(), checkpoints = hikeCheckpoints(route), point = checkpoints.find(value => value.id === id);
    if (!point || !open('checkpoint',point.name || 'Checkpoint')) return;
    describe(hikeStatus(state,route).text);quote(calebConversation(state,id,route));
    const list = choices();
    if (id === checkpoints.at(-1)?.id && !state.summitSeen) list.append(action('Mark summit reached','summit',undefined,true));
    if (id === checkpoints[0]?.id && state.summitSeen && state.descent?.length === checkpoints.length - 1 && !state.returned) list.append(action('Finish hike','return',undefined,true));
    const activities = buildHikeActivities(route);
    for (const item of activities.cleanup.filter(value => value.checkpointId === id && !state.cleanup?.includes(value.id))) list.append(action('Pick up litter','cleanup:'+item.id));
    for (const item of activities.photos.filter(value => value.checkpointId === id && !state.photos?.includes(value.id))) list.append(action(item.id === 'summit-view' ? 'Frame an upper-Y postcard' : 'Frame the valley photograph','take-photo',{id:item.id}));
    list.append(action(state.companion === false ? 'Invite Caleb to walk along' : 'Walk alone',state.companion === false ? 'companion:on' : 'companion:off'));
    list.append(button('Keep walking','hike-primary',() => close()),action('Open hiking journal','journal'));returnChoice(list);
  }
  function openJournal() {
    const state = getState(), route = getRoute();
    if (!open('journal','Trail journal')) return;
    describe(hikeStatus(state,route).text);addMap(route,state);
    const objectives = node('div','hike-objectives');
    for (const objective of hikeObjectives(state,route)) {
      const card = node('article','hike-objective'+(objective.complete ? ' complete' : ''));
      card.append(node('h3','',objective.title),node('p','',objective.text),node('span','hike-count',objective.complete ? 'Complete' : `${objective.value} / ${objective.total}`));objectives.append(card);
    }
    body.append(objectives);
    const list = choices();resumes(list,state,route);
    if (!getActive()) list.append(action('Go to the Y Trailhead','travel-trailhead',undefined,true));
    returnChoice(list);list.append(button('Close journal','hike-secondary',() => close()));
    body.append(node('p','hike-note','Walk back through each checkpoint to complete the descent.'));
  }
  function setLoading(message = 'Preparing the hiking trail…') {
    if (!open('loading','Loading Y Trail')) return;
    busy = true;dialog.setAttribute('aria-busy','true');const text = describe(message);text.setAttribute('role','status');text.setAttribute('aria-live','polite');
    body.append(node('div','hike-loading-line'));

  }
  function setError(message = 'The hiking terrain could not load. Please try again.') {
    if (!open('error','Trail unavailable')) return;
    const text = describe(message);text.setAttribute('role','alert');const list = choices();list.append(action('Try again','retry',undefined,true),button('Back to campus','hike-secondary',() => close()));
  }
  function keydown(event) {
    if (!dialog.open) return;
    event.stopPropagation();
    if (event.key === 'Escape') {event.preventDefault();close();return;}
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')], first = focusable[0], last = focusable.at(-1);
    if (!first) {event.preventDefault();title.focus();return;}
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
  }
  function cancel(event) {event.preventDefault();close();}
  dialog.addEventListener('keydown',keydown);dialog.addEventListener('cancel',cancel);
  function dispose() {if (disposed) return;close({notify:false});disposed = true;dialog.removeEventListener('keydown',keydown);dialog.removeEventListener('cancel',cancel);dialog.remove();}
  return {openTrailhead,openCheckpoint,openJournal,setLoading,setError,close,dispose,get isOpen(){return dialog.open;},get panel(){return panel;}};
}
