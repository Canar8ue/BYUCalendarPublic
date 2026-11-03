const DEFAULT_NOTES = Object.freeze(['Sun', 'Wave', 'Star', 'Moon']);
const NOTE_SYMBOLS = Object.freeze(['☀', '≈', '✦', '☾']);
const colorValue = value => /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : '#315f80';

export function rhythmSequence(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every(note => Number.isInteger(note) && note >= 0 && note < 4) ? [...value] : null;
}

// The visible sequence is the instruction. Timing and audio are never required.
export function advanceRhythmAttempt(sequence, attempt, note) {
  const valid = rhythmSequence(sequence);
  if (!valid || !Number.isInteger(note) || note < 0 || note > 3) return {notes: [], correct: false, complete: false};
  const current = Array.isArray(attempt) && attempt.length < valid.length && attempt.every((value, index) => value === valid[index]) ? attempt : [];
  const correct = note === valid[current.length];
  const notes = correct ? [...current, note] : [];
  return {notes, correct, complete: notes.length === valid.length};
}

export function createDistrictUI({onAction = () => {}, idPrefix = 'district'} = {}) {
  const document = globalThis.document;
  if (!document?.body) throw new Error('Campus life interface mount missing.');
  const dialog = document.createElement('dialog');
  dialog.className = 'district-dialog';
  dialog.setAttribute('aria-labelledby', idPrefix + '-title');
  dialog.setAttribute('aria-describedby', idPrefix + '-description');
  const header = document.createElement('header');
  header.className = 'district-header';
  const heading = document.createElement('div');

  const title = node('h2', '', 'Campus life');
  title.id = idPrefix + '-title';
  title.tabIndex = -1;
  heading.append(title);
  const dismiss = button('Close campus life', 'district-close', () => close({notify: true}));
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Close campus life');
  header.append(heading, dismiss);
  const body = node('div', 'district-content');

  dialog.append(header, body);
  document.body.append(dialog);
  let panel = null, disposed = false, previousFocus = null, rhythm = null;
  const timers = new Set();

  function node(tag, className = '', text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text ?? '');
    return element;
  }
  function button(label, className, callback) {
    const element = node('button', className, label);
    element.type = 'button';
    element.addEventListener('click', callback);
    return element;
  }
  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function later(callback, delay) {
    const timer = setTimeout(() => {timers.delete(timer); if (!disposed && dialog.open) callback();}, delay);
    timers.add(timer);
  }
  function open(next, label) {
    if (disposed) return false;
    clearTimers();
    if (!dialog.open) previousFocus = document.activeElement;
    panel = next;
    rhythm = null;
    body.replaceChildren();
    title.textContent = label;
    dialog.removeAttribute('aria-describedby');

    dialog.dataset.panel = next;
    dialog.style.setProperty('--district-accent', '#315f80');
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => {if (!disposed && dialog.open && panel === next) title.focus({preventScroll: true});});
    return true;
  }
  function close({notify = false} = {}) {
    const wasOpen = dialog.open;
    clearTimers();
    panel = null;
    rhythm = null;
    if (wasOpen) dialog.close();
    const focus = previousFocus;
    previousFocus = null;
    if (focus?.isConnected && typeof focus.focus === 'function') focus.focus({preventScroll: true});
    if (wasOpen && notify && !disposed) onAction('districtClose');
  }
  function description(text) {
    const p = node('p', 'district-description', text);
    p.id = idPrefix + '-description';
    dialog.setAttribute('aria-describedby', p.id);
    return p;
  }
  function identity(character) {
    const row = node('div', 'district-identity');
    const portrait = node('div', 'district-portrait', String(character.name || '?').slice(0, 1));
    portrait.setAttribute('aria-hidden', 'true');
    portrait.style.setProperty('--person-color', colorValue(character.color));
    const detail = node('div');
    detail.append(node('b', '', character.name || 'Student'), node('p', '', character.role || 'Campus regular'));
    row.append(portrait, detail);
    return row;
  }

  function showConversation(conversation = {}) {
    if (!open('conversation', conversation.name || 'Conversation')) return;
    dialog.style.setProperty('--district-accent', colorValue(conversation.color));

    const quote = description(conversation.text || 'Good to see you.');
    quote.classList.add('district-dialogue');
    body.append(quote);
    if (conversation.objective) body.append(node('p', 'district-goal', conversation.objective));
    const choices = node('div', 'district-choices');
    for (const [index, choice] of (Array.isArray(conversation.choices) ? conversation.choices : []).entries()) {
      const action = button(choice.label || 'Continue', index === 0 ? 'district-primary' : 'district-secondary', () => {
        if (!choice.disabled) onAction('districtChoice', {npcId: conversation.npcId || conversation.id, action: choice.action, choiceId: choice.id});
      });
      action.disabled = Boolean(choice.disabled);
      if (choice.hint) {
        const hint = node('small', '', choice.hint);
        action.append(hint);
      }
      choices.append(action);
    }
    if (!conversation.choices?.some(choice => choice.action === 'decline')) choices.append(button('Close', 'district-later', () => close({notify: true})));
    body.append(choices);
  }

  function showJournal({objectives = [], characters = [], selectedActivity, title: journalTitle = 'Campus life', districts = [], selectedDistrict = 'all', statusFilter = 'all', carrying = [], hike = false} = {}) {
    if (!open('journal', journalTitle)) return;

    const summary = node('div', 'district-journal-summary');
    const complete = objectives.filter(item => ['complete', 'completed'].includes(item.status) || item.complete).length;
    summary.append(node('b', '', `${complete} / ${objectives.length} stories complete`));
    body.append(summary);
    if (districts.length) {
      const filters = node('div', 'campus-journal-filters');
      const districtLabel = node('label', '', 'Neighborhood ');
      const select = node('select');
      select.setAttribute('aria-label', 'Filter stories by neighborhood');
      for (const item of [{id: 'all', name: 'All campus'}, ...districts]) {
        const option = node('option', '', item.name);
        option.value = item.id;
        option.selected = selectedDistrict === item.id;
        select.append(option);
      }
      select.addEventListener('change', () => onAction('districtFilter', {district: select.value}));
      districtLabel.append(select);
      const statuses = node('div', 'campus-status-filters');
      statuses.setAttribute('aria-label', 'Story status');
      for (const [id, label] of [['all','All'],['active','In progress'],['available','Available'],['completed','Completed']]) {
        const control = button(label, 'district-secondary', () => onAction('districtFilter', {status: id}));
        control.setAttribute('aria-pressed', String(statusFilter === id));
        statuses.append(control);
      }
      filters.append(districtLabel, statuses);
      body.append(filters);
    }
    if (carrying.length) body.append(node('p', 'district-goal', 'Carrying: ' + carrying.join(', ')));
    const list = node('div', 'district-objectives');
    const visible = objectives.filter(item => (selectedDistrict === 'all' || item.district === selectedDistrict) && (statusFilter === 'all' || item.status === statusFilter));
    if (!visible.length) list.append(node('p', 'district-goal', 'No matching stories.'));
    for (const objective of visible) {
      const character = characters.find(person => person.id === objective.npcId) || {};
      const done = ['complete', 'completed'].includes(objective.status) || objective.complete;
      const active = objective.status === 'active' || objective.active;
      const card = node('article', `district-objective${done ? ' complete' : ''}${selectedActivity === objective.id ? ' tracked' : ''}`);
      card.style.setProperty('--person-color', colorValue(objective.color || character.color));
      const meta = node('div', 'district-objective-meta');
      meta.append(node('span', '', character.name || objective.name || 'Campus story'), node('b', '', done ? 'COMPLETE' : active ? 'IN PROGRESS' : objective.status === 'locked' ? 'FOLLOW-UP' : 'AVAILABLE'));
      card.append(meta, node('h3', '', objective.title || 'Campus story'), node('p', '', objective.text || objective.description || 'Meet the student to begin.'));
      if (objective.district || objective.duration) card.append(node('small', 'campus-story-place', [districts.find(item => item.id === objective.district)?.name, objective.duration].filter(Boolean).join(', ')));
      if (objective.reward) card.append(node('p', 'district-story-reward', `${done ? 'Earned' : 'Reward'}: ${objective.reward}`));
      const bottom = node('div', 'district-objective-bottom');
      if (Number.isFinite(objective.value) && Number.isFinite(objective.total) && objective.total > 0) {
        const progress = node('progress');
        progress.max = objective.total;
        progress.value = Math.max(0, Math.min(objective.total, objective.value));
        progress.setAttribute('aria-label', `${objective.title || 'Story'}: ${Math.round(progress.value)} of ${objective.total} steps`);
        bottom.append(progress, node('small', '', `${Math.round(progress.value)} / ${objective.total}`));
      }
      if (!done) bottom.append(button(selectedActivity === objective.id ? 'Continue story →' : 'Follow story →', 'district-track', () => onAction('districtTrack', objective.id)));

      card.append(bottom);
      list.append(card);
    }
    body.append(list);
    if (hike) body.append(button('Y Trail journal', 'district-secondary district-return', () => onAction('districtHike')));
    const shownCharacters = selectedDistrict === 'all' ? characters : characters.filter(person => objectives.some(item => item.npcId === person.id && item.district === selectedDistrict));
    if (shownCharacters.length) {
      const people = node('section', 'district-people');
      people.append(node('h3', '', 'People'));
      for (const person of shownCharacters) {
        const detail = identity(person);
        if (person.bio || person.description) detail.lastChild.append(node('small', '', person.bio || person.description));
        people.append(detail);
      }
      body.append(people);
    }
    body.append(button('Back to campus', 'district-primary district-return', () => close({notify: true})));
  }

  function showRhythm({sequence, title: rhythmTitle = 'Rehearsal', description: copy, noteLabels = DEFAULT_NOTES, completed = false} = {}) {
    if (!open('rhythm', rhythmTitle)) return;
    const valid = rhythmSequence(sequence);
    if (!valid) {
      body.append(description('This rehearsal is not ready yet. Come back and talk to Jun again.'), button('Back to campus', 'district-primary', () => close({notify: true})));
      return;
    }
    const labels = DEFAULT_NOTES.map((fallback, index) => typeof noteLabels[index] === 'string' && noteLabels[index].length ? noteLabels[index] : fallback);
    body.append(description(copy || 'Play the shapes from left to right.'));
    const cueList = node('ol', 'district-sequence');
    cueList.setAttribute('aria-label', 'Notes to play, in order');
    const cues = valid.map((note, index) => {
      const li = node('li');
      li.append(node('b', '', NOTE_SYMBOLS[note]), node('small', '', `${index + 1}. ${labels[note]}`));
      li.setAttribute('aria-label', `${index + 1}: ${labels[note]}, key ${note + 1}`);
      cueList.append(li);
      return li;
    });
    const feedback = node('p', 'district-rhythm-feedback', completed ? 'Rehearsal complete.' : '');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const pads = node('div', 'district-note-buttons');
    const noteButtons = labels.map((label, index) => {
      const pad = button('', 'district-note', () => playNote(index));
      pad.append(node('b', '', NOTE_SYMBOLS[index]), node('span', '', label), node('kbd', '', String(index + 1)));
      pad.setAttribute('aria-label', `Play ${label}, key ${index + 1}`);
      pads.append(pad);
      return pad;
    });
    const controls = node('div', 'district-rhythm-controls');
    const demonstration = button('Show the tune', 'district-secondary', demonstrate);
    const restart = button('Start again', 'district-secondary', () => {
      if (!rhythm || rhythm.demonstrating || rhythm.complete) return;
      rhythm.notes = [];
      refreshRhythm();
      feedback.textContent = 'Start with the first shape.';
    });
    controls.append(demonstration, restart);
    rhythm = {sequence: valid, notes: completed ? [...valid] : [], complete: Boolean(completed), demonstrating: false, cues, noteButtons, feedback, labels, demonstration, restart};
    body.append(cueList, pads, feedback, controls, button('Return to Jun', 'district-primary district-return', () => close({notify: true})));
    refreshRhythm();
  }

  function refreshRhythm() {
    if (!rhythm) return;
    rhythm.cues.forEach((cue, index) => {
      cue.classList.toggle('played', index < rhythm.notes.length);
      cue.classList.toggle('next', !rhythm.complete && index === rhythm.notes.length);
      cue.classList.remove('demonstrating');
    });
    for (const pad of rhythm.noteButtons) pad.disabled = rhythm.complete || rhythm.demonstrating;
    rhythm.demonstration.disabled = rhythm.demonstrating;
    rhythm.restart.disabled = rhythm.complete || rhythm.demonstrating;
  }
  function playNote(note) {
    if (!rhythm || rhythm.complete || rhythm.demonstrating || !Number.isInteger(note) || note < 0 || note > 3) return;
    const result = advanceRhythmAttempt(rhythm.sequence, rhythm.notes, note);
    rhythm.notes = result.notes;
    rhythm.complete = result.complete;
    onAction('districtNote', note);
    refreshRhythm();
    if (result.complete) {
      rhythm.feedback.textContent = 'Rehearsal complete.';
      rhythm.feedback.classList.add('success');
      onAction('districtRhythmComplete', {notes: [...result.notes]});
    } else if (!result.correct) rhythm.feedback.textContent = `Start again with ${rhythm.labels[rhythm.sequence[0]]}.`;
    else rhythm.feedback.textContent = `${result.notes.length} of ${rhythm.sequence.length} shapes played. Next: ${rhythm.labels[rhythm.sequence[result.notes.length]]}.`;
  }
  function demonstrate() {
    if (!rhythm || rhythm.demonstrating) return;
    const current = rhythm;
    current.demonstrating = true;
    current.feedback.textContent = 'Watch the highlighted shapes.';
    refreshRhythm();
    current.sequence.forEach((note, index) => later(() => {
      if (rhythm !== current) return;
      current.cues.forEach((cue, cueIndex) => cue.classList.toggle('demonstrating', cueIndex === index));
      current.feedback.textContent = `${index + 1}: ${current.labels[note]} (key ${note + 1})`;
      onAction('districtNote', note);
    }, index * 650));
    later(() => {
      if (rhythm !== current) return;
      current.demonstrating = false;
      refreshRhythm();
      current.feedback.textContent = current.complete ? 'Rehearsal complete.' : 'Start with the first shape.';
    }, current.sequence.length * 650);
  }

  function keydown(event) {
    if (!dialog.open) return;
    event.stopPropagation();
    if (event.key === 'Escape') {event.preventDefault(); close({notify: true}); return;}
    if (panel === 'rhythm' && !event.repeat && /^[1-4]$/.test(event.key)) {event.preventDefault(); playNote(Number(event.key) - 1); return;}
    if (event.key !== 'Tab') return;
    const focusables = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
    const first = focusables[0], last = focusables.at(-1);
    if (!first) {event.preventDefault(); title.focus(); return;}
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {event.preventDefault(); last.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
  }
  function cancel(event) {event.preventDefault(); close({notify: true});}
  dialog.addEventListener('keydown', keydown);
  dialog.addEventListener('cancel', cancel);
  function dispose() {
    if (disposed) return;
    close();
    disposed = true;
    dialog.removeEventListener('keydown', keydown);
    dialog.removeEventListener('cancel', cancel);
    dialog.remove();
  }
  return {showConversation, showJournal, showRhythm, close, dispose, get isOpen() {return dialog.open;}, get panel() {return panel;}};
}
