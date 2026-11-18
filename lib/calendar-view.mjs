import {CATEGORIES, INTEREST_TAGS} from './catalog.mjs';
import {FEED_DETAIL_TAGS} from './feed.mjs';
import {dayKey} from './search.mjs';

// Date fields in the UI always describe the campus day, regardless of where
// the browser (or the rendering server) happens to be.
export function campusDate(now = new Date()) {
  return new Date(dayKey(now) + 'T12:00:00');
}

export function calendarDays(anchor, view) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), view === 'week' ? anchor.getDate() : 1, 12);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({length: view === 'week' ? 7 : 42}, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {date, key};
  });
}

export function readCalendarLocation(search) {
  const params = new URLSearchParams(search);
  const allowedCategories = new Set(CATEGORIES.map(category => category.id));
  const allowedTags = new Set([...INTEREST_TAGS, ...FEED_DETAIL_TAGS]);
  const list = (key, allowed) => [...new Set((params.get(key) || '').split(',').map(value => value.trim()).filter(value => allowed.has(value)))];
  const view = params.get('view');
  return {
    query: (params.get('q') || '').slice(0, 500),
    categories: list('categories', allowedCategories),
    tags: list('tags', allowedTags),
    view: ['week', 'month', 'list', 'map'].includes(view) ? view : 'list',
  };
}
