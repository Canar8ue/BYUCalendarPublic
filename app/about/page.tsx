import type {Metadata} from 'next';
import {jsonLdText} from '../../lib/event-presentation.mjs';
import {TEAM} from '../../lib/site-info.mjs';
import AboutCanvas from './about-canvas';

const description = 'Meet the BYU students behind BYU Calendar — Jarin Canar, Tanner Abbott, and Austin Pence.';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'About Us',
  description,
  alternates: {canonical: '/about'},
  openGraph: {title: 'About BYU Calendar', description, url: '/about'},
  twitter: {title: 'About BYU Calendar', description},
};

export default function AboutPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: 'https://byucalendar.com/about',
    name: 'About BYU Calendar',
    about: {'@id': 'https://byucalendar.com/#organization'},
    author: TEAM.map((person) => ({'@type': 'Person', ...person})),
  };

  return (
    <>
      <AboutCanvas />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdText(jsonLd)}} />
    </>
  );
}
