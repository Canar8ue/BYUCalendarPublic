import * as THREE from 'three';

// Optional scenery loads after campus is usable. No textures, shadows, picking,
// animation, new decoder, or network calls to a terrain service at runtime.
export function loadValleyContext(loader,scene,camera,invalidate){
  const load=()=>loader.loadAsync('./valley_lod.glb?v=20261102pins1').then(({scene:valley})=>{
    valley.name='Valley context';
    valley.traverse(object=>{if(object.isMesh){object.raycast=()=>{};object.castShadow=false;object.receiveShadow=false;}});
    scene.add(valley);
    scene.background=new THREE.Color('#e4ecee');
    scene.fog=new THREE.Fog(scene.background,200,1200);
    camera.far=3000;camera.updateProjectionMatrix();
    invalidate();
  }).catch(error=>console.warn('Optional valley scenery unavailable; campus remains usable.',error));
  if('requestIdleCallback' in window)window.requestIdleCallback(load,{timeout:1000});
  else requestAnimationFrame(load);
}
