import {readFile,writeFile} from 'node:fs/promises';
import {SOURCES,mergeEvents,lastDay} from '../lib/catalog.mjs';
import {importSource} from '../lib/source-import.mjs';
const prior=JSON.parse(await readFile(new URL('../data/seed.json',import.meta.url),'utf8'));
const snapshots=[];
for(const source of SOURCES){
 const previous=prior.find(s=>s.id===source.id);
 if(source.kind==='snapshot'){if(previous)snapshots.push(previous);continue;}
 try{
  const result=await importSource(source,{previous:previous?.events||[]});
  snapshots.push({id:source.id,events:result.events,lastSuccess:new Date().toISOString()});
  console.log(`${source.name}: ${result.events.length} records${result.warning?' — '+result.warning:''}`);
 }catch(e){if(previous)snapshots.push(previous);console.error(`${source.name}: ${e.message}; previous snapshot retained.`);process.exitCode=1;}
}
await writeFile(new URL('../data/seed.json',import.meta.url),JSON.stringify(snapshots));
const all=mergeEvents(snapshots.flatMap(s=>s.events)),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date());
console.log(JSON.stringify({sources:snapshots.length,records:all.length,upcoming:all.filter(e=>!e.cancelled&&lastDay(e)>=today).length}));
