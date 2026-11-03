import * as THREE from '/campus/vendor/three.module.js';
import {UNIT, LOCATIONS} from './content.mjs?v=20261102polish6';
import {NPC_DEFINITIONS, ACTIVITIES, DISTRICT_POINTS, RHYTHM_SEQUENCE, RHYTHM_NOTES} from './district-content.mjs?v=20261102polish6';
import {applyCampusAction, activityObjectives, activityTarget, activityStatus} from './activities.mjs?v=20261102polish6';
import {getConversation} from './dialogue.mjs?v=20261102polish6';
import {createDistrict} from './npcs.mjs?v=20261102polish6';
import {createDistrictUI} from './district-ui.mjs?v=20261102polish6';

// Runtime owns physical evidence; the pure state engine owns the story rules.
export function createCampusLifeRuntime({scene,world,navigation,getProgress,getPlayer,pause,resume,track,persist,reward,toast,playNote,openPhoto}={}) {
  let disposed=false,activeNPC=null,measuredSpeed=0,lastStumble=false,checkTime=0,previousPosition=null,travelled=0;
  const state=()=>getProgress().campusLife;
  const district=createDistrict(scene,world,{getState:state,getRoute:(from,to)=>navigation?.findPath(from,to)||[]});
  const ui=createDistrictUI({onAction:handleAction});
  const people=()=>district.getCharacters();
  const person=id=>people().find(n=>n.id===id);
  const context=(id,extra={})=>({position:getPlayer().position,npcId:id,actorId:id,npcPosition:person(id),...extra});
  const pauseForDialog=()=>pause();

  function apply(action,details={}) {
    if(disposed)return {changed:false};
    const result=applyCampusAction(state(),action,details);
    if(result.changed){
      if(result.reward)reward(result.reward);
      persist();
      if(result.message&&!action.startsWith('meet:'))toast(result.reward?'Campus story complete':'Campus life',result.message);
    }
    return result;
  }
  function conversation(id,{meet=false}={}) {
    const character=person(id);if(!character)return;
    if(meet)apply('meet:'+id,context(id));
    activeNPC=id;pauseForDialog();district.interact(id,'talk');
    ui.showConversation(getConversation(state(),id));
  }
  function close(){ui.close();activeNPC=null;resume();}
  function openJournal(){
    activeNPC=null;pauseForDialog();
    const selected=getProgress().trackedQuest;
    ui.showJournal({objectives:activityObjectives(state()),characters:NPC_DEFINITIONS,selectedActivity:selected?.startsWith('activity:')?selected.slice(9):null});
  }
  function handleAction(name,payload) {
    if(disposed)return;
    if(name==='districtClose'){close();return;}
    if(name==='districtTrack'){
      const activity=ACTIVITIES.find(a=>a.id===payload);if(!activity)return;
      track('activity:'+activity.id);ui.close();activeNPC=null;resume();
      toast(activity.title,activityStatus(state(),activity.id).text);return;
    }
    if(name==='districtNote'){playNote(payload);return;}
    if(name==='districtRhythmComplete'){
      if(activeNPC!=='jun'||ui.panel!=='rhythm')return;
      apply('jun:rhythm',context('jun',{notes:payload?.notes}));return;
    }
    if(name!=='districtChoice'||payload?.npcId!==activeNPC)return;
    const dialogue=getConversation(state(),activeNPC);
    const choice=dialogue?.choices.find(c=>c.id===payload.choiceId&&c.action===payload.action&&!c.disabled);
    if(!choice)return;
    if(choice.action==='decline'){close();return;}
    if(choice.action==='jun:play'){
      const p=getPlayer().position,jun=person('jun'),music=DISTRICT_POINTS.music;
      if(state().jun.stage!==1||!jun||Math.hypot(p.x-jun.x,p.z-jun.z)>4*UNIT||Math.hypot(p.x-music.x,p.z-music.z)>4*UNIT){
        toast('Meet Jun at Music','Follow Jun to the Music Building.');close();return;
      }
      ui.showRhythm({sequence:RHYTHM_SEQUENCE,noteLabels:RHYTHM_NOTES});return;
    }
    const result=apply(choice.action,context(activeNPC));
    if(!result.changed){toast('Campus life',result.message||'This step is unavailable.');return;}
    const activity=ACTIVITIES.find(a=>a.npcId===choice.action.split(':')[0]);
    if(activity&&state()[activity.npcId].stage>0&&!state().completed.includes(activity.id))track('activity:'+activity.id);
    // Let the player leave naturally after accepting work; cookie selection and
    // follow-up conversations remain available without restarting the dialogue.
    conversation(activeNPC);
    district.interact(activeNPC,/cookie|card|finish/.test(choice.action)?'handoff':'point');
  }
  function targets(){
    const result=people().map(n=>({...n,npcId:n.id,label:'Talk to '+n.name,activity:true}));
    const s=state();
    if(s.maya.stage===2)for(const point of DISTRICT_POINTS.pennants)if(!s.maya.pennants.includes(point.id))result.push({...point,action:'maya:pennant:'+point.id,label:'Arrange the '+point.name.toLowerCase(),activity:true});
    if(s.sofia.stage===1)for(const point of DISTRICT_POINTS.photos)if(!s.sofia.photos.includes(point.id))result.push({...point,action:'photo',label:'Compose Sofia’s '+point.name+' photograph',activity:true});
    return result;
  }
  function interact(point){
    if(point.npcId){conversation(point.npcId,{meet:true});return;}
    if(point.action==='photo'){openPhoto();return;}
    if(point.action){const result=apply(point.action,context(null));if(result.changed)district.interact('maya','point');}
  }
  function target(selected){
    if(!selected?.startsWith('activity:'))return null;
    const point=activityTarget(state(),selected.slice(9));
    return point?.npcId?{...point,...person(point.npcId)}:point;
  }
  function update(dt,time,options={}) {
    const {position,cameraPosition,riding,speed=0,braking=false,stumble=null,grounded=true,enabled=true,photoMode=false,reducedMotion=false}=options;
    if(disposed)return;
    if(enabled)state().clock=(state().clock+dt)%720;
    district.update(enabled?dt:0,state().clock,{player:position,cameraPosition,riding,speed,braking,stumble,paused:!enabled,reducedMotion,photoMode});
    if(!enabled||!position){suspend();return;}
    if(previousPosition&&grounded){const distance=Math.hypot(position.x-previousPosition.x,position.z-previousPosition.z)/UNIT;if(distance<Math.max(1,dt*15))travelled+=distance;else travelled=0;}
    previousPosition={x:position.x,z:position.z};
    const spill=!!stumble;
    if(spill&&!lastStumble)apply('nora:crash',context('nora'));
    lastStumble=spill;
    const nearNora=Math.hypot(position.x-DISTRICT_POINTS.nora.x,position.z-DISTRICT_POINTS.nora.z)<10*UNIT;
    if(riding&&nearNora)measuredSpeed=Math.max(measuredSpeed,speed);
    else measuredSpeed=0;
    checkTime+=dt;if(checkTime<.1||!grounded||spill)return;checkTime=0;
    const s=state();
    if(s.eli.stage===1)apply('eli:arrive',context('eli',{grounded,companionPosition:person('eli')}));
    if(s.nora.stage===1&&riding&&braking&&speed<1.2){const result=apply('nora:brake',context('nora',{riding,braking,speed,grounded,previousSpeed:measuredSpeed}));if(result.changed)measuredSpeed=0;}
    if([2,4].includes(s.nora.stage))apply('nora:gate',context('nora',{riding,braking,speed,grounded,travelled,gateIndex:s.nora.stage===4?s.nora.masteryGate:s.nora.gate}));
    travelled=0;
  }
  function preparePhoto(camera){
    const s=state(),position={...getPlayer().position},evidence=[];
    if(s.sofia.stage!==1)return ()=>{};
    camera.updateMatrixWorld();
    for(const point of DISTRICT_POINTS.photos){
      if(s.sofia.photos.includes(point.id)||Math.hypot(position.x-point.x,position.z-point.z)>5*UNIT)continue;
      const place=LOCATIONS.find(l=>l.id===point.target);
      const feature=world.features?.filter(f=>f.code===place?.code).sort((a,b)=>(b.bounds.max[0]-b.bounds.min[0])*(b.bounds.max[2]-b.bounds.min[2])-(a.bounds.max[0]-a.bounds.min[0])*(a.bounds.max[2]-a.bounds.min[2]))[0];
      if(!feature?.bounds||!world.model)continue;
      const {min,max}=feature.bounds;
      const target=new THREE.Vector3((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2);
      const screen=target.clone().project(camera);
      let visible=Math.abs(screen.x)<.9&&Math.abs(screen.y)<.9&&screen.z>=-1&&screen.z<=1;
      if(visible){
        const ray=new THREE.Raycaster(camera.position,target.clone().sub(camera.position).normalize());
        const hit=ray.intersectObject(world.model,true)[0];
        const identity=hit?.object.geometry?.getAttribute('_feature_id');
        visible=!!identity&&Math.round(identity.getX(hit.face.a))===feature.featureIndex;
      }
      evidence.push({id:point.id,name:place.name,framing:visible?1:0});
    }
    let committed=false;
    return ()=>{
      if(committed||disposed||state()!==s)return;committed=true;
      for(const shot of evidence){const result=apply('sofia:photo:'+shot.id,{position,framing:shot.framing});if(!result.changed)toast('Sofia’s composition','Point the camera toward '+shot.name+' and capture again.');}
    };
  }
  function suspend(){measuredSpeed=0;previousPosition=null;travelled=0;checkTime=0;}
  return {openJournal,interact,targets,target,update,preparePhoto,suspend,getCharacters:people,getObstacles:()=>district.getObstacles?.()||[],getAnchors:()=>district.getAnchors?.()||[],
    reset(){ui.close();activeNPC=null;suspend();lastStumble=false;district.reset?.();},
    get isOpen(){return ui.isOpen;},close,
    dispose(){if(disposed)return;disposed=true;ui.dispose();district.dispose();},
  };
}
