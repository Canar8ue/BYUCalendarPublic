import type {Metadata} from 'next';
import CampusExplorer from '../campus-explorer';

export const metadata: Metadata = {
  title: 'Lost on Campus',
  description: 'Explore BYU, ride a scooter, and hike the Y in Lost on Campus.',
  alternates: {canonical: '/explore'},
  openGraph: {title: 'Lost on Campus', description: 'Explore BYU, ride a scooter, and hike the Y.', url: '/explore'},
};

export default function ExplorePage() {
  return <CampusExplorer/>;
}
