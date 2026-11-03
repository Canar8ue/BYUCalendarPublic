'use client';
import {useCallback, useEffect, useState} from 'react';
import AccountShell from '../../account-shell';
import {getJSON, postJSON, useAccount} from '../../account-client';
import type {InboxEmail} from '../../types';

function shortDate(value: string) {
  return new Date(value).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
}

export default function ModeratorInboxPage() {
  const {account, error: accountError} = useAccount();
  const [emails, setEmails] = useState<InboxEmail[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [inboxAddress, setInboxAddress] = useState('privacy@byucalendar.com');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const data = await getJSON<{configured: boolean; inboxAddress: string; emails: InboxEmail[]}>('/api/emails');
      setConfigured(data.configured); setInboxAddress(data.inboxAddress); setEmails(data.emails); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the inbox.'); }
  }, []);
  useEffect(() => {
    if (!account?.permissions.reviewReports) return;
    let active = true;
    getJSON<{configured: boolean; inboxAddress: string; emails: InboxEmail[]}>('/api/emails')
      .then(data => { if (active) { setConfigured(data.configured); setInboxAddress(data.inboxAddress); setEmails(data.emails); } })
      .catch(() => { if (active) setError('Could not load the inbox.'); });
    return () => { active = false; };
  }, [account]);
  function openEmail(email: InboxEmail) {
    setOpenId(email.id); setReply(''); setNotice('');
    if (!email.readAt) {
      setEmails(list => list && list.map(item => item.id === email.id ? {...item, readAt: new Date().toISOString()} : item));
      postJSON('/api/emails/read', {id: email.id}).catch(() => {});
    }
  }
  async function send(email: InboxEmail) {
    setBusy(true); setError('');
    try {
      await postJSON('/api/emails/reply', {id: email.id, body: reply});
      setReply(''); setNotice('Reply sent from ' + inboxAddress + '.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'The reply could not be sent.'); }
    finally { setBusy(false); }
  }
  const opened = emails?.find(email => email.id === openId) || null;
  return <AccountShell><section className="account-card moderation-card">
    <div className="eyebrow">COMMUNITY CARE</div>
    <h1>Message <span>inbox.</span></h1>
    <p className="account-description">Mail sent to {inboxAddress} by privacy requests and community members. Replies go out from the same address; messages stay private to administrators.</p>
    <p className="moderator-nav"><a className="text-button" href="/moderation">Review reports</a><span aria-hidden>·</span><span className="moderator-nav-current">Message inbox</span><span aria-hidden>·</span><a className="text-button" href="/moderation/analytics">Usage analytics</a></p>
    {(accountError || error) && <p className="form-error" role="alert">{accountError || error}</p>}
    {!account && !accountError && <p>Loading your account…</p>}
    {account && !account.permissions.reviewReports && <p>This page is available to calendar administrators. <a className="text-button" href="/account">View your account</a></p>}
    {account?.permissions.reviewReports && (configured
      ? <>{emails === null ? <p>Loading messages…</p> : !emails.length ? <p>No messages yet. Anything sent to {inboxAddress} appears here.</p> : emails.map(email => <article className="inbox-thread" key={email.id}>
        <button type="button" className="inbox-item" aria-expanded={openId === email.id} onClick={() => openEmail(email)}>
          <span className="inbox-item-head">
            <b>{email.subject || '(no subject)'}</b>
            <span className="inbox-flags">{!email.readAt && <span className="community-badge inbox-unread">Unread</span>}{email.repliedAt && <span className="community-badge">Replied</span>}<small>{shortDate(email.receivedAt)}</small></span>
          </span>
          <span className="inbox-preview">{email.fromAddress}{email.preview ? ' — ' + email.preview : ''}</span>
        </button>
        {openId === email.id && opened && <div className="inbox-open">
          <div className="inbox-meta">From <b>{opened.fromAddress}</b> · {new Date(opened.receivedAt).toLocaleString()} · to {opened.toAddress}</div>
          <div className="inbox-body">{opened.bodyText || '(This message had no readable text content.)'}</div>
          {opened.replies.map(item => <div className="inbox-reply" key={item.id}>
            <div className="inbox-meta">Replied {shortDate(item.sentAt)} · {item.sentBy}</div>
            <div className="inbox-body inbox-body-reply">{item.bodyText}</div>
          </div>)}
          <label className="inbox-reply-label" htmlFor={'reply-' + opened.id}>Reply as {inboxAddress}</label>
          <textarea id={'reply-' + opened.id} className="inbox-compose" value={reply} maxLength={8000} rows={6}
            placeholder={'Write a reply to ' + opened.fromAddress + '…'} onChange={event => setReply(event.target.value)}/>
          <div className="account-actions">
            <button type="button" className="primary-button" disabled={busy || !reply.trim()} onClick={() => send(opened)}>{busy ? 'Sending…' : 'Send reply'}</button>
            <span className="form-help">Plain text only · sent through byucalendar.com</span>
          </div>
          {notice && <p className="account-notice" role="status">{notice}</p>}
        </div>}
      </article>)}</>
      : <p>The inbox is not connected yet. Connect the <b>byucalendar.com</b> domain in Resend (DNS records + receiving MX), create the <b>email.received</b> webhook pointing at <b>/api/emails/inbound</b>, and set <b>RESEND_INBOUND_SECRET</b> in the server <b>.env.accounts</b> file — see docs/ACCOUNTS.md.</p>)}
  </section></AccountShell>;
}
