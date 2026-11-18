// Apply each change to the last acknowledged state. Two quick saves must not
// send competing copies of the same old calendar, or lose the first save.
export function createPreferenceQueue(read, write) {
  let tail = Promise.resolve();
  return update => {
    const result = tail.then(() => write(update(read())));
    tail = result.catch(() => {});
    return result;
  };
}
