'use client';
import {useState} from 'react';
import {ArrowRight, ShieldCheck} from 'lucide-react';
import {COMMUNITY_TAGS, REPORT_REASONS} from '../lib/community.mjs';
import {CATEGORIES} from '../lib/catalog.mjs';
import {postJSON} from './account-client';
import type {AccountState, CampusEvent} from './types';

export function ContributionGate({account, action, returnTo, error}: {account: AccountState | null; action: string; returnTo: string; error?: string}) {
  return <div className="contribution-gate"><ShieldCheck size={27}/><h3>Help shape the calendar.</h3><p>{error || (!account ? 'Loading your account…' : `Sign in with a verified BYU email to ${action}.`)}</p>{account && <a className="primary-button" href={'/signin?returnTo=' + encodeURIComponent(returnTo)}>Sign in with BYU email <ArrowRight size={15}/></a>}{account && !account.emailReady && <small>Email verification is coming soon. You can browse events now.</small>}</div>;
}

export function NewListingForm({onPublished}: {onPublished: (event: CampusEvent) => void}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [allDay, setAllDay] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      const result = await postJSON<{event: CampusEvent}>('/api/listings', {...Object.fromEntries(values), submissionId, allDay});
      onPublished(result.event);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not publish your listing.'); setBusy(false); }
  }
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>Event title<input name="title" required minLength={3} maxLength={160} placeholder="e.g. Campus coding night"/></label>
    <label>Organizer or club<input name="organizer" required minLength={2} maxLength={120} placeholder="Who is hosting?"/></label>
    <label>Description<textarea name="description" required minLength={20} maxLength={5000} rows={5} placeholder="What’s happening, who can attend, and what should people know?"/><small>Include only details you can confirm. Your listing and description will be public.</small></label>
    <div className="form-two-columns"><label>Category<select name="category">{CATEGORIES.map(c => <option key={c.id}>{c.id}</option>)}</select></label><label>Location<input name="location" required minLength={2} maxLength={240} placeholder="Building and room, or Online"/></label></div>
    <label className="form-checkbox"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}/> All-day event</label>
    <div className="form-two-columns" key={String(allDay)}><label>{allDay ? 'First day' : 'Starts'}<input name="start" type={allDay ? 'date' : 'datetime-local'} required/></label><label>{allDay ? 'Last day (optional)' : 'Ends (optional)'}<input name="end" type={allDay ? 'date' : 'datetime-local'}/></label></div>
    <p className="form-help">All dates and times are in Mountain Time (Provo). For an all-day event, the last day is included.</p>
    <label>Event or organizer link<input name="url" type="url" pattern="https://.*" required maxLength={2000} placeholder="https://…"/><small>Link to the announcement or organizer so people can check the details.</small></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="account-notice">Your listing will appear immediately with a Community submitted label. Your email stays private.</p>
    <button className="primary-button" type="submit">{busy ? 'Publishing…' : 'Publish listing'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}

// Stored community events carry ISO instants (timed) or inclusive/exclusive
// dates (all-day); form inputs need Mountain Time civil strings instead.
const civilMountainTime = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
function formStart(event: CampusEvent): string {return event.allDay ? event.start : civilMountainTime.format(new Date(event.start)).replace(' ', 'T');}
function formEnd(event: CampusEvent): string {
  if (!event.end) return '';
  return event.allDay ? new Date(Date.parse(event.end) - 86400000).toISOString().slice(0, 10) : civilMountainTime.format(new Date(event.end)).replace(' ', 'T');
}

export function EditListingForm({event, onComplete, moderator}: {event: CampusEvent; onComplete: (message: string) => Promise<void>; moderator?: boolean}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [allDay, setAllDay] = useState(event.allDay);
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      await postJSON(moderator ? '/api/moderation/events' : '/api/listings/update', moderator ? {action: 'update', id: event.id, ...Object.fromEntries(values), allDay} : {id: event.id, ...Object.fromEntries(values), allDay});
      await onComplete(moderator ? 'The listing is updated.' : 'Your listing is updated.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update your listing.'); setBusy(false); }
  }
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>Event title<input name="title" required minLength={3} maxLength={160} defaultValue={event.title}/></label>
    <label>Organizer or club<input name="organizer" required minLength={2} maxLength={120} defaultValue={event.organizer}/></label>
    <label>Description<textarea name="description" required minLength={20} maxLength={5000} rows={5} defaultValue={event.description}/><small>Include only details you can confirm. Your listing and description will be public.</small></label>
    <div className="form-two-columns"><label>Category<select name="category" defaultValue={event.category}>{CATEGORIES.map(c => <option key={c.id}>{c.id}</option>)}</select></label><label>Location<input name="location" required minLength={2} maxLength={240} defaultValue={event.location}/></label></div>
    <label className="form-checkbox"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}/> All-day event</label>
    <div className="form-two-columns" key={String(allDay)}><label>{allDay ? 'First day' : 'Starts'}<input name="start" type={allDay ? 'date' : 'datetime-local'} required defaultValue={formStart(event)}/></label><label>{allDay ? 'Last day (optional)' : 'Ends (optional)'}<input name="end" type={allDay ? 'date' : 'datetime-local'} defaultValue={formEnd(event)}/></label></div>
    <p className="form-help">All dates and times are in Mountain Time (Provo). For an all-day event, the last day is included.</p>
    <label>Event or organizer link<input name="url" type="url" pattern="https://.*" required maxLength={2000} defaultValue={event.url}/><small>Link to the announcement or organizer so people can check the details.</small></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save changes'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}

// Moderator corrections for source listings: the five correctable fields are
// stored as a read-time override patch, so a source refresh cannot revert
// them. Dates are intentionally absent — moving an occurrence belongs to the
// source calendar that owns the event.
export function ModeratorEditForm({event, onComplete}: {event: CampusEvent; onComplete: (message: string) => Promise<void>}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      await postJSON('/api/moderation/events', {action: 'update', id: event.id, title: values.get('title'), category: values.get('category'), location: values.get('location'), description: values.get('description'), url: values.get('url')});
      await onComplete('The listing is corrected.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the listing.'); setBusy(false); }
  }
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>Event title<input name="title" required minLength={3} maxLength={160} defaultValue={event.title}/></label>
    <div className="form-two-columns"><label>Category<select name="category" defaultValue={event.category}>{CATEGORIES.map(c => <option key={c.id}>{c.id}</option>)}</select></label><label>Location<input name="location" maxLength={240} defaultValue={event.location} placeholder="Building and room; leave empty if unknown"/></label></div>
    <label>Description<textarea name="description" maxLength={5000} rows={5} defaultValue={event.description}/><small>Keep the source description unless it needs a correction; clearing it removes the text here.</small></label>
    <label>Event or organizer link<input name="url" type="url" pattern="https://.*" required maxLength={2000} defaultValue={event.url}/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="account-notice">Corrections apply to BYU Calendar only and survive source refreshes. The connected source keeps its original text, and Review reports can revert the correction.</p>
    <button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save correction'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}

export function EventContributionForm({kind, event, onComplete}: {kind: 'tag' | 'report'; event: CampusEvent; onComplete: (message: string) => Promise<void>}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const available = COMMUNITY_TAGS.filter(tag => !event.tags.includes(tag));
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError('');
    try {
      const data = await postJSON<{alreadyReported?: boolean; alreadyAdded?: boolean}>('/api/listings/' + (kind === 'tag' ? 'tags' : 'reports'), {eventId: event.id, ...Object.fromEntries(new FormData(form))});
      await onComplete(kind === 'tag' ? data.alreadyAdded ? 'This tag is already on the listing.' : 'Your tag is now on the listing.' : data.alreadyReported ? 'You have already reported this listing.' : 'Report received. It is private and ready for review.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit.'); setBusy(false); }
  }
  if (kind === 'tag' && !available.length) return <p>All available tags are already on this listing.</p>;
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    {kind === 'tag' ? <><label>Tag<select name="tag">{available.map(tag => <option key={tag}>{tag}</option>)}</select></label><label>How do you know?<textarea name="note" required minLength={10} maxLength={500} rows={3} placeholder="e.g. The organizer’s announcement says pizza will be provided."/><small>This note will be public with your tag. Include evidence, and keep personal information out.</small></label><p className="form-help">Community tags publish immediately and are labeled separately from source details.</p></> : <><label>What needs attention?<select name="reason">{REPORT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Tell us what’s wrong<textarea name="details" required minLength={10} maxLength={1500} rows={4} placeholder="Describe the issue and any correction or supporting link."/><small>Your report is visible only to calendar administrators. Reporting does not automatically remove a listing.</small></label></>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit">{busy ? 'Submitting…' : kind === 'tag' ? 'Publish tag' : 'Send report'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}
