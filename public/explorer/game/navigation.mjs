import {NAVIGATION_URL} from './navigation-data.mjs?v=20261102polish6';
const UNIT=.044571444392204285;

// The network is generated from collision-checked walks. It supplies hints, never
// teleports, movement authority, or a replacement for the collision controller.
export function createRouteGraph(data){
 if(data?.version!==1||!Array.isArray(data.nodes)||data.nodes.length>20000||!Array.isArray(data.edges)||data.edges.length>40000||!Number.isFinite(data.step)||data.step<=0)throw Error('Invalid navigation network');
 const nodes=data.nodes.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p.some(n=>Math.abs(n)>2000))throw Error('Invalid navigation point');return {x:p[0]*data.step,z:p[1]*data.step,edges:[]};});
 for(const [a,b] of data.edges){if(!Number.isInteger(a)||!Number.isInteger(b)||!nodes[a]||!nodes[b])throw Error('Invalid navigation edge');const weight=Math.hypot(nodes[a].x-nodes[b].x,nodes[a].z-nodes[b].z);nodes[a].edges.push({id:b,weight});nodes[b].edges.push({id:a,weight});}
 function nearest(p,accept=()=>true){return nodes.map((n,id)=>({id,d:Math.hypot(n.x-p.x,n.z-p.z)})).sort((a,b)=>a.d-b.d).slice(0,20).find(n=>n.d<.9&&accept(nodes[n.id]))?.id;}
 function findPath(from,to,accept=()=>true){const start=nearest(from,n=>accept(from,n)),end=nearest(to,n=>accept(n,to));if(start===undefined||end===undefined)return [];
  const distance=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),queue=[start],closed=new Set();distance[start]=0;
  while(queue.length){queue.sort((a,b)=>distance[b]-distance[a]);const id=queue.pop();if(closed.has(id))continue;closed.add(id);if(id===end)break;for(const edge of nodes[id].edges){const score=distance[id]+edge.weight;if(score<distance[edge.id]){distance[edge.id]=score;previous[edge.id]=id;queue.push(edge.id);}}}
  if(!Number.isFinite(distance[end]))return [];let id=end,path=[];while(id!==-1){path.push(nodes[id]);id=previous[id];}return path.reverse().map(({x,z})=>({x,z}));
 }
 return {nodes,findPath};
}

export async function createNavigation(scene,world){
 const controller=new AbortController();let disposed=false,graph=null;
 const THREE=await import('/campus/vendor/three.module.js');
 const geometry=new THREE.RingGeometry(.09*UNIT,.14*UNIT,12),material=new THREE.MeshBasicMaterial({color:'#ffe1a0',transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide}),dots=new THREE.InstancedMesh(geometry,material,18),dummy=new THREE.Object3D();dots.count=0;dots.frustumCulled=false;scene.add(dots);
 fetch(NAVIGATION_URL,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(!disposed)graph=createRouteGraph(data);}).catch(()=>{/* The marker and minimap work without optional route hints. */});
 let last=0,path=[],goal='',anchor=null;
 const clear=(a,b)=>{const y=world.groundHeight(a.x,a.z);if(y===null)return false;const next=world.move({x:a.x,y,z:a.z},{x:b.x-a.x,z:b.z-a.z},.32*UNIT);return Math.hypot(next.x-b.x,next.z-b.z)<.016;};
 return {findPath(from,to){
  if(disposed||!graph)return [];
  const route=graph.findPath(from,to,clear);
  return route.length?[{x:from.x,z:from.z},...route,{x:to.x,z:to.z}]:[];
 },update(time,player,target,{reducedMotion=false}={}){
  if(disposed||!graph||!target){dots.count=0;return;}
  const key=target.x+','+target.z;
  if(goal!==key||time-last>3&&(!anchor||Math.hypot(player.x-anchor.x,player.z-anchor.z)>.1)){goal=key;last=time;anchor={x:player.x,z:player.z};path=graph.findPath(player,target,clear);}
  let nearest=0,best=Infinity;for(let i=0;i<path.length;i++){const d=Math.hypot(player.x-path[i].x,player.z-path[i].z);if(d<best){best=d;nearest=i;}}
  dots.count=0;if(best>.9)return;
  for(let i=nearest+1;i<path.length&&dots.count<18;i++){const p=path[i],y=world.groundHeight(p.x,p.z);if(y===null)continue;dummy.position.set(p.x,y+.003,p.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(reducedMotion?1:.85+Math.sin(time*2-i*.4)*.15);dummy.updateMatrix();dots.setMatrixAt(dots.count++,dummy.matrix);}dots.instanceMatrix.needsUpdate=true;
 },dispose(){disposed=true;controller.abort();dots.removeFromParent();geometry.dispose();material.dispose();}};
}
