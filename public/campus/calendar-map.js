import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.module.js';
import {loadValleyContext} from './valley-context.js?v=20261102pins1';

const stage=document.getElementById('map'),labels=document.getElementById('labels'),loading=document.getElementById('loading');
const send=data=>parent.postMessage({channel:'byu-calendar-map',...data},location.origin);
const palette={blue:'#1a73e8',green:'#188038',purple:'#9334e6',orange:'#e8710a',teal:'#00897b',slate:'#78909c'};
let renderer,controls,camera,scene,model,frame=0,flight=null,groups=[],focus=null,focusToken=null;
let features=[],pickMeshes=[],pins=[],highlights=[],selectedId=null,ready=false;
let filterKey;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.id='leaders';stage.insertBefore(leaders,labels);
// Spread nearby labels without changing their geographic anchors.
const offsets=[[0,0]];
for(let radius=1;radius<=8;radius++)for(let x=-radius;x<=radius;x++)for(let y=-radius;y<=radius;y++)if(Math.max(Math.abs(x),Math.abs(y))===radius)offsets.push([x*44,y*40]);
offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
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
  const changed=controls.update();renderer.render(scene,camera);
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
    const material=new THREE.MeshBasicMaterial({color:0x1a73e8,transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
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
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='byu-calendar-map'||event.data.type!=='update')return;
  groups=Array.isArray(event.data.groups)?event.data.groups:[];focus=event.data.focus||null;
  if(!ready)return;
  const filtersChanged=filterKey!==event.data.filterKey;filterKey=event.data.filterKey;
  if(!focus)selectedId=null;
  buildPins();
  if(focus&&focusToken!==event.data.focusToken){focusToken=event.data.focusToken;const token=focusToken;highlight(focus);fly(new THREE.Vector3(...focus.position),23,false,()=>send({type:'focused',token}));}
  else if(!focus){selectedId=null;clearHighlight();if(filtersChanged)fit();}
});
try{
  scene=new THREE.Scene();scene.background=new THREE.Color('#e4e9df');
  camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.08,650);camera.position.set(34,51,49);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Campus map. Arrow keys pan. Plus and minus zoom. Use location buttons below the map to browse events.');stage.prepend(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x899b7c,2));const sun=new THREE.DirectionalLight(0xfff6e6,2.8);sun.position.set(-35,70,20);scene.add(sun);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(1,1,-5);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=3;controls.maxDistance=280;controls.maxPolarAngle=Math.PI*.47;controls.zoomToCursor=true;controls.screenSpacePanning=true;controls.addEventListener('change',invalidate);controls.addEventListener('start',()=>{flight=null;});
 // Wheel over a pin button never reaches the canvas, so those gestures zoom
 // through the same public helper the +/- buttons use — never private
 // OrbitControls internals. Pins answer taps only: no pointer forwarding into
 // the controls, so touching a pin can never leave the camera half-engaged
 // (the old forwarding captured the pointer and locked touch look-around).
addEventListener('wheel',event=>{event.preventDefault();if(event.target!==renderer.domElement)zoom(event.deltaY<0?.9:1.1);},{passive:false});
labels.addEventListener('contextmenu',event=>event.preventDefault());
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);invalidate();});
  const zoom=factor=>{flight=null;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);invalidate();};
  document.getElementById('reset').onclick=reset;document.getElementById('fit').onclick=fit;
  document.getElementById('top').onclick=()=>fly(controls.target.clone(),camera.position.distanceTo(controls.target),true);
  document.getElementById('in').onclick=()=>zoom(.8);document.getElementById('out').onclick=()=>zoom(1.25);
  renderer.domElement.addEventListener('keydown',event=>{const d={ArrowLeft:[-2,0,0],ArrowRight:[2,0,0],ArrowUp:[0,0,-2],ArrowDown:[0,0,2]}[event.key];if(d){event.preventDefault();flight=null;const delta=new THREE.Vector3(...d);camera.position.add(delta);controls.target.add(delta);invalidate();}if(event.key==='+'||event.key==='='){event.preventDefault();zoom(.8);}if(event.key==='-'){event.preventDefault();zoom(1.25);}});
  let down=null,pointers=new Set(),dragged=false;
  renderer.domElement.addEventListener('pointerdown',event=>{pointers.add(event.pointerId);if(pointers.size>1)dragged=true;else{down=[event.clientX,event.clientY];dragged=false;}});
  renderer.domElement.addEventListener('pointermove',event=>{if(down&&Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)dragged=true;});
  renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);if(!ready||!down||dragged||event.button!==0)return;down=null;
    pointer.set(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(pickMeshes,false)[0];if(!hit)return;
    const index=Math.round(hit.object.geometry.getAttribute('_feature_id').getX(hit.face.a)),feature=features.find(f=>f.featureIndex===index);
    if(feature){const group=groups.find(g=>g.location.featureIds.includes(feature.id));select(group?.location||{id:feature.id,featureIds:[feature.id],name:feature.name,position:feature.labelPosition});}
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();loading.hidden=false;loading.textContent='3D graphics paused. Reload the page to restore the map. Events are still available below.';send({type:'error'});});
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf,catalog]=await Promise.all([loader.loadAsync('./campus_web.glb?v=20261102pins1'),fetch('./coordinates.json?v=20261102pins1').then(r=>{if(!r.ok)throw new Error('Location data unavailable');return r.json();})]);
  model=gltf.scene;features=catalog.features;scene.add(model);model.updateMatrixWorld(true);model.traverse(o=>{if(o.isMesh&&o.geometry.getAttribute('_feature_id'))pickMeshes.push(o);});
  ready=true;loading.hidden=true;reset();buildPins();send({type:'ready'});
  loadValleyContext(loader,scene,camera,invalidate);
}catch(error){loading.hidden=false;loading.textContent='The 3D map could not load. You can still browse locations and events below.';send({type:'error'});console.error(error);}
