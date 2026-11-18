import {parseSearch,matchesEvent} from './search.mjs';
import {calendarDateLabel,isUpcomingEvent,compareCalendarEvents} from './event-presentation.mjs';

// Only these three deliberate searches get their own canonical. Arbitrary
// searches and combinations keep the ordinary calendar's metadata.
export const SEARCH_PAGES=[
 {key:'today',query:'Events today',title:'BYU Events Today',label:'Today'},
 {key:'week',query:'Events this week',title:'BYU Events This Week',label:'This week'},
 {key:'weekend',query:'Events this weekend',title:'BYU Events This Weekend',label:'This weekend'},
].map(page=>({...page,href:'/?'+new URLSearchParams({q:page.query})}));
export function findSearchPage(query){
 const normalized=String(query||'').trim().replace(/\s+/g,' ').toLowerCase().replace(/^events? /,'');
 return SEARCH_PAGES.find(page=>page.query.toLowerCase().replace(/^events /,'')===normalized)||null;
}
export function requestSearchPage(params={}){
 if(typeof params.q!=='string')return null;
 if(Object.entries(params).some(([key,value])=>key!=='q'&&value!==undefined&&value!==''))return null;
 return findSearchPage(params.q);
}
export function searchPageWindow(page,now=new Date()){
 const {start,end}=parseSearch(page.query,now);
 const range=calendarDateLabel(start,{month:'long',day:'numeric',year:'numeric'})+(end!==start?' – '+calendarDateLabel(end,{month:'long',day:'numeric',year:'numeric'}):'');
 return {start,end,range};
}
export function searchPageEvents(events,page,now=new Date()){
 const intent=parseSearch(page.query,now);
 return events.filter(event=>isUpcomingEvent(event,now)&&matchesEvent(event,intent)).sort(compareCalendarEvents);
}
