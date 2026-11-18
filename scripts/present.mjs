import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRES_DIR = join(ROOT, 'public', 'demo-deck');
const CAMPUS_DIR = join(ROOT, 'public', 'campus');
const PORT = Number(process.env.PORT || 4173);
const UPSTREAM = 'https://byucalendar.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
};

const FALLBACK_STATS = {
  live: false,
  totalMerged: 2637,
  upcoming: 1988,
  connectedSources: 25,
  totalSources: 28,
  campusLocations: 263,
  topSources: [
    { name: 'Y-Serve', count: 1280 },
    { name: 'BYU Events', count: 447 },
    { name: 'BYU Athletics', count: 139 },
    { name: 'AIS', count: 107 },
    { name: 'BYU Law', count: 60 },
    { name: 'MBA', count: 44 },
    { name: 'Engineering', count: 26 },
    { name: 'Clubs Snapshot', count: 26 },
  ],
};

let cachedStats = null;
let cacheTime = 0;

async function getLiveStats() {
  if (cachedStats && Date.now() - cacheTime < 60_000) return cachedStats;
  try {
    const res = await fetch(`${UPSTREAM}/api/events`, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (data.events || []).filter(e => (e.start || '') >= today).length;
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const topSources = sources
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(s => ({ name: s.name, count: s.count }));
    cachedStats = {
      live: true,
      totalMerged: data.events?.length ?? FALLBACK_STATS.totalMerged,
      upcoming,
      connectedSources: sources.filter(s => s.enabled).length || FALLBACK_STATS.connectedSources,
      totalSources: sources.length || FALLBACK_STATS.totalSources,
      campusLocations: FALLBACK_STATS.campusLocations,
      topSources: topSources.length ? topSources : FALLBACK_STATS.topSources,
    };
    cacheTime = Date.now();
    return cachedStats;
  } catch {
    return FALLBACK_STATS;
  }
}

function safeResolve(baseDir, reqPath) {
  const clean = normalize(reqPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const full = resolve(baseDir, clean);
  if (!full.startsWith(baseDir)) return null;
  return full;
}

async function tryServeFile(filePath, res) {
  if (!filePath) return false;
  try {
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    const ext = extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.glb' ? 'public, max-age=3600' : 'no-cache',
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function proxyUpstream(req, res, url) {
  try {
    const upstreamUrl = new URL(url.pathname + url.search, UPSTREAM);
    upstreamUrl.searchParams.delete('__demo');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET') && chunks.length > 0;

    const headers = new Headers();
    for (const key of ['accept', 'content-type', 'accept-language', 'cookie']) {
      const val = req.headers[key];
      if (val) headers.set(key, Array.isArray(val) ? val.join(', ') : val);
    }
    headers.set('origin', UPSTREAM);
    headers.set('referer', `${UPSTREAM}/`);

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method || 'GET',
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    const outHeaders = {};
    for (const [k, v] of upstreamRes.headers.entries()) {
      const lk = k.toLowerCase();
      if (
        lk === 'x-frame-options' ||
        lk === 'content-encoding' ||
        lk === 'content-length' ||
        lk === 'transfer-encoding' ||
        lk === 'strict-transport-security'
      ) continue;
      if (lk === 'content-security-policy') {
        outHeaders[k] = v.replace(/frame-ancestors[^;]*(;|$)/gi, '');
        continue;
      }
      if (lk === 'location' && v.startsWith(UPSTREAM)) {
        outHeaders[k] = v.slice(UPSTREAM.length) || '/';
        continue;
      }
      outHeaders[k] = v;
    }

    let buf = Buffer.from(await upstreamRes.arrayBuffer());
    const ct = String(outHeaders['content-type'] || '');
    if (ct.includes('text/html')) {
      const html = buf.toString('utf8').replace(
        '</head>',
        '<style>.loader{display:none!important;pointer-events:none!important}body.is-launching{overflow:auto!important}</style></head>'
      );
      buf = Buffer.from(html, 'utf8');
    }
    res.writeHead(upstreamRes.status, outHeaders);
    res.end(buf);
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f8f9fa;color:#202124"><div style="text-align:center;padding:24px"><h2>Live demo unreachable</h2><p>Check internet connection or click <b>New Tab ↗</b> above.</p></div></body></html>`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const isIframeRoot =
    pathname === '/' &&
    (req.headers['sec-fetch-dest'] === 'iframe' || url.searchParams.has('__demo'));

  if (pathname === '/api/live-stats') {
    const stats = await getLiveStats();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(stats));
    return;
  }

  // 1. Serve presentation deck & assets (unless `/` is loaded inside the demo iframe)
  if (!isIframeRoot) {
    if (pathname === '/' || pathname === '/index.html') {
      if (await tryServeFile(join(PRES_DIR, 'index.html'), res)) return;
    }
    if (pathname === '/favicon.svg' || pathname === '/og-image.png') {
      if (await tryServeFile(safeResolve(join(ROOT, 'public'), pathname.slice(1)), res)) return;
    }
    if (pathname.startsWith('/campus/')) {
      if (await tryServeFile(safeResolve(CAMPUS_DIR, pathname.slice('/campus/'.length)), res)) return;
    }
    const presCandidate = safeResolve(PRES_DIR, pathname.slice(1));
    if (presCandidate && await tryServeFile(presCandidate, res)) return;
  }

  // 2. Proxy live https://byucalendar.com routes, bundles, and API calls for the demo iframe
  await proxyUpstream(req, res, url);
});

server.listen(PORT, () => {
  console.log(`\n  BYU Calendar Presentation Server running at:`);
  console.log(`  http://127.0.0.1:${PORT}  (and http://localhost:${PORT})\n`);
  console.log(`  Controls: Arrow keys / Space to advance | N for Speaker Script | F for Flyover-only\n`);
});
