'use client';
// First-visit tour: two small, dismissible pointers rather than a walkthrough.
// One tip introduces smart search on the home surface; the first opened event
// gets pulsing outlines on its main actions plus a compact card that explains
// them (and, for signed-out visitors, why an account is worth it). Each tip
// appears at most once per browser via versioned localStorage flags, and
// nothing ever covers the screen.
import {useEffect, useState} from 'react';
import {Bookmark, MapPin, Navigation, Sparkles} from 'lucide-react';

export const SEARCH_TOUR_FLAG = 'byucalendar-tour-v1-search';
export const EVENT_TOUR_FLAG = 'byucalendar-tour-v1-event';

// localStorage can throw in private browsing modes; a tip that cannot remember
// itself simply stays quiet instead of nagging on every visit.
function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
export function tourSeen(flag: string): boolean {
  try { return Boolean(storage()?.getItem(flag)); } catch { return true; }
}
export function markTourSeen(flag: string) {
  try { storage()?.setItem(flag, 'seen'); } catch {/* already silent */}
}

function TourKicker() {
  return <div className="tour-kicker">QUICK TIP</div>;
}

// The parent decides whether the tip still applies (first visit, loader
// cleared); dismissal is local state plus the storage flag, so the tip never
// needs to set state from an effect.
export function SearchTip({visible, onTry}: {visible: boolean; onTry: () => void}) {
  const [open, setOpen] = useState(visible);
  const dismiss = () => { markTourSeen(SEARCH_TOUR_FLAG); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="tour-pop" role="dialog" aria-label="Search tip">
      <TourKicker/>
      <p><b>Search like you mean it.</b> Type a phrase like “free food this week” or “shows this weekend” — smart search turns it into filters.</p>
      <div className="tour-actions">
        <button className="primary-button" onClick={() => { markTourSeen(SEARCH_TOUR_FLAG); setOpen(false); onTry(); }}>Try “free food this week”</button>
        <button className="text-button" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}

export function EventTip({visible, hasDirections, hasMap, signedIn, signInHref, onDismiss}: {
  visible: boolean; hasDirections: boolean; hasMap: boolean; signedIn: boolean; signInHref: string; onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="tour-card" role="note" aria-label="Event actions tip">
      <TourKicker/>
      {hasDirections && <div className="tour-line"><Navigation size={15}/><span><b>Directions in Maps</b> opens the venue directly in Google Maps or Apple Maps.</span></div>}
      {!hasDirections && hasMap && <div className="tour-line"><MapPin size={15}/><span><b>View on 3D map</b> flies the campus map to this building on its day.</span></div>}
      <div className="tour-line"><Bookmark size={15}/><span><b>Save event</b> keeps it on My calendar so it’s easy to find later.</span></div>
      {!signedIn && (
        <div className="tour-line"><Sparkles size={15}/><span>
          <b>Make it yours.</b> A free account with your BYU email keeps saved events and filters on every device — and can email you one morning digest of your day.
          {' '}<a className="tour-link" href={signInHref}>Create an account</a>
        </span></div>
      )}
      <div className="tour-actions">
        <button className="text-button" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}
