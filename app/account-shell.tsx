'use client';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {ArrowUpRight, Bookmark, Info, MapPin, Plus, Users, X} from 'lucide-react';
import BrandY from './brand-y';
import SiteFooter from './site-footer';
import {useAccount} from './account-client';
import {ContributionGate, NewListingForm} from './community-forms';

export default function AccountShell({children}: {children: ReactNode}) {
  const {account, error} = useAccount();
  const pathname = usePathname() || '/account';
  const signedIn = Boolean(account?.permissions.addListings);
  const immediatePublish = Boolean(account?.permissions.reviewReports || account?.staff?.status === 'verified');
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (addOpen) { if (!dialog.open) dialog.showModal(); }
    else if (dialog.open) dialog.close();
  }, [addOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="account-shell">
      <header className="topbar">
        <Link prefetch={false} className="brand" href="/" aria-label="BYU Calendar home">
          <BrandY className="brand-y"/>
          <span>BYU<span className="brand-light"> Calendar</span></span>
        </Link>
        <nav aria-label="Main navigation">
          <Link prefetch={false} className="nav-item" href="/">Discover</Link>
          <Link prefetch={false} className="nav-item" href="/?section=saved"><Bookmark size={15}/> My Calendar</Link>
          <Link prefetch={false} className="nav-item" href="/?view=map"><MapPin size={15}/> Campus Map</Link>
        </nav>
        {signedIn ? (
          <span className="topbar-auth">
            <Link prefetch={false} className={'signin-button account-nav' + (pathname === '/account' ? ' active' : '')} href="/account" title={account?.user?.email}>
              <Users size={15}/> Account
            </Link>
            <button type="button" className="topbar-add-button" aria-label="Add a Listing" title="Add a Listing" onClick={() => setAddOpen(true)}>
              <Plus size={16}/>
            </button>
          </span>
        ) : (
          <span className="topbar-auth">
            <a className="signin-button" href={'/signin?returnTo=' + encodeURIComponent(pathname)}>Sign In <ArrowUpRight size={14}/></a>
            <a className="signin-button signup-button" href={'/signin?mode=signup&returnTo=' + encodeURIComponent(pathname)}>Sign Up</a>
            <button type="button" className="topbar-add-button" aria-label="Add a Listing" title="Add a Listing" onClick={() => setAddOpen(true)}>
              <Plus size={16}/>
            </button>
          </span>
        )}
      </header>
      <main className="account-main">{children}</main>
      <SiteFooter className="account-footer"/>
      <dialog
        ref={dialogRef}
        className="modal"
        aria-label="Add a Listing"
        onClose={() => setAddOpen(false)}
        onCancel={() => setAddOpen(false)}
        onClick={e => {
          if (e.target === dialogRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setAddOpen(false);
          }
        }}
      >
        <button className="modal-close icon-button" aria-label="Close dialog" onClick={() => setAddOpen(false)}><X size={21}/></button>
        {addOpen && (
          <div className="contribution-dialog">
            <h2>Add a Listing</h2>
            {signedIn ? (
              <NewListingForm
                immediatePublish={immediatePublish}
                onPublished={event => {
                  setAddOpen(false);
                  window.dispatchEvent(new Event('byuc:listing-added'));
                  setToast(event.approvalStatus === 'approved'
                    ? 'Listing published! It is now live on BYU Calendar.'
                    : 'Submitted! Your event will be approved first, then will show on BYU Calendar.');
                }}
              />
            ) : (
              <ContributionGate account={account} error={error} action="add a listing" returnTo={pathname}/>
            )}
          </div>
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Info size={17}/>
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15}/></button>
        </div>
      )}
    </div>
  );
}
