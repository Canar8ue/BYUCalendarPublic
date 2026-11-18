'use client';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Plus, Pencil, Trash2, AlertCircle, LoaderCircle} from 'lucide-react';
import AccountShell from '../../account-shell';
import {useAccount, postJSON, getJSON} from '../../account-client';
import {ContributionGate, EditListingForm} from '../../community-forms';
import {CATEGORIES, localDate, timeLabel, lastDay} from '../../../lib/catalog.mjs';
import {dayKey} from '../../../lib/search.mjs';
import type {CampusEvent} from '../../types';

const dayTitle = (date: string) => new Intl.DateTimeFormat('en-US', {timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric'}).format(new Date(date + 'T12:00:00Z'));
const colorOf = (e: CampusEvent) => CATEGORIES.find(c => c.id === e.category)?.color || 'blue';

// The author's own corner of the calendar: every listing they published, ready
// to review, enrich, or remove. Rows come straight from /api/listings/mine,
// which only ever answers with the signed-in author's own submissions.
export default function MyListingsPage() {
  const {account, error} = useAccount();
  const verified = Boolean(account?.permissions.addListings);
  const [listings, setListings] = useState<CampusEvent[] | null>(null), [loadError, setLoadError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null), [deletingId, setDeletingId] = useState<string | null>(null), [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState(''), [actionError, setActionError] = useState('');
  // Refreshes after an edit or delete run from event handlers; the mount effect
  // follows the account-page pattern (state only in promise callbacks) instead.
  const load = useCallback(async () => {
    try { setListings((await getJSON<{listings: CampusEvent[]}>('/api/listings/mine')).listings); setLoadError(''); }
    catch (err) { setListings([]); setLoadError(err instanceof Error ? err.message : 'Could not load your listings.'); }
  }, []);
  useEffect(() => {
    if (!verified) return;
    let active = true;
    getJSON<{listings: CampusEvent[]}>('/api/listings/mine')
      .then(data => { if (active) { setListings(data.listings); setLoadError(''); } })
      .catch(err => { if (active) { setListings([]); setLoadError(err instanceof Error ? err.message : 'Could not load your listings.'); } });
    return () => { active = false; };
  }, [verified]);
  const today = dayKey(new Date());
  // Upcoming keeps cancelled listings visible to their author (with the label);
  // the public calendar hides them, but the person maintaining them still can.
  const upcoming = useMemo(() => (listings || []).filter(e => lastDay(e) >= today).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), [listings, today]);
  const past = useMemo(() => (listings || []).filter(e => lastDay(e) < today).sort((a, b) => Date.parse(b.start) - Date.parse(a.start)), [listings, today]);
  async function editComplete(message: string) { setNotice(message); setEditingId(null); await load(); }
  async function removeListing(id: string) {
    setBusyId(id); setActionError('');
    try { await postJSON('/api/listings/delete', {id}); setNotice('Listing deleted.'); setDeletingId(null); await load(); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'Could not delete the listing.'); }
    finally { setBusyId(null); }
  }
  const staffVerified = account?.staff?.status === 'verified';
  const row = (e: CampusEvent) => <article className={'my-listing ' + colorOf(e)} key={e.id}>
    <div className="my-listing-row">
      <div className="my-listing-info">
        <div className="my-listing-title"><span className={'category-dot ' + colorOf(e)}/>{e.cancelled &&<span className="cancelled-label">Cancelled · </span>}{e.title}<span className={'community-badge' + (staffVerified ? ' byu-badge' : '')}>{staffVerified ? 'BYU added event' : 'Community submitted'}</span></div>
        <small>{dayTitle(localDate(e))} · {timeLabel(e)} · {e.location || 'Location not listed'}</small>
        {Boolean(e.tags.length) && <div className="row-tags">{e.tags.slice(0, 5).map(tag => <span key={tag}>{tag}</span>)}</div>}
      </div>
      {deletingId === e.id ? <div className="my-listing-confirm">
        <span>Delete this listing?</span>
        <button className="primary-button" disabled={busyId === e.id} onClick={() => void removeListing(e.id)}><Trash2 size={15}/>{busyId === e.id ? 'Deleting…' : 'Delete permanently'}</button>
        <button className="outline-button" disabled={busyId === e.id} onClick={() => setDeletingId(null)}>Keep it</button>
      </div> : <div className="my-listing-actions">
        <a className="outline-button" href={'/?event=' + encodeURIComponent(e.id) + '&view=list'}>View</a>
        <button className="outline-button" onClick={() => { setDeletingId(null); setEditingId(editingId === e.id ? null : e.id); }}><Pencil size={15}/> {editingId === e.id ? 'Close' : 'Edit'}</button>
        <button className="text-button" onClick={() => { setEditingId(null); setActionError(''); setDeletingId(e.id); }}><Trash2 size={15}/> Delete</button>
      </div>}
    </div>
    {editingId === e.id && <EditListingForm event={e} onComplete={editComplete}/>}
  </article>;
  return <AccountShell><section className="account-card listing-form-card"><h1 className="plain-heading">Your listings</h1>
    {!verified ? <ContributionGate account={account} error={error} action="see your listings" returnTo="/listings/mine"/> : <>
      {(loadError || actionError) && <p className="form-error" role="alert"><AlertCircle size={15}/> {actionError || loadError}</p>}
      {notice && <p className="my-listings-notice" role="status">{notice}</p>}
      {listings === null ? <p role="status" className="account-description"><LoaderCircle className="spin" size={16}/> Loading your listings…</p> : <>
        <div className="my-listings-head">
          <p className="account-description">{listings.length === 0 ? 'No listings yet.' : `${listings.length} listing${listings.length === 1 ? '' : 's'} · ${upcoming.length} still coming up`}</p>
          <a className="primary-button" href="/listings/new"><Plus size={16}/> Add a listing</a>
        </div>
        {listings.length === 0 ? <div className="my-listings-empty"><p>You haven’t added any events yet.</p></div> : <>
          {upcoming.length > 0 && <div className="section-label">COMING UP</div>}
          {upcoming.map(row)}
          {past.length > 0 && <div className="section-label my-listings-past-label">PAST</div>}
          {past.map(row)}
        </>}
        {loadError && <button className="outline-button" onClick={() => { setLoadError(''); void load(); }}>Try again</button>}
      </>}
    </>}
  </section></AccountShell>;
}
