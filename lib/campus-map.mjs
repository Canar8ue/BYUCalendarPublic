import locations from '../data/campus-locations.json' with {type:'json'};
import {CATEGORIES,eventDays} from './catalog.mjs';

export const campusLocations=locations;
// Only known venue names/codes. Never infer a venue from a title or organization.
const aliases={
  TNRB:['Tanner Building','Tanner','N Eldon Tanner Building'],
  WSC:['Wilkinson Student Center','Wilkinson Center','Wilk','Varsity Theater','Varsity Theatre'],
  TMCB:['Talmage Building','Talmage Math Sciences Building','Talmage'],
  HBLL:['Harold B Lee Library','Lee Library','Reynolds Auditorium'],
  JFSB:['Joseph F Smith Building','Education in Zion Gallery'],
  JSB:['Joseph Smith Building'],HRCB:['Herald R Clark Building'],
  JRCB:['J Reuben Clark Law Building','Law School Building','Law Building'],
  EB:['Engineering Building'],CB:['Clyde Engineering Building','Clyde Building'],
  CTB:['Crabtree Building','Crabtree Technology Building'],
  LSB:['Life Sciences Building'],MLBM:['Bean Life Science Museum','Bean Museum','Monte L Bean Museum'],
  MOA:['Museum of Art'],MB:['Music Building'],ARTS:['Arts Building'],
  MC:['Marriott Center'],MCA:['Marriott Center Annex'],
  HC:['Hinckley Center','Hinckley Building','Hinckley Alumni Center'],
  RB:['Richards Building'],SFH:['Smith Fieldhouse'],LVES:['LaVell Edwards Stadium'],
  KMBL:['Kimball Tower'],ESC:['Eyring Science Center'],BNSN:['Benson Building'],
  SNLB:['Snell Building'],JKB:['Jesse Knight Building','Knight Building'],
  TLRB:['Taylor Building','Comprehensive Clinic'],MCKB:['McKay Building'],
  MARB:['Martin Building'],BRMB:['Brimhall Building'],WVB:['West View Building'],
  BELL:['Centennial Carillon Tower','Carillon Bell Tower'],TRAK:['Clarence Robison Track'],
  w83861533:['South Field'],w256670717:['BYU Duck Pond'],
};
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const phrase=(haystack,needle)=>(' '+haystack+' ').includes(' '+needle+' ');
const entries=locations.map(location=>({location,names:[location.name,...(aliases[location.code]||aliases[location.id]||[])].map(normalize).filter(n=>n.length>=4)}));

export function resolveCampusLocation(event){
  if(event.format==='Online')return null;
  const raw=event.location||'',text=normalize(raw);
  if(!text||/https?:\/\//i.test(raw)||/\b(virtual|online|zoom|salt lake city|byu idaho|byu hawaii)\b/.test(text))return null;
  const matches=[];
  for(const {location,names} of entries){
    const name=names.filter(n=>phrase(text,n)).sort((a,b)=>b.length-a.length)[0];
    // Short building codes must be upper-case: ordinary prose such as "rb" is not a venue.
    const code=location.code&&phrase(normalize(raw),normalize(location.code))&&(location.code.length>3||new RegExp('(^|[^A-Z0-9])'+location.code+'([^A-Z0-9]|$)').test(raw));
    if(name||code)matches.push({location,name,code});
  }
  // "Clyde Engineering Building" is specific; don't also match "Engineering Building".
  const specific=matches.filter(m=>!m.name||!matches.some(other=>other!==m&&other.name&&other.name.length>m.name.length&&phrase(other.name,m.name)&&!m.code));
  const ids=[...new Set(specific.map(m=>m.location.id))];
  return ids.length===1?specific[0].location:null;
}

// "Take me there" hands the venue to the visitor's own map app for turn-by-turn
// directions: Apple Maps on iPhone/iPad/iPod and Macintosh touch devices
// (iPadOS reports a Macintosh user agent), Google Maps everywhere else. Both
// apps start from the visitor's current location. Campus buildings resolve to
// their full name so geocoders find the right Provo landmark; off-campus
// venues pass through when they already carry a city, and one is appended when
// they do not. Online, placeholder, and linked locations get no button.
const UNCERTAIN_VENUE=/\b(?:virtual|online|zoom|webinar|tbd|tba|to be determined|to be announced|cancelled|not listed|unconfirmed|various|see description|tbd\s*\/\s*tba)\b|https?:\/\//i;
export function takeMeThereUrl(event,userAgent,maxTouchPoints=0){
 const raw=String(event&&event.location||'').trim();
 if(!raw||event.format==='Online'||UNCERTAIN_VENUE.test(raw))return null;
 const place=resolveCampusLocation(event);
 const destination=place?`${place.name}, Brigham Young University, Provo, UT`
  :/\b(?:provo|orem|salt lake|utah)\b/i.test(raw)||/^\d+\s/.test(raw)?raw:`${raw}, Provo, UT`;
 const query=encodeURIComponent(destination);
 return /iPhone|iPad|iPod/.test(userAgent)||(/Macintosh/.test(userAgent)&&(maxTouchPoints||0)>1)
  ?`https://maps.apple.com/?daddr=${query}&q=${query}`
  :`https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

export function groupCampusEvents(events,day){
  const groups=new Map(),unmapped=[];
  for(const event of events){
    if(!eventDays(event).includes(day))continue;
    const location=resolveCampusLocation(event);
    if(!location){unmapped.push(event);continue;}
    if(!groups.has(location.id))groups.set(location.id,{location,events:[],colors:[]});
    groups.get(location.id).events.push(event);
  }
  for(const group of groups.values()){
    group.events.sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
    group.colors=CATEGORIES.map(c=>({color:c.color,count:group.events.filter(e=>e.category===c.id).length})).filter(c=>c.count);
  }
  return {groups:[...groups.values()].sort((a,b)=>b.events.length-a.events.length||a.location.name.localeCompare(b.location.name)),unmapped};
}
