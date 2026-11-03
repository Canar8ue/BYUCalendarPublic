export type CampusEvent={id:string;title:string;description:string;start:string;end:string|null;allDay:boolean;location:string;url:string;sourceId:string;sourceName:string;category:string;tags:string[];food:string|null;snacks:string|null;drinks:string|null;free:boolean|null;audience:string|null;format:string|null;cancelled:boolean;sourceUpdated:string|null;additionalSources?:{name:string;url:string}[];community?:boolean;organizer?:string;byuOfficial?:boolean;communityTags?:{id:string;tag:string;note:string}[];snacksImplied?:boolean;overridden?:boolean;moderatedAt?:string|null;important?:string;timeTba?:boolean};
export type SourceStatus={id:string;name:string;url:string;count:number;lastSuccess:string|null;error:string|null;enabled:boolean;snapshot?:boolean;note?:string};
export type CalendarData={events:CampusEvent[];sources:SourceStatus[];stored:boolean;error?:string};
export type SavedView={id:string;name:string;query:string;categories:string[];tags:string[]};
// A tiny snapshot of what a member saved, kept so My calendar can say what
// vanished when a source stops publishing an event instead of the row silently
// disappearing. Only the fields needed to identify the listing are stored.
export type SavedEventNote={title:string;day:string;location?:string;sourceName?:string};
export type Preferences={saved:string[];views:SavedView[];savedMeta?:Record<string,SavedEventNote>};
export type AccountUser={id:string;email:string;name:string;emailVerified:boolean};
export type AccountState={user:AccountUser|null;emailReady:boolean;permissions:{addListings:boolean;addTags:boolean;reportListings:boolean;reviewReports:boolean};staff?:{status:'pending'|'verified'|'denied';area:string;areaLabel:string;autoVerified:boolean}|null};
export type ListingReport={id:string;eventId:string;reason:string;details:string;status:string;createdAt:string;hidden:boolean;event:CampusEvent};
export type InboxReply={id:string;toAddress:string;subject:string;bodyText:string;sentBy:string;sentAt:string};
export type InboxEmail={id:string;fromAddress:string;toAddress:string;subject:string;preview:string;bodyText:string;receivedAt:string;readAt:string|null;repliedAt:string|null;replies:InboxReply[]};
export type AnalyticsNamedCount={name:string;count:number;zeros?:number};
export type AnalyticsDay={day:string;views:number;searches:number;eventViews:number;exports:number};
export type AnalyticsTotals={views7:number;views30:number;searches30:number;eventViews30:number;exports30:number;saves30:number;shares30:number;directions30:number};
export type AnalyticsSummary={generatedAt:string;days:AnalyticsDay[];totals:AnalyticsTotals;topPages:AnalyticsNamedCount[];topSearches:AnalyticsNamedCount[];zeroResultSearches:AnalyticsNamedCount[];referrers:AnalyticsNamedCount[];countries:AnalyticsNamedCount[];devices:AnalyticsNamedCount[];sources:SourceStatus[];inventory:{totalEvents:number;upcomingEvents:number;byCategory:AnalyticsNamedCount[];topTags:AnalyticsNamedCount[];topLocations:AnalyticsNamedCount[];nextDays:{day:string;count:number}[]};community:{listings:number;communityTags:number;reportsOpen:number;reportsTotal:number;accountsTotal:number;accountsVerified:number;inboxTotal:number;inboxUnread:number}};
