import * as THREE from '/campus/vendor/three.module.js';
import {UNIT} from './content.mjs?v=20261105rider6';
import {SKATE_ORIGIN, skateSpotHeight, downhillCenter, createSpotRails, SPOT_STARTS} from './skate-spots.mjs?v=20261105rider6';
import {SKATE_POSE, skateBoardPose} from './skate-pose.mjs?v=20261105rider6';
import {resolveSkateBoard} from './skate-boards.mjs?v=20261105rider6';

const material = color => new THREE.MeshStandardMaterial({color, roughness: .85});
function mesh(root, geometry, mat, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, mat); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; root.add(item); return item;
}
function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => {if(o.isInstancedMesh)o.dispose();if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material);});
  for (const g of geometries) g.dispose();
  for (const m of materials) {m.map?.dispose(); m.dispose();}
  root.removeFromParent();
}
function paintBoard(data, board, top) {
  const palette = [board.grip, board.accent, board.ink, board.color].map(hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)));
  const width = 64, height = 256;
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const x = column / (width - 1) * 2 - 1, y = row / (height - 1) * 2 - 1;
    const radius = Math.hypot(x, y * 1.35), angle = Math.atan2(y * 1.35, x);
    let color = 3;
    if (top) {
      color = 0;
      const noseMark = Math.abs(y - .64 - Math.abs(x) * .12) < .025;
      const tailMark = Math.abs(y + .67) < .03 && Math.abs(x) < .7;
      if (noseMark || tailMark) color = 1;
      if (board.graphic === 'checker' && Math.abs(y) > .78) color = (Math.floor((x + 1) * 5) + Math.floor((y + 1) * 16)) % 2 ? 1 : 0;
      if (board.graphic === 'wave' && Math.abs(x - Math.sin(y * 8) * .25) < .05) color = 1;
      if (board.graphic === 'bolt' && Math.abs(x - (.25 - Math.abs((y * 3 + 3) % 1 - .5))) < .07) color = 1;
      if (board.graphic === 'paw' && y > .35 && Math.abs(x) < .6 && Math.abs((x + .7) % .3 - .15) < .025) color = 1;
      // A fine deterministic fleck keeps the top reading as abrasive grip.
      if (color === 0 && (column * 17 + row * 31) % 37 === 0) color = 2;
    } else {
      switch (board.graphic) {
        case 'checker':
          color = (Math.floor((x + 1) * 4) + Math.floor((y + 1) * 12)) % 2 ? 1 : 3;
          if (Math.abs(y) < .18) color = 2;
          break;
        case 'wave':
          color = Math.sin(y * 13 + x * 4) > .2 ? 1 : 3;
          if (Math.abs(Math.sin(y * 13 + x * 4)) < .12) color = 2;
          break;
        case 'sun':
          color = radius < .57 ? 1 : Math.sin(angle * 12) > .45 ? 2 : 3;
          if (radius > .43 && radius < .48) color = 3;
          break;
        case 'paw':
          if ((x / .52) ** 2 + ((y + .08) / .27) ** 2 < 1) color = 2;
          for (const [tx, ty] of [[-.58,.23],[-.22,.42],[.22,.42],[.58,.23]]) {
            if (((x - tx) / .19) ** 2 + ((y - ty) / .15) ** 2 < 1) color = 1;
          }
          break;
        case 'comet':
          if (Math.abs(x - y * .72) < .32 && y < .42) color = 2;
          if (Math.abs(x - y * .72) < .13 && y < .42) color = 1;
          if (Math.hypot((x - .28) * 1.6, y - .42) < .25) color = 1;
          if ((column * 19 + row * 23) % 521 < 3) color = 2;
          break;
        case 'bolt':
          if (Math.abs(x - (.5 - Math.abs((y * 2 + 2) % 1 - .5) * 2)) < .28) color = 1;
          if (Math.abs(y + .75 + x * .05) < .025) color = 2;
          break;
        case 'bloom': {
          const petals = .48 + .20 * Math.cos(angle * 5);
          if (radius < petals) color = 1;
          if (radius < .18) color = 2;
          if (Math.abs(x + Math.sin(y * 5) * .32) < .055 && y < -.3) color = 2;
          break;
        }
        case 'orbit':
          if (Math.abs(Math.hypot(x * .9 + y * .5, y * 2) - .80) < .065) color = 1;
          if (Math.hypot(x * 1.3, y * 2) < .35) color = 2;
          if ((column * 19 + row * 23) % 521 < 3) color = 1;
          break;
        default:
          if (Math.abs(y - x * .22) < .12 || Math.abs(y - x * .22 - .33) < .045 || Math.abs(y - x * .22 + .33) < .045) color = 1;
          if (Math.abs(x) > .8) color = 2;
      }
      if (Math.abs(y) > .88) color = 2;
    }
    const offset = (row * width + column) * 4;
    data.set(palette[color], offset); data[offset + 3] = 255;
  }
}
export function createSkateboard(scene) {
  const group = new THREE.Group(); group.name = 'Skateboard'; group.scale.setScalar(UNIT); scene.add(group);
  const deck = new THREE.Group(); deck.name = 'Skateboard deck frame'; group.add(deck);
  group.rotation.order = deck.rotation.order = 'YXZ';
  const pose = {};
  const rigidOffset = new THREE.Vector3(), rigidRotation = new THREE.Quaternion(), rigidPosition = new THREE.Vector3();
  // The rigid collider encloses the complete .16 m deck/truck/wheel height.
  // Its center differs from the riding model's pavement-level origin.
  const centerHeight = .08;
  const shape = new THREE.Shape();
  shape.moveTo(-.105, -.31); shape.lineTo(-.105, .31); shape.quadraticCurveTo(0, .53, .105, .31);
  shape.lineTo(.105, -.31); shape.quadraticCurveTo(0, -.53, -.105, -.31);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .028, bevelEnabled: true, bevelThickness: .009, bevelSize: .009, bevelSegments: 2, steps: 1});
  geometry.rotateX(Math.PI / 2);
  mesh(deck, geometry, material('#df9550'), 0, SKATE_POSE.deckHeight - .011, 0);
  const grip = new THREE.ShapeGeometry(shape, 18); grip.rotateX(-Math.PI / 2);
  const underside = new THREE.ShapeGeometry(shape, 18); underside.rotateX(Math.PI / 2);
  const graphicTextures = [grip, underside].map(geometry => {
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (positions.getX(i) + .105) / .21, (positions.getZ(i) + .42) / .84);
    const texture = new THREE.DataTexture(new Uint8Array(64 * 256 * 4), 64, 256);
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    return texture;
  });
  const top = mesh(deck, grip, new THREE.MeshStandardMaterial({color:'#ffffff', map:graphicTextures[0], roughness:1}), 0, SKATE_POSE.deckHeight, 0);
  const bottom = mesh(deck, underside, new THREE.MeshStandardMaterial({color:'#ffffff', map:graphicTextures[1], roughness:.55}), 0, SKATE_POSE.deckHeight - .0405, 0);
  top.name = 'Skateboard grip graphic'; bottom.name = 'Skateboard underside graphic';
  const truck = material('#a0a9ae'), wheel = material('#f4e8c9'), wheels = [];
  for (const z of [-.25, .25]) {
    mesh(deck, new THREE.BoxGeometry(.26, .035, .035), truck, 0, .075, z);
    mesh(deck, new THREE.BoxGeometry(.085, .026, .085), truck, 0, .10, z);
    for (const x of [-.14, .14]) {
      const axle = new THREE.Group(); axle.name = 'Skateboard wheel axle'; axle.position.set(x, .055, z); deck.add(axle); wheels.push(axle);
      const item = mesh(axle, new THREE.CylinderGeometry(.055, .055, .042, 12), wheel);
      item.rotation.z = Math.PI / 2;
      mesh(axle, new THREE.SphereGeometry(.015, 8, 6), truck, Math.sign(x) * .024, 0, 0);
    }
  }
  let style = null;
  function setStyle(id) {
    const board = resolveSkateBoard(id);
    if (style === board.id) return;
    style = board.id; group.userData.board = board.id;
    graphicTextures.forEach((texture, index) => {paintBoard(texture.image.data, board, index === 0); texture.needsUpdate = true;});
    wheel.color.set(board.wheel);
  }
  setStyle('classic');
  return {group, setStyle,
    update(dt, state) {
      skateBoardPose(state, pose);
      deck.rotation.set(pose.pitch, pose.shove, pose.roll + pose.flip);
      deck.position.set(0, pose.lift, pose.offsetZ);
      group.rotation.x = state?.pitch || 0;
      // Rider lean loads the trucks; the deck's smaller bank is shared with
      // the foot solver. Keep the wheel support frame above the pavement.
      group.rotation.z = 0;
      const signedSpeed = (state?.velocity?.x || 0) * Math.sin(state?.heading || 0) + (state?.velocity?.z || 0) * Math.cos(state?.heading || 0);
      for (const item of wheels) item.rotation.x = (item.rotation.x + dt * signedSpeed / .055) % (Math.PI * 2);
    },
    rigidPose() {
      deck.updateWorldMatrix(true, false);
      deck.getWorldQuaternion(rigidRotation);deck.getWorldPosition(rigidPosition).divideScalar(UNIT);
      rigidOffset.set(0, centerHeight, 0).applyQuaternion(rigidRotation);rigidPosition.add(rigidOffset);
      return {position: {x: rigidPosition.x, y: rigidPosition.y, z: rigidPosition.z},
        quaternion: {x: rigidRotation.x, y: rigidRotation.y, z: rigidRotation.z, w: rigidRotation.w}};
    },
    updateRigid(body) {
      group.quaternion.copy(body.quaternion);
      rigidOffset.set(0, centerHeight, 0).applyQuaternion(group.quaternion);
      group.position.set((body.position.x-rigidOffset.x)*UNIT,(body.position.y-rigidOffset.y)*UNIT,(body.position.z-rigidOffset.z)*UNIT);
      deck.position.set(0, 0, 0);deck.rotation.set(0, 0, 0);
    }, dispose: () => dispose(group)};
}
function surfaceMesh(root, x0, x1, z0, z1, step, base, mat, offset = 0, road = false, skip = null) {
  const positions = [], indices = [], cols = Math.ceil((x1 - x0) / step), rows = Math.ceil((z1 - z0) / step);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const z = z0 + (z1 - z0) * j / rows, x = x0 + (x1 - x0) * i / cols + (road ? downhillCenter(z) : 0);
    positions.push(x, base + (skateSpotHeight(x, z) ?? 0) + offset, z);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if(skip?.(x0+(x1-x0)*(i+.5)/cols,z0+(z1-z0)*(j+.5)/rows))continue;
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(root, geometry, mat);
}
function bar(root, from, to, mat, radius = .055) {
  const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z), delta = b.clone().sub(a);
  const item = mesh(root, new THREE.CylinderGeometry(radius, radius, delta.length(), 10), mat);
  item.position.copy(a.add(b).multiplyScalar(.5)); item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}
function sign(root, text, x, y, z) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#17313c'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#f8eddb'; ctx.font = 'bold 88px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 512, 153);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const panel = mesh(root, new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({map: texture, side: THREE.DoubleSide}), x, y, z); panel.rotation.y = Math.PI;
}
export function createSkateSpots(scene, world) {
  const root = new THREE.Group(); root.name = 'Fictional skate yard and downhill'; root.visible=false;root.scale.setScalar(UNIT); root.position.set(SKATE_ORIGIN.x, 0, SKATE_ORIGIN.z); scene.add(root);
  const base = (world.groundHeight(2.85, -1) ?? 1) / UNIT;
  const obstacles=[];
  surfaceMesh(root, -75, 75, -330, 94, 2, base, material('#7c9570'),0,false,(x,z)=>z>=-12&&z<=86&&Math.abs(x)<42||z< -12&&Math.abs(x-downhillCenter(z))<6);
  surfaceMesh(root, -42, 42, -12, 86, .5, base, material('#acb5b4'), .012);
  surfaceMesh(root, -7, 7, -325, -12, .6, base, material('#404d57'), .018, true);
  const yellow = material('#e2bb61'), white = material('#eee2ca'), steel = material('#88b9c5');
  // Original backdrop and pines give the fictional course its own landscape;
  // the real campus/valley scenery is masked while this course is in view.
  const mountainPositions=[],mountainIndices=[];
  for(let i=0;i<=64;i++){
    const angle=i/64*Math.PI*2, radius=500+Math.sin(i*1.7)*45;
    const h=base+65+Math.sin(i*1.8)*24+Math.cos(i*.6)*15;
    mountainPositions.push(Math.cos(angle)*260,base-12,-110+Math.sin(angle)*260,Math.cos(angle)*radius,h,-110+Math.sin(angle)*radius,Math.cos(angle)*900,base+12,-110+Math.sin(angle)*900);
    if(i<64){const a=i*3;mountainIndices.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}
  }
  const mountainGeometry=new THREE.BufferGeometry();mountainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(mountainPositions,3));mountainGeometry.setIndex(mountainIndices);mountainGeometry.computeVertexNormals();
  const mountainMaterial=material('#809b9e');mountainMaterial.side=THREE.DoubleSide;mesh(root,mountainGeometry,mountainMaterial);
  const count=110,trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.20,1.8,6),material('#66574b'),count),crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1.6,5.2,7),material('#355d53'),count),object=new THREE.Object3D();
  trunks.name='Course pine trunks';crowns.name='Course pine crowns';
  for(let i=0;i<count;i++){
    const z=-318+(i%55)*7.3, offset=(i<55?-1:1)*((z> -12?52:16)+(Math.sin(i*3.1)+1)*12);
    // Keep roots inside the grassy mesh and below its downhill side.
    const x=THREE.MathUtils.clamp(downhillCenter(z)+offset,-74,74),ground=base+skateSpotHeight(x,z);
    const scale=.7+(Math.sin(i*4.2)+1)*.35,rootDepth=.10;
    object.position.set(x,ground+.9*scale-rootDepth,z);object.scale.setScalar(scale);object.updateMatrix();trunks.setMatrixAt(i,object.matrix);
    obstacles.push({x:SKATE_ORIGIN.x+x*UNIT,z:SKATE_ORIGIN.z+z*UNIT,radius:.20*scale*UNIT,bottom:ground*UNIT,top:(ground+1.8*scale-rootDepth)*UNIT});
    object.position.y=ground+3.5*scale;object.updateMatrix();crowns.setMatrixAt(i,object.matrix);
  }
  trunks.castShadow=crowns.castShadow=true;trunks.receiveShadow=crowns.receiveShadow=true;root.add(trunks,crowns);
  for (let z = -314; z < -18; z += 10) {
    const x = downhillCenter(z), line = mesh(root, new THREE.BoxGeometry(.16, .025, 3.7), yellow, x, base + skateSpotHeight(x, z) + .06, z);
    line.rotation.x = Math.atan(.22);
  }
  for (const x of [-7, 7]) surfaceMesh(root, x - .055, x + .055, -325, -12, 1, base, white, .04, true);
  const localRails = createSpotRails(base);
  for (const rail of localRails) {
    bar(root, rail.a, rail.b, steel);
    for (const t of [0, .5, 1]) {
      const x = rail.a.x + (rail.b.x - rail.a.x) * t, z = rail.a.z + (rail.b.z - rail.a.z) * t, y = rail.a.y + (rail.b.y - rail.a.y) * t;
      bar(root, {x, y: base + skateSpotHeight(x, z), z}, {x, y, z}, steel, .035);
    }
  }
  for (let i = 0; i < 6; i++) {
    const z = 4 + i * 12;
    const cone = mesh(root, new THREE.ConeGeometry(.23, .65, 12), material('#d98648'), -27, base + .33, z);
    mesh(root, new THREE.BoxGeometry(.55, .07, .55), material('#3e5055'), cone.position.x, base + .035, z);
  }
  sign(root, 'SKATE YARD', -21, base + 3.4, 3);
  sign(root, 'SUMMIT DESCENT', downhillCenter(-318), base + skateSpotHeight(0, -318) + 3, -318);
  sign(root, 'RUNOUT  /  SKATE YARD', 0, base + 3.4, -11);
  const rails = localRails.map(rail => ({...rail, a: {...rail.a, x: rail.a.x + SKATE_ORIGIN.x / UNIT, z: rail.a.z + SKATE_ORIGIN.z / UNIT}, b: {...rail.b, x: rail.b.x + SKATE_ORIGIN.x / UNIT, z: rail.b.z + SKATE_ORIGIN.z / UNIT}}));
  for(const rail of rails){const count=Math.ceil(Math.hypot(rail.b.x-rail.a.x,rail.b.z-rail.a.z)/.35);for(let i=0;i<=count;i++){
    const t=i/count,y=(rail.a.y+(rail.b.y-rail.a.y)*t)*UNIT;
    obstacles.push({x:(rail.a.x+(rail.b.x-rail.a.x)*t)*UNIT,z:(rail.a.z+(rail.b.z-rail.a.z)*t)*UNIT,radius:.055*UNIT,bottom:y-.055*UNIT,top:y+.055*UNIT,rail:true});
  }}
  const local = (x, z) => ({x: (x - SKATE_ORIGIN.x) / UNIT, z: (z - SKATE_ORIGIN.z) / UNIT});
  return {root, rails, obstacles,
    contains(x, z) {const p = local(x, z); return p.x >= -75 && p.x <= 75 && p.z >= -330 && p.z <= 94;},
    height(x, z) {const p = local(x, z), h = skateSpotHeight(p.x, p.z); return h === null ? null : (base + h) * UNIT;},
    start(id) {const start = SPOT_STARTS[id] || SPOT_STARTS.yard; return {x: SKATE_ORIGIN.x + (start.x + downhillCenter(start.z)) * UNIT, z: SKATE_ORIGIN.z + start.z * UNIT, heading: start.heading};},
    location(x, z) {return local(x, z).z < -12 ? 'Summit descent · fictional course' : 'Skate yard · fictional course';},
    dispose: () => dispose(root)};
}
