"use client";
import {useEffect,useRef,useState} from 'react';
import {MapPin,ArrowUpRight} from 'lucide-react';
import type {CampusEventGroup,CampusLocation} from '../lib/campus-map.mjs';

type Props={groups:CampusEventGroup[];unmappedCount:number;focus:CampusLocation|null;focusToken:number;filterKey:string;onLocation:(location:CampusLocation,animate:boolean)=>void;onFocused:(token:number)=>void;onUnmapped:()=>void};
export default function CampusMap({groups,unmappedCount,focus,focusToken,filterKey,onLocation,onFocused,onUnmapped}:Props){
 const frame=useRef<HTMLIFrameElement>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const message={channel:'byu-calendar-map',type:'update',groups:groups.map(g=>({location:g.location,count:g.events.length,colors:g.colors})),focus,focusToken,filterKey};
 const latest=useRef({message,onLocation,onFocused});
 useEffect(()=>{latest.current={message,onLocation,onFocused};frame.current?.contentWindow?.postMessage(message,location.origin);});
 useEffect(()=>{
  const listener=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.channel!=='byu-calendar-map')return;
   if(event.data.type==='ready'){setStatus('ready');frame.current?.contentWindow?.postMessage(latest.current.message,location.origin);}
   if(event.data.type==='error')setStatus('error');
   if(event.data.type==='focused')latest.current.onFocused(event.data.token);
   if(event.data.type==='select'){
    // Resolve against our trusted catalog, never accept arbitrary event data from a message.
    import('../lib/campus-map.mjs').then(({campusLocations})=>{
     const place=campusLocations.find(l=>l.id===event.data.id||l.featureIds.includes(event.data.id));
     if(place)latest.current.onLocation(place,true);
    });
   }
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[]);
 const count=groups.reduce((n,g)=>n+g.events.length,0);
 return <div className="campus-map-view">
  <div className="map-summary"><span><MapPin size={16}/><b>{count} mapped events</b> across {groups.length} locations</span><span>Numbers count matching events · Rings show categories</span></div>
  <div className="map-stage"><iframe ref={frame} src="/campus/index.html" title="Interactive 3D map of BYU campus" onLoad={()=>frame.current?.contentWindow?.postMessage(latest.current.message,location.origin)}/></div>
  <div className="map-credits">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · USGS 3DEP · <a href="https://map.byu.edu/" target="_blank" rel="noreferrer">BYU campus data</a> · <a href="/campus/ATTRIBUTION.md" target="_blank" rel="noreferrer">Credits</a></div>
  {status==='error'&&<p className="map-notice" role="status">The 3D map is unavailable in this browser. The location buttons below still open all matching events.</p>}
  {focus&&<p className="map-focus-note" role="status"><MapPin size={15}/> Showing {focus.name}. Pins mark buildings or grounds; check the event for its room.</p>}
  <div className="map-locations"><div className="map-locations-heading"><h3>On campus this day</h3>{unmappedCount>0&&<button className="text-button" onClick={onUnmapped}>{unmappedCount} without a map pin <ArrowUpRight size={14}/></button>}</div>
   {!groups.length&&<p className="map-notice">No mapped events match this day and your filters. Try another date or adjust your filters.</p>}
   <div className="map-location-grid">{groups.map(g=><button key={g.location.id} className={'map-location-card '+(focus?.id===g.location.id?'selected':'')} onClick={()=>onLocation(g.location,status==='ready')}><span className="map-location-code">{g.location.code||<MapPin size={16}/>}</span><span className="map-location-name"><b>{g.location.name}</b><small>{g.colors.map(c=><span key={c.color} className={'category-dot '+c.color}/>)}{g.events.length} event{g.events.length===1?'':'s'}</small></span><ArrowUpRight size={16}/></button>)}</div>
  </div>
 </div>;
}
