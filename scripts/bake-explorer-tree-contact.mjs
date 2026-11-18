// Run with the detailed Blender export path. Add --write to refresh the
// game's root offsets, or omit it to audit the checked-in offsets.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../public/campus/vendor/three.module.js';
import {UNIT} from '../public/explorer/game/content.mjs';
import {groundCampusTrees} from '../public/explorer/game/campus-tree-contact.mjs';
import {createCollisionIndex} from '../public/explorer/game/world.mjs';

const [detailedPath, option] = process.argv.slice(2);
if (!detailedPath || (option && option !== '--write')) {
  throw Error('Usage: node scripts/bake-explorer-tree-contact.mjs <detailed GLB> [--write]');
}
const vendor = new URL('../public/campus/vendor/', import.meta.url).href;
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'three') return {url: vendor + 'three.module.js', shortCircuit: true};
  return next(specifier, context);
}});
const [{GLTFLoader}, {MeshoptDecoder}] = await Promise.all([
  import('../public/campus/vendor/addons/loaders/GLTFLoader.js'),
  import('../public/campus/vendor/meshopt_decoder.module.js'),
]);
async function decode(path) {
  const bytes = await readFile(path);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const {scene} = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  return scene;
}
const [detailed, game] = await Promise.all([
  decode(detailedPath), decode(new URL('../public/explorer/campus/campus_web.glb', import.meta.url)),
]);
const source = detailed.getObjectByName('Trees__mapped_positions');
const batch = game.getObjectByName('campus_tile_-2_-2');
const sourceGeometry = source.geometry, geometry = batch.geometry;
const position = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
const features = geometry.getAttribute('_feature_id'), surfaces = geometry.getAttribute('_surface');
const point = new THREE.Vector3(), quantizationStep = batch.scale.y / 32767;
const quantize = (value, origin) => Math.round((value - origin) / quantizationStep);
const rgb8 = (color, i) => [color.getX(i), color.getY(i), color.getZ(i)].map(v => Math.round(v * 255)).join(',');
const signature = (x, y, z, color) => [x, y, z, color].join(',');

// The detailed export emits each tree's trunk first, then its crown. Map the
// triangles into the game batch by their quantized positions and palette.
const sourceColors = sourceGeometry.getAttribute('color'), sourcePositions = sourceGeometry.getAttribute('position');
const trunkColor = rgb8(sourceColors, sourceGeometry.index.getX(0));
const keys = new Map(), sourceCounts = [];
let tree = -1, previousWasTrunk = false;
for (let i = 0; i < sourceGeometry.index.count; i += 3) {
  const isTrunk = rgb8(sourceColors, sourceGeometry.index.getX(i)) === trunkColor;
  if (isTrunk && !previousWasTrunk) sourceCounts[++tree] = 0;
  previousWasTrunk = isTrunk;
  sourceCounts[tree]++;
  for (let corner = 0; corner < 3; corner++) {
    const vertex = sourceGeometry.index.getX(i + corner);
    point.fromBufferAttribute(sourcePositions, vertex).applyMatrix4(source.matrixWorld);
    const {x, y, z} = batch.position;
    const key = signature(quantize(point.x, x), quantize(point.y, y), quantize(point.z, z), rgb8(sourceColors, vertex));
    assert.ok(!keys.has(key) || keys.get(key) === tree, 'Source vertices identify distinct trees');
    keys.set(key, tree);
  }
}
assert.equal(sourceCounts.length, JSON.parse(source.userData.feature_ranges.replaceAll("'", '"')).length);
const treeIds = new Int32Array(position.count).fill(-1);
const trees = sourceCounts.map(() => []);
for (let vertex = 0; vertex < position.count; vertex++) {
  if (features.getX(vertex) || surfaces.getX(vertex)) continue;
  const [x, y, z] = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)].map(v => Math.round(v * 32767));
  const rgb = rgb8(colors, vertex);
  let id = keys.get(signature(x, y, z, rgb));
  if (id === undefined) {
    // Floating-point rounding can place a vertex in an adjacent bin.
    const neighbors = new Set();
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      const candidate = keys.get(signature(x + dx, y + dy, z + dz, rgb));
      if (candidate !== undefined) neighbors.add(candidate);
    }
    assert.equal(neighbors.size, 1, 'Every background vertex in the batch belongs to one tree');
    [id] = neighbors;
  }
  treeIds[vertex] = id;
  trees[id].push(vertex);
}
const targetCounts = sourceCounts.map(() => 0);
for (let i = 0; i < geometry.index.count; i += 3) {
  const id = treeIds[geometry.index.getX(i)];
  assert.equal(id, treeIds[geometry.index.getX(i + 1)]);
  assert.equal(id, treeIds[geometry.index.getX(i + 2)]);
  if (id >= 0) targetCounts[id]++;
}
assert.deepEqual(targetCounts, sourceCounts, 'Every original tree triangle maps to the decoded game batch');

const grounds = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
game.traverse(mesh => {
  if (!mesh.isMesh) return;
  const {index, attributes: {position, _surface}} = mesh.geometry;
  for (let i = 0; i < index.count; i += 3) {
    const first = index.getX(i), surface = _surface.getX(first);
    if (!surface) continue;
    a.fromBufferAttribute(position, first).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(mesh.matrixWorld);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const length = normal.length();
    if (length > 1e-10 && normal.y / length > .60) {
      grounds.push({kind: 'ground', surface, a: a.toArray(), b: b.toArray(), c: c.toArray()});
    }
  }
});
const {groundHeight} = createCollisionIndex(grounds);
const anchors = trees.map(vertices => {
  const trunk = vertices.filter(i => rgb8(colors, i) === trunkColor);
  const bottom = Math.min(...trunk.map(i => position.getY(i)));
  const roots = trunk.filter(i => position.getY(i) === bottom);
  const corners = new Map();
  for (const i of roots) {
    point.fromBufferAttribute(position, i).applyMatrix4(batch.matrixWorld);
    corners.set(point.x + ',' + point.z, [point.x, point.z]);
  }
  const ring = [...corners.values()];
  assert.ok(ring.length >= 4 && ring.length <= 5);
  const [x, z] = ring.reduce(([x, z], [px, pz]) => [x + px / ring.length, z + pz / ring.length], [0, 0]);
  const ground = [...ring.map(([x, z]) => groundHeight(x, z)), groundHeight(x, z)];
  assert.ok(ground.every(y => y !== null), 'Every tree is above ground');
  const support = Math.min(...ground);
  const drop = Math.max(0, Math.ceil((point.y - support + .02 * UNIT) / quantizationStep));
  return {roots, drop, support, centerGap: (point.y - ground.at(-1)) / UNIT};
});
const ranges = [];
let start = 0, last = 0;
const drops = treeIds.map(id => id < 0 ? 0 : anchors[id].drop);
for (let i = 0; i <= drops.length; i++) {
  const drop = drops[i] ?? 0;
  if (drop === last) continue;
  if (last) ranges.push([start, i - start, last]);
  start = i;
  last = drop;
}

const modulePath = new URL('../public/explorer/game/campus-tree-contact.mjs', import.meta.url);
const rows = [];
for (let i = 0; i < ranges.length; i += 5) {
  rows.push('  ' + ranges.slice(i, i + 5).map(range => JSON.stringify(range)).join(', ') + ',');
}
const original = (await readFile(modulePath, 'utf8')).replaceAll('\r\n', '\n');
const output = original.replace(/const rootDrops = \[\n[\s\S]*?\n\];/, 'const rootDrops = [\n' + rows.join('\n') + '\n];');
if (option === '--write') {
  await writeFile(modulePath, output);
} else {
  assert.equal(output, original, 'Run with --write to refresh tree offsets');
  const before = position.data.array.slice();
  assert.equal(groundCampusTrees(game), true);
  assert.equal(groundCampusTrees(game), false, 'Skip a batch whose vertex fingerprint already changed');
  for (const [i, drop] of drops.entries()) {
    const offset = i * position.data.stride;
    assert.equal(position.data.array[offset], before[offset]);
    assert.equal(position.data.array[offset + 1], before[offset + 1] - drop);
    assert.equal(position.data.array[offset + 2], before[offset + 2]);
  }
  for (const {roots, support} of anchors) {
    for (const i of roots) {
      point.fromBufferAttribute(position, i).applyMatrix4(batch.matrixWorld);
      assert.ok(point.y <= support - .019 * UNIT, 'The entire root ring is embedded in the surface');
    }
  }
}
console.log({
  trees: trees.length,
  corrected: anchors.filter(tree => tree.drop > 0).length,
  largestCenterGapMeters: Math.max(...anchors.map(tree => tree.centerGap)),
  ranges: ranges.length,
});
