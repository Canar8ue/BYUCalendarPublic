import {UNIT} from './content.mjs?v=20261102polish6';

// Rectangles in native campus coordinates. They cover the mapped paths near
// the listed OSM ways; the mesh surface attribute clips them to rendered paths.
const concrete = [
  [1.17,-2.27,1.54,2.92],   // Library west approach, 147433902
  [.95,-.54,4.16,-.20],     // Library north approach, 1206271833
  [5.83,3.94,13.81,4.30],  // Wilkinson north frontage, 44054298
  [4.29,2.69,16.04,3.08],  // Arts/Wilkinson walk, 1161192508
  [-6.75,4.88,.04,5.34],   // JFSB north approach, 148346409
  [-6.80,10.30,8.54,10.77],// Library south walk, 148219868
];
const pavers = [
  [5.32,3.51,5.70,9.69],   // Library Lane, 151112713
  [11.39,2.87,11.64,4.75], // Wilkinson north connector, 149275954
];
const regions = [...concrete,...pavers];

const number = value => value.toFixed(4);
const mask = regions => regions.map(([left,top,right,bottom]) =>
  `pavingZone(placePosition,vec2(${number(left)},${number(top)}),vec2(${number(right)},${number(bottom)}))`
).reduce((a,b)=>`max(${a},${b})`);
const intersects = ({min,max},[left,top,right,bottom]) =>
  min.x <= right && max.x >= left && min.z <= bottom && max.z >= top;

function shadePaving(shader) {
  const varyings = 'varying vec2 placePosition;\nflat varying float placeSurface;\n';
  shader.vertexShader = `attribute float _surface;\n${varyings}${shader.vertexShader}`
    .replace('#include <project_vertex>',`#include <project_vertex>
      placePosition = (modelMatrix * vec4(transformed, 1.0)).xz;
      placeSurface = _surface;`);
  shader.fragmentShader = `${varyings}
    float pavingZone(vec2 point, vec2 lo, vec2 hi) {
      vec2 edge = min(point - lo, hi - point);
      return smoothstep(0.0, 0.045, min(edge.x, edge.y));
    }
    float pavingJoint(vec2 p, vec2 pixel, vec2 panel, float halfWidth, bool stagger) {
      vec2 grid = p / panel;
      if (stagger) grid.x += mod(floor(grid.y), 2.0) * 0.5;
      vec2 seam = abs(fract(grid + 0.5) - 0.5) * panel;
      vec2 aa = max(pixel, vec2(0.001));
      vec2 coverage = 1.0 - smoothstep(vec2(halfWidth), vec2(halfWidth) + aa, seam);
      coverage *= min(vec2(1.0), halfWidth * 2.0 / aa);
      return max(coverage.x, coverage.y);
    }
    ${shader.fragmentShader}`.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 pavingMeters = placePosition / ${UNIT};
      vec2 pavingPixel = fwidth(pavingMeters);
      if (placeSurface == 3.0 && max(pavingPixel.x, pavingPixel.y) < 0.18) {
        float stone = ${mask(pavers)};
        float slab = ${mask(concrete)} * (1.0 - stone);
        float detail = 1.0 - smoothstep(0.05, 0.18, max(pavingPixel.x, pavingPixel.y));
        if (stone > 0.0) {
          float joint = pavingJoint(pavingMeters, pavingPixel, vec2(0.32, 0.19), 0.006, true);
          diffuseColor.rgb *= 1.0 - vec3(0.025, 0.085, 0.125) * stone * detail;
          diffuseColor.rgb *= 1.0 - 0.23 * joint * stone * detail;
        }
        if (slab > 0.0) {
          float joint = pavingJoint(pavingMeters, pavingPixel, vec2(1.8, 1.8), 0.012, false);
          diffuseColor.rgb *= 1.0 - 0.17 * joint * slab * detail;
        }
      }`);
}

// Keep the effect on the existing PBR draw calls. The normal map, distant
// scenery, terrain and buildings retain their original materials.
export function applyCampusPaving(model) {
  const variants = new Map();
  const retained = new Set();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const bounds = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
    if (!original.isMeshStandardMaterial || !mesh.geometry.hasAttribute('_surface') ||
        !bounds || !regions.some(region => intersects(bounds, region))) {
      retained.add(original);
      return;
    }
    if (!variants.has(original)) {
      const material = original.clone();
      material.onBeforeCompile = shadePaving;
      variants.set(original, material);
    }
    mesh.material = variants.get(original);
  });
  for (const original of variants.keys()) if (!retained.has(original)) original.dispose();
}

// Mapped fixture points and area centers from the campus OSM snapshot. The
// positions are projected to EPSG:32612 and converted to native x/z.
const bins = [
  {x:-2.0052, z:2.8187}, // 10624555303
  {x:.1668, z:9.4198},   // 13810010974
  {x:-.0791, z:8.1544},  // 13810010975
];
const racks = [
  {x:-4.8327, z:4.9352, row:'x'},  // 147463394
  {x:-6.3575, z:10.8821, row:'z'}, // 1029869605
  {x:4.0361, z:10.9938, row:'x'},  // 10099337250
];
const binRadius = .31 * UNIT;
const binSides = 8;
const binHeight = .88 * UNIT;
const rackWidth = .68 * UNIT;
const rackHeight = .84 * UNIT;

function setBatch(THREE, root, name, geometry, color, points) {
  const batch = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({color,roughness:.89}), points.length);
  batch.name = name;
  batch.receiveShadow = true;
  const frame = new THREE.Object3D();
  for (const [i,point] of points.entries()) {
    frame.position.set(point.x,point.y,point.z);
    frame.rotation.y = point.heading ?? 0;
    frame.updateMatrix();
    batch.setMatrixAt(i,frame.matrix);
  }
  root.add(batch);
}

function rackGeometry(THREE) {
  const path = new THREE.CurvePath();
  const point = (x,y) => new THREE.Vector3(x*UNIT,y*UNIT,0);
  path.add(new THREE.LineCurve3(point(-.34,0),point(-.34,.65)));
  path.add(new THREE.QuadraticBezierCurve3(point(-.34,.65),point(-.34,.815),point(-.16,.815)));
  path.add(new THREE.LineCurve3(point(-.16,.815),point(.16,.815)));
  path.add(new THREE.QuadraticBezierCurve3(point(.16,.815),point(.34,.815),point(.34,.65)));
  path.add(new THREE.LineCurve3(point(.34,.65),point(.34,0)));
  return new THREE.TubeGeometry(path,20,.025*UNIT,6,false);
}

// Reject unsupported or wall-adjacent placements at startup. The fixtures
// contribute walls only, so feet and wheels still sample the original paving.
export function createCampusFixtures(THREE, collision) {
  const root = new THREE.Group();
  root.name = 'Mapped campus fixtures';
  const walls = [], binPoints = [], rackPoints = [];
  function supported(x,z,footprint) {
    const heights = [{x,z},...footprint].map(p => collision.groundHeight(p.x,p.z));
    if (heights.some(y => y === null) || Math.max(...heights)-Math.min(...heights) > .06*UNIT) return null;
    const y = Math.min(...heights);
    const fit = collision.move({x,y,z},{x:0,z:0},.65*UNIT);
    return Math.hypot(fit.x-x,fit.z-z) < .001 ? y : null;
  }
  function wall(a,b,y,height) {
    walls.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,minY:y,maxY:y+height});
  }
  for (const {x,z} of bins) {
    const ring = Array.from({length:binSides},(_,i) => {
      const angle = i*2*Math.PI/binSides;
      return {x:x+Math.sin(angle)*binRadius,z:z+Math.cos(angle)*binRadius};
    });
    const y = supported(x,z,ring);
    if (y === null) continue;
    binPoints.push({x,y,z});
    ring.forEach((p,i) => wall(p,ring[(i+1)%ring.length],y,binHeight));
  }
  for (const rack of racks) {
    const alongX = rack.row === 'x';
    for (const offset of [-1,0,1]) {
      const x = rack.x + (alongX ? offset*UNIT : 0);
      const z = rack.z + (alongX ? 0 : offset*UNIT);
      const dx = alongX ? 0 : rackWidth/2;
      const dz = alongX ? rackWidth/2 : 0;
      const ends = [{x:x-dx,z:z-dz},{x:x+dx,z:z+dz}];
      const y = supported(x,z,ends);
      if (y === null) continue;
      rackPoints.push({x,y,z,heading:alongX ? Math.PI/2 : 0});
      wall(ends[0],ends[1],y,rackHeight);
    }
  }
  if (binPoints.length) {
    const body = new THREE.CylinderGeometry(binRadius, .26*UNIT, .78*UNIT, binSides);
    body.translate(0,.39*UNIT,0);
    setBatch(THREE,root,'Waste baskets',body,'#485458',binPoints);
    const lid = new THREE.CylinderGeometry(.27*UNIT,binRadius,.1*UNIT,binSides);
    lid.translate(0,.83*UNIT,0);
    setBatch(THREE,root,'Waste basket lids',lid,'#293639',binPoints);
  }
  if (rackPoints.length) setBatch(THREE,root,'Bicycle stands',rackGeometry(THREE),'#404b50',rackPoints);
  return {root,walls};
}
