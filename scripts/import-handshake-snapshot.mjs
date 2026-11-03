import {readFile,writeFile} from 'node:fs/promises';
import {parseHandshakeSnapshot} from '../lib/handshake-snapshot.mjs';

const file=process.argv[2];
if(!file)throw new Error('Provide the path to a reviewed Handshake event-listing JSON export.');
const importedAt=new Date().toISOString();
const events=parseHandshakeSnapshot(JSON.parse(await readFile(file,'utf8')),{importedAt});
const target=new URL('../data/seed.json',import.meta.url);
const seed=JSON.parse(await readFile(target,'utf8'));
const updated=seed.filter(source=>source.id!=='handshake');
updated.push({id:'handshake',events,lastSuccess:importedAt});
await writeFile(target,JSON.stringify(updated));
console.log(`Imported ${events.length} Handshake events (${events[0].start.slice(0,10)} through ${events.at(-1).start.slice(0,10)}). Snapshot only; automatic Handshake refresh is not configured.`);
