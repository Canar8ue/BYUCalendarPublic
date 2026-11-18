import {SKATE_CHALLENGES, validateSkateStats} from './skateboard.mjs?v=20261105rider6';

export function skatePanel(data = {}) {
  const stats = validateSkateStats(data.progress?.skate);
  return `<div class="skate-session"><div class="skate-destinations">
    <button class="primary" data-action="skateYard"><b>Skate yard</b><span>Ramps, bowl, funbox and three grind rails</span></button>
    <button class="secondary" data-action="skateDownhill"><b>Summit descent</b><span>A 300 m downhill with a 65 m drop and a long runout</span></button>
    <button class="secondary" data-action="skateCampus"><b>Campus cruise</b><span>Skate the campus paths</span></button></div>
    <p class="settings-note">The skate yard and Summit descent are fictional game courses.</p>
    <div class="skate-records"><span>BEST LINE<b>${Math.round(stats.bestLine).toLocaleString()}</b></span><span>TOP SPEED<b>${Math.round(stats.topSpeed * 3.6)} km/h</b></span><span>TOTAL POINTS<b>${Math.round(stats.total).toLocaleString()}</b></span></div>
    <h3 class="section-title">Challenges</h3><div class="skate-challenges">${SKATE_CHALLENGES.map(c => `<article class="${stats[c.metric] >= c.target ? 'complete' : ''}"><b>${stats[c.metric] >= c.target ? '✓ ' : ''}${c.title}</b><span>${c.text}</span></article>`).join('')}</div>
    <h3 class="section-title">Skate controls</h3><div class="control-grid">${[
      ['Push / carve / brake', 'W / A D / S or F'], ['Sprint push', 'Hold Shift'],
      ['Crouch, then ollie', 'Hold Space, release'],
      ['Kickflip / heelflip / shove-it', 'Z / B / X in the air'], ['Spin / grab', 'A D / hold V in the air'],
      ['Powerslide / manual', 'Hold C / hold N'], ['Bail / retry marker', 'G / R'],
      ['Set marker at low speed', 'T'], ['Get on skateboard', '1'],
      ['Get on or off board', 'Q'], ['Skate sessions', 'K'],
    ].map(([label, key]) => `<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div>
    <p class="settings-note">Land facing along your travel with the grip side up. Link tricks, manuals and grinds; ride cleanly for two seconds to bank a line. A bail loses the current line. Land on a rail to grind; ollie to leave it.</p>
    <div class="button-row"><button class="secondary" data-action="skateMarker">Set session marker</button><button class="secondary" data-action="wardrobe">Choose skateboard</button><button class="secondary" data-action="races">Skateboard races</button></div></div>`;
}
