import type {CampusEvent} from '../app/types';
export type CampusLocation={id:string;code:string;name:string;position:number[];featureIds:string[]};
export type CampusEventGroup={location:CampusLocation;events:CampusEvent[];colors:{color:string;count:number}[]};
export const campusLocations:CampusLocation[];
export function resolveCampusLocation(event:Pick<CampusEvent,'location'|'format'>):CampusLocation|null;
export function groupCampusEvents(events:CampusEvent[],day:string):{groups:CampusEventGroup[];unmapped:CampusEvent[]};
// Platform-aware directions link: Apple Maps on Apple/touch devices, Google
// Maps elsewhere; null when the listing has no mappable physical location.
export function takeMeThereUrl(event:Pick<CampusEvent,'location'|'format'>,userAgent:string,maxTouchPoints:number):string|null;
