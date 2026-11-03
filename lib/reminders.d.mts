import type {CampusEvent} from '../app/types';
export const DIGEST_TIME_ZONE: string;
export function digestWindow(now: Date, timeZone?: string): {day: string; hour: number; active: boolean};
export function selectDigestEvents(events: CampusEvent[], savedIds: readonly string[], day: string, now: Date): CampusEvent[];
export function digestTimeLabel(event: CampusEvent): string;
export function digestDayLabel(day: string): string;
export function buildDigestEmail(input: {name: string; day: string; events: CampusEvent[]; unsubscribeUrl: string; origin?: string}): {subject: string; text: string; html: string};
export function unsubscribeToken(userId: string, secret: string): Promise<string>;
export function verifyUnsubscribeToken(userId: string, token: unknown, secret: string): Promise<boolean>;
