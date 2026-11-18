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
  function onPublished(event: CampusEvent, first: boolean) {
    if (first) { setFirstListing(event); return; }
    // Reload the calendar so its event inventory includes the newly published listing.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/?event=' + encodeURIComponent(event.id) + '&view=list');
  }
  return <AccountShell><section className="account-card listing-form-card">{firstListing ? <div className="first-listing">
    <h1 className="plain-heading">Your listing is live.</h1>
    <p className="account-description">Everything you add is kept in Your listings — edit it or add more information any time.</p>
    <div className="account-actions">
      <a className="primary-button" href={'/?event=' + encodeURIComponent(firstListing.id) + '&view=list'}>See it on the calendar</a>
      <a className="outline-button" href="/listings/mine">Open Your listings</a>
    </div>
  </div> : <>
    <h1 className="plain-heading">Add a listing</h1>
    {account?.permissions.addListings ? <NewListingForm onPublished={onPublished}/> : <ContributionGate account={account} error={error} action="add a listing" returnTo="/listings/new"/>}
  </>}</section></AccountShell>;
}
