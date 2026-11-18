import type {CampusEvent} from '../app/types';
export type SearchPage={key:string;query:string;title:string;label:string;href:string};
export const SEARCH_PAGES:SearchPage[];
export function findSearchPage(query:string):SearchPage|null;
export function requestSearchPage(params:Record<string,string|string[]|undefined>):SearchPage|null;
export function searchPageWindow(page:SearchPage,now?:Date):{start:string;end:string;range:string};
export function searchPageEvents(events:CampusEvent[],page:SearchPage,now?:Date):CampusEvent[];
