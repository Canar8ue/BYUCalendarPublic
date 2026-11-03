import {database} from '../db';
import seed from '../data/seed.json';
import {SOURCES,UNCONNECTED,mergeEvents,lastDay,classify} from './catalog.mjs';
import {applyImportantEvents} from './important-events.mjs';
import {importSource} from './source-import.mjs';
import {communityCalendar} from './community-store.mjs';
import type {CampusEvent,CalendarData} from '../app/types';

type Snapshot={id:string;payload:string;last_success:string;last_attempt:string|null;error:string|null;lock_until:number};

async function ensureSeed(){
 const db=database();
 const existing=new Set((await db.prepare('SELECT id FROM source_snapshots').all<{id:string}>()).results.map(r=>r.id));
 const missing=SOURCES.filter(s=>!existing.has(s.id));
 // Add newly connected sources to existing databases as well as fresh installations.
 if(missing.length)await db.batch(missing.map(source=>{const saved=seed.find(s=>s.id===source.id);return db.prepare('INSERT INTO source_snapshots (id,payload,last_success,lock_until) VALUES (?,?,?,0) ON CONFLICT(id) DO NOTHING').bind(source.id,JSON.stringify(saved?.events||[]),saved?.lastSuccess||'1970-01-01T00:00:00Z');}));
 for(const source of SOURCES.filter(s=>s.kind==='snapshot')){const saved=seed.find(s=>s.id===source.id);if(saved)await db.prepare('UPDATE source_snapshots SET payload=?,last_success=?,error=NULL WHERE id=? AND last_success<?').bind(JSON.stringify(saved.events),saved.lastSuccess,source.id,saved.lastSuccess).run();}
 return db;
}
// The merged calendar only changes when a source refresh or a community/moderation
// mutation runs, so a short shared cache avoids recomputing ~1400 events per view.
let calendarCache:{at:number;data:CalendarData}|null=null;
const CALENDAR_CACHE_MS=30000;
export function invalidateCalendar(){calendarCache=null;}
export async function readCalendar():Promise<CalendarData>{
 if(calendarCache&&Date.now()-calendarCache.at<CALENDAR_CACHE_MS)return calendarCache.data;
 const data=await buildCalendar();
 calendarCache={at:Date.now(),data};
 return data;
}
async function buildCalendar():Promise<CalendarData>{
 const db=await ensureSeed(),rows=(await db.prepare('SELECT * FROM source_snapshots').all<Snapshot>()).results;
 const all:CampusEvent[]=[],today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const statuses=SOURCES.map(source=>{const row=rows.find(r=>r.id===source.id);const events:CampusEvent[]=row?JSON.parse(row.payload).map((e:CampusEvent)=>classify(e,{IsFree:e.free===null?undefined:String(e.free)})):[];all.push(...events);
   return {id:source.id,name:source.name,url:source.url,count:events.filter(e=>!e.cancelled&&lastDay(e)>=today).length,lastSuccess:row?.last_success==='1970-01-01T00:00:00Z'?null:row?.last_success||null,error:row?.error||null,enabled:true,snapshot:source.kind==='snapshot',note:source.note};});
 // Signature events are flagged at read time so next year's occurrences mark
 // themselves and source refreshes never lose the Important tag.
 const events=applyImportantEvents(await communityCalendar(db,mergeEvents(all)) as CampusEvent[]);
 const community=events.filter(e=>e.community);
 return {events,sources:[...statuses,...(community.length?[{id:'community',name:'Community listings',url:'/',enabled:true,count:community.filter(e=>!e.cancelled&&lastDay(e)>=today).length,lastSuccess:null,error:null,note:'Published by members with verified BYU email addresses. Details are community submitted.'}]:[]),...UNCONNECTED.map(s=>({...s,enabled:false,count:0,lastSuccess:null,error:null}))],stored:true};
}
export async function refreshCalendar(force=false){
 const db=await ensureSeed(),rows=(await db.prepare('SELECT * FROM source_snapshots').all<Snapshot>()).results;let refreshed=0;
 for(const source of SOURCES){
   if(source.kind==='snapshot')continue;
   const row=rows.find(r=>r.id===source.id),checked=Date.parse(row?.last_attempt||row?.last_success||'1970-01-01'),interval=force?300000:row?.error?900000:3600000;
   if(Date.now()-checked<interval)continue;
   const lease=Date.now()+120000,acquired=await db.prepare('UPDATE source_snapshots SET lock_until=?,last_attempt=? WHERE id=? AND lock_until<? RETURNING id').bind(lease,new Date().toISOString(),source.id,Date.now()).first();if(!acquired)continue;
   try{
     const result=await importSource(source,{previous:row?JSON.parse(row.payload):[]});
     await db.prepare('UPDATE source_snapshots SET payload=?,last_success=?,error=?,lock_until=0 WHERE id=? AND lock_until=?').bind(JSON.stringify(result.events),new Date().toISOString(),result.warning,source.id,lease).run();refreshed++;
   }catch(error){
     console.error('Calendar source refresh failed',source.id,error instanceof Error?error.message:'Unknown error');
     await db.prepare('UPDATE source_snapshots SET error=?,lock_until=0 WHERE id=? AND lock_until=?').bind('Could not refresh this source. Previously collected events are still available.',source.id,lease).run();
   }
 }
 if(refreshed)invalidateCalendar();
 return {refreshed};
}
