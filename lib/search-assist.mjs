// Natural-language search backup: turns a free-form request like "I want to go
// to a ballet" into the same filter shape the deterministic parser produces, so
// the calendar can apply it with matchesEvent. Only the visitor's query text is
// sent to the model; no event data, account data, or secrets leave the server.
import {CATEGORIES,INTEREST_TAGS} from './catalog.mjs';

export const ASSIST_TAGS=[...INTEREST_TAGS,'Food provided','Snacks','Drinks','Free admission','Open invite','In person','Online','RSVP / tickets','Important'];
export const ASSIST_CATEGORIES=CATEGORIES.map(category=>category.id);

const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function buildPrompt(query,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const weekday=dayNames[new Date(today+'T12:00:00Z').getUTCDay()];
 const system=[
  'You translate a visitor\'s event-search request into structured filters for BYU Calendar (byucalendar.com), a campus events calendar for Brigham Young University in Provo, Utah (Mountain Time).',
  `Today is ${today} (${weekday}). Respond with ONLY a JSON object — no prose, no code fences — shaped exactly like:`,
  '{"summary":"...","tags":[],"categories":[],"start":null,"end":null,"afterMinutes":null,"words":[]}',
  'Rules:',
  '- summary: one short sentence (max 90 characters) describing what will be shown, from the visitor\'s point of view, e.g. "Dance performances this weekend".',
  `- tags: only values from this list: ${ASSIST_TAGS.join(', ')}. Pick the ones that match what the visitor wants; [] when none fit.`,
  `- categories: only values from this list: ${ASSIST_CATEGORIES.join(', ')}; [] when unclear.`,
  '- start and end: inclusive event dates as YYYY-MM-DD, resolving phrases like "this weekend" or "next Friday" against today; null when no date is implied. end must not be before start.',
  '- afterMinutes: earliest start time of day in minutes (0-1439) for phrases like "after 5 pm"; null otherwise.',
  '- words: up to 4 lowercase words or short phrases that would LITERALLY appear inside matching event titles or descriptions (subjects like "ballet", "chemistry", "pickleball", titled shows like "nutcracker"); [] when unsure — tags and categories should carry the request instead. Never echo the whole request, and never include mood or filler words like "magical", "fun", "want", "event".',
  '- If the request is already a simple keyword search, return just {"summary":"...","words":["<keyword>"]} with everything else empty.',
 ].join('\n');
 return [{role:'system',content:system},{role:'user',content:query}];
}

// Models may wrap the JSON in code fences or prose; the first { to the last }
// is the payload. Returns null when nothing parseable is present.
export function extractJSON(text){
 if(typeof text!=='string')return null;
 const start=text.indexOf('{');const end=text.lastIndexOf('}');
 if(start<0||end<=start)return null;
 try{return JSON.parse(text.slice(start,end+1));}catch{return null;}
}

const isoDate=/^\d{4}-\d{2}-\d{2}$/;
function realDate(value){
 if(typeof value!=='string'||!isoDate.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z')))return null;
 return value;
}
function cleanWords(input){
 if(!Array.isArray(input))return [];
 const words=[];
 for(const item of input.slice(0,8)){
  const word=String(item??'').toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu,' ').replace(/\s+/g,' ').trim();
  if(word.length>=2&&word.length<=40&&/\p{L}|\p{N}/u.test(word)&&!words.includes(word))words.push(word);
  if(words.length>=4)break;
 }
 return words;
}
// Clamps a model-supplied interpretation to the filter vocabulary and sane
// date ranges. Returns null when nothing usable survives — the caller then
// fails honestly instead of filtering by invented criteria.
// Models drift toward lowercase ("performances"); match tags and categories
// case-insensitively so clamping keeps the canonical vocabulary spelling.
const canonical=(value,vocabulary)=>{
 const lower=String(value??'').trim().toLowerCase();
 return vocabulary.find(known=>known.toLowerCase()===lower)||null;
};
export function interpretAssist(text,now=new Date()){
 const raw=extractJSON(text);
 if(!raw||typeof raw!=='object')return null;
 const tags=[...new Set((Array.isArray(raw.tags)?raw.tags:[]).map(tag=>canonical(tag,ASSIST_TAGS)).filter(Boolean))].slice(0,4);
 const categories=[...new Set((Array.isArray(raw.categories)?raw.categories:[]).map(category=>canonical(category,ASSIST_CATEGORIES)).filter(Boolean))].slice(0,2);
 let start=realDate(raw.start);let end=realDate(raw.end);
 if(start&&start<new Date(now.getTime()-400*86400000).toISOString().slice(0,10))start=null;
 if(start&&start>new Date(now.getTime()+730*86400000).toISOString().slice(0,10))start=null;
 if(end&&!start)end=null;
 if(start&&end&&end<start)[start,end]=[end,start];
 let after=typeof raw.afterMinutes==='number'&&Number.isFinite(raw.afterMinutes)?Math.round(raw.afterMinutes):null;
 if(after===null||after<0||after>1439)after=null;
 const words=cleanWords(raw.words);
 const summary=String(raw.summary??'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,140);
 if(!tags.length&&!categories.length&&!start&&!after&&!words.length)return null;
 return {intent:{tags,categories,start,end,after,words},summary:summary||'Interpreted search results'};
}

// Identical queries repeat (debounces, reloads, several visitors typing the
// same phrase), so interpretations are memoized briefly to spare the model.
const CACHE_TTL=6*3600000,CACHE_MAX=300;
const cache=new Map();
export function cachedInterpretation(query,now=Date.now()){
 const key=String(query).trim().toLowerCase();
 const hit=cache.get(key);
 if(!hit)return null;
 if(hit.expires<now){cache.delete(key);return null;}
 return hit.value;
}
export function rememberInterpretation(query,value,now=Date.now()){
 const key=String(query).trim().toLowerCase();
 cache.set(key,{value,expires:now+CACHE_TTL});
 if(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value);
}
