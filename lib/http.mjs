export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
}

export function errorResponse(error) {
  if (error instanceof RequestError) return json({error: error.message}, error.status);
  // Never log request bodies, credentials, verification codes, or private reports.
  return json({error: 'This action is temporarily unavailable. Please try again.'}, 503);
}

export function requireSameOrigin(request, origin) {
  if (!origin || request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new RequestError(403, 'Please submit this action from BYU Calendar.');
  }
}

// Refresh callers must present the exact public origin: browsers send it
// automatically, and the server cron sends it explicitly. Headerless scripts
// (curl without Origin) are rejected so the endpoint is not script-callable.
export function requireRefreshOrigin(request, origin) {
  const supplied = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site' || supplied !== origin) {
    throw new RequestError(403, 'Origin mismatch');
  }
}

export async function readBodyText(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Missing submission.');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413, 'Your submission is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readJSON(request, limit = 16000) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new RequestError(415, 'Send JSON data.');
  if (Number(request.headers.get('content-length')) > limit) throw new RequestError(413, 'Your submission is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Missing submission.');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413, 'Your submission is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError(400, 'Your submission is not valid JSON.'); }
}
