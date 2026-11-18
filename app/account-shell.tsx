import {ArrowLeft} from 'lucide-react';
import type {ReactNode} from 'react';
import Link from 'next/link';
import BrandY from './brand-y';
import SiteFooter from './site-footer';

export default function AccountShell({children}: {children: ReactNode}) {
  return <div className="account-shell"><header className="account-header"><Link prefetch={false} className="brand" href="/" aria-label="BYU Calendar home"><BrandY className="brand-y"/><span>BYU<span className="brand-light"> Calendar</span></span></Link><Link prefetch={false} className="text-button" href="/"><ArrowLeft size={15}/> Back to calendar</Link></header><main className="account-main">{children}</main><SiteFooter className="account-footer"/></div>;
}
