import * as THREE from '/campus/vendor/three.module.js';
import {UNIT} from './content.mjs?v=20261102polish6';
import {NPC_DEFINITIONS,DISTRICT_POINTS} from './district-content.mjs?v=20261102polish6';
import {createDistrictArt} from './district-art.mjs?v=20261102polish6';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const offset=(p,x,z)=>({x:p.x+x*UNIT,z:p.z+z*UNIT});
const finals={maya:5,eli:5,nora:5,jun:4,sofia:3};
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);

// Visuals never award progress. They consume the saved authored state and move
// through the same collision controller as the player. Empty route data leaves
// a student at their last safe spot instead of cutting across a building.
export function createDistrict(scene,world,{getState=()=>({}),getRoute=()=>[]}={}) {
  const art=createDistrictArt(scene),characters=NPC_DEFINITIONS.map(definition=>({
    ...art.createStudent(definition),definition,path:[],pathIndex:0,routeGoal:null,lastPlan:-Infinity,
    speed:0,time:0,gesture:'idle',gestureTime:0,waveCooldown:0,wasNear:false,arrived:true,restoring:true,
  }));
  const characterById=id=>characters.find(c=>c.id===id);
  let disposed=false,clock=0,lastState=null,handoffTime=0,frame=0;
  const state=()=>{const value=getState()||{};return value.campusLife||value;};
  function safePoint(target,offsets=[[0,0]]) {
    for(const [dx,dz]of offsets){
      const p=offset(target,dx,dz),y=world.supportHeight?.(p.x,p.z)??world.groundHeight(p.x,p.z);
      if(!Number.isFinite(y))continue;
      const next=world.move({...p,y},{x:0,z:0},.30*UNIT);
      if(!next||distance(next,p)>.04*UNIT)continue;
      return {...p,y};
    }
    return null;
  }
  // Put the actual table beside the WSC arrival, keeping its reviewed route
  // endpoint open. Every tabletop corner must have usable, level support.
  const boothOffsets=[[3.2,.9],[-3.2,.9],[3.2,-1.4],[-3.2,-1.4],[0,3.3],[0,-3.3]];
  let boothPoint;
  for(const pair of boothOffsets){const candidate=safePoint(DISTRICT_POINTS.stand,[pair]);if(!candidate)continue;
    const corners=[[-1.45,-.61],[1.45,-.61],[-1.45,.61],[1.45,.61]];
    if(corners.every(([x,z])=>{const p=offset(candidate,x,z),y=world.groundHeight(p.x,p.z,candidate.y);return Number.isFinite(y)&&Math.abs(y-candidate.y)<.4*UNIT;})){boothPoint=candidate;break;}}
  boothPoint ||= safePoint(DISTRICT_POINTS.stand,boothOffsets)||{...offset(DISTRICT_POINTS.stand,3.2,.9),y:world.groundHeight(DISTRICT_POINTS.stand.x,DISTRICT_POINTS.stand.z)??1};
  const booth=art.createStand(boothPoint,boothPoint.y);
  const boardPoint=safePoint(boothPoint,[[-3.4,.9],[0,2.8],[3.4,.9]])||{...offset(boothPoint,-3.4,.9),y:boothPoint.y};
  const board=art.createPhotoBoard(boardPoint,boardPoint.y);
  const benchPoint=safePoint(DISTRICT_POINTS.stand,[[-2.7,1.8],[-2.7,-1.8]])||{...offset(DISTRICT_POINTS.stand,-2.7,1.8),y:world.groundHeight(DISTRICT_POINTS.stand.x,DISTRICT_POINTS.stand.z)??1};
  art.createBench(benchPoint,benchPoint.y);
  const pennants=DISTRICT_POINTS.pennants.map((p,index)=>{
    const spot=safePoint(p,[[1.9,1.0],[-1.9,1.0],[0,2.1]])||{...offset(p,1.9,1),y:world.groundHeight(p.x,p.z)??1};
    return {...art.createPennant(spot,spot.y,index),id:p.id,point:spot};
  });
  const gates=DISTRICT_POINTS.gates.map((p,index)=>{
    const gate=art.createGate(p,world.groundHeight(p.x,p.z)??1,index),previous=index?DISTRICT_POINTS.gates[index-1]:DISTRICT_POINTS.nora;
    gate.group.rotation.y=Math.atan2(p.x-previous.x,p.z-previous.z);return {...gate,id:p.id};
  });
  // Collision matches the visible table/board only; canopy, ropes and gate
  // openings stay walkable. The host stands beyond the table’s back edge.
  const obstacles=[-.91,0,.91].map(x=>({...offset(boothPoint,x,0),radius:.55*UNIT,id:'cookie-counter'}));
  for(const x of [-.58,0,.58])obstacles.push({...offset(boardPoint,x,0),radius:.16*UNIT,id:'photo-board'});
  const clearObstacles=(point,radius=.29*UNIT)=>obstacles.every(o=>distance(point,o)>=o.radius+radius);
  function basePoint(id,s) {
    if(id==='maya')return offset(boothPoint,0,-1.04);
    if(id==='eli')return offset(s.eli?.stage>=2?DISTRICT_POINTS.jkb:DISTRICT_POINTS.library,-1.2,-.7);
    if(id==='nora')return offset(DISTRICT_POINTS.nora,1.05,-.7);
    if(id==='jun')return s.jun?.stage>=3?offset(boothPoint,-.8,2.1):offset(s.jun?.stage>=1?DISTRICT_POINTS.music:DISTRICT_POINTS.arts,-1.1,-.7);
    return s.sofia?.stage>=2?offset(boardPoint,0,1.1):offset(DISTRICT_POINTS.moa,1.05,-.8);
  }
  function place(c,point) {
    const safe=safePoint(point,[[0,0],[.7,0],[-.7,0],[0,.7],[0,-.7]]);
    if(!safe)return false;c.group.position.set(safe.x,safe.y,safe.z);c.path=[];c.pathIndex=0;c.routeGoal=null;c.lastPlan=-Infinity;c.speed=0;c.arrived=true;return true;
  }
  function reset() {
    const s=state();clock=Number.isFinite(s.clock)?s.clock:0;
    for(const c of characters){place(c,basePoint(c.id,s));c.group.rotation.y=0;c.gesture='idle';c.gestureTime=0;c.restoring=true;c.wasNear=false;}
    lastState=null;syncProps(s);
  }
  function goalFor(c,s,player) {
    const id=c.id,stage=s[id]?.stage||0;
    if(id==='eli'&&stage===1&&validPoint(player)) {
      if(distance(player,DISTRICT_POINTS.jkb)<4*UNIT)return offset(DISTRICT_POINTS.jkb,-1.2,-.7);
      if(distance(player,c.group.position)>2.3*UNIT)return {x:player.x,z:player.z};
      return {x:c.group.position.x,z:c.group.position.z};
    }
    const base=basePoint(id,s);
    if(stage!==finals[id]||id==='maya'||id==='jun'||id==='sofia')return base;
    // Completed neighbors keep a small game-time routine. A quest is never
    // withheld for a real-world hour, and new conversations follow live actors.
    const phase=(clock+(id==='eli'?90:0))%720;
    const schedule=c.definition.schedule?.find(item=>phase<item.until),anchor=c.definition[schedule?.anchor||'work'];
    if(id==='eli'&&schedule?.anchor==='leisure')return benchPoint;
    return anchor?offset(anchor,id==='eli'?-1.2:1.05,-.7):base;
  }
  function plan(c,goal) {
    c.lastPlan=clock;c.routeGoal={x:goal.x,z:goal.z};c.path=[];c.pathIndex=0;
    if(distance(c.group.position,goal)<.40*UNIT)return;
    const route=getRoute(c.group.position,goal);
    if(!Array.isArray(route)||route.length>20000||route.some(p=>!validPoint(p)))return;
    c.path=route.map(p=>({x:p.x,z:p.z}));
  }
  function move(c,goal,dt,player,s) {
    const current=c.group.position,remaining=distance(current,goal);c.arrived=remaining<.65*UNIT;c.speed=0;
    c.blocked='';
    if(c.arrived)return;
    const following=c.id==='eli'&&s.eli?.stage===1;
    // Retain progress along a reviewed corridor. Reattaching to the nearest
    // graph node every few seconds can send a walker backwards at a junction.
    if(!c.routeGoal||!following&&distance(c.routeGoal,goal)>.85*UNIT||!c.path.length&&clock-c.lastPlan>1||c.pathIndex>=c.path.length&&distance(c.routeGoal,goal)>.40*UNIT)plan(c,goal);
    while(c.pathIndex<c.path.length&&distance(current,c.path[c.pathIndex])<.25*UNIT)c.pathIndex++;
    const waypoint=c.path[c.pathIndex];if(!waypoint){c.blocked='no-route';return;}
    const dx=waypoint.x-current.x,dz=waypoint.z-current.z,length=Math.hypot(dx,dz);if(length<1e-9)return;
    const active=s[c.id]?.stage>0&&s[c.id]?.stage<finals[c.id];
    const walking=active?2.6:1.15,travel=Math.min(length,walking*UNIT*dt);
    // A person briefly waits when another person occupies the next capsule.
    const desired={x:current.x+dx/length*travel,z:current.z+dz/length*travel};
    if(!clearObstacles(desired)||characters.some(other=>other!==c&&distance(other.group.position,desired)<.52*UNIT)){c.blocked='furniture-or-person';return;}
    if(validPoint(player)&&distance(player,desired)<.65*UNIT){c.blocked='player';return;}
    const next=world.move(current,{x:dx/length*travel,z:dz/length*travel},.29*UNIT,{grounded:true});
    const y=world.supportHeight?.(next.x,next.z,current.y)??world.groundHeight(next.x,next.z,current.y);
    if(!Number.isFinite(y)||!clearObstacles(next)||Math.abs(y-current.y)>.50*UNIT){c.blocked='support:'+((y-current.y)/UNIT).toFixed(3);return;}
    c.speed=distance(current,next)/(Math.max(dt,.001)*UNIT);current.set(next.x,y,next.z);
    if(c.speed>.03)c.group.rotation.y+=THREE.MathUtils.euclideanModulo(Math.atan2(dx,dz)-c.group.rotation.y+Math.PI,TAU)-Math.PI;
  }
  const TAU=Math.PI*2;
  function animate(c,dt,time,player,reducedMotion,near,cameraPosition) {
    c.time+=dt;c.gestureTime=Math.max(0,c.gestureTime-dt);c.waveCooldown=Math.max(0,c.waveCooldown-dt);
    const p=c.group.position,playerDistance=validPoint(player)?distance(player,p):Infinity;
    if(playerDistance<6*UNIT&&!c.wasNear&&c.waveCooldown<=0&&c.gestureTime<=0){c.gesture='wave';c.gestureTime=1.5;c.waveCooldown=28;c.wasNear=true;}
    if(playerDistance>10*UNIT)c.wasNear=false;
    if(c.gestureTime<=0)c.gesture=c.speed>.05?'walk':'idle';
    c.group.visible=near;
    const viewer=validPoint(cameraPosition)?cameraPosition:player;
    c.label.visible=near&&playerDistance<20*UNIT&&(!validPoint(viewer)||distance(viewer,p)>2*UNIT);
    if(!near){c.group.userData.animationState=c.gesture;return;}
    const blend=reducedMotion?1:1-Math.exp(-dt*13),walking=c.speed>.05,phase=c.time*(walking?7:1.4),stride=walking?Math.min(.48,c.speed*.34):0;
    const turn=validPoint(player)?THREE.MathUtils.euclideanModulo(Math.atan2(player.x-p.x,player.z-p.z)-c.group.rotation.y+Math.PI,TAU)-Math.PI:0;
    const looking=playerDistance<8*UNIT?clamp(turn,-.65,.65):0;
    c.head.rotation.y+=(looking-c.head.rotation.y)*blend;
    c.label.rotation.y=validPoint(viewer)?Math.atan2(viewer.x-p.x,viewer.z-p.z)-c.group.rotation.y:0;
    const waving=c.gesture==='wave',talking=c.gesture==='talk',pointing=c.gesture==='point',handoff=c.gesture==='handoff',sitting=c.gesture==='sit',playing=c.gesture==='play',tapping=c.gesture==='tap';
    c.body.position.y+=(c.baseY+(walking&&!reducedMotion?Math.abs(Math.sin(phase))*.018:0)-(sitting?.40:0)-c.body.position.y)*blend;
    c.torso.rotation.x+=((handoff?.12:0)-c.torso.rotation.x)*blend;
    c.head.rotation.z+=((talking&&!reducedMotion?Math.sin(time*3.7)*.04:0)-c.head.rotation.z)*blend;
    c.mouth.scale.y=talking&&!reducedMotion?1.2+Math.sin(time*12)*.5:1;
    c.legs.forEach((leg,index)=>{const swing=(index?-1:1)*Math.sin(phase)*stride;leg.hip.rotation.x+=((sitting?-1.45:swing)-leg.hip.rotation.x)*blend;leg.knee.rotation.x+=((sitting?1.4:Math.max(0,swing)*.75)-leg.knee.rotation.x)*blend;});
    c.arms.forEach((arm,index)=>{
      const carry=(c.id==='eli'||c.id==='jun')&&index===0;
      let x=carry?-.48:-Math.sin(phase)*(index?-1:1)*stride*.7,z=index?.06:-.06,elbow=carry?-.90:-.10;
      if(index===1&&waving){z=2.45;x=-.20+(reducedMotion?0:Math.sin(time*8)*.13);elbow=-.40;}
      if(index===1&&pointing){x=-1.45;z=.16;elbow=-.10;}
      if(index===1&&handoff){x=-1.05;z=.03;elbow=-.40;}
      if(talking&&!reducedMotion&&index===1){x=-.35+Math.sin(time*4)*.10;elbow=-.45;}
      if(playing){x=-1.05;elbow=index===0?-1.2:-.65+(reducedMotion?0:Math.sin(time*3.7)*.15);z=index===0?-.3:.5;}
      if(tapping&&index===1){x=-.75+(reducedMotion?0:Math.sin(time*3.7)*.08);elbow=-.45;}
      arm.shoulder.rotation.x+=(x-arm.shoulder.rotation.x)*blend;arm.shoulder.rotation.z+=(z-arm.shoulder.rotation.z)*blend;arm.elbow.rotation.x+=(elbow-arm.elbow.rotation.x)*blend;
    });
    if(c.group.userData.handoffObject)c.group.userData.handoffObject.visible=handoff;
    if(c.group.userData.instrument){c.group.userData.instrument.visible=playing;c.group.userData.bow.visible=playing;c.group.userData.musicCase.visible=!playing;}
    c.group.userData.animationState=sitting?'sit':c.gesture;
  }
  function syncProps(s) {
    const cookie=s.maya?.cookie,placed=s.maya?.pennants||[],cards=s.maya?.cards||[],photos=s.sofia?.photos||[];
    booth.cookies.count=cookie?11:12;booth.chips.count=(cookie?11:12)*4;
    booth.bunting.visible=placed.length===DISTRICT_POINTS.pennants.length;
    booth.thanks.visible=s.maya?.stage>=5;
    booth.cards.forEach((object,index)=>object.visible=!cards.includes(['eli','jun','sofia'][index]));
    pennants.forEach(p=>{p.group.visible=true;p.flag.visible=placed.includes(p.id);});
    board.photos.forEach((object,index)=>object.visible=s.sofia?.stage>=3&&photos.includes(['library','arts'][index]));
    const practice=s.nora?.stage===2||s.nora?.stage===4,index=s.nora?.stage===4?s.nora.masteryGate:s.nora?.gate;
    gates.forEach((gate,i)=>{gate.group.visible=practice;gate.number.material.color.set(i===index?'#ffffff':'#a4b5a8');});
    art.root.userData.cookieCount=booth.cookies.count;art.root.userData.photoCount=board.photos.filter(p=>p.visible).length;art.root.userData.pennantCount=placed.length;
    lastState=JSON.stringify([cookie,placed,cards,photos,s.maya?.stage,s.sofia?.stage,s.nora?.stage,s.nora?.gate,s.nora?.masteryGate]);
  }
  function interact(id,action='talk') {
    const c=characterById(id);if(!c)return;
    const handoff=/handoff|cookie|card|give|return|thank/.test(action),pointing=/point|start|escort|gate|practice|invite/.test(action);
    c.gesture=action==='sit'?'sit':action==='play'?'play':handoff?'handoff':pointing?'point':'talk';c.gestureTime=handoff?1.8:2.5;
    if(id==='maya'&&/cookie/.test(action)){handoffTime=1.2;booth.handoff.visible=true;}
    // A nearby friend reacts once to a handoff or invitation.
    if(handoff||/invite|gather/.test(action))for(const other of characters)if(other!==c&&distance(other.group.position,c.group.position)<9*UNIT){other.gesture='talk';other.gestureTime=1.6;}
  }
  reset();
  return {update(dt,elapsed,{player,cameraPosition,riding=false,speed=0,braking=false,stumble=null,paused=false,reducedMotion=false,photoMode=false}={}) {
    if(disposed||paused)return;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);if(!Number.isFinite(elapsed))elapsed=clock;
    const s=state();clock=Number.isFinite(s.clock)?s.clock:clock+dt;
    const propsKey=JSON.stringify([s.maya?.cookie,s.maya?.pennants||[],s.maya?.cards||[],s.sofia?.photos||[],s.maya?.stage,s.sofia?.stage,s.nora?.stage,s.nora?.gate,s.nora?.masteryGate]);
    if(propsKey!==lastState)syncProps(s);
    handoffTime=Math.max(0,handoffTime-dt);booth.handoff.visible=handoffTime>0;
    for(let index=0;index<characters.length;index++) {
      const c=characters[index];
      if(c.restoring){if(c.id==='eli'&&s.eli?.stage===1&&validPoint(player)){const resume=safePoint(player,[[1.5,0],[-1.5,0],[0,-1.5]]);if(resume&&clearObstacles(resume))place(c,resume);}c.restoring=false;}
      const goal=goalFor(c,s,player);if(dt>0&&!photoMode)move(c,goal,dt,player,s);
      if(c.id==='nora'&&stumble&&validPoint(player)&&distance(c.group.position,player)<12*UNIT&&c.waveCooldown<=0){c.gesture='point';c.gestureTime=2;c.waveCooldown=20;}
      // Final gathering acknowledges Jun’s arrival with a gentle conversation,
      // independent of whether audio is enabled.
      if(c.id==='jun'&&s.jun?.stage>=3&&c.arrived&&c.gestureTime<=0){c.gesture=s.jun.stage>=4?'play':'talk';c.gestureTime=3;}
      if(c.id==='maya'&&s.jun?.stage>=4&&c.gestureTime<=0&&distance(characterById('jun').group.position,c.group.position)<6*UNIT){c.gesture='tap';c.gestureTime=3;}
      if(c.id==='eli'&&s.eli?.stage>=5&&distance(c.group.position,benchPoint)<.65*UNIT&&c.gestureTime<=0){c.gesture='sit';c.gestureTime=5;c.group.rotation.y=0;}
      const near=!validPoint(player)||distance(c.group.position,player)<48*UNIT;
      animate(c,photoMode?0:dt,elapsed,player,reducedMotion,near,cameraPosition);
    }
    art.updateDistant(characters,player);frame++;
    void riding;void speed;void braking;
  },getCharacters(){return characters.map(c=>({id:c.id,name:c.definition.name,role:c.definition.role,color:c.definition.color,x:c.group.position.x,y:c.group.position.y,z:c.group.position.z,moving:c.speed>.05,gesture:c.gesture,atDestination:c.arrived}));},
  interact,getObstacles(){return obstacles.map(o=>({...o}));},
  getAnchors(){return [{id:'district:stand',...boothPoint},{id:'district:board',...boardPoint},{id:'district:bench',...benchPoint},...characters.map(c=>({id:'npc:'+c.id,x:c.group.position.x,z:c.group.position.z})),...pennants.map(p=>({id:'pennant:'+p.id,...p.point}))];},
  reset,dispose(){if(disposed)return;disposed=true;art.dispose();},
    get diagnostics(){return {frames:frame,clock,cookies:booth.cookies.count,photos:board.photos.filter(p=>p.visible).length,pennants:pennants.filter(p=>p.flag.visible).length,navigation:characters.map(c=>({id:c.id,blocked:c.blocked,speed:c.speed,pathIndex:c.pathIndex,pathLength:c.path.length,goal:c.routeGoal,next:c.path[c.pathIndex]}))};},
  };
}
