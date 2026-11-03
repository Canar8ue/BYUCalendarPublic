// Finalize the opt-in game with content-hashed JS/CSS after the framework build.
// Dev serves native source modules. The normal calendar never imports the game.
import {build} from 'vite';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const destination=resolve(root,'dist/client/explorer/runtime');
const result=await build({configFile:false,root,publicDir:false,logLevel:'warn',build:{outDir:destination,emptyOutDir:true,copyPublicDir:false,write:true,lib:{entry:resolve(root,'public/explorer/game/game.mjs'),formats:['es']},rolldownOptions:{external:id=>id.startsWith('/campus/'),output:{entryFileNames:'game-[hash].mjs',chunkFileNames:'part-[hash].mjs'}},minify:true}});
const results=Array.isArray(result)?result:[result];
const entry=results.flatMap(item=>item.output||[]).find(item=>item.type==='chunk'&&item.isEntry);
if(!entry)throw new Error('Game build did not produce an entry module.');
const css=Buffer.from((await Promise.all(['game.css','play.css','district.css','hike.css'].map(name=>readFile(resolve(root,'public/explorer/game',name),'utf8')))).join('\n'));
const cssName='game-'+createHash('sha256').update(css).digest('hex').slice(0,12)+'.css';
await mkdir(destination,{recursive:true});await writeFile(resolve(destination,cssName),css);
let html=await readFile(resolve(root,'public/explorer/index.html'),'utf8');
html=html.replace(/\.\/game\/game\.mjs\?v=[^"']+/,'./runtime/'+entry.fileName).replace(/\.\/game\/game\.css\?v=[^"']+/,'./runtime/'+cssName);
html=html.replace(/\s*<link rel="stylesheet" href="\.\/game\/play\.css\?v=[^"']+">/,'');
html=html.replace(/\s*<link rel="stylesheet" href="\.\/game\/district\.css\?v=[^"']+">/,'');
html=html.replace(/\s*<link rel="stylesheet" href="\.\/game\/hike\.css\?v=[^"']+">/,'');
await writeFile(resolve(root,'dist/client/explorer/index.html'),html);
await copyFile(resolve(root,'public/explorer/CREDITS.md'),resolve(root,'dist/client/explorer/CREDITS.md'));
console.log('Explorer production entry: '+entry.fileName);
