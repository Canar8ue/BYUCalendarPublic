// Aggregate, cookieless usage analytics. Rows describe actions and coarse
// request context only — never account ids, names, emails, or IP addresses —
// matching the limits published on /privacy. Bots are filtered at ingestion.
import {dayKey} from './search.mjs';
import {lastDay,eventDays} from './catalog.mjs';

export const ANALYTIC_TYPES=['view','search','event_view','export','save','share','view_switch','directions'];
export const ANALYTICS_RETENTION_DAYS=180;
const BOT_UA=/bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptimerobot|bingpreview|facebookexternalhit|curl\/|wget\/|python-requests|node-fetch/i;

export function isBot(userAgent){return BOT_UA.test(String(userAgent||''));}

export function deviceClass(userAgent){
 const ua=String(userAgent||'');
 if(/iPad|Tablet/.test(ua)||(/Macintosh/.test(ua)&&/Touch/.test(ua)))return 'tablet';
 if(/Mobi|iPhone|iPod|Windows Phone/.test(ua)||( /Android/.test(ua)&&!/Tablet/.test(ua)))return 'mobile';
 return 'desktop';
}

// Keep only the referring site's host; same-site navigation and direct visits
// record as '' so the dashboard reads "where people came from", not URLs that
// could carry query-string identifiers from other sites.
export function cleanReferrer(referrer,host){
 if(!referrer)return '';
 try{
  const url=new URL(referrer);
  if(url.host===host)return '';
  return url.hostname.replace(/^www\./,'').slice(0,100);
 }catch{return '';}
}

function clip(value,max){const text=String(value??'').trim();return text?text.slice(0,max):'';}

// Accepts the client's posted events and returns sanitized rows, dropping
// anything malformed or outside the type allowlist rather than failing the batch.
export function normalizeAnalyticsEvents(input,context={}){
 if(!Array.isArray(input))return [];
 const country=clip(context.country,2).toUpperCase()||null;
 const device=context.device||null;
 const referrer=clip(context.referrer,100)||null;
 const rows=[];
 for(const item of input.slice(0,24)){
  if(!item||typeof item!=='object')continue;
  if(!ANALYTIC_TYPES.includes(item.type))continue;
  const name=clip(item.name,120);
  const detail=clip(item.detail,40);
  if(!name&&!detail)continue;
  rows.push({type:item.type,name,detail,country,device,referrer});
 }
 return rows;
}

let lastPrune=0;
export async function recordAnalytics(db,rows,now=new Date()){
 if(!rows.length)return 0;
 const ts=now.toISOString(),day=dayKey(now);
 const statements=rows.map(row=>db.prepare('INSERT INTO analytics_events (ts,day,type,name,detail,country,device,referrer) VALUES (?,?,?,?,?,?,?,?)')
  .bind(ts,day,row.type||'',row.name||'',row.detail||null,row.country||null,row.device||null,row.referrer||null));
 // Analytics rows expire on a fixed schedule (privacy policy: limited period);
 // pruning rides along with an ordinary write at most once per hour.
 if(now.getTime()-lastPrune>3600000){
  lastPrune=now.getTime();
  const cutoff=dayKey(new Date(now.getTime()-ANALYTICS_RETENTION_DAYS*86400000));
  statements.push(db.prepare('DELETE FROM analytics_events WHERE day<?').bind(cutoff));
 }
 await db.batch(statements);
 return rows.length;
}

function daysBack(n,now=new Date()){
 const out=[];const start=new Date(now.getTime()-(n-1)*86400000);
 for(let i=0;i<n;i++){const d=new Date(start.getTime()+i*86400000);out.push(dayKey(d));}
 return out;
}

function countsBy(db,field,type,cutoff,limit){
 return db.prepare(`SELECT ${field} AS name,COUNT(*) AS count FROM analytics_events WHERE type=? AND day>=? AND ${field} IS NOT NULL AND ${field}!='' GROUP BY ${field} ORDER BY count DESC, name LIMIT ?`)
  .bind(type,cutoff,limit).all().then(r=>r.results);
}

async function scalar(db,sql,...params){
 const row=await db.prepare(sql).bind(...params).first();
 return row?Object.values(row)[0]:0;
}

// Everything the moderator dashboard shows in one call: traffic aggregates from
// analytics_events plus the data-inventory view of the merged calendar itself.
export async function analyticsSummary(db,calendar,now=new Date()){
 const window=daysBack(30,now),cutoff=window[0],today=dayKey(now);
 const [byDay,topPages,topSearches,referrers,countries,devices,listings,communityTags,reportsOpen,reportsTotal,accountsTotal,accountsVerified,inboxTotal,inboxUnread]=await Promise.all([
  db.prepare('SELECT day,type,COUNT(*) AS count FROM analytics_events WHERE day>=? GROUP BY day,type').bind(cutoff).all().then(r=>r.results),
  countsBy(db,'name','view',cutoff,10),
  db.prepare("SELECT name,COUNT(*) AS count,SUM(CASE WHEN detail='0' THEN 1 ELSE 0 END) AS zeros FROM analytics_events WHERE type='search' AND day>=? GROUP BY name ORDER BY count DESC,name LIMIT 15").bind(cutoff).all().then(r=>r.results),
  countsBy(db,'referrer','view',cutoff,8),
  db.prepare("SELECT country AS name,COUNT(*) AS count FROM analytics_events WHERE day>=? AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 8").bind(cutoff).all().then(r=>r.results),
  db.prepare("SELECT device AS name,COUNT(*) AS count FROM analytics_events WHERE day>=? AND device IS NOT NULL GROUP BY device ORDER BY count DESC LIMIT 4").bind(cutoff).all().then(r=>r.results),
  scalar(db,'SELECT COUNT(*) FROM community_listings'),
  scalar(db,'SELECT COUNT(*) FROM community_tags'),
  scalar(db,"SELECT COUNT(*) FROM listing_reports WHERE status='open'"),
  scalar(db,'SELECT COUNT(*) FROM listing_reports'),
  scalar(db,'SELECT COUNT(*) FROM auth_user'),
  scalar(db,'SELECT COUNT(*) FROM auth_user WHERE emailVerified=1'),
  scalar(db,'SELECT COUNT(*) FROM inbound_emails'),
  scalar(db,'SELECT COUNT(*) FROM inbound_emails WHERE read_at IS NULL'),
 ]);
 const dayMap=new Map(byDay.map(r=>[r.day+'|'+r.type,r.count]));
 const pick=(day,type)=>dayMap.get(day+'|'+type)||0;
 const days=window.map(day=>({day,views:pick(day,'view'),searches:pick(day,'search'),eventViews:pick(day,'event_view'),exports:pick(day,'export')}));
 const sum=(type,from=0)=>days.slice(from).reduce((total,d)=>total+pick(d.day,type),0);
 const totals={views7:sum('view',23),views30:sum('view'),searches30:sum('search'),eventViews30:sum('event_view'),exports30:sum('export'),saves30:sum('save'),shares30:sum('share'),directions30:sum('directions')};

 const events=calendar.events||[];
 const upcoming=events.filter(e=>!e.cancelled&&lastDay(e)>=today);
 const byCategory=new Map();
 for(const e of upcoming)byCategory.set(e.category,(byCategory.get(e.category)||0)+1);
 const topTags=new Map();
 for(const e of upcoming)for(const tag of e.tags)topTags.set(tag,(topTags.get(tag)||0)+1);
 const topLocations=new Map();
 for(const e of upcoming){if(e.location)topLocations.set(e.location,(topLocations.get(e.location)||0)+1);}
 const nextDays=daysBack(14,now).map(day=>({day,count:upcoming.filter(e=>eventDays(e).includes(day)).length}));
 const inventory={
  totalEvents:events.length,
  upcomingEvents:upcoming.length,
  byCategory:[...byCategory].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
  topTags:[...topTags].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,15),
  topLocations:[...topLocations].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,10),
  nextDays,
 };
 return {generatedAt:now.toISOString(),days,totals,topPages,topSearches,zeroResultSearches:topSearches.filter(s=>s.zeros>0),referrers,countries,devices,sources:calendar.sources||[],inventory,community:{listings,communityTags,reportsOpen,reportsTotal,accountsTotal,accountsVerified,inboxTotal,inboxUnread}};
}
