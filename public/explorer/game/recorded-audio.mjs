import {VOICE_LINES} from './audio-content.mjs?v=20261102polish6';
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));

// Stream long tracks; decode only small effects. Every source stays same-origin.
// The browser never receives credentials and no external audio service is contacted.
export function createRecordedAudio(context,master,{onCaption=()=>{},onMusicReady=()=>{}}={}) {
  const buses={};for(const name of ['music','ambience','effects','voice']){buses[name]=context.createGain();buses[name].gain.value=0;buses[name].connect(master);}
  const controller=new AbortController(),cache=new Map(),pending=new Map(),streams=new Set(),sources=new Map(),timers=new Set();
  let manifest=null,loading=null,disposed=false,active=false,mood='sunset',current=null,ambient=null,motor=null,motorLevel=0,voice=null,voiceToken=0,loadedMusic=false,voiceUntil=0;
  const mix={music:.55,ambience:.5,effects:.7,voice:.85};
  const ramp=(gain,value,seconds=.2)=>{gain.cancelScheduledValues(context.currentTime);gain.setTargetAtTime(value,context.currentTime,seconds);};
  function updateMix(){for(const [name,bus] of Object.entries(buses))ramp(bus.gain,active?mix[name]*(name==='music'&&voice?.playing ? .4 : 1):0);}
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(!disposed)fn();},ms);timers.add(id);return id;};
  async function loadManifest(){
    if(loading)return loading;
    loading=fetch('/explorer/audio/manifest.json?v=20261102voice6',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Audio optional');return r.json();}).then(json=>{if(!disposed&&json.version===1)manifest=json;return manifest;}).catch(()=>null);
    return loading;
  }
  function asset(id){const a=manifest?.assets?.[id];return a&&/^\/explorer\/audio\/[a-z0-9-]+\.mp3$/.test(a.url)?a:null;}
  async function buffer(id){
    if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);
    const promise=(async()=>{await loadManifest();const a=asset(id);if(!a||disposed)return null;try{const response=await fetch(a.url,{signal:controller.signal});if(!response.ok)return null;const decoded=await context.decodeAudioData(await response.arrayBuffer());if(disposed)return null;cache.set(id,decoded);return decoded;}catch{return null;}})();
    pending.set(id,promise);try{return await promise;}finally{pending.delete(id);}
  }
  function stream(id,bus,{loop=true,ended,lowpass=false}={}){
    const a=asset(id);if(!a)return null;
    const element=new Audio();element.preload='none';element.loop=loop;element.src=a.url;element.hidden=true;element.dataset.explorerAudio=id;element.setAttribute('aria-hidden','true');document.body.append(element);
    const source=context.createMediaElementSource(element),gain=context.createGain();gain.gain.value=0;
    const filter=lowpass?context.createBiquadFilter():null;
    if(filter){filter.type='lowpass';filter.Q.value=.25;source.connect(filter);filter.connect(gain);}else source.connect(gain);
    gain.connect(buses[bus]);
    const item={id,element,source,gain,filter,playing:false};streams.add(item);
    element.addEventListener('ended',()=>{item.playing=false;ended?.();});
    element.addEventListener('error',()=>{item.playing=false;ended?.();},{once:true});
    return item;
  }
  async function play(item,level=1){if(!item||disposed||!active)return false;if(item.playPromise)return item.playPromise;if(item.playing&&!item.element.paused){ramp(item.gain.gain,level,.22);return true;}item.playPromise=(async()=>{try{await item.element.play();if(disposed||!active){item.element.pause();return false;}item.playing=true;ramp(item.gain.gain,level,.22);return true;}catch{return false;}finally{item.playPromise=null;}})();return item.playPromise;}
  function release(item){if(!item||!streams.has(item))return;item.element.pause();item.element.removeAttribute('src');item.element.load();item.element.remove();item.source.disconnect();item.filter?.disconnect();item.gain.disconnect();streams.delete(item);}
  let transition=0,soundtrackTask=null,loopRequested=false;
  function soundtrack(force=false){
    loopRequested=loopRequested||force;if(soundtrackTask)return soundtrackTask;
    soundtrackTask=(async()=>{await loadManifest();while(!disposed&&active){
      const token=transition,id='music-'+mood,loop=loopRequested;loopRequested=false;
      if(!loop&&current?.id===id){await play(current);break;}
      const next=stream(id,'music',{loop:false,ended:()=>{if(active&&current===next)void soundtrack(true);}});if(!next)break;
      next.element.addEventListener('timeupdate',()=>{if(active&&current===next&&next.element.duration-next.element.currentTime<1.6&&!next.crossfading){next.crossfading=true;void soundtrack(true);}});
      if(!await play(next)){release(next);break;}
      if(token!==transition||id!=='music-'+mood){release(next);continue;}
      const old=current;current=next;if(!loadedMusic){loadedMusic=true;onMusicReady();}
      if(old){ramp(old.gain.gain,0,.7);later(()=>release(old),2600);}
      if(!ambient){ambient=stream('ambience','ambience');await play(ambient,.55);}
      if(id==='music-'+mood&&!loopRequested)break;
    }})().finally(()=>{soundtrackTask=null;});return soundtrackTask;
  }
  function releaseEffect(source){const gain=sources.get(source);if(!gain)return;sources.delete(source);source.onended=null;source.disconnect();gain.disconnect();}
  function stopEffects(){for(const source of sources.keys()){try{source.stop();}catch{/* already stopped */}releaseEffect(source);}}
  async function effect(id,level=1,rate=1){
    if(!active||disposed||mix.effects===0)return;
    const beforePause=transition,data=await buffer(id);
    if(!data||!active||disposed||beforePause!==transition||mix.effects===0||sources.size>=12)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=data;source.playbackRate.value=rate;gain.gain.value=clamp(level);source.connect(gain);gain.connect(buses.effects);sources.set(source,gain);
    source.onended=()=>releaseEffect(source);source.start();
  }
  function stopVoice(){voiceToken++;voiceUntil=0;if(voice){release(voice);voice=null;}onCaption(null);updateMix();}
  async function speak(id,{force=false}={}){
    const line=VOICE_LINES[id];if(!line||disposed)return;
    if(!force&&performance.now()<voiceUntil)return;
    stopVoice();const token=voiceToken;voiceUntil=performance.now()+Math.max(3500,line.text.length*52);
    onCaption({speaker:line.speaker,text:line.text});
    const captionTimer=later(()=>{if(token===voiceToken)stopVoice();},Math.max(5000,line.text.length*75));
    await loadManifest();if(disposed||!active||token!==voiceToken||mix.voice===0)return;
    const item=stream('voice-'+id,'voice',{loop:false,ended:()=>{if(voice===item)stopVoice();}});voice=item;
    if(await play(item)){if(token===voiceToken)updateMix();else release(item);}
    else {if(voice===item)voice=null;release(item);}
    void captionTimer;
  }
  function stopMotor() {
    motorLevel=0;
    if(!motor)return;
    ramp(motor.gain.gain,0,.025);
    motor.element.pause();motor.playing=false;
  }
  function roll(speed,cutoff,braking=false){
    if(!active||disposed||mix.effects===0||speed<=.3){stopMotor();return;}
    motor??=stream('scooter','effects',{lowpass:true});
    if(!motor)return;
    motorLevel=Math.min(.32,speed*.038)*(braking?.62:1);
    ramp(motor.filter.frequency,cutoff,.10);
    ramp(motor.gain.gain,motorLevel,.11);
    motor.element.playbackRate=.72+Math.min(1,speed/10)*.51;
    if(motor.element.paused&&!motor.playPromise)void play(motor,motorLevel).then(playing=>{
      if(!playing||disposed)return;
      if(!motorLevel)stopMotor();else ramp(motor.gain.gain,motorLevel,.11);
    });
  }
  return {
    get hasMusic(){return loadedMusic;},
    async resume(){if(disposed)return;active=true;updateMix();await soundtrack();for(const item of [current,ambient])await play(item,item===ambient ? .55 : 1);},
    pause(){active=false;transition++;stopVoice();stopMotor();for(const item of streams){item.element.pause();item.playing=false;}stopEffects();updateMix();},
    setMood(value){if(['day','sunset','night'].includes(value)&&mood!==value){mood=value;if(active)void soundtrack();}},
    setMix(settings){for(const name of Object.keys(mix))if(Number.isFinite(settings[name+'Volume']))mix[name]=clamp(settings[name+'Volume']);if(mix.voice===0)stopVoice();updateMix();},
    effect,speak,stopVoice,roll,
    dispose(){if(disposed)return;disposed=true;controller.abort();for(const timer of timers)clearTimeout(timer);timers.clear();stopVoice();stopEffects();for(const item of [...streams])release(item);for(const bus of Object.values(buses))bus.disconnect();cache.clear();pending.clear();},
  };
}
