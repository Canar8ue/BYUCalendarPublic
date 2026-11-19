'use client';
import {useState} from 'react';
import AccountShell from '../../account-shell';
import {useAccount} from '../../account-client';
import {ContributionGate, NewListingForm} from '../../community-forms';
import type {CampusEvent} from '../../types';

export default function NewListingPage() {
  const {account, error} = useAccount();
  // A first publication swaps the form for a short prompt to Your listings;
  // later publications go straight to the listing on the calendar.
  const [firstListing, setFirstListing] = useState<CampusEvent | null>(null);
  const immediatePublish = Boolean(account?.permissions.reviewReports || account?.staff?.status === 'verified');
  function onPublished(event: CampusEvent, first: boolean) {
    if (first || event.approvalStatus !== 'approved') { setFirstListing(event); return; }
    // Reload the calendar so its event inventory includes the newly published listing.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/?event=' + encodeURIComponent(event.id) + '&view=list');
  }
  return <AccountShell><section className="account-card listing-form-card">{firstListing ? <div className="first-listing">
    <h1 className="plain-heading">{firstListing.approvalStatus === 'pending' ? 'Submitted for Approval.' : 'Your listing is live.'}</h1>
    <p className="account-description">{firstListing.approvalStatus === 'pending' ? 'Your event will be approved first, then will show on BYU Calendar. You can check or edit it in Your Listings anytime.' : 'Everything you add is kept in Your Listings — edit it or add more information any time.'}</p>
    <div className="account-actions">
      {firstListing.approvalStatus === 'approved' && <a className="primary-button" href={'/?event=' + encodeURIComponent(firstListing.id) + '&view=list'}>See It on the Calendar</a>}
      <a className={firstListing.approvalStatus === 'pending' ? 'primary-button' : 'outline-button'} href="/listings/mine">Open Your Listings</a>
    </div>
  </div> : <>
    <h1 className="plain-heading">Add a Listing</h1>
    {account?.permissions.addListings ? <NewListingForm immediatePublish={immediatePublish} onPublished={onPublished}/> : <ContributionGate account={account} error={error} action="add a listing" returnTo="/listings/new"/>}
  </>}</section></AccountShell>;
}
