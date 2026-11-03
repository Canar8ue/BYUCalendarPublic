'use client';
import {Suspense, useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowRight, Mail, KeyRound, ShieldCheck, Bookmark, Tags, Flag, Plus, CheckCircle2} from 'lucide-react';
import AccountShell from '../account-shell';
import {postJSON, useAccount} from '../account-client';
import {normalizeBYUEmail, safeReturnTo} from '../../lib/account-policy.mjs';
import {STAFF_AREAS} from '../../lib/staff.mjs';

const STAFF_REQUEST_STASH = 'byucalendar-staff-request';

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';
const HEADINGS: Record<Mode, string> = {signin: 'Welcome back.', signup: 'Create your account.', verify: 'Check your BYU inbox.', forgot: 'Reset your password.', reset: 'Set a new password.'};

function SignInContent() {
  const {account, error: accountError, reload} = useAccount();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [code, setCode] = useState('');
  // Professor/staff sign-up: the request itself needs a verified session, so the
  // choice is stashed in localStorage and sent right after the verification code
  // succeeds. The stash seeds the initial state, so reopening the tab restores
  // the half-finished staff sign-up without an effect.
  const stash = typeof window === 'undefined' ? null : (() => { try { return JSON.parse(localStorage.getItem(STAFF_REQUEST_STASH) || 'null'); } catch { return null; } })();
  const [staff, setStaff] = useState(Boolean(stash?.area)), [staffAreaId, setStaffAreaId] = useState(stash?.area || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sendStaffRequest = async () => {
    let stash: {area?: string} | null = null;
    try { stash = JSON.parse(localStorage.getItem(STAFF_REQUEST_STASH) || 'null'); } catch { stash = null; }
    if (!stash?.area) return;
    try {
      await postJSON('/api/staff/request', {area: stash.area});
      localStorage.removeItem(STAFF_REQUEST_STASH);
    } catch { /* the account page retries and surfaces the state there */ }
  };
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function goVerify(toEmail: string, message: string) { setMode('verify'); setCode(''); setError(''); setNotice(message); setCooldown(60); }
  async function resendVerification() {
    setBusy(true); setError('');
    try { await postJSON('/api/auth/email-otp/send-verification-otp', {email, type: 'email-verification'}); setNotice(`We sent a new code to ${email}.`); setCooldown(60); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send a code.'); }
    finally { setBusy(false); }
  }

  async function submitSignIn() {
    const normalized = normalizeBYUEmail(email);
    if (!normalized) { setError('Use your @byu.edu or @student.byu.edu email address.'); return; }
    setBusy(true); setError(''); setNotice(''); setEmail(normalized);
    try {
      await postJSON('/api/auth/sign-in/email', {email: normalized, password});
      window.location.assign(returnTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sign you in.';
      if (/not verified/i.test(message)) {
        // The account exists but its email was never verified; a code is the way in.
        try { await postJSON('/api/auth/email-otp/send-verification-otp', {email: normalized, type: 'email-verification'}); goVerify(normalized, `We sent a verification code to ${normalized}.`); }
        catch (sendErr) { goVerify(normalized, sendErr instanceof Error ? sendErr.message : 'Could not send a code.'); }
      } else if (message === 'Invalid email or password') {
        // No account answers that email yet: carry the email and password into
        // sign-up instead of dead-ending. (If the account does exist and the
        // password was wrong, sign-up bounces back here with a clear notice.)
        setConfirm(''); setNotice(`No account found for ${normalized} yet — create one below.`);
        setMode('signup'); setError('');
      } else setError(message);
    } finally { setBusy(false); }
  }
  async function submitSignUp() {
    const normalized = normalizeBYUEmail(email);
    if (!normalized) { setError('Use your @byu.edu or @student.byu.edu email address.'); return; }
    if (password.length < 8) { setError('Your password needs at least 8 characters.'); return; }
    if (password !== confirm) { setError('Those passwords do not match.'); return; }
    setBusy(true); setError(''); setNotice(''); setEmail(normalized);
    try {
      await postJSON('/api/auth/sign-up/email', {name: name.trim(), email: normalized, password});
      if (staff && staffAreaId) { try { localStorage.setItem(STAFF_REQUEST_STASH, JSON.stringify({area: staffAreaId})); } catch { /* retried from the account page */ } }
      goVerify(normalized, `We sent a six-digit code to ${normalized}. Enter it below to finish creating your account.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create your account.';
      // A delivery failure can land after the account exists; the verify step's
      // resend recovers it, so still move there instead of blocking sign-up.
      if (/could not send|not available/i.test(message)) goVerify(normalized, message);
      else if (/already (?:exists|registered|has an account)|user already/i.test(message)) {
        // The sign-in handoff sent a visitor here whose account exists after all.
        setNotice('That email already has an account — sign in with its password, or reset it below.'); setMode('signin'); setConfirm(''); setError('');
      }
      else setError(message);
    } finally { setBusy(false); }
  }
  async function submitVerify() {
    setBusy(true); setError('');
    try {
      await postJSON('/api/auth/email-otp/verify-email', {email, otp: code});
      await sendStaffRequest(); // verification created the session the request needs
      window.location.assign(returnTo);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not verify your code.'); setBusy(false); }
  }
  async function submitForgot() {
    const normalized = normalizeBYUEmail(email);
    if (!normalized) { setError('Use your @byu.edu or @student.byu.edu email address.'); return; }
    setBusy(true); setError(''); setNotice(''); setEmail(normalized);
    try {
      await postJSON('/api/auth/email-otp/request-password-reset', {email: normalized});
      setMode('reset'); setCode(''); setNotice(`If ${normalized} has an account, we sent a reset code to it.`); setCooldown(60);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send a reset code.'); }
    finally { setBusy(false); }
  }
  async function submitReset() {
    if (password.length < 8) { setError('Your new password needs at least 8 characters.'); return; }
    if (password !== confirm) { setError('Those passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await postJSON('/api/auth/email-otp/reset-password', {email, otp: code, password});
      try { await postJSON('/api/auth/sign-in/email', {email, password}); window.location.assign(returnTo); }
      catch { setNotice('Your password is updated. Sign in with it below.'); setPassword(''); setConfirm(''); setMode('signin'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reset your password.'); }
    finally { setBusy(false); }
  }

  const submitting = busy;
  async function onSubmit() {
    if (submitting) return;
    if (mode === 'signin') await submitSignIn();
    else if (mode === 'signup') await submitSignUp();
    else if (mode === 'verify') await submitVerify();
    else if (mode === 'forgot') await submitForgot();
    else await submitReset();
  }
  const buttonLabel = {signin: 'Sign in', signup: 'Create account', verify: 'Verify & sign in', forgot: 'Email me a reset code', reset: 'Set new password'}[mode];
  const canSubmit = account?.emailReady && !submitting && (
    (mode === 'signin' && email && password) ||
    (mode === 'signup' && name.trim() && email && password && confirm) ||
    (mode === 'verify' && code.length === 6) ||
    (mode === 'forgot' && email) ||
    (mode === 'reset' && code.length === 6 && password && confirm));

  return <AccountShell><section className="signin-layout"><div className="signin-story"><div className="eyebrow">YOUR CAMPUS. YOUR COMMUNITY.</div><h1>A little more<br/>{' '}<span>connected.</span></h1><p>Your BYU email opens up a calendar you can help make better.</p><ul className="account-benefits"><li><Bookmark/>Keep your favorite events together.</li><li><Plus/>Share a listing with campus.</li><li><Tags/>Add helpful tags to events.</li><li><Flag/>Report details that need attention.</li></ul><div className="account-stamp"><ShieldCheck size={22}/><span>FOR THE BYU COMMUNITY<small>Create an account with your BYU email.</small></span></div></div>
    <div className="account-card"><span className="account-icon">{mode === 'verify' || mode === 'forgot' ? <Mail size={27}/> : <KeyRound size={27}/>}</span><h2>{account?.permissions.addListings ? 'You’re signed in.' : HEADINGS[mode]}</h2>
      {account?.permissions.addListings ? <><p className="account-description">Signed in as <strong>{account.user?.email}</strong>.</p><a className="primary-button" href={returnTo}>Continue to calendar <ArrowRight size={16}/></a></> : <>
        <p className="account-description">{mode === 'verify' ? `We sent a six-digit code to ${email}. Enter it below to verify your email and finish signing in.` : mode === 'reset' ? `Enter the reset code we emailed to ${email} and choose a new password.` : mode === 'forgot' ? 'We’ll email a reset code to your BYU address.' : mode === 'signup' ? 'Make an account with your BYU email and a password. We’ll email a code to verify it’s really you.' : 'Sign in with your BYU email and password.'}</p>
        {!account && !accountError && <p role="status">Loading sign-in options…</p>}
        {accountError && <div className="form-error" role="alert">{accountError} <button className="text-button" onClick={reload}>Try again</button></div>}
        {account && !account.emailReady && <div className="account-notice" role="status"><b>Accounts are coming soon.</b><p>You can browse the calendar now. Creating an account and contributing will open once email delivery is available.</p></div>}
        <form className="community-form" onSubmit={event => {event.preventDefault(); void onSubmit();}}>
          {mode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="Jordan" maxLength={80} required disabled={submitting} autoComplete="name"/><small>Shown only to you — never on public listings.</small></label>}
          {mode === 'signup' && <div className="form-checkbox staff-signup-toggle">
            <input type="checkbox" id="staff-signup" checked={staff} onChange={e => setStaff(e.target.checked)} disabled={submitting}/>
            <label htmlFor="staff-signup">I am a professor or BYU staff member</label>
          </div>}
          {mode === 'signup' && staff && <label>My field
            <select value={staffAreaId} onChange={e => setStaffAreaId(e.target.value)} required disabled={submitting}>
              <option value="" disabled>Choose your area</option>
              {STAFF_AREAS.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
            <small>Staff accounts start with student powers; an administrator verifies them before BYU events you add are labeled “BYU added event” and you can edit listings in your area.</small>
          </label>}
          {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && <label>BYU email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@student.byu.edu" maxLength={254} required disabled={submitting}/><small>@byu.edu and @student.byu.edu</small></label>}
          {mode === 'verify' && <label>Verification code<input autoFocus aria-label="Verification code" className="otp-input" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required/><small>The code expires in 10 minutes. Use the newest code if you request another.</small></label>}
          {(mode === 'signin' || mode === 'signup' || mode === 'reset') && <label>{mode === 'reset' ? 'New password' : 'Password'}<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} required disabled={submitting}/>{mode !== 'signin' && <small>At least 8 characters.</small>}</label>}
          {((mode === 'signup' && password) || mode === 'reset') && <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} maxLength={128} required disabled={submitting}/><small>At least 8 characters.</small></label>}
          {mode === 'reset' && <><label>Reset code<input autoFocus aria-label="Reset code" className="otp-input" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required/><small>The code expires in 10 minutes. Use the newest code if you request another.</small></label></>}
          {notice && <p className="form-help" role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={!canSubmit}>{submitting ? 'Just a moment…' : buttonLabel}<ArrowRight size={16}/></button>
        </form>
        <div className="signin-secondary">
          {mode === 'signin' && <><button className="text-button" disabled={submitting} onClick={() => {setMode('forgot'); setError(''); setNotice(''); setPassword('');}}>Forgot password?</button><button className="text-button" disabled={submitting} onClick={() => {setMode('signup'); setError(''); setNotice('');}}>New here? Create an account</button></>}
          {mode === 'signup' && <><span></span><button className="text-button" disabled={submitting} onClick={() => {setMode('signin'); setError(''); setNotice(''); setPassword(''); setConfirm('');}}>Already have an account? Sign in</button></>}
          {mode === 'verify' && <><button className="text-button" disabled={submitting || cooldown > 0} onClick={() => void resendVerification()}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button><button className="text-button" disabled={submitting} onClick={() => {setMode('signin'); setError(''); setNotice(''); setCode('');}}>Use a different account</button></>}
          {mode === 'forgot' && <><span></span><button className="text-button" disabled={submitting} onClick={() => {setMode('signin'); setError(''); setNotice('');}}>Back to sign in</button></>}
          {mode === 'reset' && <><button className="text-button" disabled={submitting || cooldown > 0} onClick={() => void submitForgot()}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button><button className="text-button" disabled={submitting} onClick={() => {setMode('signin'); setError(''); setNotice(''); setCode(''); setPassword(''); setConfirm('');}}>Back to sign in</button></>}
        </div>
        <p className="account-fineprint"><ShieldCheck size={15}/> Your email is used for your account and is never displayed on public listings. See our <Link prefetch={false} href="/privacy">privacy policy</Link>.</p>
      </>}
      <Link prefetch={false} className="browse-link" href="/">Keep exploring events <ArrowRight size={14}/></Link>
    </div></section><p className="account-bottom-note"><CheckCircle2 size={15}/> A verified email confirms access to your BYU inbox.</p></AccountShell>;
}

export default function SignInPage() {
  return <Suspense fallback={<AccountShell><p>Loading sign-in options…</p></AccountShell>}><SignInContent/></Suspense>;
}
