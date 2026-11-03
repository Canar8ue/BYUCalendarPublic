"use client";
import {useState,useEffect,useRef,type CSSProperties} from 'react';
import BrandY from './brand-y';
// Split-curtain launch screen in BYU blue: the wordmark's letters rise once
// from their masks, the floating brand hovers above, and the upcoming-events
// count lands in the bottom-right; once the calendar data is in, the content
// slides away and the two panels split open to reveal the calendar.
const WORDS:[string,boolean][]=[['Find',false],['your',false],['next',true],['Event.',true]];
// The launch choreography plays on every load. While first-visit questions
// are pending the caller keeps `ready` false, so the curtain holds until the
// visitor picks a category or skips — the exit state itself is derived (data
// in + minimum showtime), not stored, so the choreography lives in CSS; this
// effect only schedules the unmount. The exit also latches a `data-left`
// attribute on the curtain: some framework-level re-render can strip the
// exit class after the fact, but it never manages that attribute, so the
// panels stay split and the curtain stays hidden instead of flashing back.
export default function LaunchLoader({ready,count,onMinWait}:{ready:boolean;count:number;onMinWait?:()=>void}){
 const [minWait,setMinWait]=useState(false),[gone,setGone]=useState(false);
 const root=useRef<HTMLDivElement|null>(null);
 let index=0;
 useEffect(()=>{document.body.classList.add('is-launching');const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const timer=setTimeout(()=>{setMinWait(true);onMinWait?.();},reduced?200:2000);return()=>{clearTimeout(timer);document.body.classList.remove('is-launching');};},[]);
 const exit=ready&&minWait&&!gone;
 useEffect(()=>{if(!exit)return;root.current?.setAttribute('data-left','');document.body.classList.remove('is-launching');const timer=setTimeout(()=>setGone(true),2000);return()=>clearTimeout(timer);},[exit]);
 return <div ref={root} className={'loader'+(exit?' loader--exit':'')} role="status" aria-label="Loading BYU Calendar"><div className="loader-panel loader-panel-top" aria-hidden="true"/><div className="loader-panel loader-panel-bottom" aria-hidden="true"/><div className="loader-content" aria-hidden="true"><div className="loader-brand"><BrandY className="loader-brand-y"/><span>BYU<span className="loader-brand-light"> Calendar</span></span></div><div className="loader-wordmark"><div className="loader-word">{WORDS.map(([word,italic])=><span className="loader-line" key={word}>{[...word].map(ch=>{const i=index++;return <span key={i} className={'l'+(italic?' l--italic':'')} style={{'--i':i} as CSSProperties}><i>{ch}</i></span>;})}{word!=='Event.'&&<span className="l l--gap" aria-hidden="true"/>}</span>)}</div></div>{ready&&<div className="loader-events"><b>{count}</b>upcoming events</div>}</div></div>;
}
