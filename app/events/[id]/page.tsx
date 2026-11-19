import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readCalendar} from '../../../lib/calendar-server';
import {eventDays,splitDescriptionProvenance,displayCategory,displayTag} from '../../../lib/catalog.mjs';
import BrandY from '../../brand-y';
import SiteFooter from '../../site-footer';
import SourceFreshness from '../../source-freshness';
import {eventDateLabel,eventTimeLabel,eventVenueLabel,eventJsonLd,jsonLdText,splitDescriptionLinks} from '../../../lib/event-presentation.mjs';
import {topicForTag,topicForCategory} from '../../../lib/topics.mjs';

export const dynamic='force-dynamic';

async function findEvent(id:string){
 const data=await readCalendar();
 return {event:data.events.find(e=>e.id===id)||null,sources:data.sources};
}

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const {event}=await findEvent(id);
 if(!event)return {title:'Event not found',robots:{index:false,follow:false}};
 const detail=splitDescriptionProvenance(event.description||'');
 const description=(detail.description||`${event.title} at BYU — ${event.location||'campus'}.`).replace(/\s+/g,' ').slice(0,155);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const past=eventDays(event).every(d=>d<today);
 return {
  title:event.title,
  description,
  ...(past?{robots:{index:false,follow:true}}:{}),
  alternates:{canonical:'/events/'+encodeURIComponent(event.id)},
  openGraph:{title:event.title,description,type:'article',url:'/events/'+encodeURIComponent(event.id)},
 };
}

export default async function EventPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const {event,sources}=await findEvent(id);
 if(!event)notFound();
 const jsonLd=eventJsonLd(event);
 const detail=splitDescriptionProvenance(event.description||'');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const days=eventDays(event);
 const past=days.every(d=>d<today);
 const calendarHref='/?event='+encodeURIComponent(event.id);
 const categoryTopic=topicForCategory(event.category);
 const facts:{label:string;value:ReactNode}[]=[
  {label:'Date',value:eventDateLabel(event)},
  {label:'Time',value:eventTimeLabel(event)},
  {label:'Location',value:eventVenueLabel(event)},
  ...(event.format?[{label:'Format',value:displayTag(event.format)}]:[]),
  ...(event.audience?[{label:'Audience',value:displayTag(event.audience)}]:[]),
  {label:'Admission',value:event.free===true?'Free':event.free===false?(event.url?<>Paid — <a className="detail-source-link" href={event.url} target="_blank" rel="noreferrer">Check Source</a></>:'Paid — Check Source'):(event.url?<a className="detail-source-link" href={event.url} target="_blank" rel="noreferrer">Check Source</a>:'Check Source')},
  ...(event.food==='yes'||event.snacks==='yes'||event.drinks==='yes'?[{label:'Refreshments',value:[event.food==='yes'?'Food Provided':null,event.snacks==='yes'?'Snacks':null,event.drinks==='yes'?'Drinks':null].filter(Boolean).join(' · ')}]:[]),
 ];
 return <div className="event-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLdText(jsonLd)}}/>
  <header className="event-page-head">
   <Link prefetch={false} className="event-page-brand" href="/"><BrandY className="brand-y"/><span>BYU Calendar</span></Link>
   <nav className="event-page-nav" aria-label="Main navigation"><Link prefetch={false} className="nav-item" href="/">Discover</Link><Link prefetch={false} className="nav-item" href="/?section=saved">My Calendar</Link><Link prefetch={false} className="nav-item" href="/?view=map">Campus Map</Link></nav>
  </header>
  <main className="event-page-card">
   <div className="eyebrow">{categoryTopic?<a href={'/topics/'+categoryTopic.slug}>{displayCategory(event.category)}</a>:displayCategory(event.category)}</div>
   {event.community&&<div className={'community-badge listing-badge'+(event.byuOfficial?' byu-badge':'')}>{event.byuOfficial?'BYU added event · '+event.organizer:'Community submitted · '+event.organizer}</div>}
   <h1>{event.cancelled&&<span className="cancelled-label">Cancelled · </span>}{event.title}</h1>
   {past&&<p className="event-page-ended">This event has already taken place. It stays online as a record of what campus offered.</p>}
   <dl className="event-page-facts">
    {facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
   </dl>
   {event.tags.length>0&&<div className="event-page-tags">{event.tags.map(tag=>{const topic=topicForTag(tag);return <a key={tag} href={topic?'/topics/'+topic.slug:'/?tags='+encodeURIComponent(tag)}>{displayTag(tag)}</a>;})}</div>}
   {detail.description
    ?<div className="event-page-description"><h2>About This Event</h2><p>{splitDescriptionLinks(detail.description).map((part,i)=>part.href?<a key={i} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>:part.text)}</p>{detail.provenance&&<p className="event-page-provenance">{detail.provenance}</p>}</div>
    :<p className="event-page-description event-page-muted">The source has not provided a description. Follow the original listing for details.</p>}
   <div className="event-page-actions">
    <a className="primary-button" href={calendarHref}>Open in BYU Calendar</a>
    <a className="outline-button" href={'/api/events/ics?id='+encodeURIComponent(event.id)}>Add to External Calendar</a>
    {event.url&&<a className="outline-button" href={event.url} target="_blank" rel="noreferrer">Original Listing ↗</a>}
   </div>
   <SourceFreshness event={event} sources={sources}/>
   <p className="event-page-source">Listed from <a href={event.url||'/'} target="_blank" rel="noreferrer">{event.sourceName}</a>{event.additionalSources?.map((s,i)=><span key={i}> · <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)} — details may change; check the organizer&apos;s listing before attending. Independent student project, not an official BYU service.</p>
  </main>
  <SiteFooter/>
 </div>;
}
