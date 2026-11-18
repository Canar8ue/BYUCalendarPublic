import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../public/campus/vendor/three.module.js';
import {SKATE_BOARDS, resolveSkateBoard} from '../public/explorer/game/skate-boards.mjs';
import {DECKS} from '../public/explorer/game/content.mjs';
import {createProgress, equipCosmetic, validateProgress} from '../public/explorer/game/progress.mjs';
import {wardrobePanel} from '../public/explorer/game/field-guide.mjs';

test('starter boards offer distinct balanced profiles and retain legacy deck saves and locks', () => {
  assert.deepEqual(DECKS, SKATE_BOARDS);
  assert.equal(new Set(SKATE_BOARDS.map(board => board.id)).size, SKATE_BOARDS.length);
  assert.equal(resolveSkateBoard('removed-board').id, 'classic');
  const state = createProgress();
  const starter = SKATE_BOARDS.filter(board => board.level === 1);
  assert.ok(starter.length >= 7);
  for (const board of starter) {
    assert.ok(equipCosmetic(state, 'deck', board.id));
    assert.equal(validateProgress(state).cosmetics.deck, board.id);
    assert.ok(board.acceleration <= 1.2 && board.topSpeed <= 1.18 && board.pop <= 1.15);
  }
  assert.ok(starter.some(board => board.pop > 1.1));
  assert.ok(starter.some(board => board.topSpeed > 1.1));
  assert.ok(starter.some(board => board.acceleration > 1.1));
  assert.equal(equipCosmetic(state, 'deck', 'sea'), false);
  assert.equal(equipCosmetic(state, 'deck', 'comet'), false);
  for (const id of ['classic', 'sea', 'gold', 'cosmo', 'comet', 'workshop']) assert.equal(resolveSkateBoard(id).id, id);
});

test('the wardrobe presents each board grip, underside and numerical performance before equip', () => {
  const html = wardrobePanel({progress:createProgress(), level:1, decks:DECKS});
  assert.equal((html.match(/class="board-preview-side"/g) || []).length, SKATE_BOARDS.length * 2);
  assert.equal((html.match(/Acceleration/g) || []).length, SKATE_BOARDS.length);
  assert.equal((html.match(/Ollie lift/g) || []).length, SKATE_BOARDS.length);
  assert.match(html, /Skateboards/);
  assert.match(html, /Cherry checker grip/);
  assert.match(html, /Cherry checker underside/);
  assert.match(html, /118%/);
  assert.doesNotMatch(html, /scooter|NaN|undefined/);
});

test('selecting a board changes both actual graphics and wheel color while preserving crash resources', async () => {
  const url = new URL('../public/explorer/game/skate-art.mjs', import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace("'/campus/vendor/three.module.js'", JSON.stringify(new URL('../public/campus/vendor/three.module.js', import.meta.url).href))
    .replace(/from '(\.\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, url).href));
  const {createSkateboard} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const scene = new THREE.Scene(), board = createSkateboard(scene);
  const top = board.group.getObjectByName('Skateboard grip graphic'), bottom = board.group.getObjectByName('Skateboard underside graphic');
  const textures = [top.material.map, bottom.material.map], topHashes = new Set(), bottomHashes = new Set();
  const resources = new Set(), disposals = new Map();
  board.group.traverse(item => {
    if (item.geometry) resources.add(item.geometry);
    if (item.material) {resources.add(item.material);if(item.material.map)resources.add(item.material.map);}
  });
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) || 0) + 1));
  try {
    for (const design of SKATE_BOARDS) {
      board.setStyle(design.id);
      assert.equal(board.group.userData.board, design.id);
      assert.equal(top.material.map, textures[0]);assert.equal(bottom.material.map, textures[1]);
      topHashes.add(createHash('sha256').update(textures[0].image.data).digest('hex'));
      bottomHashes.add(createHash('sha256').update(textures[1].image.data).digest('hex'));
      board.update(0, {grounded:true, heading:0, velocity:{x:0,z:4}});
      const handoff = board.rigidPose();
      board.updateRigid(handoff);
      assert.equal(board.group.userData.board, design.id);
    }
    assert.equal(topHashes.size, SKATE_BOARDS.length);
    assert.equal(bottomHashes.size, SKATE_BOARDS.length);
    board.setStyle('missing');
    assert.equal(board.group.userData.board, 'classic');
    assert.equal(disposals.size, 0, 'switching graphics reuses the textures and meshes');
  } finally {board.dispose();}
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
  assert.equal(scene.children.length, 0);
});
