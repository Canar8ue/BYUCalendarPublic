import type {Metadata} from 'next';
import {CheckCircle2, Ban} from 'lucide-react';
import AccountShell from '../account-shell';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What BYU Calendar collects, how usage analytics are used, and your privacy rights in Utah. We never sell personal data or run ads.',
  alternates: {canonical: '/privacy'},
};

const CONTACT = 'privacy@byucalendar.com';

function Section({index, title, children}: {index: string; title: string; children: React.ReactNode}) {
  return <section className="policy-section"><span className="policy-kicker">{index}</span><h2>{title}</h2>{children}</section>;
}

export default function PrivacyPolicyPage() {
  return <AccountShell><div className="account-single policy-page">
    <div className="policy-head">
      <div className="eyebrow">PRIVACY</div>
      <h1>Privacy Policy<span>.</span></h1>
      <p className="policy-effective">EFFECTIVE NOVEMBER 19, 2026 · BYUCALENDAR.COM</p>
    </div>

    <div className="policy-summary">
      <b>The short version</b>
      <ul>
        <li><CheckCircle2 size={15}/>We collect only what the site needs: your name and BYU email if you create an account, what you save or publish, and basic cookieless usage analytics.</li>
        <li><CheckCircle2 size={15}/>We never sell your data, run ads, or track you across other websites.</li>
        <li><CheckCircle2 size={15}/>Public RSVP visibility is opt-in (off by default) and never exposes member email addresses.</li>
        <li><CheckCircle2 size={15}/>Questions or a data request? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</li>
      </ul>
    </div>

    <Section index="01 · ABOUT THIS SITE" title="What this is">
      <p>BYU Calendar (byucalendar.com) is an independent student project operated by Mesa Assembly LLC. It gathers publicly published BYU events into one searchable place, is not an official Brigham Young University service, and is not affiliated with or endorsed by BYU.</p>
      <p>We describe your privacy rights below in line with applicable US state privacy laws (including Utah, California, Colorado, Connecticut, Virginia, and Texas) and apply those rights to everyone regardless of where you browse from.</p>
    </Section>

    <Section index="02 · WHAT WE COLLECT" title="Data we handle">
      <ul className="policy-list dots">
        <li><span><b>Account details.</b> If you create an account: your name, your BYU email address, and a hashed version of your password — never the password itself. A signed HttpOnly session cookie keeps you signed in, and each signed-in session records IP address and user agent for security review.</span></li>
        <li><span><b>Staff matching &amp; verification.</b> Staff accounts match against an internal BYU department directory; pending requests are reviewed by site moderators.</span></li>
        <li><span><b>Your saved items &amp; opt-in RSVP presence.</b> Bookmarked events and saved searches are tied to your account. Public RSVP visibility is <b>off by default</b>; only members who explicitly enable public RSVP visibility appear in an event&apos;s RSVP list (first initial + optional avatar to visitors; display name only to signed-in members — member emails are never shown in RSVP responses).</span></li>
        <li><span><b>Your contributions.</b> Listings and tags you publish are public, while moderator reports remain private to site administrators.</span></li>
        <li><span><b>Your personal picks &amp; browser storage.</b> If you use the picks chat or tour, answers shape your account&apos;s interest list, and browser storage retains lightweight UI preferences (<code>byucalendar-staff-request</code>, <code>byucalendar-tour-v1-*</code>, and session key <code>byu-cal-launched</code>). Deleting your account removes server profile data.</span></li>
        <li><span><b>Cookieless analytics &amp; server logs.</b> Aggregate page/event counts without cookies, names, emails, or IP addresses (pruned after 180 days), plus standard temporary security request logs.</span></li>
      </ul>
      <p>You can browse the entire calendar, search, and download events without an account and without signing in.</p>
    </Section>

    <Section index="03 · ANALYTICS" title="How we measure usage">
      <p>We use analytics to answer simple questions: which events and features are people actually looking for? The measurements are built-in aggregate usage counts — cookieless, free of names, emails, and IP addresses, and pruned after 180 days. They are not used to build advertising profiles, and they are never sold.</p>
      <p>We do not use analytics to follow you to other websites or apps, and we do not combine analytics with advertising networks.</p>
    </Section>

    <Section index="04 · WHAT WE NEVER DO" title="Hard limits">
      <ul className="policy-list never">
        <li><Ban size={15}/>Sell or rent personal data to anyone.</li>
        <li><Ban size={15}/>Run advertising or ad-network tracking on this site.</li>
        <li><Ban size={15}/>Track you across other websites or apps.</li>
        <li><Ban size={15}/>Display your name or email next to anything you publish.</li>
      </ul>
    </Section>

    <Section index="05 · SHARING" title="Who receives data">
      <p>Only the services required to run the site:</p>
      <ul className="policy-list dots">
        <li><span><b>Hosting and network.</b> Our hosting provider and Cloudflare (DNS and site delivery) handle traffic to the site.</span></li>
        <li><span><b>Email delivery &amp; moderation inbox.</b> Resend delivers verification emails, password resets, opt-in daily digest emails, and replies sent by site moderators when you write to our privacy/contact inbox.</span></li>
        <li><span><b>AI assistance.</b> Zero-match smart-search queries and your picks-chat selections/free-text responses are sent to our configured AI provider (currently DeepSeek by default when enabled via <code>SEARCH_ASSIST_BASE_URL</code>) solely to phrase follow-up questions or search filters; account emails, passwords, and member lists are never sent.</span></li>
        <li><span><b>Typography.</b> Google Fonts serves the site&apos;s fonts; your browser requests them directly.</span></li>
        <li><span><b>Analytics.</b> Measured in-house by the cookieless system described above — no third-party analytics service receives this data.</span></li>
      </ul>
      <p>We may also disclose information when the law requires it. We do not otherwise share personal data.</p>
    </Section>

    <Section index="06 · COOKIES" title="Cookies and storage">
      <p>One essential cookie keeps you signed in; without it, accounts and saved events could not work. We do not use advertising or cross-site tracking cookies, and the calendar itself works fully without any cookie.</p>
    </Section>

    <Section index="07 · RETENTION" title="Data retention and security">
      <p>Account data is kept while your account is active; deletion requests remove it. Listings and tags stay until their author or an administrator removes them. Analytics rows expire automatically after 180 days, and server logs are kept only for a limited period. Passwords are stored only as hashes, resetting a password signs out every session, and all traffic is encrypted with HTTPS.</p>
    </Section>

    <Section index="08 · YOUR RIGHTS" title="Your privacy rights &amp; Do Not Track">
      <p>If you reside in Utah, California, Colorado, Connecticut, Virginia, Texas, or another applicable jurisdiction (and for every visitor), you may ask us to:</p>
      <ul className="policy-list dots">
        <li><span>Confirm what personal data we have about you and receive a copy in a portable format, or request correction.</span></li>
        <li><span>Delete your personal data.</span></li>
        <li><span>Opt out of targeted advertising, the sale of personal data, or profiling for major decisions — we do none of these, so there is nothing to opt out of.</span></li>
      </ul>
      <p><b>CalOPPA Do Not Track:</b> Because BYU Calendar never tracks users across third-party websites or apps, site behavior does not vary based on browser Do Not Track signals.</p>
      <p>Email <a className="policy-contact" href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within 45 days. If we decline a request, you can appeal by replying to our answer, and we will take a fresh look.</p>
    </Section>

    <Section index="09 · CHILDREN" title="Children">
      <p>This site is built for the BYU community, and accounts require a university email address. We do not knowingly collect personal data from children under 13.</p>
    </Section>

    <Section index="10 · CHANGES" title="Changes to this policy">
      <p>If we change this policy, we will post the new version on this page with an updated effective date.</p>
    </Section>

    <Section index="11 · CONTACT" title="Contact us">
      <p>Mesa Assembly LLC (BYU Calendar), 327 West Harvest Moon Drive, Saratoga Springs, UT 84045. Privacy questions, access requests, or deletions: <a className="policy-contact" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </Section>
  </div></AccountShell>;
}
