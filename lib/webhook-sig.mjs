// Svix-style webhook verification, as used by Resend: the signed content is
// "<svix-id>.<svix-timestamp>.<raw body>", HMAC-SHA-256 keyed with the
// base64-decoded part of the whsec_ secret, and compared against the
// space-separated "v1,<base64>" entries in the svix-signature header.

const TIMESTAMP_TOLERANCE_SECONDS = 300;

function base64Bytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyWebhookSignature(secret, headers, rawBody, nowMs = Date.now()) {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');
  if (!secret || !id || !timestamp || !signatureHeader) return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(nowMs / 1000 - seconds) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  let key;
  try {
    key = base64Bytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret);
  } catch { return false; }
  if (!key.length) return false;
  const digest = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])
    .then(key => crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)));
  const expected = `v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
  return signatureHeader.split(' ').some(entry => timingSafeEqual(entry.trim(), expected));
}
