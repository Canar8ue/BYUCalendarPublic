import test from 'node:test';
import assert from 'node:assert/strict';
import {createUI} from '../public/explorer/game/ui.mjs';

// Exercise the real UI event handlers with independent pointer IDs. WebGL
// isn't needed to verify cancelled gestures and overlapping fingers.
function mount(t) {
  class Element extends EventTarget {
    style = {};
    dataset = {};
    classList = {add() {}, remove() {}, toggle() {}};
    setAttribute() {}
    setPointerCapture() {}
    getBoundingClientRect() {return {left: 0, top: 0, width: 100, height: 100};}
  }
  const nodes = new Map(), root = new Element();
  const buttons = ['jump', 'interact', 'run', 'mount', 'brake', 'flip', 'shove', 'grab', 'heel', 'manual', 'bail'].map(key => {
    const element = new Element(); element.dataset.touch = key; return element;
  });
  root.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  root.querySelectorAll = selector => selector === '[data-touch]' ? buttons : [];
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = {getElementById: id => id === 'ui' ? root : null};
  const ui = createUI();
  t.after(() => {
    ui.dispose();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  });
  const pointer = (element, type, id, x = 50, y = 50) => {
    const event = new Event(type, {cancelable: true});
    Object.assign(event, {pointerId: id, clientX: x, clientY: y});
    element.dispatchEvent(event);
  };
  return {ui, pointer, stick: nodes.get('.touch-stick'), look: nodes.get('.touch-look'), button: key => buttons.find(element => element.dataset.touch === key)};
}

test('a second finger cannot steal or release an active movement joystick', t => {
  const {ui, pointer, stick} = mount(t);
  pointer(stick, 'pointerdown', 1);
  pointer(stick, 'pointermove', 1, 82);
  assert.equal(ui.getInput().x, 1);
  pointer(stick, 'pointerdown', 2);
  pointer(stick, 'pointerup', 2);
  assert.equal(ui.getInput().x, 1);
  pointer(stick, 'pointercancel', 1);
  assert.equal(ui.getInput().x, 0);
});

test('camera look keeps its owning finger until that gesture ends', t => {
  const {ui, pointer, look} = mount(t);
  pointer(look, 'pointerdown', 1);
  pointer(look, 'pointerdown', 2);
  pointer(look, 'pointerup', 2);
  pointer(look, 'pointermove', 1, 70, 60);
  assert.equal(ui.getInput().lookX, 20);
  pointer(look, 'pointercancel', 1);
  pointer(look, 'pointermove', 1, 90, 60);
  assert.equal(ui.getInput().lookX, 0);
});

test('cancelled skate crouches do not trigger ollies; deliberate release triggers once', t => {
  const {ui, pointer, button} = mount(t);
  ui.setPaused(false, {skate: {}});
  const jump = button('jump');
  pointer(jump, 'pointerdown', 1);
  assert.equal(ui.getInput().crouch, true);
  pointer(jump, 'pointercancel', 1);
  assert.equal(ui.getInput().pop, false);
  pointer(jump, 'pointerdown', 2);
  pointer(jump, 'pointerup', 2);
  pointer(jump, 'lostpointercapture', 2);
  assert.equal(ui.getInput().pop, true);
  assert.equal(ui.getInput().pop, false);
});

test('held buttons ignore unrelated releases and reset on lost focus', t => {
  const {ui, pointer, button} = mount(t);
  const brake = button('brake');
  pointer(brake, 'pointerdown', 1);
  pointer(brake, 'pointerdown', 2);
  pointer(brake, 'pointerup', 2);
  assert.equal(ui.getInput().brake, true);
  window.dispatchEvent(new Event('blur'));
  assert.equal(ui.getInput().brake, false);
  pointer(brake, 'pointerdown', 3);
  pointer(brake, 'pointerup', 1);
  assert.equal(ui.getInput().brake, true);
  pointer(brake, 'pointerup', 3);
  assert.equal(ui.getInput().brake, false);
});
