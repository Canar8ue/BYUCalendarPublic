import type {Metadata} from 'next';
import CalendarApp from './calendar-app';
import {readCalendar} from '../lib/calendar-server';
import {lastDay} from '../lib/catalog.mjs';
import {dayKey} from '../lib/search.mjs';
import {compareCalendarEvents} from '../lib/event-presentation.mjs';
import {requestSearchPage,searchPageEvents,searchPageWindow} from '../lib/search-pages.mjs';

type PageProps={searchParams:Promise<Record<string,string|string[]|undefined>>};
export const dynamic='force-dynamic';

export async function generateMetadata({searchParams}:PageProps):Promise<Metadata>{
 const page=requestSearchPage(await searchParams);
 if(!page)return {};
 const description=`Find BYU events for ${searchPageWindow(page).range}, in Mountain Time, from linked calendars and community additions.`;
 return {title:page.title,description,alternates:{canonical:page.href},openGraph:{title:page.title,description,url:page.href},twitter:{title:page.title,description}};
}

export default async function Home({searchParams}:PageProps){
 const params=await searchParams;
 const page=requestSearchPage(params);
 const now=new Date();
 const hasFilter=Boolean(params.q||params.tags||params.categories||params.view);
 let initialData=null,initialUpcomingCount:number|undefined;
 if(page||!hasFilter){
  try{
   const calendar=await readCalendar();
   const today=dayKey(now);
   const upcomingEvents=calendar.events.filter(event=>!event.cancelled&&lastDay(event)>=today).sort(compareCalendarEvents);
   initialUpcomingCount=upcomingEvents.length;
   if(page){
    // Send only the selected window. The browser still loads the full calendar
    // for subsequent searches, while the first response already has results.
    initialData={...calendar,events:searchPageEvents(calendar.events,page,now)};
   }else{
    // Send the first 40 upcoming events so the homepage renders real event links
    // immediately without shipping the entire ~2,600-event payload in SSR HTML.
    const slice=upcomingEvents.slice(0,40);
    const requested=typeof params.event==='string'&&!slice.some(e=>e.id===params.event)?calendar.events.find(e=>e.id===params.event):null;
    initialData={...calendar,events:requested?[...slice,requested]:slice};
   }
  }catch{/* The existing calendar retry UI handles unavailable data. */}
 }
 const noscriptHtml=`<style>.loader{display:none}</style>${!page?'<div class="noscript-summary"><h1>BYU Calendar</h1><p>Find BYU events from university, department, and club calendars, plus community additions. Browse <a href="/?q=Events+today">today&#39;s events</a>, <a href="/?q=Events+this+week">this week</a>, <a href="/?q=Events+this+weekend">this weekend</a>, or <a href="/topics">all event topics</a>.</p></div>':''}`;
 return <><noscript dangerouslySetInnerHTML={{__html:noscriptHtml}}/><CalendarApp initialData={initialData} initialQuery={page?String(params.q):''} initialNow={now.toISOString()} skipLoader={params.embed==='1'} initialUpcomingCount={initialUpcomingCount} initialPartial={Boolean(initialData)}/></>;
}
