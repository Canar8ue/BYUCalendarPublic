import * as THREE from '/campus/vendor/three.module.js';
import {createWorld} from './world.mjs?v=20261102polish6';
import {createPlayer,createScooter,createCat,createCosmo,createCar,createMarker,createBench} from './actors.mjs?v=20261102polish6';
import {createAudio} from './audio.mjs?v=20261102polish6';
import {createUI} from './ui.mjs?v=20261102polish6';
import {createScenery} from './scenery.mjs?v=20261102polish6';
import {createNavigation} from './navigation.mjs?v=20261102polish6';
import {createCampusLifeRuntime} from './campus-life.mjs?v=20261102polish6';
import {createCampusNetworkRuntime} from './campus-network.mjs?v=20261102polish6';
import {CAMPUS_ACTIVITIES} from './campus-content.mjs?v=20261102polish6';
import {clipDistrictMotion} from './district-collision.mjs?v=20261102polish6';
import {ACTIVITIES} from './district-content.mjs?v=20261102polish6';
import {createHikeRuntime} from './hike-runtime.mjs?v=20261102polish6';
import {questTarget,questStatus} from './quest-state.mjs?v=20261102polish6';
import {movementDirection,normalizeMoveInput,lookDirection,zoomDistance} from './controls.mjs?v=20261102polish6';
import {detectImpact,startStumble,advanceStumble,approachSpeed} from './locomotion.mjs?v=20261102polish6';
import {medalFor,stepBoost,crossedCheckpoint,createGhostRecorder,recordGhost,ghostAt} from './racing.mjs?v=20261102polish6';
import {VOICE_LINES} from './audio-content.mjs?v=20261102polish6';
import {UNIT,SPAWN,LOCATIONS,CAT_TRAIL,COSMO_SPOTS,SECRETS,TRIALS,QUESTS,LOST_ITEMS,TUNE_NOTES,PHOTO_SPOTS,MAIN_CHAPTERS,FRAGMENTS,OUTFITS,DECKS,SECRET_STORIES} from './content.mjs?v=20261102polish6';
import {loadProgress,saveProgress,claimReward,discover,advanceCat,findCosmo,completeQuest,getSummary,validateProgress,createProgress,recoverFragment,finishAdventure,equipCosmetic,getAchievements,recordTrial} from './progress.mjs?v=20261102polish6';
const CHANNEL='byu-campus-explorer';
const send=(type,extra={})=>{if(parent!==window)parent.postMessage({channel:CHANNEL,type,...extra},location.origin);};
let progress=loadProgress();
let renderer,world,player,scooter,cat,cosmo,car,camera,scene,waypoint,deliveryNPC,bench,scenery,navigation,campusLife,hike;
let paused=false,ready=false,disposed=false,last=0,accumulator=0,frame=0,speed=0,grounded=true,vy=0,yaw=0,pitch=.30;
let riding=false,selectedQuest=progress.trackedQuest||'main',cinematic=null,trial=null,trialClock=0,storageWarned=false,lastCheckpoint=0,elapsed=0,nearby=null,lastPersist=0,lastLevel=0;
const coastDirection=new THREE.Vector3(0,0,1),keys=new Set(),pressed=new Set(),visits=new Map(),markers=[],props=[],listeners=[];
const motion=new THREE.Vector3(),follow=new THREE.Vector3(),desiredCamera=new THREE.Vector3();
const ui=createUI({onAction:action}),audio=createAudio({onCaption:caption=>ui.setCaption?.(progress.settings.captions?caption:null)});
let boost=1,boosting=false,ghostPlayer,ghostScooter,raceResult=null;
let stumble=null,impactCooldown=0,jumpBuffer=0,coyote=0,landing=0,running=false,braking=false,steering=0;
let frameGroundTravel=0;
function playerSurface(){const p=player.group.position;return world.groundSurface(p.x,p.z,p.y);}
let cameraLocked=false,ignoreLockRelease=false,dragPointer=null,px=0,py=0;
let photoPose='idle',photoMode=false,danceUntil=0,seenAchievements=new Set(getAchievements(progress).filter(a=>a.complete).map(a=>a.id)),achievementTimer=0;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion=()=>motionPreference.matches||progress.settings.reducedMotion;
const applyMotionPreference=()=>document.documentElement.classList.toggle('reduced-motion',reducedMotion());
const listen=(element,name,handler,options)=>{element.addEventListener(name,handler,options);listeners.push(()=>element.removeEventListener(name,handler,options));};
function persist(){if(progress.quests.includes(selectedQuest))selectedQuest=progress.quests.includes('main')?'free':'main';progress.trackedQuest=selectedQuest;const ok=saveProgress(progress);if(!ok&&!storageWarned){ui.toast('Progress could not save','Export a save from Settings.');storageWarned=true;}send('progress',{...getSummary(progress)});for(const a of getAchievements(progress))if(a.complete&&!seenAchievements.has(a.id)){seenAchievements.add(a.id);clearTimeout(achievementTimer);achievementTimer=setTimeout(()=>{if(!disposed){ui.celebrate?.(a.title);audio.chime('quest');}},1600);}}
function toast(title,subtitle=''){ui.toast(title,subtitle);}
function setPause(value,external=false){if(!value&&hike?.loading)return;paused=value;if(value)campusLife?.suspend();keys.clear();pressed.clear();jumpBuffer=0;dragPointer=null;ui.setPaused(value,panelData(),{external:external||campusLife?.isOpen||hike?.isOpen});if(value){audio.pause();document.exitPointerLock?.();}else{last=0;audio.resume();document.getElementById('world')?.focus({preventScroll:true});}}
function panelData(){return {locations:LOCATIONS,quests:QUESTS,activities:ACTIVITIES,campusActivities:CAMPUS_ACTIVITIES,progress,selectedQuest,characters:campusLife?.getCharacters()||[],mapActivities:campusLife?.getMapActivities?.()||[],activeTrial:trial?.definition.name,secrets:SECRETS,secretStories:SECRET_STORIES,achievements:getAchievements(progress),outfits:OUTFITS,decks:DECKS,level:getSummary(progress).level,secretCount:SECRETS.length,chapters:MAIN_CHAPTERS,trials:TRIALS,tuneNotes:TUNE_NOTES,raceResult};}
function openPanel(name){if(hike?.active&&['map','quests'].includes(name)){hike.open();return;}if(campusLife?.isOpen)campusLife.close();hike?.close();setPause(true);ui.openPanel(name,panelData());if(name==='music'){audio.resume();audio.start();}}
function resetAt(point){campusLife?.suspend();if(!point&&hike?.active){hike.recover();return;}let p=point||progress.checkpoint||SPAWN;let ground=world.supportHeight(p.x,p.z);if(!Number.isFinite(ground)){p=SPAWN;ground=world.supportHeight(p.x,p.z)??1;}player.group.position.set(p.x,ground,p.z);player.group.rotation.x=0;player.group.rotation.z=0;vy=0;grounded=true;riding=false;speed=0;stumble=null;impactCooldown=.8;jumpBuffer=0;coyote=0;landing=0;running=braking=false;steering=0;accumulator=0;follow.copy(player.group.position).add(new THREE.Vector3(0,1.25*UNIT,0));camera.position.copy(follow).add(new THREE.Vector3(0,2*UNIT,-5*UNIT));keys.clear();pressed.clear();}
function applyQuality(){const low=progress.settings.quality==='low'||(progress.settings.quality==='auto'&&matchMedia('(pointer: coarse)').matches);renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.5));renderer.setSize(innerWidth,innerHeight,false);world?.setQuality?.(low?'low':'high');}
function applySettings(){audio.setEnabled(progress.settings.music);audio.setVolume(progress.settings.volume);audio.setMix(progress.settings);audio.setMood(progress.settings.time||'sunset');world.setTime(progress.settings.time||'sunset');world.setCycle?.(progress.settings.cycle);applyMotionPreference();applyQuality();lastLevel=0;ui.setCaption?.(null);}
async function action(name,payload){
 if(name==='exit'){if(!disposed)dispose();if(parent===window)location.assign(new URL('/',location.origin));else send('exit');return;}
 if(disposed)return;
 if(!ready){if(name==='restart')location.reload();return;}
 if(name==='pause'){setPause(true);return;}
 if(name==='resume'){ui.closePanel(false);setPause(false);return;}
 if(name==='hike'){if(cinematic)finishCinematic();trial=null;ui.endPhoto();photoMode=false;speed=0;boosting=false;campusLife?.close();ui.closePanel(false);hike?.open();return;}
 if(name==='campusLife'){if(hike?.active||hike?.loading)hike.leave({notify:false});campusLife?.openJournal();return;}
 if(['map','passport','quests','settings','photo','help','music','collection','wardrobe','welcome','finale','races','raceResult'].includes(name)){openPanel(name==='passport'?'map':name);return;}
 if(name==='beginAdventure'||name==='freeRoam'){
  selectedQuest=name==='freeRoam'?'free':progress.quests.includes('main')?'free':'main';
  trial=null;boosting=false;speed=0;const first=!progress.introSeen;progress.introSeen=true;persist();ui.closePanel(false);setPause(false);await audio.start();
  if(first&&!disposed)ui.teachControls();
  return;
 }
 if(name==='replayIntro'){if(hike?.active||hike?.loading)hike.leave({notify:false});ui.closePanel(false);setPause(false);await audio.start();if(!disposed)storyScene('intro','Opening scene',{point:SPAWN,duration:8});return;}
 if(name==='photoMode'){photoMode=!!payload;if(!photoMode)photoPose='idle';return;}
 if(name==='pose'){photoPose=['idle','wave','dance'].includes(payload)?payload:'idle';return;}
 if(name==='cosmetic'){const [kind,id]=String(payload).split(':');if(equipCosmetic(progress,kind,id)){lastLevel=0;persist();ui.openPanel('wardrobe',panelData());}return;}
 if(['musicVolume','ambienceVolume','effectsVolume','voiceVolume'].includes(name)){progress.settings[name]=Math.max(0,Math.min(1,Number(payload)||0));audio.setMix(progress.settings);persist();return;}
 if(['sensitivity','cameraDistance'].includes(name)){progress.settings[name]=Math.max(.5,Math.min(2,Number(payload)||1));persist();return;}
 if(['cycle','invertY','captions','routeHints','showGhost'].includes(name)){progress.settings[name]=!!payload;if(name==='cycle')world.setCycle?.(!!payload);if(name==='captions'&&!payload)ui.setCaption?.(null);persist();return;}
 if(name==='photoFrame'){if(['postcard','clean','cinema'].includes(payload))progress.settings.photoFrame=payload;persist();return;}
 if(name==='horn'){audio.chime('horn');return;}
 if(name==='cancelTrial'){trial=null;boosting=false;speed=0;ui.closePanel(false);setPause(false);toast('Race ended');return;}
 if(name==='playNote'){audio.resume();await audio.start();if(!disposed)audio.playNote?.(Number(payload));return;}
 if(name==='musicSolved'){if(progress.notes.length===TUNE_NOTES.length){completeQuest(progress,'music');toast('Campus in Tune complete','+60 XP');audio.chime('quest');audio.speak('music',{force:true});persist();}return;}
 if(name==='skip'){finishCinematic();return;}
 if(name==='mute'){progress.settings.music=!progress.settings.music;audio.setEnabled(progress.settings.music);if(progress.settings.music)await audio.start();persist();return;}
 if(name==='volume'){progress.settings.volume=Math.max(0,Math.min(1,Number(payload)));audio.setVolume(progress.settings.volume);persist();return;}
 if(name==='reducedMotion'){progress.settings.reducedMotion=Boolean(payload);applyMotionPreference();persist();return;}
 if(name==='quality'){progress.settings.quality=['auto','low','high'].includes(payload)?payload:'auto';applyQuality();persist();return;}
 if(name==='time'){if(!['day','sunset','night'].includes(payload))return;world.setTime(payload);audio.setMood(payload);progress.settings.time=payload;progress.settings.cycle=false;world.setCycle?.(false);persist();return;}
 if(name==='respawn'){trial=null;ui.closePanel(false);resetAt();setPause(false);toast('Returned to checkpoint');return;}
 if(name==='selectQuest'){if(!QUESTS.some(q=>q.id===payload)&&!ACTIVITIES.some(a=>'activity:'+a.id===payload)&&!CAMPUS_ACTIVITIES.some(a=>'campus:'+a.id===payload))return;trial=null;boosting=false;selectedQuest=payload;persist();ui.closePanel(false);setPause(false);return;}
 if(name==='travel'){if(hike?.active||hike?.loading)hike.leave({notify:false});const place=LOCATIONS.find(p=>p.id===payload);if(!place||!progress.visited.includes(place.id))return;trial=null;ui.closePanel(false);resetAt(place);setPause(false);toast(place.name);return;}
 if(name==='capture'){capturePhoto();return;}
 if(name==='export'){download(new Blob([JSON.stringify(progress,null,2)],{type:'application/json'}),'lost-on-campus-save.json');toast('Save exported');return;}
 if(name==='import'){try{if(typeof payload!=='string'||payload.length>100000)throw Error();const raw=JSON.parse(payload);if(![0,1,2].includes(raw.version))throw Error();hike?.reset();trial=null;selectedQuest='main';visits.clear();progress=validateProgress(raw);campusLife?.reset();selectedQuest=progress.trackedQuest;seenAchievements=new Set(getAchievements(progress).filter(a=>a.complete).map(a=>a.id));persist();resetAt();applySettings();ui.closePanel(false);setPause(false);toast('Save imported');}catch{toast('Could not read this save','Choose a valid Lost on Campus progress file.');}return;}
 if(name==='reset'){hike?.reset();trial=null;selectedQuest='main';visits.clear();progress=createProgress();campusLife?.reset();seenAchievements.clear();persist();resetAt(SPAWN);applySettings();ui.closePanel(false);openPanel('welcome');return;}
 if(name==='restart'||name==='trial'){const next=TRIALS.find(t=>t.id===payload)||trial?.definition;if(next)startTrial(next);return;}
 if(name==='interact')pressed.add('KeyE');if(name==='mount')pressed.add('KeyQ');if(name==='jump')pressed.add('Space');
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function capturePhoto(){
 const wasPhoto=photoMode,save=progress,onTrail=hike?.active;
 try{
  photoMode=true;
  updateActors(0,{instant:true});
  navigation?.update(elapsed,player.group.position,null);
  renderer.render(scene,camera);
  const output=document.createElement('canvas');
  const border=progress.settings.photoFrame==='postcard'?Math.round(renderer.domElement.width*.035):0;
  output.width=renderer.domElement.width+border*2;
  output.height=renderer.domElement.height+border*2+Math.round(border*1.7);
  const ctx=output.getContext('2d');
  ctx.fillStyle='#faf4e5';
  ctx.fillRect(0,0,output.width,output.height);
  ctx.drawImage(renderer.domElement,border,border);
  if(border){
   ctx.fillStyle='#31584d';
   ctx.font='bold '+Math.round(border*.64)+'px Georgia';
   ctx.fillText(onTrail?'Y Trail':'BYU Campus',border,output.height-border*.83);
  }
  if(progress.settings.photoFrame==='cinema'){
   ctx.fillStyle='#142925';
   const bar=Math.round(output.height*.08);
   ctx.fillRect(0,0,output.width,bar);
   ctx.fillRect(0,output.height-bar,output.width,bar);
  }
  const commitDistrictPhoto=onTrail?null:campusLife?.preparePhoto(camera);
  const commitHikePhoto=onTrail?hike.preparePhoto(camera):null;
  const commitPhoto=onTrail?null:preparePhotoStamp();
  output.toBlob(blob=>{
   if(disposed||save!==progress||onTrail!==hike?.active)return;
   if(!blob){toast('Photo unavailable');return;}
   audio.chime('shutter');
   commitDistrictPhoto?.();
   commitHikePhoto?.();
   commitPhoto?.();
   ui.showPhotograph(blob);
  },'image/png');
 }catch{toast('Photo unavailable');}
 finally{photoMode=wasPhoto;}
}
function preparePhotoStamp(){
 const p=player.group.position,spot=PHOTO_SPOTS.find(s=>Math.hypot(s.x-p.x,s.z-p.z)<5*UNIT&&!progress.photos.includes(s.id));if(!spot)return;
 const place=LOCATIONS.find(l=>l.id===spot.target),feature=world.features?.filter(f=>f.code===place?.code).sort((a,b)=>(b.bounds.max[0]-b.bounds.min[0])*(b.bounds.max[2]-b.bounds.min[2])-(a.bounds.max[0]-a.bounds.min[0])*(a.bounds.max[2]-a.bounds.min[2]))[0];
 const target=feature?.position||[place.x,1,place.z],dir=camera.getWorldDirection(new THREE.Vector3());dir.y=0;dir.normalize();const toward=new THREE.Vector3(target[0]-camera.position.x,0,target[2]-camera.position.z).normalize();
 if(dir.dot(toward)<.4)return ()=>toast('Frame '+place.name+' for the quest stamp');
 return ()=>{
  if(progress.photos.includes(spot.id))return;
  progress.photos.push(spot.id);
  if(progress.photos.length===PHOTO_SPOTS.length){completeQuest(progress,'photo');toast('Golden Hour Club complete','+60 XP');audio.chime('quest');}
  else{toast('Photo stamp earned',spot.name);audio.chime('discover');}
  persist();
 };
}
function startScene({title,text,duration=5,from,to,done,lookAt}){cinematic={title,text,duration,time:0,from:from?.clone()||camera.position.clone(),to:to?.clone()||camera.position.clone(),done,lookAt};keys.clear();pressed.clear();document.exitPointerLock?.();ui.setCinematic?.({active:true,title,text});}
function storyScene(voice,title,{point=SPAWN,duration,done}={}){const ground=world.groundHeight(point.x,point.z)??1,focus=new THREE.Vector3(point.x,ground+1.2*UNIT,point.z);startScene({title,text:VOICE_LINES[voice]?.text||'',duration:duration||Math.max(9,(VOICE_LINES[voice]?.text.length||0)*.065),from:camera.position.clone(),to:world.cameraPosition(focus,focus.clone().add(new THREE.Vector3(-4*UNIT,3*UNIT,-6*UNIT))),lookAt:focus,done});audio.speak(voice,{force:true});}
function finishCinematic(){if(!cinematic)return;const done=cinematic.done;cinematic=null;audio.stopVoice();ui.setCinematic?.({active:false});done?.();keys.clear();pressed.clear();}
function addMarker(point,color,kind){const m=createMarker(scene,{color,kind});m.group.position.set(point.x,(world.groundHeight(point.x,point.z)??1)+.002,point.z);m.point=point;markers.push(m);return m;}
function makeItem(point,color,shape='book'){const geo=shape==='note'?new THREE.TorusGeometry(.20*UNIT,.06*UNIT,6,14):new THREE.BoxGeometry(.35*UNIT,.48*UNIT,.12*UNIT),mat=new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.1,emissive:color,emissiveIntensity:.1}),mesh=new THREE.Mesh(geo,mat);mesh.position.set(point.x,(world.groundHeight(point.x,point.z)??1)+.5*UNIT,point.z);scene.add(mesh);const data={mesh,point,geo,mat};props.push(data);return data;}
function setupProps(){
 waypoint=new THREE.Group();const beam=new THREE.Mesh(new THREE.CylinderGeometry(.45*UNIT,.45*UNIT,18*UNIT,8,1,true),new THREE.MeshBasicMaterial({color:0xeac26d,transparent:true,opacity:.13,depthWrite:false}));beam.position.y=9*UNIT;waypoint.add(beam);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.4*UNIT,.07*UNIT,6,24),new THREE.MeshBasicMaterial({color:0xffdb8a}));ring.rotation.x=-Math.PI/2;ring.position.y=.1*UNIT;waypoint.add(ring);
 const gate=new THREE.Mesh(new THREE.TorusGeometry(2.1*UNIT,.09*UNIT,8,48),new THREE.MeshBasicMaterial({color:0xffd16d}));gate.name='Race gate';gate.position.y=2.1*UNIT;gate.visible=false;waypoint.add(gate);scene.add(waypoint);
 deliveryNPC=createPlayer(scene);deliveryNPC.group.position.set(SPAWN.x-.15,world.groundHeight(SPAWN.x-.15,SPAWN.z+.12)??1,SPAWN.z+.12);deliveryNPC.setStyle?.({level:2});deliveryNPC.group.rotation.y=.8;
 bench=createBench(scene);bench.group.position.set(SPAWN.x-.25,world.groundHeight(SPAWN.x-.25,SPAWN.z-.2)??1,SPAWN.z-.2);
 car=createCar(scene);car.group.position.set(CAT_TRAIL[0].x+.11,world.groundHeight(CAT_TRAIL[0].x+.11,CAT_TRAIL[0].z)??1,CAT_TRAIL[0].z);car.group.rotation.y=.6;
 scenery=createScenery(scene,world);
 for(const fragment of FRAGMENTS){const item=makeItem(fragment,0xffe2a3,'page');item.fragment=fragment.id;}
 for(const point of CAT_TRAIL)addMarker(point,0xe8ac63,'paw');for(const point of COSMO_SPOTS)addMarker(point,0x7c9ddd,'star');for(const point of SECRETS)makeItem(point,0xf6c76a);for(const point of LOST_ITEMS)makeItem(point,0x739be0);for(const point of TUNE_NOTES)makeItem(point,0xb899dc,'note');for(const point of PHOTO_SPOTS)addMarker(point,0x98c8ae,'photo');for(const t of TRIALS)addMarker(t.points[0],0x87b5ec,'race');
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#98603b';ctx.beginPath();ctx.ellipse(64,84,28,23,0,0,Math.PI*2);ctx.fill();for(const [x,y,angle] of [[25,48,-.4],[49,30,-.1],[79,30,.1],[104,48,.4]]){ctx.beginPath();ctx.ellipse(x,y,11,15,angle,0,Math.PI*2);ctx.fill();}const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 for(let i=0;i<CAT_TRAIL.length-1;i++){const a=CAT_TRAIL[i],b=CAT_TRAIL[i+1],dist=Math.hypot(a.x-b.x,a.z-b.z),count=Math.max(2,Math.min(45,Math.ceil(dist/(1.5*UNIT)))),geo=new THREE.PlaneGeometry(.38*UNIT,.38*UNIT),mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.92,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),mesh=new THREE.InstancedMesh(geo,mat,count),angle=Math.atan2(b.x-a.x,b.z-a.z),object=new THREE.Object3D();for(let n=0;n<count;n++){const t=(n+.5)/count,x=THREE.MathUtils.lerp(a.x,b.x,t)+Math.cos(angle)*(n%2?.12:-.12)*UNIT,z=THREE.MathUtils.lerp(a.z,b.z,t)-Math.sin(angle)*(n%2?.12:-.12)*UNIT;object.position.set(x,(world.groundHeight(x,z)??1)+.002,z);object.rotation.set(-Math.PI/2,0,-angle);object.updateMatrix();mesh.setMatrixAt(n,object.matrix);}scene.add(mesh);props.push({mesh,geo,mat,texture,trail:i});}
}
function getTarget(){
 const p=player.group.position,candidates=[];if(trial||stumble)return null;
 const add=(kind,point,label,r=2.6*UNIT)=>{if(Math.hypot(p.x-point.x,p.z-point.z)>=r)return;const eye=p.clone().add(new THREE.Vector3(0,1.2*UNIT,0)),target=new THREE.Vector3(point.x,(world.groundHeight(point.x,point.z)??p.y)+1.2*UNIT,point.z);if(world.cameraPosition(eye,target).distanceTo(target)>.035)return;candidates.push({kind,point,label,distance:Math.hypot(p.x-point.x,p.z-point.z)});};
 if(hike?.active){for(const point of hike.targets())add('hike',point,point.label,3.1*UNIT);candidates.sort((a,b)=>a.distance-b.distance);return candidates[0]||null;}
 for(const point of campusLife?.targets()||[])add('district',point,point.label,3.5*UNIT);
 add('hikeDeparture',SPAWN,'Plan a hike to the Y',4*UNIT);
 const chapter=MAIN_CHAPTERS.find(c=>!progress.fragments.includes(c.id));
 if(chapter&&chapter.locations.every(id=>progress.visited.includes(id)))add('fragment',FRAGMENTS.find(f=>f.id===chapter.id),'Recover lost-page fragment '+(progress.fragments.length+1),4*UNIT);
 if(progress.fragments.length===4&&!progress.quests.includes('main'))add('finale',SPAWN,'Reassemble the lost page',5*UNIT);
 if(progress.catStep>=CAT_TRAIL.length)add('pet',CAT_TRAIL.at(-1),'Pet your campus friend',3*UNIT);
 if(progress.catStep<CAT_TRAIL.length)add('cat',CAT_TRAIL[progress.catStep],progress.catStep===0?'Meet the campus cat':progress.catStep===CAT_TRAIL.length-1?'Pet the cat':'Inspect the paw prints',3.8*UNIT);
 if(progress.cosmoStep<COSMO_SPOTS.length)add('cosmo',COSMO_SPOTS[progress.cosmoStep],'Say hello to Cosmo',4*UNIT);
 for(const point of SECRETS)if(!progress.secrets.includes(point.id))add('secret',point,'Collect hidden postcard',2.2*UNIT);
 for(const point of LOST_ITEMS)if(!progress.items.includes(point.id))add('item',point,'Pick up '+(point.name||'lost belonging'));
 for(const point of TUNE_NOTES)if(!progress.notes.includes(point.id))add('note',point,'Collect musical symbol');
 for(const point of PHOTO_SPOTS)if(!progress.photos.includes(point.id))add('photoSpot',point,'Frame this campus view',4*UNIT);
 const delivery=LOCATIONS.find(l=>l.code==='EB')||LOCATIONS[8];
 if(!progress.quests.includes('delivery')){if(!progress.deliveryStarted)add('deliveryStart',{x:SPAWN.x-.15,z:SPAWN.z+.12},'Help a student get to class',3*UNIT);else add('deliveryEnd',delivery,'Finish the campus delivery',4*UNIT);}
 if(progress.items.length===LOST_ITEMS.length&&!progress.quests.includes('lost-found'))add('returnItems',{x:SPAWN.x-.15,z:SPAWN.z+.12},'Return the lost belongings',3*UNIT);
 if(progress.notes.length===TUNE_NOTES.length&&!progress.quests.includes('music'))add('musicPuzzle',TUNE_NOTES.at(-1),'Play the campus melody',4*UNIT);
 if(!trial)for(const t of TRIALS)add('trial',{...t.points[0],definition:t},'Start '+t.name,4*UNIT);
 const priority=c=>['fragment','finale','musicPuzzle','returnItems'].includes(c.kind)?3:c.kind==='district'?(c.point.npcId?1:2):0;
 candidates.sort((a,b)=>priority(b)-priority(a)||a.distance-b.distance);return candidates[0]||null;
}
function interact(){if(trial||stumble)return;
 if(cinematic){finishCinematic();return;}const t=getTarget();if(!t)return;
 if(riding&&['cat','cosmo','item','note'].includes(t.kind)){toast('Dismount to interact');return;}
 switch(t.kind){
  case 'hikeDeparture':action('hike');break;
  case 'hike':speed=0;boosting=false;hike.interact(t.point);break;
  case 'district':speed=0;boosting=false;campusLife.interact(t.point);break;
  case 'fragment':if(recoverFragment(progress,t.point.id)){audio.chime('fragment');persist();storyScene('fragment-'+t.point.id,'Fragment '+progress.fragments.length+' of 4: '+t.point.title,{point:t.point,done:()=>{ui.celebrate?.('A piece of the way back',t.point.title);selectedQuest='main';}});}break;
  case 'finale':if(finishAdventure(progress)){persist();audio.chime('quest');storyScene('finale','Adventure complete',{point:SPAWN,duration:3,done:()=>openPanel('finale')});}break;
  case 'pet':audio.chime('pet');startScene({title:'A familiar friend',text:'Some detours are worth taking twice.',duration:3,done:()=>{}});break;
  case 'cat':{
   selectedQuest='cat';const index=progress.catStep,next=CAT_TRAIL[Math.min(index+1,CAT_TRAIL.length-1)],at=cat.group.position.clone();
   const finish=()=>{advanceCat(progress);if(progress.catStep===CAT_TRAIL.length){completeQuest(progress,'cat');toast('Paws and Effect complete');audio.chime('quest');}else{toast(next.hint||'Follow the paw prints');audio.chime('discover');}persist();};
   const voice=index===0?'cat-start':index===CAT_TRAIL.length-1?'cat-finish':null;
   startScene({title:index===CAT_TRAIL.length-1?'A very good cat':'Paws and Effect',text:voice?VOICE_LINES[voice].text:'The cat knows a shortcut. Follow those little paw prints.',duration:voice?10:1.8,from:at.clone().add(new THREE.Vector3(-3*UNIT,2*UNIT,-4*UNIT)),to:at.clone().add(new THREE.Vector3(3*UNIT,1.7*UNIT,-3*UNIT)),done:finish});audio.chime('cat');if(voice)audio.speak(voice,{force:true});break;
  }
  case 'cosmo':selectedQuest='cosmo';findCosmo(progress);if(progress.cosmoStep===COSMO_SPOTS.length){completeQuest(progress,'cosmo');toast('Cosmo found','V to wave. B to dance.');}else toast(COSMO_SPOTS[progress.cosmoStep].hint||'Look for the next postcard clue.');audio.chime('quest');audio.speak('cosmo');persist();break;
  case 'secret':progress.secrets.push(t.point.id);claimReward(progress,'secret:'+t.point.id,15);toast(t.point.name);if(t.point.id==='bell-secret')audio.playNote(2);if(t.point.id==='dance-floor')danceUntil=elapsed+4;audio.chime('discover');persist();break;
  case 'item':selectedQuest='lost-found';progress.items.push(t.point.id);toast('Belonging recovered',t.point.name||'Added to Lost and Found');if(progress.items.length===LOST_ITEMS.length)toast('Return the belongings to their owner');audio.chime('discover');persist();break;
  case 'note':selectedQuest='music';progress.notes.push(t.point.id);audio.chime('discover');toast('Campus in Tune',`${progress.notes.length} of ${TUNE_NOTES.length} musical symbols found`);if(progress.notes.length===TUNE_NOTES.length){openPanel('music');}persist();break;
  case 'photoSpot':selectedQuest='photo';toast('Golden Hour Club','Frame '+t.point.name+' and save a postcard to earn the stamp.');openPanel('photo');break;
  case 'musicPuzzle':openPanel('music');break;
  case 'returnItems':completeQuest(progress,'lost-found');toast('Lost and Found complete','+60 XP');audio.chime('quest');audio.speak('lost-found',{force:true});persist();break;
  case 'deliveryStart':progress.deliveryStarted=true;progress.deliveryStep=1;selectedQuest='delivery';storyScene('delivery','A slightly late student',{point:t.point});persist();break;
  case 'deliveryEnd':progress.deliveryStep=2;completeQuest(progress,'delivery');toast('Late for Class complete');audio.chime('quest');persist();break;
  case 'trial':startTrial(t.point.definition);break;
 }
}
function mount(){
 if(hike?.active||hike?.loading){toast('Scooters stay at the trailhead');return;}
 if(cinematic||stumble)return;if(!grounded){toast('Land before changing rides');return;}if(trial){toast('Finish the race to dismount');return;}const p=player.group.position;let safe=null;
 for(const angle of [0,Math.PI/2,-Math.PI/2,Math.PI]){const candidate=p.clone().add(new THREE.Vector3(Math.cos(yaw+angle)*.6*UNIT,0,Math.sin(yaw+angle)*.6*UNIT)),floor=world.supportHeight(candidate.x,candidate.z,p.y);if(floor===null||Math.abs(floor-p.y)>UNIT)continue;candidate.y=floor;const clear=world.move(candidate,new THREE.Vector3(),(riding?.32:.45)*UNIT);if(Math.hypot(clear.x-candidate.x,clear.z-candidate.z)<.005){safe=candidate;break;}}
 if(!safe){toast('Move away from the wall');return;}
 if(riding)p.copy(safe);riding=!riding;vy=0;speed=0;audio.chime('discover');boosting=false;
}
function startTrial(definition){
 if(hike?.active||hike?.loading)hike.leave({notify:false});
 if(cinematic)finishCinematic();
 raceResult=null;photoMode=false;boost=1;boosting=false;progress.introSeen=true;persist();
 resetAt(definition.points[0]);riding=true;
 const a=definition.points[0],b=definition.points[1];yaw=Math.atan2(b.x-a.x,b.z-a.z);player.group.rotation.y=yaw;coastDirection.set(Math.sin(yaw),0,Math.cos(yaw));
 trial={definition,index:1,start:elapsed+3,previous:{x:a.x,z:a.z},recorder:createGhostRecorder(),countdown:4};trialClock=0;
 recordGhost(trial.recorder,0,player.group.position,yaw,0,true);
 ui.closePanel(false);setPause(false);updateCamera(1);audio.start();
}
function trackedPoint(){return hike?.active?hike.target():trial?trial.definition.points[trial.index]:(selectedQuest.startsWith('activity:')||selectedQuest.startsWith('campus:'))?campusLife?.target(selectedQuest):questTarget(progress,selectedQuest);}
function updateRace(){
 if(!trial)return;
 trialClock=Math.max(0,elapsed-trial.start);
 const p=player.group.position,t=trial;
 recordGhost(t.recorder,trialClock,p,player.group.rotation.y,speed/UNIT);
 if(trialClock>3600){trial=null;speed=0;toast('Race timed out','Choose a course to try again.');openPanel('races');return;}
 if(!crossedCheckpoint(t.previous,p,t.definition.points[t.index],4*UNIT)){t.previous={x:p.x,z:p.z};return;}
 t.previous={x:p.x,z:p.z};t.index++;boost=Math.min(1,boost+.32);audio.chime('checkpoint');
 if(t.index<t.definition.points.length){ui.checkpoint(t.index-1,t.definition.points.length-1);return;}
 const d=t.definition,previous=progress.bestTimes[d.id],before=getSummary(progress).xp;
 recordGhost(t.recorder,trialClock,p,player.group.rotation.y,speed/UNIT,true);
 recordTrial(progress,d.id,trialClock,t.recorder.points);
 raceResult={id:d.id,name:d.name,seconds:trialClock,targetSeconds:d.targetSeconds,previous,best:progress.bestTimes[d.id],newBest:!previous||trialClock<previous,medal:medalFor(trialClock,d.targetSeconds),xp:getSummary(progress).xp-before};
 trial=null;speed=0;boosting=false;persist();audio.chime('quest');openPanel('raceResult');
}
function raceHUD(){
 if(!trial)return null;
 const remaining=trial.start-elapsed,countdown=remaining>0?String(Math.ceil(remaining)):remaining>-.65?'GO!':'';
 if(countdown&&trial.countdown!==countdown){trial.countdown=countdown;audio.chime(countdown==='GO!'?'quest':'checkpoint');}
 return {id:trial.definition.id,name:trial.definition.name,seconds:Math.max(0,elapsed-trial.start),gold:trial.definition.targetSeconds,index:trial.index,total:trial.definition.points.length-1,best:progress.bestTimes[trial.definition.id],distance:Math.round(Math.hypot(player.group.position.x-trial.definition.points[trial.index].x,player.group.position.z-trial.definition.points[trial.index].z)/UNIT),countdown};
}
function updateActors(dt,{instant=false}={}){
 const p=player.group.position,target=trackedPoint();waypoint.visible=!!target&&!photoMode;if(target){waypoint.position.set(target.x,(world.groundHeight(target.x,target.z)??1)+.002,target.z);if(trial){const previous=trial.definition.points[trial.index-1];waypoint.rotation.y=Math.atan2(target.x-previous.x,target.z-previous.z);}else waypoint.rotation.y+=dt*.3;waypoint.getObjectByName('Race gate').visible=!!trial;}
 deliveryNPC.update(dt,{speed:0,grounded:true,emote:Math.hypot(p.x-deliveryNPC.group.position.x,p.z-deliveryNPC.group.position.z)<5*UNIT});
 const level=getSummary(progress).level;if(level!==lastLevel){const outfit=OUTFITS.find(o=>o.id===progress.cosmetics.outfit),deck=DECKS.find(d=>d.id===progress.cosmetics.deck);player.setStyle?.({level,jacket:outfit?.jacket,backpack:outfit?.pack});scooter.setStyle?.({level,color:deck?.color});if(lastLevel&&level>lastLevel)toast('Level '+level);lastLevel=level;}
 const ghost=trial&&elapsed>=trial.start&&progress.settings.showGhost!==false?ghostAt(progress.bestRuns?.[trial.definition.id],elapsed-trial.start):null;
 ghostPlayer.group.visible=ghostScooter.group.visible=!!ghost&&!photoMode;
 if(ghost){for(const actor of [ghostPlayer,ghostScooter]){actor.group.position.set(ghost.x,ghost.y,ghost.z);actor.group.rotation.y=ghost.yaw;}ghostPlayer.update(dt,{speed:ghost.speed,grounded:true,riding:true});ghostScooter.update(dt,{speed:ghost.speed});ghostPlayer.group.getObjectByName('Ground shadow').visible=false;}
 const ci=Math.min(progress.catStep,CAT_TRAIL.length-1),cp=CAT_TRAIL[ci],catDestination=new THREE.Vector3(cp.x,world.groundHeight(cp.x,cp.z)??1,cp.z);let catRunning=false;
 if(cinematic?.title==='Paws and Effect'&&progress.catStep<CAT_TRAIL.length-1){const np=CAT_TRAIL[progress.catStep+1],t=Math.min(1,cinematic.time/cinematic.duration);catDestination.set(THREE.MathUtils.lerp(cp.x,np.x,t),world.groundHeight(THREE.MathUtils.lerp(cp.x,np.x,t),THREE.MathUtils.lerp(cp.z,np.z,t))??1,THREE.MathUtils.lerp(cp.z,np.z,t));catRunning=true;}
 const cd=catDestination.clone().sub(cat.group.position);if(cd.length()>.002){cat.group.rotation.y=Math.atan2(cd.x,cd.z);cat.group.position.lerp(catDestination,Math.min(1,dt*8));catRunning=true;}
 cat.update(dt,{running:catRunning,petting:cinematic&&ci===CAT_TRAIL.length-1});
 const co=COSMO_SPOTS[Math.min(progress.cosmoStep,COSMO_SPOTS.length-1)];cosmo.group.position.set(co.x,world.groundHeight(co.x,co.z)??1,co.z);cosmo.group.rotation.y=Math.atan2(p.x-co.x,p.z-co.z);cosmo.update(dt,{wave:Math.hypot(p.x-co.x,p.z-co.z)<10*UNIT,dance:progress.cosmoStep>=COSMO_SPOTS.length});
 scooter.group.visible=riding;const pose=riding?world.groundPose(p.x,p.z,player.group.rotation.y,p.y):null;
 player.group.rotation.order='YXZ';player.group.rotation.x=pose?.pitch||0;player.group.rotation.z=pose?.roll||0;
 if(riding){scooter.group.position.copy(p);scooter.group.rotation.set(pose?.pitch||0,player.group.rotation.y,pose?.roll||0,'YXZ');scooter.update(dt,{speed:speed/UNIT,groundRoll:pose?.roll||0,braking,turn:steering,stumble});}
 player.update(dt,{speed:speed/UNIT,grounded,riding,running,verticalSpeed:vy/UNIT,landing,turn:steering,braking,stumble,instant,emote:!stumble&&(keys.has('KeyV')||photoMode&&photoPose==='wave'),dance:!stumble&&(keys.has('KeyB')||photoMode&&photoPose==='dance'||elapsed<danceUntil)});
 for(const m of markers){m.update(dt);m.group.visible=!photoMode;const catIndex=CAT_TRAIL.indexOf(m.point),cosIndex=COSMO_SPOTS.indexOf(m.point);if(trial)m.group.visible=false;if(PHOTO_SPOTS.includes(m.point))m.group.visible=!photoMode&&!trial&&selectedQuest==='photo'&&!progress.photos.includes(m.point.id);if(m.point.definition)m.group.visible=false;if(catIndex>=0)m.group.visible=!photoMode&&!trial&&catIndex===progress.catStep;if(cosIndex>=0)m.group.visible=!photoMode&&!trial&&cosIndex===progress.cosmoStep;}
 for(const pr of props){if(pr.point){if(!progress.settings.reducedMotion)pr.mesh.rotation.y+=dt*.4;pr.mesh.position.y=(world.groundHeight(pr.point.x,pr.point.z)??1)+(.7+Math.sin(elapsed*1.6+pr.point.x)*.08)*UNIT;pr.mesh.visible=pr.fragment?!trial&&pr.fragment===MAIN_CHAPTERS.find(c=>!progress.fragments.includes(c.id))?.id&&MAIN_CHAPTERS.find(c=>c.id===pr.fragment).locations.every(id=>progress.visited.includes(id)):![...progress.secrets,...progress.items,...progress.notes].includes(pr.point.id);}if(pr.trail!==undefined)pr.mesh.visible=pr.trail===progress.catStep-1;}
 const still=reducedMotion();
 scenery?.update(dt,elapsed,{night:world.getTime?.()==='night',reducedMotion:still,player:p});
 if(!hike?.active)campusLife?.update(dt,elapsed,{position:p,cameraPosition:camera.position,riding,speed:speed/UNIT,braking,stumble,grounded,enabled:!cinematic&&!trial&&!photoMode,photoMode,reducedMotion:still});
 hike?.update(dt,{position:p,cameraPosition:camera.position,grounded,riding,photoMode,reducedMotion:still,enabled:!paused&&!cinematic&&!trial&&!photoMode});
}
function step(dt,touch){
 impactCooldown=Math.max(0,impactCooldown-dt);landing=Math.max(0,landing-dt*4);
 if(stumble){stumble=advanceStumble(stumble,dt);speed=0;boosting=running=braking=false;steering=0;jumpBuffer=0;pressed.delete('Space');if(!stumble)impactCooldown=1;return;}
 const input=normalizeMoveInput((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+(touch.x||0),(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+(touch.y||0));
 const {x:ix,z:iz,magnitude:len}=input,run=keys.has('KeyC')||touch.run;
 running=!riding&&run&&len>.1;
 const wasBraking=braking;braking=riding&&(keys.has('KeyF')||touch.brake);
 if(braking&&!wasBraking&&grounded&&speed>UNIT)audio.foley('brake',playerSurface(),speed/(12*UNIT));
 const boostState=stepBoost(boost,riding&&!braking&&(keys.has('Space')||touch.boost),len>.1,dt);boost=boostState.charge;boosting=riding&&boostState.active&&!braking;
 const targetSpeed=(riding?(boosting?12:run?8.5:6.5):(run?5.2:2.6))*len;
 speed=approachSpeed(speed/UNIT,targetSpeed,dt,{riding,braking})*UNIT;
 // Small jump buffers make stairs and platform edges forgiving without auto-jump.
 coyote=grounded?.10:Math.max(0,coyote-dt);jumpBuffer=Math.max(0,jumpBuffer-dt);
 if(jumpBuffer>0&&coyote>0&&!riding){vy=4.5*UNIT;grounded=false;coyote=jumpBuffer=0;}
 const p=player.group.position;
 if(len>.02||speed>.002){
  if(len>.02){const direction=movementDirection(ix,iz,yaw),angle=Math.atan2(direction.x,direction.z);if(riding&&speed>UNIT){const old=Math.atan2(coastDirection.x,coastDirection.z),diff=THREE.MathUtils.euclideanModulo(angle-old+Math.PI,Math.PI*2)-Math.PI,turn=THREE.MathUtils.clamp(diff,-dt*2.8,dt*2.8);coastDirection.set(Math.sin(old+turn),0,Math.cos(old+turn));steering=turn/(dt*2.8);}else{coastDirection.set(direction.x,0,direction.z).normalize();steering=THREE.MathUtils.damp(steering,0,10,dt);}}
  else steering=THREE.MathUtils.damp(steering,0,10,dt);
  motion.set(coastDirection.x*speed*dt,0,coastDirection.z*speed*dt);
  const next=world.move(p,motion,(riding?.45:.32)*UNIT,{grounded}),actual={x:(next.x-p.x)/UNIT,z:(next.z-p.z)/UNIT};
  const impact=hike?.active?null:detectImpact({speed:speed/UNIT,requested:{x:motion.x/UNIT,z:motion.z/UNIT},actual,riding,running,grounded,cooldown:impactCooldown});
  p.copy(next);
  const angle=cameraLocked&&!riding?yaw:Math.atan2(coastDirection.x,coastDirection.z),diff=THREE.MathUtils.euclideanModulo(angle-player.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;player.group.rotation.y+=diff*Math.min(1,dt*14);
  if(impact){audio.foley(impact.kind,playerSurface(),impact.severity);stumble={...startStumble(impact.kind,steering<0?-1:1),impactYaw:Math.atan2(motion.x,motion.z)};speed=0;vy=0;boosting=false;jumpBuffer=coyote=0;}
  else if(motion.lengthSq()>1e-12){const travel=(actual.x*motion.x/UNIT+actual.z*motion.z/UNIT)/(motion.lengthSq()/(UNIT*UNIT));if(travel<.12)speed=0;else if(grounded&&!riding)frameGroundTravel+=Math.hypot(actual.x,actual.z);}
 }
 if(cameraLocked&&!riding&&!stumble){const diff=THREE.MathUtils.euclideanModulo(yaw-player.group.rotation.y+Math.PI,Math.PI*2)-Math.PI;player.group.rotation.y+=diff*Math.min(1,dt*18);}
 const ground=riding?world.groundPose(p.x,p.z,player.group.rotation.y,p.y)?.height:world.supportHeight(p.x,p.z,p.y);if(!Number.isFinite(ground)||ground< -20){resetAt();return;}vy-=9.8*UNIT*dt;p.y+=vy*dt;
 if((vy<=0&&p.y<=ground+.002)||(grounded&&Math.abs(p.y-ground)<.55*UNIT)){const touchedDown=!grounded;if(touchedDown)landing=THREE.MathUtils.clamp(-vy/(7*UNIT),0,1);p.y=ground;vy=0;grounded=true;if(touchedDown&&landing>.22&&!riding&&!stumble)audio.foley('land',playerSurface(),landing);}else grounded=false;
 if(p.y<ground-1||p.y>ground+12*UNIT)resetAt();if(!hike?.active&&grounded&&!stumble&&elapsed-lastCheckpoint>4){progress.checkpoint={x:p.x,z:p.z};lastCheckpoint=elapsed;}
}
function updateDiscoveries(dt){
 const p=player.group.position;
 for(const place of LOCATIONS){if(progress.visited.includes(place.id))continue;const inside=grounded&&Math.hypot(p.x-place.x,p.z-place.z)<(place.radius||4*UNIT);visits.set(place.id,inside?(visits.get(place.id)||0)+dt:0);const mainBefore=getSummary(progress).mainComplete;
  if(visits.get(place.id)>.7&&discover(progress,place.id)){if(!trial){toast(place.name,'+10 XP');audio.chime('discover');}persist();if(getSummary(progress).mainComplete&&!mainBefore){completeQuest(progress,'main');toast('Adventure complete');audio.chime('quest');persist();}}
 }
 updateRace();
}
function updateCamera(dt){
 const still=reducedMotion(),p=player.group.position,shoulder=cameraLocked?.45*UNIT:0;follow.lerp(p.clone().add(new THREE.Vector3(-Math.cos(yaw)*shoulder,1.30*UNIT,Math.sin(yaw)*shoulder)),still?1:1-Math.exp(-dt*12));
 if(cinematic){cinematic.time+=dt;if(!still){camera.position.lerpVectors(cinematic.from,cinematic.to,Math.min(1,cinematic.time/cinematic.duration));camera.lookAt(cinematic.lookAt||cat.group.position.clone().add(new THREE.Vector3(0,.35*UNIT,0)));}if(cinematic.time>=cinematic.duration)finishCinematic();return;}
 const fov=65+(boosting&&!still?6:0);if(Math.abs(camera.fov-fov)>.01){camera.fov=still?fov:THREE.MathUtils.damp(camera.fov,fov,5,dt);camera.updateProjectionMatrix();}
 const dist=(riding?5.5:4.2)*UNIT*progress.settings.cameraDistance;desiredCamera.set(follow.x-Math.sin(yaw)*Math.cos(pitch)*dist,follow.y+Math.sin(pitch)*dist,follow.z-Math.cos(yaw)*Math.cos(pitch)*dist);const clear=world.cameraPosition?.(follow,desiredCamera)||desiredCamera;camera.position.lerp(clear,still?1:1-Math.exp(-dt*16));camera.position.copy(world.cameraPosition(follow,camera.position));camera.lookAt(follow);
}
function look(dx,dy){const next=lookDirection(yaw,pitch,dx,dy,progress.settings);yaw=next.yaw;pitch=next.pitch;}
function toggleCameraLock(canvas){
 if(paused||cinematic||photoMode)return;
 if(document.pointerLockElement===canvas){ignoreLockRelease=true;document.exitPointerLock?.();return;}
 if(!canvas.requestPointerLock){toast('Hold the right mouse button to look','Mouse lock is unavailable in this browser.');return;}
 try{canvas.requestPointerLock()?.catch?.(()=>toast('Hold the right mouse button to look','Mouse lock is unavailable here.'));}catch{toast('Hold the right mouse button to look','Mouse lock is unavailable here.');}
}
function tick(now){
 if(disposed)return;frame=requestAnimationFrame(tick);const dt=last?Math.min(.15,(now-last)/1000):1/60;last=now;if(!ready)return;
 frameGroundTravel=0;
 if(!paused){elapsed+=dt;const touch=ui.getInput();if(!cinematic)look(touch.lookX||0,touch.lookY||0);if(touch.jump)pressed.add('Space');if(touch.interact)pressed.add('KeyE');if(touch.mount)pressed.add('KeyQ');
  // Latch render-frame jump edges even when a high-refresh frame has no fixed step.
  if(pressed.has('Space')&&!riding&&!stumble&&!cinematic&&!photoMode){jumpBuffer=.12;pressed.delete('Space');}
  if(pressed.has('KeyE'))interact();if(pressed.has('KeyQ'))mount();if(pressed.has('KeyH'))audio.chime('horn');if(!cinematic&&!photoMode&&(!trial||elapsed>=trial.start)){accumulator=Math.min(accumulator+dt,.15);while(accumulator>=1/60){step(1/60,touch);accumulator-=1/60;}updateDiscoveries(dt);}
  updateActors(dt);updateCamera(dt);world.update(dt,elapsed);if(progress.settings.cycle)audio.setMood(world.getTime());if(elapsed-lastPersist>12){persist();lastPersist=elapsed;}pressed.clear();
 }
 const summary=getSummary(progress),p=player.group.position,target=trackedPoint();
 const quest=hike?.active?hike.status():selectedQuest==='free'?null:questStatus(progress,selectedQuest);
 nearby=paused?null:getTarget();ui.setPrompt(nearby?nearby.label:'');ui.setMovement?.({stumble,braking,cameraLocked});
 const characters=hike?.active?[]:campusLife?.getCharacters()||[];
 if(!paused)audio.update(dt,{riding,speed:speed/UNIT,distance:frameGroundTravel,grounded,braking,surface:playerSurface,characters:trial?[]:characters,x:p.x/UNIT,z:p.z/UNIT,yaw,unit:UNIT,enabled:!cinematic&&!photoMode&&!stumble});
 ui.update({xp:summary.xp,level:summary.level,levelStartXp:summary.levelStartXp,nextLevelXp:summary.nextLevelXp,visited:progress.visited.length,total:LOCATIONS.length,quest,objective:quest?.text||'',distance:target?Math.round(Math.hypot(p.x-target.x,p.z-target.z)/UNIT):null,boost,boosting,race:raceHUD(),location:hike?.active?'The Y trail':LOCATIONS.reduce((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)<Math.hypot(p.x-b.x,p.z-b.z)?a:b).name,riding,speed:speed/UNIT,sound:progress.settings.music,time:progress.settings.time||'sunset',paused});
 navigation?.update(elapsed,p,photoMode||hike?.active||progress.settings.routeHints===false?null:target,{reducedMotion:reducedMotion()});world.setShadowTarget?.(p);ui.setHeading?.(180-yaw*180/Math.PI);ui.setPlayerPosition?.({x:p.x,z:p.z,yaw,target,places:hike?.active?hike.points:LOCATIONS,characters,activities:hike?.active?[]:campusLife?.getMapActivities?.()||[]});renderer.render(scene,camera);
}
function dispose({keepErrorScreen=false}={}){
 if(disposed)return;
 if(ready)persist();
 disposed=true;ready=false;
 cancelAnimationFrame(frame);clearTimeout(achievementTimer);
 for(const remove of listeners.splice(0))remove();
 hike?.dispose();audio.dispose();campusLife?.dispose();scenery?.dispose();navigation?.dispose();world?.dispose();
 for(const actor of [player,scooter,ghostPlayer,ghostScooter,cat,cosmo,car,deliveryNPC,bench,...markers])actor?.dispose();
 const textures=new Set();
 for(const {geo,mat,texture,mesh} of props){geo.dispose();mat.dispose();if(texture)textures.add(texture);mesh.removeFromParent();}
 for(const texture of textures)texture.dispose();
 waypoint?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 if(!keepErrorScreen)ui.dispose();
 if(renderer){
  renderer.dispose();
  if(!renderer.getContext().isContextLost())renderer.forceContextLoss();
 }
 document.exitPointerLock?.();
}
function failGame(message){
 if(disposed)return;
 dispose({keepErrorScreen:true});
 ui.showError(message);
 send('error',{message});
}
async function init(){
 try{
  ui.setLoading('Loading campus…',.05);send('loading',{message:'Loading campus…',fraction:.05});const canvas=document.getElementById('world');
  listen(window,'pagehide',event=>{if(event.persisted){if(ready){persist();setPause(true);}}else dispose();});
  listen(window,'message',event=>{
   if(event.origin!==location.origin||event.source!==parent||event.data?.channel!==CHANNEL)return;
   if(event.data.type==='exit')action('exit');
   if(event.data.type==='pause'&&ready)setPause(true);
  });
  applyMotionPreference();listen(motionPreference,'change',applyMotionPreference);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;applyQuality();scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.0035,1600);
  listen(canvas,'webglcontextlost',()=>failGame('Graphics were interrupted.'));
  const loadedWorld=await createWorld({scene,renderer,onProgress:(text,value)=>{if(!disposed){ui.setLoading(text,value);send('loading',{message:text,fraction:value});}}});
  if(disposed){loadedWorld.dispose();return;}world=loadedWorld;
  player=createPlayer(scene);scooter=createScooter(scene);ghostPlayer=createPlayer(scene);ghostScooter=createScooter(scene);
  for(const actor of [ghostPlayer,ghostScooter]){actor.group.visible=false;actor.group.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=.25;o.material.depthWrite=false;if(o.material.color)o.material.color.set('#75e8f0');}o.castShadow=false;});}
  cat=createCat(scene);cosmo=createCosmo(scene);setupProps();
  const loadedNavigation=await createNavigation(scene,world);
  if(disposed){loadedNavigation.dispose();return;}navigation=loadedNavigation;
  campusLife=createCampusLifeRuntime({scene,world,navigation,getProgress:()=>progress,getPlayer:()=>({position:player.group.position}),
    pause(){ui.closePanel(false);setPause(true,true);},resume(){setPause(false);},
    track(id){trial=null;boosting=false;speed=0;selectedQuest=id;progress.introSeen=true;persist();},persist,
    reward(value){claimReward(progress,value.id,value.xp);audio.chime('quest');lastLevel=0;},toast,
    playNote(index){audio.resume();audio.start();audio.playNote?.(index);},openPhoto(){openPanel('photo');}});
  campusLife=createCampusNetworkRuntime({legacy:campusLife,scene,world,navigation,getProgress:()=>progress,getPlayer:()=>({position:player.group.position,grounded,riding,speed:speed/UNIT}),
    pause(){ui.closePanel(false);setPause(true,true);},resume(){setPause(false);},
    track(id){trial=null;boosting=false;speed=0;selectedQuest=id;progress.introSeen=true;persist();},persist,
    reward(value){claimReward(progress,value.id,value.xp);audio.chime('quest');lastLevel=0;},toast,openHike(){action('hike');}});
  const campusMove=world.move.bind(world);world.move=(from,delta,radius,options)=>campusMove(from,clipDistrictMotion(from,delta,campusLife.getObstacles(),radius),radius,options);
  hike=createHikeRuntime({scene,world,getProgress:()=>progress,getPlayer:()=>({position:player.group.position.clone(),grounded,riding}),
    pause(){ui.closePanel(false);setPause(true,true);},resume(){setPause(false);},placePlayer(point){resetAt(point);if(Number.isFinite(point.heading)){yaw=point.heading;pitch=.3;player.group.rotation.y=yaw;coastDirection.set(Math.sin(yaw),0,Math.cos(yaw));updateCamera(1);}},
    returnToCampus(){resetAt(progress.checkpoint||SPAWN);},persist,
    reward(value){claimReward(progress,value.id,value.xp);lastLevel=0;},toast,openPhoto(){openPanel('photo');}});
  resetAt();const cp=CAT_TRAIL[Math.min(progress.catStep,CAT_TRAIL.length-1)];cat.group.position.set(cp.x,world.groundHeight(cp.x,cp.z)??1,cp.z);applySettings();
  listen(window,'resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();});
  listen(document,'keydown',e=>{
   if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(!paused&&!e.target.closest('button,a')&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
   if(e.code==='Escape'){e.preventDefault();if(hike?.loading)return;if(hike?.isOpen){hike.close();setPause(false);return;}if(cinematic){finishCinematic();return;}if(paused){ui.closePanel(false);setPause(false);}else{setPause(true);ui.openPanel('pause',panelData());}return;}
   if(e.code==='ShiftLeft'||e.code==='ShiftRight'){if(!e.repeat)toggleCameraLock(canvas);return;}
   if(e.repeat)return;if(e.code==='KeyM'){openPanel('map');return;}if(e.code==='KeyJ'){openPanel('quests');return;}if(e.code==='KeyP'){openPanel('photo');return;}if(e.code==='KeyR'&&trial){startTrial(trial.definition);return;}if(!paused){keys.add(e.code);pressed.add(e.code);}
  });
  listen(document,'keyup',e=>keys.delete(e.code));
  listen(canvas,'contextmenu',e=>e.preventDefault());
  listen(canvas,'pointerdown',e=>{audio.start();if(paused||cinematic||e.pointerType==='touch'||![0,2].includes(e.button))return;canvas.focus({preventScroll:true});dragPointer=e.pointerId;px=e.clientX;py=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
  listen(canvas,'pointermove',e=>{if(paused||cinematic||e.pointerType==='touch')return;if(document.pointerLockElement===canvas)look(e.movementX,e.movementY);else if(dragPointer===e.pointerId){look(e.clientX-px,e.clientY-py);px=e.clientX;py=e.clientY;}});
  const stopDrag=()=>{dragPointer=null;};listen(canvas,'pointerup',stopDrag);listen(canvas,'pointercancel',stopDrag);listen(canvas,'lostpointercapture',stopDrag);
  listen(canvas,'wheel',e=>{if(paused||cinematic)return;e.preventDefault();progress.settings.cameraDistance=zoomDistance(progress.settings.cameraDistance,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1));},{passive:false});
  listen(document,'pointerlockchange',()=>{const wasLocked=cameraLocked;cameraLocked=document.pointerLockElement===canvas;canvas.classList.toggle('mouse-locked',cameraLocked);if(wasLocked&&!cameraLocked&&ready&&!cinematic&&!paused&&!ignoreLockRelease)setPause(true);ignoreLockRelease=false;});
  listen(document,'pointerdown',e=>{if(e.isTrusted&&!paused)audio.start();});listen(document,'keydown',e=>{if(e.isTrusted&&!paused)audio.start();});
  listen(window,'blur',()=>{dragPointer=null;if(ready)setPause(true);});listen(document,'visibilitychange',()=>{if(document.hidden&&ready){persist();setPause(true);}});
  ready=true;ui.ready();send('ready');if(progress.introSeen){ui.closePanel(false);setPause(false);}else openPanel('welcome');frame=requestAnimationFrame(tick);
  Object.defineProperty(window,'campusExplorer',{value:{get snapshot(){const p=player.group.position;return {ready,paused,riding,position:{x:p.x,y:p.y,z:p.z},grounded,speed:speed/UNIT,running,braking,stumble:stumble?{...stumble}:null,camera:{yaw,pitch,locked:cameraLocked,distance:progress.settings.cameraDistance},summary:getSummary(progress),target:nearby?.kind,cinematic:!!cinematic,trial:trial?.definition.id,hike:hike?.snapshot,renderer:renderer.info.render};}},configurable:true});
 }catch(error){if(!disposed){console.error('Campus explorer:',error);failGame('Campus could not load. Please try again.');}}
}
init();
