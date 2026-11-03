import * as THREE from '/campus/vendor/three.module.js';

// Original procedural game art. Model every object in meters, with a foot-level
// origin, then apply the campus model's documented presentation scale once.
const UNIT = 0.044571444392204285;
const TAU = Math.PI * 2;
const PLAYER_PALETTES = [['#336b9a', '#d4a556'], ['#326b64', '#e0b86a'], ['#574c8d', '#d6956c']];
const SCOOTER_PALETTES = ['#275b9c', '#377e78', '#bd862e'];
const cosmeticTier = level => Math.min(3, Math.max(1, Math.floor(Number(level) || 1)));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mat = (color, options = {}) => new THREE.MeshStandardMaterial({color, roughness: .86, metalness: 0, ...options});
function root(scene, name) {
  const group = new THREE.Group(); group.name = name; group.scale.setScalar(UNIT);
  scene.add(group); return group;
}
function add(parent, geometry, material, position = [0, 0, 0], scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const sphere = (parent, material, position, scale, segments = 14) => add(parent, new THREE.SphereGeometry(1, segments, 10), material, position, scale);
const box = (parent, material, size, position) => add(parent, new THREE.BoxGeometry(...size), material, position);
function bar(parent, material, from, to, radius = .025, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
  const mesh = add(parent, new THREE.CylinderGeometry(radius, radius, delta.length(), segments), material);
  mesh.position.copy(a.add(b).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
}
function pivot(parent, position) {const group = new THREE.Group(); group.position.set(...position); parent.add(group); return group;}
function groundShadow(parent, width = .75, length = .65) {
  const material = new THREE.ShaderMaterial({
    uniforms: {shadowColor: {value: new THREE.Color('#203b3a')}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 shadowColor; void main(){ float alpha=.20*smoothstep(.5,.10,length(vUv-.5)); gl_FragColor=vec4(shadowColor,alpha); }',
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const shadow = add(parent, new THREE.PlaneGeometry(width, length), material, [0, .007, 0]);
  shadow.name = 'Ground shadow'; shadow.rotation.x = -Math.PI / 2; shadow.castShadow = false; shadow.receiveShadow = false;
  shadow.raycast = () => {}; return shadow;
}
function disposer(group) {
  return () => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    group.traverse(object => {if (object.geometry) geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);}});
    for (const geometry of geometries) geometry.dispose(); for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose();
    group.removeFromParent();
  };
}
function labelTexture(text, background = '#133c79', foreground = '#ffffff') {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = background; context.fillRect(0, 0, 128, 128);
  context.fillStyle = foreground; context.font = '900 84px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 64, 70);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function smile(parent, material, y, z, width = .055) {
  const points = []; for (let i = 0; i <= 8; i++) {const t = i / 8; points.push(new THREE.Vector3((t - .5) * width * 2, y - Math.sin(t * Math.PI) * .014, z));}
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, .004, 5, false), material); parent.add(mesh);
}
function humanLeg(parent, x, pants, shoes) {
  const leg = pivot(parent, [x, .85, 0]);
  add(leg, new THREE.CapsuleGeometry(.09, .54, 4, 10), pants, [0, -.34, 0]);
  sphere(leg, shoes, [0, -.77, .06], [.115, .075, .20]);
  return leg;
}
function humanArm(parent, x, sleeve, skin, length = .41) {
  const arm = pivot(parent, [x, 1.27, 0]);
  add(arm, new THREE.CapsuleGeometry(.075, length, 4, 10), sleeve, [0, -.19, 0]);
  sphere(arm, skin, [0, -.46, .01], [.074, .095, .075]); return arm;
}
// Named joints keep the lightweight, original mesh editable without a downloaded
// character or animation dependency. All animation remains below the foot anchor.
function studentLeg(parent, x, pants, shoes, sole) {
  const side = x < 0 ? 'Left' : 'Right', hip = pivot(parent, [x, 0, 0]); hip.name = `${side} hip`;
  add(hip, new THREE.CapsuleGeometry(.082, .24, 4, 10), pants, [0, -.20, 0]);
  const knee = pivot(hip, [0, -.40, 0]); knee.name = `${side} knee`;
  sphere(knee, pants, [0, 0, 0], [.083, .083, .083]);
  add(knee, new THREE.CapsuleGeometry(.068, .24, 4, 10), pants, [0, -.19, 0]);
  const ankle = pivot(knee, [0, -.38, 0]); ankle.name = `${side} ankle`;
  sphere(ankle, shoes, [0, -.055, .055], [.105, .075, .185]);
  box(ankle, sole, [.19, .026, .31], [0, -.115, .067]);
  for (const z of [.06, .105, .15]) bar(ankle, sole, [-.06, -.008, z], [.06, -.008, z], .006, 5);
  return {hip, knee, ankle};
}
function studentArm(parent, x, sleeve, skin) {
  const side = x < 0 ? 'Left' : 'Right', shoulder = pivot(parent, [x, .425, 0]); shoulder.name = `${side} shoulder`;
  sphere(shoulder, sleeve, [0, -.025, 0], [.088, .105, .09]);
  add(shoulder, new THREE.CapsuleGeometry(.069, .16, 4, 10), sleeve, [0, -.145, 0]);
  const elbow = pivot(shoulder, [0, -.29, 0]); elbow.name = `${side} elbow`;
  add(elbow, new THREE.CapsuleGeometry(.058, .15, 4, 10), sleeve, [0, -.125, 0]);
  sphere(elbow, skin, [0, -.275, .014], [.066, .085, .065]);
  sphere(elbow, skin, [-Math.sign(x) * .046, -.262, .04], [.032, .047, .039]);
  return {shoulder, elbow};
}
const ease = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
const finite = value => Number.isFinite(value) ? value : 0;
function fallEnvelope(stumble) {
  if (!stumble || !Number.isFinite(stumble.phase)) return 0;
  const phase = clamp(stumble.phase, 0, 1);
  return ease(phase / .20) * (1 - ease((phase - .50) / .50));
}

export function createPlayer(scene) {
  const group = root(scene, 'Student explorer'); const shadow = groundShadow(group);
  const body = pivot(group, [0, .91, 0]); body.name = 'Explorer pelvis'; body.rotation.order = 'YXZ';
  const torso = pivot(body, [0, .035, 0]); torso.name = 'Explorer torso';
  const navy = mat('#18395c'), blue = mat('#336b9a'), skin = mat('#c98b63'), hair = mat('#3c2d29'), white = mat('#f5eee1'), sole = mat('#c5c7bc'), black = mat('#202931');
  blue.name = 'Explorer jacket';
  const leftLeg = studentLeg(body, -.115, navy, white, sole), rightLeg = studentLeg(body, .115, navy, white, sole);
  sphere(body, navy, [0, .005, -.005], [.205, .12, .145]);
  add(torso, new THREE.CapsuleGeometry(.195, .19, 5, 14), blue, [0, .245, 0], [1.08, 1, .77]);
  box(torso, white, [.135, .30, .014], [0, .27, .151]);
  box(torso, navy, [.016, .40, .018], [0, .235, .164]);
  sphere(torso, blue, [0, .438, -.075], [.155, .082, .14]);
  for (const x of [-.075, .075]) {
    bar(torso, white, [x, .43, .15], [x, .285, .16], .007);
    box(torso, navy, [.10, .014, .013], [Math.sign(x) * .115, .155, .148]);
  }
  const leftArm = studentArm(torso, -.265, blue, skin), rightArm = studentArm(torso, .265, blue, skin);
  add(torso, new THREE.CylinderGeometry(.066, .073, .105, 10), skin, [0, .51, 0]);
  const head = pivot(torso, [0, .685, 0]); head.name = 'Explorer head';
  sphere(head, skin, [0, 0, 0], [.18, .215, .175]);
  sphere(head, skin, [-.19, -.012, 0], [.043, .073, .038]); sphere(head, skin, [.19, -.012, 0], [.043, .073, .038]);
  add(head, new THREE.SphereGeometry(.193, 14, 9, 0, TAU, 0, Math.PI * .57), hair, [0, .043, -.013], [1, 1, .98]);
  for (const [x,y,z,s] of [[-.12,.105,.115,.075],[-.045,.15,.13,.065],[.025,.17,.12,.06]]) sphere(head, hair, [x,y,z], [s,s*.7,s*.6]);
  const eyes = [];
  for (const x of [-.065, .065]) {
    const eye = pivot(head, [x, .007, .162]); eye.name = x < 0 ? 'Left eye' : 'Right eye'; eyes.push(eye);
    sphere(eye, white, [0, 0, 0], [.027, .032, .012]); sphere(eye, black, [0, -.004, .012], [.013, .018, .007]);
    const brow = box(head, hair, [.052, .011, .012], [x, .058, .169]); brow.rotation.z = -Math.sign(x) * .08;
  }
  sphere(head, skin, [0, -.04, .18], [.031, .033, .028]); smile(head, hair, -.091, .169);
  const pack = box(torso, mat('#d4a556'), [.32, .36, .16], [0, .235, -.225]);
  pack.material.name = 'Explorer backpack';
  box(pack, pack.material, [.255, .13, .032], [0, -.075, -.09]);
  bar(pack, navy, [-.105, -.015, -.11], [.105, -.015, -.11], .008);
  sphere(torso, sole, [0, .425, -.20], [.13, .04, .09]);
  for (const x of [-.15, .15]) bar(torso, navy, [x, .43, -.02], [x, .05, .055], .021);
  let time = 0, cycle = 0, motion = 0, runBlend = 0, rideBlend = 0;
  const joints = [body, torso, head, ...[leftLeg, rightLeg].flatMap(leg => [leg.hip, leg.knee, leg.ankle]), ...[leftArm, rightArm].flatMap(arm => [arm.shoulder, arm.elbow])];
  const jointIndices = new Map(joints.map((joint, index) => [joint, index * 3])), targets = new Float64Array(joints.length * 3);
  const contactMeshes = [], shoeMeshes = [], contactBounds = new THREE.Box3(), contactMatrix = new THREE.Matrix4(), inverseAnchor = new THREE.Matrix4(), impactDirection = new THREE.Vector3();
  body.traverse(object => {if (object.isMesh) {object.geometry.computeBoundingBox(); contactMeshes.push(object);}});
  for (const leg of [leftLeg, rightLeg]) leg.ankle.traverse(object => {if (object.isMesh) shoeMeshes.push(object);});
  const approach = (object, property, value, alpha) => {object[property] += (value - object[property]) * alpha;};
  return {group, setStyle({level = 1,jacket,backpack} = {}) {
    const tier = cosmeticTier(level), palette = PLAYER_PALETTES[tier - 1];
    blue.color.set(jacket||palette[0]); pack.material.color.set(backpack||palette[1]); group.userData.cosmeticTier = tier;
  }, update(dt, {speed = 0, grounded = true, riding = false, emote = false, dance = false, running = false, verticalSpeed = 0, landing = 0, turn = 0, braking = false, stumble = null, instant = false} = {}) {
    dt = clamp(finite(dt), 0, .1); time += dt;
    shadow.visible = Boolean(grounded);
    // A paused postcard can explicitly pose the rig without advancing its clock.
    // Ordinary zero-delta renders retain their current blended animation.
    const meters = Math.min(18, Math.abs(finite(speed))), alpha = instant ? 1 : 1 - Math.exp(-dt * 14), moving = meters > .12;
    motion += ((moving && grounded && !riding ? Math.min(1, meters / 2.5) : 0) - motion) * alpha;
    runBlend += ((running || meters > 3.4 ? 1 : 0) - runBlend) * alpha;
    rideBlend += ((riding ? 1 : 0) - rideBlend) * alpha;
    cycle += dt * (6.8 + Math.min(meters, 6) * 1.35);
    const steer = clamp(finite(turn), -1, 1), crouch = clamp(finite(landing), 0, 1), sway = Math.sin(cycle), stride = (.48 + runBlend * .28) * motion;
    // Reset every target each update: gestures, air poses and falls cannot leave
    // a joint rotated after their state ends. Damping avoids one-frame snaps.
    targets.fill(0);
    const set = (joint, x = 0, y = 0, z = 0) => {const index = jointIndices.get(joint); targets[index] = x; targets[index + 1] = y; targets[index + 2] = z;};
    set(body, 0, Math.sin(cycle) * motion * .035, -steer * (.03 + rideBlend * .10));
    set(torso, runBlend * motion * .13 + rideBlend * (braking ? -.10 : .045) + crouch * .20, -Math.sin(cycle) * motion * .07, Math.sin(time * 1.4) * .007);
    set(head, -runBlend * motion * .075, steer * .12, Math.sin(time * 1.4) * .015);
    for (const [leg, sign] of [[leftLeg, 1], [rightLeg, -1]]) {
      const phase = sway * sign, swing = phase * stride;
      set(leg.hip, swing * (1 - rideBlend) - rideBlend * .065 - crouch * .30, 0, -sign * rideBlend * .025);
      set(leg.knee, (.035 + Math.max(0, phase) * motion * (.50 + runBlend * .65)) * (1 - rideBlend) + rideBlend * .13 + crouch * .65);
      set(leg.ankle, -Math.max(0, phase) * motion * .18 - rideBlend * .065 - crouch * .30);
      approach(leg.hip.position, 'z', rideBlend * (sign > 0 ? .135 : -.16), alpha);
    }
    for (const [arm, sign] of [[leftArm, 1], [rightArm, -1]]) {
      set(arm.shoulder, -sway * sign * stride * .72 * (1 - rideBlend) - rideBlend * .49 - runBlend * motion * .10, 0, -sign * (.055 + rideBlend * .035));
      set(arm.elbow, -(.10 + runBlend * motion * .72) * (1 - rideBlend) - rideBlend * .055);
    }
    let pelvisY = .91 + rideBlend * .23 + Math.abs(Math.sin(cycle)) * motion * (.014 + runBlend * .020) - crouch * .10;
    let pelvisX = 0, pelvisZ = 0, recoilYaw = 0;
    if (!grounded && !stumble) {
      const rising = finite(verticalSpeed) >= 0;
      set(torso, rising ? -.045 : .10); set(head, rising ? -.08 : .06);
      set(leftLeg.hip, rising ? -.32 : .12); set(rightLeg.hip, rising ? .18 : -.13);
      set(leftLeg.knee, rising ? .65 : .20); set(rightLeg.knee, rising ? .40 : .22);
      set(leftArm.shoulder, -.15, 0, -.40); set(rightArm.shoulder, -.15, 0, .40);
      set(leftArm.elbow, -.35); set(rightArm.elbow, -.35);
    }
    if (emote && !stumble) {set(rightArm.shoulder, -.15 + Math.sin(time * 7) * .16, 0, 2.65); set(rightArm.elbow, -.15); set(head, 0, -.12, -.065);}
    if (dance && !stumble) {
      set(body, 0, Math.sin(time * 2.5) * .18, Math.sin(time * 5) * .12);
      set(leftArm.shoulder, 0, 0, -1.3 + Math.sin(time * 5) * .35); set(rightArm.shoulder, 0, 0, 1.3 + Math.sin(time * 5) * .35);
      set(leftArm.elbow, -.65); set(rightArm.elbow, -.65);
      set(leftLeg.hip, Math.sin(time * 5) * .23); set(rightLeg.hip, -Math.sin(time * 5) * .23);
      pelvisY = .91 + Math.abs(Math.sin(time * 5)) * .075;
    }
    const fall = fallEnvelope(stumble);
    if (fall > 0) {
      const side = stumble.direction === -1 ? -1 : 1, crash = stumble.kind === 'crash', phase = clamp(stumble.phase, 0, 1);
      const gettingUp = ease((phase - .54) / .30), crouching = Math.sin(gettingUp * Math.PI);
      const impactYaw = Number.isFinite(stumble.impactYaw) ? stumble.impactYaw : group.rotation.y;
      group.updateWorldMatrix(true, false); inverseAnchor.copy(group.matrixWorld).invert();
      impactDirection.set(Math.sin(impactYaw), 0, Math.cos(impactYaw)).transformDirection(inverseAnchor);
      recoilYaw = Math.atan2(impactDirection.x, impactDirection.z);
      // Every current fall follows an obstruction impact. Recoil into the clear
      // space behind the rider instead of diving head-first through that wall.
      set(body, -fall * (crash ? 1.25 : 1.20), recoilYaw, side * fall * (crash ? .16 : .09));
      set(torso, .08 * fall); set(head, .20 * fall, side * .10 * fall);
      for (const [arm, sign] of [[leftArm, 1], [rightArm, -1]]) {set(arm.shoulder, 1.80 * fall - crouching * .30, 0, -sign * .28 * fall); set(arm.elbow, -.30 * fall - crouching * .30);}
      for (const [leg, sign] of [[leftLeg, 1], [rightLeg, -1]]) {
        set(leg.hip, -crouching * .08, 0, -sign * .05 * fall); set(leg.knee, 2.4 * fall + crouching * .25); set(leg.ankle, -.95 * fall - crouching * .10);
        leg.hip.position.z *= 1 - fall;
      }
      pelvisY = .91 - fall * .60 - crouching * .06;
      pelvisX = -Math.sin(recoilYaw) * fall * .18; pelvisZ = -Math.cos(recoilYaw) * fall * .18;
    }
    // Falls follow their authored phase immediately, so the crash silhouette
    // stays consistent at both low and high rendering rates.
    const poseAlpha = fall > 0 ? 1 : alpha;
    joints.forEach((joint, index) => {for (let axis = 0; axis < 3; axis++) approach(joint.rotation, ['x','y','z'][axis], targets[index * 3 + axis], poseAlpha);});
    approach(body.position, 'x', pelvisX, poseAlpha); approach(body.position, 'y', pelvisY, poseAlpha); approach(body.position, 'z', pelvisZ, poseAlpha);
    if (grounded && (!riding || fall > 0)) {
      // Pose the visual skeleton above its local contact plane. During a tumble
      // hands/backpack can make contact too; the physics foot anchor stays put.
      group.updateMatrixWorld(true); inverseAnchor.copy(group.matrixWorld).invert();
      let bottom = Infinity, leading = -Infinity;
      for (const mesh of fall > 0 ? contactMeshes : shoeMeshes) {
        contactMatrix.multiplyMatrices(inverseAnchor, mesh.matrixWorld);
        contactBounds.copy(mesh.geometry.boundingBox).applyMatrix4(contactMatrix); bottom = Math.min(bottom, contactBounds.min.y);
        if (fall > 0) {
          const {x,y,z} = impactDirection;
          leading = Math.max(leading, (x < 0 ? contactBounds.min.x : contactBounds.max.x) * x + (y < 0 ? contactBounds.min.y : contactBounds.max.y) * y + (z < 0 ? contactBounds.min.z : contactBounds.max.z) * z);
        }
      }
      if (bottom < 0) body.position.y -= bottom;
      if (fall > 0) {
        // Keep every visual part behind the collision capsule's leading edge,
        // including toes during the get-up pose. Only the local rig is shifted.
        const raised = Math.max(0, -bottom), excess = Math.max(0, leading + raised * impactDirection.y - (riding ? .43 : .30));
        const planar = Math.max(.01, impactDirection.x ** 2 + impactDirection.z ** 2);
        body.position.x -= impactDirection.x * excess / planar; body.position.z -= impactDirection.z * excess / planar;
      }
    }
    pack.rotation.x = Math.sin(cycle - .4) * .025 * motion;
    const blink = time % 4.6, eyeOpen = blink > 4.42 ? .12 + .88 * Math.abs((blink - 4.51) / .09) : 1;
    for (const eye of eyes) eye.scale.y = clamp(eyeOpen, .12, 1);
    group.userData.animationState = fall > 0 ? (stumble.kind === 'crash' ? 'crash' : 'trip') : !grounded ? (verticalSpeed >= 0 ? 'jump' : 'fall') : riding ? (braking ? 'brake' : 'ride') : dance ? 'dance' : emote ? 'wave' : moving ? (runBlend > .5 ? 'run' : 'walk') : 'idle';
  }, dispose: disposer(group)};
}

export function createScooter(scene) {
  const group = root(scene, 'Electric scooter'); const blue = mat('#275b9c', {metalness: .2}), dark = mat('#22303b'), tire = mat('#263036'), chrome = mat('#879ba5', {metalness: .6, roughness: .4});
  groundShadow(group, .48, 1.17); blue.name = 'Scooter deck';
  const frame = pivot(group, [0, 0, 0]); frame.name = 'Scooter frame';
  const steering = pivot(frame, [0, 0, .29]); steering.name = 'Scooter steering';
  box(frame, blue, [.20, .075, .76], [0, .19, -.03]); box(frame, dark, [.155, .012, .62], [0, .235, -.055]);
  const wheels = [];
  for (const z of [-.43, .43]) {
    const wheel = pivot(z > 0 ? steering : frame, [0, .135, z > 0 ? z - .29 : z]); wheel.name = z > 0 ? 'Front wheel' : 'Rear wheel';
    const ring = add(wheel, new THREE.TorusGeometry(.105, .033, 8, 18), tire); ring.rotation.y = Math.PI / 2;
    const hub = add(wheel, new THREE.CylinderGeometry(.055, .055, .075, 12), chrome); hub.rotation.z = Math.PI / 2; wheels.push(wheel);
  }
  bar(steering, chrome, [0, .16, .10], [0, 1.08, 0], .025);
  bar(steering, blue, [0, .32, .08], [0, .86, .02], .035);
  bar(steering, chrome, [-.28, 1.09, 0], [.28, 1.09, 0], .025);
  bar(steering, dark, [-.29, 1.09, 0], [-.16, 1.09, 0], .033); bar(steering, dark, [.16, 1.09, 0], [.29, 1.09, 0], .033);
  box(steering, dark, [.10, .045, .065], [0, 1.115, 0]);
  const headlight = mat('#fff2ce', {emissive: '#ffeab4', emissiveIntensity: .55}); sphere(steering, headlight, [0, .90, .065], [.035, .035, .015]);
  const rear = mat('#cd543c', {emissive: '#a22c1c', emissiveIntensity: .3}); rear.name = 'Scooter brake light'; box(frame, rear, [.065, .035, .018], [0, .235, -.44]);
  let roll = 0;
  return {group, setStyle({level = 1,color} = {}) {const tier = cosmeticTier(level); blue.color.set(color||SCOOTER_PALETTES[tier - 1]); group.userData.cosmeticTier = tier;}, update(dt, {speed = 0, groundRoll = 0, turn = 0, braking = false, stumble = null} = {}) {
    dt = clamp(finite(dt), 0, .1); const meters = Math.abs(finite(speed)), alpha = 1 - Math.exp(-dt * 14), fall = fallEnvelope(stumble), steer = clamp(finite(turn), -1, 1);
    roll += meters * dt / .135; for (const wheel of wheels) wheel.rotation.x = roll;
    group.rotation.z = finite(groundRoll);
    const side = stumble?.direction === -1 ? -1 : 1;
    const bank = -steer * Math.min(.13, meters * .018) + Math.sin(roll * .04) * Math.min(.015, meters * .002);
    frame.rotation.z += ((fall > 0 ? side * 1.35 * fall : bank) - frame.rotation.z) * (fall > 0 ? 1 : alpha);
    frame.position.y += (fall * .12 - frame.position.y) * (fall > 0 ? 1 : alpha);
    frame.rotation.x += ((braking ? -.04 : 0) - frame.rotation.x) * alpha;
    steering.rotation.y += (steer * .34 - steering.rotation.y) * alpha;
    rear.emissiveIntensity = braking ? 1.8 : .3;
    group.userData.animationState = fall > 0 ? 'crash' : braking ? 'brake' : meters > .1 ? 'ride' : 'parked';
  }, dispose: disposer(group)};
}

export function createCat(scene) {
  const group = root(scene, 'Campus cat'); groundShadow(group, .46, .76); const body = pivot(group, [0, 0, 0]);
  const orange = mat('#d59a57'), cream = mat('#f6dfba'), stripe = mat('#9b6338'), pink = mat('#d18d87'), eyes = mat('#71977b'), black = mat('#27322c');
  sphere(body, orange, [0, .245, -.03], [.14, .16, .30]); sphere(body, cream, [0, .20, .155], [.11, .105, .11]);
  const head = pivot(body, [0, .37, .235]); sphere(head, orange, [0, 0, 0], [.15, .145, .14]);
  for (const side of [-1, 1]) {
    const ear = add(head, new THREE.ConeGeometry(.065, .15, 3), orange, [side * .105, .125, -.015]); ear.rotation.z = -side * .18; ear.rotation.y = Math.PI;
    const inside = add(head, new THREE.ConeGeometry(.036, .085, 3), pink, [side * .105, .13, .017]); inside.rotation.z = -side * .18; inside.rotation.y = Math.PI;
    sphere(head, cream, [side * .042, -.035, .12], [.055, .043, .035]);
    sphere(head, eyes, [side * .064, .028, .124], [.032, .032, .012]); sphere(head, black, [side * .064, .028, .136], [.009, .024, .006]);
    for (let i = 0; i < 2; i++) bar(head, cream, [side * .05, -.035 - i * .015, .15], [side * .18, -.022 - i * .028, .15], .0025, 4);
  }
  sphere(head, pink, [0, -.027, .156], [.019, .014, .009]);
  for (const x of [-.052, 0, .052]) {const patch = box(head, stripe, [.024, .055, .009], [x, .09, .113]); patch.rotation.z = x * -2;}
  for (const z of [-.17, -.06, .05]) {const patch = sphere(body, stripe, [0, .375, z], [.128, .016, .025]); patch.rotation.z = .08;}
  const legs = [];
  for (const x of [-.095, .095]) for (const z of [-.20, .16]) {
    const leg = pivot(body, [x, .20, z]); add(leg, new THREE.CapsuleGeometry(.035, .12, 3, 7), orange, [0, -.08, 0]); sphere(leg, cream, [0, -.173, .02], [.045, .027, .06]); legs.push(leg);
  }
  const tail = pivot(body, [0, .31, -.28]);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.05, .10, -.12), new THREE.Vector3(.055, .29, -.15), new THREE.Vector3(.015, .36, -.10)]);
  add(tail, new THREE.TubeGeometry(curve, 12, .025, 7, false), orange); sphere(tail, cream, [.015, .36, -.10], [.026, .027, .027]);
  let time = 0;
  return {group, update(dt, {running = false, petting = false} = {}) {
    time += clamp(dt, 0, .1); const cycle = time * (running ? 15 : 2);
    for (let i = 0; i < legs.length; i++) legs[i].rotation.x = running ? Math.sin(cycle + (i === 0 || i === 3 ? 0 : Math.PI)) * .60 : 0;
    body.position.y = running ? Math.abs(Math.sin(cycle)) * .025 : Math.sin(time * 2.5) * .004;
    tail.rotation.y = Math.sin(time * (petting ? 5 : 2)) * (petting ? .65 : .23);
    head.rotation.x = petting ? -.18 : Math.sin(time * 1.5) * .035; head.rotation.z = petting ? Math.sin(time * 3) * .09 : 0;
  }, dispose: disposer(group)};
}

export function createCosmo(scene) {
  const group = root(scene, 'Cosmo campus mascot'); groundShadow(group, .84, .76); const body = pivot(group, [0, 0, 0]);
  const blue = mat('#123c7a'), fur = mat('#bf925f'), tan = mat('#ebcf9e'), dark = mat('#503d32'), white = mat('#fff8e8'), black = mat('#253238');
  const leftLeg = humanLeg(body, -.145, fur, white), rightLeg = humanLeg(body, .145, fur, white);
  box(body, blue, [.49, .49, .29], [0, 1.08, 0]); sphere(body, blue, [0, .855, 0], [.25, .12, .16]);
  box(body, white, [.50, .045, .302], [0, .88, .004]);
  const leftArm = humanArm(body, -.31, fur, fur), rightArm = humanArm(body, .31, fur, fur);
  const badge = labelTexture('Y'); if (badge) {const material = mat('#ffffff', {map: badge, roughness: 1}); add(body, new THREE.PlaneGeometry(.21, .23), material, [0, 1.13, .151]);}
  const head = pivot(body, [0, 1.54, .015]); sphere(head, fur, [0, 0, 0], [.29, .255, .24]);
  for (const side of [-1, 1]) {
    sphere(head, fur, [side * .22, .19, -.025], [.105, .115, .075]); sphere(head, dark, [side * .22, .195, .035], [.065, .070, .012]);
    sphere(head, tan, [side * .09, -.075, .205], [.115, .09, .07]);
    sphere(head, white, [side * .106, .055, .208], [.06, .06, .025]); sphere(head, black, [side * .096, .05, .232], [.025, .035, .012]);
    const brow = sphere(head, dark, [side * .11, .115, .21], [.079, .019, .025]); brow.rotation.z = -side * .13;
    for (const dz of [0, .03]) for (const dx of [0, .035]) sphere(head, dark, [side * (.068 + dx), -.066 - dz, .269], [.007, .007, .004], 7);
  }
  sphere(head, dark, [0, -.035, .283], [.044, .03, .025]); smile(head, dark, -.11, .264, .065);
  sphere(head, tan, [0, -.17, .13], [.13, .065, .10]);
  const tail = pivot(body, [0, .83, -.13]);
  add(tail, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0),new THREE.Vector3(.12, -.05, -.27),new THREE.Vector3(.20, .05, -.43),new THREE.Vector3(.16, .17, -.46)]), 12, .035, 7), fur);
  sphere(tail, dark, [.16, .17, -.46], [.038, .042, .04]);
  // Jersey sleeve cuffs make the blue/white silhouette read as a mascot uniform.
  for (const arm of [leftArm, rightArm]) {sphere(arm, blue, [0, -.045, 0], [.10, .12, .10]); bar(arm, white, [-.075, -.14, .05], [.075, -.14, .05], .014);}
  let time = 0;
  return {group, update(dt, {wave = true, dance = false} = {}) {
    time += clamp(dt, 0, .1); body.position.y = dance ? Math.abs(Math.sin(time * 5)) * .08 : Math.sin(time * 2) * .009;
    body.rotation.z = dance ? Math.sin(time * 5) * .13 : 0;
    leftArm.rotation.x = dance ? Math.sin(time * 5) * .7 : -.05;
    rightArm.rotation.z = wave || dance ? -2.5 + Math.sin(time * 6) * .22 : -.06;
    rightArm.rotation.x = dance ? Math.cos(time * 5) * .7 : -.20;
    leftLeg.rotation.x = dance ? Math.sin(time * 5) * .25 : 0; rightLeg.rotation.x = dance ? -Math.sin(time * 5) * .25 : 0;
    head.rotation.z = Math.sin(time * 1.8) * .05; tail.rotation.y = Math.sin(time * 2) * .25;
  }, dispose: disposer(group)};
}

export function createCar(scene) {
  const group = root(scene, 'Parked campus car'); const paint = mat('#7896a0', {roughness: .47, metalness: .25}), dark = mat('#233942'), rubber = mat('#263139'), glass = mat('#91b5bd', {roughness: .30, metalness: .15}), cream = mat('#faf0ce'), metal = mat('#bcc9c9', {metalness: .55, roughness: .35});
  box(group, paint, [1.72, .46, 3.7], [0, .58, 0]); box(group, paint, [1.57, .48, 1.83], [0, 1.01, -.08]);
  box(group, glass, [1.44, .32, .025], [0, 1.05, .846]); box(group, glass, [1.44, .29, .025], [0, 1.05, -1.006]);
  for (const side of [-1, 1]) {
    box(group, glass, [.018, .31, 1.53], [side * .795, 1.07, -.08]); box(group, dark, [.025, .36, .055], [side * .81, 1.06, -.10]);
    box(group, paint, [.18, .12, .26], [side * .92, 1.00, .57]);
    for (const z of [-1.17, 1.17]) {const tire = add(group, new THREE.CylinderGeometry(.31, .31, .20, 16), rubber, [side * .82, .31, z]); tire.rotation.z = Math.PI / 2; const hub = add(group, new THREE.CylinderGeometry(.17, .17, .212, 12), metal, [side * .83, .31, z]); hub.rotation.z = Math.PI / 2;}
    box(group, cream, [.37, .15, .025], [side * .53, .66, 1.867]); box(group, mat('#b95142'), [.32, .13, .025], [side * .55, .65, -1.867]);
    box(group, metal, [.07, .035, .16], [side * .878, .77, .18]);
  }
  box(group, dark, [.65, .12, .03], [0, .48, 1.868]); box(group, cream, [.35, .10, .032], [0, .43, -1.87]);
  return {group, dispose: disposer(group)};
}

export function createMarker(scene, {color = '#edbd61', kind = 'discovery'} = {}) {
  const group = root(scene, `Marker: ${kind}`); const glow = mat(color, {emissive: color, emissiveIntensity: .3, roughness: .5});
  const ring = add(group, new THREE.TorusGeometry(.60, .021, 6, 36), glow, [0, .035, 0]); ring.rotation.x = Math.PI / 2;
  const beacon = pivot(group, [0, 1.55, 0]);
  add(beacon, new THREE.OctahedronGeometry(.14), glow);
  const inner = add(group, new THREE.TorusGeometry(.42, .012, 5, 30), glow, [0, .037, 0]); inner.rotation.x = Math.PI / 2;
  let time = 0;
  return {group, update(dt) {time += clamp(dt, 0, .1); beacon.position.y = 1.55 + Math.sin(time * 2.5) * .12; beacon.rotation.y = time * .65; inner.rotation.z = -time * .2;}, dispose: disposer(group)};
}

export function createBench(scene) {
  const group = root(scene, 'Scenic bench'); const wood = mat('#b58959'), metal = mat('#315155');
  for (const z of [-.18, -.06, .06, .18]) box(group, wood, [1.65, .055, .10], [0, .48, z]);
  for (const y of [.72, .88, 1.04]) box(group, wood, [1.65, .10, .055], [0, y, -.25]);
  for (const x of [-.62, .62]) {bar(group, metal, [x, 0, -.17], [x, .50, -.17], .028); bar(group, metal, [x, 0, .17], [x, .50, .17], .028); bar(group, metal, [x, .45, -.27], [x, 1.10, -.27], .025);}
  return {group, dispose: disposer(group)};
}
