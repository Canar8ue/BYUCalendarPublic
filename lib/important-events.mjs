// Signature once-a-year events — the big STEM fair, addresses by apostles
// and presidents, the Utah/BYU football game — always lead their day and
// carry a clear Important marker. Matching is hand-curated and conservative:
// rules anchor on the event title (with the devotional/forum series anchor
// for speaker events), never on loose description text, so ordinary club
// meetings with a "club president" never qualify. Extend this registry when
// a new signature event appears; do not push this into classify().
export const IMPORTANT_TAG='Important';

// Speaker honorifics require a capitalized name right after (a given name or
// an initial like "C. Shane Reese"), so "ASBYU president announced" or
// lowercase prose cannot trip the rule.
const SENIOR_SPEAKER=/\b(?:Elder|President|Apostle|Prophet|elder|president|apostle|prophet)\s+[A-Z](?:\.|[a-z])/;
const SENIOR_GROUP=/\b(?:First Presidency|Quorum of the Twelve)\b/;
const DEVOTIONAL_SERIES=/\b(?:devotional|forum|inauguration)\b/i;

const IMPORTANT_RULES=[
  {
    id:'stem-fair',label:'Annual STEM fair',
    match:event=>/\bstem\s+(?:career\s+)?fair\b/i.test(event.title)||/\b(?:career\s+)?stem\s+fair\b/i.test(event.title),
  },
  {
    // Devotionals and forums where the speaker is a General Authority or the
    // BYU/church president — the talks the whole campus talks about.
    id:'senior-address',label:'Apostle or president address',
    match:event=>DEVOTIONAL_SERIES.test(event.title)&&(SENIOR_SPEAKER.test(`${event.title} ${event.description||''}`)||SENIOR_GROUP.test(`${event.title} ${event.description||''}`)),
  },
  {
    id:'holy-war',label:'Utah vs BYU football',
    match:event=>/\bfootball\b/i.test(event.title)&&/\b(?:utah|utes)\b/i.test(event.title)&&/\bbyu\b/i.test(event.title),
  },
];

export function importantLabel(event){
  for(const rule of IMPORTANT_RULES)if(rule.match(event))return rule.label;
  return '';
}

// Read-time layering (same principle as event_overrides): stored snapshots
// stay untouched, and next year's occurrences flag themselves automatically.
export function applyImportantEvents(events){
  return events.map(event=>{
    const label=importantLabel(event);
    if(!label)return event;
    return {...event,important:label,tags:event.tags.includes(IMPORTANT_TAG)?event.tags:[...event.tags,IMPORTANT_TAG]};
  });
}

// Important events lead their day; timed events precede all-day listings;
// otherwise keep the merged calendar's start-time/title order.
export function dayOrder(a,b){
  const rank=(event)=>event.important?1:0;
  if(rank(a)!==rank(b))return rank(b)-rank(a);
  const timed=(event)=>event.allDay?0:1;
  if(timed(a)!==timed(b))return timed(b)-timed(a);
  return a.start.localeCompare(b.start)||a.title.localeCompare(b.title);
}
