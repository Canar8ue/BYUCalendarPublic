import * as THREE from '/campus/vendor/three.module.js';

// Original, locally authored campus-life art. All submodels use meters; their
// foot-level root receives the campus presentation scale exactly once.
const UNIT = .044571444392204285;
const TAU = Math.PI * 2;
const DISTANT_STUDENT_RANGE = 150 * UNIT;
const PALETTES = {
  maya: {shirt:'#f1eddf', coat:'#264e83', pants:'#264364', skin:'#9d6249', hair:'#322827', accent:'#e5b95e'},
  eli: {shirt:'#e8b76a', coat:'#e8b76a', pants:'#697970', skin:'#dfab7f', hair:'#634832', accent:'#f4e8cc'},
  nora: {shirt:'#343e49', coat:'#437e7a', pants:'#315855', skin:'#bd835d', hair:'#302d31', accent:'#d8a459'},
  jun: {shirt:'#efe1cb', coat:'#83729e', pants:'#383b59', skin:'#d5a27c', hair:'#282c33', accent:'#d5a8ac'},
  sofia: {shirt:'#eadcc1', coat:'#bb7254', pants:'#425867', skin:'#a87553', hair:'#332925', accent:'#e9c983'},
  leah: {shirt:'#f7eed6', coat:'#be6677', pants:'#47586a', skin:'#a56e51', hair:'#3b292e', accent:'#edbc63'},
  owen: {shirt:'#e9e2cd', coat:'#6b7b59', pants:'#4b505c', skin:'#dcad83', hair:'#78583e', accent:'#d5ae60'},
  iris: {shirt:'#f0dccd', coat:'#a16f9c', pants:'#4f4d6b', skin:'#b77e60', hair:'#302933', accent:'#e3ae8f'},
  priya: {shirt:'#efead5', coat:'#438795', pants:'#405269', skin:'#9e6549', hair:'#2c2934', accent:'#efc367'},
  mateo: {shirt:'#e4e8df', coat:'#3d649f', pants:'#35475a', skin:'#bd8661', hair:'#36302c', accent:'#ece3c2'},
  sam: {shirt:'#f3e4c5', coat:'#b17c48', pants:'#506655', skin:'#e0b184', hair:'#6d4e35', accent:'#9dc19b'},
};

export function createDistrictArt(scene,{capacity=5,rootName='Cookie Corner and recurring students'}={}) {
  const root = new THREE.Group(); root.name = rootName; scene.add(root);
  const geometries = new Map(), materials = new Map(), textures = new Set(); let disposed = false;
  const geometry = (name, make) => {if (!geometries.has(name)) geometries.set(name, make()); return geometries.get(name);};
  const material = (color, extra = {}) => {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:.87, ...extra}));
    return materials.get(key);
  };
  const cube = geometry('box', () => new THREE.BoxGeometry(1,1,1));
  const orb = geometry('orb', () => new THREE.SphereGeometry(1,10,7));
  const cylinder = geometry('cylinder', () => new THREE.CylinderGeometry(1,1,1,10));
  const disc = geometry('disc', () => new THREE.CylinderGeometry(1,1,1,12));
  const triangle = geometry('pennant', () => new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-.5,.5,0,.5,.5,0,0,-.5,0],3)));
  triangle.computeVertexNormals();
  const torus = geometry('torus', () => new THREE.TorusGeometry(1,.12,5,12));
  const plane = geometry('plane', () => new THREE.PlaneGeometry(1,1));
  const navy = material('#264e83'), cream = material('#f8edcf'), wood = material('#a97a51'), metal = material('#354c53'), white = material('#f7f4e9');
  const makeGroup = (name, parent = root, position = [0,0,0]) => {const group=new THREE.Group();group.name=name;group.position.set(...position);parent.add(group);return group;};
  const mesh = (parent,geo,mat,position,size=[1,1,1],name='') => {
    const object = new THREE.Mesh(geo,mat);object.name=name;object.position.set(...position);object.scale.set(...size);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  const box = (parent,mat,size,position,name='') => mesh(parent,cube,mat,position,size,name);
  const sphere = (parent,mat,size,position,name='') => mesh(parent,orb,mat,position,size,name);
  const pole = (parent,mat,radius,height,position) => mesh(parent,cylinder,mat,position,[radius,height,radius]);
  function textMaterial(lines,{background='#264e83',color='#fff5df',width=768,height=256}={}) {
    const canvas = globalThis.document?.createElement?.('canvas');const ctx=canvas?.getContext?.('2d');
    if(!ctx)return material(background,{side:THREE.DoubleSide});
    canvas.width=width;canvas.height=height;ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(12,12,width-24,height-24);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
    lines.forEach((text,index)=>{ctx.font=`${index===0?'bold ':''}${index===0?Math.round(height*.24):Math.round(height*.12)}px ${index===0?'Georgia':'Arial'},sans-serif`;ctx.fillText(text,width/2,height*(lines.length===1?.5:index===0?.38:.69),width-40);});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
    const value=new THREE.MeshStandardMaterial({map:texture,roughness:1,side:THREE.DoubleSide});materials.set('sign:'+materials.size,value);return value;
  }
  const sign = (parent,lines,size,position,options={}) => mesh(parent,plane,textMaterial(lines,options),position,[size[0],size[1],1]);
  const anchor = (group, point, y) => {group.scale.setScalar(UNIT);group.position.set(point.x,y,point.z);};

  function createStudent(definition) {
    const id=definition.id,p={...(PALETTES[id]||PALETTES.eli),...definition.palette},group=makeGroup(definition.name);group.scale.setScalar(UNIT);
    const variant=({leah:'maya',owen:'eli',iris:'jun',priya:'nora',mateo:'maya',sam:'nora'})[id]||id;
    const skin=material(p.skin),hair=material(p.hair),coat=material(p.coat),shirt=material(p.shirt),pants=material(p.pants),accent=material(p.accent),dark=material('#2e3541');
    const body=makeGroup('Body',group,[0,.91,0]),torso=makeGroup('Torso',body,[0,.02,0]);
    sphere(body,pants,[.20,.12,.15],[0,0,0]);box(torso,coat,[.43,.48,.29],[0,.27,0]);
    box(torso,shirt,[.16,.44,.018],[0,.28,.153]);
    const legs=[];
    for(const side of [-1,1]) {
      const hip=makeGroup(side<0?'Left hip':'Right hip',body,[side*.115,-.04,0]);pole(hip,pants,.078,.35,[0,-.17,0]);
      const knee=makeGroup('Knee',hip,[0,-.35,0]);pole(knee,pants,.067,.42,[0,-.21,0]);
      box(knee,white,[.17,.12,.29],[0,-.46,.055]);legs.push({hip,knee});
    }
    const arms=[];
    for(const side of [-1,1]) {
      const shoulder=makeGroup(side<0?'Left shoulder':'Right shoulder',torso,[side*.255,.44,0]);pole(shoulder,coat,.075,.26,[0,-.11,0]);
      const elbow=makeGroup('Elbow',shoulder,[0,-.24,0]);pole(elbow,shirt,.061,.22,[0,-.10,0]);sphere(elbow,skin,[.065,.085,.06],[0,-.25,.01]);arms.push({shoulder,elbow});
    }
    pole(torso,skin,.064,.12,[0,.55,0]);const head=makeGroup('Head',torso,[0,.74,0]);
    sphere(head,skin,[.18,.22,.17],[0,0,0]);sphere(head,hair,[.187,.14,.17],[0,.115,-.025]);
    for(const side of [-1,1]){sphere(head,skin,[.04,.065,.035],[side*.178,-.01,0]);sphere(head,dark,[.016,.021,.01],[side*.062,.015,.165]);}
    const mouth=box(head,hair,[.067,.01,.012],[0,-.09,.164]);
    if(variant==='maya') {
      sphere(head,hair,[.105,.21,.105],[.11,.04,-.18]);box(torso,navy,[.31,.48,.028],[0,.13,.17]);
      pole(torso,cream,.012,.38,[-.12,.26,.18]);pole(torso,cream,.012,.38,[.12,.26,.18]);
      box(torso,accent,[.19,.10,.035],[0,.22,.193]);
      const visor=box(head,navy,[.33,.055,.24],[0,.16,.08]);visor.rotation.x=-.10;
      const cookie=mesh(arms[1].elbow,disc,material('#dca666'),[0,-.26,.07],[.09,.025,.09],'Handoff cookie');cookie.rotation.x=Math.PI/2;cookie.visible=false;
      group.userData.handoffObject=cookie;
    } else if(variant==='eli') {
      // Round glasses and a folded campus map distinguish Eli at a glance.
      for(const side of [-1,1]) mesh(head,torus,metal,[side*.066,.014,.176],[.048,.048,.048]);
      box(head,metal,[.044,.009,.009],[0,.013,.184]);
      const map=box(arms[0].elbow,cream,[.30,.24,.025],[0,-.20,.08]);map.rotation.y=.2;
      for(let i=0;i<3;i++)box(map,navy,[.035,.17,.004],[-.1+i*.08,0,.017]);
      box(torso,accent,[.17,.23,.08],[.27,.09,-.01]);
    } else if(variant==='nora') {
      box(torso,material('#4c938b'),[.30,.35,.032],[0,.18,.17]);
      for(const x of [-.12,.12])box(torso,coat,[.045,.41,.035],[x,.34,.17]);
      box(body,dark,[.43,.07,.32],[0,.05,0]);box(body,accent,[.10,.10,.08],[.19,.01,.17]);
      pole(arms[1].elbow,metal,.019,.22,[0,-.28,.06]);mesh(arms[1].elbow,torus,metal,[0,-.39,.06],[.05,.05,.05]);
      box(head,coat,[.36,.06,.34],[0,.15,0]);box(head,accent,[.21,.025,.12],[0,.13,.19]);
    } else if(variant==='jun') {
      sphere(head,hair,[.105,.095,.105],[0,.20,-.09]);
      box(torso,accent,[.025,.44,.02],[.10,.28,.165]);
      const musicCase=makeGroup('Music case',arms[0].elbow,[0,-.32,-.01]);
      sphere(musicCase,dark,[.19,.34,.095],[0,-.17,0]);box(musicCase,dark,[.18,.27,.16],[0,.13,0]);
      box(musicCase,accent,[.08,.055,.018],[0,-.06,.1]);
      mesh(musicCase,torus,metal,[.17,.10,0],[.075,.10,.075]);
      const instrument=makeGroup('Jun’s violin',torso,[-.11,.38,.26]);
      sphere(instrument,wood,[.10,.16,.045],[0,0,0]);box(instrument,wood,[.035,.22,.035],[0,.19,0]);
      for(const x of [-.015,-.005,.005,.015])box(instrument,cream,[.002,.33,.003],[x,.07,.05]);
      instrument.rotation.z=-.7;instrument.visible=false;
      const bow=box(arms[1].elbow,wood,[.012,.56,.012],[0,-.20,.07]);bow.rotation.z=.8;bow.visible=false;
      group.userData.instrument=instrument;group.userData.musicCase=musicCase;group.userData.bow=bow;
    } else {
      for(let i=0;i<7;i++){const a=i*TAU/7;sphere(head,hair,[.08,.085,.09],[Math.cos(a)*.13,.12+Math.sin(a)*.045,-.05]);}
      box(torso,cream,[.34,.065,.035],[0,.48,.16]);box(torso,cream,[.07,.28,.04],[-.09,.32,.18]);
      const camera=box(torso,dark,[.22,.14,.10],[.02,.18,.24],'Camera');
      const lens=pole(camera,metal,.060,.09,[0,0,.085]);lens.rotation.x=Math.PI/2;sphere(camera,material('#497e91',{metalness:.3}),[.043,.043,.012],[0,0,.138]);
      for(const x of [-.12,.12])box(torso,dark,[.017,.35,.016],[x,.35,.17]);
    }
    if(id==='leah')for(let i=0;i<3;i++)box(torso,material(['#e6b45f','#8bb4a1','#8a7caf'][i]),[.045,.065,.017],[-.07+i*.07,.26,.215],'Club badges');
    if(id==='owen')box(arms[1].elbow,coat,[.17,.25,.065],[0,-.23,.08],'Reading notebook');
    if(id==='iris'){box(torso,accent,[.43,.06,.05],[0,.45,.19],'Artist scarf');box(head,coat,[.38,.055,.34],[0,.19,0],'Artist beret');}
    if(id==='priya')for(const side of [-1,1])mesh(head,torus,metal,[side*.066,.014,.176],[.052,.052,.052]);
    if(id==='mateo'){const flag=mesh(arms[0].elbow,triangle,coat,[.11,-.20,.09],[.23,.18,1],'Fan pennant');flag.rotation.z=-Math.PI/2;}
    if(id==='sam')box(body,accent,[.24,.18,.09],[0,.02,.21],'Volunteer satchel');
    // Small warm contact shadows use one shared material and geometry.
    const shadow=mesh(group,geometry('shadow',()=>new THREE.CircleGeometry(.33,14)),material('#263b3e',{transparent:true,opacity:.14,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),[0,.006,0]);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
    const nameTag=sign(group,[definition.name],[1.7,.44],[0,2.12,0],{width:512,height:128});nameTag.name='Name label';nameTag.castShadow=false;nameTag.receiveShadow=false;
    return {id,group,body,torso,head,mouth,legs,arms,label:nameTag,baseY:.91};
  }

  function createStand(point,y) {
    const group=makeGroup('Maya’s fictional cookie stand');anchor(group,point,y);
    for(const x of [-1.22,1.22])for(const z of [-.47,.47])pole(group,wood,.055,.96,[x,.48,z]);
    box(group,navy,[2.7,.67,1.04],[0,.50,0]);box(group,cream,[2.83,.10,1.15],[0,.92,0]);
    box(group,material('#dfb969'),[2.73,.035,1.055],[0,.20,0]);
    for(const x of [-1.38,1.38])for(const z of [-.56,.56])pole(group,navy,.028,2.65,[x,1.325,z]);
    for(let i=0;i<8;i++)box(group,i%2?white:navy,[.42,.07,1.64],[-1.47+i*.42,2.65,0]);
    box(group,navy,[3.36,.19,.035],[0,2.56,.82]);
    sign(group,['THE COOKIE CORNER'],[2.65,.62],[0,2.20,.59]);
    sign(group,['BLUE & WHITE'],[2.13,.44],[0,.54,.532]);
    // Rounded golden cookies and individual chocolate pieces are two batches.
    box(group,metal,[1.05,.045,.47],[-.43,1.00,.07]);
    const cookies=new THREE.InstancedMesh(disc,material('#dca666'),12),chips=new THREE.InstancedMesh(orb,material('#624638'),48);group.add(cookies,chips);
    cookies.name='Visible cookie inventory';chips.name='Chocolate chips';cookies.castShadow=chips.castShadow=true;
    const dummy=new THREE.Object3D();
    for(let i=0;i<12;i++) {
      const x=-.83+(i%4)*.265,z=-.08+Math.floor(i/4)*.145;
      dummy.position.set(x,1.04,z);dummy.rotation.set(0,i*.4,0);dummy.scale.set(.10,.035,.065);dummy.updateMatrix();cookies.setMatrixAt(i,dummy.matrix);
      for(let j=0;j<4;j++){dummy.position.set(x+Math.cos(j*2+i)*.055,1.062,z+Math.sin(j*2+i)*.036);dummy.scale.set(.014,.008,.013);dummy.updateMatrix();chips.setMatrixAt(i*4+j,dummy.matrix);}
    }
    const football=sphere(group,material('#95623e'),[.21,.14,.13],[.88,1.13,-.05]);football.rotation.z=.3;
    for(let i=0;i<4;i++)box(football,white,[.027,.22,.023],[-.20+i*.13,.9,.4]);
    box(group,cream,[.29,.08,.27],[.46,1.04,.24]);
    const cards=[];for(let i=0;i<3;i++){const card=box(group,i===1?cream:white,[.20,.012,.29],[.32+i*.21,1.01,-.27],'Game-day card');cards.push(card);}
    const handoff=makeGroup('Cookie handoff',group,[0,1.12,.78]);sphere(handoff,material('#dca666'),[.105,.025,.09],[0,0,0]);handoff.visible=false;
    const bunting=makeGroup('Finished blue-and-white pennants',group);
    for(let i=0;i<9;i++){const flag=mesh(bunting,triangle,material(i%2?'#f7f4e9':'#4075af',{side:THREE.DoubleSide}),[-1.16+i*.29,1.60+Math.cos(i/8*Math.PI*2)*.10,.59],[.25,.30,1]);flag.rotation.z=(i-4)*-.06;}
    const thanks=sign(group,['OPEN'],[1.22,.30],[0,1.36,.56],{background:'#ede0b7',color:'#315653'});thanks.visible=false;
    return {group,cookies,chips,cards,handoff,bunting,thanks};
  }

  function createPhotoBoard(point,y) {
    const group=makeGroup('Sofia’s campus photo board');anchor(group,point,y);
    for(const x of [-.66,.66])pole(group,wood,.047,2.03,[x,1.015,0]);
    box(group,wood,[1.55,1.12,.09],[0,1.50,0]);box(group,cream,[1.43,1.00,.02],[0,1.50,.06]);
    sign(group,['SOFIA’S PHOTOS'],[1.34,.27],[0,1.83,.076],{background:'#f8edcf',color:'#315653',height:180});
    const photos=[];
    for(let i=0;i<2;i++) {
      const photo=makeGroup(i?'Arts composition':'Library composition',group,[-.36+i*.72,1.42,.09]);
      box(photo,white,[.59,.58,.015],[0,0,0]);box(photo,material(i?'#b5c8d3':'#e0bf85'),[.51,.39,.01],[0,.055,.013]);
      // Original miniature compositions, not source photographs.
      for(let j=0;j<5;j++)box(photo,material(i?'#746c90':'#e5dfca'),[.06,.15+j%2*.055,.01],[-.19+j*.095,.01,.025]);
      box(photo,material('#577766'),[.51,.045,.01],[0,-.12,.031]);photos.push(photo);photo.visible=false;
    }
    return {group,photos};
  }

  function createPennant(point,y,index=0) {
    const group=makeGroup('Pennant stop');anchor(group,point,y);
    pole(group,metal,.025,1.45,[0,.725,0]);
    const flag=mesh(group,triangle,material(index%2?'#f7f4e9':'#4075af',{side:THREE.DoubleSide}),[.18,1.28,0],[.35,.48,1]);flag.rotation.z=-Math.PI/2;
    const base=box(group,wood,[.33,.12,.33],[0,.06,0]);return {group,flag,base};
  }

  function createGate(point,y,index) {
    const group=makeGroup('Nora practice gate '+(index+1));anchor(group,point,y);
    for(const x of [-1.05,1.05]) {
      const cone=mesh(group,geometry('cone',()=>new THREE.ConeGeometry(.15,.42,8)),material('#dfad5a'),[x,.21,0]);
      box(cone,white,[1.3,.17,1.3],[0,.13,0]);
    }
    const number=sign(group,[String(index+1)],[.63,.38],[1.25,.73,0],{background:'#356d6a',height:192});
    return {group,number};
  }

  function createBench(point,y) {
    const group=makeGroup('Listening bench');anchor(group,point,y);
    for(const z of [-.18,.0,.18])box(group,wood,[1.7,.055,.13],[0,.47,z]);
    for(const x of [-.65,.65])for(const z of [-.18,.18])pole(group,metal,.027,.46,[x,.23,z]);
    for(const h of [.72,.91])box(group,wood,[1.7,.13,.055],[0,h,-.25]);return group;
  }

  function createCampusBooth(definition,point,y,activities=[]) {
    const group=makeGroup(definition.title);anchor(group,point,y);
    const color=material(definition.color||'#557c83');
    // The solid counter is 2.4 x 1 m. Its collision belongs to campus-world;
    // the high sign and cloth flags never block the route underneath them.
    box(group,color,[2.36,.72,.94],[0,.50,0]);box(group,cream,[2.4,.08,1],[0,.90,0]);
    for(const x of [-1.10,1.10])pole(group,metal,.028,2.15,[x,1.08,-.44]);
    const header=sign(group,[definition.title],[2.30,.50],[0,1.89,-.42],{background:definition.color,width:512,height:128});
    header.name='Readable booth header: '+definition.title;header.material.side=THREE.FrontSide;
    const reverse=mesh(group,plane,header.material,[0,1.89,-.425],[2.30,.50,1],'Readable booth reverse: '+definition.title);reverse.rotation.y=Math.PI;
    const supplies=[];for(let i=0;i<6;i++)supplies.push(box(group,i%2?color:wood,[.22,.12,.25],[-.83+i*.32,.99,.10],'Booth supply '+(i+1)));
    const outcomes=[];for(let i=0;i<4;i++){const flag=mesh(group,triangle,color,[-.75+i*.5,1.40,.48],[.25,.30,1],'Completed activity pennant');flag.visible=false;outcomes.push(flag);}
    const display=makeGroup('Neighborhood display',group,[0,1.02,-.14]);
    if(definition.npcId==='owen')for(let i=0;i<3;i++)box(display,i%2?cream:color,[.38,.045,.24],[.55,i*.05,0],'Shared books');
    else if(definition.npcId==='priya'){const wheel=mesh(display,torus,metal,[.55,.16,0],[.17,.17,.17],'Prototype wheel');wheel.rotation.x=Math.PI/2;box(display,color,[.38,.06,.20],[.55,.02,0]);}
    else if(definition.npcId==='mateo'){const football=sphere(display,wood,[.19,.12,.12],[.55,.08,0],'Practice football');football.rotation.z=.3;}
    else if(definition.npcId==='iris')for(let i=0;i<4;i++)box(display,material(['#bb7254','#d4af58','#719f99','#83729e'][i]),[.035,.035,.25],[.45+i*.07,.02,0],'Chalk palette');
    else if(definition.npcId==='sam')box(display,color,[.33,.22,.27],[.55,.09,0],'Volunteer packing kit');
    else {const badge=mesh(display,disc,color,[.55,.04,0],[.18,.035,.18],'Club stamp');badge.rotation.x=0;}
    const resultCards=[];
    if(activities.length){
      const canvas=globalThis.document?.createElement?.('canvas'),ctx=canvas?.getContext?.('2d');let resultMaterial=material(definition.color,{side:THREE.DoubleSide});
      if(ctx){
        canvas.width=512;canvas.height=256;const rowHeight=canvas.height/activities.length;
        activities.forEach((activity,i)=>{
          const top=i*rowHeight;ctx.fillStyle='#f8edcf';ctx.fillRect(0,top,512,rowHeight);ctx.strokeStyle=definition.color;ctx.lineWidth=3;ctx.strokeRect(3,top+3,506,rowHeight-6);
          ctx.fillStyle=definition.color;ctx.font='bold 18px Georgia,serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(activity.title,64,top+rowHeight*.5,432);

          // A small original diagram sits beside each title, on the same atlas.
          for(let j=0;j<3;j++){ctx.fillStyle=j===i%3?'#709c82':definition.color;ctx.fillRect(13+j*12,top+rowHeight*.34+(j%2)*8,8,20);}
        });
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);resultMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:1,side:THREE.FrontSide});materials.set('outcomes:'+definition.id,resultMaterial);
      }
      activities.forEach((activity,i)=>{
        const geo=geometry('outcome-card:'+activities.length+':'+i,()=>{const result=plane.clone(),uv=result.attributes.uv;for(let n=0;n<uv.count;n++)uv.setY(n,(uv.getY(n)+activities.length-1-i)/activities.length);return result;});
        const card=mesh(group,geo,resultMaterial,[-.58+(i%2)*1.16,1.18+Math.floor(i/2)*.23,.49],[1.07,.20,1],'Completed story: '+activity.title);card.userData.activityId=activity.id;card.visible=false;resultCards.push(card);
      });
    }
    return {group,supplies,outcomes,display,resultCards};
  }

  function createCarryItem() {
    const group=makeGroup('Carried campus supplies');group.scale.setScalar(UNIT);
    box(group,wood,[.32,.23,.24],[0,0,0]);box(group,cream,[.34,.035,.25],[0,.13,0]);group.visible=false;return group;
  }

  function createCampusProp(kind,point,y) {
    const group=makeGroup('Campus activity '+kind);anchor(group,point,y);
    // These are flat game cards and chalk studies, at most 25 mm high. Like
    // chalk on paving they stay walkable rather than receiving a box collider.
    group.userData.walkableDecoration=true;group.userData.maxHeightMeters=.025;
    const base=box(group,cream,[.62,.008,.64],[0,.006,0]);base.receiveShadow=true;base.castShadow=false;
    const draft=makeGroup('Unfinished study',group),finished=makeGroup('Completed study',group);
    const blue=material('#547c9c'),green=material('#709c82'),orange=material('#d0a15d'),pink=material('#b2768e');
    const flat=(parent,mat,size,position)=>{const object=box(parent,mat,[size[0],.009,size[1]],[position[0],.016,position[1]]);object.castShadow=false;return object;};
    if(kind==='chalk'){
      for(let i=0;i<4;i++){const x=(i%2-.5)*.24,z=(Math.floor(i/2)-.5)*.24;flat(draft,i%2?pink:orange,[.10,.10],[x,z]);flat(finished,i%2?blue:green,[.18,.18],[x,z]);}
    }else if(kind==='target'||kind==='stamp'){
      for(const [parent,radii]of [[draft,[.23,.12]],[finished,[.23,.16,.07]]])for(const [i,radius]of radii.entries()){
        const circle=mesh(parent,disc,i%2?cream:parent===finished?green:blue,[0,.016+i*.002,0],[radius,.002,radius]);circle.castShadow=false;
      }
    }else if(kind==='banner'){
      for(let i=0;i<3;i++){flat(draft,blue,[.13,.34],[-.18+i*.18,0]);flat(finished,i%2?cream:blue,[.16,.42],[-.18+i*.18,0]);}
    }else if(kind==='prototype'){
      flat(draft,orange,[.40,.10],[0,0]);flat(finished,green,[.40,.15],[0,0]);for(const x of [-.18,.18]){flat(draft,metal,[.06,.20],[x,.10]);flat(finished,metal,[.09,.25],[x,.10]);}
    }else if(kind==='book'){
      for(const [parent,color]of [[draft,blue],[finished,green]]){flat(parent,color,[.43,.39],[0,0]);flat(parent,cream,[.015,.39],[0,0]);for(const z of [-.1,0,.1])flat(parent,orange,[.13,.012],[.11,z]);}
    }else if(kind==='pack'){
      flat(draft,wood,[.37,.38],[0,0]);flat(finished,green,[.39,.40],[0,0]);for(const x of [-.12,.12]){flat(draft,cream,[.035,.38],[x,0]);flat(finished,cream,[.035,.40],[x,0]);}
    }else{
      for(let i=0;i<3;i++){flat(draft,blue,[.35-i*.05,.025],[0,-.14+i*.13]);flat(finished,i===2?green:blue,[.38,.035],[0,-.14+i*.13]);}
    }
    group.visible=false;finished.visible=false;return {group,draft,finished,kind,point};
  }

  const distantParts = [
    ['body',cube,cream,0,1.10,.44,.49,.28],
    ['head',orb,material('#be906f'),0,1.64,.18,.22,.17],
    ['hair',orb,material('#40312d'),0,1.76,.18,.12,.16],
    ['left',cube,metal,-.12,.43,.13,.74,.16],
    ['right',cube,metal,.12,.43,.13,.74,.16],
  ].map(([name,geo,mat,offset,height,width,scaleY,depth])=>{
    const batch=new THREE.InstancedMesh(geo,mat,capacity);
    batch.name='Distant students: '+name;
    batch.count=0;
    batch.visible=false;
    batch.frustumCulled=false;
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(batch);
    return {batch,offset,height,width,scaleY,depth};
  });
  const dummy=new THREE.Object3D(),distantColors=new Map(Object.entries(PALETTES).map(([id,palette])=>[id,new THREE.Color(palette.coat)]));
  const distantBody=distantParts[0].batch,slots=[];
  function updateDistant(characters,player) {
    let count=0,matricesChanged=false,colorsChanged=false;
    if(Number.isFinite(player?.x)&&Number.isFinite(player?.z))for(const c of characters){
      if(c.group.visible)continue;
      const {x,y,z}=c.group.position,yaw=c.group.rotation.y;
      if(Math.hypot(x-player.x,z-player.z)>DISTANT_STUDENT_RANGE)continue;
      const slot=slots[count];
      const changedStudent=slot?.id!==c.id;
      if(changedStudent){
        distantBody.setColorAt(count,distantColors.get(c.id)||cream.color);
        colorsChanged=true;
      }
      if(changedStudent||slot.x!==x||slot.y!==y||slot.z!==z||slot.yaw!==yaw){
        const cos=Math.cos(yaw),sin=Math.sin(yaw);
        dummy.rotation.y=yaw;
        for(const {batch,offset,height,width,scaleY,depth} of distantParts){
          dummy.position.set(x+cos*offset*UNIT,y+height*UNIT,z-sin*offset*UNIT);
          dummy.scale.set(width*UNIT,scaleY*UNIT,depth*UNIT);
          dummy.updateMatrix();
          batch.setMatrixAt(count,dummy.matrix);
        }
        slots[count]={id:c.id,x,y,z,yaw};
        matricesChanged=true;
      }
      count++;
    }
    for(const {batch} of distantParts){
      batch.count=count;
      batch.visible=count>0;
      if(matricesChanged)batch.instanceMatrix.needsUpdate=true;
    }
    if(colorsChanged)distantBody.instanceColor.needsUpdate=true;
  }
  return {root,createStudent,createStand,createPhotoBoard,createPennant,createGate,createBench,createCampusBooth,createCarryItem,createCampusProp,updateDistant,
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(object=>{if(object.isInstancedMesh)object.dispose();});for(const geo of geometries.values())geo.dispose();for(const mat of materials.values())mat.dispose();for(const texture of textures)texture.dispose();},
  };
}
