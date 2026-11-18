import type {Metadata} from 'next';
import DemoViewer from './demo-viewer';

export const metadata: Metadata = {
  title: 'Demo',
  description: 'Interactive presentation and live demo of BYU Calendar.',
  alternates: {canonical: '/demo'},
  openGraph: {title: 'BYU Calendar Demo', description: 'Interactive presentation and live demo of BYU Calendar.', url: '/demo'},
};

export default function DemoPage() {
  return <DemoViewer/>;
}
