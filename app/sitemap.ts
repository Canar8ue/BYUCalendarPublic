import type {MetadataRoute} from 'next';
import {readCalendar} from '../lib/calendar-server';
import {TOPICS} from '../lib/topics.mjs';
import {lastDay} from '../lib/catalog.mjs';
import {SEARCH_PAGES} from '../lib/search-pages.mjs';
import {compareCalendarEvents} from '../lib/event-presentation.mjs';

const SITE='https://byucalendar.com';

// Served at /sitemap.xml ahead of any static asset: upcoming events, curated
// topic pages, and the core pages. Past events drop out once their last day
// passes; their pages stay reachable but stop being advertised.
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
 let events:MetadataRoute.Sitemap=[];
 try{
  const calendar=await readCalendar();
  events=calendar.events
   .filter(event=>!event.cancelled&&lastDay(event)>=today)
   .sort(compareCalendarEvents)
   .slice(0,2000)
   .map(event=>({url:SITE+'/events/'+encodeURIComponent(event.id),lastModified:event.sourceUpdated&&!Number.isNaN(Date.parse(event.sourceUpdated))?new Date(event.sourceUpdated):undefined,changeFrequency:'daily' as const,priority:0.8}));
 }catch{/* Sitemap still lists the stable pages if the calendar is unavailable. */}
 return [
  {url:SITE+'/',changeFrequency:'hourly',priority:1},
  ...SEARCH_PAGES.map(page=>({url:SITE+page.href,changeFrequency:'daily' as const,priority:0.8})),
  {url:SITE+'/topics',changeFrequency:'weekly',priority:0.7},
  ...TOPICS.map(topic=>({url:SITE+'/topics/'+topic.slug,changeFrequency:'weekly' as const,priority:0.6})),
  {url:SITE+'/privacy',changeFrequency:'yearly',priority:0.3},
  {url:SITE+'/about',changeFrequency:'monthly',priority:0.5},
  ...events,
 ];
}
