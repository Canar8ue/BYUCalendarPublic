'use client';
import AccountShell from '../../account-shell';
import {useAccount} from '../../account-client';
import {ContributionGate, NewListingForm} from '../../community-forms';

export default function NewListingPage() {
  const {account, error} = useAccount();
  // Reload the calendar so its event inventory includes the newly published listing.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  // Additional Comment for push
  return <AccountShell><section className="account-card listing-form-card"><div className="eyebrow">FROM YOU, FOR CAMPUS</div><h1>Share your <span>next thing.</span></h1><p className="account-description">A club gathering, a workshop, or something worth showing up for.</p>{account?.permissions.addListings ? <NewListingForm onPublished={event => window.location.assign('/?event=' + encodeURIComponent(event.id) + '&view=list')}/> : <ContributionGate account={account} error={error} action="add a listing" returnTo="/listings/new"/>}</section></AccountShell>;
}
