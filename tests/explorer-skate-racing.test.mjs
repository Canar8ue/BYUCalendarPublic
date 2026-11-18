import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

const vendor = new URL('../public/campus/vendor/', import.meta.url).href;
registerHooks({resolve(specifier, context, next) {
  if (specifier.startsWith('/campus/vendor/')) return {url:vendor + specifier.slice('/campus/vendor/'.length), shortCircuit:true};
  return next(specifier, context);
}});
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function controller() {
  const url = new URL('../public/explorer/game/game.mjs', import.meta.url);
  // Replace browser presentation only. Use the live race, action, movement,
  // save and physics functions, with the same fixed-step ordering as the game.
  const source = (await readFile(url, 'utf8'))
    .replace(/from '(\.\/[^']+)'/g, (_, path) => {
      if (path.startsWith('./ui.mjs')) return 'from ' + JSON.stringify(dataModule('export const createUI=()=>new Proxy({},{get:()=>()=>{}});'));
      if (path.startsWith('./audio.mjs')) return 'from ' + JSON.stringify(dataModule('export const createAudio=()=>new Proxy({},{get:()=>()=>{}});'));
      return 'from ' + JSON.stringify(new URL(path, url).href);
    })
    .replace(/\ninit\(\);\s*$/, `
export function testController() {
  progress=createProgress();ready=true;paused=false;elapsed=0;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(65,1,.001,100);
  player=createPlayer(scene);
  const corners=[[-60,0,-80],[-60,0,50],[55,0,50],[55,0,-80]];
  world=testCollision([
    {kind:'ground',surface:3,a:corners[0],b:corners[1],c:corners[2]},
    {kind:'ground',surface:3,a:corners[0],b:corners[2],c:corners[3]}
  ]);
  skate=createSkateRuntime({scene,world,player,getProgress:()=>progress,toast,persist,audio});
  return {
    start(id){startTrial(TRIALS.find(t=>t.id===id));},
    action,
    frame(input={},dt=1/60){
      if(paused)return;
      elapsed+=dt;keys.clear();
      for(const code of input.keys||[])keys.add(code);
      if(input.bail)skateEdges.bail=true;
      if(!trial||elapsed>=trial.start){
        step(dt,{});
        updateRace();
      }
    },
    get state(){return {trial,skate,progress,riding,paused,elapsed,raceResult};},
    passGate(){
      const gate=trial.definition.points[trial.index];
      player.group.position.set(gate.x,0,gate.z);
      Object.assign(skate.state.position,{x:gate.x/UNIT,y:0,z:gate.z/UNIT});
      updateRace();
    },
    dispose(){skate.dispose();player.dispose();}
  };
}
`);
  assert.ok(source.includes('export function testController'));
  const collision = new URL('../public/explorer/game/world.mjs', import.meta.url).href;
  const gameModule = await import(dataModule('import {createCollisionIndex as testCollision} from ' + JSON.stringify(collision) + ';\n' + source));
  return gameModule.testController();
}

test('all races mount the selected skateboard, freeze countdown and prevent board changes mid-run', async () => {
  const previous = {matchMedia:globalThis.matchMedia, document:globalThis.document, window:globalThis.window, parent:globalThis.parent};
  globalThis.matchMedia = () => ({matches:false});
  globalThis.window = globalThis.parent = {};
  globalThis.document = {getElementById:()=>({focus(){}}),createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const game = await controller();
  try {
    for (const id of ['central-loop','arts-run','northbound']) {
      game.start(id);
      const start = {...game.state.skate.state.position};
      assert.equal(game.state.skate.active, true);
      assert.equal(game.state.riding, true);
      for (let i = 0; i < 120; i++) game.frame({keys:['ShiftLeft']});
      assert.deepEqual(game.state.skate.state.position, start);
      await game.action('cosmetic','deck:cherry');
      assert.equal(game.state.progress.cosmetics.deck, 'classic');
      for (let i = 0; i < 240; i++) game.frame({keys:['ShiftLeft']});
      assert.ok(Math.hypot(game.state.skate.state.velocity.x,game.state.skate.state.velocity.z)>5);
      assert.equal(game.state.skate.state.sprinting, true);
    }
    await game.action('cancelTrial');
    await game.action('cosmetic','deck:cherry');
    assert.equal(game.state.skate.state.board, 'cherry');
    assert.equal(game.state.skate.board.group.userData.board, 'cherry');
    game.start('central-loop');
    assert.equal(game.state.skate.state.board, 'cherry');
  } finally {
    game.dispose();
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('race recovery cannot collect checkpoints and completing a run records a skateboard ghost', async () => {
  const previous = {matchMedia:globalThis.matchMedia, document:globalThis.document, window:globalThis.window, parent:globalThis.parent};
  globalThis.matchMedia = () => ({matches:false});
  globalThis.window = globalThis.parent = {};
  globalThis.document = {getElementById:()=>({focus(){}}),createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const game = await controller();
  try {
    game.start('central-loop');
    for (let i = 0; i < 200; i++) game.frame({keys:['ShiftLeft']});
    game.frame({bail:true});
    assert.ok(game.state.skate.state.bail);
    const gate = game.state.trial.index;
    game.passGate();assert.equal(game.state.trial.index,gate);
    await game.action('pause');
    const clock=game.state.elapsed;
    for (let i = 0; i < 120; i++) game.frame();
    assert.equal(game.state.elapsed,clock);
    await game.action('resume');
    game.start('central-loop');
    for (let i = 0; i < 220; i++) game.frame({keys:['ShiftLeft']});
    while (game.state.trial) game.passGate();
    assert.equal(game.state.raceResult.id,'central-loop');
    assert.ok(game.state.progress.bestRuns['central-loop'].length >= 2);
    assert.equal(game.state.skate.active,true);
  } finally {
    game.dispose();
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
