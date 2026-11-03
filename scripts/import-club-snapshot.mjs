import {readFile,writeFile} from 'node:fs/promises';
import {parseClubSnapshot} from '../lib/club-snapshot.mjs';
const file=process.argv[2];if(!file)throw new Error('Provide the JSON capture from the public club listing.');
const capture=JSON.parse(await readFile(file,'utf8'));
const events=parseClubSnapshot(capture);
const target=new URL('../data/seed.json',import.meta.url),seed=JSON.parse(await readFile(target,'utf8'));
const updated=seed.filter(s=>s.id!=='club-directory');updated.push({id:'club-directory',events,lastSuccess:new Date().toISOString()});
await writeFile(target,JSON.stringify(updated));
console.log(`Imported ${events.length} club listings from ${new Set(events.map(e=>e.organization)).size} organizations. This is a dated snapshot.`);
