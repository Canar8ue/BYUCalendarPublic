'use client';
import {useCallback, useEffect, useState} from 'react';
import AccountShell from '../account-shell';
import {postJSON, useAccount} from '../account-client';
import type {CampusEvent, ListingReport} from '../types';

type PendingListing = {id: string; createdAt: string; submitterEmail: string; submitterName: string; event: CampusEvent};
type HiddenListing = {id: string; title: string | null; location: string; community: boolean; updatedAt: string};
type CorrectedListing = {id: string; title: string | null; location: string | null; updatedAt: string};
type ModerationInventory = {pending: PendingListing[]; hidden: HiddenListing[]; overrides: CorrectedListing[]};
type StaffRequest = {userId: string; email: string; name: string; area: string; areaLabel: string; status: string; autoVerified: boolean; requestedAt: string; resolvedAt: string | null};

export default function ModerationPage() {
  const {account, error: accountError} = useAccount();
  const [reports, setReports] = useState<ListingReport[] | null>(null);
  const [inventory, setInventory] = useState<ModerationInventory | null>(null);
  const [staffRequests, setStaffRequests] = useState<StaffRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isModerator = Boolean(account?.permissions.reviewReports);
  const load = useCallback(async () => {
    try {
      const [reports, inventory, staff] = await Promise.all([
        fetch('/api/moderation/reports', {cache: 'no-store'}),
        fetch('/api/moderation/events', {cache: 'no-store'}),
        fetch('/api/moderation/staff', {cache: 'no-store'}),
      ]);
      if (!reports.ok) throw new Error('Reports could not be loaded.');
      setReports((await reports.json() as {reports: ListingReport[]}).reports);
      setInventory(inventory.ok ? await inventory.json() as ModerationInventory : {pending: [], hidden: [], overrides: []});
      setStaffRequests(staff.ok ? (await staff.json() as {requests: StaffRequest[]}).requests : []);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load reports.'); }
  }, []);
  useEffect(() => {
    if (!isModerator) return;
    let active = true;
    Promise.all([
      fetch('/api/moderation/reports', {cache: 'no-store'}).then(async r => { if (!r.ok) throw new Error('Reports could not be loaded.'); return r.json() as Promise<{reports: ListingReport[]}>; }),
      fetch('/api/moderation/events', {cache: 'no-store'}).then(r => r.ok ? r.json() as Promise<ModerationInventory> : Promise.resolve({pending: [], hidden: [], overrides: []} as ModerationInventory)),
      fetch('/api/moderation/staff', {cache: 'no-store'}).then(r => r.ok ? r.json() as Promise<{requests: StaffRequest[]}> : Promise.resolve({requests: []})),
    ]).then(([reportData, inventoryData, staffData]) => {
      if (active) { setReports(reportData.reports); setInventory(inventoryData); setStaffRequests(staffData.requests); }
    }).catch(() => { if (active) setError('Reports could not be loaded.'); });
    return () => { active = false; };
  }, [isModerator]);
  async function review(id: string, action: string) {
    setBusy(true); setError('');
    try { await postJSON('/api/moderation/reports', {id, action}); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not review this report.'); }
    finally { setBusy(false); }
  }
  // Source-listing moderation: approves/rejects pending submissions, restores
  // hidden listings, deletes community listings, and reverts stored corrections.
  async function moderate(body: {id: string; action: 'restore' | 'revert' | 'approve' | 'reject' | 'delete'}) {
    setBusy(true); setError('');
    try { await postJSON('/api/moderation/events', body); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update the listing.'); }
    finally { setBusy(false); }
  }
  // BYU professor/staff verification: approve grants the BYU added event label
  // and area edit rights; deny and revoke take them back.
  async function reviewStaff(userId: string, action: 'approve' | 'deny' | 'revoke') {
    setBusy(true); setError('');
    try { await postJSON('/api/moderation/staff', {userId, action}); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update the staff request.'); }
    finally { setBusy(false); }
  }
  return (
    <AccountShell>
      <section className="account-card moderation-card">
        <div className="eyebrow">COMMUNITY CARE</div>
        <h1>Review <span>reports.</span></h1>
        <p className="account-description">Private reports from verified members. Open reports appear first; up to 100 recent reports are shown.</p>
        <p className="moderator-nav"><span className="moderator-nav-current">Review Reports</span><span aria-hidden>·</span><a className="text-button" href="/moderation/emails">Message Inbox</a><span aria-hidden>·</span><a className="text-button" href="/moderation/analytics">Usage Analytics</a></p>
        {(accountError || error) && <p className="form-error" role="alert">{accountError || error}</p>}
        {!account && !accountError && <p>Loading your account…</p>}
        {account && !account.permissions.reviewReports && <p>This page is available to calendar administrators. <a className="text-button" href="/account">View Your Account</a></p>}
        {isModerator && inventory && <>
          <h2 className="analytics-section">Pending Event Submissions</h2>
          <p className="account-description">Listings submitted by students stay hidden until approved here. Verified BYU staff and admin listings publish immediately.</p>
          {!inventory.pending?.length
            ? <p>No submissions waiting for approval.</p>
            : inventory.pending.map(item => (
              <article className="report-card" key={'pending-' + item.id}>
                <div className="report-status"><span className="community-badge">Pending Approval</span><small>{new Date(item.createdAt).toLocaleDateString()} · {item.submitterName || item.submitterEmail || 'Student'}</small></div>
                <h2>{item.event.title}</h2>
                <p><b>{item.event.organizer || item.event.sourceName}</b> · {item.event.location} · {item.event.start}</p>
                <p className="description">{item.event.description}</p>
                <a className="text-button" href={item.event.url} target="_blank" rel="noreferrer">View Organizer Link ↗</a>
                <div className="account-actions">
                  <button disabled={busy} className="primary-button" onClick={() => moderate({id: item.id, action: 'approve'})}>Approve Listing</button>
                  <button disabled={busy} className="outline-button" onClick={() => moderate({id: item.id, action: 'reject'})}>Decline</button>
                  <button disabled={busy} className="outline-button" onClick={() => moderate({id: item.id, action: 'delete'})}>Delete</button>
                </div>
              </article>
            ))}
        </>}
        {isModerator && <>
          <h2 className="analytics-section">Event Reports</h2>
          {reports === null
            ? <p>Loading reports…</p>
            : reports.length === 0
              ? <p>No reports yet.</p>
              : reports.map(report => (
                <article className="report-card" key={report.id}>
                  <div className="report-status"><span className="community-badge">{report.status}</span><small>{new Date(report.createdAt).toLocaleDateString()}{report.hidden && ' · Listing hidden'}</small></div>
                  <h2>{report.event.title}</h2>
                  <p><b>{report.reason}</b></p>
                  <p className="description">{report.details}</p>
                  <a className="text-button" href={report.event.url} target="_blank" rel="noreferrer">View Original Listing ↗</a>
                  <div className="account-actions">
                    {report.status === 'open' && <button disabled={busy} className="outline-button" onClick={() => review(report.id, 'dismiss')}>Dismiss Report</button>}
                    <button disabled={busy} className="outline-button" onClick={() => review(report.id, report.hidden ? 'restore' : 'hide')}>{report.hidden ? 'Restore Listing' : 'Hide Listing'}</button>
                    <button disabled={busy} className="outline-button" onClick={() => review(report.id, 'clear-tags')}>Remove Community Tags</button>
                  </div>
                </article>
              ))}
        </>}
        {isModerator && staffRequests && <>
          <h2 className="analytics-section">BYU professor & staff verification.</h2>
          <p className="account-description">Requests from verified BYU members. Approving labels their events “BYU added event” and lets them correct listings in their area; addresses on the researched directory were verified automatically at sign-up. Confirm the person teaches or works in the area they named before approving.</p>
          {staffRequests.length === 0
            ? <p>No staff requests yet.</p>
            : staffRequests.map(request => (
              <article className="report-card" key={'staff-' + request.userId}>
                <div className="report-status">
                  <span className={'community-badge' + (request.status === 'verified' ? ' byu-badge' : '')}>{request.status === 'verified' ? 'verified' : request.status}{request.autoVerified ? ' · auto' : ''}</span>
                  <small>Requested {new Date(request.requestedAt).toLocaleDateString()}</small>
                </div>
                <h2>{request.name || request.email}</h2>
                <p><b>{request.email}</b></p>
                <p>Area: <b>{request.areaLabel}</b></p>
                <div className="account-actions">
                  {request.status !== 'verified' && <button disabled={busy} className="outline-button" onClick={() => reviewStaff(request.userId, 'approve')}>Approve</button>}
                  {request.status === 'pending' && <button disabled={busy} className="outline-button" onClick={() => reviewStaff(request.userId, 'deny')}>Deny</button>}
                  {request.status === 'verified' && <button disabled={busy} className="outline-button" onClick={() => reviewStaff(request.userId, 'revoke')}>Revoke</button>}
                </div>
              </article>
            ))}
        </>}
        {isModerator && inventory && <>
          <h2 className="analytics-section">Hidden and corrected listings.</h2>
          <p className="account-description">Source listings this team hid from BYU Calendar, and listings carrying a moderator correction. Restore or revert takes effect immediately; community deletions are permanent and leave nothing here.</p>
          {inventory.hidden.length === 0 && inventory.overrides.length === 0
            ? <p>No hidden or corrected listings right now.</p>
            : <>
              {inventory.hidden.map(row => (
                <article className="report-card" key={'hidden-' + row.id}>
                  <div className="report-status"><span className="community-badge">hidden</span><small>{new Date(row.updatedAt).toLocaleDateString()}{row.community ? ' · community listing' : ' · source listing'}</small></div>
                  <h2>{row.title || row.id}</h2>
                  {row.location && <p><b>{row.location}</b></p>}
                  <div className="account-actions"><button disabled={busy} className="outline-button" onClick={() => moderate({id: row.id, action: 'restore'})}>Restore listing</button></div>
                </article>
              ))}
              {inventory.overrides.map(row => (
                <article className="report-card" key={'override-' + row.id}>
                  <div className="report-status"><span className="community-badge">corrected</span><small>{new Date(row.updatedAt).toLocaleDateString()} · source listing</small></div>
                  <h2>{row.title || row.id}</h2>
                  {row.location !== null && <p><b>Corrected location: {row.location || '(cleared)'}</b></p>}
                  <div className="account-actions"><button disabled={busy} className="outline-button" onClick={() => moderate({id: row.id, action: 'revert'})}>Revert correction</button></div>
                </article>
              ))}
            </>}
        </>}
      </section>
    </AccountShell>
  );
}
