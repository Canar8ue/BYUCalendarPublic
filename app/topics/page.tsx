import type {Metadata} from 'next';
import Link from 'next/link';
import {readCalendar} from '../../lib/calendar-server';
import {TOPICS} from '../../lib/topics.mjs';
import {SEARCH_PAGES,searchPageEvents} from '../../lib/search-pages.mjs';
import {matchesEvent} from '../../lib/search.mjs';
import {isUpcomingEvent,jsonLdText} from '../../lib/event-presentation.mjs';
import BrandY from '../brand-y';
import SiteFooter from '../site-footer';

export const dynamic='force-dynamic';

const description='Browse BYU event topics by category, major, club, and perk — including free food, career fairs, AIS, performing arts, and events happening today or this week.';

export const metadata:Metadata={
 title:'Browse BYU Event Topics',
 description,
 alternates:{canonical:'/topics'},
 openGraph:{title:'Browse BYU Event Topics',description,url:'/topics'},
 twitter:{title:'Browse BYU Event Topics',description},
};

const PERK_SLUGS=new Set(['free-food','snacks','drinks','free-admission','open-invite','in-person','online']);

export default async function TopicsDirectoryPage(){
 let events:Awaited<ReturnType<typeof readCalendar>>['events']=[];
 try{events=(await readCalendar()).events;}catch{events=[];}
 const now=new Date();
 const upcoming=events.filter(e=>isUpcomingEvent(e,now));
 const countTopic=(topic:typeof TOPICS[number])=>upcoming.filter(e=>matchesEvent(e,'',topic.category?[topic.category]:[],topic.tag?[topic.tag]:[])).length;
 const categories=TOPICS.filter(t=>Boolean(t.category));
 const perks=TOPICS.filter(t=>PERK_SLUGS.has(t.slug));
 const subjects=TOPICS.filter(t=>!t.category&&!PERK_SLUGS.has(t.slug));
 const breadcrumbJsonLd={
  '@context':'https://schema.org',
  '@type':'BreadcrumbList',
  itemListElement:[
   {'@type':'ListItem',position:1,name:'BYU Calendar',item:'https://byucalendar.com/'},
   {'@type':'ListItem',position:2,name:'Topics',item:'https://byucalendar.com/topics'},
  ],
 };
 const groups=[
  {title:'Categories',items:categories},
  {title:'Majors, Clubs & Interests',items:subjects},
  {title:'Perks & Format',items:perks},
 ];
 return <div className="event-page topic-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLdText(breadcrumbJsonLd)}}/>
  <header className="event-page-head">
   <Link prefetch={false} className="event-page-brand" href="/"><BrandY className="brand-y"/><span>BYU Calendar</span></Link>
   <nav className="event-page-nav" aria-label="Main navigation"><Link prefetch={false} className="nav-item" href="/">Discover</Link><Link prefetch={false} className="nav-item" href="/?section=saved">My Calendar</Link><Link prefetch={false} className="nav-item" href="/?view=map">Campus Map</Link></nav>
  </header>
  <main className="event-page-card">
   <div className="eyebrow">TOPIC DIRECTORY</div>
   <h1>Browse BYU Event Topics</h1>
   <p className="topic-blurb">Upcoming campus listings organized by time window, category, major, club, and practical details.</p>
   <section className="topics-directory-group">
    <h2>Happening Soon</h2>
    <div className="topics-directory-grid">
     {SEARCH_PAGES.map(page=>{
      const count=searchPageEvents(events,page,now).length;
      return <a key={page.key} className="topics-directory-card" href={page.href}><b>{page.title}</b><small>{count} upcoming</small></a>;
     })}
    </div>
   </section>
   {groups.map(group=><section className="topics-directory-group" key={group.title}>
    <h2>{group.title}</h2>
    <div className="topics-directory-grid">
     {group.items.map(topic=><a key={topic.slug} className="topics-directory-card" href={'/topics/'+topic.slug}><b>{topic.title}</b><small>{countTopic(topic)} upcoming</small></a>)}
    </div>
   </section>)}
   <div className="event-page-actions">
    <Link prefetch={false} className="primary-button" href="/">Open Full Calendar</Link>
   </div>
   <p className="event-page-source">Listings come from connected public calendars, dated snapshots, and community additions. <a href="/about">About the team</a>.</p>
  </main>
  <SiteFooter/>
 </div>;
}
