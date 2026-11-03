import type {CampusEvent} from '../app/types';

export const IMPORTANT_TAG: string;
export function importantLabel(event: CampusEvent): string;
export function applyImportantEvents(events: CampusEvent[]): CampusEvent[];
export function dayOrder(a: CampusEvent, b: CampusEvent): number;
