import * as THREE from 'three';

function makeSkyDome(sunDir){
  const geo=new THREE.SphereGeometry(2200,24,16);
  const mat=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{uSun:{value:sunDir.clone().normalize()}},
    vertexShader:`
      varying vec3 vDir;
      void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
    `,
    fragmentShader:`
      uniform vec3 uSun;
      varying vec3 vDir;
      void main(){
        float h=clamp(vDir.y,0.0,1.0);
        vec3 horizon=vec3(0.86,0.92,0.95);
        vec3 midSky=vec3(0.56,0.77,0.94);
        vec3 zenith=vec3(0.32,0.58,0.87);
        vec3 sky=mix(horizon,midSky,smoothstep(0.0,0.22,h));
        sky=mix(sky,zenith,smoothstep(0.22,0.85,h));
        float sunAmt=max(dot(normalize(vDir),uSun),0.0);
        sky+=vec3(1.0,0.92,0.72)*pow(sunAmt,16.0)*0.24;
        sky=mix(sky,vec3(1.0,0.98,0.90),smoothstep(0.997,0.9994,sunAmt)*0.85);
        gl_FragColor=vec4(sky,1.0);
      }
    `
  });
  const dome=new THREE.Mesh(geo,mat);
  dome.name='Stylized sky dome';dome.raycast=()=>{};
  return dome;
}

function makeValleyToonMaterial(gradientMap){
  const mat=new THREE.MeshToonMaterial({vertexColors:true,gradientMap});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>',`#include <common>\nvarying vec3 vValleyWorldPos;\nvarying vec3 vValleyWorldNormal;`)
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>\nvValleyWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvValleyWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>\nvarying vec3 vValleyWorldPos;\nvarying vec3 vValleyWorldNormal;`)
      .replace('#include <color_fragment>',`
        #include <color_fragment>
        // Stylized Wasatch alpine snow cap & vivid valley contrast
        float peak=smoothstep(9.0,18.5,vValleyWorldPos.y)*smoothstep(0.28,0.75,vValleyWorldNormal.y);
        float isY=step(0.55,diffuseColor.r)*step(0.55,diffuseColor.g)*step(0.55,diffuseColor.b)*step(vValleyWorldPos.y,12.0)*step(1.5,vValleyWorldPos.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.92,0.96,1.0),peak*0.62);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.98,0.99,1.0),isY*0.65);
        // Subtle green richness on lower slopes
        float slopeGreen=step(diffuseColor.r*1.04,diffuseColor.g)*(1.0-peak);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.94,1.08,0.92),slopeGreen*0.55);
      `)
      .replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        reflectedLight.indirectDiffuse*=vec3(0.86,0.93,1.06);
      `);
  };
  return mat;
}

// Optional scenery loads after campus is usable. No textures, shadows, picking,
// animation, new decoder, or network calls to a terrain service at runtime.
export function loadValleyContext(loader,scene,camera,invalidate,{gradientMap,sunPosition}={}){
  const load=()=>loader.loadAsync('./valley_lod.glb?v=20261118mapui3').then(({scene:valley})=>{
    valley.name='Valley context';
    const valleyMat=gradientMap?makeValleyToonMaterial(gradientMap):null;
    valley.traverse(object=>{
      if(object.isMesh){
        if(valleyMat)object.material=valleyMat;
        object.raycast=()=>{};object.castShadow=false;object.receiveShadow=false;
      }
    });
    scene.add(valley);
    scene.add(makeSkyDome(sunPosition||new THREE.Vector3(-38,68,24)));
    scene.background=new THREE.Color('#dceaf2');
    scene.fog=new THREE.Fog('#dceaf2',260,1400);
    camera.far=3000;camera.updateProjectionMatrix();
    invalidate();
  }).catch(error=>console.warn('Optional valley scenery unavailable; campus remains usable.',error));
  if('requestIdleCallback' in window)window.requestIdleCallback(load,{timeout:1000});
  else requestAnimationFrame(load);
}
