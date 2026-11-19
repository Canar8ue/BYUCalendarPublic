'use client';
import {useRef,useState} from 'react';
import {ArrowRight, ShieldCheck} from 'lucide-react';
import {COMMUNITY_TAGS, REPORT_REASONS, listingInputDates, changeListingDateMode} from '../lib/community.mjs';
import {CATEGORIES, displayCategory, displayTag, mountainZoneAbbr} from '../lib/catalog.mjs';
import {postJSON} from './account-client';
import type {AccountState, CampusEvent} from './types';

export function ContributionGate({account, action, returnTo, error}: {account: AccountState | null; action: string; returnTo: string; error?: string}) {
  return <div className="contribution-gate"><ShieldCheck size={27}/><h3>Help shape the calendar.</h3><p>{error || (!account ? 'Loading your account…' : `Sign in with a verified BYU email to ${action}.`)}</p>{account && <a className="primary-button" href={'/signin?returnTo=' + encodeURIComponent(returnTo)}>Sign In with BYU Email <ArrowRight size={15}/></a>}{account && !account.emailReady && <small>Email verification is coming soon. You can browse events now.</small>}</div>;
}

function useListingDates(event?: CampusEvent) {
  const [allDay,setAllDay]=useState(event?.allDay||false);
  const [dates,setDates]=useState<{start:string;end:string}>(()=>listingInputDates(event));
  const previous=useRef<{allDay:boolean;start:string;end:string}|null>(null);
  function changeAllDay(next:boolean){
    const prior=previous.current;
    const converted=prior?changeListingDateMode(prior,allDay):null;
    const restored=prior&&prior.allDay===next&&converted?.start===dates.start&&converted?.end===dates.end;
    previous.current={allDay,...dates};
    setDates(restored?{start:prior.start,end:prior.end}:changeListingDateMode(dates,next));
    setAllDay(next);
  }
  return {allDay,changeAllDay,dates,setDates};
}

export function NewListingForm({onPublished, immediatePublish = false}: {onPublished: (event: CampusEvent, first: boolean) => void; immediatePublish?: boolean}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const {allDay,changeAllDay,dates,setDates}=useListingDates();
  const [submissionId] = useState(() => crypto.randomUUID());
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      const result = await postJSON<{event: CampusEvent; first?: boolean; approvalStatus?: 'approved' | 'pending' | 'rejected'}>('/api/listings', {...Object.fromEntries(values), submissionId, allDay});
      onPublished({...result.event, approvalStatus: result.approvalStatus || result.event.approvalStatus}, Boolean(result.first));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not publish your listing.'); setBusy(false); }
  }
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>Event title<input name="title" required minLength={3} maxLength={160} placeholder="e.g. Campus coding night"/></label>
    <label>Organizer or club<input name="organizer" required minLength={2} maxLength={120} placeholder="Who is hosting?"/></label>
    <label>Description<textarea name="description" required minLength={20} maxLength={5000} rows={5} placeholder="What’s happening, who can attend, and what should people know?"/><small>Include only details you can confirm. Your listing and description will be public.</small></label>
    <div className="form-two-columns"><label>Category<select name="category">{CATEGORIES.map(c => <option key={c.id} value={c.id}>{displayCategory(c.id)}</option>)}</select></label><label>Location<input name="location" required minLength={2} maxLength={240} placeholder="Building and room, or Online"/></label></div>
    <label className="form-checkbox"><input type="checkbox" checked={allDay} onChange={e => changeAllDay(e.target.checked)}/> All-Day Event</label>
    <div className="form-two-columns" key={String(allDay)}><label>{allDay ? 'First Day' : 'Starts'}<input name="start" type={allDay ? 'date' : 'datetime-local'} required value={dates.start} onChange={e=>setDates(current=>({...current,start:e.target.value}))}/></label><label>{allDay ? 'Last Day (Optional)' : 'Ends (Optional)'}<input name="end" type={allDay ? 'date' : 'datetime-local'} value={dates.end} onChange={e=>setDates(current=>({...current,end:e.target.value}))}/></label></div>
    <p className="form-help">All dates and times are in {mountainZoneAbbr()} (Provo). For an all-day event, the last day is included.</p>
    <label>Event or Organizer Link<input name="url" type="url" pattern="https://.*" required maxLength={2000} placeholder="https://…"/><small>Link to the announcement or organizer so people can check the details.</small></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="account-notice">{immediatePublish ? 'Your event will be public immediately.' : 'Your event will be approved first, then will show on BYU Calendar.'} Your email stays private.</p>
    <button className="primary-button" type="submit">{busy ? (immediatePublish ? 'Publishing…' : 'Submitting…') : (immediatePublish ? 'Publish Listing' : 'Submit for Approval')}<ArrowRight size={16}/></button>
  </fieldset></form>;
}

export function EditListingForm({event, onComplete, moderator}: {event: CampusEvent; onComplete: (message: string) => Promise<void>; moderator?: boolean}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const {allDay,changeAllDay,dates,setDates}=useListingDates(event);
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
    <div className="form-two-columns"><label>Category<select name="category" defaultValue={event.category}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{displayCategory(c.id)}</option>)}</select></label><label>Location<input name="location" required minLength={2} maxLength={240} defaultValue={event.location}/></label></div>
    <label className="form-checkbox"><input type="checkbox" checked={allDay} onChange={e => changeAllDay(e.target.checked)}/> All-Day Event</label>
    <div className="form-two-columns" key={String(allDay)}><label>{allDay ? 'First Day' : 'Starts'}<input name="start" type={allDay ? 'date' : 'datetime-local'} required value={dates.start} onChange={e=>setDates(current=>({...current,start:e.target.value}))}/></label><label>{allDay ? 'Last Day (Optional)' : 'Ends (Optional)'}<input name="end" type={allDay ? 'date' : 'datetime-local'} value={dates.end} onChange={e=>setDates(current=>({...current,end:e.target.value}))}/></label></div>
    <p className="form-help">All dates and times are in {mountainZoneAbbr()} (Provo). For an all-day event, the last day is included.</p>
    <label>Event or Organizer Link<input name="url" type="url" pattern="https://.*" required maxLength={2000} defaultValue={event.url}/><small>Link to the announcement or organizer so people can check the details.</small></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save Changes'}<ArrowRight size={16}/></button>
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
    <div className="form-two-columns"><label>Category<select name="category" defaultValue={event.category}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{displayCategory(c.id)}</option>)}</select></label><label>Location<input name="location" maxLength={240} defaultValue={event.location} placeholder="Building and room; leave empty if unknown"/></label></div>
    <label>Description<textarea name="description" maxLength={5000} rows={5} defaultValue={event.description}/><small>Keep the source description unless it needs a correction; clearing it removes the text here.</small></label>
    <label>Event or Organizer Link<input name="url" type="url" pattern="https://.*" required maxLength={2000} defaultValue={event.url}/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="account-notice">Corrections apply to BYU Calendar only and survive source refreshes. The connected source keeps its original text, and Review Reports can revert the correction.</p>
    <button className="primary-button" type="submit">{busy ? 'Saving…' : 'Save Correction'}<ArrowRight size={16}/></button>
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
    {kind === 'tag' ? <><label>Tag<select name="tag">{available.map(tag => <option key={tag} value={tag}>{displayTag(tag)}</option>)}</select></label><label>How do you know?<textarea name="note" required minLength={10} maxLength={500} rows={3} placeholder="e.g. The organizer’s announcement says pizza will be provided."/><small>This note will be public with your tag. Include evidence, and keep personal information out.</small></label><p className="form-help">Community tags publish immediately and are labeled separately from source details.</p></> : <><label>What needs attention?<select name="reason">{REPORT_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></label><label>Tell us what’s wrong<textarea name="details" required minLength={10} maxLength={1500} rows={4} placeholder="Describe the issue and any correction or supporting link."/><small>Your report is visible only to calendar administrators. Reporting does not automatically remove a listing.</small></label></>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit">{busy ? 'Submitting…' : kind === 'tag' ? 'Publish Tag' : 'Send Report'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}

export function SuggestInterestForm({onComplete}: {onComplete: (message: string) => void}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError('');
    try {
      await postJSON('/api/interests/suggest', Object.fromEntries(new FormData(form)));
      onComplete('Interest suggestion sent. Thanks for helping shape the calendar.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send your suggestion.'); setBusy(false); }
  }
  return <form className="community-form" onSubmit={e => {e.preventDefault(); void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>Interest<input name="interest" required minLength={2} maxLength={60} placeholder="e.g. Pre-Med, Robotics, Film"/></label>
    <label>Details (Optional)<textarea name="note" maxLength={500} rows={3} placeholder="Clubs, departments, or events this interest should cover."/></label>
    <p className="form-help">Suggestions go to calendar moderators for review.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="submit">{busy ? 'Sending…' : 'Send Suggestion'}<ArrowRight size={16}/></button>
  </fieldset></form>;
}
