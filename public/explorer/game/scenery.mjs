import * as THREE from '/campus/vendor/three.module.js';
import {UNIT,SPAWN,LOCATIONS,SECRETS} from './content.mjs?v=20261102polish6';

const WALKER_MOTION_RANGE = 48 * UNIT;
const WALKER_VISIBLE_RANGE = 150 * UNIT;

// Small instanced additions give the human-height routes a sense of life. They
// are fictional garden/game objects, independent of the shared campus model.
export function createScenery(scene,world) {
  const root=new THREE.Group();root.name='Explorer gardens and campus life';scene.add(root);
  const geometries=new Set(),materials=new Set(),textures=new Set(),batches=[],lamps=[],sparks=[],birds=[];
  const material=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88,...extra});materials.add(m);return m;};
  const mesh=(geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{geometries.add(geo);const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);root.add(m);return m;};
  const stone=material('#c2b798'),soil=material('#665b45'),leaf=material('#47765e'),flower=material('#e3b884'),metal=material('#34565b'),glass=material('#fff0bd',{emissive:'#ffc978',emissiveIntensity:.3}),paper=material('#fbecd0',{emissive:'#e4b766',emissiveIntensity:.08});
  const box=new THREE.BoxGeometry(UNIT,UNIT,UNIT),sphere=new THREE.IcosahedronGeometry(UNIT,1),pole=new THREE.CylinderGeometry(.045*UNIT,.06*UNIT,UNIT,7),lampOrb=new THREE.SphereGeometry(.19*UNIT,10,7);
  const safe=(x,z)=>{const y=world.groundHeight(x,z);if(y===null)return null;const moved=world.move({x,y,z},{x:0,z:0},.9*UNIT);return Math.hypot(moved.x-x,moved.z-z)<.005?y:null;};
  const planters=[],stems=[],petals=[];
  for(const [i,location] of LOCATIONS.entries()){
    for(const sign of [-1,1]){
      const x=location.x+sign*3.6*UNIT,z=location.z+2.8*UNIT,y=safe(x,z);if(y===null)continue;
      planters.push({x,y:y+.24*UNIT,z});
      for(let n=0;n<5;n++){const angle=n*2.4+i,px=x+Math.cos(angle)*.32*UNIT,pz=z+Math.sin(angle)*.26*UNIT;stems.push({x:px,y:y+.63*UNIT,z:pz});petals.push({x:px,y:y+(.92+n%2*.12)*UNIT,z:pz});}
    }
    if(i%2===0){const x=location.x-2.4*UNIT,z=location.z-3.3*UNIT,y=safe(x,z);if(y===null)continue;lamps.push({x,y,z});}
  }
  function createBatch(geo,mat,count){
    geometries.add(geo);
    const batch=new THREE.InstancedMesh(geo,mat,count);
    batches.push(batch);
    root.add(batch);
    return batch;
  }
  const dummy=new THREE.Object3D();
  function instance(geo,mat,points,scale,height=0){
    const batch=createBatch(geo,mat,points.length);
    points.forEach((p,i)=>{
      dummy.position.set(p.x,p.y+height*UNIT,p.z);dummy.scale.set(...scale);
      dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);
    });
    return batch;
  }
  instance(box,stone,planters,[1.1,.48,.9]);instance(box,soil,planters.map(p=>({...p,y:p.y+.25*UNIT})),[.96,.035,.76]);instance(sphere,leaf,stems,[.38,.38,.35]);instance(sphere,flower,petals,[.13,.13,.13]);
  instance(pole,metal,lamps,[1,3.3,1],1.65).name='Lamp poles';
  instance(box,metal,lamps,[.55,.12,.55],3.3).name='Lamp caps';
  instance(lampOrb,glass,lamps,[1,1,1],3.12).name='Lamp bulbs';
  // Departure board, warm wood and a locally drawn illustrated map.
  const boardPoint={x:SPAWN.x+.12,z:SPAWN.z+.02},boardY=world.groundHeight(boardPoint.x,boardPoint.z)??1;
  mesh(box,metal,boardPoint.x-.4*UNIT,boardY+.9*UNIT,boardPoint.z,.08,1.8,.08);mesh(box,metal,boardPoint.x+.4*UNIT,boardY+.9*UNIT,boardPoint.z,.08,1.8,.08);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f7edcf';ctx.fillRect(0,0,768,512);ctx.strokeStyle='#395c52';ctx.lineWidth=8;ctx.strokeRect(14,14,740,484);ctx.fillStyle='#2c5148';ctx.font='bold 39px Georgia';ctx.fillText('CAMPUS MAP',55,85);
  ctx.strokeStyle='#d6c190';ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(90,395);ctx.bezierCurveTo(160,150,530,460,650,195);ctx.stroke();
  for(let i=0;i<4;i++){const x=120+i*158,y=290+Math.sin(i*2)*60;ctx.fillStyle=['#488576','#c58b4d','#8d79a5','#5e87ad'][i];ctx.beginPath();ctx.arc(x,y,27,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff6e1';ctx.font='bold 25px Arial';ctx.fillText(String(i+1),x-7,y+8);}
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;textures.add(tex);const boardMat=material('#ffffff',{map:tex,side:THREE.DoubleSide});mesh(new THREE.PlaneGeometry(1.35*UNIT,.9*UNIT),boardMat,boardPoint.x,boardY+1.55*UNIT,boardPoint.z).rotation.y=Math.PI;
  // Each secret gets an identifiable little object instead of the same cube.
  for(const [i,secret] of SECRETS.entries()){
    const y=world.groundHeight(secret.x,secret.z)??1;
    if(secret.id==='confident-duck'){const yellow=material('#e8c965'),orange=material('#cd8c4c');mesh(sphere,yellow,secret.x,y+.22*UNIT,secret.z,.28,.23,.4);mesh(sphere,yellow,secret.x,y+.47*UNIT,secret.z+.15*UNIT,.16,.16,.16);mesh(box,orange,secret.x,y+.44*UNIT,secret.z+.34*UNIT,.16,.065,.16);}
    else if(secret.id==='paper-plane'){const plane=mesh(new THREE.ConeGeometry(.22*UNIT,.7*UNIT,3),paper,secret.x,y+1.1*UNIT,secret.z);plane.rotation.x=Math.PI/2;birds.push({mesh:plane,x:secret.x,y:y+1.1*UNIT,z:secret.z,plane:true});}
    else if(secret.id==='tiny-campus'){mesh(box,stone,secret.x,y+.5*UNIT,secret.z,1.2,.1,1);for(let j=0;j<5;j++)mesh(box,paper,secret.x+(j%3-.8)*.3*UNIT,y+(.6+j%2*.13)*UNIT,secret.z+(j%2-.5)*.28*UNIT,.22,.2+j%2*.25,.22);}
    else if(secret.id==='wrong-way'){mesh(pole,metal,secret.x+.02,y+.6*UNIT,secret.z,1,1.2,1);const sign=mesh(box,flower,secret.x+.02,y+1.3*UNIT,secret.z,.8,.25,.06);sign.rotation.z=.18;}
    else if(i%3===0){const flag=mesh(new THREE.PlaneGeometry(.45*UNIT,.32*UNIT),paper,secret.x,y+.75*UNIT,secret.z);flag.material.side=THREE.DoubleSide;flag.rotation.z=.15;}
  }
  // Ambient walkers have no quest state. Keep their last grounded pose when
  // outside walking range, and leave empty or far-away instances out of draws.
  const clothesColors=['#537f77','#b27357','#81719c','#687f9c'].map(color=>new THREE.Color(color));
  const walkers=LOCATIONS.filter((_,i)=>i%3===0).map((p,i)=>{
    const x=p.x+1.3*UNIT,z=p.z-1.2*UNIT;
    return {x,y:world.groundHeight(x,z)??world.groundHeight(p.x,p.z)??1,z,angle:i*1.8,time:i,origin:p,color:clothesColors[i%clothesColors.length]};
  });
  const skin=material('#bd8c67'),clothes=material('#627d92'),pants=material('#344953');
  const head=createBatch(sphere,skin,walkers.length),body=createBatch(box,clothes,walkers.length),legs=createBatch(box,pants,2*walkers.length);
  const people=[head,body,legs];
  for(const batch of people){
    batch.name='Ambient walkers';
    batch.frustumCulled=false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  function poseWalker(batch,index,w,side,height,step,sx,sy,sz){
    dummy.position.set(w.x+side*UNIT,w.y+height*UNIT,w.z+step*UNIT);
    dummy.rotation.y=w.angle;
    dummy.scale.set(sx,sy,sz);
    dummy.updateMatrix();
    batch.setMatrixAt(index,dummy.matrix);
  }
  function updateWalkers(dt,player,reducedMotion){
    const hasPlayer=Number.isFinite(player?.x)&&Number.isFinite(player?.z);
    let count=0;
    for(const w of walkers){
      const range=hasPlayer?Math.hypot(w.x-player.x,w.z-player.z):0;
      if(range>WALKER_VISIBLE_RANGE)continue;
      const walking=range<WALKER_MOTION_RANGE;
      if(walking&&dt>0){
        w.time+=dt;
        if(Math.hypot(w.x-w.origin.x,w.z-w.origin.z)>2.4*UNIT)w.angle+=Math.PI*.85;
        const p=world.move(w,{x:Math.sin(w.angle)*.65*UNIT*dt,z:Math.cos(w.angle)*.65*UNIT*dt},.3*UNIT);
        if(Math.hypot(p.x-w.x,p.z-w.z)<.05*UNIT*dt)w.angle+=dt*3;
        w.x=p.x;w.z=p.z;w.y=world.groundHeight(w.x,w.z)??w.y;
      }
      const step=walking&&!reducedMotion?Math.sin(w.time*5)*.09:0;
      poseWalker(head,count,w,0,1.53,0,.18,.23,.18);
      poseWalker(body,count,w,0,1.05,0,.42,.5,.26);
      poseWalker(legs,2*count,w,-.12,.43,step,.13,.67,.15);
      poseWalker(legs,2*count+1,w,.12,.43,-step,.13,.67,.15);
      body.setColorAt(count,w.color);
      count++;
    }
    head.count=body.count=count;
    legs.count=2*count;
    for(const batch of people){
      batch.visible=count>0;
      if(count)batch.instanceMatrix.needsUpdate=true;
    }
    if(count)body.instanceColor.needsUpdate=true;
  }
  updateWalkers(0,SPAWN,false);
  const points=new Float32Array(72*3);for(let i=0;i<72;i++){const p=LOCATIONS[i%LOCATIONS.length];points[i*3]=p.x+(Math.sin(i*37)*2)*UNIT;points[i*3+1]=(world.groundHeight(p.x,p.z)??1)+(.5+i%9*.12)*UNIT;points[i*3+2]=p.z+(Math.cos(i*19)*2)*UNIT;sparks.push([...points.slice(i*3,i*3+3)]);}
  const sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.BufferAttribute(points,3));geometries.add(sparkGeo);const sparkMat=new THREE.PointsMaterial({color:'#ffe3a5',size:.055*UNIT,transparent:true,opacity:.55,depthWrite:false,sizeAttenuation:true});materials.add(sparkMat);const fireflies=new THREE.Points(sparkGeo,sparkMat);root.add(fireflies);
  return {boardPoint,update(dt,time,{night=false,reducedMotion=false,player}={}){
    glass.emissiveIntensity=night?2:.2;fireflies.visible=night&&!reducedMotion;
    if(fireflies.visible){for(let i=0;i<sparks.length;i++)points[i*3+1]=sparks[i][1]+Math.sin(time*.8+i)*.16*UNIT;sparkGeo.attributes.position.needsUpdate=true;}
    for(const bird of birds)if(!reducedMotion){bird.mesh.position.y=bird.y+Math.sin(time+bird.x)*.12*UNIT;bird.mesh.rotation.z=Math.sin(time*.5)*.1;}
    updateWalkers(dt,player,reducedMotion);
  },dispose(){for(const batch of batches)batch.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();root.removeFromParent();}};
}
