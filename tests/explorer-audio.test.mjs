import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MUSIC_TRACKS,SOUND_EFFECTS,VOICE_LINES} from '../public/explorer/game/audio-content.mjs';
import {createRecordedAudio} from '../public/explorer/game/recorded-audio.mjs';
import {createFoley} from '../public/explorer/game/foley.mjs';

test('the complete self-hosted soundtrack has intact content hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/explorer/audio/manifest.json',import.meta.url),'utf8'));
 const expected=[...MUSIC_TRACKS.map(t=>t.id),...SOUND_EFFECTS.map(t=>t.id),...Object.keys(VOICE_LINES).map(id=>'voice-'+id)];
 assert.equal(manifest.version,1);assert.equal(expected.length,25);
 for(const id of expected){const asset=manifest.assets[id];assert.ok(asset,id);assert.match(asset.url,/^\/explorer\/audio\/[a-z0-9-]+\.mp3$/);const bytes=await readFile(new URL('../public'+asset.url,import.meta.url));assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);if(asset.kind==='voice')assert.equal(asset.caption,VOICE_LINES[id.slice(6)].text);}
 assert.doesNotMatch(JSON.stringify(manifest),/sk_[a-f0-9]{40,}/i);
});

function audioHarness(){
 const original=new Map(['Audio','document','fetch','setTimeout','clearTimeout'].map(k=>[k,globalThis[k]])),elements=[],sources=[],gains=[],filters=[],timers=new Map(),requests=[];let id=0;
 class Param{value=0;cancelScheduledValues(){}setTargetAtTime(v){this.value=v;}setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
 class Node{gain=new Param();frequency=new Param();Q=new Param();pan=new Param();playbackRate={value:1};connect(next){this.destination=next;}disconnect(){this.disconnected=true;}start(at){this.started=at;}stop(){this.onended?.();}}
 class Media{listeners={};paused=true;duration=75;currentTime=0;dataset={};addEventListener(name,fn){this.listeners[name]=fn;}setAttribute(){}async play(){this.paused=false;}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}remove(){this.removed=true;}}
 const context={currentTime:1,createGain(){const n=new Node();gains.push(n);return n;},createBiquadFilter(){const n=new Node();filters.push(n);return n;},createStereoPanner(){return new Node();},createMediaElementSource(){return new Node();},createOscillator(){return this.createBufferSource();},createBufferSource(){const n=new Node();sources.push(n);return n;},decodeAudioData:async()=>({duration:.6})};
 globalThis.Audio=Media;globalThis.document={body:{append(e){elements.push(e);}}};globalThis.setTimeout=fn=>{timers.set(++id,fn);return id;};globalThis.clearTimeout=id=>timers.delete(id);
 const assets=Object.fromEntries(['music-day','music-sunset','music-night','ambience','scooter','step','voice-intro','voice-cat-start'].map(id=>[id,{url:'/explorer/audio/'+id+'-123.mp3'}]));
 globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>({version:1,assets}),arrayBuffer:async()=>new ArrayBuffer(2)};};
 return {context,master:new Node(),elements,sources,gains,filters,timers,requests,restore(){for(const [k,v]of original){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};
}

test('recorded audio streams only after activation, ducks narration, pauses, and fully releases its resources',async()=>{
 const fake=audioHarness(),captions=[];let ready=0;
 const audio=createRecordedAudio(fake.context,fake.master,{onCaption:c=>captions.push(c),onMusicReady:()=>ready++});
 try{
  assert.deepEqual(fake.requests,[],'no soundtrack transfer before a deliberate gesture');
  await audio.resume();assert.equal(ready,1);assert.equal(audio.hasMusic,true);assert.equal(fake.elements.filter(e=>!e.removed).length,2);
  await audio.speak('intro',{force:true});assert.equal(captions.at(-1).text,VOICE_LINES.intro.text);assert.equal(fake.gains[0].gain.value,.55*.4,'music ducks below narration');
  audio.setMix({voiceVolume:0});assert.equal(fake.gains[3].gain.value,0);assert.equal(captions.at(-1),null);
  audio.pause();assert.ok(fake.elements.every(e=>e.paused));assert.ok(fake.gains.slice(0,4).every(g=>g.gain.value===0));
  await audio.resume();audio.setMood('night');for(let i=0;i<8;i++)await Promise.resolve();
  assert.ok(fake.elements.filter(e=>!e.removed).length<=3,'at most old/new music plus ambience during a crossfade');
  audio.dispose();assert.ok(fake.elements.every(e=>e.removed));assert.equal(fake.timers.size,0);assert.ok(fake.gains.every(g=>g.disconnected));
  const before=fake.requests.length;await audio.resume();assert.equal(fake.requests.length,before);
 }finally{audio.dispose();fake.restore();}
});

test('optional audio failures cannot block play and rapid exit during a pending download is safe',async()=>{
 const fake=audioHarness();let resolveManifest;
 globalThis.fetch=()=>new Promise(resolve=>resolveManifest=resolve);
 const audio=createRecordedAudio(fake.context,fake.master);
 try{const resume=audio.resume();audio.dispose();resolveManifest({ok:true,json:async()=>({version:1,assets:{}})});await resume;assert.equal(fake.elements.length,0);assert.equal(audio.hasMusic,false);}finally{audio.dispose();fake.restore();}
});

test('repeated player gestures share one buffering music stream and skipped speech does not suppress the next line',async()=>{
 const fake=audioHarness(),captions=[];let finishPlay;
 const nativePlay=globalThis.Audio.prototype.play;
 globalThis.Audio.prototype.play=function(){if(this.src.includes('music-'))return new Promise(resolve=>finishPlay=()=>{this.paused=false;resolve();});return nativePlay.call(this);};
 const audio=createRecordedAudio(fake.context,fake.master,{onCaption:c=>captions.push(c)});
 try{
  const plays=[audio.resume()];for(let i=0;i<8;i++)await Promise.resolve();
  for(let i=0;i<25;i++)plays.push(audio.resume());
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(fake.elements.length,1,'one pending music element despite 26 gestures');assert.equal(typeof finishPlay,'function');
  finishPlay();await Promise.all(plays);assert.equal(fake.elements.length,2,'music and one ambient stream');
  await audio.speak('intro',{force:true});audio.stopVoice();await audio.speak('cat-start');assert.equal(captions.at(-1).text,VOICE_LINES['cat-start'].text);
 }finally{audio.dispose();fake.restore();}
});

test('footsteps require actual grounded travel, distinguish surfaces, and reset on pause',()=>{
 const fake=audioHarness(),samples=[];
 const foley=createFoley({context:fake.context,noise:{},effects:fake.master,ambience:fake.master,register(){},stepSample:(...args)=>samples.push(args),roll(){}});
 try{
  const walk={grounded:true,speed:2.6,surface:()=>3};
  foley.update(.1,walk);
  foley.update(.1,{...walk,distance:.9,grounded:false});
  foley.update(.1,{...walk,distance:.4});
  assert.equal(fake.sources.length,0);
  foley.reset();
  foley.update(.1,{...walk,distance:.5});
  assert.equal(fake.sources.length,0);
  foley.update(.1,{...walk,distance:.4});
  assert.equal(fake.sources.length,1);
  assert.equal(samples.length,1,'the paved step mixes in the existing sample');
  foley.update(.1,{...walk,distance:.85,surface:()=>'trail'});
  assert.equal(fake.sources.length,3,'gravel adds a second crunch without playing the paving sample');
  assert.ok(fake.filters[1].frequency.value>fake.filters[0].frequency.value);
  assert.equal(samples.length,1);
  foley.play('trip',5,.6);
  foley.play('brake',2,.6);
  foley.play('land','trail',.6);
  assert.equal(fake.sources.length,7);
 }finally{fake.restore();}
});

test('wheel and local chatter respect their independent buses and gameplay state',()=>{
 const fake=audioHarness(),rolls=[],ambience={};
 const foley=createFoley({context:fake.context,noise:{},effects:fake.master,ambience,register(){},stepSample(){},roll:(...args)=>rolls.push(args)});
 try{
  const riding={riding:true,grounded:true,speed:6,surface:()=>2};
  const talking={characters:[{gesture:'talk',x:2,z:0}]};
  foley.update(.1,{...riding,...talking,ambienceOn:false});
  assert.deepEqual(rolls.at(-1),[6,3200,false]);
  assert.equal(fake.sources.length,0);
  foley.update(.1,{...riding,...talking,effectsOn:false});
  assert.deepEqual(rolls.at(-1),[0]);
  assert.equal(fake.sources.length,3);
  assert.ok(fake.sources.every(source=>source.destination.destination.destination.destination===ambience));
  foley.update(.1,talking);
  assert.equal(fake.sources.length,3,'chatter is throttled');
  foley.update(.1,{...riding,...talking,enabled:false});
  assert.equal(fake.sources.length,3,'gameplay overlays suppress contextual sounds');
 }finally{fake.restore();}
});

test('a scooter sound that finishes buffering after dismount cannot restart the motor',async()=>{
 const fake=audioHarness();let finishPlay;
 const play=globalThis.Audio.prototype.play;
 globalThis.Audio.prototype.play=function(){if(this.src.includes('scooter'))return new Promise(resolve=>finishPlay=()=>{this.paused=false;resolve();});return play.call(this);};
 const audio=createRecordedAudio(fake.context,fake.master);
 try{
  await audio.resume();
  audio.roll(7,3200);
  const motor=fake.elements.find(item=>item.dataset.explorerAudio==='scooter');
  assert.equal(fake.filters.at(-1).frequency.value,3200);
  assert.ok(motor.playbackRate>1);
  audio.roll(0);
  finishPlay();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(motor.paused,true);
  audio.dispose();
  assert.equal(fake.filters.at(-1).disconnected,true);
 }finally{audio.dispose();fake.restore();}
});

test('pausing drops an unfinished footstep request and releases a playing sample',async()=>{
 const fake=audioHarness();let finishDecode,signalDecode;
 const decoding=new Promise(resolve=>signalDecode=resolve);
 fake.context.decodeAudioData=()=>new Promise(resolve=>{finishDecode=resolve;signalDecode();});
 const audio=createRecordedAudio(fake.context,fake.master);
 try{
  await audio.resume();
  const stale=audio.effect('step');
  await decoding;
  audio.pause();await audio.resume();
  finishDecode({duration:.6});
  await stale;
  assert.equal(fake.sources.length,0);
  await audio.effect('step');
  const active=fake.sources.at(-1);
  audio.pause();
  assert.equal(active.disconnected,true);
  assert.equal(active.destination.disconnected,true);
 }finally{audio.dispose();fake.restore();}
});
