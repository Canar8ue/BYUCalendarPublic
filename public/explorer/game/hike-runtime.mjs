import * as THREE from '/campus/vendor/three.module.js';
import {createPlayer,createScooter} from './actors.mjs?v=20261102polish6';
import {UNIT} from './content.mjs?v=20261102polish6';
import {createHikeUI} from './hike-ui.mjs?v=20261102polish6';
import {validateHikeState,applyHikeAction,completedHikeRewards,hikeStatus,buildHikeActivities} from './hike-state.mjs?v=20261102polish6';

// Owns physical evidence and the lifetime of optional mountain content. The
// campus checkpoint never receives coordinates from a streamed hiking tile.
export function createHikeRuntime({scene,world,getProgress,getPlayer,pause,resume,placePlayer,returnToCampus,persist,reward,toast,openPhoto}={}) {
  let disposed=false,generation=0,loading=false,zone=null,art=null,checkClock=0;
  let lastPlayer=null,walked=0,fromCheckpoint=null,companionTrail=[],companionAnchor=null;
  const progress=()=>getProgress();
  const state=()=>progress().hike;
  const route=()=>zone?.data||null;
  const active=()=>!!zone;
  const ui=createHikeUI({getState:state,getRoute:route,getActive:active,onAction:handleAction,onOpenChange:open=>{if(open)pause();else if(!loading&&!disposed)resume();}});
  const physical=(extra={})=>({...getPlayer(),fromCheckpoint,walkedMeters:walked,routeLoaded:!!zone,...extra});

  function apply(action,extra={}) {
    if(disposed||!zone)return {changed:false};
    const result=applyHikeAction(state(),action,physical(extra),route());
    if(result.changed){
      if(action.startsWith('visit:')||action.startsWith('checkpoint:')){walked=0;fromCheckpoint=action.slice(action.indexOf(':')+1);}
      for(const item of result.rewards||[])reward(item);persist();
    }
    return result;
  }
  function clearArt(){art?.dispose();art=null;}
  function placeCompanion(point,heading=0){
    if(!art)return;
    const x=point.x-Math.cos(heading)*.55*UNIT,z=point.z+Math.sin(heading)*.55*UNIT;
    art.caleb.group.position.set(x,world.supportHeight(x,z,point.y)??point.y,z);
    companionTrail=[{x:point.x,y:point.y,z:point.z}];companionAnchor={x:point.x,z:point.z};
  }
  function leave({notify=true}={}) {
    if(zone)apply('leave-hike');
    generation++;loading=false;zone=null;clearArt();world.unloadHike();
    lastPlayer=null;walked=0;companionTrail=[];companionAnchor=null;ui.close();returnToCampus();
    if(notify)toast('Back on campus');
  }
  async function travel(id='trailhead') {
    const token=++generation;loading=true;ui.setLoading('Preparing the Y trail…');pause();
    try{
      const loaded=await world.loadHike((message)=>{if(!disposed&&token===generation)ui.setLoading(message);});
      if(disposed||token!==generation)return;
      zone=loaded;
      progress().hike=validateHikeState(state(),route());
      const checkpoints=zone.checkpoints;
      const unlocked=state().reached||[];
      const point=checkpoints.find(p=>p.id===id&&(id==='trailhead'||unlocked.includes(id)))||checkpoints[0];
      if(!point)throw new Error('The hiking route has no trailhead.');
      clearArt();art=createHikeArt(scene,zone);
      const ahead=zone.route[Math.min(zone.route.length-1,(point.pointIndex||0)+6)];
      const heading=point.id===checkpoints.at(-1).id?-Math.PI/2:Math.atan2(ahead.x-point.x,ahead.z-point.z);
      placePlayer({...point,heading});lastPlayer=null;walked=0;fromCheckpoint=point.id;
      placeCompanion(point,heading);
      apply('start');
      if(point.id!=='trailhead')apply('resume:'+point.id);
      for(const item of completedHikeRewards(state()))reward(item);
      persist();loading=false;ui.close();resume();
      toast(point.id==='trailhead'?'Y Trailhead':'Hike resumed',point.id==='trailhead'?'Continue on foot.':point.name);
    }catch(error){
      if(disposed||token!==generation)return;
      zone=null;clearArt();world.unloadHike();loading=false;returnToCampus();pause();
      ui.setError('The trail could not load.');
      console.warn('Hiking terrain:',error);
    }
  }
  function handleAction(name) {
    if(disposed)return;
    if(name==='close'){if(loading)leave({notify:false});else ui.close();resume();return;}
    if(name==='travel-trailhead'||name==='retry'){void travel();return;}
    if(name.startsWith('resume:')){void travel(name.slice(7));return;}
    if(name==='leave-hike'){if(zone)apply(name);leave();resume();return;}
    if(name==='journal'){ui.openJournal();return;}
    if(name==='take-photo'||name.startsWith('photo:')){ui.close();resume();openPhoto();return;}
    if(loading||!zone)return;
    const result=apply(name);
    if(result.changed&&name==='companion:on')placeCompanion(getPlayer().position);
    if(result.message)toast('The Y trail',result.message);
    ui.openJournal();
  }
  function targets(){
    if(!zone)return [];
    const activities=buildHikeActivities(route());
    const s=state();
    return [
      ...zone.checkpoints.map(p=>({...p,action:'checkpoint',label:p.id==='trailhead'?'Talk to Caleb at the trailhead':'Talk to Caleb'})),
      ...(activities.cleanup||[]).filter(p=>!(s.cleanup||[]).includes(p.id)).map(p=>({...p,action:'cleanup:'+p.id,label:'Pick up litter'})),
      ...(activities.photos||[]).map(p=>({...p,action:'photo:'+p.id,label:'Frame '+p.name})),
    ];
  }
  function interact(point){
    if(!zone)return;
    if(point.action==='checkpoint'){apply('visit:'+point.id);ui.openCheckpoint(point.id);return;}
    if(point.action?.startsWith('photo:')){openPhoto();return;}
    const result=apply(point.action);
    if(result.message)toast('Trail care',result.message);
  }
  function update(dt,{position,cameraPosition,grounded,riding,photoMode=false,reducedMotion=false,enabled=true}={}) {
    if(!zone||disposed)return;
    const walking=enabled&&grounded&&!riding&&!photoMode;
    if(lastPlayer&&walking)walked+=Math.min(1.5,Math.hypot(position.x-lastPlayer.x,position.z-lastPlayer.z)/UNIT);
    lastPlayer=walking?{x:position.x,z:position.z}:null;
    if(enabled&&grounded&&!riding){
      checkClock+=dt;
      if(checkClock>.18){checkClock=0;
        for(const p of zone.checkpoints)if(Math.hypot(p.x-position.x,p.z-position.z)<2.7*UNIT){
          const result=apply('visit:'+p.id,{walkedMeters:walked});
          if(result.changed)toast(p.name,'Checkpoint saved');
        }
        const last=zone.checkpoints.at(-1);
        if(last&&Math.hypot(last.x-position.x,last.z-position.z)<2.7*UNIT){const result=apply('summit');if(result.changed)toast('Top of the Y','Follow the checkpoints back down.');}
      }
    }
    if(art){
      art.group.visible=!photoMode;
      art.sync(state());
      const actor=art.caleb;
      actor.group.visible=state().companion!==false&&!photoMode;
      // A consumed breadcrumb path follows the player's actual on-foot turns,
      // including the lower-Y spurs whose distances start at their own joins.
      if(walking&&(!companionAnchor||Math.hypot(position.x-companionAnchor.x,position.z-companionAnchor.z)>.6*UNIT)){
        companionTrail.push({x:position.x,y:position.y,z:position.z});companionAnchor={x:position.x,z:position.z};
        if(companionTrail.length>6000)companionTrail.splice(0,companionTrail.length-6000);
      }
      const p=actor.group.position,separation=Math.hypot(position.x-p.x,position.z-p.z)/UNIT;
      const pace=separation>20?5.8:separation>8?4:2.5;
      let moving=0;
      if(enabled&&!photoMode&&state().companion!==false&&separation>2.5){
        while(companionTrail.length&&Math.hypot(companionTrail[0].x-p.x,companionTrail[0].z-p.z)<.25*UNIT)companionTrail.shift();
        const goal=companionTrail[0];
        if(goal){const dx=goal.x-p.x,dz=goal.z-p.z,length=Math.hypot(dx,dz),step=Math.min(length,pace*UNIT*dt);
          const next=world.move(p,{x:dx/(length||1)*step,z:dz/(length||1)*step},.24*UNIT,{grounded:true});
          moving=Math.hypot(next.x-p.x,next.z-p.z)/(UNIT*Math.max(.001,dt));
          p.set(next.x,world.supportHeight(next.x,next.z,next.y)??next.y,next.z);actor.group.rotation.y=Math.atan2(dx,dz);
        }
      }else actor.group.rotation.y=Math.atan2(position.x-p.x,position.z-p.z);
      actor.update(reducedMotion?0:dt,{speed:moving,grounded:true,running:moving>3.4,emote:!moving&&separation<6});
      art.updateHints(position,progress().settings.routeHints!==false&&!photoMode,cameraPosition);
    }
  }
  function preparePhoto(camera){
    if(!zone)return null;
    const snapshot=physical(),token=generation;
    if(!snapshot.grounded||snapshot.riding)return null;
    const p=snapshot.position;
    const view=camera.getWorldDirection(new THREE.Vector3());
    const point=(buildHikeActivities(route()).photos||[]).find(photo=>{
      if(Math.hypot(p.x-photo.x,p.z-photo.z)>4*UNIT)return false;
      // Viewpoints face the valley west of the sourced trail, away from its
      // uphill face. Capturing still works at any angle; stamps need this view.
      return view.x<-.2;
    });
    if(!point)return null;
    return ()=>{if(!disposed&&generation===token&&zone){const result=apply('photo:'+point.id,{...snapshot,photoCaptured:true});if(result.changed)toast('Trail photo saved',result.message||point.name);}};
  }
  return {
    get active(){return !!zone;},get loading(){return loading;},get isOpen(){return ui.isOpen;},
    open(){if(zone)ui.openJournal();else ui.openTrailhead({atTrailhead:false});},
    close(){ui.close();},travel,leave,targets,interact,update,preparePhoto,
    get points(){return zone?.checkpoints||[];},
    target(){return zone?hikeStatus(state(),route()).target:null;},
    status(){return zone?hikeStatus(state(),route()):{title:'The Y trail',text:'Open The Y hike to travel to the trailhead.',value:0,total:1};},
    recover(){const id=state().lastCheckpoint||'trailhead';const point=zone?.checkpoints.find(p=>p.id===id)||zone?.checkpoints[0];if(point){placePlayer(point);lastPlayer=null;walked=0;fromCheckpoint=point.id;placeCompanion(point);}},
    reset(){leave({notify:false});},
    dispose(){if(disposed)return;disposed=true;generation++;loading=false;clearArt();ui.dispose();zone=null;},
    get snapshot(){return {active:!!zone,loading,revision:route()?.revision,checkpoint:state()?.lastCheckpoint,stats:zone?.stats,state:state()};},
  };
}

export function routePoint(points,distance){
  let lo=0,hi=points.length-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].distanceMeters<distance)lo=m;else hi=m;}
  const a=points[lo],b=points[hi],t=Math.max(0,Math.min(1,(distance-a.distanceMeters)/(b.distanceMeters-a.distanceMeters||1)));
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
}

function createHikeArt(scene,zone){
  const group=new THREE.Group();group.name='The Y hike · fictional trail companion and props';scene.add(group);
  const materials=[],geometries=[],textures=[];
  const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.95});materials.push(m);return m;};
  const timber=material('#69533d'),paper=material('#faf2d9');
  const box=(w,h,d,mat,x,y,z)=>{const g=new THREE.BoxGeometry(w*UNIT,h*UNIT,d*UNIT);geometries.push(g);const mesh=new THREE.Mesh(g,mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;};
  const labels=[];
  for(const p of zone.checkpoints){
    // Turn positions come from mapped bends. Numbering is game wayfinding,
    // with no claim that a present-day physical sign was surveyed.
    const index=Math.min(zone.route.length-2,p.pointIndex||0),a=zone.route[index],b=zone.route[index+1];
    const length=Math.hypot(b.x-a.x,b.z-a.z)||1,offset=(['trailhead','summit'].includes(p.id)?1.7:.95)*UNIT;
    const signX=p.x-(b.z-a.z)/length*offset,signZ=p.z+(b.x-a.x)/length*offset;
    const signY=zone.terrainHeight?.(signX,signZ)??p.y;
    box(.09,.85,.09,timber,signX,signY+.425*UNIT,signZ);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f5edd6';ctx.fillRect(0,0,256,128);ctx.fillStyle='#31584d';ctx.textAlign='center';ctx.font='bold 25px sans-serif';ctx.fillText(p.id==='trailhead'?'THE Y TRAIL':p.name,128,49,240);ctx.font='16px sans-serif';ctx.fillText('GAME WAYPOINT',128,81);ctx.fillText('CALeb’s trail notes'.toUpperCase(),128,108);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);
    const m=new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide});materials.push(m);
    const g=new THREE.PlaneGeometry(1.1*UNIT,.55*UNIT);geometries.push(g);
    const label=new THREE.Mesh(g,m);label.position.set(signX,signY+1.08*UNIT,signZ);group.add(label);labels.push(label);
  }
  const activities=buildHikeActivities(zone.data),litter=[];
  for(const p of activities.cleanup||[])litter.push({id:p.id,mesh:box(.16,.08,.24,paper,p.x,p.y+.07*UNIT,p.z)});
  const caleb=createPlayer(group);caleb.setStyle({level:1,jacket:'#657950',backpack:'#c6864a'});
  const parked=createScooter(group),head=zone.checkpoints[0];parked.setStyle({level:1,color:'#427a92'});parked.group.position.set(head.x-.65*UNIT,head.y,head.z);parked.group.rotation.y=.8;
  // Reuse one geometry/material for the near-player route trail.
  const hintGeo=new THREE.RingGeometry(.05*UNIT,.1*UNIT,8);geometries.push(hintGeo);
  const hintMat=material('#f5d98f');hintMat.side=THREE.DoubleSide;
  const hints=new THREE.InstancedMesh(hintGeo,hintMat,30),dummy=new THREE.Object3D();hints.count=0;hints.frustumCulled=false;group.add(hints);
  return {group,caleb,sync(state){for(const p of litter)p.mesh.visible=!(state.cleanup||[]).includes(p.id);},
    updateHints(position,visible,cameraPosition){
      const viewer=cameraPosition||position;
      for(const label of labels){label.rotation.y=Math.atan2(viewer.x-label.position.x,viewer.z-label.position.z);label.visible=Math.hypot(position.x-label.position.x,position.z-label.position.z)>2.5*UNIT;}
      hints.count=0;if(!visible)return;
      const nearest=zone.nearestRoute(position.x,position.z),distance=nearest?.distanceMeters||0;
      const path=zone.routes?.find(path=>path.id===nearest?.routeId)?.points||zone.route;
      for(let i=-6;i<24;i++){const d=distance+i*1.4;if(d<0||d>path.at(-1).distanceMeters)continue;const p=routePoint(path,d);dummy.position.set(p.x,(zone.terrainHeight?.(p.x,p.z)??p.y)+.025*UNIT,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.updateMatrix();hints.setMatrixAt(hints.count++,dummy.matrix);}hints.instanceMatrix.needsUpdate=true;
    },
    dispose(){caleb.dispose();parked.dispose();group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();},
  };
}
