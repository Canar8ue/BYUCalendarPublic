import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readCalendar} from '../../../lib/calendar-server';
import {TOPICS,findTopic,topicCalendarHref} from '../../../lib/topics.mjs';
import {localDate,lastDay,timeLabel} from '../../../lib/catalog.mjs';
import {matchesEvent} from '../../../lib/search.mjs';
import BrandY from '../../brand-y';

export const dynamic='force-dynamic';

export function generateStaticParams(){return TOPICS.map(topic=>({slug:topic.slug}));}

function dateTitle(date:string,options:Intl.DateTimeFormatOptions={weekday:'short',month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params;
 const topic=findTopic(slug);
 if(!topic)return {title:'Topic not found',robots:{index:false,follow:false}};
 return {
  title:topic.title,
  description:topic.blurb.slice(0,155),
  alternates:{canonical:'/topics/'+topic.slug},
 };
}

export default async function TopicPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const topic=findTopic(slug);
 if(!topic)notFound();
 const data=await readCalendar();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 const categories=topic.category?[topic.category]:[];
 const tags=topic.tag?[topic.tag]:[];
 const matches=data.events.filter(e=>!e.cancelled&&matchesEvent(e,'',categories,tags)&&lastDay(e)>=today).sort((a,b)=>a.start.localeCompare(b.start));
 const shown=matches.slice(0,12);
 return <div className="event-page topic-page">
  <header className="event-page-head">
   <Link prefetch={false} className="event-page-brand" href="/"><BrandY className="brand-y"/><span>BYU Calendar</span></Link>
  </header>
  <main className="event-page-card">
   <div className="eyebrow">{topic.category?'BYU CATEGORY':'BYU '+(topic.tag?topic.tag.toUpperCase():'')}</div>
   <h1>{topic.title.replace(/\bat BYU$/,'')}</h1>
   <p className="topic-blurb">{topic.blurb}</p>
   <p className="topic-count"><b>{matches.length}</b> upcoming {matches.length===1?'event':'events'} match this filter right now.</p>
   {shown.length>0&&<ul className="topic-list">
    {shown.map(e=><li key={e.id}>
     <a className="topic-event" href={'/events/'+encodeURIComponent(e.id)}>
      <span className="topic-event-date">{dateTitle(localDate(e))}<small>{e.allDay?'All day':timeLabel(e)}</small></span>
      <span className="topic-event-main"><b>{e.title}</b><small>{e.location||'Location not listed'} · {e.sourceName}</small></span>
     </a>
    </li>)}
   </ul>}
   {matches.length===0&&<p className="event-page-description event-page-muted">No upcoming events match right now. New listings appear automatically as connected sources publish them.</p>}
   <div className="event-page-actions">
    <a className="primary-button" href={topicCalendarHref(topic)}>Browse these in the live calendar</a>
   </div>
   <nav className="topic-more">
    <span>More to explore:</span>
    {TOPICS.filter(t=>t.slug!==topic.slug).slice(0,8).map(t=><a key={t.slug} href={'/topics/'+t.slug}>{t.title}</a>)}
   </nav>
   <p className="event-page-source">Counts update automatically from connected public sources. Independent student project, not an official BYU service.</p>
  </main>
 </div>;
}
