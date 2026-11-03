import {UNIT} from './content.mjs?v=20261102polish6';
import {NPC_DEFINITIONS,ACTIVITIES} from './district-content.mjs?v=20261102polish6';
import {activityObjectives} from './activities.mjs?v=20261102polish6';
import {CAMPUS_ACTIVITIES,CAMPUS_NPCS,CAMPUS_DISTRICTS} from './campus-content.mjs?v=20261102polish6';
import {applyCampusActivityAction,campusActivityObjectives,campusActivityTarget,campusActivityStatus,currentCampusStep,getCampusConversation,getCampusStepConversation} from './campus-state.mjs?v=20261102polish6';
import {createCampusWorld} from './campus-world.mjs?v=20261102polish6';
import {createDistrictUI} from './district-ui.mjs?v=20261102polish6';

// One facade keeps the original district, races and adventure independent of
// the campus-wide stories. Only this boundary supplies physical evidence.
export function createCampusNetworkRuntime({legacy,scene,world,navigation,getProgress,getPlayer,pause,resume,track,persist,reward,toast,openHike=()=>{}}) {
  let disposed=false,active=null,previous=null,physical={},districtFilter='all',statusFilter='available';
  const evidence=new Map();
  const state=()=>getProgress().campusActivities;
  const campus=createCampusWorld(scene,world,{getState:state,getRoute:(from,to)=>navigation?.findPath(from,to)||[],getLegacyCharacters:()=>legacy.getCharacters()});
  const ui=createDistrictUI({onAction:handleAction,idPrefix:'campus'});
  const characters=()=>[...legacy.getCharacters(),...campus.getCharacters()];
  const person=id=>characters().find(value=>value.id===id);
  const context=(npcId,extra={})=>({...physical,...getPlayer(),npcId,npcPosition:person(npcId),...extra});
  const near=(a,b,r=3.5)=>a&&b&&Math.hypot(a.x-b.x,a.z-b.z)<=r*UNIT;
  const definition=id=>CAMPUS_ACTIVITIES.find(value=>value.id===id);
  const keyFor=(id,step)=>id+':'+step.id;

  function apply(action,details) {
    if(disposed)return {changed:false};
    const result=applyCampusActivityAction(state(),action,details);
    if(result.changed){
      evidence.clear();
      if(result.reward)reward(result.reward);
      persist();
      if(result.message&&!action.startsWith('campus:meet:'))toast(result.reward?'Story complete':'Campus life',result.message);
    }
    return result;
  }
  function close(){if(!ui.isOpen)return;ui.close();active=null;resume();}
  function openConversation(id,{meet=false}={}){
    if(legacy.isOpen)legacy.close();
    if(meet)apply('campus:meet:'+id,context(id));
    active={kind:'person',id};pause();campus.interact(id,'talk');
    ui.showConversation(getCampusConversation(state(),id));
  }
  function openStep(id){
    const step=currentCampusStep(state(),id);if(!step)return;
    active={kind:'step',id,stepId:step.id};pause();
    ui.showConversation(getCampusStepConversation(state(),id));
  }
  function bag(){
    const items=[];
    for(const a of CAMPUS_ACTIVITIES){
      const entry=state().activities[a.id];if(!entry?.started||entry.finished)continue;
      for(const [index,step] of a.steps.entries())if(step.type==='deliver'&&step.item&&!entry.steps.includes(step.id)&&a.steps.slice(0,index).some(p=>p.item===step.item&&entry.steps.includes(p.id)))items.push(step.item);
    }
    return [...new Set(items)];
  }
  function openJournal(){
    if(legacy.isOpen)legacy.close();active={kind:'journal'};pause();
    const selected=getProgress().trackedQuest;
    const oldDistrict={maya:'central',eli:'library',nora:'science',jun:'arts',sofia:'arts'};
    const originals=activityObjectives(getProgress().campusLife).map(value=>({...value,id:'activity:'+value.id,district:oldDistrict[value.npcId]}));
    const expanded=campusActivityObjectives(state()).map(value=>({...value,id:'campus:'+value.id}));
    ui.showJournal({objectives:[...originals,...expanded],characters:[...NPC_DEFINITIONS,...CAMPUS_NPCS],selectedActivity:selected,
      title:'Campus life',
      districts:CAMPUS_DISTRICTS,selectedDistrict:districtFilter,statusFilter,carrying:bag(),hike:true});
  }
  function select(id){
    if(typeof id!=='string'||!ACTIVITIES.some(a=>'activity:'+a.id===id)&&!CAMPUS_ACTIVITIES.some(a=>'campus:'+a.id===id))return;
    if(id.startsWith('campus:')){
      let a=definition(id.slice(7));const visited=new Set();
      while(a&&campusActivityStatus(state(),a.id).status==='locked'){
        if(visited.has(a.id))return;visited.add(a.id);
        const missing=a.requires.find(value=>!state().completed.includes(value));
        a=definition(missing);if(!a)return;id='campus:'+a.id;
      }
    }
    track(id);ui.close();active=null;resume();

  }
  function handleAction(name,payload){
    if(disposed)return;
    if(name==='districtClose'){ui.close();active=null;resume();return;}
    if(name==='districtTrack'){select(payload);return;}
    if(name==='districtHike'){ui.close();active=null;openHike();return;}
    if(name==='districtFilter'){
      if(payload?.district==='all'||CAMPUS_DISTRICTS.some(d=>d.id===payload?.district))districtFilter=payload.district;
      if(['all','active','available','completed'].includes(payload?.status))statusFilter=payload.status;
      openJournal();return;
    }
    if(name!=='districtChoice'||!active||!ui.isOpen)return;
    const current=active.kind==='person'?getCampusConversation(state(),active.id):active.kind==='step'&&currentCampusStep(state(),active.id)?.id===active.stepId?getCampusStepConversation(state(),active.id):null;
    if(!current||payload?.npcId!==current.npcId)return;
    const choice=current.choices.find(value=>value.id===payload.choiceId&&value.action===payload.action&&!value.disabled);
    if(!choice)return;
    if(choice.action==='decline'){close();return;}
    const a=active.kind==='step'?definition(active.id):CAMPUS_ACTIVITIES.find(value=>choice.action==='campus:start:'+value.id||choice.action==='campus:finish:'+value.id);
    const step=active.kind==='step'?currentCampusStep(state(),active.id):null;
    const measured=step?evidence.get(keyFor(active.id,step))||{}:{};
    const result=apply(choice.action,context(step?.npcId||a?.npcId||active.id,measured));
    if(!result.changed){
      ui.showConversation({...current,text:current.text+'\n\n'+(result.message||'Take your time.')});
      return;
    }
    if(a&&!state().activities[a.id]?.finished)track('campus:'+a.id);
    if(active.kind==='person'){campus.interact(active.id,/finish/.test(choice.action)?'handoff':'point');openConversation(active.id);}
    else close();
  }
  function target(selected){
    if(!selected?.startsWith('campus:'))return legacy.target(selected);
    const point=campusActivityTarget(state(),selected.slice(7));
    if(!point)return null;
    return point.npcId?{...point,...person(point.npcId)}:point;
  }
  function targets(){
    const result=[...legacy.targets(),...campus.getCharacters().map(value=>({...value,npcId:value.id,campusNPC:true,label:'Talk to '+value.name,activity:true}))];
    for(const a of CAMPUS_ACTIVITIES){
      const step=currentCampusStep(state(),a.id);if(!step)continue;
      const point=step.npcId?person(step.npcId):step.point;if(!point)continue;
      result.push({...point,npcId:undefined,actorId:step.npcId,campusStep:a.id,stepId:step.id,label:step.label,activity:true});
    }
    return result;
  }
  function getMapActivities(){
    return CAMPUS_NPCS.flatMap(npc=>{
      const owned=CAMPUS_ACTIVITIES.filter(a=>a.npcId===npc.id);
      const a=owned.find(value=>campusActivityStatus(state(),value.id).status==='active')||owned.find(value=>campusActivityStatus(state(),value.id).status==='available');
      const point=a&&target('campus:'+a.id);if(!point)return [];
      return [{...point,id:'campus:'+a.id,name:a.title,role:campusActivityStatus(state(),a.id).text,color:npc.color,activityMarker:true}];
    });
  }
  function interact(point){
    if(point?.campusNPC){openConversation(point.npcId,{meet:true});return;}
    if(point?.campusStep){
      const step=currentCampusStep(state(),point.campusStep);
      if(!step||step.id!==point.stepId)return;
      if(['observe','visit'].includes(step.type)){toast(definition(point.campusStep).title,step.prompt);return;}
      openStep(point.campusStep);return;
    }
    if(ui.isOpen)close();legacy.interact(point);
  }
  function suspend(){previous=null;evidence.clear();legacy.suspend();}
  function update(dt,time,options={}){
    if(disposed)return;
    legacy.update(dt,time,options);
    physical={grounded:options.grounded===true,riding:options.riding===true,speed:Math.max(0,options.speed||0)};
    campus.update(dt,time,{player:options.position,cameraPosition:options.cameraPosition,paused:options.enabled===false,reducedMotion:options.reducedMotion,photoMode:options.photoMode});
    const position=options.position;
    if(options.enabled===false||options.photoMode||options.stumble||!position||!physical.grounded||physical.riding){suspend();return;}
    const stepTime=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    const moved=previous?Math.hypot(position.x-previous.x,position.z-previous.z)/UNIT:0;
    const plausible=previous&&moved<=Math.max(.3,stepTime*12);
    if(previous&&!plausible)evidence.clear();
    previous={x:position.x,z:position.z};
    for(const a of CAMPUS_ACTIVITIES){
      const step=currentCampusStep(state(),a.id);if(!step)continue;
      const key=keyFor(a.id,step),record=evidence.get(key)||{travelled:0,dwell:0};
      record.travelled+=plausible?moved:0;
      record.dwell=near(position,step.point,2.5)&&moved<.035&&physical.speed<.3?record.dwell+stepTime:0;
      evidence.set(key,record);
      if(!['visit','observe'].includes(step.type))continue;
      // A suspended menu, tile jump or assisted travel cannot supply walking
      // distance or an observation interval. The state engine checks it again.
      const result=apply('campus:step:'+a.id+':'+step.id,context(step.npcId,record));
      if(result.changed)break;
    }
  }
  return {openJournal,target,targets,interact,update,suspend,getMapActivities,
    preparePhoto:camera=>legacy.preparePhoto(camera),
    getCharacters:characters,getObstacles:()=>[...legacy.getObstacles(),...campus.getObstacles()],getAnchors:()=>[...legacy.getAnchors(),...campus.getAnchors()],
    get isOpen(){return ui.isOpen||legacy.isOpen;},
    close(){if(ui.isOpen)close();if(legacy.isOpen)legacy.close();},
    reset(){ui.close();active=null;evidence.clear();previous=null;legacy.reset();campus.reset();},
    dispose(){if(disposed)return;disposed=true;ui.dispose();campus.dispose();legacy.dispose();},
  };
}
