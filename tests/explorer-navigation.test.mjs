import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NAVIGATION_URL} from '../public/explorer/game/navigation-data.mjs';
import {createRouteGraph} from '../public/explorer/game/navigation.mjs';

test('navigation finds both directions through connected paths and rejects unreachable or blocked connectors',()=>{
 const graph=createRouteGraph({version:1,step:.1,nodes:[[0,0],[1,0],[1,1],[2,1],[50,50]],edges:[[0,1],[1,2],[2,3]]});
 assert.equal(graph.findPath({x:0,z:0},{x:.2,z:.1}).length,4);
 assert.equal(graph.findPath({x:.2,z:.1},{x:0,z:0}).length,4);
 assert.deepEqual(graph.findPath({x:0,z:0},{x:5,z:5}),[]);
 assert.deepEqual(graph.findPath({x:0,z:0},{x:.2,z:.1},()=>false),[]);
 assert.ok(graph.findPath({x:0,z:0},{x:.25,z:.1},(a,b)=>a.x<=b.x).length,'the last connector is checked in the direction the player travels');
 assert.throws(()=>createRouteGraph({version:1,step:.1,nodes:[[0,0]],edges:[[0,4]]}));
});

test('the reviewed navigation asset belongs to the current campus model and has one connected component',async()=>{
 const data=JSON.parse(await readFile(new URL('../public'+NAVIGATION_URL,import.meta.url),'utf8'));
 const hash=createHash('sha256').update(await readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url))).digest('hex');
 assert.equal(data.modelSha256,hash);const {nodes}=createRouteGraph(data),visited=new Set([0]),queue=[0];while(queue.length){for(const edge of nodes[queue.pop()].edges)if(!visited.has(edge.id)){visited.add(edge.id);queue.push(edge.id);}}
 assert.equal(visited.size,nodes.length);assert.ok(nodes.length>1000);
});

test('the ordinary map keeps its smaller model while the game loads its own grounded model and catalog',async()=>{
 const [ordinary,game,world,normalCatalog,gameCatalog]=await Promise.all([
  readFile(new URL('../public/campus/campus_web.glb',import.meta.url)),
  readFile(new URL('../public/explorer/campus/campus_web.glb',import.meta.url)),
  readFile(new URL('../public/explorer/game/world.mjs',import.meta.url),'utf8'),
  readFile(new URL('../public/campus/coordinates.json',import.meta.url),'utf8'),
  readFile(new URL('../public/explorer/campus/coordinates.json',import.meta.url),'utf8')
 ]);
 assert.equal(createHash('sha256').update(ordinary).digest('hex'),'0796afb0352892058999add33766d3e539e4a92ab8bfe55dab455eceeba55e67');
 assert.ok(game.length>ordinary.length*1.5);
 assert.match(world,/loadAsync\('\/explorer\/campus\/campus_web\.glb\?v=/);
 assert.match(world,/fetch\('\/explorer\/campus\/coordinates\.json\?v=/);
 assert.doesNotMatch(world,/['"]\/campus\/(?:campus_web\.glb|coordinates\.json)/);
 const normal=JSON.parse(normalCatalog).features,grounded=JSON.parse(gameCatalog).features;
 assert.deepEqual(normal.map(f=>[f.id,f.featureIndex]),grounded.map(f=>[f.id,f.featureIndex]));
 assert.notEqual(normalCatalog,gameCatalog,'each model keeps its own matching ground coordinates');
});
