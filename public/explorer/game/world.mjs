/** Campus rendering and lightweight, spatially indexed gameplay collision.
 * Native GLB coordinates are retained: 0.044571444392204285 units = one meter.
 * This module has no eager renderer imports so its geometry rules are testable.
 */
import {stabilizeMountainY} from './valley-rendering.mjs?v=20261102polish6';
import {applyCampusPaving,createCampusFixtures} from './place-art.mjs?v=20261102polish6';

const UNIT = 0.044571444392204285;
const CELL = 1;
const HEIGHT = 1.75 * UNIT;
const STEP_HEIGHT = .45 * UNIT;
const EPS = 1e-7;

/** Lazy optional-zone lifecycle. A cancelled request cannot activate scenery
 * after return/reset/Exit, and failed requests remain retryable. */
export function createHikeManager({load,mask=()=>()=>{}}){
  let active=null,pending=null,abort=null,restoreMask=null,generation=0,disposed=false;
  const cancelled=()=>Object.assign(new Error('Hiking load cancelled.'),{name:'AbortError'});
  function refreshMask(){restoreMask?.();restoreMask=null;if(active)restoreMask=mask(active);}
  function unloadHike(){generation++;abort?.abort();abort=null;pending=null;restoreMask?.();restoreMask=null;active?.dispose();active=null;}
  function loadHike(onProgress=()=>{}){
    if(disposed)return Promise.reject(cancelled());
    if(active)return Promise.resolve(active);
    if(pending)return pending;
    const request=++generation,controller=new AbortController();abort=controller;
    const promise=Promise.resolve().then(()=>load({signal:controller.signal,onProgress})).then(result=>{
      if(disposed||controller.signal.aborted||generation!==request){result.dispose();throw cancelled();}
      active=result;
      try{refreshMask();}catch(error){active=null;result.dispose();restoreMask?.();restoreMask=null;throw error;}
      return result;
    }).finally(()=>{if(pending===promise)pending=null;if(abort===controller)abort=null;});
    pending=promise;return promise;
  }
  return {loadHike,unloadHike,getHike:()=>active,refreshMask,dispose(){disposed=true;unloadHike();}};
}

function key(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }
function eachCell(minX, minZ, maxX, maxZ, callback) {
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) callback(`${x},${z}`);
  }
}
function closestPoint(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
  return {x: ax + dx * t, z: az + dz * t};
}

/** Triangle inputs use arrays in world space and kind 'ground' or 'wall'. */
export function createCollisionIndex(triangles) {
  const grounds = new Map(), walls = new Map();
  const wallKeys=new Set();
  // Packed 64-bit coordinate pages avoid three arrays and nine boxed numbers
  // per ground triangle. Stream directly from the decoder, without a second
  // complete copy of the campus geometry in JavaScript objects.
  let groundPage=new Float64Array(9*4096),groundOffset=0;
  let groundCount = 0, wallCount = 0;
  function addWall(wall) {
    if (Math.hypot(wall.bx - wall.ax, wall.bz - wall.az) < .008) return;
    const ends=[[wall.ax,wall.az],[wall.bx,wall.bz]].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const signature=[...ends[0],...ends[1],wall.minY,wall.maxY].map(v=>Math.round(v*100000)).join(',');
    if(wallKeys.has(signature))return;
    wallKeys.add(signature);
    const minX=Math.min(wall.ax,wall.bx),maxX=Math.max(wall.ax,wall.bx);
    const minZ=Math.min(wall.az,wall.bz),maxZ=Math.max(wall.az,wall.bz);
    eachCell(minX-.1,minZ-.1,maxX+.1,maxZ+.1,cell=>{
      if (!walls.has(cell)) walls.set(cell, []);
      walls.get(cell).push(wall);
    });
    wallCount++;
  }
  for (const {a, b, c, kind, surface = 0} of triangles) {
    if (![...a, ...b, ...c].every(Number.isFinite)) continue;
    const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]);
    const minZ = Math.min(a[2], b[2], c[2]), maxZ = Math.max(a[2], b[2], c[2]);
    // Reject unreasonable spans instead of allocating an unbounded grid.
    if (maxX - minX > 200 || maxZ - minZ > 200) continue;
    if (kind === 'ground') {
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      // Terrain fitting makes narrow triangles at shared edges. They remain
      // visible after compression and must also support feet and wheels.
      if (Math.abs(denominator) < 1e-12) continue;
      if(groundOffset>=groundPage.length){groundPage=new Float64Array(9*4096);groundOffset=0;}
      groundPage.set(a,groundOffset);groundPage.set(b,groundOffset+3);groundPage.set(c,groundOffset+6);
      const triangle = {data:groundPage,offset:groundOffset,inverse:1/denominator,surface};groundOffset+=9;
      eachCell(minX, minZ, maxX, maxZ, cell => {
        if (!grounds.has(cell)) grounds.set(cell, []);
        grounds.get(cell).push(triangle);
      });
      groundCount++;
    } else if (kind === 'wall') {
      const pairs = [[a, b], [b, c], [c, a]];
      pairs.sort((p, q) => Math.hypot(q[0][0] - q[1][0], q[0][2] - q[1][2]) - Math.hypot(p[0][0] - p[1][0], p[0][2] - p[1][2]));
      const [p, q] = pairs[0];
      addWall({ax:p[0],az:p[2],bx:q[0],bz:q[2],minY:Math.min(a[1],b[1],c[1]),maxY:Math.max(a[1],b[1],c[1])});
    }
  }
  function groundHeight(x, z, referenceY, surfaceOnly=false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let base=Infinity,ordinary=-Infinity,bridge=-Infinity,ordinarySurface=0;
    const legacy=[];
    for (const t of grounds.get(key(x,z)) || []) {
      const {data:d,offset:o,inverse}=t;
      const u=((d[o+5]-d[o+8])*(x-d[o+6])+(d[o+6]-d[o+3])*(z-d[o+8]))*inverse;
      const v=((d[o+8]-d[o+2])*(x-d[o+6])+(d[o]-d[o+6])*(z-d[o+8]))*inverse;
      if(u < -EPS || v < -EPS || u+v > 1+EPS)continue;
      const height=u*d[o+1]+v*d[o+4]+(1-u-v)*d[o+7];
      base=Math.min(base,height);
      if(t.surface===7){if(Number.isFinite(referenceY)&&height<=referenceY+STEP_HEIGHT)bridge=Math.max(bridge,height);}
      else if(t.surface>0){
        if(surfaceOnly&&height>=ordinary)ordinarySurface=height===ordinary?Math.max(ordinarySurface,t.surface):t.surface;
        ordinary=Math.max(ordinary,height);
      }
      else legacy.push(height);
    }
    if(!Number.isFinite(base))return null;
    // Explicit surface labels survive mesh batching. Ordinary paving follows
    // the terrain; a bridge is selected only when reached at deck height, so a
    // player can also pass below it. Old unlabelled geometry keeps its guard.
    if(!Number.isFinite(ordinary))for(const height of legacy)if(height<=base+.025)ordinary=Math.max(ordinary,height);
    if(bridge>=ordinary&&Number.isFinite(bridge))return surfaceOnly?7:bridge;
    if(surfaceOnly)return Number.isFinite(ordinary)?ordinarySurface:null;
    return Number.isFinite(ordinary)?ordinary:null;
  }
  function supportHeight(x,z,referenceY,radius=.20*UNIT){
    const center=groundHeight(x,z,referenceY);
    if(center===null)return null;
    let height=center;
    // Shoes and wheels occupy an area. Sampling only the origin leaves their
    // edges inside uphill paving, especially on a scooter at a curb.
    for(const [dx,dz]of[[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const sample=groundHeight(x+dx,z+dz,referenceY);
      if(sample!==null&&sample-center<=STEP_HEIGHT)height=Math.max(height,sample);
    }
    return height;
  }
  function groundPose(x,z,heading=0,referenceY){
    const center=groundHeight(x,z,referenceY);
    if(center===null)return null;
    const length=.43*UNIT,width=.14*UNIT,s=Math.sin(heading),c=Math.cos(heading);
    const front=groundHeight(x+s*length,z+c*length,referenceY)??center;
    const back=groundHeight(x-s*length,z-c*length,referenceY)??center;
    const right=groundHeight(x+c*width,z-s*width,referenceY)??center;
    const left=groundHeight(x-c*width,z+s*width,referenceY)??center;
    return {height:Math.max(center,(front+back)/2,(left+right)/2),pitch:-Math.atan2(front-back,2*length),roll:Math.atan2(right-left,2*width)};
  }
  function candidates(x,z,radius) {
    const result = new Set();
    eachCell(x-radius,z-radius,x+radius,z+radius,cell => {
      for (const wall of walls.get(cell)||[]) result.add(wall);
    });
    return result;
  }
  function move(position, delta, radius = .32 * UNIT, {grounded=true}={}) {
    const result = {x:position.x,y:position.y,z:position.z};
    if (![position.x,position.y,position.z,delta.x,delta.z,radius].every(Number.isFinite) || radius <= 0) return result;
    const count = Math.max(1, Math.min(160, Math.ceil(Math.hypot(delta.x,delta.z)/(radius*.6))));
    const dx=delta.x/count, dz=delta.z/count;
    for(let step=0;step<count;step++) {
      let x=result.x+dx,z=result.z+dz;
      for(let iteration=0;iteration<3;iteration++) {
        for(const wall of candidates(x,z,radius)) {
          if (wall.maxY < result.y+.012 || wall.minY > result.y+HEIGHT) continue;
          const p=closestPoint(x,z,wall.ax,wall.az,wall.bx,wall.bz);
          let nx=x-p.x,nz=z-p.z,distance=Math.hypot(nx,nz);
          if(distance>=radius)continue;
          if(distance < 1e-8) {
            const old=closestPoint(result.x,result.z,wall.ax,wall.az,wall.bx,wall.bz);
            nx=result.x-old.x;nz=result.z-old.z;distance=Math.hypot(nx,nz);
            if(distance<1e-8){nx=wall.bz-wall.az;nz=wall.ax-wall.bx;distance=Math.hypot(nx,nz)||1;}
          }
          const push=radius-Math.hypot(x-p.x,z-p.z)+1e-6;
          x+=nx/distance*push;z+=nz/distance*push;
        }
      }
      const ground=groundHeight(x,z,result.y);
      // Prevent a walk into absent geometry or a vertical terrain cliff.
      const previousGround=groundHeight(result.x,result.z,result.y);
      if(ground !== null && (previousGround===null || ground-previousGround<=STEP_HEIGHT)) {
        result.x=x;result.z=z;
        // Update support at each substep: later walls/steps must be tested at
        // the new elevation, not the height at the beginning of a long move.
        if(grounded&&Math.abs(ground-result.y)<=STEP_HEIGHT)result.y=ground;
      }
    }
    return result;
  }
  function obstructedCamera(target,desired) {
    const dx=desired.x-target.x,dy=desired.y-target.y,dz=desired.z-target.z;
    const length=Math.hypot(dx,dy,dz),steps=Math.max(1,Math.ceil(length/.025));
    let last={x:target.x,y:target.y,z:target.z};
    for(let i=1;i<=steps;i++){
      const t=i/steps,p={x:target.x+dx*t,y:target.y+dy*t,z:target.z+dz*t};
      const ground=groundHeight(p.x,p.z);
      if(ground!==null&&p.y<ground+.015)return last;
      for(const wall of candidates(p.x,p.z,.025)) {
        if(p.y<wall.minY-.01||p.y>wall.maxY+.01)continue;
        const near=closestPoint(p.x,p.z,wall.ax,wall.az,wall.bx,wall.bz);
        if(Math.hypot(p.x-near.x,p.z-near.z)<.025)return last;
      }
      last=p;
    }
    return last;
  }
  wallKeys.clear();
  return {groundHeight,groundSurface:(x,z,y)=>groundHeight(x,z,y,true),supportHeight,groundPose,move,cameraPosition:obstructedCamera,addWall,
    get stats(){return {groundTriangles:groundCount,wallTriangles:wallCount,groundCells:grounds.size,wallCells:walls.size};}};
}

const SKY_VERTEX = `varying vec3 vDirection; void main(){vDirection=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww;}`;
const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDirection;
uniform vec3 topColor, horizonColor, sunDirection;
uniform float clock, night;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07);}
void main(){
 vec3 d=normalize(vDirection);float h=max(0.,d.y);
 vec3 color=mix(horizonColor,topColor,pow(smoothstep(-.025,.8,d.y),.65));
 float sun=max(dot(d,sunDirection),0.);
 color+=vec3(1.,.56,.20)*pow(sun,22.)*.23*(1.-night);
 color=mix(color,vec3(1.,.93,.69),smoothstep(.9994,.99985,sun)*(1.-night));
 if(d.y>.04){vec2 uv=d.xz/(d.y+.20)*2.6+vec2(clock*.006,clock*.002);
 float clouds=smoothstep(.49,.77,fbm(uv));clouds*=smoothstep(.04,.23,d.y)*(1.-night*.75);
 color=mix(color,mix(vec3(1.,.81,.67),vec3(.24,.29,.46),night),clouds*.69);
 vec2 starsUV=vec2(atan(d.z,d.x),asin(d.y))*vec2(230.,240.);
 float stars=step(.996,hash(floor(starsUV)))*pow(max(0.,1.-length(fract(starsUV)-.5)*2.),8.);
 color+=stars*night*vec3(.8,.88,1.);
 }
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Loads visual campus, collision, scenery, and one coordinated sky controller. */
export async function createWorld({scene,renderer,onProgress=()=>{}}) {
  const THREE=await import('/campus/vendor/three.module.js');
  const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
    import('/campus/vendor/addons/loaders/GLTFLoader.js'),
    import('/campus/vendor/meshopt_decoder.module.js')
  ]);
  let disposed=false;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  onProgress('Downloading campus',.08);
  const [gltf,catalog]=await Promise.all([
    loader.loadAsync('/explorer/campus/campus_web.glb?v=20261102buildings2',event=>{
      if(event.total)onProgress('Downloading campus',.08+.52*event.loaded/event.total);
    }),
    fetch('/explorer/campus/coordinates.json?v=20261102buildings2').then(response=>{if(!response.ok)throw new Error('Campus locations could not load');return response.json();})
  ]);
  const model=gltf.scene;model.updateMatrixWorld(true);
  const types=new Map(catalog.features.map(f=>[f.featureIndex,f.category]));
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  const meshes=[];model.traverse(object=>{if(object.isMesh)meshes.push(object);});
  onProgress('Preparing paths and buildings',.64);
  function* collisionTriangles(){for(let mi=0;mi<meshes.length;mi++){
    const mesh=meshes[mi],positions=mesh.geometry.getAttribute('position'),feature=mesh.geometry.getAttribute('_feature_id'),surfaces=mesh.geometry.getAttribute('_surface'),index=mesh.geometry.index;
    const count=index?.count??positions.count;
    for(let i=0;i<count;i+=3){
      const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;
      a.fromBufferAttribute(positions,ai).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(positions,bi).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(positions,ci).applyMatrix4(mesh.matrixWorld);
      normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));
      const length=normal.length();if(length<1e-10)continue;
      const up=normal.y/length,id=feature?Math.round(feature.getX(ai)):0,type=types.get(id);
      const background=id===0||type==='landscape'||type==='athletics';
      const surface=surfaces?Math.round(surfaces.getX(ai)):0;
      let kind;
      if((surfaces?surface>0:background)&&up>.60)kind='ground';
      else if(Math.abs(up)<.62&&type!=='water')kind='wall';
      if(kind)yield {a:a.toArray(),b:b.toArray(),c:c.toArray(),kind,surface};
    }
  }}
  await new Promise(resolve=>setTimeout(resolve,0));
  const collision=createCollisionIndex(collisionTriangles());
  const fixtures=createCampusFixtures(THREE,collision);
  fixtures.walls.forEach(collision.addWall);
  applyCampusPaving(model);
  model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
  scene.add(model,fixtures.root);
  const bounds=new THREE.Box3().setFromObject(model);
  const hemi=new THREE.HemisphereLight(0xffe6c8,0x80927c,2.2);
  const sun=new THREE.DirectionalLight(0xffd1a3,3.1);sun.position.set(-55,65,32);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-3;sun.shadow.camera.right=3;sun.shadow.camera.top=3;sun.shadow.camera.bottom=-3;sun.shadow.camera.near=.1;sun.shadow.camera.far=50;sun.shadow.bias=-.00003;sun.shadow.normalBias=.001;sun.shadow.radius=2;sun.shadow.camera.updateProjectionMatrix();
  scene.add(hemi,sun,sun.target);let shadowDirection=sun.position.clone().normalize();
  const uniforms={topColor:{value:new THREE.Color('#668bd0')},horizonColor:{value:new THREE.Color('#f5ceb0')},sunDirection:{value:sun.position.clone().normalize()},clock:{value:0},night:{value:0}};
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1400,32,20),new THREE.ShaderMaterial({uniforms,vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:THREE.BackSide,depthWrite:false}));
  sky.name='Explorer atmospheric sky';sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  scene.fog=new THREE.Fog('#e9ccb5',80,1100);
  const presets={
    sunset:{top:'#6485c4',horizon:'#f7c6a0',light:'#ffd0a0',ground:'#8d8c78',sun:[-55,48,25],ambient:2.1,power:3.1,night:0,fog:'#e7c8b1',exposure:1.05},
    day:{top:'#4e8bce',horizon:'#d1e7ed',light:'#fff5df',ground:'#829882',sun:[-30,95,15],ambient:2.4,power:2.8,night:0,fog:'#d5e1dc',exposure:1.05},
    night:{top:'#10182f',horizon:'#596580',light:'#9cb7ec',ground:'#384b5d',sun:[-45,55,-30],ambient:1.45,power:.8,night:1,fog:'#46546c',exposure:1.0}
  };
  let cycle=false,cycleStart=null,currentTime='sunset',cycleBase='sunset';
  function setTime(name='sunset'){
    currentTime=Object.hasOwn(presets,name)?name:'sunset';
    const p=presets[name]||presets.sunset;
    uniforms.topColor.value.set(p.top);uniforms.horizonColor.value.set(p.horizon);uniforms.night.value=p.night;
    sun.color.set(p.light);sun.intensity=p.power;sun.position.fromArray(p.sun);uniforms.sunDirection.value.copy(sun.position).normalize();
    shadowDirection.copy(uniforms.sunDirection.value);
    hemi.intensity=p.ambient;hemi.groundColor.set(p.ground);scene.fog.color.set(p.fog);scene.background=new THREE.Color(p.fog);
    if(renderer){renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=p.exposure;renderer.outputColorSpace=THREE.SRGBColorSpace;}
  }
  setTime();
  let valley,hikeModule;
  const hiking=createHikeManager({
    async load(options){
      hikeModule=await import('./hike-world.mjs?v=20261102polish6');
      return hikeModule.loadHikingWorld({scene,THREE,...options});
    },
    mask(controller){if(!valley)return()=>{};controller.matchBoundary?.(valley);return hikeModule.maskValleyForHike(valley,controller.bounds,THREE);}
  });
  // Optional horizon scenery does not delay ready or replace the game sky.
  loader.loadAsync('/campus/valley_lod.glb?v=20261027mapsplit1').then(result=>{
    if(disposed){result.scene.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});return;}
    valley=result.scene;valley.name='Explorer distant valley';stabilizeMountainY(valley);hiking.refreshMask();scene.add(valley);
  }).catch(()=>{/* The explorable campus remains playable without distant scenery. */});
  onProgress('Campus ready',1);
  return {
    model,bounds,features:catalog.features,stats:collision.stats,
    loadHike:hiking.loadHike,unloadHike:hiking.unloadHike,getHike:hiking.getHike,
    groundHeight(x,z,referenceY){const h=hiking.getHike();return h?.contains(x,z)?h.groundHeight(x,z,referenceY):collision.groundHeight(x,z,referenceY);},
    groundSurface(x,z,referenceY){return hiking.getHike()?.contains(x,z)?'trail':collision.groundSurface(x,z,referenceY);},
    supportHeight(x,z,referenceY,radius){const h=hiking.getHike();return h?.contains(x,z)?h.supportHeight(x,z,referenceY,radius):collision.supportHeight(x,z,referenceY,radius);},
    groundPose(x,z,heading,referenceY){const h=hiking.getHike();return h?.contains(x,z)?h.groundPose(x,z,heading,referenceY):collision.groundPose(x,z,heading,referenceY);},
    move(position,delta,radius,options){const h=hiking.getHike(),index=h?.contains(position.x,position.z)?h:collision;const p=index.move(position,delta,radius,options);return new THREE.Vector3(p.x,p.y,p.z);},
    cameraPosition(target,desired){const h=hiking.getHike(),index=h?.contains(target.x,target.z)?h:collision;const p=index.cameraPosition(target,desired);return new THREE.Vector3(p.x,p.y,p.z);},
    setTime,
    setQuality(quality){if(renderer?.shadowMap){renderer.shadowMap.enabled=quality!=='low';renderer.shadowMap.type=THREE.PCFSoftShadowMap;}},
    setShadowTarget(point){sun.target.position.copy(point);sun.position.copy(point).addScaledVector(shadowDirection,20);},
    setCycle(value){cycle=!!value;cycleStart=null;cycleBase=currentTime;},getTime(){return currentTime;},
    update(dt,time){uniforms.clock.value=Number.isFinite(time)?time:uniforms.clock.value+dt;if(cycle){if(cycleStart===null)cycleStart=uniforms.clock.value;const order=['sunset','night','day'],phase=(uniforms.clock.value-cycleStart)/240,index=(Math.floor(phase)+order.indexOf(cycleBase))%3,t=phase%1,a=presets[order[index]],b=presets[order[(index+1)%3]],color=new THREE.Color();currentTime=order[(index+(t>.5?1:0))%3];const blend=(target,one,two)=>target.set(one).lerp(color.set(two),t);blend(uniforms.topColor.value,a.top,b.top);blend(uniforms.horizonColor.value,a.horizon,b.horizon);uniforms.night.value=a.night+(b.night-a.night)*t;blend(sun.color,a.light,b.light);blend(hemi.groundColor,a.ground,b.ground);blend(scene.fog.color,a.fog,b.fog);sun.intensity=a.power+(b.power-a.power)*t;hemi.intensity=a.ambient+(b.ambient-a.ambient)*t;sun.position.fromArray(a.sun).lerp(new THREE.Vector3(...b.sun),t);uniforms.sunDirection.value.copy(sun.position).normalize();shadowDirection.copy(uniforms.sunDirection.value);}},
    dispose(){
      disposed=true;
      hiking.dispose();
      for(const object of [model,fixtures.root,valley,sky])if(object){scene.remove(object);object.traverse(child=>{if(child.isMesh){if(child.isInstancedMesh)child.dispose();child.geometry.dispose();for(const material of Array.isArray(child.material)?child.material:[child.material])material.dispose();}});}
      scene.remove(hemi,sun,sun.target);hemi.dispose?.();sun.dispose?.();
    }
  };
}
