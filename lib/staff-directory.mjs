// Runtime-loaded BYU faculty/staff auto-allow directory.
// Public repositories must never embed personal institutional email addresses.
// In production, supply STAFF_DIRECTORY_JSON as a JSON object mapping lowercased
// BYU faculty/staff emails to department area ids (e.g. '{"jane_doe@law.byu.edu":"law"}').

function loadStaffDirectory() {
  const raw = typeof process !== 'undefined' ? process.env?.STAFF_DIRECTORY_JSON : '';
  if (!raw || !raw.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const out = new Map();
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string' && /@(?:[a-z0-9-]+\.)*byu\.edu$/i.test(k.trim())) {
        out.set(k.trim().toLowerCase(), v.trim());
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

export const AUTO_VERIFIED_STAFF = loadStaffDirectory();

// Exact match OR plain @byu.edu matching an entry with the same local part on
// a byu.edu department subdomain. Student addresses (@student.byu.edu) and
// arbitrary subdomains never match by local-part fallback.
export function autoVerifyArea(email, directory = AUTO_VERIFIED_STAFF) {
  const normalized = String(email || '').trim().toLowerCase();
  if (directory.has(normalized)) return directory.get(normalized);
  const at = normalized.indexOf('@');
  if (at <= 0) return null;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain !== 'byu.edu') return null;
  for (const [listed, area] of directory) {
    const [listedLocal, listedDomain] = listed.split('@');
    if (listedLocal === local && (listedDomain === 'byu.edu' || listedDomain.endsWith('.byu.edu'))) {
      return area;
    }
  }
  return null;
}
