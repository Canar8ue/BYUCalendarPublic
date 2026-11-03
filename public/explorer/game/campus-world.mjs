import * as THREE from '/campus/vendor/three.module.js';
import {UNIT} from './content.mjs?v=20261102polish6';
import {CAMPUS_NPCS,CAMPUS_STANDS,CAMPUS_ACTIVITIES} from './campus-content.mjs?v=20261102polish6';
import {createDistrictArt} from './district-art.mjs?v=20261102polish6';
import {clipDistrictMotion} from './district-collision.mjs?v=20261102polish6';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const offset=(p,x,z)=>({x:p.x+x*UNIT,z:p.z+z*UNIT});
const angle=value=>THREE.MathUtils.euclideanModulo(value+Math.PI,Math.PI*2)-Math.PI;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const OFFSETS={leah:[-6,0],owen:[3.2,.9],iris:[3.2,.9],priya:[3.2,.9],mateo:[3.2,-1.4],sam:[3.2,.9]};

// All positions come from the reviewed outdoor content anchors. This layer
// supplies original art and live positions; only the pure activity rules award
// progress. A missing route leaves a person safely in place.
export function createCampusWorld(scene,world,{getState=()=>({}),getRoute=()=>[],getLegacyCharacters=()=>[]}={}) {
  const art=createDistrictArt(scene,{capacity:CAMPUS_NPCS.length,rootName:'Campus neighborhoods and recurring students'});
  const obstacles=[],booths=[],characters=[],pointProps=[],carry=art.createCarryItem();
  let disposed=false,clock=0,frames=0,propsKey='',carriedItems=[];
  const state=()=>getState()||{};
  const floor=(p,y)=>world.supportHeight?.(p.x,p.z,y)??world.groundHeight(p.x,p.z,y);
  function safePoint(p,offsets=[[0,0]]) {
    for(const [dx,dz]of offsets){const point=offset(p,dx,dz),y=floor(point);if(!Number.isFinite(y))continue;
      const moved=world.move({...point,y},{x:0,z:0},.30*UNIT);
      if(moved&&distance(moved,point)<.04*UNIT)return {...point,y};
    }
    return null;
  }
  function supportedBooth(point) {
    const y=floor(point);if(!Number.isFinite(y))return null;
    for(const [dx,dz]of [[-1.2,-.5],[1.2,-.5],[-1.2,.5],[1.2,.5]]){
      const corner=offset(point,dx,dz),ground=world.groundHeight(corner.x,corner.z,y),moved=world.move({...corner,y},{x:0,z:0},.15*UNIT);
      if(!Number.isFinite(ground)||Math.abs(ground-y)>.4*UNIT||!moved||distance(corner,moved)>.04*UNIT)return null;
    }
    return {...point,y};
  }
  for(const definition of CAMPUS_STANDS){
    const preferred=definition.offsetMeters||OFFSETS[definition.npcId]||[3.2,.9];
    const candidates=[preferred,...[[3.2,.9],[-3.2,.9],[3.2,-1.4],[-3.2,-1.4],[0,3.3],[0,-3.3]]];
    let point=null;for(const pair of candidates){point=supportedBooth(offset(definition.point,...pair));if(point)break;}
    if(!point){art.dispose();throw new Error('No supported outdoor position for '+definition.title);}
    const visual=art.createCampusBooth(definition,point,point.y,CAMPUS_ACTIVITIES.filter(a=>a.npcId===definition.npcId));
    const host=safePoint(offset(point,0,-1.10),[[0,0],[.4,0],[-.4,0]]);
    if(!host){art.dispose();throw new Error('No supported host position for '+definition.title);}
    const booth={definition,point,host,...visual,completed:0};booths.push(booth);
    for(const x of [-.68,0,.68])obstacles.push({...offset(point,x,0),radius:.53*UNIT,id:'campus-counter:'+definition.id});
  }
  const clearFurniture=(point,radius=.29*UNIT)=>obstacles.every(o=>distance(point,o)>o.radius+radius);
  for(const definition of CAMPUS_NPCS){
    const booth=booths.find(b=>b.definition.npcId===definition.id);
    if(!booth)continue;
    const c={...art.createStudent(definition),definition,booth,path:[],pathIndex:0,goal:null,planned:-Infinity,speed:0,gesture:'idle',gestureTime:0,time:0,arrived:true,blocked:'',waiting:0};
    c.group.position.set(booth.host.x,booth.host.y,booth.host.z);characters.push(c);
  }
  const propByKey=new Map(),pointCounts=new Map();
  for(const activity of CAMPUS_ACTIVITIES)for(const step of activity.steps){
    if(!step.prop||!valid(step.point))continue;const key=step.point.id+':'+step.prop;
    if(propByKey.has(key)){propByKey.get(key).steps.push({activityId:activity.id,stepId:step.id,index:activity.steps.indexOf(step)});continue;}
    const index=pointCounts.get(step.point.id)||0;pointCounts.set(step.point.id,index+1);
    const x=(index%3-1)*.8,z=-1.9-Math.floor(index/3)*.8;
    const point=safePoint(step.point,[[x,z],[x,-z],[z,x],[-z,x],[0,0]]);
    if(!point)continue;
    const prop={...art.createCampusProp(step.prop,point,point.y),id:key,anchor:step.point,current:0,completed:0,steps:[{activityId:activity.id,stepId:step.id,index:activity.steps.indexOf(step)}]};
    propByKey.set(key,prop);pointProps.push(prop);
  }
  const byId=id=>characters.find(c=>c.id===id);
  // Schedule destinations are fixed outdoor points. Cache the collision-checked
  // attachment while continuing to validate every step of each character's route.
  const schedulePoints=new Map();
  function activeFor(id,s) {
    return CAMPUS_ACTIVITIES.some(a=>{const e=s.activities?.[a.id];if(!e?.started||e.finished)return false;const step=a.steps[e.steps?.length||0];return a.npcId===id||step?.npcId===id;});
  }
  function goalFor(c,s) {
    if(activeFor(c.id,s))return c.booth.host;
    const schedule=c.definition.schedule||[],phase=(clock+(characters.indexOf(c)*47))%720;
    const part=schedule.find(entry=>phase<entry.until),anchor=c.definition[part?.anchor||'work'];
    if(!valid(anchor)||part?.anchor==='work'||distance(anchor,c.booth.definition.point)<.5*UNIT)return c.booth.host;
    if(!schedulePoints.has(anchor))schedulePoints.set(anchor,safePoint(anchor,[[1.05,-.7],[-1.05,-.7],[0,1.1],[0,0]]));
    return schedulePoints.get(anchor)||c.booth.host;
  }
  function plan(c,goal) {
    c.goal={x:goal.x,z:goal.z};c.planned=clock;c.pathIndex=0;c.path=[];
    const route=getRoute(c.group.position,goal);
    if(Array.isArray(route)&&route.length<20000&&route.every(valid))c.path=route.map(p=>({x:p.x,z:p.z}));
  }
  function move(c,goal,dt,player) {
    const p=c.group.position;c.speed=0;c.blocked='';c.arrived=distance(p,goal)<.65*UNIT;if(c.arrived)return;
    if(!c.goal||distance(c.goal,goal)>.45*UNIT||!c.path.length&&clock-c.planned>2)plan(c,goal);
    while(c.pathIndex<c.path.length&&distance(p,c.path[c.pathIndex])<.25*UNIT)c.pathIndex++;
    const next=c.path[c.pathIndex];if(!next){c.blocked='no-route';return;}
    const dx=next.x-p.x,dz=next.z-p.z,length=Math.hypot(dx,dz);if(length<1e-9)return;
    const speed=activeFor(c.id,state())?2.6:1.25,travel=Math.min(length,speed*UNIT*dt),desired={x:p.x+dx/length*travel,z:p.z+dz/length*travel};
    const neighbors=[...characters.filter(other=>other!==c).map(other=>({id:other.id,...other.group.position})),...getLegacyCharacters()];
    const blockedBy=neighbors.find(other=>valid(other)&&distance(other,desired)<.50*UNIT),playerBlocked=valid(player)&&distance(player,desired)<.65*UNIT;
    if(blockedBy||playerBlocked){
      c.blocked='person';c.waiting+=dt;
      // A stable priority makes one walker yield on a narrow shared corridor.
      // Every sidestep still uses real ground and collision; no person phases
      // through another, and no yield can push somebody into a building.
      if(!playerBlocked&&c.waiting>.6&&(!byId(blockedBy.id)||c.id>blockedBy.id))for(const side of [1,-1]){
        const travel=Math.min(.42*UNIT,1.7*UNIT*dt),motion=clipDistrictMotion(p,{x:-dz/length*travel*side,z:dx/length*travel*side},obstacles,.29*UNIT);
        const result=world.move(p,motion,.29*UNIT,{grounded:true}),y=floor(result,p.y);
        if(Number.isFinite(y)&&Math.abs(y-p.y)<.5*UNIT&&clearFurniture(result)&&distance(result,p)>.02*UNIT&&neighbors.every(other=>!valid(other)||distance(other,result)>=.50*UNIT)){
          c.speed=distance(p,result)/(Math.max(dt,.001)*UNIT);p.set(result.x,y,result.z);c.blocked='yielding';return;
        }
      }
      return;
    }
    c.waiting=0;
    const motion=clipDistrictMotion(p,{x:dx/length*travel,z:dz/length*travel},obstacles,.29*UNIT);
    const result=world.move(p,motion,.29*UNIT,{grounded:true}),y=floor(result,p.y);
    if(!Number.isFinite(y)||Math.abs(y-p.y)>.50*UNIT||!clearFurniture(result)){c.blocked='support-or-furniture';return;}
    c.speed=distance(p,result)/(Math.max(dt,.001)*UNIT);p.set(result.x,y,result.z);
    if(c.speed>.03)c.group.rotation.y+=angle(Math.atan2(dx,dz)-c.group.rotation.y);
    if(c.speed<.02)c.blocked='collision';
  }
  function syncProps(s) {
    const key=JSON.stringify(CAMPUS_ACTIVITIES.map(a=>{const e=s.activities?.[a.id];return [e?.started,e?.steps?.length,e?.finished];}));if(key===propsKey)return;propsKey=key;
    for(const booth of booths){
      booth.completed=CAMPUS_ACTIVITIES.filter(a=>a.npcId===booth.definition.npcId&&s.activities?.[a.id]?.finished).length;
      const started=CAMPUS_ACTIVITIES.filter(a=>a.npcId===booth.definition.npcId&&s.activities?.[a.id]?.started).length;
      booth.outcomes.forEach((o,i)=>o.visible=i<booth.completed);
      booth.resultCards.forEach(card=>card.visible=!!s.activities?.[card.userData.activityId]?.finished);
      booth.supplies.forEach((o,i)=>o.visible=i>=Math.min(5,started+booth.completed));
      booth.group.userData.completedActivities=booth.completed;
    }
    carriedItems=[];
    for(const a of CAMPUS_ACTIVITIES){const e=s.activities?.[a.id];if(!e?.started||e.finished)continue;
      const remaining=a.steps.slice(e.steps?.length||0),done=a.steps.slice(0,e.steps?.length||0);
      for(const step of remaining)if(step.type==='deliver'&&step.item&&done.some(p=>p.item===step.item&&p.type==='interact')&&!done.some(p=>p.type==='deliver'&&p.item===step.item))carriedItems.push(step.item);
    }
    carriedItems=[...new Set(carriedItems)];carry.userData.items=[...carriedItems];
    for(const prop of pointProps){
      prop.current=prop.steps.filter(step=>{const e=s.activities?.[step.activityId];return e?.started&&!e.finished&&(e.steps?.length||0)===step.index;}).length;
      prop.completed=prop.steps.filter(step=>s.activities?.[step.activityId]?.steps?.includes(step.stepId)).length;
      prop.draft.visible=prop.current>0&&prop.completed===0;prop.finished.visible=prop.completed>0;
      prop.group.userData.currentSteps=prop.current;prop.group.userData.completedSteps=prop.completed;
    }
  }
  function animate(c,dt,time,player,cameraPosition,reducedMotion,near) {
    c.time+=dt;c.gestureTime=Math.max(0,c.gestureTime-dt);if(c.gestureTime===0)c.gesture=c.speed>.05?'walk':'idle';
    c.group.visible=near;const viewer=valid(cameraPosition)?cameraPosition:player,range=valid(player)?distance(player,c.group.position):Infinity;
    c.label.visible=near&&range<18*UNIT&&(!valid(viewer)||distance(viewer,c.group.position)>2*UNIT);
    if(!near)return;
    const blend=reducedMotion?1:1-Math.exp(-dt*13),walking=c.speed>.05,phase=c.time*(walking?7:1.4),stride=walking?Math.min(.48,c.speed*.34):0;
    c.body.position.y=c.baseY+(walking&&!reducedMotion?Math.abs(Math.sin(phase))*.018:0);
    const look=valid(player)&&range<8*UNIT?clamp(angle(Math.atan2(player.x-c.group.position.x,player.z-c.group.position.z)-c.group.rotation.y),-.65,.65):0;
    c.head.rotation.y+=(look-c.head.rotation.y)*blend;c.label.rotation.y=valid(viewer)?Math.atan2(viewer.x-c.group.position.x,viewer.z-c.group.position.z)-c.group.rotation.y:0;
    c.mouth.scale.y=c.gesture==='talk'&&!reducedMotion?1.2+Math.sin(time*12)*.4:1;
    c.legs.forEach((leg,i)=>{const swing=(i?-1:1)*Math.sin(phase)*stride;leg.hip.rotation.x+=(swing-leg.hip.rotation.x)*blend;leg.knee.rotation.x+=(Math.max(0,swing)*.75-leg.knee.rotation.x)*blend;});
    c.arms.forEach((arm,i)=>{let x=-Math.sin(phase)*(i?-1:1)*stride*.7,z=i?.06:-.06,elbow=-.1;
      if((c.id==='owen'||c.id==='iris')&&i===0){x=-.48;elbow=-.9;}
      if(i===1&&c.gesture==='wave'){x=-.2;z=2.45;elbow=-.4;}
      if(i===1&&c.gesture==='point'){x=-1.4;z=.12;}
      if(i===1&&c.gesture==='handoff'){x=-1.05;elbow=-.4;}
      if(i===1&&c.gesture==='talk'){x=-.35+(reducedMotion?0:Math.sin(time*4)*.1);elbow=-.45;}
      arm.shoulder.rotation.x+=(x-arm.shoulder.rotation.x)*blend;arm.shoulder.rotation.z+=(z-arm.shoulder.rotation.z)*blend;arm.elbow.rotation.x+=(elbow-arm.elbow.rotation.x)*blend;
    });
    if(c.group.userData.handoffObject)c.group.userData.handoffObject.visible=c.gesture==='handoff';c.group.userData.animationState=c.gesture;
  }
  function interact(id,action='talk') {
    const c=byId(id);if(!c)return;
    c.gesture=action==='wave'?'wave':/deliver|give|return|collect|handoff|finish/.test(action)?'handoff':/start|point|visit/.test(action)?'point':'talk';c.gestureTime=2.5;
    for(const other of characters)if(other!==c&&distance(other.group.position,c.group.position)<8*UNIT){other.gesture='talk';other.gestureTime=1.8;}
  }
  function reset() {
    clock=0;propsKey='';carry.visible=false;
    for(const c of characters){c.group.position.set(c.booth.host.x,c.booth.host.y,c.booth.host.z);c.path=[];c.pathIndex=0;c.goal=null;c.planned=-Infinity;c.speed=0;c.gesture='idle';c.gestureTime=0;c.arrived=true;c.waiting=0;}
    syncProps(state());
  }
  reset();
  return {
    update(dt,time,{player,cameraPosition,paused=false,reducedMotion=false,photoMode=false}={}) {
      if(disposed||paused)return;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);clock+=dt;time=Number.isFinite(time)?time:clock;const s=state();syncProps(s);
      for(const c of characters){
        if(dt>0&&!photoMode)move(c,goalFor(c,s),dt,player);
        const near=!valid(player)||distance(c.group.position,player)<48*UNIT;
        animate(c,photoMode?0:dt,time,player,cameraPosition,reducedMotion,near);
      }
      art.updateDistant(characters,player);
      for(const b of booths)b.group.visible=!valid(player)||distance(b.point,player)<100*UNIT;
      for(const prop of pointProps)prop.group.visible=(prop.current>0||prop.completed>0)&&(!valid(player)||distance(prop.point,player)<100*UNIT);
      carry.visible=carriedItems.length>0&&valid(player);if(carry.visible){const y=Number.isFinite(player.y)?player.y:floor(player);carry.visible=Number.isFinite(y);if(carry.visible)carry.position.set(player.x+.27*UNIT,y+1.06*UNIT,player.z+.20*UNIT);}
      frames++;
    },
    getCharacters(){return characters.map(c=>({id:c.id,name:c.definition.name,role:c.definition.role,color:c.definition.color,x:c.group.position.x,y:c.group.position.y,z:c.group.position.z,moving:c.speed>.05,gesture:c.gesture,atDestination:c.arrived}));},
    getObstacles(){return obstacles.map(o=>({...o}));},
    getAnchors(){return [...booths.map(b=>({id:'campus:stand:'+b.definition.id,npcId:b.definition.npcId,...b.point})),...characters.map(c=>({id:'npc:'+c.id,x:c.group.position.x,y:c.group.position.y,z:c.group.position.z})),...pointProps.map(p=>({id:'campus:prop:'+p.id,x:p.point.x,y:p.point.y,z:p.point.z,walkable:true,activityPointId:p.anchor.id}))];},
    interact,reset,dispose(){if(disposed)return;disposed=true;art.dispose();},
    get diagnostics(){return {frames,clock,carriedItems:[...carriedItems],booths:booths.map(b=>({id:b.definition.id,npcId:b.definition.npcId,completed:b.completed,resultCards:b.resultCards.filter(o=>o.visible).map(o=>o.userData.activityId),supplies:b.supplies.filter(o=>o.visible).length,visible:b.group.visible})),props:pointProps.map(p=>({id:p.id,kind:p.kind,pointId:p.anchor.id,current:p.current,completed:p.completed,visible:p.group.visible})),navigation:characters.map(c=>({id:c.id,blocked:c.blocked,speed:c.speed,pathIndex:c.pathIndex,pathLength:c.path.length,goal:c.goal,next:c.path[c.pathIndex]}))};},
  };
}
