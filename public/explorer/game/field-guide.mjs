import {medalFor, formatTime} from './racing.mjs?v=20261105rider6';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function racePanel(data) {
 const p=data.progress||{},trials=data.trials||[],gold=trials.filter(t=>medalFor(p.bestTimes?.[t.id],t.targetSeconds)==='gold').length;
 return `<p class="trail-note">Skateboard time trials. Push with W, hold Shift for sprint pushes, and brake with S or F.</p><div class="race-select">${trials.map((t,i)=>{
  const best=p.bestTimes?.[t.id],medal=medalFor(best,t.targetSeconds);
  const xs=t.points.map(p=>p.x),zs=t.points.map(p=>p.z),minX=Math.min(...xs),minZ=Math.min(...zs),scale=Math.max(Math.max(...xs)-minX,Math.max(...zs)-minZ,.1);
  const route=t.points.map(p=>[20+(p.x-minX)/scale*160,10+(p.z-minZ)/scale*60]);
  return `<article class="race-course"><div class="course-art course-${i}" aria-hidden="true"><span>0${i+1}</span><svg viewBox="0 0 220 80"><polyline points="${route.map(p=>p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${route.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" fill="currentColor"/>`).join('')}</svg></div><div class="course-copy"><h4>${esc(t.name)}</h4><p>${t.points.length-1} checkpoints, gold at ${formatTime(t.targetSeconds)}</p><div class="course-best ${medal||''}">${medal?medal.toUpperCase()+' '+formatTime(best):'No time recorded'}${p.bestRuns?.[t.id]?'<small>Personal ghost ready</small>':''}</div><button class="primary" data-trial="${esc(t.id)}">${best?'Race again':'Race'} →</button></div></article>`;
 }).join('')}</div><div class="race-unlocks"><span>${gold} of ${trials.length} gold medals</span><p>${gold===0?'First gold unlocks the Track jacket.':gold<3?'Track jacket unlocked. Win every gold for the Comet deck.':'Track jacket & Comet deck unlocked.'}</p><button class="small-button" data-action="wardrobe">Wardrobe →</button></div>`;
}

export function raceResultPanel(data) {
 const r=data.raceResult;if(!r)return racePanel(data);
 return `<div class="race-result ${r.medal||''}"><h3>${r.medal?r.medal.charAt(0).toUpperCase()+r.medal.slice(1)+' medal':'Race finished'}</h3>${r.newBest?'<p>Personal best</p>':''}<p>${esc(r.name)}</p><strong class="result-time">${formatTime(r.seconds)}</strong><div class="result-stats"><span>BEST <b>${formatTime(r.best)}</b></span><span>GOLD <b>${formatTime(r.targetSeconds)}</b></span><span>EARNED <b>+${r.xp} XP</b></span></div>${r.previous?`<p class="result-delta">${r.seconds<r.previous?formatTime(r.previous-r.seconds)+' faster':formatTime(r.seconds-r.previous)+' off your best'}</p>`:''}<div class="button-row"><button class="primary" data-trial="${esc(r.id)}">Race again →</button><button class="secondary" data-action="races">Choose a course</button></div><button class="result-explore" data-action="resume">Keep exploring</button></div>`;
}
export function collectionPanel(data){
 const p=data.progress||{},achievements=data.achievements||[],secrets=data.secrets||[];
 return `<div class="guide-tabs"><button data-action="map">Passport</button><button data-action="quests">Journal</button><button class="active" data-action="collection">Collections</button><button data-action="wardrobe">Wardrobe</button></div><div class="collection-hero"><div><p>${achievements.filter(a=>a.complete).length} / ${achievements.length} achievements, ${(p.secrets||[]).length} / ${secrets.length} secret postcards</p></div></div><h3 class="section-title">Achievements</h3><div class="achievement-grid">${achievements.map(a=>`<article class="achievement ${a.complete?'earned':''}"><span>${a.complete?'✦':'◇'}</span><div><b>${esc(a.title)}</b><p>${esc(a.description)}</p><div class="mini-progress"><i style="width:${Math.round(a.value/a.target*100)}%"></i></div><small>${a.complete?'UNLOCKED':a.value+' / '+a.target}</small></div></article>`).join('')}</div><h3 class="section-title collection-title">Postcards</h3><div class="secret-grid">${secrets.map((s,i)=>{const found=(p.secrets||[]).includes(s.id);return `<article class="secret-card ${found?'found':''}"><span class="postcard-no">POSTCARD ${String(i+1).padStart(2,'0')}</span><span class="secret-illustration">${found?['◉','✿','♧','♧','♫','➶','✦','◒','⌂','➜','☁','✉'][i]:'?'}</span><b>${found?esc(s.name):'Undiscovered'}</b><p>${found?esc(data.secretStories?.[s.id]):''}</p><span class="postcard-stamp">${found?'COLLECTED':'MISSING'}</span></article>`;}).join('')}</div>`;
}
function boardPreview(board, top) {
 const id='board-'+board.id+(top?'-grip':'-art'), base=top?board.grip:board.color;
 const accent=board.accent, ink=board.ink;
 let graphic='';
 if(top){
  graphic=`<path d="M15 58L40 44L65 58M18 202H62" fill="none" stroke="${accent}" stroke-width="7"/><pattern id="${id}-fleck" width="9" height="13" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r=".8" fill="${ink}" opacity=".5"/></pattern><rect width="80" height="250" fill="url(#${id}-fleck)"/>`;
  if(board.graphic==='wave')graphic+=`<path d="M40 25Q15 60 40 95T40 165T40 225" fill="none" stroke="${accent}" stroke-width="3"/>`;
 }else{
  switch(board.graphic){
   case 'checker':
    graphic=`<pattern id="${id}-check" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${accent}"/><rect x="16" y="16" width="16" height="16" fill="${accent}"/></pattern><rect width="80" height="250" fill="url(#${id}-check)"/><path d="M0 105H80V145H0Z" fill="${ink}"/>`;break;
   case 'wave':
    graphic=[30,70,110,150,190,230].map(y=>`<path d="M0 ${y}Q40 ${y-35} 80 ${y}" fill="none" stroke="${accent}" stroke-width="18"/><path d="M0 ${y+13}Q40 ${y-22} 80 ${y+13}" fill="none" stroke="${ink}" stroke-width="3"/>`).join('');break;
   case 'sun':
    graphic=Array.from({length:12},(_,i)=>`<path d="M37 100L31 0H49L43 100Z" fill="${ink}" transform="rotate(${i*30} 40 125)"/>`).join('')+`<circle cx="40" cy="125" r="30" fill="${accent}"/><circle cx="40" cy="125" r="23" fill="none" stroke="${base}" stroke-width="3"/>`;break;
   case 'paw':
    graphic=`<ellipse cx="40" cy="140" rx="21" ry="28" fill="${ink}"/>`+[[17,105],[31,84],[49,84],[63,105]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="8" ry="15" fill="${accent}"/>`).join('');break;
   case 'comet':
    graphic=`<path d="M55 73L-25 250H15L72 95Z" fill="${ink}"/><path d="M55 73L-5 250H5L63 88Z" fill="${accent}"/><circle cx="55" cy="73" r="17" fill="${accent}"/><circle cx="20" cy="50" r="2" fill="${ink}"/><circle cx="63" cy="190" r="3" fill="${ink}"/>`;break;
   case 'bolt':
    graphic=`<path d="M48 25L12 133H37L23 227L69 110H45L65 25Z" fill="${accent}"/><path d="M10 218L70 207" stroke="${ink}" stroke-width="3"/>`;break;
   case 'bloom':
    graphic=`<path d="M40 220Q15 190 40 125" fill="none" stroke="${ink}" stroke-width="5"/>`+Array.from({length:5},(_,i)=>`<ellipse cx="40" cy="93" rx="15" ry="30" fill="${accent}" transform="rotate(${i*72} 40 125)"/>`).join('')+`<circle cx="40" cy="125" r="12" fill="${ink}"/>`;break;
   case 'orbit':
    graphic=`<circle cx="40" cy="125" r="20" fill="${ink}"/><ellipse cx="40" cy="125" rx="37" ry="53" fill="none" stroke="${accent}" stroke-width="5" transform="rotate(-30 40 125)"/><circle cx="23" cy="47" r="3" fill="${accent}"/><circle cx="62" cy="207" r="2" fill="${accent}"/>`;break;
   default:
    graphic=`<path d="M-5 95L85 133M-5 62L85 100M-5 128L85 166" stroke="${accent}" stroke-width="12"/><path d="M14 0V250M66 0V250" stroke="${ink}" stroke-width="3"/>`;
  }
  graphic+=`<path d="M0 12H80M0 238H80" stroke="${ink}" stroke-width="12"/>`;
 }
 return `<span class="board-preview-side"><svg viewBox="0 0 80 250" role="img" aria-label="${esc(board.name)} ${top?'grip':'underside'}"><defs><clipPath id="${id}"><rect x="8" y="3" width="64" height="244" rx="32"/></clipPath></defs><g clip-path="url(#${id})"><rect width="80" height="250" fill="${base}"/>${graphic}</g><rect x="8" y="3" width="64" height="244" rx="32" fill="none" stroke="#bc9867" stroke-width="2"/>${[70,180].map(y=>[29,51].map(x=>`<circle cx="${x}" cy="${y}" r="2" fill="${top?'#ddd8bf':'#39464b'}"/>`).join('')).join('')}</svg><span>${top?'Grip':'Underside'}</span></span>`;
}
export function wardrobePanel(data){
 const p=data.progress||{},level=data.level||1;
 const cards=(kind,list)=>list.map(c=>{
  const unlocked=(!c.level||level>=c.level)&&(!c.quest||(p.quests||[]).includes(c.quest))&&(!c.activity||(p.campusLife?.completed||[]).includes(c.activity))&&(!c.gold||(data.trials||[]).filter(t=>medalFor(p.bestTimes?.[t.id],t.targetSeconds)==='gold').length>=c.gold);
  const equipped=unlocked&&p.cosmetics?.[kind]===c.id, activityName=data.activities?.find(a=>a.id===c.activity)?.title||'Skate practice';
  const preview=kind==='outfit'?`<span class="cosmetic-preview outfit" style="--cloth:${c.jacket};--pack:${c.pack}"><i></i><b></b><em></em></span>`:`<span class="board-preview">${boardPreview(c,true)}${boardPreview(c,false)}</span>`;
  const stats=kind==='deck'?`<p class="board-description">${esc(c.description)}</p><span class="board-stats">${[['Acceleration',c.acceleration],['Top speed',c.topSpeed],['Ollie lift',c.pop]].map(([label,value])=>`<span>${label}<b>${Math.round(value*100)}%</b></span>`).join('')}</span>`:'';
  const status=equipped?'Equipped':unlocked?'Equip':c.activity?'Finish '+activityName:c.gold?'Earn '+c.gold+' gold medal'+(c.gold===1?'':'s'):c.quest==='cat'?'Finish Paws and Effect':c.quest==='cosmo'?'Find all three Cosmos':'Unlocks at level '+c.level;
  return `<button class="cosmetic-card ${kind==='deck'?'board-card ':''}${equipped?'equipped':''}" data-cosmetic="${kind}:${esc(c.id)}" ${unlocked?'':'disabled'} aria-pressed="${equipped}">${preview}<strong>${esc(c.name)}</strong>${stats}<small>${esc(status)}</small></button>`;
 }).join('');
 return `<div class="guide-tabs"><button data-action="map">Passport</button><button data-action="quests">Journal</button><button data-action="collection">Collections</button><button class="active" data-action="wardrobe">Wardrobe</button></div><p class="trail-note">Level ${level}</p><h3 class="section-title">Outfits</h3><div class="cosmetic-grid">${cards('outfit',data.outfits||[])}</div><h3 class="section-title collection-title">Skateboards</h3><p class="board-guide">Compare the grip and underside. Stats are relative to Campus blue. Higher ollie lift also gives longer air time.</p><div class="cosmetic-grid board-grid">${cards('deck',data.decks||[])}</div>`;
}
export const welcomePanel=()=>`<div class="welcome-copy"><div class="play-modes"><button class="primary" data-action="skateYard">Skate yard</button><button class="secondary" data-action="skateDownhill">Summit descent</button><button class="secondary" data-action="skateCampus">Skate campus</button><button class="secondary" data-action="beginAdventure">Adventure</button><button class="secondary" data-action="campusLife">Campus life</button><button class="secondary" data-action="hike">Y Trail</button><button class="secondary" data-action="races">Time trials</button><button class="secondary" data-action="freeRoam">Free roam</button></div></div>`;
export function finalePanel(data){const p=data.progress||{};return `<div class="finale-stats"><div><b>${(p.visited||[]).length}</b><span>landmarks visited</span></div><div><b>${(p.quests||[]).length}</b><span>${(p.quests||[]).length===1?'story finished':'stories finished'}</span></div><div><b>${(p.secrets||[]).length}</b><span>postcards</span></div></div><div class="button-row"><button class="primary" data-action="resume">Resume</button><button class="secondary" data-action="collection">Collection</button><button class="secondary" data-action="exit">Back to the calendar</button></div>`;}
