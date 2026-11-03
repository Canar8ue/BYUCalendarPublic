import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {SOURCES,parseICS,enrichBYU} from '../lib/catalog.mjs';
const dir=process.argv[2];const snapshots=[];
const details=JSON.parse(await readFile(dir+'/limit500.json','utf8'));
for(const source of SOURCES){const file=source.id==='byu'?'allByuICS.ics':source.id+'.ics';try{const raw=await readFile(dir+'/'+file,'utf8');let events=parseICS(raw,source);if(source.id==='byu')events=enrichBYU(events,details);snapshots.push({id:source.id,events,lastSuccess:new Date().toISOString()});console.log(source.name+': '+events.length);}catch(e){console.error(source.name+': '+e.message);}}
await mkdir('data',{recursive:true});await writeFile('data/seed.json',JSON.stringify(snapshots));
