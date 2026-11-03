'use client';
import {useEffect, useState} from 'react';
import {ShieldCheck, LogOut, Plus, Flag, Copy, Check, GraduationCap} from 'lucide-react';
import AccountShell from '../account-shell';
import {postJSON, useAccount, getJSON} from '../account-client';
import {STAFF_AREAS} from '../../lib/staff.mjs';

const STAFF_REQUEST_STASH = 'byucalendar-staff-request';

export default function AccountPage() {
  const {account, error: accountError, reload} = useAccount();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState({loaded: false, optedIn: false, busy: false});
  const [feed, setFeed] = useState<{state: 'loading' | 'ready' | 'error'; url?: string; webcal?: string}>({state: 'loading'});
  const [feedCopied, setFeedCopied] = useState(false);
  const [staffAreaId, setStaffAreaId] = useState(''), [staffBusy, setStaffBusy] = useState(false);
  // Public profile: the avatar and the hide-from-RSVV-lists switch.
  const [avatar, setAvatar] = useState<{state: 'loading' | 'ready'; url: string | null; hidden: boolean; busy: boolean}>({state: 'loading', url: null, hidden: false, busy: false});
  useEffect(() => {
    if (!account?.user) return;
    let active = true;
    getJSON<{avatar: string | null; hidden: boolean}>('/api/profile', 15000)
      .then(data => { if (active) setAvatar({state: 'ready', url: data.avatar, hidden: data.hidden, busy: false}); })
      .catch(() => { if (active) setAvatar({state: 'ready', url: null, hidden: false, busy: false}); });
    return () => { active = false; };
  }, [account?.user]);
  async function saveProfile(patch: {avatar?: string | null; hidden?: boolean}) {
    setAvatar(current => ({...current, busy: true}));
    try {
      const saved = await postJSON<{avatar: string | null; hidden: boolean}>('/api/profile', patch, 30000);
      setAvatar({state: 'ready', url: saved.avatar, hidden: saved.hidden, busy: false});
    } catch (err) {
      setAvatar(current => ({...current, busy: false}));
      setError(err instanceof Error ? err.message : 'Could not update your profile.');
    }
  }
  function onAvatarChange(file: File | undefined) {
    if (!file) return;
    // Resize locally, before anything leaves the browser.
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setError('Choose a PNG, JPEG, or WebP picture.');
      image.onload = () => {
        const size = 256, canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) { setError('Your browser could not process that picture.'); return; }
        const scale = Math.max(size / image.width, size / image.height);
        context.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
        void saveProfile({avatar: canvas.toDataURL('image/jpeg', 0.86)});
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  // A staff request stashed during sign-up that could not be sent yet lands
  // here: send it once a verified session exists, then refresh the account.
  useEffect(() => {
    if (!account?.user?.emailVerified || account.staff) return;
    let stash: {area?: string} | null = null;
    try { stash = JSON.parse(localStorage.getItem(STAFF_REQUEST_STASH) || 'null'); } catch { stash = null; }
    if (!stash?.area) return;
    postJSON('/api/staff/request', {area: stash.area}, 15000)
      .then(() => { try { localStorage.removeItem(STAFF_REQUEST_STASH); } catch {} void reload(); })
      .catch(() => {/* surfaced when the request form below is used */});
  }, [account?.user?.emailVerified, account?.staff, reload]);
  async function requestStaff() {
    if (!staffAreaId) return;
    setStaffBusy(true);
    try {
      await postJSON('/api/staff/request', {area: staffAreaId}, 15000);
      try { localStorage.removeItem(STAFF_REQUEST_STASH); } catch {}
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the staff request.'); }
    finally { setStaffBusy(false); }
  }
  async function copyFeed() {
    if (!feed.url) return;
    try { await navigator.clipboard.writeText(feed.url); setFeedCopied(true); window.setTimeout(() => setFeedCopied(false), 2000); }
    catch { setError('Copying was blocked. Select the link and copy it by hand.'); }
  }
  async function signOut() {
    setBusy(true);
    // A full navigation discards the previous account's client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    try { await postJSON('/api/auth/sign-out', {}); window.location.assign('/'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign out.'); setBusy(false); }
  }
  useEffect(() => {
    if (!account?.user) return;
    let active = true;
    getJSON<{digestOptedIn?: boolean}>('/api/preferences', 15000)
      .then(data => { if (active) setDigest({loaded: true, optedIn: Boolean(data.digestOptedIn), busy: false}); })
      .catch(() => { if (active) setDigest({loaded: true, optedIn: false, busy: false}); });
    return () => { active = false; };
  }, [account?.user]);
  useEffect(() => {
    if (!account?.user) return;
    let active = true;
    getJSON<{url: string; webcal: string}>('/api/preferences/feed', 15000)
      .then(data => { if (active) setFeed({state: 'ready', url: data.url, webcal: data.webcal}); })
      .catch(() => { if (active) setFeed({state: 'error'}); });
    return () => { active = false; };
  }, [account?.user]);
  async function toggleDigest(optedIn: boolean) {
    setDigest(current => ({...current, busy: true}));
    try {
      await postJSON('/api/preferences/digest', {optedIn}, 15000);
      setDigest({loaded: true, optedIn, busy: false});
    } catch (err) {
      setDigest(current => ({...current, busy: false}));
      setError(err instanceof Error ? err.message : 'Could not update the email digest setting.');
    }
  }
  const [deleting, setDeleting] = useState(false), [confirmText, setConfirmText] = useState('');
  async function deleteAccount() {
    setBusy(true);
    try {
      await postJSON('/api/account/delete', {confirm: confirmText}, 20000);
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account.');
      setBusy(false);
    }
  }
  return <AccountShell><section className="account-card account-single"><span className="account-icon"><ShieldCheck size={28}/></span><div className="eyebrow">YOUR ACCOUNT</div><h1>Made for <span>you.</span></h1>
    {(accountError || error) && <p className="form-error" role="alert">{accountError || error}</p>}
    {!account && !accountError && <p role="status">Loading your account…</p>}
    {account?.user ? <><p className="account-email">{account.user.email}</p><span className="community-badge">{account.permissions.addListings ? 'Verified BYU email' : 'Email verification required'}</span><p className="account-description">Your saved events and filters belong to this account. Verified members can publish listings, add tags, and report issues.</p><div className="account-actions"><a className="primary-button" href="/listings/new"><Plus size={16}/> Add a listing</a>{account.permissions.reviewReports && <a className="outline-button" href="/moderation"><Flag size={16}/> Review reports</a>}<button className="outline-button" disabled={busy} onClick={signOut}><LogOut size={16}/> {busy ? 'Signing out…' : 'Sign out'}</button></div>
      <div className="account-digest">
        <div className="eyebrow">PUBLIC PROFILE</div>
        <p className="account-description">Saving an event adds you to its RSVP list so classmates can see who is going — your picture and first initial for everyone, your name and BYU email for signed-in members. You can hide yourself at any time.</p>
        <div className="profile-editor">
          <span className="profile-editor-avatar">{avatar.url ? <img src={avatar.url} alt="Your profile picture"/> : (account.user.name || account.user.email).charAt(0).toUpperCase()}</span>
          <div className="profile-editor-actions">
            <label className="outline-button">{avatar.busy ? 'Saving…' : avatar.url ? 'Change picture' : 'Add a picture'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={avatar.busy} onChange={e => onAvatarChange(e.target.files?.[0])}/></label>
            {avatar.url && <button className="outline-button" disabled={avatar.busy} onClick={() => void saveProfile({avatar: null})}>Remove picture</button>}
            <button className="outline-button" disabled={avatar.busy} onClick={() => void saveProfile({hidden: !avatar.hidden})}>{avatar.hidden ? 'Show me on RSVP lists' : 'Hide me from RSVP lists'}</button>
          </div>
        </div>
        {avatar.state === 'loading' && <p className="account-description" role="status">Loading your profile…</p>}
        {avatar.hidden && <span className="community-badge">Hidden from RSVP lists</span>}
      </div>
      <div className="account-digest">
        <div className="eyebrow">BYU PROFESSOR OR STAFF</div>
        {account.staff?.status === 'verified' ? <>
          <p className="account-description">Your account is verified for <strong>{account.staff.areaLabel}</strong>. Events you publish are labeled “BYU added event”, and you can correct any listing in your area — open it and choose Edit listing.</p>
          <span className="community-badge byu-badge"><GraduationCap size={12}/> Verified staff · {account.staff.areaLabel}</span>
        </> : account.staff?.status === 'pending' ? <>
          <p className="account-description">Your request for <strong>{account.staff.areaLabel}</strong> is waiting for an administrator to verify you. Until then your account works exactly like a student account.</p>
          <span className="community-badge">Verification pending</span>
        </> : account.staff?.status === 'denied' ? (
          <p className="account-description">Your last staff request was declined. If that seems wrong, reply from your BYU email to privacy@byucalendar.com.</p>
        ) : <>
          <p className="account-description">Professors and BYU staff can request verification: your published events are labeled “BYU added event” and you can correct listings in your area. Sign-up started this automatically if you checked the box there.</p>
          <div className="account-actions">
            <select aria-label="Staff area" value={staffAreaId} onChange={e => setStaffAreaId(e.target.value)} disabled={staffBusy} style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--line,#d8dce2)'}}>
              <option value="">Choose your area…</option>
              {STAFF_AREAS.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
            <button className="outline-button" disabled={!staffAreaId || staffBusy} onClick={requestStaff}>{staffBusy ? 'Sending…' : 'Request verification'}</button>
          </div>
        </>}
      </div>
      <div className="account-digest">
        <div className="eyebrow">DAILY EMAIL DIGEST</div>
        <p className="account-description">Once a morning between 7:00 and 10:00 AM Mountain Time, we email a summary of the events you saved for that day. It is off until you turn it on, and you can turn it off here or from any digest email.</p>
        <button className="outline-button" disabled={!digest.loaded || digest.busy} onClick={() => toggleDigest(!digest.optedIn)}>{digest.optedIn ? 'Turn off the daily digest' : 'Turn on the daily digest'}</button>
        {digest.loaded && digest.optedIn && <span className="community-badge">On</span>}
        {!digest.loaded && <p className="account-description" role="status">Checking your digest setting…</p>}
      </div>
      <div className="account-digest">
        <div className="eyebrow">CALENDAR SUBSCRIPTION</div>
        <p className="account-description">Add your saved events to Google Calendar, Apple Calendar, or Outlook once, and they stay current as the sources update. The link is personal: anyone who has it can read the events you saved, and events you unsave drop out on the next refresh.</p>
        {feed.state === 'ready' ? <>
          <code className="account-feed-url">{feed.url}</code>
          <div className="account-actions">
            <button className="outline-button" onClick={copyFeed}>{feedCopied ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy link</>}</button>
            <a className="outline-button" href={feed.webcal}>Open in my calendar app</a>
          </div>
        </> : <p className="account-description" role="status">{feed.state === 'error' ? 'Your personal link is unavailable right now. Reload the page to try again.' : 'Building your personal link…'}</p>}
      </div>
      <div className="account-digest">
        <div className="eyebrow">DELETE YOUR ACCOUNT</div>
        <p className="account-description">Permanently deletes your account and everything it owns on our servers: saved events and filters, digest setting, picks profile, and the listings, tags, and reports you published. This cannot be undone. Type DELETE to confirm.</p>
        {!deleting ? (
          <button className="outline-button" onClick={() => setDeleting(true)}>Delete my account…</button>
        ) : (
          <div className="account-actions">
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm account deletion" style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--line,#d8dce2)',minWidth:140}}/>
            <button className="outline-button" disabled={busy || confirmText !== 'DELETE'} onClick={deleteAccount}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
            <button className="outline-button" disabled={busy} onClick={() => {setDeleting(false); setConfirmText('');}}>Cancel</button>
          </div>
        )}
      </div></> : account && <><p className="account-description">Sign in with your BYU email to save events and contribute.</p><a className="primary-button" href="/signin?returnTo=/account">Sign in</a></>}
  </section></AccountShell>;
}
