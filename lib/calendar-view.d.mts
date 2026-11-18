export function campusDate(now?: Date): Date;
export function calendarDays(anchor: Date, view: string): {date: Date; key: string}[];
export function readCalendarLocation(search: string): {query: string; categories: string[]; tags: string[]; view: 'week' | 'month' | 'list' | 'map'};
