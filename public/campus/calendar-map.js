import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.module.js';
import {loadValleyContext} from './valley-context.js?v=20261116mapui1';

const stage=document.getElementById('map'),labels=document.getElementById('labels'),loading=document.getElementById('loading');
const send=data=>parent.postMessage({channel:'byu-calendar-map',...data},location.origin);
const palette={blue:'#1a73e8',green:'#188038',purple:'#9334e6',orange:'#e8710a',teal:'#00897b',slate:'#857063'};
let renderer,controls,camera,scene,model,sun,frame=0,flight=null,groups=[],focus=null,focusToken=null;
let features=[],pickMeshes=[],pins=[],highlights=[],selectedId=null,ready=false;
let filterKey;
let mapFullscreen=false;
// Full screen is a parent-page expansion: iOS Safari has no element
// fullscreen, so the embedded map asks the page around it to fill the viewport.
function setFullscreen(value){
  mapFullscreen=Boolean(value);
  const button=document.getElementById('full');
  if(button){button.textContent=mapFullscreen?'Exit full screen':'Full screen';button.setAttribute('aria-pressed',String(mapFullscreen));}
}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.id='leaders';stage.insertBefore(leaders,labels);
// Spread nearby labels without changing their geographic anchors.
const offsets=[[0,0]];
for(let radius=1;radius<=8;radius++)for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++)if(Math.max(Math.abs(x),Math.abs(y))===radius)offsets.push([x*44,y*40]);
offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
function createToonRamp(){
  const ramp=new Uint8Array([78,146,214,255]);
  const tex=new THREE.DataTexture(ramp,ramp.length,1,THREE.RedFormat);
  tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=false;tex.needsUpdate=true;
  return tex;
}
function createStylizedCampusMaterial(gradientMap){
  const mat=new THREE.MeshToonMaterial({vertexColors:true,gradientMap});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`)
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\nvWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`)
      .replace('#include <color_fragment>',`
        #include <color_fragment>
        vec3 wn=normalize(vWorldNormal);
        // Detect window glass and pools/water from vertex colors
        float isGlass=step(diffuseColor.r*1.28+0.02,diffuseColor.b)*step(diffuseColor.r,0.22)*step(0.13,diffuseColor.b)*(1.0-smoothstep(0.60,0.85,abs(wn.y)));
        float isWater=step(diffuseColor.r*1.32+0.02,diffuseColor.b)*step(0.18,diffuseColor.b)*smoothstep(0.80,0.95,wn.y);
        // Enrich lawn/tree greens & crisp architectural cream/brick contrast
        float isGreen=step(diffuseColor.r*1.05,diffuseColor.g)*step(diffuseColor.b*1.04,diffuseColor.g);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.92,1.12,0.88),isGreen*0.65);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.14,0.38,0.52),isGlass*0.32);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.54,0.74),isWater*0.42);
      `)
      .replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        // Cool alpine blue shadow fill & warm sunlit tone
        reflectedLight.indirectDiffuse*=vec3(0.88,0.94,1.06);
        vec3 wn2=normalize(vWorldNormal);
        vec3 viewDirW=normalize(cameraPosition-vWorldPos);
        float fresnel=pow(1.0-max(dot(wn2,viewDirW),0.0),2.4);
        float glassMask=step(diffuseColor.r*1.28+0.02,diffuseColor.b)*step(diffuseColor.r,0.22)*step(0.13,diffuseColor.b)*(1.0-smoothstep(0.60,0.85,abs(wn2.y)));
        float waterMask=step(diffuseColor.r*1.32+0.02,diffuseColor.b)*step(0.18,diffuseColor.b)*smoothstep(0.80,0.95,wn2.y);
        // Stylized cel glass reflection & diagonal glint
        float glint=smoothstep(0.42,0.52,fract((vWorldPos.x+vWorldPos.z)*0.85+vWorldPos.y*1.4));
        reflectedLight.directDiffuse+=vec3(0.45,0.68,0.84)*(fresnel*0.55+glint*0.18)*glassMask;
        reflectedLight.directDiffuse+=vec3(0.38,0.62,0.78)*(fresnel*0.50+0.12)*waterMask;
        // Subtle architectural crease/edge ink accent on steep building edges (never ground triangles)
        float notGround=1.0-smoothstep(0.86,0.97,abs(wn2.y));
        float edge=smoothstep(0.38,1.05,length(fwidth(normalize(vNormal))))*notGround;
        float rim=smoothstep(0.65,0.92,fresnel)*notGround*(1.0-glassMask)*0.22;
        reflectedLight.directDiffuse*=1.0-edge*0.34-rim;
        reflectedLight.indirectDiffuse*=1.0-edge*0.26-rim;
      `);
  };
  return mat;
}
function syncSunShadowTarget(){
  if(!sun||!controls)return;
  const cx=Math.max(-35,Math.min(35,controls.target.x));
  const cz=Math.max(-35,Math.min(35,controls.target.z));
  sun.target.position.set(cx,1,cz);
  sun.position.set(cx-38,68,cz+24);
  sun.target.updateMatrixWorld();
}
function placePins(){
  const occupied=[{left:innerWidth-330,right:innerWidth,top:0,bottom:58}];
  for(const pin of pins){
    const p=new THREE.Vector3(...pin.location.position).add(new THREE.Vector3(0,.6,0)).project(camera);
    const hidden=p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    pin.button.hidden=hidden;pin.line.style.display=hidden?'none':'';if(hidden)continue;
    const anchorX=(p.x*.5+.5)*innerWidth,anchorY=(-p.y*.5+.5)*innerHeight;
    const width=pin.button.offsetWidth,height=pin.button.offsetHeight;
    let x=anchorX,y=anchorY,rect;
    for(const [dx,dy] of offsets){
      x=Math.max(width/2+4,Math.min(innerWidth-width/2-4,anchorX+dx));y=Math.max(height+4,Math.min(innerHeight-44,anchorY+dy));
      rect={left:x-width/2-3,right:x+width/2+3,top:y-height-3,bottom:y+3};
      if(!occupied.some(r=>rect.left<r.right&&rect.right>r.left&&rect.top<r.bottom&&rect.bottom>r.top))break;
    }
    occupied.push(rect);pin.button.style.left=`${x}px`;pin.button.style.top=`${y}px`;
    pin.line.setAttribute('x1',anchorX);pin.line.setAttribute('y1',anchorY);pin.line.setAttribute('x2',x);pin.line.setAttribute('y2',y-8);
  }
}
function invalidate(){if(!frame)frame=requestAnimationFrame(render);}
function render(time){
  frame=0;
  let complete;
  if(flight){const t=reduced?1:Math.min(1,(time-flight.start)/650),e=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,e);controls.target.lerpVectors(flight.fromTarget,flight.target,e);if(t===1){complete=flight.complete;flight=null;}}
  const changed=controls.update();syncSunShadowTarget();renderer.render(scene,camera);
  placePins();
  complete?.();
  if(changed||flight)invalidate();
}
function fly(target,distance,top=false,complete){
  const to=target.clone().addScaledVector(top?new THREE.Vector3(0,1,.001):new THREE.Vector3(.48,.95,.85).normalize(),distance);
  flight={start:performance.now(),from:camera.position.clone(),to,fromTarget:controls.target.clone(),target,complete};
  invalidate();
}
function reset(){fly(new THREE.Vector3(1,1,-7),innerWidth<500?110:87);}
function fit(){
  if(!groups.length){reset();return;}
  const box=new THREE.Box3();for(const g of groups)box.expandByPoint(new THREE.Vector3(...g.location.position));
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  fly(center,Math.min(260,Math.max(32,Math.max(size.x/Math.max(.4,camera.aspect),size.z)*1.8+15)));
}
function clearHighlight(){for(const mesh of highlights){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}highlights=[];}
function highlight(location){
  selectedId=location.id;clearHighlight();
  const featureIds=new Set(location.featureIds||[location.id]);
  const indexes=new Set(features.filter(f=>featureIds.has(f.id)).map(f=>f.featureIndex));
  for(const mesh of pickMeshes){
    const geometry=mesh.geometry,attribute=geometry.getAttribute('_feature_id'),index=geometry.index,picked=[];
    if(!index)continue;
    for(let i=0;i<index.count;i+=3)if(indexes.has(Math.round(attribute.getX(index.getX(i)))))picked.push(index.getX(i),index.getX(i+1),index.getX(i+2));
    if(!picked.length)continue;
    const overlayGeometry=geometry.clone();overlayGeometry.setIndex(picked);
    const material=new THREE.MeshBasicMaterial({color:0x1f7aff,transparent:true,opacity:.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const overlay=new THREE.Mesh(overlayGeometry,material);overlay.matrixAutoUpdate=false;overlay.matrix.copy(mesh.matrixWorld);scene.add(overlay);highlights.push(overlay);
  }
  for(const pin of pins)pin.button.classList.toggle('selected',pin.location.id===location.id);
  invalidate();
}
function select(location){highlight(location);send({type:'select',id:location.id});}
function buildPins(){
  labels.replaceChildren();leaders.replaceChildren();pins=[];
  const displayed=[...groups];if(focus&&!displayed.some(g=>g.location.id===focus.id))displayed.push({location:focus,count:0,colors:[]});
  for(const g of displayed){
    const button=document.createElement('button');button.className='pin';button.dataset.location=g.location.id;
    button.title=`${g.location.name} · ${g.count} matching event${g.count===1?'':'s'}`;button.setAttribute('aria-label',button.title);
    let offset=0;const stops=g.colors.map(c=>{const start=offset;offset+=c.count/Math.max(1,g.count)*100;return `${palette[c.color]||palette.blue} ${start}% ${offset}%`;});
    button.style.setProperty('--ring',stops.length?`conic-gradient(${stops.join(',')})`:'#dadce0');
    const circle=document.createElement('span');circle.className='pin-count';const count=document.createElement('b');count.textContent=String(g.count);circle.append(count);
    const name=document.createElement('span');name.className='pin-name';name.textContent=g.location.code||g.location.name;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');leaders.append(line);
    button.append(circle,name);button.classList.toggle('selected',selectedId===g.location.id);button.onclick=()=>select(g.location);labels.append(button);pins.push({button,line,location:g.location});
  }
  invalidate();
}
addEventListener('message',event=>{
  const type=event.data?.type;
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='byu-calendar-map'||(type!=='update'&&type!=='fullscreen'&&type!=='scroll'))return;
  if(type==='fullscreen'){setFullscreen(Boolean(event.data.value));return;}
  groups=Array.isArray(event.data.groups)?event.data.groups:[];focus=event.data.focus||null;
  if(!ready)return;
  const filtersChanged=filterKey!==event.data.filterKey;filterKey=event.data.filterKey;
  if(!focus)selectedId=null;
  buildPins();
  if(focus&&focusToken!==event.data.focusToken){focusToken=event.data.focusToken;const token=focusToken;highlight(focus);fly(new THREE.Vector3(...focus.position),23,false,()=>send({type:'focused',token}));}
  else if(!focus){selectedId=null;clearHighlight();if(filtersChanged)fit();}
});
try{
  scene=new THREE.Scene();scene.background=new THREE.Color('#dceaf2');
  camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.35,650);camera.position.set(34,51,49);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Campus map. Arrow keys pan. Plus and minus zoom. Use location buttons below the map to browse events.');stage.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xdaf0ff,0x738d68,1.08));
  sun=new THREE.DirectionalLight(0xfff1d4,2.75);sun.position.set(-38,68,24);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-58;sun.shadow.camera.right=58;sun.shadow.camera.top=58;sun.shadow.camera.bottom=-58;sun.shadow.camera.near=5;sun.shadow.camera.far=175;sun.shadow.bias=-0.0008;sun.shadow.normalBias=0.032;
  scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xc9dfff,.40);fill.position.set(32,26,-30);scene.add(fill);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(1,1,-5);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=3;controls.maxDistance=280;controls.maxPolarAngle=Math.PI*.47;controls.zoomToCursor=true;controls.screenSpacePanning=true;controls.addEventListener('change',invalidate);controls.addEventListener('start',()=>{flight=null;});
 // Phones use one finger to orbit the map and a two-finger pinch to zoom in or
 // out. Desktop mouse, wheel, and keyboard behavior is unchanged.
 const coarse=matchMedia('(pointer: coarse)').matches;
 if(coarse){controls.touches.TWO=null;const hint=document.querySelector('.hint');if(hint)hint.textContent='One finger to move around · Two fingers to zoom';}
 // Wheel over a pin button never reaches the canvas, so those gestures zoom
 // through the same public helper the +/- buttons use — never private
 // OrbitControls internals. Pins answer taps only: no pointer forwarding into
 // the controls, so touching a pin can never leave the camera half-engaged
 // (the old forwarding captured the pointer and locked touch look-around).
addEventListener('wheel',event=>{event.preventDefault();if(event.target!==renderer.domElement)zoom(event.deltaY<0?.9:1.1);},{passive:false});
labels.addEventListener('contextmenu',event=>event.preventDefault());
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);invalidate();});
  const zoom=factor=>{flight=null;const offset=camera.position.clone().sub(controls.target);const nextLen=Math.min(controls.maxDistance,Math.max(controls.minDistance,offset.length()*factor));offset.setLength(nextLen);camera.position.copy(controls.target).add(offset);invalidate();};
  // Two-finger pinch zooms: fingers separating zoom in, closing zoom out.
  let pinch=null;
  renderer.domElement.addEventListener('touchstart',event=>{
    if(!coarse||event.touches.length!==2)return;
    event.preventDefault();flight=null;
    const [a,b]=event.touches;
    pinch=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)||1;
  },{passive:false});
  renderer.domElement.addEventListener('touchmove',event=>{
    if(!coarse||!pinch||event.touches.length<2)return;
    event.preventDefault();
    const [a,b]=event.touches,distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)||1;
    zoom(pinch/distance);
    pinch=distance;
  },{passive:false});
  const endTouch=event=>{if(event.touches.length<2)pinch=null;};
  renderer.domElement.addEventListener('touchend',endTouch);renderer.domElement.addEventListener('touchcancel',endTouch);
  document.getElementById('reset').onclick=reset;document.getElementById('fit').onclick=fit;
  document.getElementById('top').onclick=()=>fly(controls.target.clone(),camera.position.distanceTo(controls.target),true);
  document.getElementById('in').onclick=()=>zoom(.8);document.getElementById('out').onclick=()=>zoom(1.25);
  document.getElementById('full').onclick=()=>{setFullscreen(!mapFullscreen);send({type:'fullscreen',value:mapFullscreen});};
  renderer.domElement.addEventListener('keydown',event=>{const d={ArrowLeft:[-2,0,0],ArrowRight:[2,0,0],ArrowUp:[0,0,-2],ArrowDown:[0,0,2]}[event.key];if(d){event.preventDefault();flight=null;const delta=new THREE.Vector3(...d);camera.position.add(delta);controls.target.add(delta);invalidate();}if(event.key==='+'||event.key==='='){event.preventDefault();zoom(.8);}if(event.key==='-'){event.preventDefault();zoom(1.25);}});
  let down=null,pointers=new Set(),dragged=false;
  const resetPointers=()=>{pointers.clear();down=null;dragged=false;};
  addEventListener('blur',resetPointers);
  renderer.domElement.addEventListener('pointerdown',event=>{pointers.add(event.pointerId);if(pointers.size>1)dragged=true;else{down=[event.clientX,event.clientY];dragged=false;}});
  renderer.domElement.addEventListener('pointermove',event=>{if(down&&Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)dragged=true;});
  renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);const shouldPick=ready&&down&&!dragged&&event.button===0;down=null;if(!shouldPick)return;
    pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickMeshes,false)[0];if(!hit)return;
    const index=Math.round(hit.object.geometry.getAttribute('_feature_id').getX(hit.face.a)),feature=features.find(f=>f.featureIndex===index);
    if(feature){const group=groups.find(g=>g.location.featureIds.includes(feature.id));select(group?.location||{id:feature.id,featureIds:[feature.id],name:feature.name,position:feature.labelPosition});}
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();loading.hidden=false;loading.textContent='3D graphics paused. Reload the page to restore the map. Events are still available below.';send({type:'error'});});
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf,catalog]=await Promise.all([loader.loadAsync('./campus_web.glb?v=20261116mapui1'),fetch('./coordinates.json?v=20261116mapui1').then(r=>{if(!r.ok)throw new Error('Location data unavailable');return r.json();})]);
  const toonRamp=createToonRamp(),campusMat=createStylizedCampusMaterial(toonRamp);
  model=gltf.scene;features=catalog.features;scene.add(model);model.updateMatrixWorld(true);
  model.traverse(o=>{
    if(o.isMesh){
      o.material=campusMat;o.castShadow=true;o.receiveShadow=true;
      if(o.geometry.getAttribute('_feature_id'))pickMeshes.push(o);
    }
  });
  ready=true;loading.hidden=true;reset();buildPins();send({type:'ready'});
  loadValleyContext(loader,scene,camera,invalidate,{gradientMap:toonRamp,sunPosition:sun.position});
}catch(error){loading.hidden=false;loading.textContent='The 3D map could not load. You can still browse locations and events below.';send({type:'error'});console.error(error);}
