import * as CANNON from '../vendor/cannon-es.mjs';

// Real rigid bodies, inertia, contact impulses and angular joint limits. Runs
// only during a bail; the ordinary movement controller remains lightweight.
export function createSkateRagdoll({position, velocity, heading = 0, boardPose, riderPose, sample, walls = () => [], rails = [], obstacles = []}) {
  const physics = new CANNON.World({gravity: new CANNON.Vec3(0, -9.81, 0)});
  physics.solver.iterations = 18;
  physics.allowSleep = true;
  physics.defaultContactMaterial.friction = .48;
  physics.defaultContactMaterial.restitution = .08;
  const parts = [], joints = [], statics = [];
  const rotation = new CANNON.Quaternion(); rotation.setFromEuler(0, heading + Math.PI / 2, 0);
  const vector = a => new CANNON.Vec3(...a);
  const body = (name, offset, size, mass, color) => {
    const local = rotation.vmult(vector(offset));
    const part = new CANNON.Body({mass, shape: name === 'head' ? new CANNON.Sphere(size[0]) : new CANNON.Box(vector(size.map(v => v / 2))),
      position: new CANNON.Vec3(position.x + local.x, position.y + local.y, position.z + local.z),
      linearDamping: .08, angularDamping: .22, sleepSpeedLimit: .25, sleepTimeLimit: .7,
      collisionFilterGroup: 2, collisionFilterMask: 1 | 2});
    part.quaternion.copy(rotation);
    const pose=riderPose?.[name];
    if(pose){
      part.position.copy(pose.position);part.quaternion.copy(pose.quaternion);part.quaternion.normalize();
      for(const collider of pose.colliders||[]){
        const offset=part.pointToLocalFrame(new CANNON.Vec3().copy(collider.position));
        const relative=part.quaternion.conjugate().mult(new CANNON.Quaternion().copy(collider.quaternion));
        part.addShape(new CANNON.Box(vector(collider.size.map(value=>value/2))),offset,relative);
      }
    }
    part.velocity.set(velocity.x, velocity.y + 1.1, velocity.z);
    part.angularVelocity.set(Math.cos(heading) * 4, name.includes('arm') ? 2.5 : .3, -Math.sin(heading) * 4);
    physics.addBody(part); parts.push({name, body: part, size, color}); return part;
  };
  const pelvis = body('pelvis', [0, .96, 0], [.34, .22, .25], 12, '#18395c');
  const torso = body('torso', [0, 1.30, 0], [.43, .45, .29], 22, '#336b9a');
  const head = body('head', [0, 1.75, 0], [.20, .20, .20], 5, '#c98b63');
  const connect = (a, b, pa, pb, angle, twist = .25, axis = [0, 1, 0]) => {
    const name=parts.find(part=>part.body===b).name,anchor=riderPose?.[name]?.anchor;
    const worldAnchor=anchor?new CANNON.Vec3().copy(anchor):null;
    const axisA=vector(axis),axisB=worldAnchor?b.vectorToLocalFrame(a.vectorToWorldFrame(axisA)):vector(axis);
    const joint = new CANNON.ConeTwistConstraint(a, b, {pivotA:worldAnchor?a.pointToLocalFrame(worldAnchor):vector(pa),pivotB:worldAnchor?b.pointToLocalFrame(worldAnchor):vector(pb),
      axisA,axisB, angle, twistAngle: twist, maxForce: 1e5, collideConnected: false});
    physics.addConstraint(joint); joints.push(joint);
  };
  connect(pelvis, torso, [0, .11, 0], [0, -.23, 0], .45, .35);
  connect(torso, head, [0, .27, 0], [0, -.18, 0], .5, .5);
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'left' : 'right';
    const thigh = body(side + '-thigh', [sign * .13, .65, 0], [.17, .40, .18], 8, '#18395c');
    const shin = body(side + '-shin', [sign * .13, .25, .01], [.15, .40, .17], 5, '#18395c');
    connect(pelvis, thigh, [sign * .13, -.11, 0], [0, .20, 0], .85, .4);
    connect(thigh, shin, [0, -.20, 0], [0, .20, 0], .7, .08);
    const upper = body(side + '-upper-arm', [sign * .32, 1.27, 0], [.14, .30, .16], 3, '#336b9a');
    const lower = body(side + '-forearm', [sign * .36, .97, .02], [.12, .30, .13], 2, '#c98b63');
    connect(torso, upper, [sign * .22, .10, 0], [-sign * .10, .13, 0], 1.3, .7);
    connect(upper, lower, [sign * .04, -.15, 0], [0, .15, 0], 1.1, .1);
  }
  // The deck is a separate dynamic object: it can bounce, spin and slide away.
  const deckRotation = new CANNON.Quaternion(); deckRotation.setFromEuler(0, heading, 0);
  const deck = body('board', [0, .08, 0], [.33, .16, .86], 2.5, '#dd8849');
  deck.quaternion.copy(deckRotation);
  const boardPoint=boardPose?.position,boardRotation=boardPose?.quaternion;
  if ([boardPoint?.x,boardPoint?.y,boardPoint?.z,boardRotation?.x,boardRotation?.y,boardRotation?.z,boardRotation?.w].every(Number.isFinite) &&
      Math.hypot(boardRotation.x,boardRotation.y,boardRotation.z,boardRotation.w)>1e-8) {
    deck.position.copy(boardPoint);deck.quaternion.copy(boardRotation);deck.quaternion.normalize();
  }
  deck.velocity.y += 1.4; deck.angularVelocity.set(4, 3, 2);
  let terrainCenter = null, elapsed = 0;
  function rebuildTerrain() {
    for (const item of statics.splice(0)) physics.removeBody(item);
    const center = pelvis.position, spacing = .75, count = 41, half = (count - 1) * spacing / 2;
    const origin = {x: center.x - half, z: center.z + half};
    const heights = [];
    for (let i = 0; i < count; i++) {
      const column = [];
      for (let j = 0; j < count; j++) column.push(sample(origin.x + i * spacing, origin.z - j * spacing, center.y) ?? position.y - 10);
      heights.push(column);
    }
    const terrain = new CANNON.Body({mass: 0, shape: new CANNON.Heightfield(heights, {elementSize: spacing}), collisionFilterGroup: 1});
    terrain.position.set(origin.x, 0, origin.z); terrain.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physics.addBody(terrain); statics.push(terrain);
    for (const wall of walls(center.x, center.z, half)) {
      const dx = wall.bx - wall.ax, dz = wall.bz - wall.az, length = Math.hypot(dx, dz), height = wall.maxY - wall.minY;
      if (length < .01 || height < .01) continue;
      const collider = new CANNON.Body({mass: 0, shape: new CANNON.Box(new CANNON.Vec3(length / 2, height / 2, .10)), collisionFilterGroup: 1});
      collider.position.set((wall.ax + wall.bx) / 2, (wall.minY + wall.maxY) / 2, (wall.az + wall.bz) / 2);
      collider.quaternion.setFromEuler(0, -Math.atan2(dz, dx), 0);
      physics.addBody(collider); statics.push(collider);
    }
    for (const rail of rails) {
      const a = rail.a, b = rail.b;
      if (Math.hypot(a.x - center.x, a.z - center.z) > half + 10) continue;
      const delta = vector([b.x - a.x, b.y - a.y, b.z - a.z]);
      const collider = new CANNON.Body({mass: 0, shape: new CANNON.Box(new CANNON.Vec3(.06, .06, delta.length() / 2)), collisionFilterGroup: 1});
      collider.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      collider.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), delta.unit());
      physics.addBody(collider); statics.push(collider);
    }
    for(const obstacle of obstacles){
      if(obstacle.rail||Math.hypot(obstacle.x-center.x,obstacle.z-center.z)>half)continue;
      const collider=new CANNON.Body({mass:0,shape:new CANNON.Cylinder(obstacle.radius,obstacle.radius,obstacle.top-obstacle.bottom,8),collisionFilterGroup:1});
      collider.position.set(obstacle.x,(obstacle.top+obstacle.bottom)/2,obstacle.z);physics.addBody(collider);statics.push(collider);
    }
    terrainCenter = {x: center.x, z: center.z};
  }
  rebuildTerrain();
  return {parts, joints, physics, board: deck,
    step(dt) {
      elapsed += dt;
      if (Math.hypot(pelvis.position.x - terrainCenter.x, pelvis.position.z - terrainCenter.z) > 7) rebuildTerrain();
      physics.step(1 / 120, Math.min(.05, dt), 6);
    },
    get elapsed() {return elapsed;},
    get position() {return pelvis.position;},
    get settled() {return elapsed > 1 && parts.every(p => p.body.velocity.length() < 1.2);},
    dispose() {for (const joint of joints) physics.removeConstraint(joint); for (const item of [...parts.map(p => p.body), ...statics]) physics.removeBody(item);},
  };
}
