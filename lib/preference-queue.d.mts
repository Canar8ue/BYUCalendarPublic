export function createPreferenceQueue<T, R>(read: () => T, write: (next: T) => Promise<R>): (update: (current: T) => T) => Promise<R>;
