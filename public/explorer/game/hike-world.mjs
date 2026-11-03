/** The hiking tile is requested only by world.loadHike(). All coordinates retain
 * the campus UTM origin/scale. Feet use the same triangulated DEM as the visible
 * mountainside; the route is a bounded path, not permission to climb cliffs.
 */
export const HIKE_UNIT = .044571444392204285;
export const HIKE_DATA_URL = '/explorer/hike/route.json?v=20261102hike1';
const U = HIKE_UNIT;
const finitePoint = p => p && [p.x,p.y,p.z].every(Number.isFinite);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const abortError = () => Object.assign(new Error('Hiking load cancelled.'),{name:'AbortError'});

export function validateHikeData(data, heights) {
  const t=data?.terrain;
  if(data?.revision!=='20261102hike1'||!t||!Number.isFinite(data.unit)||Math.abs(data.unit-U)>1e-10||
    ![t.width,t.height].every(v=>Number.isInteger(v)&&v>=2&&v<=2500)||
    t.width*t.height>1_500_000||![t.minX,t.minZ,t.stepX,t.stepZ].every(Number.isFinite)||t.stepX<=0||t.stepZ<=0||
    !(heights instanceof Float32Array)||heights.length!==t.width*t.height||
    !Array.isArray(data.points)||data.points.length<2||data.points.length>10000||
    !data.points.every(finitePoint)||!Array.isArray(data.checkpoints)||data.checkpoints.length<2||data.checkpoints.length>100)
    throw Error('The hiking data is incomplete. Return to campus and try again.');
  for(const height of heights)if(!Number.isFinite(height)||height < -100||height > 300)throw Error('Invalid hiking elevation.');
  const maxX=t.minX+(t.width-1)*t.stepX,maxZ=t.minZ+(t.height-1)*t.stepZ;
  if(data.branches!==undefined&&(!Array.isArray(data.branches)||data.branches.length>10||data.branches.some(branch=>typeof branch.id!=='string'||!Array.isArray(branch.points)||branch.points.length<2||branch.points.length>10000||!branch.points.every(finitePoint))))throw Error('Invalid hiking branch.');
  if([data.points,...(data.branches||[]).map(b=>b.points)].flat().some(p=>p.x<t.minX||p.x>maxX||p.z<t.minZ||p.z>maxZ))throw Error('Trail extends beyond its terrain.');
  if(!Array.isArray(data.y?.outline)||data.y.outline.length<3||data.y.outline.length>500||data.y.outline.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<t.minX||p[0]>maxX||p[1]<t.minZ||p[1]>maxZ))throw Error('The actual Y outline is missing or outside its terrain.');
  const ids=new Set();
  for(const point of data.checkpoints){
    if(!finitePoint(point)||typeof point.id!=='string'||point.id.length>80||ids.has(point.id)||!Number.isInteger(point.pointIndex)||!data.points[point.pointIndex])throw Error('Invalid hiking checkpoint.');
    ids.add(point.id);
  }
  return data;
}

/** Pure DEM sampler/movement rules, shared by runtime and the route audit. */
export function createHikeSurface(data, heights) {
  validateHikeData(data,heights);
  const t=data.terrain,bounds={minX:t.minX,minZ:t.minZ,maxX:t.minX+(t.width-1)*t.stepX,maxZ:t.minZ+(t.height-1)*t.stepZ};
  const route=data.points.map(p=>({...p})),routes=[{id:'main',points:route},...(data.branches||[]).map(b=>({id:b.id,points:b.points.map(p=>({...p}))}))];
  const halfWidth=clamp(Number(data.trailWidthMeters)||2.4,1.6,5)*U/2;
  const routeCell=12*U,segments=new Map();
  const cell=(x,z)=>`${Math.floor(x/routeCell)},${Math.floor(z/routeCell)}`;
  const allSegments=[];
  for(const path of routes){let distance=0;path.points[0].distanceMeters=0;
  for(let i=0;i<path.points.length-1;i++){
    const a=path.points[i],b=path.points[i+1],id=allSegments.length;
    distance+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/U;
    path.points[i+1].distanceMeters=distance;allSegments.push({a,b,index:i,routeId:path.id});
    for(let x=Math.floor((Math.min(a.x,b.x)-halfWidth-2*U)/routeCell);x<=Math.floor((Math.max(a.x,b.x)+halfWidth+2*U)/routeCell);x++)
      for(let z=Math.floor((Math.min(a.z,b.z)-halfWidth-2*U)/routeCell);z<=Math.floor((Math.max(a.z,b.z)+halfWidth+2*U)/routeCell);z++){
        const key=`${x},${z}`;if(!segments.has(key))segments.set(key,[]);segments.get(key).push(id);
      }
  }}
  const contains=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
  function groundHeight(x,z){
    if(!contains(x,z))return null;
    const gx=clamp((x-t.minX)/t.stepX,0,t.width-1),gz=clamp((z-t.minZ)/t.stepZ,0,t.height-1);
    const col=Math.min(t.width-2,Math.floor(gx)),row=Math.min(t.height-2,Math.floor(gz)),fx=gx-col,fz=gz-row;
    const a=heights[row*t.width+col],b=heights[row*t.width+col+1],c=heights[(row+1)*t.width+col],d=heights[(row+1)*t.width+col+1];
    // Matches the a,c,b / b,c,d triangles emitted below, including their seam.
    return fx+fz<=1?a+(b-a)*fx+(c-a)*fz:d+(c-d)*(1-fx)+(b-d)*(1-fz);
  }
  function nearestRoute(x,z,{full=false}={}){
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const indexes=full?allSegments.map((_,i)=>i):segments.get(cell(x,z))||[];
    let best=null;
    for(const id of indexes){
      const {a,b,index,routeId}=allSegments[id],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
      const fraction=length?clamp(((x-a.x)*dx+(z-a.z)*dz)/length,0,1):0;
      const px=a.x+dx*fraction,pz=a.z+dz*fraction,d=Math.hypot(x-px,z-pz);
      if(!best||d<best.distance)best={index,routeId,t:fraction,x:px,z:pz,y:groundHeight(px,pz),distance:d,distanceMeters:a.distanceMeters+(b.distanceMeters-a.distanceMeters)*fraction};
    }
    return best;
  }
  const pads=data.checkpoints.filter(p=>['trailhead','base','top','summit'].includes(p.kind));
  function walkable(x,z,radius=0){
    if(!contains(x,z))return false;
    if(pads.some(p=>Math.hypot(x-p.x,z-p.z)<=Math.max(halfWidth,4*U-radius)))return true;
    const nearest=nearestRoute(x,z);
    return !!nearest&&nearest.distance<=Math.max(.25*U,halfWidth-radius);
  }
  function supportHeight(x,z,_referenceY,radius=.20*U){
    const center=groundHeight(x,z);if(center===null)return null;
    let height=center;
    for(const [dx,dz]of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const h=groundHeight(x+dx,z+dz);if(h!==null&&h-center<=.45*U)height=Math.max(height,h);
    }
    return height;
  }
  function groundPose(x,z,heading=0){
    const center=groundHeight(x,z);if(center===null)return null;
    const length=.43*U,width=.14*U,s=Math.sin(heading),c=Math.cos(heading);
    const front=groundHeight(x+s*length,z+c*length)??center,back=groundHeight(x-s*length,z-c*length)??center;
    const right=groundHeight(x+c*width,z-s*width)??center,left=groundHeight(x-c*width,z+s*width)??center;
    return {height:Math.max(center,(front+back)/2,(left+right)/2),pitch:-Math.atan2(front-back,2*length),roll:Math.atan2(right-left,2*width)};
  }
  function move(position,delta,radius=.32*U,{grounded=true}={}){
    const result={x:position.x,y:position.y,z:position.z};
    if(!finitePoint(position)||![delta.x,delta.z,radius].every(Number.isFinite)||radius<=0)return result;
    const count=Math.max(1,Math.min(2000,Math.ceil(Math.hypot(delta.x,delta.z)/(radius*.5))));
    const dx=delta.x/count,dz=delta.z/count;
    for(let i=0;i<count;i++){
      // Axis alternatives allow gentle sliding along the visible path edge.
      for(const [x,z]of [[result.x+dx,result.z+dz],[result.x+dx,result.z],[result.x,result.z+dz]]){
        if(!walkable(x,z,radius))continue;
        const height=groundHeight(x,z),old=groundHeight(result.x,result.z);
        if(height===null||old!==null&&Math.abs(height-old)>.45*U)continue;
        result.x=x;result.z=z;if(grounded)result.y=height;break;
      }
    }
    return result;
  }
  function cameraPosition(target,desired){
    if(!finitePoint(target)||!finitePoint(desired))return {...target};
    const count=Math.max(1,Math.min(10000,Math.ceil(Math.hypot(desired.x-target.x,desired.y-target.y,desired.z-target.z)/(.25*U))));
    let last={...target};
    for(let i=1;i<=count;i++){
      const ratio=i/count,p={x:target.x+(desired.x-target.x)*ratio,y:target.y+(desired.y-target.y)*ratio,z:target.z+(desired.z-target.z)*ratio};
      const floor=groundHeight(p.x,p.z);if(floor!==null&&p.y<floor+.22*U)return last;last=p;
    }
    return last;
  }
  return {data:{...data,route},route,routes,checkpoints:data.checkpoints,bounds,contains,terrainHeight:groundHeight,groundHeight,supportHeight,groundPose,move,cameraPosition,nearestRoute,walkable,
    stats:{terrainVertices:heights.length,terrainTriangles:(t.width-1)*(t.height-1)*2,routePoints:routes.reduce((sum,r)=>sum+r.points.length,0),lengthMeters:route.at(-1).distanceMeters}};
}

/** Sutherland–Hodgman split, retaining arbitrary interpolated vertex attributes. */
function splitPolygon(vertices,axis,value,keepGreater){
  const inside=[],outside=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],da=(a[axis]-value)*(keepGreater?1:-1),db=(b[axis]-value)*(keepGreater?1:-1);
    (da>=0?inside:outside).push(a);
    if((da>=0)!==(db>=0)){
      const ratio=da/(da-db),v=a.map((n,j)=>n+(b[j]-n)*ratio);inside.push(v);outside.push(v);
    }
  }
  return {inside,outside};
}

/** Subtract a rectangular tile from a coarse terrain triangle, without deleting
 * entire intersecting triangles (which would open a several-hundred-metre gap).
 */
export function clipTriangleOutsideBounds(triangle,bounds){
  let remaining=triangle,result=[];
  for(const [axis,value,greater]of [[0,bounds.minX,true],[0,bounds.maxX,false],[2,bounds.minZ,true],[2,bounds.maxZ,false]]){
    if(remaining.length<3)break;
    const {inside,outside}=splitPolygon(remaining,axis,value,greater);
    if(outside.length>=3)result.push(outside);remaining=inside;
  }
  return result;
}

/** Temporarily remove only the overlapping hillside and the decorative Y. The
 * shared GLB is untouched and the original geometry is restored on departure.
 */
export function maskValleyForHike(valley,bounds,THREE){
  const changed=[];
  valley.updateMatrixWorld(true);
  valley.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const original=mesh.geometry,position=original.getAttribute('position'),color=original.getAttribute('color'),index=original.index;
    if(!position||!index)return;
    const names=Object.keys(original.attributes),offsets={},stride=names.reduce((n,name)=>{offsets[name]=n;return n+original.attributes[name].itemSize;},0);
    const output=[],groups=[],inverse=mesh.matrixWorld.clone().invert(),vector=new THREE.Vector3();
    let groupMaterial=-1,groupStart=0;
    for(let i=0;i<index.count;i+=3){
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      const decorativeY=mesh.userData?.mountainY&&color&&ids.every(id=>color.getX(id)>.99&&color.getY(id)>.99&&color.getZ(id)>.99);
      if(decorativeY)continue;
      const materialIndex=original.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex||0;
      const vertices=ids.map(id=>{
        const values=[];for(const name of names){const attribute=original.attributes[name];for(let k=0;k<attribute.itemSize;k++)values.push(attribute.getComponent(id,k));}
        vector.fromArray(values,offsets.position).applyMatrix4(mesh.matrixWorld);values[offsets.position]=vector.x;values[offsets.position+1]=vector.y;values[offsets.position+2]=vector.z;return values;
      });
      // Geometry attributes conventionally begin with position, but clipping
      // always uses a temporary position-first record, independent of ordering.
      const p=offsets.position,positionFirst=vertices.map(v=>[v[p],v[p+1],v[p+2],...v]);
      for(const polygon of clipTriangleOutsideBounds(positionFirst,bounds))for(let n=1;n<polygon.length-1;n++){
        if(groupMaterial!==materialIndex){if(groupMaterial>=0)groups.push({start:groupStart,count:output.length/stride-groupStart,materialIndex:groupMaterial});groupMaterial=materialIndex;groupStart=output.length/stride;}
        for(const vertex of [polygon[0],polygon[n],polygon[n+1]]){
          const values=vertex.slice(3);vector.set(vertex[0],vertex[1],vertex[2]).applyMatrix4(inverse);values[p]=vector.x;values[p+1]=vector.y;values[p+2]=vector.z;output.push(...values);
        }
      }
    }
    if(groupMaterial>=0)groups.push({start:groupStart,count:output.length/stride-groupStart,materialIndex:groupMaterial});
    const geometry=new THREE.BufferGeometry();
    for(const name of names){const attribute=original.attributes[name],values=new Float32Array(output.length/stride*attribute.itemSize);for(let i=0;i<output.length/stride;i++)for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=output[i*stride+offsets[name]+k];geometry.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize));}
    for(const group of groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.computeBoundingSphere();mesh.geometry=geometry;changed.push({mesh,original,geometry});
  });
  return ()=>{for(const {mesh,original,geometry}of changed){if(mesh.geometry===geometry)mesh.geometry=original;geometry.dispose();}};
}

function createTerrainGeometry(surface,heights,THREE){
  const {terrain:t}=surface.data,positions=new Float32Array(heights.length*3),colors=new Float32Array(heights.length*3),indexes=new Uint32Array((t.width-1)*(t.height-1)*6);
  for(let row=0;row<t.height;row++)for(let col=0;col<t.width;col++){
    const id=row*t.width+col,x=t.minX+col*t.stepX,z=t.minZ+row*t.stepZ,y=heights[id];positions.set([x,y,z],id*3);
    const variation=((Math.sin(col*127.1+row*311.7)*43758.5453)%1+1)%1,high=clamp((y/U+1400-1600)/400,0,1);
    colors.set([.46+.14*high+variation*.045,.48-.015*high+variation*.04,.32+.045*high+variation*.025],id*3);
  }
  let k=0;for(let row=0;row<t.height-1;row++)for(let col=0;col<t.width-1;col++){const a=row*t.width+col,b=a+1,c=a+t.width,d=c+1;indexes.set([a,c,b,b,c,d],k);k+=6;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(new THREE.BufferAttribute(indexes,1));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

function createTrailGeometry(surface,THREE){
  const positions=[],width=(Number(surface.data.trailWidthMeters)||2.4)*U/2;
  const add=(x,z)=>positions.push(x,(surface.groundHeight(x,z)??0)+.02*U,z);
  for(const path of surface.routes)for(let i=0;i<path.points.length-1;i++){
    const a=path.points[i],b=path.points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-8)continue;
    const nx=-(b.z-a.z)/length*width,nz=(b.x-a.x)/length*width,count=Math.max(1,Math.ceil(length/(.75*U)));
    for(let j=0;j<count;j++){
      const f=j/count,g=(j+1)/count,x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,xx=a.x+(b.x-a.x)*g,zz=a.z+(b.z-a.z)*g;
      // Cross-trail subdivisions keep the ribbon fitted to the actual DEM.
      for(let lane=0;lane<4;lane++){
        const left=-1+lane*.5,right=left+.5;
        add(x+nx*left,z+nz*left);add(xx+nx*left,zz+nz*left);add(x+nx*right,z+nz*right);
        add(x+nx*right,z+nz*right);add(xx+nx*left,zz+nz*left);add(xx+nx*right,zz+nz*right);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}

function createLetterGeometry(surface,THREE){
  const outline=surface.data.y?.outline;if(!Array.isArray(outline)||outline.length<3||outline.length>500)return null;
  const points=outline.map(p=>new THREE.Vector2(p[0],p[1]));
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const faces=THREE.ShapeUtils.triangulateShape(points,[]),positions=[],t=surface.data.terrain;
  for(const face of faces){
    const triangle=face.map(id=>[points[id].x,0,points[id].y]);
    const minCol=clamp(Math.floor((Math.min(...triangle.map(p=>p[0]))-t.minX)/t.stepX),0,t.width-2),maxCol=clamp(Math.floor((Math.max(...triangle.map(p=>p[0]))-t.minX)/t.stepX),0,t.width-2);
    const minRow=clamp(Math.floor((Math.min(...triangle.map(p=>p[2]))-t.minZ)/t.stepZ),0,t.height-2),maxRow=clamp(Math.floor((Math.max(...triangle.map(p=>p[2]))-t.minZ)/t.stepZ),0,t.height-2);
    for(let row=minRow;row<=maxRow;row++)for(let col=minCol;col<=maxCol;col++){
      const x=t.minX+col*t.stepX,z=t.minZ+row*t.stepZ;
      let polygon=triangle;
      for(const [axis,value,greater]of [[0,x,true],[0,x+t.stepX,false],[2,z,true],[2,z+t.stepZ,false]])polygon=splitPolygon(polygon,axis,value,greater).inside;
      if(polygon.length<3)continue;
      // Split at the DEM cell diagonal so the letter follows every terrain
      // triangle, retaining depth testing even when viewed from behind the Y.
      const tagged=polygon.map(p=>[...p,(p[0]-x)/t.stepX+(p[2]-z)/t.stepZ]);
      const halves=splitPolygon(tagged,3,1,true);
      for(const half of [halves.inside,halves.outside])for(let i=1;i<half.length-1;i++)for(const v of [half[0],half[i],half[i+1]])positions.push(v[0],surface.groundHeight(v[0],v[2])+.04*U,v[2]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}

/** Original low-cost hiking art, not a surveyed vegetation/geology inventory.
 * Deterministic placements stay outside the path, Y and scenery seam.
 */
function createHikeVegetation(surface,THREE){
  const group=new THREE.Group();group.name='Authored hiking scrub and rocks';
  const scrubGeometry=new THREE.SphereGeometry(1,6,4),rockGeometry=new THREE.IcosahedronGeometry(1,0);
  const scrub=new THREE.InstancedMesh(scrubGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}),180);
  const rocks=new THREE.InstancedMesh(rockGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}),80);
  scrub.name='Native-looking hiking scrub';rocks.name='Scattered hiking rocks';scrub.count=rocks.count=0;
  const dummy=new THREE.Object3D(),color=new THREE.Color(),outline=surface.data.y.outline;
  const random=n=>{const value=Math.sin(n*127.1+93.7)*43758.5453;return value-Math.floor(value);};
  function nearLetter(x,z){
    let inside=false;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const a=outline[i],b=outline[j],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
      const t=length?clamp(((x-a[0])*dx+(z-a[1])*dz)/length,0,1):0;
      if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<1.5*U)return true;
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  for(let i=0;i<1800&&(scrub.count<180||rocks.count<80);i++){
    const path=surface.routes[i%surface.routes.length],index=Math.floor(random(i+1)*(path.points.length-1)),a=path.points[index],b=path.points[index+1];
    const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-9)continue;
    const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length,side=i%2?1:-1,offset=(3.2+random(i+2)*14)*U;
    const along=(random(i+3)-.5)*4*U,x=a.x+nx*offset*side+(b.x-a.x)/length*along,z=a.z+nz*offset*side+(b.z-a.z)/length*along;
    if(Math.min(x-surface.bounds.minX,surface.bounds.maxX-x,z-surface.bounds.minZ,surface.bounds.maxZ-z)<16*U||nearLetter(x,z))continue;
    const nearest=surface.nearestRoute(x,z,{full:true}),y=surface.groundHeight(x,z);
    if(!nearest||nearest.distance<2.6*U||nearest.distance>18*U||y===null)continue;
    const east=surface.groundHeight(x+U,z),north=surface.groundHeight(x,z-U);
    if(east===null||north===null||Math.max(Math.abs(east-y),Math.abs(north-y))>.9*U)continue;
    const isRock=rocks.count<80&&(i%3===0||scrub.count>=180),mesh=isRock?rocks:scrub;
    if(mesh.count>=(isRock?80:180))continue;
    const size=(isRock?.18+random(i+4)*.23:.35+random(i+4)*.35)*U;
    dummy.position.set(x,y+size*(isRock?.32:.55),z);dummy.rotation.set(isRock?random(i+5):0,random(i+6)*Math.PI*2,isRock?random(i+7):0);
    dummy.scale.set(size*(1+random(i+8)*.4),size*(isRock?.6:.62),size);dummy.updateMatrix();mesh.setMatrixAt(mesh.count,dummy.matrix);
    color.set(isRock?'#898774':'#75805a').multiplyScalar(.84+random(i+9)*.25);mesh.setColorAt(mesh.count,color);mesh.count++;
  }
  for(const mesh of [scrub,rocks]){mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);}
  return {group,stats:{scrubInstances:scrub.count,rockInstances:rocks.count}};
}

export async function loadHikingWorld({scene,THREE,signal,onProgress=()=>{}}){
  if(signal?.aborted)throw abortError();
  onProgress('Downloading Y trail',.05);
  const response=await fetch(HIKE_DATA_URL,{signal});if(!response.ok)throw Error('The Y trail could not download. Try again from campus.');
  const text=await response.text();if(text.length>4_000_000)throw Error('The hiking manifest is too large.');
  const data=JSON.parse(text),path=data?.terrain?.url;
  if(typeof path!=='string'||!/^\/explorer\/hike\/[a-zA-Z0-9._-]+$/.test(path))throw Error('Invalid hiking terrain path.');
  onProgress('Downloading mountainside',.25);
  const terrain=await fetch(path+'?v='+data.revision,{signal});if(!terrain.ok)throw Error('The hiking terrain could not download. Try again from campus.');
  const bytes=await terrain.arrayBuffer();if(bytes.byteLength>6_000_000||bytes.byteLength%4)throw Error('Invalid hiking terrain size.');
  const heights=new Float32Array(bytes),surface=createHikeSurface(data,heights);
  if(signal?.aborted)throw abortError();
  onProgress('Preparing the trail',.55);
  await new Promise(resolve=>setTimeout(resolve,0));
  if(signal?.aborted)throw abortError();
  const group=new THREE.Group();group.name='Actual-scale Y hiking zone';
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  const mountain=new THREE.Mesh(createTerrainGeometry(surface,heights,THREE),material);mountain.name='USGS hiking terrain';mountain.receiveShadow=true;group.add(mountain);
  const trail=new THREE.Mesh(createTrailGeometry(surface,THREE),new THREE.MeshStandardMaterial({color:'#c5b38b',roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));trail.name='Sourced Y trail';trail.receiveShadow=true;group.add(trail);
  const letterGeometry=createLetterGeometry(surface,THREE);
  if(letterGeometry){const letter=new THREE.Mesh(letterGeometry,new THREE.MeshStandardMaterial({color:'#fffdf0',roughness:1,side:THREE.DoubleSide,depthTest:true,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));letter.name='Y at source scale and location';letter.receiveShadow=true;group.add(letter);}
  const vegetation=createHikeVegetation(surface,THREE);group.add(vegetation.group);
  let disposed=false,matchedValley=null;
  function matchBoundary(valley){
    if(disposed||matchedValley===valley)return;
    matchedValley=valley;valley.updateMatrixWorld(true);
    // The native 3m tile meets 249m distant scenery. Only the outer, unwalkable
    // margin conforms to that scenery; the full trail/Y keep their DEM heights.
    const {terrain:t}=data,position=mountain.geometry.attributes.position,ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3();
    const clearance=Math.min(...surface.routes.flatMap(path=>path.points.map(p=>Math.min(p.x-surface.bounds.minX,surface.bounds.maxX-p.x,p.z-surface.bounds.minZ,surface.bounds.maxZ-p.z))));
    const feather=Math.min(12*U,Math.max(0,clearance-6*U));
    if(feather<=0)return;
    for(let row=0;row<t.height;row++)for(let col=0;col<t.width;col++){
      const id=row*t.width+col,x=t.minX+col*t.stepX,z=t.minZ+row*t.stepZ;
      const edge=Math.min(col*t.stepX,(t.width-1-col)*t.stepX,row*t.stepZ,(t.height-1-row)*t.stepZ);if(edge>=feather)continue;
      origin.set(x,1000,z);ray.set(origin,down);
      const hit=ray.intersectObject(valley,true).find(hit=>{
        const color=hit.object.geometry.getAttribute('color'),ids=[hit.face.a,hit.face.b,hit.face.c];
        return !hit.object.userData?.mountainY||!color||!ids.every(id=>color.getX(id)>.99&&color.getY(id)>.99&&color.getZ(id)>.99);
      });
      if(!hit)continue;
      const blend=edge/feather,smooth=blend*blend*(3-2*blend);heights[id]=hit.point.y+(heights[id]-hit.point.y)*smooth;position.setY(id,heights[id]);
    }
    position.needsUpdate=true;mountain.geometry.computeVertexNormals();mountain.geometry.computeBoundingSphere();
  }
  const dispose=()=>{if(disposed)return;disposed=true;group.removeFromParent();group.traverse(object=>{if(object.isMesh){object.geometry.dispose();for(const mat of Array.isArray(object.material)?object.material:[object.material])mat.dispose();}});};
  if(signal?.aborted){dispose();throw abortError();}
  scene.add(group);onProgress('Y trail ready',1);
  return {...surface,group,matchBoundary,stats:{...surface.stats,...vegetation.stats,trailTriangles:trail.geometry.attributes.position.count/3,yTriangles:letterGeometry?.attributes.position.count/3||0,heightBytes:bytes.byteLength},dispose};
}
