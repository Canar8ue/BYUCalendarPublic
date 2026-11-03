'use client';
import {useEffect, useState} from 'react';
import AccountShell from '../../account-shell';
import {getJSON, useAccount} from '../../account-client';
import type {AnalyticsSummary,AnalyticsNamedCount} from '../../types';

function shortDay(day:string){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'numeric',day:'numeric'}).format(new Date(day+'T12:00:00Z'));}
function relative(date:string|null){if(!date)return 'Never';const m=Math.floor((Date.now()-Date.parse(date))/60000);return m<1?'Just now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;}

// Bars use plain divs with the app palette — no chart library, no client JS
// beyond this component's own state.
function BarChart({points,label}:{points:{key:string;value:number}[];label:string}){
 const max=Math.max(1,...points.map(p=>p.value));
 return <div className="bar-chart" role="img" aria-label={label}>
  {points.map(p=><div key={p.key} className="bar-column" title={`${p.key}: ${p.value}`}><div className={'bar'+(p.value===0?' empty':'')} style={{height:Math.max(p.value?6:2,Math.round(p.value/max*96))+'px'}}/></div>)}
 </div>;
}

function CountList({items,unit}:{items:AnalyticsNamedCount[];unit?:string}){
 if(!items.length)return <p className="analytics-empty">No data in the last 30 days yet.</p>;
 const max=Math.max(1,...items.map(i=>i.count));
 return <ul className="count-list">{items.map(item=><li key={item.name}>
  <span className="count-name" title={item.name}>{item.name}</span>
  <span className="count-bar" aria-hidden><span style={{width:Math.max(4,Math.round(item.count/max*100))+'%'}}/></span>
  <b>{item.count.toLocaleString()}{item.zeros?` (${item.zeros} with no results)`:''}{unit}</b>
 </li>)}</ul>;
}

export default function ModeratorAnalyticsPage(){
 const {account,error:accountError}=useAccount();
 const [summary,setSummary]=useState<AnalyticsSummary|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!account?.permissions.reviewReports)return;
  let active=true;
  getJSON<AnalyticsSummary>('/api/analytics')
   .then(data=>{if(active)setSummary(data);})
   .catch(()=>{if(active)setError('Could not load analytics.');});
  return()=>{active=false;};
 },[account]);
 const d=summary;
 return <AccountShell><section className="account-card moderation-card analytics-card">
  <div className="eyebrow">COMMUNITY CARE</div>
  <h1>Usage <span>analytics.</span></h1>
  <p className="account-description">How the calendar is used and what the data covers. Aggregate counts only — no names, emails, or IP addresses are recorded, and rows expire after 180 days.</p>
  <p className="moderator-nav"><a className="text-button" href="/moderation">Review reports</a><span aria-hidden>·</span><a className="text-button" href="/moderation/emails">Message inbox</a><span aria-hidden>·</span><span className="moderator-nav-current">Usage analytics</span></p>
  {(accountError||error)&&<p className="form-error" role="alert">{accountError||error}</p>}
  {!account&&!accountError&&<p>Loading your account…</p>}
  {account&&!account.permissions.reviewReports&&<p>This page is available to calendar administrators. <a className="text-button" href="/account">View your account</a></p>}
  {account?.permissions.reviewReports&&(!d
   ? <p>Loading analytics…</p>
   : <>
   <div className="stat-grid">
    <div className="stat-card"><span>VIEWS · 7 DAYS</span><b>{d.totals.views7.toLocaleString()}</b><small>{d.totals.views30.toLocaleString()} in 30 days</small></div>
    <div className="stat-card"><span>SEARCHES · 30 DAYS</span><b>{d.totals.searches30.toLocaleString()}</b><small>{d.zeroResultSearches.length} found nothing</small></div>
    <div className="stat-card"><span>EVENT PAGES · 30 DAYS</span><b>{d.totals.eventViews30.toLocaleString()}</b><small>detail dialog opens · {d.totals.directions30.toLocaleString()} map directions</small></div>
    <div className="stat-card"><span>EXPORTS · 30 DAYS</span><b>{d.totals.exports30.toLocaleString()}</b><small>{d.totals.saves30.toLocaleString()} saves · {d.totals.shares30.toLocaleString()} shares</small></div>
   </div>

   <h2 className="analytics-section">Traffic — last 30 days</h2>
   <BarChart points={d.days.map(day=>({key:day.day,value:day.views}))} label="Page views per day"/>
   <div className="chart-legend"><span className="legend-end">{shortDay(d.days[0]?.day||'')}</span><span>Page views per day</span><span className="legend-end">{shortDay(d.days[d.days.length-1]?.day||'')}</span></div>

   <div className="analytics-columns">
    <div><h2 className="analytics-section">Top searches</h2><CountList items={d.topSearches}/></div>
    <div><h2 className="analytics-section">Top pages</h2><CountList items={d.topPages}/></div>
   </div>
   <div className="analytics-columns">
    <div><h2 className="analytics-section">Where visits came from</h2><CountList items={d.referrers.length?d.referrers:[{name:'(direct and same-site)',count:d.totals.views30}]}/></div>
    <div>
     <h2 className="analytics-section">Visitors</h2>
     <CountList items={d.countries.length?d.countries.map(c=>({...c,name:c.name==='US'?'United States':c.name})):[{name:'(no country data)',count:d.totals.views30}]}/>
     <CountList items={d.devices}/>
    </div>
   </div>

   <h2 className="analytics-section">Data inventory</h2>
   <div className="stat-grid">
    <div className="stat-card"><span>UPCOMING EVENTS</span><b>{d.inventory.upcomingEvents.toLocaleString()}</b><small>{d.inventory.totalEvents.toLocaleString()} total incl. past</small></div>
    <div className="stat-card"><span>COMMUNITY LISTINGS</span><b>{d.community.listings.toLocaleString()}</b><small>{d.community.communityTags.toLocaleString()} community tags</small></div>
    <div className="stat-card"><span>ACCOUNTS</span><b>{d.community.accountsVerified.toLocaleString()}</b><small>verified of {d.community.accountsTotal.toLocaleString()}</small></div>
    <div className="stat-card"><span>REPORTS</span><b>{d.community.reportsOpen.toLocaleString()}</b><small>open of {d.community.reportsTotal.toLocaleString()} total · {d.community.inboxUnread} unread mail</small></div>
   </div>
   <div className="analytics-columns">
    <div><h3 className="analytics-subsection">Events per day — next 14 days</h3><BarChart points={d.inventory.nextDays.map(x=>({key:x.day,value:x.count}))} label="Events per day"/><div className="chart-legend"><span className="legend-end">{shortDay(d.inventory.nextDays[0]?.day||'')}</span><span>Events per day</span><span className="legend-end">{shortDay(d.inventory.nextDays[d.inventory.nextDays.length-1]?.day||'')}</span></div></div>
    <div>
     <h3 className="analytics-subsection">Upcoming by category</h3>
     <CountList items={d.inventory.byCategory}/>
     <h3 className="analytics-subsection">Busiest locations</h3>
     <CountList items={d.inventory.topLocations.slice(0,6)}/>
    </div>
   </div>
   <h3 className="analytics-subsection">Detail tags on upcoming events</h3>
   <CountList items={d.inventory.topTags}/>

   <h2 className="analytics-section">Sources</h2>
   <ul className="analytics-sources">
    {d.sources.filter(s=>s.enabled).map(s=><li key={s.id}>
     <span className={'source-status-icon '+(s.error?'warning':s.count?'healthy':'quiet')} aria-hidden/>
     <span className="count-name">{s.name}{s.snapshot?' (snapshot)':''}</span>
     <small>{s.error?'Error — retains last snapshot':`Checked ${relative(s.lastSuccess)}`}</small>
     <b>{s.count.toLocaleString()}</b>
    </li>)}
   </ul>
   <p className="form-help">Generated {new Date(d.generatedAt).toLocaleString()} · analytics count only visits and actions from real browsers (bots excluded); inventory reflects the live merged calendar.</p>
   </>)}
 </section></AccountShell>;
}
