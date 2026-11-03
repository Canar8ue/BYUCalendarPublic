import {createRecordedAudio} from './recorded-audio.mjs?v=20261102polish6';
import {createFoley} from './foley.mjs?v=20261102polish6';
// The original score remains a graceful fallback when optional media is missing.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const pitch = midi => 440 * 2 ** ((midi - 69) / 12);
const CHORDS = [
  [50, 54, 57, 61, 64], // D major 9
  [47, 50, 54, 57, 61], // B minor 9
  [43, 47, 50, 54, 57], // G major 9
  [45, 49, 52, 54, 59], // A 6/9
];
const MELODY = [null, 2, null, 4, 3, null, 1, null, null, 2, null, 3, null, 4, 2, null];
const MOODS = {
  day: {bpm: 84, chordGain: .025, melodyGain: .050, cutoff: 2900, percussion: .7},
  sunset: {bpm: 78, chordGain: .030, melodyGain: .045, cutoff: 2300, percussion: .5},
  night: {bpm: 70, chordGain: .022, melodyGain: .035, cutoff: 1750, percussion: .2},
};

export function createAudio({onCaption=()=>{}}={}) {
  let context, master, music, compressor, room, roomMix, feedback, filter, noise, syntheticEffects, syntheticAmbience, limiter, foley;
  let enabled = true, volume = .3, mood = 'sunset', paused = false, disposed = false;
  let timer = 0, suspendTimer = 0, next = 0, step = 0, started = false;
  const voices = new Set();
  let recorded=null, mixSettings={};
  const active = () => Boolean(context && enabled && !paused && !disposed);
  const smoothing = (param, value, time = .12) => {
    if (!context) return; const now = context.currentTime;
    param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time);
  };
  function register(source, connections) {
    const entry = {source, release() {
      if (!voices.delete(entry)) return;
      source.onended = null;
      source.disconnect();
      for (const node of connections) node.disconnect();
    }};
    voices.add(entry);
    source.onended = entry.release;
    return source;
  }
  function stopVoices(after = 0) {
    if (!context) return;
    for (const {source} of voices) {try {source.stop(context.currentTime + after);} catch {/* already stopped */}}
  }
  function note(midi, at, duration, gain, type = 'sine', destination = music, cutoff = 2800) {
    if (!context || !destination || disposed) return;
    const oscillator = context.createOscillator(), envelope = context.createGain(), tone = context.createBiquadFilter();
    oscillator.type = type; oscillator.frequency.value = pitch(midi);
    tone.type = 'lowpass'; tone.frequency.value = cutoff; tone.Q.value = .3;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + .025);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, gain * .42), at + Math.max(.06, duration * .26));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(tone); tone.connect(envelope); envelope.connect(destination);
    register(oscillator, [envelope, tone]); oscillator.start(at); oscillator.stop(at + duration + .025);
  }
  function kick(at, level) {
    const oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.frequency.setValueAtTime(112, at); oscillator.frequency.exponentialRampToValueAtTime(45, at + .10);
    envelope.gain.setValueAtTime(.0001, at); envelope.gain.exponentialRampToValueAtTime(level, at + .007); envelope.gain.exponentialRampToValueAtTime(.0001, at + .22);
    oscillator.connect(envelope); envelope.connect(music); register(oscillator, [envelope]); oscillator.start(at); oscillator.stop(at + .24);
  }
  function hat(at, level, snare = false) {
    const source = context.createBufferSource(), band = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noise; band.type = snare ? 'bandpass' : 'highpass'; band.frequency.value = snare ? 1800 : 6200; band.Q.value = snare ? .6 : .25;
    envelope.gain.setValueAtTime(level, at); envelope.gain.exponentialRampToValueAtTime(.0001, at + (snare ? .12 : .048));
    source.connect(band); band.connect(envelope); envelope.connect(music); register(source, [band, envelope]); source.start(at); source.stop(at + .15);
  }
  function schedule() {
    if (!active() || context.state !== 'running') return;
    const horizon = context.currentTime + .16;
    // Resume or a long main-thread stall starts at the present; never emit a
    // large backlog of missed notes as a loud burst.
    if (next < context.currentTime - .15) next = context.currentTime + .035;
    let count = 0;
    while (next < horizon && count++ < 5) {
      const setting = MOODS[mood], bar = Math.floor(step / 8), local = step % 8, chord = CHORDS[bar % CHORDS.length];
      const eighth = 60 / setting.bpm / 2, at = next;
      if (local === 0) {
        for (let i = 0; i < 4; i++) note(chord[i] + 12, at + i * .022, eighth * 7.2, setting.chordGain, 'sine', music, setting.cutoff);
        note(chord[0] - 12, at, eighth * 3.3, .085, 'sine', music, 600);
      }
      if (local === 4) note(chord[0] - 12, at, eighth * 2.8, .060, 'sine', music, 550);
      const melody = MELODY[step % MELODY.length];
      if (melody !== null) {
        note(chord[melody] + 12, at, eighth * 1.7, setting.melodyGain, 'triangle', music, setting.cutoff);
        // A quiet octave gives the keys a soft electric-piano shimmer.
        note(chord[melody] + 24, at + .006, eighth * .9, setting.melodyGain * .12, 'sine', music, setting.cutoff);
      }
      if (local === 0 || local === 4) kick(at, .095 * setting.percussion);
      if (local === 2 || local === 6) hat(at, .022 * setting.percussion, true);
      if (local % 2 === 1) hat(at + (local % 4 === 3 ? .012 : 0), .016 * setting.percussion);
      step = (step + 1) % 256; next += eighth;
    }
  }
  function beginScheduler() {
    if (timer || !active() || recorded?.hasMusic) return; next = context.currentTime + .045;
    timer = globalThis.setInterval(schedule, 75); schedule();
  }
  function stopScheduler() {if (timer) globalThis.clearInterval(timer); timer = 0;}
  async function activate() {
    if (!active()) return;
    if (suspendTimer) {globalThis.clearTimeout(suspendTimer); suspendTimer = 0;}
    try {
      await context.resume(); if (!active()) return;
      smoothing(master.gain, volume * .85, .05); beginScheduler();void recorded?.resume();
    } catch {/* A later explicit player gesture can retry; gameplay continues. */}
  }
  function quiet() {
    stopScheduler();foley?.reset();recorded?.pause(); if (!context) return;
    smoothing(master.gain, 0, .025); stopVoices(.15);
    if (suspendTimer) globalThis.clearTimeout(suspendTimer);
    suspendTimer = globalThis.setTimeout(() => {suspendTimer = 0; if (!active() && context && context.state === 'running') context.suspend().catch(() => {});}, 180);
  }
  async function start() {
    if (disposed || !enabled) return;
    if (!context) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      try {
        context = new Audio({latencyHint: 'interactive'});
        master = context.createGain(); master.gain.value = 0;
        music = context.createGain(); music.gain.value = (mixSettings.musicVolume??.55)*.85;
        syntheticEffects=context.createGain();syntheticEffects.gain.value=mixSettings.effectsVolume??.7;syntheticEffects.connect(master);
        syntheticAmbience=context.createGain();syntheticAmbience.gain.value=mixSettings.ambienceVolume??.5;syntheticAmbience.connect(master);
        compressor = context.createDynamicsCompressor(); compressor.threshold.value = -16; compressor.knee.value = 22; compressor.ratio.value = 3; compressor.attack.value = .015; compressor.release.value = .3;
        filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 5400; filter.Q.value = .2;
        limiter=context.createDynamicsCompressor();limiter.threshold.value=-4;limiter.knee.value=3;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.12;
        music.connect(filter); filter.connect(compressor); compressor.connect(master);master.connect(limiter);limiter.connect(context.destination);
        // Tiny feedback delay supplies a warm room without loading an impulse
        // response. All feedback remains bounded below unity.
        room = context.createDelay(.8); room.delayTime.value = .29;
        feedback = context.createGain(); feedback.gain.value = .16;
        roomMix = context.createGain(); roomMix.gain.value = .14;
        filter.connect(room); room.connect(feedback); feedback.connect(room); room.connect(roomMix); roomMix.connect(compressor);
        noise = context.createBuffer(1, Math.floor(context.sampleRate * .32), context.sampleRate);
        const data = noise.getChannelData(0); let seed = 404;
        for (let i = 0; i < data.length; i++) {seed = (1664525 * seed + 1013904223) >>> 0; data[i] = ((seed / 4294967296) * 2 - 1) * .7;}
        if(typeof globalThis.Audio==='function'&&context.createMediaElementSource){recorded=createRecordedAudio(context,master,{onCaption,onMusicReady:()=>{stopScheduler();smoothing(music.gain,0,.5);}});recorded.setMix(mixSettings);recorded.setMood(mood);}
        foley = createFoley({context, noise, effects: syntheticEffects, ambience: syntheticAmbience, register,
          stepSample: (level, rate) => void recorded?.effect('step', level, rate), roll: (...args) => recorded?.roll(...args)});
        started = true;
      } catch {if (context) context.close().catch(() => {}); context = undefined; return;}
    }
    if (active()) await activate(); else quiet();
  }
  function setEnabled(value) {enabled = Boolean(value); if (enabled && started && !paused) void activate(); else quiet();}
  function setVolume(value) {volume = Number.isFinite(Number(value)) ? clamp(Number(value), 0, 1) : .3; if (active()) smoothing(master.gain, volume * .85, .04);}
  function setMood(value) {if (Object.hasOwn(MOODS, value)) {mood = value;recorded?.setMood(value);}}
  function pause() {paused = true; quiet();}
  function resume() {if (disposed) return; paused = false; if (started && enabled) void activate();}
  function chime(type = 'discovery') {
    if (!active() || context.state !== 'running') return;
    if(recorded?.hasMusic){void recorded.effect(({discover:'discovery',secret:'discovery',finish:'quest',cosmo:'quest',pet:'cat',click:'checkpoint'})[type]||type);return;}
    const at = context.currentTime + .012;
    const patterns = {discovery: [74, 78, 81], quest: [69, 74, 78, 81, 86], secret: [81, 86, 90], cat: [78, 81, 78], cosmo: [74, 81, 86], checkpoint: [74, 78], finish: [69, 74, 78, 81, 86], click: [81], pet: [78, 81, 85, 81]};
    const pattern = patterns[type] || patterns.discovery;
    for (let i = 0; i < pattern.length; i++) note(pattern[i], at + i * .09, .45, type === 'click' ? .035 : .065, 'sine', syntheticEffects, 3200);
  }
  function playNote(index = 0) {
    if (!active() || context.state !== 'running') return;
    const notes = [74, 78, 81], n = Math.floor(Number(index));
    if (!Number.isFinite(n) || n < 0 || n >= notes.length) return;
    const at = context.currentTime + .012;
    note(notes[n], at, .75, .09, 'sine', syntheticEffects, 3200);
    note(notes[n] + 12, at + .006, .42, .009, 'sine', syntheticEffects, 3800);
  }
  function dispose() {
    if (disposed) return; disposed = true; stopScheduler();
    if (suspendTimer) globalThis.clearTimeout(suspendTimer); suspendTimer = 0;
    foley?.reset();stopVoices();for(const {release} of voices)release();recorded?.dispose();
    for (const node of [music, filter, room, feedback, roomMix, compressor, master, syntheticEffects, syntheticAmbience, limiter]) node?.disconnect();
    if (context && context.state !== 'closed') context.close().catch(() => {});
    foley = noise = null;
  }
  function setMix(settings) {
    mixSettings = {...mixSettings, ...settings};
    recorded?.setMix(mixSettings);
    if (music && Number.isFinite(settings.musicVolume) && !recorded?.hasMusic) smoothing(music.gain, settings.musicVolume * .85);
    if (syntheticEffects && Number.isFinite(settings.effectsVolume)) smoothing(syntheticEffects.gain, settings.effectsVolume);
    if (syntheticAmbience && Number.isFinite(settings.ambienceVolume)) smoothing(syntheticAmbience.gain, settings.ambienceVolume);
  }
  return {start, setEnabled, setVolume, setMood, setMix, pause, resume, chime, playNote, dispose,
    update(dt, state) {
      if (active() && context.state === 'running') foley.update(dt, {...state, effectsOn: mixSettings.effectsVolume !== 0, ambienceOn: mixSettings.ambienceVolume !== 0});
    },
    foley(kind, surface, strength) {
      if (active() && context.state === 'running' && mixSettings.effectsVolume !== 0) foley.play(kind, surface, strength);
    },
    speak(id, options) {return recorded?.speak(id, options);}, stopVoice() {recorded?.stopVoice();},
  };
}
