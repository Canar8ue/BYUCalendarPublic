import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/campus/vendor/meshopt_decoder.module.js';
import { loadValleyContext } from '/campus/valley-context.js?v=20261116stylized1';

function createToonRamp() {
  const ramp = new Uint8Array([78, 146, 214, 255]);
  const tex = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createStylizedCampusMaterial(gradientMap) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 wn=normalize(vWorldNormal);
        float isGlass=step(diffuseColor.r*1.28+0.02,diffuseColor.b)*step(diffuseColor.r,0.22)*step(0.13,diffuseColor.b)*(1.0-smoothstep(0.60,0.85,abs(wn.y)));
        float isWater=step(diffuseColor.r*1.32+0.02,diffuseColor.b)*step(0.18,diffuseColor.b)*smoothstep(0.80,0.95,wn.y);
        float isGreen=step(diffuseColor.r*1.05,diffuseColor.g)*step(diffuseColor.b*1.04,diffuseColor.g);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.92,1.12,0.88),isGreen*0.65);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.14,0.38,0.52),isGlass*0.32);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.16,0.54,0.74),isWater*0.42);
      `)
      .replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        reflectedLight.indirectDiffuse*=vec3(0.88,0.94,1.06);
        vec3 wn2=normalize(vWorldNormal);
        vec3 viewDirW=normalize(cameraPosition-vWorldPos);
        float fresnel=pow(1.0-max(dot(wn2,viewDirW),0.0),2.4);
        float glassMask=step(diffuseColor.r*1.28+0.02,diffuseColor.b)*step(diffuseColor.r,0.22)*step(0.13,diffuseColor.b)*(1.0-smoothstep(0.60,0.85,abs(wn2.y)));
        float waterMask=step(diffuseColor.r*1.32+0.02,diffuseColor.b)*step(0.18,diffuseColor.b)*smoothstep(0.80,0.95,wn2.y);
        float glint=smoothstep(0.42,0.52,fract((vWorldPos.x+vWorldPos.z)*0.85+vWorldPos.y*1.4));
        reflectedLight.directDiffuse+=vec3(0.45,0.68,0.84)*(fresnel*0.55+glint*0.18)*glassMask;
        reflectedLight.directDiffuse+=vec3(0.38,0.62,0.78)*(fresnel*0.50+0.12)*waterMask;
        float notGround=1.0-smoothstep(0.86,0.97,abs(wn2.y));
        float edge=smoothstep(0.38,1.05,length(fwidth(normalize(vNormal))))*notGround;
        float rim=smoothstep(0.65,0.92,fresnel)*notGround*(1.0-glassMask)*0.22;
        reflectedLight.directDiffuse*=1.0-edge*0.34-rim;
        reflectedLight.indirectDiffuse*=1.0-edge*0.26-rim;
      `);
  };
  return mat;
}

const DEMO_PINS = [
  { code: 'WSC', count: 22, pos: [10.105, 2.5, 7.188], ring: 'conic-gradient(#1a73e8 0% 45%, #188038 45% 75%, #9334e6 75% 100%)' },
  { code: 'TNRB', count: 14, pos: [-9.536, 2.1, -2.228], ring: 'conic-gradient(#188038 0% 80%, #1a73e8 80% 100%)' },
  { code: 'HBLL', count: 8, pos: [2.854, 2.2, 5.049], ring: 'conic-gradient(#78909c 0% 60%, #1a73e8 60% 100%)' },
  { code: 'JSB', count: 9, pos: [-6.227, 2.0, 20.384], ring: 'conic-gradient(#00897b 0% 85%, #1a73e8 85% 100%)' },
  { code: 'MOA', count: 6, pos: [7.618, 2.2, -3.883], ring: 'conic-gradient(#9334e6 0% 100%)' },
  { code: 'EB', count: 5, pos: [7.904, 2.1, 18.151], ring: 'conic-gradient(#78909c 0% 70%, #188038 70% 100%)' },
  { code: 'MC', count: 4, pos: [2.568, 3.0, -20.117], ring: 'conic-gradient(#e8710a 0% 65%, #00897b 65% 100%)' },
];

export async function initCampusFlyover({ stage, loadingEl, pinsEl, cutEl, still = null }) {
  let stillPose = still;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dceaf2');

  const camera = new THREE.PerspectiveCamera(40, Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight), 0.25, 3000);
  if (stillPose) {
    camera.position.set(...stillPose.pos);
    camera.lookAt(new THREE.Vector3(...stillPose.target));
    camera.fov = stillPose.fov;
    camera.updateProjectionMatrix();
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xdaf0ff, 0x738d68, 1.12));
  const sun = new THREE.DirectionalLight(0xfff1d4, 2.8);
  sun.position.set(-38, 68, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 175;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.032;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xc9dfff, 0.42);
  fill.position.set(32, 26, -30);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 160;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enabled = false;

  // Build floating demo pins for Map slide
  const pinEls = DEMO_PINS.map(pin => {
    const el = document.createElement('div');
    el.className = 'flyover-pin';
    el.style.setProperty('--ring', pin.ring);
    el.innerHTML = `<span class="flyover-pin-count"><b>${pin.count}</b></span><span class="flyover-pin-code">${pin.code}</span>`;
    pinsEl.appendChild(el);
    return { ...pin, el, vec: new THREE.Vector3(...pin.pos) };
  });

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/campus/campus_web.glb?v=20261116stylized1');
  const toonRamp = createToonRamp();
  const campusMat = createStylizedCampusMaterial(toonRamp);

  gltf.scene.traverse(o => {
    if (o.isMesh) {
      o.material = campusMat;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(gltf.scene);
  if (loadingEl) loadingEl.hidden = true;

  // Load Wasatch valley + sky dome (with path fixed for /campus/)
  loader.loadAsync('/campus/valley_lod.glb?v=20261116stylized1').then(({ scene: valley }) => {
    // Reuse valley-context look by adding valley + matching sky dome
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vValleyWorldPos;\nvarying vec3 vValleyWorldNormal;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvValleyWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;\nvValleyWorldNormal=normalize(mat3(modelMatrix)*objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vValleyWorldPos;\nvarying vec3 vValleyWorldNormal;`)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          float peak=smoothstep(9.0,18.5,vValleyWorldPos.y)*smoothstep(0.28,0.75,vValleyWorldNormal.y);
          float isY=step(0.55,diffuseColor.r)*step(0.55,diffuseColor.g)*step(0.55,diffuseColor.b)*step(vValleyWorldPos.y,12.0)*step(1.5,vValleyWorldPos.y);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.92,0.96,1.0),peak*0.62);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.98,0.99,1.0),isY*0.65);
          float slopeGreen=step(diffuseColor.r*1.04,diffuseColor.g)*(1.0-peak);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.94,1.08,0.92),slopeGreen*0.55);
        `)
        .replace('#include <lights_fragment_end>', `
          #include <lights_fragment_end>
          reflectedLight.indirectDiffuse*=vec3(0.86,0.93,1.06);
        `);
    };
    valley.traverse(o => {
      if (o.isMesh) {
        o.material = mat;
        o.raycast = () => {};
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    scene.add(valley);
    const skyGeo = new THREE.SphereGeometry(2200, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: sun.position.clone().normalize() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uSun; varying vec3 vDir;
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
      `,
    });
    const dome = new THREE.Mesh(skyGeo, skyMat);
    dome.raycast = () => {};
    scene.add(dome);
    scene.fog = new THREE.Fog('#dceaf2', 260, 1400);
  }).catch(() => {});

  // Ignore valley-context import warning if unused; keep reference clean
  void loadValleyContext;

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const ground = box.min.y;
  const tallest = box.max.y - ground;
  const eye = ground + THREE.MathUtils.clamp(tallest * 0.42, 3.6, 6.2);
  const low = (x, dy, z) => new THREE.Vector3(x, eye + dy, z);

  const stadiumArc = () => {
    const cx = -17.1, cz = -36.6, pts = [];
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const angle = THREE.MathUtils.degToRad(210 + k * 130);
      const radius = 16.5 - k * 3.2;
      pts.push(low(cx + Math.cos(angle) * radius, -0.4 + k * 2.4, cz + Math.sin(angle) * radius));
    }
    return pts;
  };

  const shots = [
    {
      // 0: Glide north up the quad past WSC/HBLL toward the Carillon Bell Tower
      duration: 10.5, hold: 2.0, fov: [44, 39],
      path: [[14, 2.5, 24], [9.5, 1.2, 15], [5.5, 0.5, 7], [4.4, 0.3, -1], [5.8, 0.9, -7]].map(p => low(...p)),
      look: [[7.7, -0.5, 5.8], [3.6, -0.8, 1.5], [5.5, 0.6, -7], [9.1, 2.4, -13.6]].map(p => low(...p)),
    },
    {
      // 1: Sweep around LaVell Edwards Stadium
      duration: 12.0, hold: 2.0, fov: [42, 40],
      path: stadiumArc(),
      look: [[-17.1, -1.0, -36.6], [-17.1, 0.4, -36.6], [-17.1, 2.0, -36.6]].map(p => low(...p)),
    },
    {
      // 2: Low pass past Maeser & JSB spire toward Marriott Center
      duration: 11.0, hold: 2.0, fov: [44, 40],
      path: [[-14, 2.0, 27], [-8, 1.2, 18], [-2, 0.8, 8], [1, 1.4, -2], [2.5, 2.6, -10]].map(p => low(...p)),
      look: [[-10, 0.2, 21], [-5, 0.4, 12], [0, 0.6, 0], [2.6, 2.4, -20.1]].map(p => low(...p)),
    },
    {
      // 3: Crane up from Tanner Building into wide Wasatch aerial
      duration: 13.0, hold: 3.0, fov: [46, 40],
      path: [[-7, 6.5, 1], [1, 11, 12], [14, 25, 29], [25, 41, 41], [34, 51, 49]].map(p => new THREE.Vector3(p[0], ground + p[1], p[2])),
      look: [[-8, 2.5, -2], [1, 2, -4], [1, 1, -5], [1, 1, -5]].map(p => new THREE.Vector3(p[0], ground + p[1], p[2])),
    },
  ].map(s => ({ ...s, path: new THREE.CatmullRomCurve3(s.path), look: new THREE.CatmullRomCurve3(s.look) }));

  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let mode = stillPose ? 'still' : 'hero'; // 'hero' | 'map' | 'still' | 'finale' | 'paused'
  let index = 0;
  let elapsed = 0;
  let cutting = stillPose ? -1 : 0.14;
  let swapPending = false;
  let playhead = 0;
  let last = performance.now();
  let mapTarget = new THREE.Vector3(1.5, 1.8, 1.5);
  let mapFlight = null;
  let userOrbiting = false;

  controls.addEventListener('start', () => {
    userOrbiting = true;
    mapFlight = null;
  });

  function applyPose(shot, k) {
    const p = shot.path.getPoint(k);
    camera.position.set(p.x, Math.max(p.y, ground + 2.2), p.z);
    camera.lookAt(shot.look.getPoint(k));
    const fov = shot.fov[0] + (shot.fov[1] - shot.fov[0]) * k;
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function updatePins() {
    const showPins = mode === 'map';
    pinsEl.hidden = !showPins;
    if (!showPins) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (const pin of pinEls) {
      const p = pin.vec.clone().project(camera);
      const hidden = p.z > 1 || p.z < -1 || Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.92;
      pin.el.hidden = hidden;
      if (hidden) continue;
      pin.el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      pin.el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    }
  }

  function syncShadows() {
    const t = mode === 'map' ? controls.target : new THREE.Vector3(0, 1, 0);
    const cx = Math.max(-30, Math.min(30, t.x));
    const cz = Math.max(-30, Math.min(30, t.z));
    sun.target.position.set(cx, 1, cz);
    sun.position.set(cx - 38, 68, cz + 24);
    sun.target.updateMatrixWorld();
  }

  function renderFrame() {
    const now = performance.now();
    if (mode === 'paused' || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    playhead += dt;

    if (mode === 'hero') {
      if (reduced) {
        applyPose(shots[3], 1);
      } else {
        elapsed += dt;
        const shot = shots[index];
        if (elapsed >= shot.duration + shot.hold && cutting < 0 && !swapPending) {
          cutting = 0;
          swapPending = true;
        }
        if (cutting >= 0.14 && swapPending) {
          index = (index + 1) % shots.length;
          elapsed = 0;
          swapPending = false;
          applyPose(shots[index], 0);
        } else if (!swapPending) {
          const move = Math.min(elapsed / shot.duration, 1);
          applyPose(shot, easeInOut(move));
          if (move === 1) camera.position.y += Math.sin(playhead * 0.9) * 0.06;
        }
      }
    } else if (mode === 'map') {
      if (mapFlight) {
        const t = Math.min(1, (now - mapFlight.start) / 900);
        const e = easeInOut(t);
        camera.position.lerpVectors(mapFlight.fromPos, mapFlight.toPos, e);
        controls.target.lerpVectors(mapFlight.fromTarget, mapFlight.toTarget, e);
        if (t >= 1) mapFlight = null;
      } else if (!userOrbiting && !reduced) {
        // Gentle cinematic slow drift orbit until presenter drags
        const angle = playhead * 0.11;
        const radius = 44;
        camera.position.set(
          mapTarget.x + Math.sin(angle) * radius,
          ground + 26 + Math.sin(playhead * 0.25) * 2.2,
          mapTarget.z + Math.cos(angle) * radius
        );
        controls.target.copy(mapTarget);
      }
      controls.update();
    } else if (mode === 'still') {
      if (stillPose) {
        camera.position.set(...stillPose.pos);
        camera.lookAt(new THREE.Vector3(...stillPose.target));
        if (Math.abs(camera.fov - stillPose.fov) > 0.01) {
          camera.fov = stillPose.fov;
          camera.updateProjectionMatrix();
        }
      }
    } else if (mode === 'finale') {
      // Wide majestic sweep from west campus looking east across BYU toward the Wasatch Y
      const angle = -0.35 + Math.sin(playhead * 0.14) * 0.42;
      camera.fov = 38;
      camera.updateProjectionMatrix();
      camera.position.set(-44 + Math.cos(angle) * 8, ground + 14.5 + Math.sin(playhead * 0.2) * 1.5, 16 + Math.sin(angle) * 26);
      camera.lookAt(new THREE.Vector3(12, ground + 6.5, -4));
    }

    if (cutEl) {
      if (cutting >= 0) {
        cutting += dt;
        cutEl.style.opacity = (cutting < 0.14 ? cutting / 0.14 : Math.max(0, 1 - (cutting - 0.14) / 0.34)).toFixed(3);
        if (cutting > 0.5) {
          cutting = -1;
          cutEl.style.opacity = '0';
        }
      } else {
        cutEl.style.opacity = '0';
      }
    }

    syncShadows();
    renderer.render(scene, camera);
    updatePins();
  }

  renderer.setAnimationLoop(renderFrame);

  const resize = () => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  new ResizeObserver(resize).observe(stage);

  return {
    setStill(pose) {
      stillPose = pose;
    },
    setMode(nextMode) {
      if (mode === nextMode) return;
      mode = nextMode;
      controls.enabled = nextMode === 'map';
      if (nextMode === 'hero') {
        userOrbiting = false;
        cutting = 0.14;
        elapsed = 0;
      } else if (nextMode === 'map') {
        userOrbiting = false;
        mapFlight = null;
        camera.fov = 40;
        camera.updateProjectionMatrix();
        controls.target.copy(mapTarget);
      } else if (nextMode === 'finale') {
        userOrbiting = false;
        cutting = 0.14;
      }
      updatePins();
    },
    focusBuilding(code) {
      const found = DEMO_PINS.find(p => p.code === code);
      if (!found) {
        userOrbiting = false;
        mapFlight = {
          start: performance.now(),
          fromPos: camera.position.clone(),
          toPos: new THREE.Vector3(34, ground + 34, 38),
          fromTarget: controls.target.clone(),
          toTarget: new THREE.Vector3(1.5, 1.8, 1.5),
        };
        return;
      }
      userOrbiting = true;
      const target = new THREE.Vector3(...found.pos);
      mapFlight = {
        start: performance.now(),
        fromPos: camera.position.clone(),
        toPos: target.clone().add(new THREE.Vector3(11, 14, 15)),
        fromTarget: controls.target.clone(),
        toTarget: target,
      };
    },
    nextShot() {
      index = (index + 1) % shots.length;
      elapsed = 0;
      cutting = 0.14;
      swapPending = false;
      applyPose(shots[index], 0);
    },
  };
}
