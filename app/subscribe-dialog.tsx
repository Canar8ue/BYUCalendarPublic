'use client';
import {useEffect, useState} from 'react';
import {ArrowUpRight, CalendarDays, CalendarPlus, Check, Copy, LoaderCircle, Mail, Sparkles} from 'lucide-react';
import {getJSON} from './account-client';

// The live-subscription dialog. It hands out two links: the filters currently
// on screen (works signed out, shareable) and, when a member is signed in, the
// personal saved-events feed. Copying is the primary action because pasting a
// URL is what every calendar app actually asks for.
type Props = {filterSummary: string; feedPath: string; signedIn: boolean};
type Personal = {state: 'idle' | 'loading' | 'ready' | 'error'; url?: string; webcal?: string};

function webcal(url: string) {
  return url.replace(/^https?:\/\//, 'webcal://');
}

export default function SubscribeDialog({filterSummary, feedPath, signedIn}: Props) {
  const [copied, setCopied] = useState<'' | 'filter' | 'saved'>('');
  const [copyError, setCopyError] = useState('');
  const [showAppsFor, setShowAppsFor] = useState<'' | 'filter' | 'saved'>('');
  const [personal, setPersonal] = useState<Personal>({state: signedIn ? 'loading' : 'idle'});

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    getJSON<{url: string; webcal: string}>('/api/preferences/feed', 15000)
      .then(data => { if (active) setPersonal({state: 'ready', url: data.url, webcal: data.webcal}); })
      .catch(() => { if (active) setPersonal({state: 'error'}); });
    return () => { active = false; };
  }, [signedIn]);

  // Rendered only after the dialog opens, so the origin is always available.
  const filterUrl = typeof window === 'undefined' ? '' : window.location.origin + feedPath;
  const personalUrl = personal.state === 'ready' ? personal.url || '' : '';

  async function copyUrl(url: string, which: 'filter' | 'saved') {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      window.setTimeout(() => setCopied(''), 2200);
    } catch {
      setCopyError('Copying was blocked. Select the link and copy it by hand.');
    }
  }

  return <div className="subscribe-dialog">
    <span className="empty-icon"><CalendarPlus size={28}/></span>
    <h2>Put this calendar in your calendar.</h2>
    <p className="modal-intro">Add it once and your calendar app keeps it current on its own — new events, moved times, and cancellations appear without opening this site.</p>

    <section className="subscribe-block">
      <p className="section-label">WHAT YOU ARE LOOKING AT</p>
      <p className="subscribe-summary">{filterSummary || 'All Events'}</p>
      <code className="subscribe-url">{filterUrl || 'Loading the link…'}</code>
      <div className="subscribe-actions">
        <button type="button" className="primary-button" disabled={!filterUrl} onClick={() => copyUrl(filterUrl, 'filter')}>
          {copied === 'filter' ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy Feed Link</>}
        </button>
        {filterUrl && <button type="button" className="outline-button" aria-expanded={showAppsFor === 'filter'} onClick={() => setShowAppsFor(current => current === 'filter' ? '' : 'filter')}>Open in My Calendar App</button>}
      </div>
      {filterUrl && showAppsFor === 'filter' && <div className="calendar-options account-sync-options">
        <a className="calendar-option" href={'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal(filterUrl))} target="_blank" rel="noreferrer"><span className="calendar-option-mark google"><CalendarDays size={19}/></span><span><b>Google Calendar</b><small>Subscribe via your calendar feed URL.</small></span><ArrowUpRight size={16}/></a>
        <a className="calendar-option" href={'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(filterUrl) + '&name=' + encodeURIComponent('BYU Calendar')} target="_blank" rel="noreferrer"><span className="calendar-option-mark outlook"><Mail size={19}/></span><span><b>Outlook</b><small>Subscribe from web in Outlook.</small></span><ArrowUpRight size={16}/></a>
        <a className="calendar-option" href={webcal(filterUrl)}><span className="calendar-option-mark apple"><CalendarPlus size={19}/></span><span><b>Apple Calendar / Default App</b><small>Opens your device&rsquo;s calendar subscription prompt.</small></span><ArrowUpRight size={16}/></a>
      </div>}
      <p className="subscribe-hint">This link follows the filters on screen. Change the filters and copy a new link, or clear them to include everything.</p>
    </section>

    {signedIn && <section className="subscribe-block">
      <p className="section-label">JUST YOUR SAVED EVENTS</p>
      {personal.state === 'loading' && <p className="subscribe-hint"><LoaderCircle className="spin" size={15}/> Building your personal link…</p>}
      {personal.state === 'error' && <p className="subscribe-hint">Your personal link is unavailable right now. The filtered link above still works.</p>}
      {personal.state === 'ready' && personal.webcal && <>
        <p className="subscribe-summary"><Sparkles size={13}/> Everything you save, kept up to date in your own calendar.</p>
        <code className="subscribe-url">{personalUrl}</code>
        <div className="subscribe-actions">
          <button type="button" className="primary-button" onClick={() => copyUrl(personalUrl, 'saved')}>
            {copied === 'saved' ? <><Check size={16}/> Copied</> : <><Copy size={16}/> Copy Personal Link</>}
          </button>
          <button type="button" className="outline-button" aria-expanded={showAppsFor === 'saved'} onClick={() => setShowAppsFor(current => current === 'saved' ? '' : 'saved')}>Open in My Calendar App</button>
        </div>
        {showAppsFor === 'saved' && <div className="calendar-options account-sync-options">
          <a className="calendar-option" href={'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(personal.webcal)} target="_blank" rel="noreferrer"><span className="calendar-option-mark google"><CalendarDays size={19}/></span><span><b>Google Calendar</b><small>Subscribe via your personal calendar sync URL.</small></span><ArrowUpRight size={16}/></a>
          <a className="calendar-option" href={'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(personalUrl) + '&name=' + encodeURIComponent('BYU Calendar')} target="_blank" rel="noreferrer"><span className="calendar-option-mark outlook"><Mail size={19}/></span><span><b>Outlook</b><small>Subscribe from web in Outlook with your personal sync URL.</small></span><ArrowUpRight size={16}/></a>
          <a className="calendar-option" href={personal.webcal}><span className="calendar-option-mark apple"><CalendarPlus size={19}/></span><span><b>Apple Calendar / Default App</b><small>Opens your device&rsquo;s calendar subscription prompt.</small></span><ArrowUpRight size={16}/></a>
        </div>}
        <p className="subscribe-hint">This link is personal: anyone who has it can read the events you saved. Events you unsave drop out on the next refresh.</p>
      </>}
    </section>}

    {copyError && <p className="form-error" role="alert">{copyError}</p>}

    <section className="subscribe-help">
      <b>Adding it by hand</b>
      <p><span>Google Calendar</span> Other calendars → + → From URL, then paste.</p>
      <p><span>Apple Calendar</span> File → New Calendar Subscription, then paste.</p>
      <p><span>Outlook</span> Add calendar → Subscribe from web, then paste.</p>
    </section>

    <p className="subscribe-note">Added calendars refresh on the app&rsquo;s own schedule, usually every few hours. Need a one-time copy instead? Close this and use <b>Export These Events</b> under the calendar.</p>
  </div>;
}
