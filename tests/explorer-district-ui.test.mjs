import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRhythmAttempt, rhythmSequence} from '../public/explorer/game/district-ui.mjs';
import {campusLifeMapMarkers} from '../public/explorer/game/ui.mjs';
import {wardrobePanel} from '../public/explorer/game/field-guide.mjs';

test('district rhythm accepts a bounded visual sequence and rejects corrupt note data', () => {
  const source = [0, 2, 1, 3, 1];
  const sequence = rhythmSequence(source);
  assert.deepEqual(sequence, source);
  sequence.push(0);
  assert.equal(source.length, 5);
  for (const invalid of [[], null, [4], [-1], [0.5], ['0'], new Array(17).fill(0), {0: 0, length: 1}]) assert.equal(rhythmSequence(invalid), null);
});

test('district rhythm only completes after the exact ordered visual sequence', () => {
  const sequence = [0, 2, 1, 3, 1];
  let notes = [];
  for (const [index, note] of sequence.entries()) {
    const result = advanceRhythmAttempt(sequence, notes, note);
    assert.equal(result.correct, true);
    assert.equal(result.complete, index === sequence.length - 1);
    notes = result.notes;
  }
  assert.deepEqual(notes, sequence);
});

test('a wrong note resets the rehearsal without carrying a partial completion', () => {
  const sequence = [0, 2, 1, 3];
  assert.deepEqual(advanceRhythmAttempt(sequence, [0, 2], 0), {notes: [], correct: false, complete: false});
  assert.deepEqual(advanceRhythmAttempt(sequence, [], 0), {notes: [0], correct: true, complete: false});
  assert.deepEqual(advanceRhythmAttempt(sequence, [0, 3], 0), {notes: [0], correct: true, complete: false});
  assert.deepEqual(advanceRhythmAttempt(sequence, [0], 5), {notes: [], correct: false, complete: false});
});

test('campus-life map markers project current character positions and escape labels', () => {
  const html = campusLifeMapMarkers([
    {name: 'Maya <cookie>', role: 'Host & organizer', x: 2, z: 4, color: '#3d78b2'},
    {name: 'Unsafe color', x: 3, z: 5, color: 'red" onload="bad()'},
    {name: 'No ground position', x: NaN, z: 4},
  ], person => ({x: person.x * 10, y: person.z * 10}));
  assert.match(html, /translate\(20\.00 40\.00\)/);
  assert.match(html, /Maya &lt;cookie&gt;, Host &amp; organizer/);
  assert.match(html, /fill="#3d78b2"/);
  assert.match(html, /fill="#527d76"/);
  assert.doesNotMatch(html, /onload|No ground position|<cookie>/);
  assert.equal(campusLifeMapMarkers([{name: 'Unprojectable', x: 1, z: 1}], () => ({x: NaN, y: 2})), '');
});

test('Nora workshop cosmetic requires the finished campus-life story at every player level', () => {
  const data = {
    level: 10,
    progress: {cosmetics: {deck: 'workshop'}, campusLife: {completed: []}},
    activities: [{id: 'scooter-school', title: 'The art of stopping'}],
    decks: [{id: 'workshop', activity: 'scooter-school', name: 'Nora’s workshop', color: '#e2a269'}],
  };
  const locked = wardrobePanel(data);
  assert.match(locked, /data-cosmetic="deck:workshop" disabled/);
  assert.match(locked, /Finish The art of stopping/);
  assert.doesNotMatch(locked, /level undefined|aria-pressed="true"/);
  data.progress.campusLife.completed.push('scooter-school');
  const unlocked = wardrobePanel(data);
  assert.doesNotMatch(unlocked, /data-cosmetic="deck:workshop" disabled/);
  assert.match(unlocked, /aria-pressed="true"/);
  assert.match(unlocked, />Equipped<\/small>/);
  delete data.progress.campusLife;
  assert.match(wardrobePanel(data), /data-cosmetic="deck:workshop" disabled/);
});
