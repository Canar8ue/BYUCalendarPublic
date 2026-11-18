import {civilToISO,classify,clean} from './catalog.mjs';
import {createHash} from 'node:crypto';
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
function decode(value=''){try{return JSON.parse(value);}catch{return value.replace(/^'|'$/g,'').replace(/''/g,"'");}}
function shiftYmd(ymd,days){const dt=new Date(ymd+'T12:00:00Z');dt.setUTCDate(dt.getUTCDate()+days);return dt.toISOString().slice(0,10);}
export function parseClubSnapshot(capture){
 const details=(capture.details||[]).filter(d=>d.snapshot.includes('- paragraph: Event Details')&&/^https:\/\/clubs\.byu\.edu\/link\/event\/\d+$/.test(d.url)).map(d=>{
   const s=d.snapshot,title=decode(s.match(/^- heading (.+) \[level=2\]/m)?.[1]);
   const field=name=>decode(s.match(new RegExp('- generic: "'+name+':"[\\r]?\\n- generic: (.+)'))?.[1]||'');
   return {title,date:field('Date'),time:field('Time'),description:decode(s.match(/^- paragraph: (.+)\r?\n- paragraph: Event Details/m)?.[1]||''),url:d.url};
 });
 const out=[];
 for(const row of capture.rows){
   const match=row.date.match(/([A-Za-z]+),?\s+(\d{1,2})(?:\s+(20\d{2}))?\s+(\d{1,2}):(\d{2})\s*(AM|PM)/);
   if(!match||!months.includes(match[1]))throw new Error('Unrecognized club event date: '+row.date);
   const [,month,day,year,hour,minute,period]=match;
   const effectiveYear=year||capture.calendarYear;
   if(!effectiveYear)throw new Error('Unrecognized club event year: '+row.date);
   const mIndex=months.indexOf(month)+1,dNum=Number(day),yNum=Number(effectiveYear);
   const check=new Date(Date.UTC(yNum,mIndex-1,dNum));
   if(check.getUTCFullYear()!==yNum||check.getUTCMonth()+1!==mIndex||check.getUTCDate()!==dNum)throw new Error('Invalid club event date: '+row.date);
   const ymd=`${effectiveYear}-${String(mIndex).padStart(2,'0')}-${day.padStart(2,'0')}`;
   const start=civilToISO(`${ymd} ${(+hour%12)+(period==='PM'?12:0)}:${minute}:00`);
   const dateNeedle=month+' '+dNum+',';
   const detail=details.find(d=>d.title===row.title&&d.date.includes(dateNeedle)&&(d.date.includes(String(yNum))||!/20\d{2}/.test(d.date)));
   let end=null;const endTime=detail?.time.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/);
   if(endTime){
     const clock=`${(+endTime[1]%12)+(endTime[3]==='PM'?12:0)}:${endTime[2]}:00`;
     let e=civilToISO(`${ymd} ${clock}`);
     if(e&&e<=start)e=civilToISO(`${shiftYmd(ymd,1)} ${clock}`);
     if(e&&e>start&&Date.parse(e)-Date.parse(start)<=16*3600000)end=e;
   }
   const orgName=clean(row.organization);
   const description=[detail?.description,orgName?`Hosted by ${orgName}.`:'','Collected from the public BYU Student Organizations calendar on '+capture.capturedAt.slice(0,10)+'. This listing does not refresh automatically; check the club for changes.'].filter(Boolean).join('\n\n');
   const org=orgName.toLowerCase();
   const category=/finance|accounting|marketing|business|sales|supply chain|management|investment/.test(org)?'Career & business':/engineering|cybersecurity|artificial intelligence|research|nuclear/.test(org)?'Academic':/comedy|cappella|dance|music/.test(org)?'Arts & culture':/soccer|racquetball|whitewater|fishing/.test(org)?'Sports & recreation':'Campus life';
   const id='club-directory-'+createHash('sha256').update(orgName+'|'+row.title+'|'+start).digest('hex').slice(0,20);
   out.push(classify({id,title:clean(row.title),description,start,end,allDay:false,location:clean(row.location),url:detail?.url||'https://clubs.byu.edu/',sourceId:'club-directory',sourceName:'BYU Student Organizations',organization:orgName,sourceUpdated:capture.capturedAt,cancelled:false,category}));
 }
 return [...new Map(out.map(e=>[e.id,e])).values()];
}
