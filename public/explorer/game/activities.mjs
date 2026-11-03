import {UNIT} from './content.mjs?v=20261102polish6';
import {NPC_DEFINITIONS,ACTIVITIES,ACTIVITY_REWARDS,DISTRICT_POINTS,COOKIE_CHOICES,RHYTHM_SEQUENCE,INTERACTION_DISTANCE} from './district-content.mjs?v=20261102polish6';

const object = value => !!value&&typeof value==='object'&&!Array.isArray(value);
const integer = (value,max) => Number.isInteger(value)?Math.max(0,Math.min(max,value)):0;
const known = (values,allowed) => Array.isArray(values)?[...new Set(values.filter(value=>allowed.includes(value)))]:[];
const nearby = (a,b,r=INTERACTION_DISTANCE) => !!a&&!!b&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Math.hypot(a.x-b.x,a.z-b.z)<=r;
const byId = id => ACTIVITIES.find(a=>a.id===id);
const npcById = id => NPC_DEFINITIONS.find(n=>n.id===id);
const stage = (s,id) => s[byId(id)?.npcId]?.stage||0;
const completed = (s,id) => stage(s,id)===byId(id)?.total;

export function createCampusLife(){
  return {version:1,clock:0,met:[],talks:{},completed:[],maya:{stage:0,cookie:null,pennants:[],cards:[]},eli:{stage:0},nora:{stage:0,gate:0,masteryGate:0,crashes:0},jun:{stage:0},sofia:{stage:0,photos:[]}};
}

export function validateCampusLife(raw){
  const s=createCampusLife();if(!object(raw)||raw.version!==1)return s;
  s.clock=Number.isFinite(raw.clock)?Math.max(0,Math.min(1e8,raw.clock)):0;
  const ids=NPC_DEFINITIONS.map(n=>n.id);s.met=known(raw.met,ids);
  if(object(raw.talks))for(const id of ids)s.talks[id]=integer(raw.talks[id],99);
  for(const a of ACTIVITIES)if(object(raw[a.npcId]))s[a.npcId].stage=integer(raw[a.npcId].stage,a.total);
  s.maya.cookie=COOKIE_CHOICES.includes(raw.maya?.cookie)?raw.maya.cookie:null;
  s.maya.pennants=known(raw.maya?.pennants,DISTRICT_POINTS.pennants.map(p=>p.id));
  s.maya.cards=known(raw.maya?.cards,['eli','jun','sofia']);
  if(s.maya.stage>=2&&!s.maya.cookie)s.maya.stage=1;
  if(s.maya.stage>=3&&s.maya.pennants.length<3)s.maya.stage=2;
  if(s.maya.stage>=4&&s.maya.cards.length<3)s.maya.stage=3;
  if(s.maya.stage<2){s.maya.cookie=null;s.maya.pennants=[];s.maya.cards=[];}else if(s.maya.stage<3)s.maya.cards=[];
  if(s.maya.stage===2&&s.maya.pennants.length===3)s.maya.stage=3;
  if(s.maya.stage===3&&s.maya.cards.length===3)s.maya.stage=4;
  s.nora.gate=integer(raw.nora?.gate,3);s.nora.masteryGate=integer(raw.nora?.masteryGate,3);s.nora.crashes=integer(raw.nora?.crashes,99);
  if(s.nora.stage>=3&&s.nora.gate<3)s.nora.stage=2;
  if(s.nora.stage===5&&s.nora.masteryGate<3)s.nora.stage=4;
  if(s.nora.stage<2)s.nora.gate=0;if(s.nora.stage<4)s.nora.masteryGate=0;
  if(s.nora.stage===2&&s.nora.gate===3)s.nora.stage=3;
  if(s.nora.stage===4&&s.nora.masteryGate===3)s.nora.stage=5;
  s.sofia.photos=known(raw.sofia?.photos,DISTRICT_POINTS.photos.map(p=>p.id));
  if(s.sofia.stage>=2&&s.sofia.photos.length<2)s.sofia.stage=1;
  if(s.sofia.stage===0)s.sofia.photos=[];
  if(s.sofia.stage===1&&s.sofia.photos.length===2)s.sofia.stage=2;
  // No arbitrary reward ledger is imported. Earned ids derive from supported
  // completion state; the enclosing progress registry awards them once.
  s.completed=ACTIVITIES.filter(a=>completed(s,a.id)).map(a=>a.id);
  return s;
}

export function completedActivityRewards(s){return ACTIVITY_REWARDS.filter(r=>completed(s,r.activityId));}
export function isActivityComplete(s,id){return !!byId(id)&&completed(s,id);}

export function activityTarget(s,id){
  if(!byId(id)||completed(s,id))return null;
  const p=DISTRICT_POINTS;
  if(id==='cookie-stand'){
    if(s.maya.stage===2)return p.pennants.find(v=>!s.maya.pennants.includes(v.id));
    if(s.maya.stage===3){const npc=['eli','jun','sofia'].find(v=>!s.maya.cards.includes(v));return {npcId:npc,...characterAnchor(s,npc)};}
    return {...p.stand,npcId:'maya'};
  }
  if(id==='newcomer')return s.eli.stage===1?p.jkb:s.eli.stage===3?{...p.stand,npcId:'maya'}:{...characterAnchor(s,'eli'),npcId:'eli'};
  if(id==='scooter-school'){
    if(s.nora.stage===2)return p.gates[s.nora.gate];
    if(s.nora.stage===4)return p.gates[s.nora.masteryGate];
    return {...p.nora,npcId:'nora'};
  }
  if(id==='campus-duet')return s.jun.stage===2?{...p.stand,npcId:'maya'}:{...characterAnchor(s,'jun'),npcId:'jun'};
  if(s.sofia.stage===1)return p.photos.find(v=>!s.sofia.photos.includes(v.id));
  return {...characterAnchor(s,'sofia'),npcId:'sofia'};
}

// Quest requirements outrank the optional daily routine, so returning to a
// character never depends on being online at a real-world hour.
export function characterAnchor(s,id){
  const p=DISTRICT_POINTS,npc=npcById(id);if(!npc)return null;
  if(id==='maya')return p.stand;
  if(id==='eli')return s.eli.stage>=2?p.jkb:p.library;
  if(id==='nora')return p.nora;
  if(id==='jun')return s.jun.stage>=3?p.stand:s.jun.stage>=1?p.music:p.arts;
  if(id==='sofia')return s.sofia.stage>=2?p.stand:p.moa;
  return npc.work;
}

export function activityStatus(s,id){
  const a=byId(id);if(!a)return {title:'Campus life',text:'Meet Maya at the cookie stand',value:0,total:1};
  const n=s[a.npcId],status=n.stage===a.total?'completed':n.stage?'active':'available';
  const text={
    'cookie-stand':[
      'Meet Maya at the fictional cookie and football stand.',
      'Choose a cookie from Maya’s tray.',
      `Arrange the pennants (${s.maya.pennants.length}/3).`,
      `Hand game-day cards to Eli, Jun and Sofia (${s.maya.cards.length}/3).`,
      'Return to Maya and see the finished stand.',
      'The stand is ready. Maya remembers your help.',
    ],
    newcomer:[
      'Meet Eli by the library approach.',
      'Walk with Eli to Jesse Knight. Stay nearby so he can follow.',
      'Talk to Eli at Jesse Knight about his next stop.',
      'Collect a welcome card from Maya’s stand.',
      'Bring the welcome card back to Eli at Jesse Knight.',
      'Eli knows his way around and has his welcome card.',
    ],
    'scooter-school':[
      'Meet Nora at the Library Lane scooter workshop.',
      'Ride above 2 m/s, then brake to under 1.2 m/s near Nora.',
      `Ride the practice gates in order (${s.nora.gate}/3). Keep below 6.5 m/s.`,
      'Return to Nora for the careful-turning challenge.',
      `Ride three careful gates (${s.nora.masteryGate}/3), below 4 m/s. Brake at the last gate.`,
      'The workshop deck is yours. Practice again whenever you like.',
    ],
    'campus-duet':[
      'Meet Jun on the Arts approach.',
      'Meet Jun at Music and play his visual call-and-response.',
      'Invite Maya to Jun’s short gathering at her stand.',
      'Meet Jun back at the stand for the afternoon duet.',
      'Jun and Maya’s gathering has become part of the district.',
    ],
    'photo-board':[
      'Meet Sofia outside the Museum of Art.',
      `Frame the library and Arts Building (${s.sofia.photos.length}/2) in Photo mode.`,
      'Meet Sofia at the stand and hang your photographs on the board.',
      'Your two compositions are on the district photo board.',
    ],
  }[id][n.stage];
  return {title:a.title,text,value:n.stage,total:a.total,status};
}

export function activityObjectives(s){return ACTIVITIES.map(a=>({...activityStatus(s,a.id),id:a.id,npcId:a.npcId,color:npcById(a.npcId).color,name:npcById(a.npcId).name,description:a.description,reward:a.reward}));}

const unchanged = message => ({changed:false,message});
function changed(s,message,before){
  const reward=ACTIVITY_REWARDS.find(r=>!before.includes(r.id)&&completed(s,r.activityId));
  s.completed=ACTIVITIES.filter(a=>completed(s,a.id)).map(a=>a.id);
  return {changed:true,message,...(reward?{reward:{id:reward.id,xp:reward.xp}}:{})};
}

// The runtime supplies measured world positions/movement/camera evidence.
// Merely clicking a dialogue choice cannot satisfy a physical challenge.
export function applyCampusAction(s,action,context={}){
  if(!object(s)||s.version!==1||typeof action!=='string'||!object(context))return unchanged('No campus-life action.');
  const before=completedActivityRewards(s).map(r=>r.id),p=DISTRICT_POINTS;
  const at=(point,r)=>nearby(context.position,point,r);
  const talkTo=(id,fallback=characterAnchor(s,id))=>(context.npcId||context.actorId)===id&&at(context.npcPosition||fallback);
  const done=message=>changed(s,message,before);
  if(action.startsWith('meet:')){
    const id=action.slice(5);if(!npcById(id)||!talkTo(id))return unchanged('Move closer to talk.');
    if(!s.met.includes(id))s.met.push(id);s.talks[id]=Math.min(99,(s.talks[id]||0)+1);return done('You spoke with '+npcById(id).name+'.');
  }
  if(action==='decline')return unchanged('Come back whenever you like.');
  if(action==='maya:start'&&s.maya.stage===0&&talkTo('maya')){s.maya.stage=1;return done('Maya offers the tray. Choose a cookie.');}
  if(action.startsWith('maya:cookie:')&&s.maya.stage===1&&talkTo('maya')){
    const cookie=action.slice(12);if(!COOKIE_CHOICES.includes(cookie))return unchanged('Choose a cookie from the tray.');
    s.maya.cookie=cookie;s.maya.stage=2;return done('One '+cookie+' cookie, coming up. Help arrange three pennants.');
  }
  if(action.startsWith('maya:pennant:')&&s.maya.stage===2){
    const id=action.slice(13),point=p.pennants.find(v=>v.id===id);if(!point||s.maya.pennants.includes(id)||!at(point))return unchanged('Find a pennant site nearby.');
    s.maya.pennants.push(id);if(s.maya.pennants.length===3)s.maya.stage=3;
    return done(s.maya.stage===3?'The pennants are ready. Hand cards to Eli, Jun and Sofia.':'Pennant arranged. The plaza is taking shape.');
  }
  if(action.startsWith('maya:card:')&&s.maya.stage===3){
    const id=action.slice(10);if(!['eli','jun','sofia'].includes(id)||s.maya.cards.includes(id)||!talkTo(id))return unchanged('Bring the card to its recipient.');
    s.maya.cards.push(id);if(s.maya.cards.length===3)s.maya.stage=4;return done(npcById(id).name+' accepts the game-day card.');
  }
  if(action==='maya:finish'&&s.maya.stage===4&&talkTo('maya')){s.maya.stage=5;return done('Cookie crew! Maya saves your colors and a thank-you at the stand.');}
  if(action==='eli:start'&&s.eli.stage===0&&talkTo('eli')){s.eli.stage=1;return done('Eli will walk with you to Jesse Knight. Stay within 12 m.');}
  if(action==='eli:arrive'&&s.eli.stage===1&&context.grounded===true&&at(p.jkb)&&nearby(context.companionPosition,p.jkb,4*UNIT)){
    s.eli.stage=2;return done('Eli reaches Jesse Knight with you. Talk to him here.');
  }
  if(action==='eli:errand'&&s.eli.stage===2&&talkTo('eli')){s.eli.stage=3;return done('Ask Maya for a welcome card, then bring it back to Eli.');}
  if(action==='eli:collect'&&s.eli.stage===3&&talkTo('maya')){s.eli.stage=4;return done('Maya hands you Eli’s welcome card.');}
  if(action==='eli:finish'&&s.eli.stage===4&&talkTo('eli')){s.eli.stage=5;return done('Eli tucks the welcome card into his map. A familiar face, found.');}
  if(action==='nora:start'&&s.nora.stage===0&&talkTo('nora')){s.nora.stage=1;return done('First: a clean stop. Ride, then hold F or Brake near Nora.');}
  if(action==='nora:crash'&&s.nora.stage>0&&s.nora.crashes<99){s.nora.crashes++;return done('Nora: Take a breath. We can practice the stop again.');}
  if(action==='nora:brake'&&s.nora.stage===1&&context.grounded===true&&at(p.nora,10*UNIT)&&context.riding===true&&context.braking===true&&Number.isFinite(context.speed)&&context.speed>=0&&context.speed<1.2&&Number.isFinite(context.previousSpeed)&&context.previousSpeed>2){
    s.nora.stage=2;return done('Clean stop! Follow Nora’s three practice gates below 6.5 m/s.');
  }
  if(action==='nora:gate'&&[2,4].includes(s.nora.stage)){
    const mastery=s.nora.stage===4,key=mastery?'masteryGate':'gate',index=s.nora[key],point=p.gates[index],limit=mastery?4:6.5;
    if(!point||context.gateIndex!==index||context.riding!==true||context.grounded!==true||!Number.isFinite(context.travelled)||context.travelled<.05||!Number.isFinite(context.speed)||context.speed<.35||context.speed>limit||!at(point,3*UNIT)||mastery&&index===2&&context.braking!==true)return unchanged(mastery?'Keep below 4 m/s and brake at the final gate.':'Ride the next practice gate below 6.5 m/s.');
    s.nora[key]++;if(s.nora[key]===3)s.nora.stage=mastery?5:3;
    return done(s.nora.stage===5?'Careful turns, clean stop. Nora’s workshop deck is yours.':s.nora.stage===3?'Practice complete. Return to Nora for the mastery route.':'Gate '+(index+1)+' cleared.');
  }
  if(action==='nora:mastery'&&s.nora.stage===3&&talkTo('nora')){s.nora.stage=4;return done('Careful-turning challenge: below 4 m/s, and brake through the last gate.');}
  if(action==='jun:start'&&s.jun.stage===0&&talkTo('jun')){s.jun.stage=1;return done('Jun takes his case to Music. Meet him there to rehearse.');}
  if(action==='jun:rhythm'&&s.jun.stage===1&&at(p.music)&&talkTo('jun')&&Array.isArray(context.notes)&&context.notes.length===RHYTHM_SEQUENCE.length&&context.notes.every((n,i)=>n===RHYTHM_SEQUENCE[i])){
    s.jun.stage=2;return done('That is the phrase! Invite Maya to a little gathering at the stand.');
  }
  if(action==='jun:invite'&&s.jun.stage===2&&talkTo('maya')){s.jun.stage=3;return done('Maya makes room at the stand. Meet Jun there.');}
  if(action==='jun:finish'&&s.jun.stage===3&&at(p.stand)&&talkTo('jun')){s.jun.stage=4;return done('Jun plays the afternoon duet. Maya taps the rhythm on the counter.');}
  if(action==='sofia:start'&&s.sofia.stage===0&&talkTo('sofia')){s.sofia.stage=1;return done('Sofia needs two compositions: the library and Arts. Use Photo mode to frame each building.');}
  if(action.startsWith('sofia:photo:')&&s.sofia.stage===1){
    const id=action.slice(12),point=p.photos.find(v=>v.id===id);if(!point||s.sofia.photos.includes(id)||!at(point,5*UNIT)||!Number.isFinite(context.framing)||context.framing<.4||context.framing>1.001)return unchanged('Stand at the composition and frame the building in Photo mode.');
    s.sofia.photos.push(id);if(s.sofia.photos.length===2)s.sofia.stage=2;
    return done(s.sofia.stage===2?'Both compositions are ready. Meet Sofia at the stand’s photo board.':'Sofia: That entrance catches the light. Now find the other composition.');
  }
  if(action==='sofia:finish'&&s.sofia.stage===2&&at(p.stand)&&talkTo('sofia')){s.sofia.stage=3;return done('Two photographs join the board. Sofia’s project has its first chapter.');}
  return unchanged('That step is not available here yet.');
}
