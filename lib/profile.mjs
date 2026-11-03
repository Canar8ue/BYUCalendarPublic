// Interest-profile chat and traditional recommendation scoring for "Picked
// for you" on My calendar. The chat asks a handful of questions with tappable
// options and a free-response box; the question text and option wording come
// from the configured chat model (DeepSeek by default) but are clamped here
// to the calendar's own vocabularies, and every recommendation is computed
// deterministically on our servers from the stored profile plus
// exponentially-decayed activity counters — no model involvement in ranking.
import {CATEGORIES,INTEREST_TAGS,localDate,lastDay} from './catalog.mjs';
import {dayKey} from './search.mjs';
import {extractJSON} from './search-assist.mjs';

export const PROFILE_CATEGORIES=CATEGORIES.map(category=>category.id);
export const PROFILE_INTERESTS=INTEREST_TAGS;
export const PROFILE_DETAILS=['Food provided','Snacks','Drinks','Free admission','Open invite','In person','Online'];
export const CHAT_MAX_STEPS=5;
// Conversation phrasing a member is allowed to pick; answers map onto the
// canonical vocabularies below, anything else is conversation-only.
const VOCABULARY=[...PROFILE_INTERESTS,...PROFILE_CATEGORIES,...PROFILE_DETAILS];
const VOCABULARY_LOOKUP=new Map(VOCABULARY.map(value=>[value.toLowerCase(),value]));
const ANSWER_ALIASES=new Map([
  ['free food','Food provided'],['food','Food provided'],['anything free','Free admission'],
  // The model phrases options naturally; map common multi-word wordings onto
  // the short canonical tags they mean.
  ['information systems','IS'],['info systems','IS'],['cs','Computer Science'],
  ['career and business','Career & business'],['arts and culture','Arts & culture'],
  ['sports and recreation','Sports & recreation'],['faith and learning','Faith & learning'],
  ['both',''],['everything',''],['all of them',''],['none of these',''],['not sure',''],['no preference',''],['skip',''],
]);
// Free-response answers (and unrecognized option wordings) are mined for the
// calendar's own vocabulary, so a member can type "I'm in IS and I love free
// food" in their own words. Short acronyms (IS, AIS, ACME, CS) only match in
// caps so ordinary words like "is" never become interests.
const FREE_TEXT_EXTRA=new Map([
  ['is major','IS'],['is program','IS'],['is student','IS'],
  ['CS','Computer Science'],['coding','Computer Science'],['programming','Computer Science'],['tech','Computer Science'],['technology','Computer Science'],
  ['shows','Performances'],['performances','Performances'],['performance','Performances'],
  ['devotional','Faith & learning'],['devotionals','Faith & learning'],
  ['sports','Sports & recreation'],['athletics','Sports & recreation'],['arts','Arts & culture'],
  ['career','Career & business'],['careers','Career & business'],['business','Career & business'],
  ['pizza','Food provided'],['lunch','Food provided'],['dinner','Food provided'],['refreshments','Food provided'],
  ['free stuff','Free admission'],['free entry','Free admission'],
  ['virtual','Online'],['remote','Online'],['in-person','In person'],
]);
const escapeRegExp=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const phraseEntries=[];
for(const value of VOCABULARY)phraseEntries.push([value,value]);
for(const [phrase,value] of ANSWER_ALIASES)if(value)phraseEntries.push([phrase,value]);
for(const [phrase,value] of FREE_TEXT_EXTRA)phraseEntries.push([phrase,value]);
const seenPhrases=new Set();
const FREE_TEXT_MATCHERS=phraseEntries
  .filter(([phrase])=>{const key=phrase.toLowerCase();if(seenPhrases.has(key))return false;seenPhrases.add(key);return true;})
  .map(([phrase,value])=>({phrase,value,acronym:/^[A-Z]{2,}$/.test(phrase)}))
  .sort((a,b)=>b.phrase.length-a.phrase.length);

// Recommendations stay deliberately general: one stated interest also credits
// its neighboring interests and the categories that interest usually lives
// in, so an IS member sees AIS and IS-club events rather than only exact-tag
// matches. Extend these maps — never invent per-event rules.
const RELATED_INTEREST_PAIRS=[
  ['IS',['AIS','Computer Science','ACME','Networking','Recruiting','Entrepreneurship']],
  ['AIS',['IS','Accounting','Computer Science','Networking','Recruiting','Finance']],
  ['Accounting',['AIS','Finance','Recruiting','Networking']],
  ['Finance',['Accounting','AIS','Recruiting']],
  ['Marketing',['Recruiting','Networking','Entrepreneurship']],
  ['Engineering',['Computer Science','Math']],
  ['Computer Science',['IS','Engineering','Math','ACME']],
  ['Math',['Engineering','Computer Science','ACME']],
  ['ACME',['Math','Computer Science','IS']],
  ['Entrepreneurship',['Marketing','Networking','IS']],
];
export const RELATED_INTERESTS=new Map(RELATED_INTEREST_PAIRS.map(([interest])=>[interest,new Set()]));
for(const [interest,neighbors] of RELATED_INTEREST_PAIRS){
  for(const neighbor of neighbors){
    if(!RELATED_INTERESTS.has(neighbor))RELATED_INTERESTS.set(neighbor,new Set());
    RELATED_INTERESTS.get(interest).add(neighbor);
    RELATED_INTERESTS.get(neighbor).add(interest);
  }
}
export const INTEREST_CATEGORIES={
  'Career & business':['IS','AIS','Accounting','Finance','Marketing','Recruiting','Networking','Entrepreneurship'],
  'Academic':['Engineering','Computer Science','Math','ACME','Life Sciences','Law'],
  'Arts & culture':['Performances'],
  'Campus life':['Clubs','International'],
};

// Stated practical details also reach their natural neighbors at a smaller
// weight, so a "free food" answer surfaces snack and drinks events alongside
// the full meals. Extend this map — never invent per-event rules.
const RELATED_DETAIL_PAIRS=[
  ['Food provided',['Snacks','Drinks']],
];
export const RELATED_DETAILS=new Map(RELATED_DETAIL_PAIRS.map(([detail])=>[detail,new Set()]));
for(const [detail,neighbors] of RELATED_DETAIL_PAIRS){
  for(const neighbor of neighbors){
    if(!RELATED_DETAILS.has(neighbor))RELATED_DETAILS.set(neighbor,new Set());
    RELATED_DETAILS.get(detail).add(neighbor);
    RELATED_DETAILS.get(neighbor).add(detail);
  }
}

// How strongly one recorded action counts toward a taste. Saving is the
// clearest signal; passive views count the least.
export const ACTIVITY_WEIGHTS={event_view:1,save:3,share:2,directions:2,export:2,map_view:2};
// Interest decays with a 45-day half-life: this semester's habits matter,
// last semester's fade out.
export const ACTIVITY_HALF_LIFE_MS=45*86400000;

export function buildChatPrompt(answers,now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(now);
  const qa=answers.length?answers.map(a=>`${a.question} -> ${(a.options||[]).join('; ')||'(skipped)'}${a.free?` | typed: ${a.free}`:''}`).join('\n'):'(none yet)';
  const system=[
    'You are the friendly onboarding assistant for BYU Calendar (byucalendar.com), a campus events calendar for Brigham Young University in Provo, Utah.',
    `Today is ${today}. You ask ONE short question at a time to learn what kind of campus events the member cares about, so the calendar can suggest events.`,
    'Respond with ONLY a JSON object — no prose, no code fences — shaped exactly like one of:',
    '{"question":"...","key":"...","options":["...","..."],"multiple":false}',
    '{"done":true,"summary":"..."}',
    'Rules:',
    '- Ask about interests and event kinds first (what they study or care about), then practical preferences (food, cost, in person vs online).',
    '- Keep questions broad — the goal is a full calendar of everything they might enjoy, not a narrow slice. Specific niches come from their own typed answers.',
    `- Interest options should come from these real calendar interests: ${PROFILE_INTERESTS.join(', ')}.`,
    `- Event-kind options should come from: ${PROFILE_CATEGORIES.join(', ')}.`,
    `- Practical options can use: ${PROFILE_DETAILS.join(', ')}.`,
    '- The member may answer in their own words instead of tapping an option; typed answers appear after "typed:" and count like any other answer.',
    '- question: at most 110 characters, warm and plain, no emojis, no greetings after the first question.',
    '- key: a short stable slug for the question (2-24 chars, letters/numbers/dashes), unique per question.',
    '- options: 3 to 5 short options (each 2-30 characters). Include one escape option like "None of these" or "Not sure" when fitting.',
    '- multiple: true when picking several options is natural (interests), false for single-choice questions.',
    `- Ask at most ${CHAT_MAX_STEPS} questions total. When you have enough (or the answers say so), return done with a one-line summary of their taste (max 90 characters), e.g. "IS and AIS events with free food".`,
    '- Never ask for names, emails, or anything identifying. Never invent events.',
  ].join('\n');
  return [{role:'system',content:system},{role:'user',content:'Answers so far:\n'+qa+'\n\nGive the next question, or finish with done.'}];
}

const cleanText=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const KEY_SHAPE=/^[a-z0-9][a-z0-9-]{1,23}$/;

// Clamps a model-supplied chat step to the shapes above; null when unusable,
// so the caller can fail honestly instead of rendering model prose.
export function interpretChatStep(text){
  const raw=extractJSON(text);
  if(!raw||typeof raw!=='object')return null;
  if(raw.done===true){
    const summary=cleanText(raw.summary,90);
    return {done:true,summary:summary||'Your picks are ready.'};
  }
  const question=cleanText(raw.question,120);
  const key=String(raw.key||'').toLowerCase().trim();
  const options=[...new Set((Array.isArray(raw.options)?raw.options:[]).map(option=>cleanText(option,36)).filter(option=>option.length>=2))].slice(0,5);
  if(question.length<8||!KEY_SHAPE.test(key)||options.length<2)return null;
  return {done:false,question,key,options,multiple:raw.multiple===true};
}

// Maps chosen quick replies onto the canonical vocabularies. Unrecognized
// wording stays conversation-only; caps keep a playful answer set from
// becoming a blanket "everything" profile.
export function canonicalAnswer(value){
  const text=String(value??'').trim().toLowerCase();
  if(!text)return '';
  if(ANSWER_ALIASES.has(text))return ANSWER_ALIASES.get(text);
  return VOCABULARY_LOOKUP.get(text)||'';
}
// Mines a free-response sentence (or an unrecognized option wording) for
// vocabulary terms: longest phrases first, word boundaries required, acronyms
// case-sensitive. Anything unrecognized simply contributes nothing.
export function canonicalFreeText(value){
  const raw=String(value??'').trim().slice(0,300);
  if(!raw)return [];
  const lower=raw.toLowerCase();
  const found=new Set();
  for(const matcher of FREE_TEXT_MATCHERS){
    const pattern=matcher.acronym
      ?new RegExp('(?<![a-zA-Z0-9])'+escapeRegExp(matcher.phrase)+'(?![a-zA-Z0-9])')
      :new RegExp('(?<![a-zA-Z0-9])'+escapeRegExp(matcher.phrase.toLowerCase())+'(?![a-zA-Z0-9])','i');
    if(pattern.test(matcher.acronym?raw:lower)){
      found.add(matcher.value);
      if(found.size>=8)break;
    }
  }
  return [...found];
}
export function profileFromAnswers(answers){
  const interests=new Set(),categories=new Set(),details=new Set();
  for(const answer of (Array.isArray(answers)?answers:[]).slice(0,CHAT_MAX_STEPS+1)){
    const values=[];
    for(const option of (Array.isArray(answer?.options)?answer.options:[]).slice(0,6)){
      const canonical=canonicalAnswer(option);
      if(canonical){values.push(canonical);continue;}
      values.push(...canonicalFreeText(option));
    }
    values.push(...canonicalFreeText(answer?.free));
    for(const value of values){
      if(PROFILE_INTERESTS.includes(value))interests.add(value);
      else if(PROFILE_CATEGORIES.includes(value))categories.add(value);
      else if(PROFILE_DETAILS.includes(value))details.add(value);
    }
  }
  return {interests:[...interests].slice(0,10),categories:[...categories].slice(0,4),details:[...details].slice(0,5)};
}
export function profileEmpty(profile){
  return !profile||(!profile.interests?.length&&!profile.categories?.length&&!profile.details?.length);
}
// Progressive chat storage: each exchange is merged into the stored profile
// (existing values first, then the new ones, caps still enforced) so a typed
// answer takes effect immediately — even if the conversation is abandoned or
// the model hiccups. A completed conversation replaces the profile wholesale.
export function mergeProfiles(existing,update){
  const pick=(a,b,cap)=>[...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])].slice(0,cap);
  return {
    interests:pick(existing?.interests,update?.interests,10),
    categories:pick(existing?.categories,update?.categories,4),
    details:pick(existing?.details,update?.details,5),
  };
}

// Exponentially-decayed taste counters: existing score first ages by the time
// since it was last touched, then the new action's weight is added.
export function decayedScore(score,updatedAt,now=Date.now()){
  const age=now-Date.parse(updatedAt||'');
  if(!Number.isFinite(age)||age<=0)return score;
  return score*Math.pow(0.5,age/ACTIVITY_HALF_LIFE_MS);
}
export function nextActivityScore(score,updatedAt,weight,now=Date.now()){
  return decayedScore(score,updatedAt,now)+weight;
}

// Deterministic recommendation pass. Every contribution below is a plain
// weight: stated profile interests (plus their neighbors and implied
// categories, so one interest fills the calendar instead of narrowing it),
// engaged categories/tags (decayed), a small practical-detail bonus, and a
// gentle so-moreish-sooner freshness nudge. On top sits a base score so
// preferences RANK the calendar rather than filter it: a member who says
// "Food provided" lifts food events across the whole window while the rest
// of campus still populates My calendar underneath. The base applies only
// when the member has some signal (a stored profile or recorded activity);
// with neither, nothing clears the bar and the panel keeps its
// getting-started prompt. Returns picks with the human-readable reasons
// that drove them.
export const RECOMMENDATION_BASE_SCORE=1.2;
export function scoreEvent(event,{profile,activity=new Map(),savedIds=[],now=new Date()}={}){
  const saved=new Set(savedIds);
  if(saved.has(event.id)||event.cancelled)return null;
  const today=dayKey(now);
  const firstDay=localDate(event);
  if(lastDay(event)<today||firstDay>new Date(now.getTime()+45*86400000).toISOString().slice(0,10))return null;
  const activityFor=value=>activity.get(value)||0;
  // The whole nearby calendar stays in play; matches only rank higher.
  const hasSignal=!profileEmpty(profile)||activity.size>0;
  // Neighboring interests and the categories an interest usually lives in —
  // the "more general" half of the scoring.
  const stated=new Set(profile?.interests||[]);
  const relatedTo=new Map();
  for(const interest of stated)for(const tag of RELATED_INTERESTS.get(interest)||[])if(!relatedTo.has(tag))relatedTo.set(tag,interest);
  // Same neighbor idea for stated practical details: "Food provided" also
  // lifts snack and drinks events, at a smaller weight.
  const statedDetails=new Set(profile?.details||[]);
  const relatedDetails=new Map();
  for(const detail of statedDetails)for(const other of RELATED_DETAILS.get(detail)||[])if(!relatedDetails.has(other))relatedDetails.set(other,detail);
  const impliedCategories=new Set(Object.keys(INTEREST_CATEGORIES).filter(category=>INTEREST_CATEGORIES[category].some(interest=>stated.has(interest))));
  const reasons=[];
  let score=hasSignal?RECOMMENDATION_BASE_SCORE:0;
  for(const tag of event.tags||[]){
    if(PROFILE_INTERESTS.includes(tag)){
      // Stated interests carry the base weight, their neighbors a smaller one
      // (reason says so); unstated tags count only through activity.
      const base=stated.has(tag)?2.5:relatedTo.has(tag)?1.4:0;
      const contribution=base+2*activityFor(tag);
      if(contribution>0){score+=contribution;reasons.push({label:stated.has(tag)?tag:'Related: '+tag,contribution});}
    }else if(PROFILE_DETAILS.includes(tag)){
      const statedDetail=statedDetails.has(tag);
      const contribution=(statedDetail?1.2:relatedDetails.has(tag)?0.7:0)+1*activityFor(tag);
      if(contribution>0){score+=contribution;reasons.push({label:statedDetail?tag:'Related: '+tag,contribution});}
    }
  }
  if(profile?.categories?.includes(event.category)){score+=1.5;reasons.push({label:event.category,contribution:1.5});}
  else if(impliedCategories.has(event.category)){score+=0.6;reasons.push({label:event.category,contribution:0.6});}
  score+=1.5*activityFor(event.category);
  const daysAhead=Math.max(0,(Date.parse(event.start)-now.getTime())/86400000);
  score+=Math.max(0,1-daysAhead/45)*0.8;
  reasons.sort((a,b)=>b.contribution-a.contribution);
  // General fill has no specific driver; the honest chip says so.
  const labels=reasons.slice(0,3).map(reason=>reason.label);
  return {score,reasons:labels.length?labels:['Campus pick']};
}

export function recommendEvents(events,{profile,activityRows=[],savedIds=[],now=new Date(),limit=24,threshold=1.5}={}){
  const activity=new Map((Array.isArray(activityRows)?activityRows:[]).filter(row=>row&&(row.kind==='tag'||row.kind==='category')).map(row=>[row.value,row.score]));
  const scored=[];
  for(const event of events){
    const result=scoreEvent(event,{profile,activity,savedIds,now});
    if(result&&result.score>=threshold)scored.push({id:event.id,score:Math.round(result.score*100)/100,reasons:result.reasons});
  }
  scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // The picks list belongs to the matches first: stated interests, their
  // neighbors, and stated details fill every slot before any general pick
  // appears, so "AIS and free food" yields AIS events, IS-related events,
  // and food events — not a general slice of campus. General "Campus pick"
  // fill only arrives when matches run short, and its dialog says so
  // honestly instead of claiming a match.
  const isGeneral=pick=>pick.reasons.length===1&&pick.reasons[0]==='Campus pick';
  const matched=scored.filter(pick=>!isGeneral(pick));
  const general=scored.filter(isGeneral);
  const chosen=new Set();
  const take=(list,count)=>{const picked=[];for(const pick of list){if(picked.length>=count)break;if(chosen.has(pick.id))continue;chosen.add(pick.id);picked.push(pick);}return picked;};
  const combined=take(matched,limit);
  if(combined.length<limit)combined.push(...take(general,limit-combined.length));
  return combined.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
