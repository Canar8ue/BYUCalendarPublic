"use client";
import {useState,useEffect,useMemo,useRef,useCallback,lazy,Suspense} from 'react';
import {CalendarDays,Search,ArrowUpRight,SlidersHorizontal,RefreshCw,ChevronLeft,ChevronRight,ChevronDown,Bookmark,Plus,X,Check,ArrowRight,MapPin,Utensils,Cookie,Coffee,Wifi,Users,Download,Layers,List,LayoutGrid,Sparkles,Info,CheckCircle2,AlertCircle,Link2,GraduationCap,BriefcaseBusiness,Palette,Trophy,BookOpen,LoaderCircle,Trash2,Globe,Flag,Tags,Share2,Pencil,CalendarPlus,Navigation,Star} from 'lucide-react';
import type {CampusEvent,Preferences,SavedView,CalendarData} from './types';
import {CATEGORIES,INTEREST_TAGS,localDate,timeLabel,lastDay,eventDays,splitDescriptionProvenance} from '../lib/catalog.mjs';
import {dayOrder} from '../lib/important-events.mjs';
import {dayKey,parseSearch,matchesEvent,exportICS,eventSlug,googleCalendarUrl,personalCalendarKind,savedViewSummary} from '../lib/search.mjs';
import Link from 'next/link';
import {useAccount,postJSON,getJSON} from './account-client';
import {track,trackSearch,trackPersonal,PersonalAction} from './analytics-client';
import ProfileChat from './profile-chat';
import SubscribeDialog from './subscribe-dialog';
import {feedSearch} from '../lib/feed.mjs';
import {eventInStaffArea} from '../lib/staff.mjs';
import {ContributionGate,EventContributionForm,EditListingForm,ModeratorEditForm} from './community-forms';
import {SearchTip,EventTip,tourSeen,markTourSeen,SEARCH_TOUR_FLAG,EVENT_TOUR_FLAG} from './tour';
import Onboarding,{onboardingSeen,markOnboardingSeen} from './onboarding';
import BrandY from './brand-y';
import LaunchLoader from './loader';

import {campusLocations,resolveCampusLocation,groupCampusEvents,takeMeThereUrl} from '../lib/campus-map.mjs';
import type {CampusLocation} from '../lib/campus-map.mjs';
const CampusMap=lazy(()=>import('./campus-map'));
function validMapDay(value:string|null){return !!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
const directionsHref=(e:CampusEvent)=>takeMeThereUrl(e,typeof navigator==='undefined'?'':navigator.userAgent,navigator.maxTouchPoints||0);
function mapsAppName(){if(typeof navigator==='undefined')return 'Google Maps';const ua=navigator.userAgent;return /iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1)?'Apple Maps':'Google Maps';}

const categoryIcons=[Users,BriefcaseBusiness,Palette,Trophy,BookOpen,GraduationCap];
const uiInterests=INTEREST_TAGS.filter(t=>t!=='AIS').map(t=>({tag:t,label:t==='IS'?'IS / AIS':t}));
const detailTags=[['Food provided',Utensils],['Snacks',Cookie],['Free admission',CheckCircle2],['In person',MapPin],['Online',Wifi]] as const;
// The custom set builder offers the same windows the quick "This week" chip and
// the phrase parser understand, stored as the set's query string.
const WHEN_OPTIONS:[(''|'this week'|'next week'|'this month'),string][]=[['','Any time'],['this week','This week'],['next week','Next week'],['this month','This month']];
const MAX_SAVED_SETS=30;
const dayNames=['SUN','MON','TUE','WED','THU','FRI','SAT'];
// Week view keeps an hourly rhythm: a dotted rule between blocks of events
// that start in different hours, while events beginning past the hour
// (:30, :13) stay inside their hour's block, indented below the :00 starts.
const hourStamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function weekFlags(event:CampusEvent,previous:CampusEvent|undefined){
 const stamp=event.allDay?null:hourStamp.format(new Date(event.start));
 const prior=previous?(previous.allDay?null:hourStamp.format(new Date(previous.start))):undefined;
 return (prior!==undefined&&stamp!==prior?' hour-start':'')+(stamp&&stamp.slice(3,5)!=='00'?' sub-hour':'');
}
function dateTitle(date:string,options:Intl.DateTimeFormatOptions={weekday:'long',month:'long',day:'numeric'}){return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}
function monthTitle(date:Date){return date.toLocaleDateString('en-US',{month:'long',year:'numeric'});}
function getColor(e:CampusEvent){return CATEGORIES.find(c=>c.id===e.category)?.color||'blue';}
function relative(date:string|null){if(!date)return 'Not synced';const m=Math.floor((Date.now()-Date.parse(date))/60000);return m<1?'Just now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;}

export default function CalendarApp(){
 const [data,setData]=useState<CalendarData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[syncing,setSyncing]=useState(false);
 const [query,setQuery]=useState(''),[categories,setCategories]=useState<string[]>([]),[tags,setTags]=useState<string[]>([]),[view,setView]=useState<'week'|'month'|'list'|'map'>('list'),[section,setSection]=useState<'discover'|'saved'>('discover');
 const [mapDay,setMapDay]=useState(()=>dayKey(new Date())),[mapFocus,setMapFocus]=useState<CampusLocation|null>(null),[mapFocusToken,setMapFocusToken]=useState(0),[mapFitToken,setMapFitToken]=useState(0),[dayLocation,setDayLocation]=useState<CampusLocation|'unmapped'|null>(null);
 const [month,setMonth]=useState(()=>new Date());
 const [preferences,setPreferences]=useState<Preferences>({saved:[],views:[]}),[saving,setSaving]=useState(false);
 const {account}=useAccount();const signedIn=Boolean(account?.permissions.addListings);const isModerator=Boolean(account?.permissions.reviewReports);const staffVerifiedArea=account?.staff?.status==='verified'?account.staff.area:null;
 const [modal,setModal]=useState<'sources'|'event'|'day'|'save'|'custom'|'signin'|'tag'|'report'|'edit'|'confirm-delete'|'profile'|'subscribe'|null>(null),[selected,setSelected]=useState<CampusEvent|null>(null),[selectedDay,setSelectedDay]=useState(''),[openMenu,setOpenMenu]=useState<'filters'|'perks'|'interests'|'saved'|null>(null),[compact,setCompact]=useState(false),[viewName,setViewName]=useState(''),[toast,setToast]=useState(''),[listLimit,setListLimit]=useState(40),[shared,setShared]=useState(false);
 // The custom set builder holds its own draft so a half-built set never changes
 // the calendar behind it; only saving applies it.
 const [customCategories,setCustomCategories]=useState<string[]>([]),[customTags,setCustomTags]=useState<string[]>([]),[customWhen,setCustomWhen]=useState<''|'this week'|'next week'|'this month'>('');
 const [myListings,setMyListings]=useState<Set<string>>(()=>new Set()),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
 type AssistIntent={tags:string[];categories:string[];start:string|null;end:string|null;after:number|null;words:string[];labels:[]};
 const [assist,setAssist]=useState<{query:string;intent:AssistIntent;summary:string}|null>(null),[assistLoading,setAssistLoading]=useState(false);
 // Personal picks: server-computed recommendations for the signed-in member,
 // shown on My calendar; refreshed whenever the saved set changes because
 // picks deliberately exclude events already saved.
 type Pick={id:string;score:number;reasons:string[]};
 type StoredProfile={interests:string[];categories:string[];details:string[];updatedAt?:string};
 const [picks,setPicks]=useState<{hasProfile:boolean;profile:StoredProfile|null;picks:Pick[]}|null>(null);
 const loadPicks=useCallback(async()=>{try{setPicks(await getJSON<{hasProfile:boolean;profile:StoredProfile|null;picks:Pick[]}>('/api/recommendations'));}catch{setPicks(null);}},[]);
 useEffect(()=>{
  if(!signedIn||section!=='saved')return;
  let active=true;
  getJSON<{hasProfile:boolean;profile:StoredProfile|null;picks:Pick[]}>('/api/recommendations').then(d=>{if(active)setPicks(d);}).catch(()=>{if(active)setPicks(null);});
  return()=>{active=false;};
 },[signedIn,section,preferences.saved.length]);
 // Recommended events join the saved set inside My calendar, visibly tagged
 // as suggestions — never silently mixed in with events the member saved.
 const suggestionIds=useMemo(()=>new Set(picks?.picks.map(pick=>pick.id)||[]),[picks]);
 const isSuggestion=useCallback((e:CampusEvent)=>section==='saved'&&suggestionIds.has(e.id)&&!preferences.saved.includes(e.id),[section,suggestionIds,preferences.saved]);
 // Signed-in event actions also feed the member's own taste profile.
 const personal=useCallback((action:PersonalAction,event:CampusEvent)=>{if(signedIn)trackPersonal(action,event.id);},[signedIn]);
 useEffect(()=>{ // Which community listings belong to the signed-in author; ids never appear in public event data.
  if(!signedIn)return;
  let active=true;
  fetch('/api/listings/mine',{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{listings:CampusEvent[]}>:Promise.reject(new Error('unavailable'))).then(d=>{if(active)setMyListings(new Set(d.listings.map(e=>e.id)));}).catch(()=>{});
  return()=>{active=false;};
 },[signedIn]);
 const initialEvent=useRef<string|null>(null);
 // First-visit tour: the search tip renders once the launch loader clears
 // (never for visitors who arrived on a search URL); the event tip arms on the
 // first opened listing — marking the storage flag at that moment — and lives
 // only while that dialog is open, a save, or "Got it" retires it.
 const [arrivedWithQuery]=useState(()=>typeof location==='undefined'?false:new URLSearchParams(location.search).has('q'));
 // First-visit questions sit over the launch screen; deep links (search or
 // filter URLs) skip them — those visitors already know what they came for.
 const [onboarding,setOnboarding]=useState(()=>{if(typeof location==='undefined')return false;const p=new URLSearchParams(location.search);return !onboardingSeen()&&!p.has('q')&&!p.has('tags')&&!p.has('categories')&&!p.has('event');});
 // The questions appear only after the launch animation has settled — the
 // loader reports that moment, and everything stays blue until they answer.
 const [launchSettled,setLaunchSettled]=useState(false);
 function finishOnboarding(shape:{categories:string[];tags:string[]}){markOnboardingSeen();setOnboarding(false);if(shape.categories.length)setCategories(shape.categories);if(shape.tags.length)setTags(shape.tags);}
 const [eventTourArmed,setEventTourArmed]=useState(false);
 const eventTour=modal==='event'&&eventTourArmed;
 function dismissEventTour(){setEventTourArmed(false);}
 const pendingMapLocation=useRef<{place:CampusLocation;day:string;token:number}|null>(null);
 const searchRef=useRef<HTMLInputElement>(null),dialogRef=useRef<HTMLDialogElement>(null),syncRef=useRef(false),shareTimer=useRef<ReturnType<typeof setTimeout>|null>(null),assistDone=useRef(''),assistInFlight=useRef(false),filterToolsRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const media=window.matchMedia('(max-width:650px)');setCompact(media.matches);if(media.matches&&!new URLSearchParams(location.search).has('view'))setView('list');const onResize=(event:MediaQueryListEvent)=>{setCompact(event.matches);if(event.matches)setView(current=>current==='map'?'map':'list');};// Some embedded browsers apply their viewport after load without delivering
 // the matchMedia change; the plain resize event re-syncs compact for them.
 const onWindowResize=()=>setCompact(media.matches);
 media.addEventListener('change',onResize);window.addEventListener('resize',onWindowResize);
 return()=>{media.removeEventListener('change',onResize);window.removeEventListener('resize',onWindowResize);};},[]);
 const today=dayKey(new Date());
 const load=useCallback(async()=>{try{const json=await getJSON<CalendarData>('/api/events');setData(json);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load events.');}finally{setLoading(false);}},[]);
 const sync=useCallback(async(force=false)=>{if(syncRef.current)return;syncRef.current=true;setSyncing(true);try{const json=await postJSON<{refreshed:number}>('/api/refresh'+(force?'?force=1':''),{},120000);await load();if(force)setToast(json.refreshed?`Updated ${json.refreshed} connected sources.`:'Your sources were checked recently. Next refresh happens automatically.');}catch(e){setError(e instanceof Error?e.message:'Refresh is unavailable.');}finally{setSyncing(false);syncRef.current=false;}},[load]);
 useEffect(()=>{const params=new URLSearchParams(location.search);initialEvent.current=params.get('event');setQuery(params.get('q')||'');setTags((params.get('tags')||'').split(',').filter(Boolean));setCategories((params.get('categories')||'').split(',').filter(Boolean));if(['list','month','map'].includes(params.get('view')||''))setView(params.get('view') as 'month'|'list'|'map');if(validMapDay(params.get('date')))setMapDay(params.get('date')!);const place=campusLocations.find(l=>l.id===params.get('place'));if(place)setMapFocus(place);track({type:'view',name:location.pathname});load().then(()=>sync());fetch('/api/preferences').then(r=>r.json() as Promise<Preferences & {error?:string;signedIn:boolean}>).then(d=>{if(!d.error){setPreferences({saved:d.saved||[],views:d.views||[],savedMeta:d.savedMeta||{}});}}).catch(()=>setToast('Saved preferences are temporarily unavailable.'));const timer=setInterval(()=>sync(),300000);return()=>clearInterval(timer);},[load,sync]);
 useEffect(()=>{const p=new URLSearchParams();if(query)p.set('q',query);if(tags.length)p.set('tags',tags.join(','));if(categories.length)p.set('categories',categories.join(','));if(view!=='list')p.set('view',view);if(view==='map'){p.set('date',mapDay);if(mapFocus)p.set('place',mapFocus.id);}const eventId=initialEvent.current||(['event','tag','report','edit','confirm-delete','signin'].includes(modal||'')?selected?.id:null);if(eventId)p.set('event',eventId);history.replaceState(null,'',location.pathname+(p.size?'?'+p:''));setListLimit(40);},[query,categories,tags,view,modal,selected,mapDay,mapFocus]);
 useEffect(()=>{if(!data||!initialEvent.current)return;const event=data.events.find(e=>e.id===initialEvent.current);initialEvent.current=null;if(event){setSelected(event);setModal('event');track({type:'event_view',name:event.id,detail:event.sourceId});}else{setToast('This listing is no longer available.');const url=new URL(location.href);url.searchParams.delete('event');history.replaceState(null,'',url.pathname+url.search);}},[data]);
 useEffect(()=>{if(modal){dialogRef.current?.showModal();}else dialogRef.current?.close();},[modal]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
 // The filter dropdowns close on an outside tap or Escape. pointerdown (not
 // mousedown) so taps on plain content also dismiss them on touch devices,
 // where mouse events fire late or never for non-interactive targets.
 useEffect(()=>{
  if(!openMenu)return;
  const onDown=(event:PointerEvent)=>{if(!filterToolsRef.current?.contains(event.target as Node))setOpenMenu(null);};
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpenMenu(null);};
  document.addEventListener('pointerdown',onDown);document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',onDown);document.removeEventListener('keydown',onKey);};
 },[openMenu]);
 // RSVP: the public list of members who saved this event. Hidden members are
 // absent entirely; everyone sees avatars and first initials, and signed-in
 // members also see the name and BYU email behind the hover.
 const [rsvp,setRsvp]=useState<{count:number;members:{initial:string;name?:string;email?:string;avatar:string|null}[]}|null>(null);
 useEffect(()=>{
  if(modal!=='event'||!selected){setRsvp(null);return;}
  let active=true;
  fetch('/api/events/rsvp?id='+encodeURIComponent(selected.id),{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{count:number;members:{initial:string;name?:string;email?:string;avatar:string|null}[]}>:null).then(d=>{if(active)setRsvp(d&&d.count>0?d:null);}).catch(()=>{});
  return()=>{active=false;};
 },[modal,selected]);
 const intent=useMemo(()=>parseSearch(query),[query]);
 const events=useMemo(()=>data?.events||[],[data]);
 const active=useMemo(()=>events.filter(e=>section==='saved'?preferences.saved.includes(e.id)||suggestionIds.has(e.id):!e.cancelled),[events,section,preferences.saved,suggestionIds]);
 // Saved ids stop resolving when a source removes its event, so My calendar
 // names what vanished instead of letting the row disappear without a trace.
 const missingSaved=useMemo(()=>{if(section!=='saved'||!preferences.saved.length)return [];const known=new Set(events.map(e=>e.id));return preferences.saved.filter(id=>!known.has(id)).map(id=>({id,note:preferences.savedMeta?.[id]||null}));},[section,preferences.saved,preferences.savedMeta,events]);
 const feedQuery=useMemo(()=>feedSearch({query,categories,tags}),[query,categories,tags]);
 // Deterministic phrase search runs first; when it comes up empty, the server-side
 // smart search interprets the request into the same filter shape and its results
 // take over until the query changes or the visitor dismisses the interpretation.
 const deterministic=useMemo(()=>active.filter(e=>matchesEvent(e,intent,categories,tags)),[active,intent,categories,tags]);
 const assistActive=!!assist&&assist.query===query;
 const effectiveIntent=assistActive?assist.intent:intent;
 const filtered=useMemo(()=>assist&&assist.query===query?active.filter(e=>matchesEvent(e,assist.intent,[...new Set([...categories,...assist.intent.categories])],tags)):deterministic,[active,deterministic,assist,categories,tags,query]);
 // A poetic interpretation can still miss every listing's literal text; when the
 // interpreted filters match nothing, fall back to their tag/category reading.
 const broadened=useMemo(()=>{
  if(!assist||assist.query!==query||filtered.length>0)return null;
  const intent={...assist.intent,words:[],start:null,end:null,after:null,labels:[]};
  const hits=active.filter(e=>matchesEvent(e,intent,[...new Set([...categories,...assist.intent.categories])],tags));
  return hits.length?hits:null;
 },[assist,query,filtered.length,active,categories,tags]);
 const shown=broadened||filtered;
 useEffect(()=>{
  const current=query.trim();
  if(!current||deterministic.length>0||assistActive||assistDone.current===current||assistInFlight.current)return;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   assistInFlight.current=true;setAssistLoading(true);
   try{
    const r=await fetch('/api/search/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:current}),signal:controller.signal});
    const json=await r.json() as {intent?:Partial<AssistIntent>;summary?:string;error?:string};
    if(controller.signal.aborted)return;
    if(!r.ok||!json.intent)throw new Error(json.error||'Smart search is unavailable.');
    setAssist({query,intent:{tags:json.intent.tags||[],categories:json.intent.categories||[],start:json.intent.start||null,end:json.intent.end||null,after:json.intent.after??null,words:json.intent.words||[],labels:[]},summary:json.summary||'Interpreted search results'});
   }catch(e){
    if((e as Error)?.name==='AbortError')return;
    assistDone.current=current;
   }finally{assistInFlight.current=false;setAssistLoading(false);}
  },900);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,deterministic,assistActive]);
 function dismissAssist(){if(assist)assistDone.current=assist.query;setAssist(null);}
 // Search autocomplete: one pool of phrases the deterministic parser understands,
 // ranked by how the typed text sits inside each phrase. Tab, Right at the end of
 // the text, a tap, or a right swipe fills the highlighted suggestion; Enter
 // searches what is in the box.
 const [suggestOpen,setSuggestOpen]=useState(false),[suggestIndex,setSuggestIndex]=useState(-1);
 const swipeStart=useRef<{x:number;y:number}|null>(null);
 const SUGGESTIONS=useMemo(()=>{
  const entries:[string,string][]=[['free food this week','free food this week'],['food provided','food provided'],['snacks','snacks'],['shows this weekend','shows this weekend'],['clubs this week','clubs this week'],['is networking','IS / AIS networking'],['workshops after 5 pm','workshops after 5 pm'],['this week','this week'],['this weekend','this weekend'],['important','important events'],['free admission','free admission'],['in person','in person'],['online','online'],...INTEREST_TAGS.filter(t=>t!=='AIS').map((t):[string,string]=>[t.toLowerCase(),t==='IS'?'IS / AIS':t.toLowerCase()])];
  return entries.filter(([value],i)=>entries.findIndex(([other])=>other===value)===i);
 },[]);
 const suggestions=useMemo(()=>{
  const q=query.trim().toLowerCase();if(!q)return [];
  return SUGGESTIONS.map(s=>{const value=s[0];const at=value.indexOf(q);const wordStart=new RegExp('\\b'+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(value);return {s,rank:value===q?9:value.startsWith(q)?0:wordStart?1:at>=0?2:9,at};})
   .filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank||a.at-b.at).map(x=>x.s).slice(0,6);
 },[query,SUGGESTIONS]);
 function applySuggestion(value:string){changeQuery(value);setSuggestIndex(-1);}
 function fillSuggestion(){const pick=suggestions[Math.max(suggestIndex,0)];if(pick)changeQuery(pick[0]);setSuggestIndex(-1);}
 function closeSuggestions(){setSuggestOpen(false);setSuggestIndex(-1);}
 function submitSearch(){if(suggestOpen&&suggestIndex>=0&&suggestions[suggestIndex]){applySuggestion(suggestions[suggestIndex][0]);}closeSuggestions();searchRef.current?.blur();}
 function onSuggestKey(event:React.KeyboardEvent<HTMLInputElement>){
  if(event.key==='ArrowDown'&&suggestions.length){event.preventDefault();setSuggestOpen(true);setSuggestIndex(i=>i<suggestions.length-1?i+1:0);}
  else if(event.key==='ArrowUp'&&suggestions.length){event.preventDefault();setSuggestIndex(i=>i>0?i-1:suggestions.length-1);}
  else if(event.key==='Tab'&&suggestOpen&&suggestions.length){event.preventDefault();fillSuggestion();}
  else if(event.key==='ArrowRight'&&suggestOpen&&suggestions.length&&event.currentTarget.selectionStart===event.currentTarget.value.length&&event.currentTarget.selectionEnd===event.currentTarget.value.length){event.preventDefault();fillSuggestion();}
  else if(event.key==='Enter'){if(suggestOpen&&suggestIndex>=0&&suggestions[suggestIndex])applySuggestion(suggestions[suggestIndex][0]);closeSuggestions();}
  else if(event.key==='Escape'&&suggestOpen){closeSuggestions();}
 }
 const filteredCount=useRef(0);
 useEffect(()=>{filteredCount.current=filtered.length;},[filtered]);
 useEffect(()=>{trackSearch(query,filteredCount.current);},[query]);
 const upcoming=events.filter(e=>!e.cancelled&&lastDay(e)>=today);
 const totalSources=data?.sources.filter(s=>s.enabled&&s.count>0).length||0;
 const resultsByDay=useMemo(()=>{const map=new Map<string,CampusEvent[]>();for(const e of shown){for(const key of eventDays(e)){if(!map.has(key))map.set(key,[]);map.get(key)!.push(e);}}for(const items of map.values())items.sort(dayOrder);return map;},[shown]);
 const mappedDay=useMemo(()=>groupCampusEvents(shown,mapDay),[shown,mapDay]);
 // Snapshot provenance footers ("Imported from a user-provided Handshake export…")
 // display at the bottom of the dialog, not inside the description body.
 const selectedDetail=useMemo(()=>splitDescriptionProvenance(selected?.description||''),[selected]);
 const selectedPickReasons=useMemo(()=>picks?.picks.find(pick=>pick.id===selected?.id)?.reasons||[],[picks,selected]);
 const dayItems=useMemo(()=>{const items=resultsByDay.get(selectedDay)||[];return dayLocation==='unmapped'?items.filter(e=>!resolveCampusLocation(e)):dayLocation?items.filter(e=>resolveCampusLocation(e)?.id===dayLocation.id):items;},[resultsByDay,selectedDay,dayLocation]);
 function showAllMapPins(){pendingMapLocation.current=null;setMapFocus(null);setMapFitToken(n=>n+1);}
 function changeMapDay(day:string){if(!validMapDay(day))return;setMapDay(day);showAllMapPins();}
 function moveMapDay(delta:number){const date=new Date(mapDay+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+delta);changeMapDay(date.toISOString().slice(0,10));}
 function openLocation(place:CampusLocation,animate:boolean){const token=mapFocusToken+1;setMapFocus(place);setMapFocusToken(token);if(animate){pendingMapLocation.current={place,day:mapDay,token};}else{pendingMapLocation.current=null;setSelectedDay(mapDay);setDayLocation(place);setModal('day');}}
 function finishMapFocus(token:number){const pending=pendingMapLocation.current;if(!pending||pending.token!==token)return;pendingMapLocation.current=null;setSelectedDay(pending.day);setDayLocation(pending.place);setModal('day');}
 function seeOnMap(event:CampusEvent){pendingMapLocation.current=null;personal('map_view',event);const place=resolveCampusLocation(event);if(!place){setToast('This event does not have a confirmed campus map location. Check its original listing.');return;}const eventDates=eventDays(event);setMapDay(eventDates.includes(mapDay)?mapDay:eventDates.includes(today)?today:localDate(event));setMapFocus(place);setMapFocusToken(n=>n+1);openMapPage(event);setModal(null);requestAnimationFrame(()=>document.querySelector('.calendar-surface')?.scrollIntoView({block:'start',behavior:'instant'}));}
 function changeQuery(value:string){showAllMapPins();setQuery(value);if(view==='map'){const start=parseSearch(value).start;if(start)changeMapDay(start);}else if(value)setView('list');}
 const days=useMemo(()=>{const start=view==='week'?new Date(month):new Date(month.getFullYear(),month.getMonth(),1);start.setDate(start.getDate()-(view==='week'?(start.getDay()+6)%7:start.getDay()));return Array.from({length:view==='week'?7:42},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return {date:d,key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};});},[month,view]);
 const isCurrentPeriod=view==='week'?days.some(d=>d.key===today):view==='month'?days.some(d=>d.key===today&&d.date.getMonth()===month.getMonth()):true;
 const monthCount=shown.filter(e=>eventDays(e).some(d=>view==='week'?days.some(day=>day.key===d):d.startsWith(`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`))).length;
 const listed=shown.filter(e=>lastDay(e)>=today||section==='saved'||!!effectiveIntent.start);
 const listGroups=useMemo(()=>{const map=new Map<string,CampusEvent[]>();for(const e of listed.slice(0,listLimit)){const key=localDate(e);if(!map.has(key))map.set(key,[]);map.get(key)!.push(e);}for(const items of map.values())items.sort(dayOrder);return [...map];},[listed,listLimit]);
 function toggle(value:string,values:string[],set:(v:string[])=>void){showAllMapPins();set(values.includes(value)?values.filter(x=>x!==value):[...values,value]);}
 function toggleInterest(tag:string){showAllMapPins();if(tag==='IS'){const has=tags.includes('IS')||tags.includes('AIS');setTags(has?tags.filter(t=>t!=='IS'&&t!=='AIS'):[...tags,'IS']);}else toggle(tag,tags,setTags);}
 function reset(){showAllMapPins();setQuery('');setCategories([]);setTags([]);}
 function quick(q:string,cat:string[]=[]){changeQuery(q);setCategories(cat);setTags([]);}
 function openSaveDialog(){setOpenMenu(null);setViewName('');setModal('save');}
 function openCustomDialog(){setOpenMenu(null);setViewName('');setCustomCategories([]);setCustomTags([]);setCustomWhen('');setModal('custom');}
 // The builder reuses the bar's IS/AIS pairing so a set built here filters exactly
 // like one saved from the bar.
 function toggleCustomInterest(tag:string){setCustomTags(list=>{if(tag!=='IS')return list.includes(tag)?list.filter(t=>t!==tag):[...list,tag];const has=list.includes('IS')||list.includes('AIS');return has?list.filter(t=>t!=='IS'&&t!=='AIS'):[...list,'IS'];});}
 // Saving anything is a member action. Signed-out visitors get a real dialog
 // with a sign-in path (never a toast they can miss on a phone), and the
 // return link brings them straight back to what they were saving.
 const signInFrom=useRef<typeof modal>(null);
 function requireSignIn():boolean{if(signedIn)return true;setOpenMenu(null);signInFrom.current=modal;setModal('signin');return false;}
 async function savePreferences(next:Preferences){if(!requireSignIn())return false;setSaving(true);try{const r=await fetch('/api/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});const json=await r.json() as {error?:string};if(!r.ok)throw new Error(json.error);setPreferences(next);return true;}catch(e){setToast(e instanceof Error?e.message:'Could not save. Try again.');return false;}finally{setSaving(false);}}
 async function bookmark(e:CampusEvent){const exists=preferences.saved.includes(e.id);track({type:'save',name:e.id,detail:exists?'remove':'add'});if(!exists)personal('save',e);const savedMeta={...(preferences.savedMeta||{})};if(exists)delete savedMeta[e.id];else savedMeta[e.id]={title:e.title,day:localDate(e),location:e.location||undefined,sourceName:e.sourceName};const ok=await savePreferences({...preferences,saved:exists?preferences.saved.filter(id=>id!==e.id):[...preferences.saved,e.id],savedMeta});if(ok){setToast(exists?'Removed from your calendar.':'Saved to your calendar.');dismissEventTour();}}
 // When a feed stops publishing an event, the saved id no longer resolves; the
 // stored note lets My calendar name it and offer a clean removal instead of
 // dropping the row without explanation.
 async function dismissMissing(id:string){const savedMeta={...(preferences.savedMeta||{})};delete savedMeta[id];const ok=await savePreferences({...preferences,saved:preferences.saved.filter(x=>x!==id),savedMeta});if(ok)setToast('Removed from your calendar.');}
 // Both save paths land as ordinary saved views: the filters already on screen,
 // or a set assembled from scratch in the builder. Saving a built set also shows
 // it, because the member is looking at the builder rather than at results.
 async function saveNamedView(name:string,shape:{query:string;categories:string[];tags:string[]},apply:boolean){
  if(!name.trim())return;
  if(preferences.views.length>=MAX_SAVED_SETS){setToast(`You can keep up to ${MAX_SAVED_SETS} saved sets. Remove one first.`);return;}
  const view:SavedView={id:crypto.randomUUID(),name:name.trim().slice(0,60),...shape};
  const ok=await savePreferences({...preferences,views:[...preferences.views,view]});
  if(!ok)return;
  setModal(null);setViewName('');
  if(apply){applyView(view);setToast(`“${view.name}” saved. Showing it now.`);}
  else setToast('Filter saved. Find it under Saved in the filter bar.');
 }
 async function saveView(){await saveNamedView(viewName,{query,categories,tags},false);}
 async function saveCustomView(){await saveNamedView(viewName,{query:customWhen,categories:customCategories,tags:customTags},true);}
 function download(items:CampusEvent[]){const exportable=section==='saved'?items.filter(e=>!isSuggestion(e)):items;if(!exportable.length){setToast('Choose some events before exporting.');return;}track({type:'export',detail:'list',name:String(exportable.length)});const url=URL.createObjectURL(new Blob([exportICS(exportable)],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='byu-calendar.ics';a.click();URL.revokeObjectURL(url);setToast('Calendar file downloaded. This export is a snapshot.');}
 // One-click export of a single event as an .ics file the visitor's own calendar app can import.
 function addToCalendar(e:CampusEvent){track({type:'export',detail:'single',name:e.id});personal('export',e);const kind=personalCalendarKind(navigator.userAgent,navigator.maxTouchPoints||0);if(kind==='google'){const link=googleCalendarUrl(e);if(link){if(!window.open(link,'_blank','noopener')){const fallback=document.createElement('a');fallback.href=link;fallback.target='_blank';fallback.rel='noopener';fallback.click();}setToast('Opening Google Calendar — tap Save to add it.');return;}}if(kind==='apple'){const appleLink=document.createElement('a');appleLink.href='/api/events/ics?id='+encodeURIComponent(e.id);appleLink.click();setToast('Opening your calendar — confirm the event in the sheet.');return;}const url=URL.createObjectURL(new Blob([exportICS([e])],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='byu-event-'+(eventSlug(e.title)||'event')+'.ics';a.click();URL.revokeObjectURL(url);setToast('Event file downloaded. Open it to add it to your personal calendar.');}
 async function shareEvent(e:CampusEvent){
  track({type:'share',name:e.id});personal('share',e);
  const url=location.origin+'/events/'+encodeURIComponent(e.id);
  const ua=navigator.userAgent;
  const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/.test(ua));
  const nav=navigator as Navigator&{share?:(data:{title:string;url:string})=>Promise<void>;canShare?:(data:{title:string;url:string})=>boolean};
  if(mobile&&typeof nav.share==='function'&&(!nav.canShare||nav.canShare({title:e.title,url}))){
   try{await nav.share({title:e.title,url});return;}catch(err){if(err instanceof DOMException&&err.name==='AbortError')return;}
  }
  try{await navigator.clipboard.writeText(url);setToast('Event link copied. Send it to anyone.');if(shareTimer.current)clearTimeout(shareTimer.current);setShared(true);shareTimer.current=setTimeout(()=>setShared(false),1800);}
  catch{setToast('Copying was blocked. The event link is in your browser’s address bar.');}
 }
 function openEvent(e:CampusEvent){setSelected(e);setModal('event');if(!tourSeen(EVENT_TOUR_FLAG)){markTourSeen(EVENT_TOUR_FLAG);setEventTourArmed(true);}personal('event_view',e);track({type:'event_view',name:e.id,detail:e.sourceId});if(shareTimer.current)clearTimeout(shareTimer.current);setShared(false);}
 function switchView(v:'week'|'month'|'list'|'map'){setView(v);track({type:'view_switch',detail:v});}
 // The map is a destination in the top navigation. Leaving it for Discover or
 // My calendar brings back the view the visitor left — and the event card they
 // had open when they jumped to the map from that event.
 const [mapReturn,setMapReturn]=useState<{event:CampusEvent|null;view:'week'|'month'|'list'}|null>(null);
 function openMapPage(event:CampusEvent|null){
  if(view!=='map')setMapReturn({event,view});
  else if(event)setMapReturn(prev=>({event,view:prev?.view||'list'}));
  setView('map');track({type:'view_switch',detail:'map'});
 }
 function leaveMap(){
  if(view!=='map')return;
  setView(mapReturn?.view||'list');
  if(mapReturn?.event){setSelected(mapReturn.event);setModal('event');}
  setMapReturn(null);
 }
 function openDay(key:string){setDayLocation(null);setSelectedDay(key);setModal('day');}
 function applyView(v:SavedView){showAllMapPins();setQuery(v.query);setCategories(v.categories);setTags(v.tags);setSection('discover');if(view!=='map')setView('list');else if(parseSearch(v.query).start)changeMapDay(parseSearch(v.query).start!);setOpenMenu(null);}
 const clearCount=categories.length+tags.length+(query?1:0);
 const returnParams=new URLSearchParams({q:query,view,categories:categories.join(','),tags:tags.join(',')});if(selected&&['event','tag','report','signin'].includes(modal||''))returnParams.set('event',selected.id);if(view==='map'){returnParams.set('date',mapDay);if(mapFocus)returnParams.set('place',mapFocus.id);}const returnTo='/?'+returnParams.toString();
 const signInHref='/signin?returnTo='+encodeURIComponent(returnTo);
 // Rebuilding the merged calendar can take a while right after a deploy or
 // server restart, so dialogs never wait on it: submit flows close first and
 // let the refreshed events land here in the background.
 async function refreshEventsQuietly(){try{const d=await getJSON<CalendarData>('/api/events');setData(d);setError('');}catch{/* Keep the current events; the next sync or visit picks up changes. */}}
 async function contributionComplete(message:string){setModal('event');setToast(message);try{const d=await getJSON<CalendarData>('/api/events');setData(d);setError('');if(selected)setSelected(d.events.find(e=>e.id===selected.id)||selected);}catch{/* Already acknowledged; the next sync refreshes the calendar. */}}
 // Moderators delete any listing: community submissions are removed outright,
 // source events are hidden durably (the refresh feed would otherwise recreate
 // them) and stay restorable from Review reports.
 async function deleteSelected(){if(!selected)return;const moderatorDelete=isModerator,isCommunity=Boolean(selected.community);setDeleting(true);setDeleteError('');try{if(moderatorDelete)await postJSON('/api/moderation/events',{action:'delete',id:selected.id});else{await postJSON('/api/listings/delete',{id:selected.id});const gone=selected.id;setMyListings(ids=>{const next=new Set(ids);next.delete(gone);return next;});}setSelected(null);setModal(null);setToast(moderatorDelete&&!isCommunity?'Listing hidden from BYU Calendar. Restore it from Review reports.':'Listing deleted.');void refreshEventsQuietly();}catch(err){setDeleteError(err instanceof Error?err.message:'Could not delete the listing.');}finally{setDeleting(false);}}
 const activeInterests=uiInterests.filter(item=>item.tag==='IS'?tags.includes('IS')||tags.includes('AIS'):tags.includes(item.tag)).length;
 const shownTags=tags.filter((t,i)=>t==='AIS'?!tags.includes('IS')&&tags.indexOf(t)===i:tags.indexOf(t)===i);
 // The filters sit loose above the calendar — one wrapping list of chips, no panel —
 // followed by the dropdowns (interests and the member's saved filters) and then the
 // listing actions. On phones every section collapses into a dropdown of its own so
 // the calendar starts near the top of the screen instead of below three chip rows.
 const categoryChips=<>
  <button className={!query&&!tags.length&&!categories.length?'quick active':'quick'} onClick={reset}><Layers size={14}/> All events</button>
  {CATEGORIES.map((c,i)=>{const Icon=categoryIcons[i];const on=categories.includes(c.id);const count=upcoming.filter(e=>e.category===c.id).length;return <button key={c.id} aria-pressed={on} title={count+' upcoming '+c.id+' events'} className={'quick quick-cat '+c.color+(on?' active':'')} onClick={()=>toggle(c.id,categories,setCategories)}><span className={'category-icon '+c.color}><Icon size={12}/></span>{c.id}</button>;})}
 </>;
 const perkChips=<>
  {detailTags.map(([tag,Icon])=><button key={tag} aria-pressed={tags.includes(tag)} title={'Only events with '+tag.toLowerCase()} className={'quick detail-chip '+(tags.includes(tag)?'active':'')} onClick={()=>toggle(tag,tags,setTags)}><Icon size={14}/>{tag}</button>)}
  <button className={query==='clubs'?'quick active':'quick'} onClick={()=>quick('clubs')}><Users size={14}/> Clubs</button>
  <button className={query==='this week'?'quick active':'quick'} onClick={()=>quick('this week')}><CalendarDays size={14}/> This week</button>
  {clearCount>0&&<button className="text-button filter-reset" onClick={reset}>Reset ({clearCount})</button>}
 </>;
 // One saved-filters menu serves the desktop row and the phone dropdown, so the
 // two copies cannot drift apart. It offers the two ways to save: keep what is on
 // screen, or assemble a set from scratch in the builder.
 const savedPopover=(<div className="filter-popover" role="group" aria-label="Saved filters">
  <div className="section-label">SAVED FILTERS</div>
  {preferences.views.length>0?<div className="saved-views-list">{preferences.views.map(v=><div className="saved-view" key={v.id}>
   <button className="saved-view-open" onClick={()=>applyView(v)}><Bookmark size={14}/><span className="saved-view-name">{v.name}<small>{savedViewSummary(v.query,v.categories,v.tags)}</small></span></button>
   <button className="saved-view-remove" aria-label={'Delete '+v.name} onClick={()=>savePreferences({...preferences,views:preferences.views.filter(x=>x.id!==v.id)})}><X size={14}/></button>
  </div>)}</div>:<p className="popover-note saved-empty">Nothing saved yet. Keep the filters you are looking at, or build a set from scratch.</p>}
  <div className="saved-set-actions">
   <button className="outline-button" onClick={openSaveDialog}><Plus size={15}/> Save current filters</button>
   <button className="save-filter-link" onClick={openCustomDialog}><SlidersHorizontal size={15}/> Build a custom set</button>
  </div>
 </div>);
 const interestChips=<div className="interest-tags">{uiInterests.map(({tag,label})=>{const selectedTag=tag==='IS'?tags.includes('IS')||tags.includes('AIS'):tags.includes(tag);return <button key={tag} className={'interest-chip '+(selectedTag?'selected':'')} aria-pressed={selectedTag} onClick={()=>toggleInterest(tag)}>{selectedTag&&<Check size={13}/>} {label}</button>;})}</div>;
 const interestMenu=<div className="filter-menu">
  <button className={'outline-button'+(activeInterests>0?' has-active':'')} aria-haspopup="true" aria-expanded={openMenu==='interests'} onClick={()=>setOpenMenu(openMenu==='interests'?null:'interests')}><GraduationCap size={15}/> Interests{activeInterests>0&&<span className="menu-count">{activeInterests}</span>}<ChevronDown size={14}/></button>
  {openMenu==='interests'&&<div className="filter-popover" role="group" aria-label="Your interests"><div className="section-label">YOUR INTERESTS</div>{interestChips}<p className="popover-note">Narrow the calendar to the majors, clubs, and programs you follow.</p></div>}
 </div>;
 const activePerks=tags.filter(t=>!INTEREST_TAGS.includes(t)).length;
 const perksMenu=<div className="filter-menu">
  <button className={'outline-button'+(activePerks>0?' has-active':'')} aria-haspopup="true" aria-expanded={openMenu==='perks'} onClick={()=>setOpenMenu(openMenu==='perks'?null:'perks')}><SlidersHorizontal size={15}/> Perks & format{activePerks>0&&<span className="menu-count">{activePerks}</span>}<ChevronDown size={14}/></button>
  {openMenu==='perks'&&<div className="filter-popover" role="group" aria-label="Perks and format"><div className="section-label">PERKS & FORMAT</div><div className="popover-chips">{perkChips}</div></div>}
 </div>;
 const savedMenu=<div className="filter-menu">
  <button className={'outline-button'+(preferences.views.length>0?' has-active':'')} aria-haspopup="true" aria-expanded={openMenu==='saved'} onClick={()=>setOpenMenu(openMenu==='saved'?null:'saved')}><Bookmark size={15}/> Saved{preferences.views.length>0&&<span className="menu-count">{preferences.views.length}</span>}<ChevronDown size={14}/></button>
  {openMenu==='saved'&&savedPopover}
 </div>;
 const filterBar=(<div className="filter-bar" ref={filterToolsRef}>
  {!compact&&<div className="filter-row"><span className="filter-group-label">CATEGORIES</span><div className="filter-chips">{categoryChips}</div><div className="filter-tools">{perksMenu}{interestMenu}{savedMenu}</div></div>}
  {compact&&<div className="filter-tools">
   <div className="filter-menu"><button className={'outline-button'+(clearCount>0?' has-active':'')} aria-haspopup="true" aria-expanded={openMenu==='filters'} onClick={()=>setOpenMenu(openMenu==='filters'?null:'filters')}><SlidersHorizontal size={15}/> Filters{clearCount>0&&<span className="menu-count">{clearCount}</span>}<ChevronDown size={14}/></button>{openMenu==='filters'&&<div className="filter-popover" role="group" aria-label="Filters"><div className="section-label">CATEGORIES</div><div className="popover-chips">{categoryChips}</div><div className="section-label popover-subhead">INTERESTS</div>{interestChips}<div className="section-label popover-subhead">PERKS & FORMAT</div><div className="popover-chips">{perkChips}</div></div>}</div>
   {savedMenu}
  </div>}
 </div>);
 const mapsName=mapsAppName();
 const EventRow=({event:e}:{event:CampusEvent})=><article className={'event-row '+getColor(e)}><div className="row-time">{timeLabel(e)}<small>{e.format||'See details'}</small></div><button className="event-row-main" onClick={()=>openEvent(e)}><div className="event-row-category"><span className={'category-dot '+getColor(e)}/>{e.category}{e.important&&<span className="important-chip"><Star size={10} fill="currentColor"/>{e.important}</span>}{e.community&&<span className={'community-badge'+(e.byuOfficial?' byu-badge':'')}>{e.byuOfficial?'BYU':'Community'}</span>}{isSuggestion(e)&&<span className="suggestion-badge"><Sparkles size={10}/>Suggested</span>}</div><h3>{e.cancelled&&<span className="cancelled-label">Cancelled · </span>}{e.title}</h3><div className="row-location"><MapPin size={14}/>{e.location||'Location not listed'}</div><div className="row-tags">{e.tags.filter(t=>['Food provided','Free admission','Performances','Clubs','IS','AIS','Online','Networking'].includes(t)).slice(0,4).map(t=><span key={t}>{t==='Food provided'&&<Utensils size={12}/>} {t}</span>)}</div></button>{directionsHref(e)&&<div className="row-actions"><a className="row-map-button outline-button" title={'Directions in '+mapsName} aria-label={'Directions in '+mapsName+': '+e.title} href={directionsHref(e)||undefined} target="_blank" rel="noreferrer" onClick={()=>{track({type:'directions',name:e.id,detail:'maps'});personal('directions',e);}}><Navigation size={14}/><span>{mapsName}</span></a></div>}</article>;
 return <div className="app-shell"><LaunchLoader ready={!loading&&!onboarding} count={upcoming.length} onMinWait={()=>setLaunchSettled(true)}/>{onboarding&&launchSettled&&<Onboarding onDone={finishOnboarding}/>}<header className="topbar"><a className="brand" href="/"><BrandY className="brand-y"/><span>BYU<span className="brand-light"> Calendar</span></span></a><nav aria-label="Main navigation"><button className={'nav-item '+(section==='discover'&&view!=='map'?'active':'')} onClick={()=>{leaveMap();setSection('discover');}}>Discover</button><button className={'nav-item '+(section==='saved'&&view!=='map'?'active':'')} onClick={()=>{leaveMap();setSection('saved');setView('list');reset();}}><Bookmark size={15}/> My calendar {preferences.saved.length>0&&<span className="nav-count">{preferences.saved.length}</span>}</button><button className={'nav-item '+(view==='map'?'active':'')} onClick={()=>openMapPage(null)}><MapPin size={15}/> Map</button></nav>{signedIn?<a className="signin-button account-nav" href="/account" title={account?.user?.email}><Users size={15}/> Account</a>:<span className="topbar-auth"><a className="signin-button" href={signInHref}>Sign in <ArrowUpRight size={14}/></a><a className={'signin-button signup-button'} href={'/signin?mode=signup&returnTo='+encodeURIComponent(returnTo)}>Sign up</a></span>}</header>
 <main className="workspace"><div className="searchbar-wrap"><div className="searchbar"><Search size={23}/><input ref={searchRef} aria-label="Search events" role="combobox" aria-expanded={suggestOpen&&suggestions.length>0} aria-controls="search-suggestions" aria-autocomplete="list" value={query} onChange={e=>{changeQuery(e.target.value);setSuggestOpen(true);setSuggestIndex(-1);}} onFocus={()=>setSuggestOpen(true)} onBlur={()=>setTimeout(()=>{setSuggestOpen(false);setSuggestIndex(-1);},120)} onKeyDown={onSuggestKey} placeholder="Try ‘free food this week’ or ‘IS networking’"/>{query&&<button className="icon-button" aria-label="Clear search" onClick={()=>{changeQuery('');searchRef.current?.focus();}}><X size={18}/></button>}<button className="search-submit" aria-label="Search" title="Search" onClick={submitSearch}><ArrowRight size={18}/></button></div>
 {suggestOpen&&suggestions.length>0&&<div className="suggest-list" id="search-suggestions" role="listbox" aria-label="Search suggestions" onTouchStart={e=>{const t=e.touches[0];swipeStart.current={x:t.clientX,y:t.clientY};}} onTouchEnd={e=>{const start=swipeStart.current;swipeStart.current=null;if(!start)return;const t=e.changedTouches[0];if(t.clientX-start.x>40&&Math.abs(t.clientY-start.y)<30)fillSuggestion();}}>{suggestions.map(([value,label],i)=><button key={value} role="option" aria-selected={i===suggestIndex} className={'suggest-row'+(i===suggestIndex?' highlight':'')} onMouseDown={e=>e.preventDefault()} onClick={()=>applySuggestion(value)}><Search size={15}/><span>{label}</span><span className="suggest-fill" aria-hidden="true"><i className="fill-desktop">Tab or →</i><i className="fill-mobile">Swipe →</i></span></button>)}</div>}
 {!loading&&<SearchTip visible={!tourSeen(SEARCH_TOUR_FLAG)&&!arrivedWithQuery} onTry={()=>{changeQuery('free food this week');setView('list');}}/>}</div>
 {filterBar}
 {error&&<div className="error-banner" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={()=>load()}>Try again</button></div>}
 <div className="calendar-layout"><div className="results-area">
 {section==='saved'&&missingSaved.length>0&&<section className="saved-missing" aria-label="Saved events no longer listed">
  <div className="saved-missing-head"><AlertCircle size={19}/><div><b>{missingSaved.length===1?'One saved event is no longer listed':missingSaved.length+' saved events are no longer listed'}</b><p>The source stopped publishing {missingSaved.length===1?'it':'them'}, so {missingSaved.length===1?'it has':'they have'} left the calendar. If {missingSaved.length===1?'it comes':'they come'} back, {missingSaved.length===1?'it':'they'} will reappear here.</p></div></div>
  <ul className="saved-missing-list">{missingSaved.map(({id,note})=><li key={id}><div className="saved-missing-info"><b>{note?.title||'An event you saved'}</b><small>{note?dateTitle(note.day,{weekday:'short',month:'short',day:'numeric'}):'Date not recorded'}{note?.location?' · '+note.location:''}{note?.sourceName?' · '+note.sourceName:''}</small></div><button className="outline-button" onClick={()=>void dismissMissing(id)}>Remove</button></li>)}</ul>
 </section>}
 {section==='saved'&&<section className="picks-panel" aria-label="Picked for you">
  <div className="picks-head">
   <div><div className="section-label">PICKED FOR YOU</div><h3>Events the calendar picked for you</h3>{picks?.profile&&[...picks.profile.interests,...picks.profile.categories,...picks.profile.details].length>0&&<p className="picks-following">Following your picks: {[...picks.profile.interests,...picks.profile.categories,...picks.profile.details].join(' · ')}</p>}</div>
   {signedIn&&<button className="outline-button" onClick={()=>setModal('profile')}><Sparkles size={15}/>{picks?.hasProfile?'Tune your picks':'Get started'}</button>}
  </div>
  {!signedIn?(
   <div className="picks-promo"><Sparkles size={18}/><p>Tell the calendar what you like. It learns from the events you open and save, and fills this row with campus events picked just for you.</p><a className="primary-button" href={signInHref}>Sign in for picks <ArrowRight size={15}/></a></div>
  ):picks?.picks.length?(
   <>
   <p className="picks-summary"><span className="suggestion-badge"><Sparkles size={10}/>Suggested</span> Your picks also run throughout the calendar below — every suggested event carries this tag until you save or skip past it.</p>
   <div className="picks-grid">{picks.picks.slice(0,6).map(pick=>{const e=events.find(ev=>ev.id===pick.id);if(!e)return null;return <button className="pick-card" key={pick.id} onClick={()=>openEvent(e)}>
    <span className="pick-when">{dateTitle(localDate(e),{weekday:'short',month:'short',day:'numeric'})}<small>{e.allDay?'All day':timeLabel(e)}</small></span>
    <span className="pick-title">{e.title}</span>
    <span className="pick-where"><MapPin size={12}/>{e.location||'Location not listed'}</span>
    <span className="pick-reasons">{pick.reasons.map(reason=><i key={reason}>{reason}</i>)}</span>
   </button>;})}</div>
   </>
  ):picks?(
   <p className="picks-empty">{picks.hasProfile?'No strong matches right now. Open and save a few events and this row fills in as your tastes sharpen.':'Answer a few quick questions and this row fills with events picked for you.'}{!picks.hasProfile&&<button className="text-button" onClick={()=>setModal('profile')}>Start now <ArrowRight size={13}/></button>}</p>
  ):null}
 </section>}
 {(tags.length>0||categories.length>0||intent.labels.length>0||assistActive||assistLoading)&&<div className="active-filters"><span>SHOWING</span>{categories.map(c=><button key={c} onClick={()=>toggle(c,categories,setCategories)}>{c}<X size={12}/></button>)}{shownTags.map(t=><button key={t} onClick={()=>t==='IS'||t==='AIS'?toggleInterest('IS'):toggle(t,tags,setTags)}>{t==='IS'||t==='AIS'?'IS / AIS':t}<X size={12}/></button>)}{intent.labels.map(l=><span className="intent-chip" key={l}><Sparkles size={11}/>{l}</span>)}{assistActive&&assist&&<button className="assist-chip" title="Interpreted by smart search — click to dismiss" onClick={dismissAssist}><Sparkles size={11}/>{assist.summary}<X size={12}/></button>}{assistLoading&&<span className="assist-chip loading"><Sparkles size={11}/>Interpreting your search…</span>}<button className="save-mix" onClick={()=>setModal('save')}><Bookmark size={12}/> Save</button></div>}
 <section className={'calendar-surface '+(view==='map'?'map-surface':'')} aria-label="Event calendar"><div className="calendar-toolbar"><div className="calendar-title-group"><h2>{view==='map'?'Campus map':view==='week'?dateTitle(days[0].key,{month:'short',day:'numeric'})+' – '+dateTitle(days[6].key,{month:'short',day:'numeric'}):view==='month'?monthTitle(month):section==='saved'?'My calendar':'Coming up'}</h2><span className="count-pill">{view==='map'?(resultsByDay.get(mapDay)||[]).length:view!=='list'?monthCount:listed.length} events</span>{view!=='list'&&view!=='map'&&<span className="date-nav">{!isCurrentPeriod&&<button className="today-button" onClick={()=>setMonth(new Date())}>{view==='week'?'Back to this week':'Back to this month'}</button>}<div className="month-navigation"><button aria-label={view==='week'?'Previous week':'Previous month'} onClick={()=>setMonth(view==='week'?new Date(month.getFullYear(),month.getMonth(),month.getDate()-7):new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button><button aria-label={view==='week'?'Next week':'Next month'} onClick={()=>setMonth(view==='week'?new Date(month.getFullYear(),month.getMonth(),month.getDate()+7):new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button></div></span>}</div><div className="calendar-actions"><div className="view-toggle" aria-label="Calendar view"><button aria-label="Week view" aria-pressed={view==='week'} className={view==='week'?'selected':''} onClick={()=>{switchView('week');setMonth(new Date());}}><LayoutGrid size={19}/><span>Week</span></button><button aria-label="Month view" title="Month view" aria-pressed={view==='month'} className={view==='month'?'selected':''} onClick={()=>switchView('month')}><CalendarDays size={19}/><span>Month</span></button><button aria-label="Day view" title="Day view" aria-pressed={view==='list'} className={view==='list'?'selected':''} onClick={()=>switchView('list')}><List size={19}/><span>Day</span></button></div></div></div>
 {view==='map'&&<div className="map-date-toolbar"><div><div className="section-label">EXPLORE A DAY</div><h3>{dateTitle(mapDay)}</h3></div><div className="map-date-actions"><button className="outline-button" onClick={()=>changeMapDay(today)}>Today</button><button className="icon-button" aria-label="Previous day" onClick={()=>moveMapDay(-1)}><ChevronLeft size={18}/></button><input type="date" aria-label="Map date" value={mapDay} onChange={e=>changeMapDay(e.target.value)}/><button className="icon-button" aria-label="Next day" onClick={()=>moveMapDay(1)}><ChevronRight size={18}/></button></div></div>}
 {loading?<div className="empty-state"><LoaderCircle className="spin" size={30}/><h3>Bringing campus together…</h3><p>Loading events from connected calendars.</p></div>:view==='map'?<Suspense fallback={<div className="empty-state"><LoaderCircle className="spin" size={30}/><p>Loading campus map…</p></div>}><CampusMap groups={mappedDay.groups} unmappedCount={mappedDay.unmapped.length} focus={mapFocus} focusToken={mapFocusToken} filterKey={JSON.stringify([query,categories,tags,section,mapDay,mapFitToken])} onFocused={finishMapFocus} onLocation={openLocation} onUnmapped={()=>{setSelectedDay(mapDay);setDayLocation('unmapped');setModal('day');}}/></Suspense>:view!=='list'?<><div className="weekday-grid">{(view==='week'?[...dayNames.slice(1),dayNames[0]]:dayNames).map(d=><div key={d}>{d}</div>)}</div><div className={'month-grid '+(view==='week'?'week-grid':'')}>{days.map(({date,key})=>{const items=resultsByDay.get(key)||[];const other=view==='month'&&date.getMonth()!==month.getMonth();return <div className={'day-cell '+(other?'other-month ':'')+(key===today?'today ':'')+(key<today?'past ':'')} key={key}><button className="day-number" aria-label={dateTitle(key)+', '+items.length+' events'} onClick={()=>openDay(key)}>{date.getDate()}{key===today&&<span>TODAY</span>}</button><div className="day-events">{items.slice(0,view==='week'?10:3).map((e,i,shown)=><button title={`${timeLabel(e)} · ${e.title}`} className={'calendar-event '+getColor(e)+(e.important?' important-event':'')+(view==='week'?weekFlags(e,shown[i-1]):'')} key={e.id} onClick={()=>openEvent(e)}><span className="event-time">{e.allDay?'ALL DAY':timeLabel(e)}</span><span>{e.title}</span>{e.important&&<Star size={10} fill="currentColor" className="event-star" aria-label="Important event"/>}{isSuggestion(e)&&<Sparkles size={10} className="event-suggestion" aria-label="Suggested for you"/>}{preferences.saved.includes(e.id)&&<Bookmark size={10} fill="currentColor"/>}</button>)}{items.length>(view==='week'?10:3)&&<button className="more-events" onClick={()=>openDay(key)}>+{items.length-(view==='week'?10:3)} more</button>}</div></div>;})}</div></>:listed.length?<div className="agenda">{listGroups.map(([key,items])=><section className={'agenda-group'+(key===today?' is-today':'')} key={key}><div className="agenda-date"><div className={key===today?'today-date':''}><span>{dateTitle(key,{weekday:'short'}).toUpperCase()}</span><b>{Number(key.slice(-2))}</b></div><span>{dateTitle(key,{month:'short'}).toUpperCase()}</span><small>{items.length} event{items.length===1?'':'s'}</small>{key===today&&<em className="today-pill">Today</em>}</div><div className="agenda-events">{items.map(e=><EventRow key={e.id} event={e}/>)}</div></section>)}{listed.length>listLimit&&<button className="load-more outline-button" onClick={()=>setListLimit(listLimit+40)}>Show more events <ArrowRight size={16}/></button>}</div>:<div className="empty-state"><span className="empty-icon"><Search size={30}/></span><h3>{section==='saved'?'Make room for your favorites.':'Nothing in this mix. Yet.'}</h3><p>{assistActive&&assist?`Smart search read “${query.trim()}” as “${assist.summary}” and still found nothing. Try broader words or a different phrase.`:section==='saved'?'Save events with the bookmark button and they’ll appear here.':'Try fewer filters or a broader search. IS and AIS announcements need additional source connections.'}</p><button className="primary-button" onClick={()=>{reset();setSection('discover');}}>Explore all events <ArrowRight size={16}/></button></div>}
 <footer className="calendar-footer"><span><Globe size={13}/> All times in Mountain Time</span><div className="calendar-footer-actions"><button className="footer-subscribe" onClick={()=>setModal('subscribe')}><CalendarPlus size={14}/> Subscribe</button><button onClick={()=>download(view==='map'?(resultsByDay.get(mapDay)||[]):view!=='list'?shown.filter(e=>eventDays(e).some(d=>days.some(day=>day.key===d))):listed)}><Download size={14}/> Export these events</button></div></footer></section>
 <div className="below-calendar"><div className="below-footer"><p><button onClick={()=>setModal('sources')}>{totalSources} connected calendars <ArrowUpRight size={12}/></button></p><div className="below-actions"><a className="text-button add-upcoming-link" href="/listings/new"><Plus size={14}/> Add an upcoming event</a>{isModerator&&<a className="text-button" href="/moderation"><Flag size={14}/> Review reports</a>}</div></div></div></div></div>
 <footer className="site-footer"><span>Independent student project · Not an official BYU service · <Link prefetch={false} href="/privacy">Privacy</Link></span></footer></main>
 <dialog ref={dialogRef} className={'modal '+(modal==='sources'?'sources-modal':modal==='custom'?'custom-modal':'')} onCancel={()=>setModal(null)} onClick={e=>{if(e.target===dialogRef.current)setModal(null);}} aria-label={modal==='event'?selected?.title:modal==='sources'?'Connected calendars':modal==='day'?(dayLocation&&dayLocation!=='unmapped'?dayLocation.name+' · ':'')+'Events on '+selectedDay:modal==='save'?'Save filters':modal==='custom'?'Build a custom set':modal==='tag'?'Add a tag':modal==='report'?'Report listing':modal==='profile'?'Personalize your picks':modal==='subscribe'?'Subscribe to this calendar':'BYU Calendar'}><button className="modal-close icon-button" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={21}/></button>
 {modal==='event'&&selected&&<button className={'modal-share'+(shared?' shared':'')} title={shared?'Link copied':'Share event'} aria-label={shared?'Link copied':'Share '+selected.title} onClick={()=>shareEvent(selected)}>{shared?<Check size={16}/>:<Share2 size={15}/>}</button>}
 {modal==='event'&&selected&&<div className="event-detail"><div className={'detail-color-bar '+getColor(selected)}/><div className={'detail-header '+getColor(selected)}><span className="detail-category-pill">{selected.category}</span>{selected.important&&<span className="important-badge"><Star size={14} fill="currentColor"/>IMPORTANT · {selected.important.toUpperCase()}</span>}{selected.community&&<span className={'community-badge listing-badge'+(selected.byuOfficial?' byu-badge':'')}>{selected.byuOfficial?'BYU added event · '+selected.organizer:'Community submitted · '+selected.organizer}</span>}</div>{isSuggestion(selected)&&<div className="suggestion-note"><Sparkles size={15}/><span><b>Picked for you.</b> {selectedPickReasons.length&&selectedPickReasons[0]!=='Campus pick'?`Matched to your interests — ${selectedPickReasons.join(', ')}.`:'A general pick — your interests order this calendar, they never hide events.'} It stays until it passes or you save it.</span></div>}<h2>{selected.cancelled&&<span className="cancelled-label">Cancelled · </span>}{selected.title}</h2><div className="event-facts"><div><CalendarDays size={19}/><span>{dateTitle(localDate(selected))}{lastDay(selected)!==localDate(selected)?' – '+dateTitle(lastDay(selected),{month:'long',day:'numeric'}):''}<small>{timeLabel(selected)}{selected.end&&!selected.allDay&&!selected.timeTba?' – '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'}).format(new Date(selected.end)):!selected.allDay&&!selected.timeTba?' · End time not listed':''}{selected.timeTba?' · confirm time with the source':' · Mountain Time'}</small></span></div><div><MapPin size={19}/><span>{selected.location||'Location not listed'}<small>{selected.format||'Attendance format not specified'}</small></span></div></div><div className="detail-tags">{selected.tags.filter(t=>!selected.communityTags?.some(c=>c.tag===t)).map(t=><button key={t} onClick={()=>{setTags([t]);setQuery('');setCategories([]);setView('list');setModal(null);}}>{t}</button>)}</div>{Boolean(selected.communityTags?.length)&&<section className="community-tag-section"><h3>Community tags</h3><p>Added by members with verified BYU emails.</p>{selected.communityTags?.map(t=><div className="community-tag-note" key={t.id}><button className="community-badge" onClick={()=>{setTags([t.tag]);setView('list');setModal(null);}}>{t.tag}</button><span>{t.note}</span></div>)}</section>}<p className="description">{selectedDetail.description||'The source has not provided a description. Follow the original listing for more information.'}</p><div className="detail-buttons"><button disabled={saving} className={'primary-button'+(eventTour?' tour-spotlight':'')} onClick={()=>bookmark(selected)}><Bookmark size={17} fill={preferences.saved.includes(selected.id)?'currentColor':'none'}/>{preferences.saved.includes(selected.id)?'Saved to my calendar':'Save event'}</button><a className="outline-button" href={selected.url} target="_blank" rel="noreferrer">Original listing <ArrowUpRight size={16}/></a>{directionsHref(selected)&&<a className={'outline-button'+(eventTour?' tour-spotlight':'')} href={directionsHref(selected)||undefined} target="_blank" rel="noreferrer" onClick={()=>{track({type:'directions',name:selected.id,detail:'maps'});personal('directions',selected);}}><Navigation size={17}/> Directions ({mapsName})</a>}{resolveCampusLocation(selected)&&<button className={'outline-button'+(eventTour&&!directionsHref(selected)?' tour-spotlight':'')} onClick={()=>seeOnMap(selected)}><MapPin size={17}/> View on 3D map</button>}<button className="outline-button" onClick={()=>addToCalendar(selected)}><CalendarPlus size={17}/> Add to Personal Calendar</button></div>{rsvp&&selected&&<div className="rsvp-row"><div className="rsvp-faces">{rsvp.members.slice(0,10).map((m,i)=><span key={i} className={'rsvp-face'+(m.avatar?'':' plain')} title={signedIn&&m.name?m.name+' · '+m.email:m.initial}>{m.avatar?<img src={m.avatar} alt={signedIn&&m.name?m.name+'’s profile picture':'Member profile picture'}/>:m.initial}</span>)}{rsvp.count>10&&<span className="rsvp-more">+{rsvp.count-10}</span>}</div><span className="rsvp-label">{rsvp.count} {rsvp.count===1?'person':'people'} going{preferences.saved.includes(selected.id)?' — including you':''}</span></div>}
<EventTip visible={eventTour} hasDirections={!!directionsHref(selected)} hasMap={!!resolveCampusLocation(selected)} signedIn={signedIn} signInHref={signInHref} onDismiss={dismissEventTour}/>{!resolveCampusLocation(selected)&&<p className="map-unavailable-note">No confirmed campus map location for this listing.</p>}<div className="detail-summary"><p className="section-label">{selected.community?'DETAILS FROM THE SUBMITTER':'DETAILS FROM THE SOURCE'}</p><div><Utensils size={15}/><span>Food</span><b>{selected.food==='yes'?'Provided':selected.food==='no'?'Not provided':'Not specified'}</b></div><div><Coffee size={15}/><span>Drinks</span><b>{selected.drinks==='yes'?'Provided':'Not specified'}</b></div><div><Users size={15}/><span>Who can attend</span><b>{selected.audience||'Not specified'}</b></div><div><CheckCircle2 size={15}/><span>Admission</span><b>{selected.free===true?'Free':selected.free===false?'Paid · check source':'Check source'}</b></div></div><div className="event-community-actions"><button className="outline-button" onClick={()=>setModal('tag')}><Tags size={15}/> Add a tag</button><button className="outline-button" onClick={()=>setModal('report')}><Flag size={15}/> Report listing</button>{isModerator&&<><button className="outline-button" onClick={()=>setModal('edit')}><Pencil size={15}/> Edit listing</button><button className="text-button" onClick={()=>{setDeleteError('');setModal('confirm-delete');}}><Trash2 size={15}/> Delete listing</button></>}{!isModerator&&signedIn&&selected.community&&myListings.has(selected.id)&&<><button className="outline-button" onClick={()=>setModal('edit')}><Pencil size={15}/> Edit listing</button><button className="text-button" onClick={()=>{setDeleteError('');setModal('confirm-delete');}}><Trash2 size={15}/> Delete listing</button></>}{!isModerator&&staffVerifiedArea&&eventInStaffArea(selected,staffVerifiedArea)&&<button className="outline-button" onClick={()=>setModal('edit')}><Pencil size={15}/> Edit listing</button>}</div><div className="provenance"><Link2 size={14}/><span>From <a href={selected.url} target="_blank" rel="noreferrer">{selected.sourceName}</a>{selected.additionalSources?.map((s,i)=><span key={i}> · <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)}<small>{selected.community?'Community submitted · Updated':data?.sources.find(s=>s.id===selected.sourceId)?.snapshot?'Snapshot imported':'Last checked'} {relative(selected.community?selected.sourceUpdated:data?.sources.find(s=>s.id===selected.sourceId)?.lastSuccess||null)}. Details may change; check the organizer’s listing before attending.</small>{selected.overridden&&<small>Corrected by a calendar moderator{selected.moderatedAt?' on '+new Date(selected.moderatedAt).toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric'}):''}; the correction survives source refreshes.</small>}{Boolean(selectedDetail.provenance)&&selectedDetail.provenance.split(/\n\n+/).map(line=><small key={line}>{line}</small>)}</span></div></div>}
 {modal==='sources'&&<div className="sources-content"><div className="eyebrow">A CLEARER PICTURE OF CAMPUS</div><h2>Connected calendars.</h2><p className="modal-intro">{upcoming.length} upcoming events, with a link back to where each one was announced.</p><div className="refresh-explainer"><RefreshCw size={22}/><div><b>Fresh when you’re here.</b><p>Listings are stored in a shared database. Opening the app checks for updates, and the server also refreshes every connected source every 20 minutes whether anyone is on the site or not — so the calendar keeps up on its own.</p></div></div><div className="sources-heading"><span className="section-label">CALENDARS & LISTINGS</span><button disabled={syncing} className="outline-button" onClick={()=>sync(true)}><RefreshCw size={14} className={syncing?'spin':''}/>{syncing?'Refreshing…':'Refresh sources'}</button></div>{data?.sources.filter(s=>s.enabled).map(s=><div className="source-row" key={s.id}><span className={'source-status-icon '+(s.error?'warning':s.count?'healthy':'quiet')}>{s.error?<AlertCircle size={18}/>:s.count?<CheckCircle2 size={18}/>:<CalendarDays size={18}/>}</span><div><a href={s.url} target="_blank" rel="noreferrer"><b>{s.name}</b><ArrowUpRight size={13}/></a><small>{s.snapshot&&s.lastSuccess?`Imported ${new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',year:'numeric'}).format(new Date(s.lastSuccess))} · `:''}{s.error||s.note||`${s.count} upcoming events · Checked ${relative(s.lastSuccess)}`}</small></div><span className="count-pill">{s.count}</span></div>)}<div className="section-label not-connected-label">NOT CONNECTED YET</div>{data?.sources.filter(s=>!s.enabled).map(s=><div className="source-row unconnected" key={s.id}><span className="source-status-icon quiet"><Link2 size={18}/></span><div><b>{s.name}</b><small>{s.note}</small></div><span className="connection-label">Not connected</span></div>)}<p className="source-note"><Info size={15}/> A connected source can only contribute events it publishes. This calendar doesn’t claim to include every BYU event.</p></div>}
 {modal==='day'&&<div className="day-detail"><div className="eyebrow">{dayLocation==='unmapped'?'WITHOUT A MAP PIN':dayLocation?'AT THIS LOCATION':'YOUR DAY, AT A GLANCE'}</div><h2>{dayLocation&&dayLocation!=='unmapped'?dayLocation.name:dateTitle(selectedDay)}</h2>{dayLocation&&<p className="map-day-date">{dateTitle(selectedDay)}</p>}<p className="modal-intro">{dayItems.length} events match your filters.{dayLocation==='unmapped'&&' These listings are online, off campus, or do not have a confirmed location in this map.'}</p>{dayItems.map(e=><EventRow key={e.id} event={e}/>)}{!dayItems.length&&<div className="empty-state"><CalendarDays size={30}/><p>No matching events {dayLocation?'at this location ':''}on this day.</p></div>}</div>}
 {modal==='save'&&<div className="save-dialog"><span className="empty-icon"><Bookmark size={28}/></span><h2>Your perfect mix.</h2><p className="modal-intro">Save this search and its filters so you can come back to it anytime.</p>{signedIn?<form onSubmit={e=>{e.preventDefault();saveView();}}><label htmlFor="view-name">Name your filter</label><input id="view-name" value={viewName} onChange={e=>setViewName(e.target.value)} maxLength={60} placeholder="e.g. My IS week" required/><div className="saved-preview">{savedViewSummary(query,categories,tags)}</div><button disabled={saving} className="primary-button" type="submit">{saving?'Saving…':'Save filter'}<Check size={16}/></button><button type="button" className="text-button dialog-alt" onClick={openCustomDialog}>Or build a set from scratch <ArrowRight size={13}/></button></form>:<a className="primary-button" href={signInHref}>Sign in to save <ArrowUpRight size={16}/></a>}</div>}
 {modal==='custom'&&<div className="save-dialog custom-dialog">
  <span className="empty-icon"><SlidersHorizontal size={28}/></span>
  <h2>Build a custom set.</h2>
  <p className="modal-intro">Choose exactly what belongs in this set. Saved sets wait under Saved in the filter bar, ready to apply whenever you want them.</p>
  {signedIn?<form onSubmit={e=>{e.preventDefault();saveCustomView();}}>
   <div className="custom-group"><p className="section-label">CATEGORIES</p><div className="popover-chips">{CATEGORIES.map((c,i)=>{const Icon=categoryIcons[i];const on=customCategories.includes(c.id);return <button type="button" key={c.id} aria-pressed={on} className={'quick quick-cat '+c.color+(on?' active':'')} onClick={()=>setCustomCategories(list=>on?list.filter(x=>x!==c.id):[...list,c.id])}><span className={'category-icon '+c.color}><Icon size={12}/></span>{c.id}</button>;})}</div></div>
   <div className="custom-group"><p className="section-label">INTERESTS</p><div className="interest-tags">{uiInterests.map(({tag,label})=>{const on=tag==='IS'?customTags.includes('IS')||customTags.includes('AIS'):customTags.includes(tag);return <button type="button" key={tag} className={'interest-chip '+(on?'selected':'')} aria-pressed={on} onClick={()=>toggleCustomInterest(tag)}>{on&&<Check size={13}/>} {label}</button>;})}</div></div>
   <div className="custom-group"><p className="section-label">PERKS & FORMAT</p><div className="popover-chips">{detailTags.map(([tag,Icon])=>{const on=customTags.includes(tag);return <button type="button" key={tag} aria-pressed={on} className={'quick detail-chip '+(on?'active':'')} onClick={()=>setCustomTags(list=>on?list.filter(x=>x!==tag):[...list,tag])}><Icon size={14}/>{tag}</button>;})}</div></div>
   <div className="custom-group"><p className="section-label">WHEN</p><div className="popover-chips">{WHEN_OPTIONS.map(([value,label])=>{const on=customWhen===value;return <button type="button" key={label} aria-pressed={on} className={'quick when-chip'+(on?' active':'')} onClick={()=>setCustomWhen(value)}>{on&&<Check size={12}/>} {label}</button>;})}</div></div>
   <label htmlFor="custom-set-name">Name this set</label>
   <input id="custom-set-name" value={viewName} onChange={e=>setViewName(e.target.value)} maxLength={60} placeholder="e.g. IS clubs this week" required/>
   <div className="saved-preview">{savedViewSummary(customWhen,customCategories,customTags)}</div>
   <button disabled={saving} className="primary-button" type="submit">{saving?'Saving…':'Save and show these events'}<Check size={16}/></button>
   <button type="button" className="text-button dialog-alt" onClick={openSaveDialog}>Or keep the filters I already have <ArrowRight size={13}/></button>
  </form>:<a className="primary-button" href={signInHref}>Sign in to save <ArrowUpRight size={16}/></a>}
 </div>}
 {modal==='signin'&&<div className="save-dialog"><span className="empty-icon"><Bookmark size={28}/></span><h2>Sign in to save.</h2><p className="modal-intro">A free account with your BYU email keeps saved events, filters, and picks with you on every device — and takes you right back to what you were saving.</p><div className="account-actions"><a className="primary-button" href={signInHref}>Sign in or create an account <ArrowUpRight size={16}/></a><button className="outline-button" onClick={()=>{setModal(signInFrom.current||null);signInFrom.current=null;}}>Not now</button></div></div>}
 {(modal==='tag'||modal==='report')&&selected&&<div className="contribution-dialog"><button className="text-button" onClick={()=>setModal('event')}><ChevronLeft size={15}/> Back to listing</button><div className="eyebrow">{modal==='tag'?'A LITTLE MORE HELPFUL':'KEEP CAMPUS IN THE KNOW'}</div><h2>{modal==='tag'?'Add a tag.':'Report this listing.'}</h2><p className="modal-intro">{selected.title}</p>{(modal==='tag'?account?.permissions.addTags:account?.permissions.reportListings)?<EventContributionForm key={modal+selected.id} kind={modal} event={selected} onComplete={contributionComplete}/>:<ContributionGate account={account} action={modal==='tag'?'add tags to listings':'report a listing'} returnTo={returnTo}/>}</div>}
 {modal==='edit'&&selected&&<div className="contribution-dialog"><button className="text-button" onClick={()=>setModal('event')}><ChevronLeft size={15}/> Back to listing</button><div className="eyebrow">KEEP IT CURRENT</div><h2>{selected.community?'Edit your listing.':'Correct this listing.'}</h2><p className="modal-intro">{selected.title}</p>{selected.community?(account?.permissions.addListings?<EditListingForm key={selected.id} event={selected} moderator={(isModerator||Boolean(staffVerifiedArea&&eventInStaffArea(selected,staffVerifiedArea)))&&!myListings.has(selected.id)} onComplete={contributionComplete}/>:<ContributionGate account={account} action="edit your listing" returnTo={returnTo}/>):(isModerator||staffVerifiedArea&&eventInStaffArea(selected,staffVerifiedArea)?<ModeratorEditForm key={selected.id} event={selected} onComplete={contributionComplete}/>:null)}</div>}
 {modal==='confirm-delete'&&selected&&<div className="contribution-dialog"><div className="eyebrow">{selected.community&&!isModerator?'REMOVE YOUR LISTING':'REMOVE THIS LISTING'}</div><h2>{selected.community&&!isModerator?'Delete your listing?':'Delete this listing?'}</h2><p className="modal-intro">{selected.title}</p><p className="account-description">{isModerator&&!selected.community?'This hides the listing from BYU Calendar. The connected source keeps its copy, and moderators can restore the listing from Review reports.':'This permanently removes your listing along with its community tags and reports. This cannot be undone.'}</p>{deleteError&&<p className="form-error" role="alert">{deleteError}</p>}<div className="account-actions"><button className="primary-button" disabled={deleting} onClick={()=>void deleteSelected()}><Trash2 size={16}/>{deleting?'Deleting…':isModerator&&!selected.community?'Hide from BYU Calendar':'Delete permanently'}</button><button className="outline-button" disabled={deleting} onClick={()=>setModal('event')}>Keep it</button></div></div>}
 {modal==='profile'&&<ProfileChat restartsOnOpen={Boolean(picks?.hasProfile)} onFinished={()=>{setModal(null);void loadPicks();setToast('Your picks are ready.');}} onUpdated={()=>{void loadPicks();}}/>}
 {modal==='subscribe'&&<SubscribeDialog filterSummary={savedViewSummary(query,categories,tags)} feedPath={'/api/calendar/ics'+(feedQuery?'?'+feedQuery:'')} signedIn={signedIn}/>}
 </dialog>{toast&&<div className="toast" role="status"><Info size={17}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>}</div>;
}
