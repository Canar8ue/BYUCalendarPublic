// RSVP rules shared by client and server: what an avatar may be, and how a
// public RSVP entry reads depending on who is looking.
export const MAX_AVATAR_CHARS = 300000;

// Returns null for "clear the avatar", the cleaned data URL when valid, and
// undefined for anything the member may not store.
export function cleanAvatar(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_AVATAR_CHARS) return undefined;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  return match ? value : undefined;
}

// Signed-out visitors see only the first initial; verified members also see
// the name and BYU email behind a hover.
export function rsvpEntry(row, viewerIsMember) {
  const initial = String(row.name || row.email || '?').trim().charAt(0).toUpperCase() || '?';
  const entry = {initial, avatar: row.avatar || null};
  if (viewerIsMember) { entry.name = row.name || ''; entry.email = row.email || ''; }
  return entry;
}
