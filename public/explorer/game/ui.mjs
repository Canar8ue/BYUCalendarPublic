import {formatTime} from './racing.mjs?v=20261102polish6';
import {questStatus} from './quest-state.mjs?v=20261102polish6';
import {collectionPanel,wardrobePanel,welcomePanel,finalePanel,racePanel,raceResultPanel} from './field-guide.mjs?v=20261102polish6';
const paths = {
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  book:'<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Z"/><path d="M4 17h16M8 7h7m-7 4h5"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  sound:'<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
  menu:'<path d="M5 6h14M5 12h14M5 18h14"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  scooter:'<circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 18h7l3-12h-4m2 0h3l2 10"/>',
  home:'<path d="m3 10 9-7 9 7M6 9v12h12V9m-9 12v-7h6v7"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  paw:'<ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="10" rx="2" ry="3"/><ellipse cx="10" cy="6" rx="2" ry="3"/><ellipse cx="16" cy="6" rx="2" ry="3"/><ellipse cx="20" cy="11" rx="2" ry="3"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asArray = v => Array.isArray(v) ? v : [];
const button = (action, label, glyph, cls='secondary') => `<button type="button" class="${cls}" data-action="${action}">${glyph?icon(glyph):''}${label}</button>`;

const markerColor = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#527d76';
const mapCharacters = values => asArray(values).filter(value => value && Number.isFinite(value.x) && Number.isFinite(value.z));
export function campusLifeMapMarkers(values, project, {mini = false} = {}) {
  return mapCharacters(values).map(value => {
    const point = project(value);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return '';
    const x = point.x.toFixed(2), y = point.y.toFixed(2), label = escape([value.name || value.title || 'Campus life', value.role].filter(Boolean).join(', '));
    const size = mini ? 4 : 6;
    if (value.activityMarker) return `<g transform="translate(${x} ${y})" role="img" aria-label="${label}"><title>${label}</title><circle r="${size+2}" fill="#fffaf0" stroke="${markerColor(value.color)}" stroke-width="2"/><path d="M-2 0h4M0-2v4" stroke="${markerColor(value.color)}" stroke-width="1.5"/></g>`;
    return `<g transform="translate(${x} ${y})" role="img" aria-label="${label}"><title>${label}</title><path d="M0 ${-size} ${size} 0 0 ${size} ${-size} 0Z" fill="${markerColor(value.color)}" stroke="#fffaf0" stroke-width="${mini ? 1.1 : 1.5}"/></g>`;
  }).join('');
}

export function createUI({onAction = () => {}} = {}) {
  const root = document.getElementById('ui');
  if (!root) throw new Error('Game interface mount missing.');
  const state = {soundRendered:null,musicAttempt:[],musicSolved:false,data:{},panel:null,paused:false,ready:false,cinematic:false,photo:false,disposed:false,sound:true,heading:0,player:null};
  const touch = {x:0,y:0,lookX:0,lookY:0,jump:false,interact:false,mount:false,run:false,boost:false,brake:false};
  const cleanups = [], timeouts = new Set();
  const schedule = (fn, delay) => {const id=setTimeout(()=>{timeouts.delete(id);if(!state.disposed)fn();},delay);timeouts.add(id);return id;};
  const listen = (el,name,fn,opts) => {el.addEventListener(name,fn,opts);cleanups.push(()=>el.removeEventListener(name,fn,opts));};
  root.innerHTML = `
    <div class="hud-left"><div class="passport-stat paper"><div class="level-badge" id="hud-level">1</div><div class="stat-copy"><div class="stat-row"><span id="hud-xp">0 XP</span><small id="hud-visits">0 / 24 places</small></div><div class="xp-track"><div class="xp-fill" id="hud-xp-fill"></div></div></div></div></div>
    <div class="compass" aria-label="Compass"><span>W</span><i></i><strong id="compass-heading">N</strong><i></i><span>E</span><div class="compass-dot"></div></div>
    <div class="top-actions">${button('hike','', 'sun','icon-btn hike-hud')}${button('campusLife','', 'people','icon-btn campus-life-hud')}${button('mute','', 'sound','icon-btn')}${button('photo','', 'camera','icon-btn')}${button('pause','', 'menu','icon-btn')}</div>
    <aside class="objective-card paper"><button type="button" class="objective-heading" data-action="quests"><span id="hud-quest">Find your way back</span><span id="hud-quest-step">0 / 4</span></button><p id="hud-objective">Discover the library</p><small id="hud-distance"></small></aside>
    <div class="race-hud paper hidden"><div class="race-hud-heading"><b id="race-name"></b><span id="race-medal">GOLD PACE</span></div><div class="race-timing"><strong id="race-clock">0:00.0</strong><span>GOLD <b id="race-gold"></b></span></div><div class="race-checkpoints" id="race-checkpoints"></div><div class="race-hud-foot"><span id="race-checkpoint-label"></span><span id="race-best"></span></div></div>
    <div class="race-countdown hidden" role="status" aria-live="assertive"></div>
    <div class="checkpoint-flash hidden" role="status"></div>
    <button class="mini-map paper" data-action="map" aria-label="Open campus map"><span class="mini-map-north">N</span><svg viewBox="0 0 140 140" aria-hidden="true"><defs><clipPath id="mini-clip"><circle cx="70" cy="70" r="62"/></clipPath></defs><g clip-path="url(#mini-clip)"><path d="M0 30h140M0 70h140M0 110h140M30 0v140M70 0v140M110 0v140" stroke="#c7d4bd" stroke-width="1"/><g id="mini-places"></g><g id="mini-characters"></g><circle id="mini-target" r="5" fill="#dba74c" stroke="#fff7d3" stroke-width="2"/><path id="mini-player" d="m0-7 5 12-5-3-5 3Z" fill="#245f94" stroke="white" stroke-width="1.4"/></g></svg></button>
    <div class="voice-caption hidden" role="status" aria-live="polite"><b id="caption-speaker"></b><p id="caption-text"></p></div>
    <div class="celebration hidden" role="status"><b id="celebration-title"></b></div>
    <div class="location-pill" aria-live="off">${icon('pin')}<span id="hud-location">Somewhere on campus</span></div>
    <nav class="dock paper" aria-label="Game tools">${button('map','Passport <kbd>M</kbd>','map','dock-main')}${button('quests','Quests <kbd>J</kbd>','book','')}${button('mount','Scooter <kbd>Q</kbd>','scooter','')}${button('races','Race','scooter','')}</nav>
    <div class="controls-note hidden"><span><kbd>WASD</kbd> Move</span><span>Right drag to look</span><span><kbd>Shift</kbd> Mouse lock</span><span><kbd>C</kbd> Sprint</span></div>
    <div class="speedometer hidden"><b id="hud-speed">0</b> <small>KM/H</small><div class="boost-track"><i id="boost-fill"></i></div><p id="boost-label">Space to boost</p></div>
    <div class="camera-reticle hidden" aria-hidden="true"></div>
    <div class="recovery-card paper hidden" role="status" aria-live="polite"><b id="recovery-title"></b><div class="recovery-track"><i></i></div></div>
    <button type="button" class="interaction hidden" data-action="interact"><kbd>E</kbd><span id="hud-prompt"></span></button>
    <div class="toast-stack" aria-live="polite" aria-atomic="false"></div>
    <div class="touch-controls"><div class="touch-look" aria-hidden="true"></div><div class="touch-stick" aria-label="Move joystick"><div class="touch-thumb"></div></div><div class="touch-actions"><button type="button" data-touch="jump" aria-label="Jump">Jump</button><button type="button" data-touch="interact" aria-label="Interact">Use</button><button type="button" data-touch="run" aria-label="Hold to run">Run</button><button type="button" data-touch="mount" aria-label="Mount or dismount scooter">Ride</button><button type="button" data-touch="brake" class="hidden" aria-label="Hold to brake scooter">Brake</button></div></div>
    <div class="cinematic-layer hidden"><div class="cinematic-bars"></div><div class="cinematic-box"><div id="cinematic-title"></div><p id="cinematic-text"></p></div><button type="button" data-action="skip" class="cinematic-skip">Skip scene →</button></div>
    <div class="photo-banner paper hidden"><span>Photo mode</span>${button('capture','Capture postcard','camera','')}${button('photoDone','Done','close','')}</div>
    <div class="loading-screen"><div class="loading-content"><div class="loading-brand">Y</div><h1>Lost on Campus</h1><div class="loading-track"><div class="loading-fill"></div></div><div class="loading-label"><span id="loading-message">Loading campus…</span><span id="loading-percent">0%</span></div><div class="loading-error hidden">${button('reload','Try again',null)}${button('exit','Back to calendar','home')}</div></div></div>
    <dialog class="game-dialog" aria-labelledby="panel-title"><header class="dialog-head"><div><h2 id="panel-title">Campus passport</h2></div><button type="button" data-action="closePanel" class="icon-btn close" aria-label="Close menu">${icon('close')}</button></header><div class="dialog-content"></div></dialog>
    <input class="hidden" id="save-file" type="file" accept="application/json,.json" aria-label="Choose a progress save file">
  `;
  const query = selector => root.querySelector(selector);
  const dialog = query('dialog');
  const content = query('.dialog-content');
  query('[data-action="mute"]').setAttribute('aria-label','Mute sound');
  query('[data-action="photo"]').setAttribute('aria-label','Photo mode');
  query('[data-action="pause"]').setAttribute('aria-label','Pause and settings');
  query('.campus-life-hud').setAttribute('aria-label','Campus life');
  query('.campus-life-hud').setAttribute('title','Campus life');
  query('.hike-hud').setAttribute('aria-label','Y Trail');query('.hike-hud').setAttribute('title','The Y hike');
  const getProgress = () => state.data.progress || {};
  const visitedIds = () => asArray(getProgress().visited);
  const lifeEntry = () => `<section class="campus-life-entry"><span aria-hidden="true">${icon('people')}</span><div><b>Campus life</b></div><button type="button" class="small-button" data-action="campusLife" aria-label="Open campus life">Open</button></section>`;
  const mapPanel = () => {
    const locations=asArray(state.data.locations),visited=visitedIds(),characters=mapCharacters(state.player?.characters || state.data.characters || state.data.activities);
    if(!locations.length)return '<p>Map unavailable.</p>';
    const xs=locations.map(l=>l.x),zs=locations.map(l=>l.z),minX=Math.min(...xs)-3,maxX=Math.max(...xs)+3,minZ=Math.min(...zs)-3,maxZ=Math.max(...zs)+3;
    const point=l=>({x:20+(l.x-minX)/(maxX-minX||1)*260,y:20+(l.z-minZ)/(maxZ-minZ||1)*260});
    const dots=locations.map(l=>{const p=point(l),yes=visited.includes(l.id);return `<g><circle cx="${p.x}" cy="${p.y}" r="${yes?5:3.5}" fill="${yes?'#4e7850':'#e4dfc3'}" stroke="${yes?'#fffdf0':'#a9b49a'}" stroke-width="1.5"/><title>${escape(l.name)}${yes?' (visited)':''}</title></g>`;}).join('');
    const player=state.player?point(state.player):null;
    const activities=asArray(state.player?.activities||state.data.mapActivities),activityLinks=activities.length?`<div class="campus-map-stories">${activities.map(a=>`<button class="location-row" data-quest="${escape(a.id)}"><div><b>${escape(a.name)}</b><small>${escape(a.role)}</small></div><span>Follow →</span></button>`).join('')}</div>`:'';
    const characterMarkers=campusLifeMapMarkers([...activities,...characters],point),legend=characters.length?`<ul class="campus-life-map-key" aria-label="Campus-life characters on the map">${characters.map(person=>`<li><span><b>${escape(person.name||person.title)}</b>${person.role?`<small>${escape(person.role)}</small>`:''}</span></li>`).join('')}</ul>`:'';
    return `<div class="guide-tabs"><button class="active" data-action="map">Passport</button><button data-action="quests">Journal</button><button data-action="campusLife">Campus life</button><button data-action="collection">Collections</button><button data-action="wardrobe">Wardrobe</button></div><p class="trail-note">${visited.length} / ${locations.length} landmarks visited</p><div class="passport-layout"><div><div class="map-art"><span class="map-north">↑ N</span><svg viewBox="0 0 300 300" role="img" aria-label="Campus discoveries and character locations"><path d="M35 265C65 230 50 195 95 165S155 130 160 85 200 50 250 30" stroke="#f6f3df" stroke-width="11" fill="none"/><path d="M20 120h260M100 20v260M230 20v260M20 220h260" stroke="#f6f3df" stroke-width="5"/>${dots}${characterMarkers}${player?`<circle cx="${player.x}" cy="${player.y}" r="7" fill="#2464a8" stroke="white" stroke-width="2"/>`:''}</svg></div>${legend}${activityLinks}<p class="map-legend">Select a visited landmark to travel there. Diamonds mark students. Plus signs mark activities.</p></div><div><div class="section-title">Landmarks</div><div class="location-list">${locations.map(l=>{const yes=visited.includes(l.id);return `<button type="button" class="location-row ${yes?'visited':''}" data-location="${escape(l.id)}" ${yes?'':'disabled'} aria-label="${yes?'Travel to':'Undiscovered:'} ${escape(l.name)}">${icon(yes?'check':'pin')}<div><b>${escape(l.name)}</b><small>${yes?'Travel here':'Undiscovered'}</small></div><span class="visit-xp">${yes?'✓':'+10'}</span></button>`;}).join('')}</div></div></div>`;
  };
  const questPanel = () => {
    const p=getProgress(),done=asArray(p.quests),chapters=asArray(state.data.chapters),quests=asArray(state.data.quests),active=chapters.find(c=>!asArray(p.fragments).includes(c.id)),status=questStatus(p,'main');
    return `<div class="guide-tabs"><button data-action="map">Map</button><button class="active" data-action="quests">Quests</button><button data-action="campusLife">Campus life</button><button data-action="races">Races</button><button data-action="collection">Collection</button></div>${lifeEntry()}<section class="campus-life-entry"><span aria-hidden="true">${icon('sun')}</span><div><b>Y Trail</b></div><button type="button" class="small-button" data-action="hike" aria-label="Open Y Trail">Open</button></section><section class="story-card"><p>${asArray(p.fragments).length} of 4 pages</p><h3>${escape(active?.title||'The way back')}</h3><p>${escape(status.text)}</p>${done.includes('main')?'<b>Adventure complete</b>':'<button class="primary" data-quest="main">Follow adventure →</button>'}</section><div class="journal-heading"><h3 class="section-title">Side quests</h3><span>${done.filter(id=>id!=='main').length} / ${quests.length-1} COMPLETE</span></div><div class="quest-list">${quests.filter(q=>q.id!=='main').map(q=>{
      const complete=done.includes(q.id),status=questStatus(p,q.id),pct=complete?100:status.value/status.total*100;
      return `<article class="quest-card ${complete?'complete':''}"><span class="quest-icon">${icon(complete?'check':q.id==='cat'?'paw':q.id==='photo'?'camera':'star')}</span><h3>${escape(q.title)}</h3><p>${escape(complete?'Complete':q.description)}</p><div class="quest-progress"><span style="width:${pct}%"></span></div><footer><small>${complete?'✓':status.value+' / '+status.total} (+${q.xp} XP)</small>${complete?'':`<button class="small-button" data-quest="${escape(q.id)}">${state.data.selectedQuest===q.id?'Continue →':'Track →'}</button>`}</footer></article>`;
    }).join('')}</div><button class="secondary free-roam-button" data-action="freeRoam">Free roam</button>`;
  };
  const musicPanel = () => {
    const notes=asArray(state.data.tuneNotes).slice(0,3),progress=getProgress(),allFound=notes.length===3&&notes.every(note=>asArray(progress.notes).includes(note.id)),complete=asArray(progress.quests).includes('music');
    state.musicAttempt=[];state.musicSolved=complete;
    if(!notes.length)return '<p>The music clues are still finding their way here. Return to the arts route and try again.</p>';
    return `<section class="music-puzzle"><p>Play the symbols in order.</p><ol class="melody-sequence" aria-label="The melody to play">${notes.map((note,index)=>`<li><span>${escape(note.symbol)}</span><small>${index+1}. ${escape(note.name)}</small></li>`).join('')}</ol><div id="melody-attempt" class="melody-attempt" aria-label="Your notes">${notes.map(()=>'<span class="melody-slot">·</span>').join('')}</div><div class="note-buttons">${notes.map((note,index)=>`<button type="button" data-note="${index}" ${!allFound||complete?'disabled':''} aria-label="Play ${escape(note.name)}"><b>${escape(note.symbol)}</b><span>${escape(note.name)}</span></button>`).join('')}</div><p id="melody-feedback" class="melody-feedback ${complete?'success':''}" role="status" aria-live="polite">${complete?'Melody complete.':allFound?'Select the first symbol.':'Find all three musical symbols on the arts route to play the melody.'}</p><div class="button-row">${complete?'':button('musicReset','Start the melody again',null)}${button('closePanel','Back to campus','arrow')}</div></section>`;
  };
  function playNote(index) {
    if(state.panel!=='music'||state.musicSolved)return;
    const notes=asArray(state.data.tuneNotes).slice(0,3);
    if(notes.length!==3||!notes.every(note=>asArray(getProgress().notes).includes(note.id))||!Number.isInteger(index)||!notes[index])return;
    onAction('playNote',index);
    const feedback=query('#melody-feedback');
    if(index!==state.musicAttempt.length){state.musicAttempt=[];query('#melody-attempt').innerHTML=notes.map(()=>'<span class="melody-slot">·</span>').join('');feedback.className='melody-feedback';feedback.textContent='A small detour. Start again with '+notes[0].name.toLowerCase()+'.';return;}
    state.musicAttempt.push(index);query('#melody-attempt').innerHTML=notes.map((note,i)=>`<span class="melody-slot ${i<state.musicAttempt.length?'filled':''}">${i<state.musicAttempt.length?escape(note.symbol):'·'}</span>`).join('');
    if(state.musicAttempt.length===notes.length){state.musicSolved=true;feedback.className='melody-feedback success';feedback.textContent='You found the harmony. Campus in Tune complete!';root.querySelectorAll('[data-note]').forEach(el=>el.disabled=true);onAction('musicSolved');}
    else{feedback.className='melody-feedback';feedback.textContent='Lovely. '+(notes.length-state.musicAttempt.length)+' more '+(notes.length-state.musicAttempt.length===1?'note.':'notes.');}
  }
  const settingsPanel = () => {
    const settings=getProgress().settings||{};
    return `<section class="settings-section"><div class="section-title">Audio</div><div class="settings-row"><label for="setting-music">Enable sound</label><input id="setting-music" data-setting="music" type="checkbox" ${state.sound?'checked':''}></div>${[['volume','Master volume'],['musicVolume','Music'],['ambienceVolume','Campus ambience'],['effectsVolume','Sound effects'],['voiceVolume','Story voices']].map(([id,label])=>`<div class="settings-row"><label for="setting-${id}">${label}</label><input id="setting-${id}" aria-label="${label}" data-setting="${id}" type="range" min="0" max="1" step="0.05" value="${Number(settings[id]??.55)}"></div>`).join('')}<div class="settings-row"><label for="setting-captions">Story subtitles<small>Story scenes always have text, even with sound off.</small></label><input id="setting-captions" data-setting="captions" type="checkbox" ${settings.captions!==false?'checked':''}></div></section>
    <section class="settings-section"><div class="section-title">Display</div><div class="settings-row"><label for="setting-quality">Graphics quality</label><select id="setting-quality" data-setting="quality">${['auto','low','high'].map(v=>`<option value="${v}" ${v===(settings.quality||'auto')?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}</select></div><div class="settings-row"><label for="setting-motion">Reduced motion</label><input id="setting-motion" data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}></div><div class="settings-row"><label for="setting-time">Sky & atmosphere</label><select id="setting-time" data-setting="time">${[['sunset','Golden hour'],['day','Clear afternoon'],['night','Quiet evening']].map(([v,label])=>`<option value="${v}" ${v===(state.data.time||'sunset')?'selected':''}>${label}</option>`).join('')}</select></div></section>
    <section class="settings-section"><div class="section-title">Camera</div><div class="settings-row"><label for="setting-routeHints">Show route trail</label><input id="setting-routeHints" data-setting="routeHints" type="checkbox" ${settings.routeHints!==false?'checked':''}></div><div class="settings-row"><label for="setting-showGhost">Race your personal ghost</label><input id="setting-showGhost" data-setting="showGhost" type="checkbox" ${settings.showGhost!==false?'checked':''}></div>${[['sensitivity','Look sensitivity'],['cameraDistance','Camera distance']].map(([id,label])=>`<div class="settings-row"><label for="setting-${id}">${label}</label><input id="setting-${id}" data-setting="${id}" type="range" min="0.5" max="2" step="0.1" value="${Number(settings[id]??1)}"></div>`).join('')}<div class="settings-row"><label for="setting-invertY">Invert vertical look</label><input id="setting-invertY" data-setting="invertY" type="checkbox" ${settings.invertY?'checked':''}></div><div class="settings-row"><label for="setting-cycle">Day and night cycle</label><input id="setting-cycle" data-setting="cycle" type="checkbox" ${settings.cycle?'checked':''}></div></section><section class="settings-section"><div class="section-title">Save data</div><div class="button-row">${button('export','Export progress','book')}${button('chooseImport','Import progress','book')}</div><p class="settings-note">Progress is saved in this browser. Export a backup to keep it or bring it to another device.</p><div class="button-row" style="margin-top:14px">${button('respawn','Return to checkpoint','pin')}${button('replayIntro','Opening scene','star')}${button('resetConfirm','Reset progress',null,'secondary danger')}</div></section><p class="settings-note">An independent student project. Campus scenery is stylized, and quests are fictional.<br>Map data © OpenStreetMap contributors, USGS 3DEP, and BYU. <a href="/explorer/CREDITS.md" target="_blank" rel="noopener">Game & audio credits ↗</a></p>`;
  };
  const helpPanel = () => `<div class="control-grid">${[['Move relative to camera','W A S D / Arrows'],['Orbit camera','Hold right mouse + drag'],['Zoom camera','Mouse wheel'],['Toggle mouse lock','Shift'],['Sprint / Ride faster','Hold C'],['Jump / Scooter boost','Space'],['Scooter brake','Hold F'],['Interact','E'],['Ride / Dismount','Q'],['Passport','M'],['Quest journal','J'],['Photo mode','P'],['Wave / Dance','V / B'],['Scooter bell','H'],['Restart race','R'],['Pause / Release mouse','Esc']].map(([label,key])=>`<p><span>${label}</span><kbd>${key}</kbd></p>`).join('')}</div><p class="settings-note">Touch: left stick to move, drag right to look. Hold Run to sprint; use Boost and Brake while riding. A hard scooter impact causes a wipeout; sprinting into obstacles can trip you. You get back up automatically and keep your progress.</p><div class="button-row" style="margin-top:22px">${button('respawn','Return to checkpoint','pin')}${button('closePanel','Back to campus','arrow')}</div>`;
  const pausePanel = () => `<div class="pause-copy"><div class="button-stack">${button('closePanel','Resume','arrow','primary')}${state.data.activeTrial?button('restart','Restart race','scooter')+button('cancelTrial','Leave race',null):''}${button('hike','Y Trail','sun')}${button('campusLife','Campus life','people')}<div class="button-row">${button('quests','Quests','book')}${button('races','Races','scooter')}</div><div class="button-row">${button('map','Map','map')}${button('wardrobe','Wardrobe','star')}</div><div class="button-row">${button('collection','Collection','book')}${button('photo','Photo mode','camera')}</div><div class="button-row">${button('settings','Settings','settings')}${button('help','Controls','help')}</div>${button('respawn','Return to safe ground','pin')}${button('exit','Exit game','home')}</div></div>`;
  const photoPanel = () => `<div class="pause-copy"><div class="button-row" style="margin-bottom:14px"><button type="button" class="secondary" data-sky="day">Afternoon</button><button type="button" class="secondary" data-sky="sunset">Golden hour</button><button type="button" class="secondary" data-sky="night">Evening</button></div><div class="settings-row"><label for="photo-frame">Postcard style</label><select id="photo-frame" data-setting="photoFrame">${[['postcard','Classic postcard'],['clean','Clean photograph'],['cinema','Cinema bars']].map(([id,label])=>`<option value="${id}" ${getProgress().settings?.photoFrame===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="button-row photo-poses"><button class="secondary" data-pose="idle">Relax</button><button class="secondary" data-pose="wave">Say hello</button><button class="secondary" data-pose="dance">Little dance</button></div><div class="button-stack">${button('photoCompose','Compose view','camera','primary')}${button('capture','Capture postcard','camera')}${state.lastPhoto?button('lastPostcard','View last postcard','book'):''}</div></div>`;
  const postcardPanel=()=>state.lastPhoto?`<div class="postcard-preview"><img src="${state.lastPhoto}" alt="Your framed Lost on Campus postcard"><div class="button-row"><a class="primary" href="${state.lastPhoto}" download="byu-campus-postcard.png">Save PNG postcard ↓</a>${button('photo','Take another','camera')}${button('closePanel','Back to campus','arrow')}</div></div>`:'<p>No photo yet.</p>';
  const panels={map:mapPanel,passport:mapPanel,quests:questPanel,settings:settingsPanel,pause:pausePanel,help:helpPanel,photo:photoPanel,postcard:postcardPanel,music:musicPanel,collection:()=>collectionPanel(state.data),wardrobe:()=>wardrobePanel(state.data),welcome:welcomePanel,races:()=>racePanel(state.data),raceResult:()=>raceResultPanel(state.data),finale:()=>finalePanel(state.data)};
  const titles={map:'Campus map',passport:'Campus map',quests:'Quests',settings:'Settings',pause:'Paused',help:'Controls',photo:'Photo mode',postcard:'Postcard',music:'Play the melody',collection:'Collection',wardrobe:'Wardrobe',welcome:'Lost on Campus',finale:'Adventure complete',races:'Time trials',raceResult:'Race complete'};
  function openPanel(name,data={}) {
    if(state.disposed)return;
    if(state.photo){state.photo=false;root.classList.remove('photo-mode');query('.photo-banner').classList.add('hidden');onAction('photoMode',false);}
    state.data={...state.data,...data};state.panel=panels[name]?name:'pause';state.paused=true;
    query('#panel-title').textContent=titles[state.panel];content.innerHTML=panels[state.panel]();
    if(!dialog.open)dialog.showModal();content.scrollTop=0;
    onAction('pause');
  }
  function closePanel(notify=true) {
    if(dialog.open)dialog.close();state.panel=null;state.paused=false;
    if(notify)onAction('resume');
  }
  function toast(title,subtitle='') {
    const item=document.createElement('div');item.className='toast';
    item.innerHTML=`<div><b>${escape(title)}</b>${subtitle?`<p>${escape(subtitle)}</p>`:''}</div>`;
    query('.toast-stack').append(item);
    while(query('.toast-stack').children.length>3)query('.toast-stack').firstElementChild.remove();
    schedule(()=>{item.classList.add('leaving');schedule(()=>item.remove(),350);},2800);
  }
  function action(name,payload) {
    if(name==='lastPostcard'){openPanel('postcard');return;}
    if(name==='musicReset'){state.musicAttempt=[];state.musicSolved=false;content.innerHTML=musicPanel();return;}
    if(name==='reload'){window.location.reload();return;}
    if(name==='closePanel'){closePanel();return;}
    if(name==='photoCompose'){closePanel(false);state.photo=true;root.classList.add('photo-mode');query('.photo-banner').classList.remove('hidden');onAction('photoMode',true);onAction('resume');return;}
    if(name==='photoDone'){state.photo=false;root.classList.remove('photo-mode');query('.photo-banner').classList.add('hidden');onAction('photoMode',false);return;}
    if(name==='chooseImport'){query('#save-file').click();return;}
    if(name==='resetConfirm'){content.innerHTML=`<div class="pause-copy"><h3>Reset progress?</h3><p>This clears discoveries, quests, and unlocks in this browser. Export a backup first if you want to keep them.</p><div class="button-stack">${button('export','Export a backup','book')}${button('reset','Yes, reset my progress',null,'secondary danger')}${button('settings','Cancel','arrow','primary')}</div></div>`;return;}
    if(name==='mount'||name==='jump'||name==='interact'){touch[name]=true;return;}
    onAction(name,payload);
  }
  listen(root,'click',event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.dataset.action)action(target.dataset.action);
    if(target.dataset.location)onAction('travel',target.dataset.location);
    if(target.dataset.quest)onAction('selectQuest',target.dataset.quest);
    if(target.dataset.sky)onAction('time',target.dataset.sky);
    if(target.dataset.trial)onAction('trial',target.dataset.trial);
    if(target.dataset.note!==undefined)playNote(Number(target.dataset.note));
    if(target.dataset.cosmetic)onAction('cosmetic',target.dataset.cosmetic);
    if(target.dataset.pose){onAction('pose',target.dataset.pose);root.querySelectorAll('[data-pose]').forEach(el=>el.setAttribute('aria-pressed',String(el===target)));}
  });
  listen(root,'input',event=>{const el=event.target;if(!el.dataset.setting)return;const key=el.dataset.setting;if(el.type==='range')onAction(key,Number(el.value));});
  listen(root,'change',event=>{const el=event.target;if(!el.dataset.setting)return;const key=el.dataset.setting;if(el.type==='range')return;if(key==='music')onAction('mute');else onAction(key,el.type==='checkbox'?el.checked:el.value);});
  listen(dialog,'cancel',event=>{event.preventDefault();closePanel();});
  listen(query('#save-file'),'change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>100000){toast('Save exceeds 100 KB.','Choose a progress JSON file under 100 KB.');return;}try{onAction('import',await file.text());}catch{toast('Could not read that save.','Try choosing the file again.');}});
  let stickPointer=null,stickCenter=null;
  const stick=query('.touch-stick'),thumb=query('.touch-thumb');
  const resetStick=()=>{stickPointer=null;touch.x=touch.y=0;thumb.style.transform='';};
  listen(stick,'pointerdown',event=>{event.preventDefault();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);const rect=stick.getBoundingClientRect();stickCenter={x:rect.left+rect.width/2,y:rect.top+rect.height/2,r:rect.width*.32};});
  listen(stick,'pointermove',event=>{if(event.pointerId!==stickPointer)return;event.preventDefault();let x=event.clientX-stickCenter.x,y=event.clientY-stickCenter.y;const d=Math.hypot(x,y),max=stickCenter.r;if(d>max){x=x/d*max;y=y/d*max;}touch.x=x/max;touch.y=-y/max;thumb.style.transform=`translate(${x}px,${y}px)`;});
  listen(stick,'pointerup',resetStick);listen(stick,'pointercancel',resetStick);listen(stick,'lostpointercapture',resetStick);
  const look=query('.touch-look');let lookPointer=null,lastLook=null;
  listen(look,'pointerdown',event=>{event.preventDefault();lookPointer=event.pointerId;lastLook={x:event.clientX,y:event.clientY};look.setPointerCapture(event.pointerId);});
  listen(look,'pointermove',event=>{if(event.pointerId!==lookPointer)return;event.preventDefault();touch.lookX+=event.clientX-lastLook.x;touch.lookY+=event.clientY-lastLook.y;lastLook={x:event.clientX,y:event.clientY};});
  const resetLook=()=>{lookPointer=null;lastLook=null;};listen(look,'pointerup',resetLook);listen(look,'pointercancel',resetLook);listen(look,'lostpointercapture',resetLook);
  root.querySelectorAll('[data-touch]').forEach(el=>{
    listen(el,'pointerdown',event=>{event.preventDefault();const key=el.dataset.touch;touch[key==='jump'&&state.data.riding?'boost':key]=true;el.classList.add('active');el.setPointerCapture(event.pointerId);});
    const end=()=>{el.classList.remove('active');if(el.dataset.touch==='run')touch.run=false;if(el.dataset.touch==='jump')touch.boost=false;if(el.dataset.touch==='brake')touch.brake=false;};listen(el,'pointerup',end);listen(el,'pointercancel',end);listen(el,'lostpointercapture',end);
  });
  listen(window,'blur',()=>{resetStick();resetLook();touch.run=touch.boost=touch.brake=false;});
  function setLoading(message,progress) {
    query('#loading-message').textContent=message;
    if(Number.isFinite(progress)){const pct=Math.round(Math.max(0,Math.min(1,progress))*100);query('.loading-fill').style.width=pct+'%';query('#loading-percent').textContent=pct+'%';}
  }
  function ready() {state.ready=true;setLoading('Ready',1);query('.loading-screen').classList.add('loading-fade');schedule(()=>{if(state.ready)query('.loading-screen').classList.add('hidden');},900);}
  function update(data={}) {
    state.data={...state.data,...data};if(data.progress)state.data.progress=data.progress;
    const xp=Number(data.xp??state.data.xp??0),level=typeof data.level==='object'?data.level.level||data.level.number||1:Number(data.level??1);
    query('#hud-xp').textContent=Math.max(0,Math.round(xp))+' XP';query('#hud-level').textContent=Number.isFinite(level)?level:1;
    const visited=Array.isArray(data.visited)?data.visited.length:Number(data.visited??visitedIds().length),total=data.total??state.data.locations?.length??24;
    query('#hud-visits').textContent=`${visited} / ${total} places`;
    const levelStart=Number(data.levelStartXp??state.data.levelStartXp??0), nextLevel=data.nextLevelXp??state.data.nextLevelXp;
    const levelPct=nextLevel===null?100:Number.isFinite(nextLevel)&&nextLevel>levelStart?(xp-levelStart)/(nextLevel-levelStart)*100:xp%100;
    query('#hud-xp-fill').style.width=Math.min(100,Math.max(0,levelPct))+'%';
    if(data.objective!==undefined)query('#hud-objective').textContent=typeof data.objective==='object'?data.objective.text||data.objective.title||'Keep exploring.':data.objective;
    if(data.location!==undefined)query('#hud-location').textContent=typeof data.location==='object'?data.location.name:data.location||'Somewhere on campus';
    if(data.sound!==undefined){state.sound=Boolean(data.sound);if(state.soundRendered!==state.sound){state.soundRendered=state.sound;const el=query('[data-action="mute"]');el.innerHTML=icon(state.sound?'sound':'muted');el.setAttribute('aria-label',state.sound?'Mute sound':'Enable sound');el.setAttribute('aria-pressed',String(!state.sound));}}
    if(data.riding!==undefined){query('.speedometer').classList.toggle('hidden',!data.riding);query('[data-touch="jump"]').textContent=data.riding?'Boost':'Jump';query('[data-touch="jump"]').setAttribute('aria-label',data.riding?'Hold to boost':'Jump');query('[data-touch="brake"]').classList.toggle('hidden',!data.riding);query('[data-touch="run"]').textContent=data.riding?'Faster':'Run';}
    query('.objective-card').classList.toggle('hidden',!data.quest);if(data.quest){query('#hud-quest').textContent=data.quest.title;query('#hud-quest-step').textContent=data.quest.total>1?data.quest.value+' / '+data.quest.total:'';}
    if(data.distance!==undefined)query('#hud-distance').textContent=data.distance===null?'':data.distance+' m';
    if(data.boost!==undefined){query('#boost-fill').style.width=Math.round(data.boost*100)+'%';query('.speedometer').classList.toggle('boosting',!!data.boosting);query('#boost-label').textContent=state.movement?.braking?'BRAKING':data.boosting?'BOOST':data.boost<.02?'Recharging':matchMedia('(pointer: coarse)').matches?'Boost':'Space to boost, F to brake';}
    const race=data.race;root.classList.toggle('in-race',!!race);query('.race-hud').classList.toggle('hidden',!race);
    if(race){query('#race-name').textContent=race.name;query('#race-clock').textContent=formatTime(race.seconds);query('#race-gold').textContent=formatTime(race.gold);query('#race-medal').textContent=race.seconds<=race.gold?formatTime(race.gold-race.seconds)+' FOR GOLD':race.seconds<=race.gold*1.35?formatTime(race.gold*1.35-race.seconds)+' FOR SILVER':'FINISH THE RUN';query('#race-checkpoint-label').textContent='Checkpoint '+race.index+' / '+race.total+' ('+race.distance+' m)';query('#race-best').textContent=race.best?'PB '+formatTime(race.best):'First run';const key=race.id+':'+race.index;if(state.checkpointKey!==key){state.checkpointKey=key;query('#race-checkpoints').innerHTML=Array.from({length:race.total},(_,i)=>`<i class="${i<race.index-1?'complete':i===race.index-1?'current':''}"></i>`).join('');}}
    const countdown=race?.countdown||'';if(state.countdown!==countdown){state.countdown=countdown;const el=query('.race-countdown');el.textContent=countdown;el.classList.toggle('hidden',!countdown);}

    if(data.speed!==undefined)query('#hud-speed').textContent=String(Math.round(Math.max(0,data.speed)*3.6));
    if(data.heading!==undefined)setHeading(data.heading);
  }
  function setPaused(paused,data={}, {external=false}={}) {
    state.data={...state.data,...data};
    state.paused=paused;
    if(paused){resetStick();resetLook();touch.lookX=touch.lookY=0;touch.run=touch.jump=touch.interact=touch.mount=touch.boost=touch.brake=false;thumb.style.transform='';root.querySelectorAll('[data-touch]').forEach(el=>el.classList.remove('active'));}
    if(paused&&external&&dialog.open){dialog.close();state.panel=null;}
    if(paused&&!external&&!dialog.open)openPanel('pause');if(!paused&&dialog.open)closePanel(false);
  }
  function setHeading(degrees) {state.heading=degrees;const headings=['N','NE','E','SE','S','SW','W','NW'];query('#compass-heading').textContent=headings[Math.round(((degrees%360+360)%360)/45)%8];}
  function setCinematic({title='',text='',active=true}={}) {state.cinematic=active;query('.cinematic-layer').classList.toggle('hidden',!active);query('#cinematic-title').textContent=title;query('#cinematic-text').textContent=text;root.classList.toggle('in-cinematic',active);}
  function showError(message) {state.ready=false;closePanel(false);query('.loading-screen').classList.remove('hidden','loading-fade');query('#loading-message').textContent=message;query('.loading-content h1').textContent='Campus unavailable';query('.loading-error').classList.remove('hidden');query('.loading-track').classList.add('hidden');query('#loading-percent').textContent='';}
  return {
    endPhoto(){if(state.photo)action('photoDone');},
    teachControls(){query('.controls-note').classList.remove('hidden');schedule(()=>query('.controls-note').classList.add('hidden'),10000);},
    checkpoint(index,total){const el=query('.checkpoint-flash');el.textContent=`${index} / ${total} ✓`;el.classList.remove('hidden');schedule(()=>el.classList.add('hidden'),1000);},
    setLoading,ready,update,toast,openPanel,closePanel,setPaused,setHeading,setCinematic,showError,
    setMovement({stumble=null,braking=false,cameraLocked=false}={}){state.movement={stumble,braking,cameraLocked};query('.camera-reticle').classList.toggle('hidden',!cameraLocked||state.paused||state.photo);query('.recovery-card').classList.toggle('hidden',!stumble||state.paused);if(stumble){const title=stumble.kind==='crash'?'Scooter wipeout':'Tripped';if(query('#recovery-title').textContent!==title)query('#recovery-title').textContent=title;query('.recovery-track i').style.width=Math.round(stumble.phase*100)+'%';}root.classList.toggle('recovering',!!stumble);},
    setPlayerPosition(position){state.player=position;const now=performance.now();if(now-(state.miniLast||0)<180)return;state.miniLast=now;const scale=8,point=p=>({x:70+(p.x-position.x)*scale,y:70+(p.z-position.z)*scale});query('#mini-places').innerHTML=(position.places||[]).map(p=>{const v=point(p);return `<circle cx="${v.x.toFixed(1)}" cy="${v.y.toFixed(1)}" r="3" fill="#72966c"/>`;}).join('');query('#mini-characters').innerHTML=campusLifeMapMarkers([...(position.activities||[]),...(position.characters||state.data.characters||[])],point,{mini:true});const t=position.target?point(position.target):{x:-100,y:-100},target=query('#mini-target');target.setAttribute('cx',t.x);target.setAttribute('cy',t.y);query('#mini-player').setAttribute('transform',`translate(70 70) rotate(${180-position.yaw*180/Math.PI})`);},
    setCaption(caption){query('.voice-caption').classList.toggle('hidden',!caption);query('#caption-speaker').textContent=caption?.speaker||'';query('#caption-text').textContent=caption?.text||'';},
    showPhotograph(blob){if(state.lastPhoto)URL.revokeObjectURL(state.lastPhoto);state.lastPhoto=URL.createObjectURL(blob);openPanel('postcard');},
    celebrate(title){query('#celebration-title').textContent=title;query('.celebration').classList.remove('hidden');schedule(()=>query('.celebration').classList.add('hidden'),4000);},
    setPrompt(text){query('#hud-prompt').textContent=text||'';query('.interaction').classList.toggle('hidden',!text||state.cinematic);},
    getInput(){const result={...touch};touch.lookX=touch.lookY=0;touch.jump=touch.interact=touch.mount=false;return result;},
    dispose(){state.disposed=true;if(state.lastPhoto)URL.revokeObjectURL(state.lastPhoto);for(const cleanup of cleanups)cleanup();for(const id of timeouts)clearTimeout(id);if(dialog.open)dialog.close();root.innerHTML='';root.className='';},
  };
}
