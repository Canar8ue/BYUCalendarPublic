import {localDate,lastDay,splitDescriptionProvenance} from './catalog.mjs';
import {resolveCampusLocation} from './campus-map.mjs';
import {dayOrder} from './important-events.mjs';

const SITE='https://byucalendar.com';
const UNKNOWN_VENUE=/\b(?:tbd|tba|to be determined|to be announced|not listed|unconfirmed|various|see description|virtual|online|zoom)\b|https?:\/\//i;
export function calendarDateLabel(day,options={weekday:'long',month:'long',day:'numeric',year:'numeric'}){
 if(!day)return 'Date not listed';
 const ms=Date.parse(day+'T12:00:00Z');
 return Number.isFinite(ms)?new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(ms)):String(day);
}
export function eventDateLabel(event,options){
 const first=localDate(event),last=lastDay(event);
 return calendarDateLabel(first,options)+(last!==first?' – '+calendarDateLabel(last,options?{...options,weekday:undefined}:{month:'long',day:'numeric',year:'numeric'}):'');
}
export function eventTimeLabel(event){
 if(event.allDay)return 'All day';
 if(event.timeTba)return 'TBA';
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'});
 const label=value=>{const ms=Date.parse(value);return Number.isFinite(ms)?fmt.format(new Date(ms)):null;};
 const start=label(event.start);if(!start)return 'TBA';
 const end=event.end?label(event.end):null;
 return start+(end?' – '+end:'')+' MT';
}
export function eventVenueLabel(event){
 const raw=String(event.location||'').trim();
 if(!raw)return 'Location not listed';
 if(event.format!=='Hybrid'&&UNKNOWN_VENUE.test(raw))return raw;
 const campus=resolveCampusLocation(event);
 return campus&&!raw.toLowerCase().includes(campus.name.toLowerCase())?raw+' · '+campus.name:raw;
}
export function compareCalendarEvents(a,b){return localDate(a).localeCompare(localDate(b))||dayOrder(a,b);}
export function isUpcomingEvent(event,now=new Date()){
 if(event.cancelled)return false;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(now);
 if(lastDay(event)<today)return false;
 if(event.allDay||event.timeTba)return true;
 // A published end can establish that an event is still in progress. Without
 // one, include future starts rather than inventing a duration.
 return Date.parse(event.end||event.start)>now.getTime();
}
function denverStamp(value){
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))return value;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
 const offset=parts.timeZoneName==='GMT'?'+00:00':parts.timeZoneName.replace('GMT','');
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
export function eventJsonLd(event){
 const first=localDate(event),last=lastDay(event),dateOnly=event.allDay||event.timeTba;
 const raw=String(event.location||'').trim(),online=event.format==='Online';
 const unknownPhysical=event.format!=='Hybrid'&&UNKNOWN_VENUE.test(raw);
 const campus=raw&&!unknownPhysical?resolveCampusLocation(event):null;
 const location=online?{'@type':'VirtualLocation',name:raw||'Online'}
  :raw&&!unknownPhysical?{'@type':'Place',name:eventVenueLabel(event),...(campus?{address:{'@type':'PostalAddress',addressLocality:'Provo',addressRegion:'UT',addressCountry:'US'}}:{})}:null;
 const description=splitDescriptionProvenance(event.description||'').description;
 return {
  '@context':'https://schema.org','@type':'Event',name:event.title,
  startDate:dateOnly?first:denverStamp(event.start),
  ...(event.end&&(!dateOnly||(!event.timeTba&&last!==first))?{endDate:dateOnly?last:denverStamp(event.end)}:{}),
  eventStatus:'https://schema.org/'+(event.cancelled?'EventCancelled':'EventScheduled'),
  ...(event.format?{eventAttendanceMode:'https://schema.org/'+(online?'OnlineEventAttendanceMode':event.format==='Hybrid'?'MixedEventAttendanceMode':'OfflineEventAttendanceMode')}:{}),
  ...(location?{location}:{}),
  ...(event.organizer?{organizer:{'@type':'Organization',name:event.organizer}}:{}),
  url:SITE+'/events/'+encodeURIComponent(event.id),
  ...(description?{description:description.slice(0,2000)}:{}),
  ...(typeof event.free==='boolean'?{isAccessibleForFree:event.free}:{}),
 };
}
export function jsonLdText(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
export function sourceDateLabel(value){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
}
