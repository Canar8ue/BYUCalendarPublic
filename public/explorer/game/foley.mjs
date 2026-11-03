const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PAVING = {step: 720, tail: .085, wheel: 4600, recordedStep: true};
const ASPHALT = {step: 540, tail: .105, wheel: 3200, recordedStep: true};
const EARTH = {step: 320, tail: .115, wheel: 1650};
const GRASS = {step: 490, tail: .155, wheel: 1300};
const TRAIL = {step: 1250, tail: .155, wheel: 2200};

function profile(surface) {
  switch (surface) {
    case 1: return EARTH;
    case 2:
    case 4: return ASPHALT;
    case 5:
    case 6: return GRASS;
    case 'trail': return TRAIL;
    default: return PAVING;
  }
}

/** Distance is measured by the controller after collision, in meters. */
export function createFoley({context, noise, effects, ambience, register, stepSample, roll}) {
  let stride = 0, still = 0, alternate = false;
  let rolling = false, rollTimer = 0, surfaceTimer = 0, wheelProfile = PAVING;
  let chatterCooldown = 0;

  function burst({frequency, tail, level, delay = 0, tone = 0, pan = 0, bus = effects, sharp = false}) {
    const at = context.currentTime + .008 + delay;
    const source = tone ? context.createOscillator() : context.createBufferSource();
    if (tone) {
      source.type = 'triangle';
      source.frequency.setValueAtTime(tone, at);
      source.frequency.exponentialRampToValueAtTime(tone * .77, at + tail);
    } else source.buffer = noise;
    const filter = context.createBiquadFilter(), envelope = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = sharp ? 2.2 : .65;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + (tone ? .023 : .009));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + tail);
    source.connect(filter);
    filter.connect(envelope);
    if (pan && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      envelope.connect(panner);
      panner.connect(bus);
      register(source, [filter, envelope, panner]);
    } else {
      envelope.connect(bus);
      register(source, [filter, envelope]);
    }
    source.start(at);
    source.stop(at + tail + .012);
  }

  function play(kind, surface, strength) {
    const material = profile(surface), amount = clamp(strength, .15, 1);
    if (kind === 'brake') {
      burst({frequency: material.wheel * .55, tail: .16 + amount * .10, level: .09 + amount * .20, sharp: true});
    } else if (kind === 'crash' || kind === 'trip') {
      const crash = kind === 'crash';
      burst({frequency: crash ? 280 : 340, tail: .19, level: .25 + amount * .29});
      if (crash) burst({frequency: 1810, tail: .26, level: .15 + amount * .16, delay: .03, sharp: true});
      burst({frequency: material.step, tail: .15, level: .12 + amount * .13, delay: .09});
    } else if (kind === 'land') {
      stride = 0;
      burst({frequency: material.step * .7, tail: material.tail + .07, level: .12 + amount * .20});
    }
  }

  function update(dt, {enabled = true, grounded = false, riding = false, speed = 0, braking = false, distance = 0,
    surface = () => null, x = 0, z = 0, yaw = 0, unit = 1, characters = [], effectsOn = true, ambienceOn = true} = {}) {
    if (!enabled) {reset(); return;}
    const canRoll = effectsOn && riding && grounded && speed > .3;
    if (canRoll) {
      surfaceTimer -= dt;
      if (surfaceTimer <= 0) {wheelProfile = profile(surface()); surfaceTimer = .22;}
      rollTimer -= dt;
      if (!rolling || rollTimer <= 0) {roll(speed, wheelProfile.wheel, braking); rollTimer = .075;}
    } else if (rolling) {
      roll(0);
      surfaceTimer = rollTimer = 0;
    }
    rolling = canRoll;

    if (!effectsOn || !grounded || riding) {stride = still = 0;}
    else if (distance > 0) {
      still = 0;
      stride += distance;
      const spacing = .42 + clamp(speed * .16, 0, .9);
      if (stride >= spacing) {
        stride %= spacing;
        const material = profile(surface()), offset = alternate ? -.07 : .07;
        alternate = !alternate;
        const level = .085 + clamp(speed, 0, 5.2) * .02;
        burst({frequency: material.step * (1 + offset), tail: material.tail, level});
        if (material.recordedStep) stepSample(level, 1 + offset);
        if (material === TRAIL) burst({frequency: 2250, tail: .11, level: level * .54, delay: .035});
      }
    } else {
      still += dt;
      if (still > .25) stride = 0;
    }

    // Soft, wordless chatter follows existing talk gestures. Character
    // animation and dialogue still carry all information with sound muted.
    chatterCooldown = Math.max(0, chatterCooldown - dt);
    if (!ambienceOn || chatterCooldown > 0) return;
    let heard = null, range = 7;
    for (const character of characters) {
      if (character.gesture !== 'talk') continue;
      const dx = character.x / unit - x, dz = character.z / unit - z;
      const distanceToSpeaker = Math.hypot(dx, dz);
      if (!(distanceToSpeaker < range)) continue;
      range = distanceToSpeaker;
      heard = {pan: clamp((dz * Math.sin(yaw) - dx * Math.cos(yaw)) / 4, -.85, .85)};
    }
    if (!heard) return;
    const level = .09 * (1 - range / 7) ** 2, pan = heard.pan;
    burst({frequency: 480, tail: .13, level: .002 + level, tone: 155, pan, bus: ambience});
    burst({frequency: 610, tail: .19, level: .002 + level * .79, tone: 172, delay: .12, pan, bus: ambience});
    burst({frequency: 420, tail: .15, level: .002 + level * .65, tone: 132, delay: .29, pan, bus: ambience});
    chatterCooldown = 2.7;
  }

  function reset() {
    if (rolling) roll(0);
    rolling = false;
    stride = still = rollTimer = surfaceTimer = chatterCooldown = 0;
  }

  return {update, play, reset};
}
