import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {readCalendar} from '../../../lib/calendar-server';
import {TOPICS,findTopic,topicCalendarHref,topicDescription,relatedTopics} from '../../../lib/topics.mjs';
import {timeLabel,mountainZoneAbbr,displayTag} from '../../../lib/catalog.mjs';
import {matchesEvent} from '../../../lib/search.mjs';
import BrandY from '../../brand-y';
import SiteFooter from '../../site-footer';
import {calendarDateLabel,eventDateLabel,compareCalendarEvents,isUpcomingEvent,sourceDateLabel,jsonLdText} from '../../../lib/event-presentation.mjs';

export const dynamic='force-dynamic';

export function generateStaticParams(){return TOPICS.map(topic=>({slug:topic.slug}));}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params;
 const topic=findTopic(slug);
 if(!topic)return {title:'Topic not found',robots:{index:false,follow:false}};
 const description=topicDescription(topic);
 return {
  title:topic.title,
  description,
  alternates:{canonical:'/topics/'+topic.slug},
  openGraph:{title:topic.title,description,url:'/topics/'+topic.slug},
  twitter:{title:topic.title,description},
 };
}

export default async function TopicPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const topic=findTopic(slug);
 if(!topic)notFound();
 const data=await readCalendar();
 const now=new Date();
 const categories=topic.category?[topic.category]:[];
 const tags=topic.tag?[topic.tag]:[];
 const matches=data.events.filter(e=>isUpcomingEvent(e,now)&&matchesEvent(e,'',categories,tags)).sort(compareCalendarEvents);
 const shown=matches.slice(0,24);
 const practical=['free-food','clubs','recruiting'].includes(topic.slug);
 const related=relatedTopics(topic,8);
 const breadcrumbJsonLd={
  '@context':'https://schema.org',
  '@type':'BreadcrumbList',
  itemListElement:[
   {'@type':'ListItem',position:1,name:'BYU Calendar',item:'https://byucalendar.com/'},
   {'@type':'ListItem',position:2,name:'Topics',item:'https://byucalendar.com/topics'},
   {'@type':'ListItem',position:3,name:topic.title,item:'https://byucalendar.com/topics/'+topic.slug},
  ],
 };
 return <div className="event-page topic-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLdText(breadcrumbJsonLd)}}/>
  <header className="event-page-head">
   <Link prefetch={false} className="event-page-brand" href="/"><BrandY className="brand-y"/><span>BYU Calendar</span></Link>
   <nav className="event-page-nav" aria-label="Main navigation"><Link prefetch={false} className="nav-item" href="/">Discover</Link><Link prefetch={false} className="nav-item" href="/?section=saved">My Calendar</Link><Link prefetch={false} className="nav-item" href="/?view=map">Campus Map</Link></nav>
  </header>
  <main className="event-page-card">
   <div className="eyebrow">{topic.category?'BYU CATEGORY':'BYU '+(topic.tag?topic.tag.toUpperCase():'')}</div>
   <h1>{topic.title}</h1>
   <p className="topic-blurb">{topic.blurb}</p>
   <p className="topic-count"><b>{matches.length}</b> upcoming {matches.length===1?'event':'events'} match this filter right now.</p>
   {practical&&<p className="topic-detail">Upcoming dates from {calendarDateLabel(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(now),{month:'long',day:'numeric',year:'numeric'})}. All times are {mountainZoneAbbr(now)}. {topic.slug==='free-food'?'Food being provided does not by itself confirm free admission or open attendance.':topic.slug==='clubs'?'Check each listing for membership, registration, and attendance requirements.':'Career fairs and employer sessions are listed together; check each organizer for registration and eligibility.'}</p>}
   {shown.length>0&&<ul className="topic-list">
    {shown.map(e=><li key={e.id}>
     <a className="topic-event" href={'/events/'+encodeURIComponent(e.id)}>
      <span className="topic-event-date">{eventDateLabel(e,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}<small>{e.allDay?'All Day':timeLabel(e)}</small></span>
      <span className="topic-event-main"><b>{e.title}</b><small>{e.location||'Location not listed'} · {e.sourceName}</small>{practical&&<span className="topic-detail">{[e.food==='yes'?'Food Provided':null,e.snacks==='yes'?'Snacks':null,e.free===true?'Free Admission':e.free===false?'Paid Admission':null,e.audience?displayTag(e.audience):null,e.tags.includes('RSVP / tickets')?'RSVP / Tickets':null].filter(Boolean).join(' · ')}{data.sources.find(source=>source.id===e.sourceId)?.snapshot&&<> · Dated snapshot{sourceDateLabel(data.sources.find(source=>source.id===e.sourceId)?.lastSuccess)?' imported '+sourceDateLabel(data.sources.find(source=>source.id===e.sourceId)?.lastSuccess):''}; confirm changes with the organizer.</>}</span>}</span>
     </a>
    </li>)}
   </ul>}
   {matches.length===0&&<p className="event-page-description event-page-muted">No upcoming events match right now. New listings appear automatically as connected sources publish them.</p>}
   <div className="event-page-actions">
    <a className="primary-button" href={topicCalendarHref(topic)}>Browse these in the live calendar</a>
   </div>
   <nav className="topic-more">
    <span>More to explore:</span>
    {related.map(t=><a key={t.slug} href={'/topics/'+t.slug}>{t.title}</a>)}
    <Link prefetch={false} href="/topics">All Topics</Link>
   </nav>
   <p className="event-page-source">Listings come from connected public calendars, dated snapshots, and community additions. Check the original listing for changes. <Link prefetch={false} href="/topics">Browse all topics</Link> · <Link prefetch={false} href="/about">About the team</Link>.</p>
  </main>
  <SiteFooter/>
 </div>;
}
