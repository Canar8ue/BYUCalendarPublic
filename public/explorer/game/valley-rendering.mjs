/** Give the existing white Y its own depth bias without moving its geometry.
 * The shared backdrop remains one downloaded asset; only the game adds a second
 * draw call. Metadata/count checks keep unrelated white scenery untouched.
 */
export function stabilizeMountainY(scene) {
  let result=null;
  scene.traverse(mesh=>{
    const expected=mesh.userData?.mountainY?.triangles;
    if(!mesh.isMesh||!Number.isInteger(expected)||expected<=0||Array.isArray(mesh.material))return;
    const geometry=mesh.geometry,index=geometry.index,color=geometry.getAttribute('color');
    if(!index||!color||index.count%3)return;
    const ground=[],letter=[];
    for(let i=0;i<index.count;i+=3){
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      const white=ids.every(id=>color.getX(id)>.99&&color.getY(id)>.99&&color.getZ(id)>.99);
      (white?letter:ground).push(...ids);
    }
    if(letter.length!==expected*3||ground.length===0)return;
    const terrainMaterial=mesh.material,yMaterial=terrainMaterial.clone();
    yMaterial.name='Hillside Y with depth bias';
    yMaterial.polygonOffset=true;yMaterial.polygonOffsetFactor=-1;yMaterial.polygonOffsetUnits=-1;
    // Keep mountain/building occlusion, including views from behind the hill.
    yMaterial.depthTest=true;yMaterial.depthWrite=true;
    geometry.setIndex(ground.concat(letter));
    geometry.clearGroups();geometry.addGroup(0,ground.length,0);geometry.addGroup(ground.length,letter.length,1);
    mesh.material=[terrainMaterial,yMaterial];
    result={groundTriangles:ground.length/3,yTriangles:letter.length/3};
  });
  return result;
}
