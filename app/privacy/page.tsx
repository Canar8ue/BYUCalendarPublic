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
      <p className="policy-effective">EFFECTIVE SEPTEMBER 28, 2026 · BYUCALENDAR.COM</p>
    </div>

    <div className="policy-summary">
      <b>The short version</b>
      <ul>
        <li><CheckCircle2 size={15}/>We collect only what the site needs: your name and BYU email if you create an account, what you save or publish, and basic usage analytics.</li>
        <li><CheckCircle2 size={15}/>We never sell your data, run ads, or track you across other websites.</li>
        <li><CheckCircle2 size={15}/>Public listings never show who submitted them.</li>
        <li><CheckCircle2 size={15}/>Questions or a data request? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</li>
      </ul>
    </div>

    <Section index="01 · ABOUT THIS SITE" title="What this is">
      <p>BYU Calendar (byucalendar.com) is an independent student project that gathers publicly published BYU events into one searchable place. It is not an official Brigham Young University service and is not affiliated with or endorsed by BYU.</p>
      <p>We serve a Utah audience and describe your rights below in line with the Utah Consumer Privacy Act. We apply those rights to everyone, regardless of where you browse from.</p>
    </Section>

    <Section index="02 · WHAT WE COLLECT" title="Data we handle">
      <ul className="policy-list dots">
        <li><span><b>Account details.</b> If you create an account: your name, your BYU email address, and a hashed version of your password — never the password itself. A signed session cookie keeps you signed in, and for security each signed-in session also records the IP address and browser type it was created from, so suspicious sessions can be reviewed and ended. Signing out everywhere removes those session records.</span></li>
        <li><span><b>Your saved items.</b> Bookmarked events and saved searches, tied to your account. The daily digest email is off until you turn it on from your account settings; you can turn it off there or from any digest email.</span></li>
        <li><span><b>Your public RSVP presence.</b> Saving an event adds you to its RSVP list so other members can see who is going. Everyone sees your optional profile picture and your first initial; signed-in members also see your name and BYU email when they hover. You can hide yourself from every RSVP list at any time from your account page, and removing the save removes you from that list.</span></li>
        <li><span><b>Your contributions.</b> Listings and tags you publish are public but shown without your name or email. Reports you submit are private and visible only to site administrators.</span></li>
        <li><span><b>Your personal picks.</b> If you use the picks chat, your typed or tapped answers become a short interest list on your account. While you are signed in, the events you open, save, share, or map feed anonymous interest counters (categories and tags with a fading score — never which specific events you viewed) that shape the suggested events on My calendar. Tuning your picks clears that interest list and the counters before rebuilding them from your new answers. Deleting your account removes all of it.</span></li>
        <li><span><b>Usage analytics.</b> How the site is used — pages and events viewed, searches, exports, approximate region, browser and device type, and the site that sent you here. These are aggregate counts built in-house: analytics use no cookies, never record your name, email, or IP address, and are kept for 180 days. We use them to decide what to improve.</span></li>
        <li><span><b>Server logs.</b> Standard request logs (IP address, time, requested page) kept for security and reliability.</span></li>
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
        <li><span><b>Email delivery.</b> Resend sends verification and password-reset emails to your address.</span></li>
        <li><span><b>AI assistance.</b> Smart-search phrases and the picks-chat question wording are sent to our configured AI provider for interpretation; no account data or event inventories go along. Everything else — matching, profiles, and picks — is computed on our servers.</span></li>
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

    <Section index="08 · YOUR RIGHTS" title="Your rights in Utah">
      <p>If you are a Utah resident, you may ask us to:</p>
      <ul className="policy-list dots">
        <li><span>Confirm what personal data we have about you and receive a copy in a portable format.</span></li>
        <li><span>Delete your personal data.</span></li>
        <li><span>Opt out of targeted advertising, the sale of personal data, or profiling for major decisions — we do none of these, so there is nothing to opt out of.</span></li>
      </ul>
      <p>Email <a className="policy-contact" href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within 45 days. If we decline a request, you can appeal by replying to our answer, and we will take a fresh look.</p>
    </Section>

    <Section index="09 · CHILDREN" title="Children">
      <p>This site is built for the BYU community, and accounts require a university email address. We do not knowingly collect personal data from children under 13.</p>
    </Section>

    <Section index="10 · CHANGES" title="Changes to this policy">
      <p>If we change this policy, we will post the new version on this page with an updated effective date.</p>
    </Section>

    <Section index="11 · CONTACT" title="Contact us">
      <p>Privacy questions, access requests, or deletions: <a className="policy-contact" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
    </Section>
  </div></AccountShell>;
}
