// Authored game terrain, deliberately outside the surveyed campus model.
// Coordinates below are meters local to the skate yard, not BYU facilities.
export const SKATE_ORIGIN = Object.freeze({x: 74, z: -5}); // native campus units
export const SPOT_STARTS = Object.freeze({yard: {x: 0, z: 3, heading: 0}, downhill: {x: 0, z: -307, heading: 0}});
export function downhillCenter(z) {return z < 0 ? 5 * Math.sin(z / 48) : 0;}
export function skateSpotHeight(x, z) {
  if (x < -75 || x > 75 || z < -330 || z > 94) return null;
  let height = z < -12 ? (-z - 12) * .22 : 0;
  // Wide grassy shoulders make a missed turn recoverable. The descending road
  // has two optional, offset launch ramps; the center lane is uninterrupted.
  if (z < -12) {
    const roadX = x - downhillCenter(z);
    height += Math.max(0, Math.abs(roadX) - 8) ** 1.25 * .07;
    if (roadX > 2 && roadX < 6) {
      for (const at of [-225, -112]) if (z >= at && z <= at + 6) height += (z - at) * .28;
    }
    return height;
  }
  // Transition bowl: continuous surface and gradient at the outer lip.
  const radius = Math.hypot(x, z - 58);
  if (radius < 13) height -= 2.7 * (1 - (radius / 13) ** 2) ** 2;
  if (x > -19 && x < -7 && z >= 24 && z <= 47) height += Math.min(1.4, (z - 24) * .28, (47 - z) * .28);
  if (x > 12 && x < 20 && z >= 16 && z <= 22) height += (z - 16) * .30;
  // Quarter transitions at both sides and the far end of the yard.
  if (Math.abs(x) > 32) height += Math.min(4.3, Math.max(0, Math.abs(x) - 32) ** 2 * .075);
  if (z > 76) height += Math.min(4.3, (z - 76) ** 2 * .075);
  return height;
}
export function createSpotRails(base = 0) {
  return [
    {id: 'flat', a: {x: 5, y: base + .65, z: 27}, b: {x: 5, y: base + .65, z: 42}},
    {id: 'box', a: {x: -13, y: base + 1.9, z: 29}, b: {x: -13, y: base + 1.9, z: 42}},
    {id: 'long', a: {x: 24, y: base + .65, z: 39}, b: {x: 24, y: base + .65, z: 65}},
  ];
}
