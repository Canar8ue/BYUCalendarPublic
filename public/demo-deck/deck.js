if (location.search.includes('__demo=1')) {
  document.body.innerHTML = '<div style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f8f9fa;color:#202124;text-align:center;padding:24px"><div><h2 style="margin:0 0 8px">Restart <code>node scripts/present.mjs</code></h2><p style="margin:0 0 16px;color:#5f6368">An older server instance is still running without the live demo proxy.</p><a href="https://byucalendar.com" target="_blank" rel="noreferrer" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1a73e8;color:#fff;font-weight:700;text-decoration:none">Open byucalendar.com ↗</a></div></div>';
  throw new Error('Stale presentation server without demo proxy');
}

import { initCampusFlyover } from './campus-flyover.js';

const slides = [...document.querySelectorAll('.slide')];
const progressFill = document.getElementById('progress-fill');
const slideCounter = document.getElementById('slide-counter');
const campusStage = document.getElementById('campus-stage');
const notesDrawer = document.getElementById('notes-drawer');
const notesRubric = document.getElementById('notes-rubric');
const notesTitle = document.getElementById('notes-title');
const notesScript = document.getElementById('notes-script');
const sourceBarsEl = document.getElementById('source-bars');

const SPEAKER_NOTES = [
  {
    rubric: 'ENGAGING OPENING',
    title: '01 · Hook & Live 3D Campus Flyover',
    script: 'Every week at BYU, thousands of events happen right across this campus — free food, career recruiting, clubs, devotionals, athletics. Yet most students walk right past them because nobody knows where to look. We built BYU Calendar to put the entire campus in one fast, searchable place.',
  },
  {
    rubric: 'IMPORTANCE OF PROBLEM (5/5)',
    title: '02 · Campus Is Loud, Discovery Is Broken',
    script: 'Right now, BYU events live across 25+ disconnected calendars — BYU Events, nine separate Marriott sub-calendars, AIS, Y-Serve, Clubs, Athletics, Handshake, and buried Slack links. Even worse, zero of them share a search bar, and none let you filter for practical student questions like "is there free food?" or "is it open to everyone?"',
  },
  {
    rubric: 'IMPORTANCE & TRACTION (5/5)',
    title: '03 · Real Campus Scale & Live Usage',
    script: 'When we pulled those calendars together, over 2,600 events and nearly 2,000 upcoming activities surfaced immediately. And students are already using it — over 730 page visits, nearly 300 searches, almost 300 event opens, plus saves, exports, and map directions since launch.',
  },
  {
    rubric: 'USEFULNESS OF SOLUTION (5/5)',
    title: '04 · Every Calendar, One Unified View',
    script: 'BYU Calendar pulls those feeds together into one clean, day-first feed. Every category is color-coded, cross-source duplicates like home games or club fairs collapse automatically, and verified BYU professors, staff, and students can publish additions directly.',
  },
  {
    rubric: 'USEFULNESS OF SOLUTION (5/5)',
    title: '05 · Search Like You Actually Think',
    script: 'Instead of forcing you through nested menus, you just type what you want: "free food this week", "IS or AIS networking", even misspelled "womens tenis" — it handles apostrophes, typos, boolean OR unions, and falls back to AI assist if a natural-language query hits zero deterministic matches.',
  },
  {
    rubric: 'USEFULNESS OF SOLUTION (5/5)',
    title: '06 · From Browsing to Actually Showing Up',
    script: 'Every card shows verified source details — never guessing if food is free or attendance is open — plus one-tap Google or Apple Maps directions, live .ics calendar subscriptions that auto-update in your phone calendar, public RSVPs so you can see friends going, and an opt-in morning digest email.',
  },
  {
    rubric: 'QUALITY & ENGAGEMENT (5/5)',
    title: '07 · Interactive 3D BYU Campus Map',
    script: 'And because "2330 WSC" or "TNRB" doesn\'t tell a freshman where to walk, we built a custom stylized 3D BYU campus map right in WebGL — with cel-shaded buildings, snow-capped Wasatch mountains, and live category-ring event pins. [Click WSC / TNRB / HBLL buttons to fly live!]',
  },
  {
    rubric: 'QUALITY — LIVE DEMO (5/5)',
    title: '08 · Live Demo: byucalendar.com',
    script: 'This isn\'t a mockup — it\'s live right now at byucalendar.com. Let\'s interact with the live app right here: search "free food this week", switch to the 3D map, or check out our /explore 404 skateboarding game.',
  },
  {
    rubric: 'QUALITY (5/5)',
    title: '09 · Built for Production: Real-Time Sync & Tests',
    script: 'Under the hood: an automated 20-minute sync keeps every calendar fresh, Cloudflare D1 powers accounts, RSVPs, and email verification, and over 428 automated tests verify every search and date edge case.',
  },
  {
    rubric: 'ENGAGING FINALE (5/5)',
    title: '10 · Scan to Try BYU Calendar',
    script: 'BYU Calendar turns 25 scattered calendars into one student-built front door for campus life. Pull out your phone and scan the QR code right now to try it at byucalendar.com. Thank you — we\'d love your questions!',
  },
];

const SEARCH_DEMOS = [
  {
    query: 'free food this week',
    chips: [
      { label: 'This week', cls: 'c-blue' },
      { label: 'Food provided', cls: 'c-green' },
    ],
  },
  {
    query: 'IS or AIS networking',
    chips: [
      { label: 'Union OR', cls: 'c-purple' },
      { label: 'IS', cls: 'c-blue' },
      { label: 'AIS', cls: 'c-blue' },
      { label: 'Networking', cls: 'c-green' },
    ],
  },
  {
    query: 'womens tenis',
    chips: [
      { label: 'Apostrophe + Typo Match', cls: 'c-orange' },
      { label: "Women's Tennis", cls: 'c-blue' },
    ],
  },
  {
    query: 'I want to go to a ballet',
    chips: [
      { label: 'AI Assist Reading', cls: 'c-purple' },
      { label: 'Arts & culture', cls: 'c-purple' },
      { label: 'Performances', cls: 'c-blue' },
    ],
  },
];

let current = 0;
let flyover = null;
let presenterWin = null;
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('byu-cal-deck') : null;

function renderBars(topSources) {
  if (!sourceBarsEl || !topSources?.length) return;
  const max = Math.max(...topSources.map(s => s.count), 1);
  const colors = ['#1a73e8', '#188038', '#e8710a', '#7627bb', '#00796b', '#546e7a', '#1a73e8', '#188038'];
  sourceBarsEl.innerHTML = topSources.map((s, i) => {
    const pct = Math.max(4, Math.round((s.count / max) * 100));
    return `
      <div class="bar-row">
        <span class="bar-label">${s.name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${colors[i % colors.length]}"></div></div>
        <span class="bar-val">${s.count.toLocaleString()}</span>
      </div>`;
  }).join('');
}

function animateNumber(el, target) {
  const start = 0;
  const dur = 700;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let liveStats = {
  totalMerged: 2637,
  upcoming: 1988,
  connectedSources: 25,
  campusLocations: 263,
  topSources: [
    { name: 'Y-Serve', count: 1280 },
    { name: 'BYU Events', count: 447 },
    { name: 'BYU Athletics', count: 139 },
    { name: 'AIS', count: 107 },
    { name: 'BYU Law', count: 60 },
    { name: 'MBA', count: 44 },
    { name: 'Engineering', count: 26 },
    { name: 'Student Orgs', count: 26 },
  ],
};

function applyStats(stats) {
  liveStats = stats;
  document.querySelectorAll('[data-stat="merged"]').forEach(el => (el.textContent = stats.totalMerged.toLocaleString()));
  document.querySelectorAll('[data-stat="upcoming"]').forEach(el => (el.textContent = stats.upcoming.toLocaleString()));
  document.querySelectorAll('[data-stat="sources"]').forEach(el => (el.textContent = String(stats.connectedSources)));
  document.querySelectorAll('[data-stat="locations"]').forEach(el => (el.textContent = String(stats.campusLocations)));
  renderBars(stats.topSources);
}

applyStats(liveStats);
const statsUrl = location.pathname === '/' ? '/api/live-stats' : '/api/events';
fetch(statsUrl)
  .then(r => (r.ok ? r.json() : null))
  .then(data => {
    if (!data) return;
    if (data.totalMerged !== undefined) {
      applyStats(data);
      return;
    }
    if (data.events) {
      const today = new Date().toISOString().slice(0, 10);
      applyStats({
        ...liveStats,
        totalMerged: data.events.length,
        upcoming: data.events.filter(e => (e.start || '') >= today).length,
        connectedSources: Array.isArray(data.sources) ? data.sources.filter(s => s.enabled).length : liveStats.connectedSources,
      });
    }
  })
  .catch(() => {});

function updateNotes() {
  const note = SPEAKER_NOTES[current];
  notesRubric.textContent = note.rubric;
  notesTitle.textContent = note.title;
  notesScript.textContent = note.script;
  bc?.postMessage({ index: current, total: slides.length, note, next: SPEAKER_NOTES[current + 1] || null });
}

const demoFrame = document.getElementById('live-demo-frame');
const demoUrlLabel = document.getElementById('demo-url-label');
let demoBooted = false;

function loadDemoPath(path) {
  if (!demoFrame) return;
  demoBooted = true;
  try {
    localStorage.setItem('byucalendar-tour-v1-search', '1');
    localStorage.setItem('byucalendar-tour-v1-category', '1');
    localStorage.setItem('byucalendar-tour-v1-event', '1');
  } catch {}
  const u = new URL(path, location.origin);
  if (u.pathname === '/') {
    u.searchParams.set('embed', '1');
    if (location.pathname === '/') u.searchParams.set('__demo', '1');
  }
  demoFrame.src = `${u.pathname}${u.search}`;
  if (demoUrlLabel) demoUrlLabel.textContent = `https://byucalendar.com${path}`;
  document.querySelectorAll('.preset-btn[data-demo-path]').forEach(b => {
    b.classList.toggle('active', b.dataset.demoPath === path);
  });
}

document.querySelectorAll('.preset-btn[data-demo-path]').forEach(btn => {
  btn.addEventListener('click', () => loadDemoPath(btn.dataset.demoPath));
});
document.getElementById('demo-reload')?.addEventListener('click', () => {
  if (demoFrame?.src) demoFrame.src = demoFrame.src;
});

function goTo(idx) {
  const next = Math.max(0, Math.min(slides.length - 1, idx));
  slides[current].classList.remove('active');
  current = next;
  slides[current].classList.add('active');

  const slideEl = slides[current];
  const mode3d = slideEl.dataset['3d'];
  campusStage.style.opacity = mode3d ? '1' : '0';
  flyover?.setMode(mode3d || 'paused');

  if (!mode3d) document.body.classList.remove('cinema-mode');
  const overlay = document.getElementById('map-shot-overlay');
  if (overlay && current !== 6) overlay.hidden = true;

  if (current === 7 && !demoBooted) {
    loadDemoPath('/?view=day');
  }

  if (current === 2) {
    const m = slideEl.querySelector('[data-count="merged"]');
    const u = slideEl.querySelector('[data-count="upcoming"]');
    if (m) animateNumber(m, liveStats.totalMerged);
    if (u) animateNumber(u, liveStats.upcoming);
  }

  progressFill.style.width = `${((current + 1) / slides.length) * 100}%`;
  slideCounter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  location.hash = `slide-${current + 1}`;
  updateNotes();
}

// Smart search cycler on Slide 5
let searchIdx = 0;
function setSearchDemo(i) {
  searchIdx = i;
  const demo = SEARCH_DEMOS[i];
  const qEl = document.getElementById('demo-query');
  const cEl = document.getElementById('demo-chips');
  if (qEl) qEl.textContent = demo.query;
  if (cEl) cEl.innerHTML = demo.chips.map(c => `<span class="chip ${c.cls}">${c.label}</span>`).join('');
  document.querySelectorAll('.q-pill').forEach((btn, idx) => btn.classList.toggle('active', idx === i));
}
document.querySelectorAll('.q-pill').forEach(btn => {
  btn.addEventListener('click', () => setSearchDemo(Number(btn.dataset.q)));
});
setInterval(() => {
  if (current === 4) setSearchDemo((searchIdx + 1) % SEARCH_DEMOS.length);
}, 3400);

// 3D Map dock controls on Slide 7
document.querySelectorAll('.dock-btn[data-fly]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dock-btn[data-fly]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    flyover?.focusBuilding(btn.dataset.fly);
  });
});

// Action buttons
document.addEventListener('click', e => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'next-shot') flyover?.nextShot();
  if (action === 'toggle-cinema') document.body.classList.toggle('cinema-mode');
  if (action === 'toggle-map-shot') {
    const overlay = document.getElementById('map-shot-overlay');
    if (overlay) overlay.hidden = !overlay.hidden;
  }
});

document.getElementById('prev-btn').addEventListener('click', () => goTo(current - 1));
document.getElementById('next-btn').addEventListener('click', () => goTo(current + 1));
document.getElementById('notes-btn').addEventListener('click', () => {
  notesDrawer.hidden = !notesDrawer.hidden;
});
document.getElementById('close-notes').addEventListener('click', () => {
  notesDrawer.hidden = true;
});
document.getElementById('popout-notes').addEventListener('click', () => {
  notesDrawer.hidden = true;
  presenterWin = window.open('', 'byucal-notes', 'width=540,height=640');
  if (!presenterWin) { notesDrawer.hidden = false; return; }
  presenterWin.document.write(`<!doctype html><html><head><title>Presenter Script — BYU Calendar</title>
    <style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#111317;color:#f5f7fa;line-height:1.6}
    .tag{display:inline-block;font:700 11px monospace;padding:4px 9px;border-radius:6px;background:#1a73e8;color:#fff;margin-bottom:10px}
    h2{margin:0 0 12px;font-size:22px}.script{font-size:19px;color:#e8eaed}.next{margin-top:28px;padding-top:16px;border-top:1px solid #2b2f36;font-size:13px;color:#9aa0a6}
    .nav{margin-top:20px;display:flex;gap:10px}button{padding:10px 16px;border-radius:8px;border:1px solid #3c4043;background:#202124;color:#fff;font-weight:700;cursor:pointer}</style>
    </head><body>
    <div class="tag" id="r"></div><h2 id="t"></h2><p class="script" id="s"></p>
    <div class="nav"><button id="p">← Prev</button><button id="n">Next →</button></div>
    <div class="next" id="nx"></div>
    <script>
      const ch = new BroadcastChannel('byu-cal-deck');
      const draw = d => {
        document.getElementById('r').textContent = (d.index+1)+'/'+d.total+' · '+d.note.rubric;
        document.getElementById('t').textContent = d.note.title;
        document.getElementById('s').textContent = d.note.script;
        document.getElementById('nx').textContent = d.next ? 'UP NEXT: ' + d.next.title : 'END OF DECK';
      };
      ch.onmessage = e => { if (e.data.note) draw(e.data); };
      document.getElementById('p').onclick = () => ch.postMessage({ cmd: 'prev' });
      document.getElementById('n').onclick = () => ch.postMessage({ cmd: 'next' });
      onkeydown = e => { if(e.key==='ArrowRight'||e.key===' ') ch.postMessage({cmd:'next'}); if(e.key==='ArrowLeft') ch.postMessage({cmd:'prev'}); };
    <\/script></body></html>`);
  presenterWin.document.close();
  setTimeout(updateNotes, 120);
});

bc?.addEventListener('message', e => {
  if (e.data?.cmd === 'next') goTo(current + 1);
  if (e.data?.cmd === 'prev') goTo(current - 1);
});

function handleDeckKey(key) {
  if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') { goTo(current + 1); return true; }
  if (key === 'ArrowLeft' || key === 'PageUp') { goTo(current - 1); return true; }
  if (key === 'f' || key === 'F') { document.body.classList.toggle('cinema-mode'); return true; }
  if (key === 'n' || key === 'N') { notesDrawer.hidden = !notesDrawer.hidden; return true; }
  if (/^[1-9]$/.test(key)) { goTo(Number(key) - 1); return true; }
  if (key === '0') { goTo(9); return true; }
  return false;
}

addEventListener('message', e => {
  if (e.origin === location.origin && e.data?.type === 'deck-key') {
    handleDeckKey(e.data.key);
  }
});

addEventListener('keydown', e => {
  if (handleDeckKey(e.key)) e.preventDefault();
});

// Restore initial slide from hash
const hashMatch = location.hash.match(/^#slide-(\d+)$/);
if (hashMatch) goTo(Number(hashMatch[1]) - 1);
else updateNotes();

// Boot live 3D BYU Campus Flyover
initCampusFlyover({
  stage: campusStage,
  loadingEl: document.getElementById('campus-loading'),
  pinsEl: document.getElementById('campus-pins'),
  cutEl: document.getElementById('campus-cut'),
}).then(ctrl => {
  flyover = ctrl;
  const mode3d = slides[current].dataset['3d'];
  campusStage.style.opacity = mode3d ? '1' : '0';
  flyover.setMode(mode3d || 'paused');
}).catch(err => {
  const el = document.getElementById('campus-loading');
  if (el) el.textContent = '3D view unavailable (WebGL error)';
  console.error(err);
});
