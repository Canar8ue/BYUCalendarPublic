import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readCalendar} from '../../../lib/calendar-server';
import {localDate,lastDay,timeLabel,eventDays,splitDescriptionProvenance} from '../../../lib/catalog.mjs';
import type {CampusEvent} from '../../types';
import BrandY from '../../brand-y';

export const dynamic='force-dynamic';

const SITE='https://byucalendar.com';

function dateTitle(date:string,options:Intl.DateTimeFormatOptions={weekday:'long',month:'long',day:'numeric'}){return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}

// schema.org dates carry the venue's real UTC offset instead of a trailing Z so
// search results show Mountain Time correctly across DST transitions.
function denverStamp(iso:string,allDay:boolean){
 if(allDay)return iso.slice(0,10);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
 if(!parts.year)return null;
 const offset=parts.timeZoneName==='GMT'?'+00:00':parts.timeZoneName.replace('GMT','');
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function eventJsonLd(event:CampusEvent){
 const url=SITE+'/events/'+encodeURIComponent(event.id);
 const start=denverStamp(event.start,event.allDay);
 if(!start)return null;
 const end=event.allDay?(event.end&&event.end!==event.start?lastDay(event):null):(event.end?denverStamp(event.end,false):null);
 const online=event.format==='Online';
 const node:Record<string,unknown>={
  '@context':'https://schema.org',
  '@type':'Event',
  name:event.title,
  startDate:start,
  ...(end?{endDate:end}:{}),
  eventStatus:'https://schema.org/'+(event.cancelled?'EventCancelled':'EventScheduled'),
  ...(event.format?{eventAttendanceMode:'https://schema.org/'+(online?'OnlineAttendanceMode':event.format==='Hybrid'?'MixedEventAttendanceMode':'OfflineAttendanceMode')}:{}),
  location:online
   ?{'@type':'VirtualLocation',name:'Online',url}
   :{'@type':'Place',name:event.location||'Brigham Young University',address:{'@type':'PostalAddress',addressLocality:'Provo',addressRegion:'UT',addressCountry:'US'}},
  organizer:{'@type':'Organization',name:event.organizer||event.sourceName},
  url,
  image:SITE+'/og-image.png',
  ...(event.description?{description:event.description.slice(0,2000)}:{}),
 };
 if(event.free===true)node.offers=[{'@type':'Offer',price:'0',priceCurrency:'USD',url,availability:'https://schema.org/'+(event.cancelled?'SoldOut':'InStock')}];
 if(event.free!==null)node.isAccessibleForFree=event.free;
 return node;
}

async function findEvent(id:string){
 const data=await readCalendar();
 return data.events.find(e=>e.id===id)||null;
}

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const event=await findEvent(id);
 if(!event)return {title:'Event not found',robots:{index:false,follow:false}};
 const detail=splitDescriptionProvenance(event.description||'');
 const description=(detail.description||`${event.title} at BYU — ${event.location||'campus'}.`).replace(/\s+/g,' ').slice(0,155);
 return {
  title:event.title,
  description,
  alternates:{canonical:'/events/'+encodeURIComponent(event.id)},
  openGraph:{title:event.title,description,type:'article',url:'/events/'+encodeURIComponent(event.id)},
 };
}

export default async function EventPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const event=await findEvent(id);
 if(!event)notFound();
 const jsonLd=eventJsonLd(event);
 const detail=splitDescriptionProvenance(event.description||'');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const days=eventDays(event);
 const past=days.every(d=>d<today);
 const calendarHref='/?event='+encodeURIComponent(event.id);
 const facts:{label:string;value:string}[]=[
  {label:'Date',value:dateTitle(localDate(event))+(lastDay(event)!==localDate(event)?' – '+dateTitle(lastDay(event),{month:'long',day:'numeric'}):'')},
  {label:'Time',value:(event.allDay?'All day':timeLabel(event)+' MT')+(event.end&&!event.allDay?' – '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'}).format(new Date(event.end))+' MT':'')},
  {label:'Location',value:event.location||'Location not listed'},
  ...(event.format?[{label:'Format',value:event.format}]:[]),
  ...(event.audience?[{label:'Audience',value:event.audience}]:[]),
  {label:'Admission',value:event.free===true?'Free':event.free===false?'Paid — check the source':'Check the source'},
  ...(event.food==='yes'||event.snacks==='yes'||event.drinks==='yes'?[{label:'Refreshments',value:[event.food==='yes'?'Food provided':null,event.snacks==='yes'?'Snacks':null,event.drinks==='yes'?'Drinks':null].filter(Boolean).join(' · ')}]:[]),
 ];
 return <div className="event-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/>
  <header className="event-page-head">
   <Link prefetch={false} className="event-page-brand" href="/"><BrandY className="brand-y"/><span>BYU Calendar</span></Link>
  </header>
  <main className="event-page-card">
   <div className="eyebrow">{event.category}</div>
   {event.community&&<div className="community-badge listing-badge">Community submitted · {event.organizer}</div>}
   <h1>{event.cancelled&&<span className="cancelled-label">Cancelled · </span>}{event.title}</h1>
   {past&&<p className="event-page-ended">This event has already taken place. It stays online as a record of what campus offered.</p>}
   <dl className="event-page-facts">
    {facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
   </dl>
   {event.tags.length>0&&<div className="event-page-tags">{event.tags.map(tag=><a key={tag} href={'/?tags='+encodeURIComponent(tag)}>{tag}</a>)}</div>}
   {detail.description
    ?<div className="event-page-description"><h2>About this event</h2><p>{detail.description}</p>{detail.provenance&&<p className="event-page-provenance">{detail.provenance}</p>}</div>
    :<p className="event-page-description event-page-muted">The source has not provided a description. Follow the original listing for details.</p>}
   <div className="event-page-actions">
    <a className="primary-button" href={calendarHref}>Open in BYU Calendar</a>
    <a className="outline-button" href={'/api/events/ics?id='+encodeURIComponent(event.id)}>Add to personal calendar</a>
    {event.url&&<a className="outline-button" href={event.url} target="_blank" rel="noreferrer">Original listing ↗</a>}
   </div>
   <p className="event-page-source">Listed from <a href={event.url||'/'} target="_blank" rel="noreferrer">{event.sourceName}</a>{event.additionalSources?.map((s,i)=><span key={i}> · <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)} — details may change; check the organizer&apos;s listing before attending. Independent student project, not an official BYU service.</p>
  </main>
 </div>;
}
