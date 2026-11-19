"use client";
import {useState,useEffect,useRef,useSyncExternalStore,type CSSProperties} from 'react';
import BrandY from './brand-y';
// Split-curtain launch screen in BYU blue: plays on the first visit in a
// browser session, then records sessionStorage so returning or navigating back
// skips the overlay without repeating it.
const WORDS:[string,boolean][]=[['Find',false],['your',false],['next',true],['Event.',true]];
const LAUNCHED_KEY='byu-cal-launched';
const emptySubscribe=()=>()=>{};
const getAlreadyLaunched=()=>typeof document!=='undefined'&&document.documentElement.classList.contains('has-launched');
export default function LaunchLoader({ready,count}:{ready:boolean;count:number}){
 const alreadyLaunched=useSyncExternalStore(emptySubscribe,getAlreadyLaunched,()=>false);
 const [minWait,setMinWait]=useState(false),[gone,setGone]=useState(false);
 const root=useRef<HTMLDivElement|null>(null);
 let index=0;
 useEffect(()=>{if(alreadyLaunched)return;document.body.classList.add('is-launching');const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const timer=setTimeout(()=>{setMinWait(true);},reduced?200:2000);return()=>{clearTimeout(timer);document.body.classList.remove('is-launching');};},[alreadyLaunched]);
 const exit=ready&&minWait&&!alreadyLaunched;
 useEffect(()=>{const parent=root.current?.parentElement;if(!parent)return;const locked=!(alreadyLaunched||exit||gone);for(const child of Array.from(parent.children)){if(child===root.current)continue;(child as HTMLElement).inert=locked;}return()=>{for(const child of Array.from(parent.children)){if(child===root.current)continue;(child as HTMLElement).inert=false;}};},[alreadyLaunched,exit,gone]);
 useEffect(()=>{if(!exit)return;try{sessionStorage.setItem(LAUNCHED_KEY,'1');}catch{}root.current?.setAttribute('data-left','');document.body.classList.remove('is-launching');const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const timer=setTimeout(()=>{document.documentElement.classList.add('has-launched');setGone(true);},reduced?350:2000);return()=>clearTimeout(timer);},[exit]);
 useEffect(()=>()=>{try{if(sessionStorage.getItem(LAUNCHED_KEY)==='1')document.documentElement.classList.add('has-launched');}catch{}},[]);
 if(alreadyLaunched||gone)return null;
 return <div ref={root} className={'loader'+(exit?' loader--exit':'')} role="status" aria-label="Loading BYU Calendar"><div className="loader-panel loader-panel-top" aria-hidden="true"/><div className="loader-panel loader-panel-bottom" aria-hidden="true"/><div className="loader-content" aria-hidden="true"><div className="loader-brand"><BrandY className="loader-brand-y"/><span>BYU<span className="loader-brand-light"> Calendar</span></span></div><div className="loader-wordmark"><div className="loader-word">{WORDS.map(([word,italic])=><span className="loader-line" key={word}>{[...word].map(ch=>{const i=index++;return <span key={i} className={'l'+(italic?' l--italic':'')} style={{'--i':i} as CSSProperties}><i>{ch}</i></span>;})}{word!=='Event.'&&<span className="l l--gap" aria-hidden="true"/>}</span>)}</div></div>{ready&&<div className="loader-events"><b>{count}</b>upcoming events</div>}</div></div>;
}
