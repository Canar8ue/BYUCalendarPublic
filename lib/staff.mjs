// BYU professor/staff accounts. Verified staff keep every student power, and
// their published listings read as "BYU added event" instead of a community
// submission; they may also correct any listing inside their area. This module
// is shared by client and server, so it stays configuration-only.

export const STAFF_AREAS = [
  {id: 'law', label: 'Law', sourceIds: ['law'], tags: ['Law']},
  {id: 'marriott', label: 'Marriott School — business, IS, AIS, accounting', sourceIds: ['marriott-cet','marriott-mba','marriott-emba','marriott-events','marriott-calendar','marriott-esr','marriott-gmc','marriott-bsisys','marriott-mism','ais','accounting-society','marketing'], tags: ['IS','AIS','Accounting','Finance','Marketing','Entrepreneurship','Recruiting']},
  {id: 'engineering', label: 'Engineering', sourceIds: ['engineering'], tags: ['Engineering']},
  {id: 'computer-science', label: 'Computer Science', sourceIds: ['cs'], tags: ['Computer Science']},
  {id: 'math', label: 'Mathematics & ACME', sourceIds: ['math','acme'], tags: ['Math','ACME']},
  {id: 'life-sciences', label: 'Life Sciences', sourceIds: ['life-sciences'], tags: ['Life Sciences']},
  {id: 'kennedy', label: 'Kennedy Center — international', sourceIds: ['kennedy'], tags: ['International']},
  {id: 'athletics', label: 'Athletics', sourceIds: ['byucougars'], tags: []},
];

export function staffArea(id) {
  return STAFF_AREAS.find(area => area.id === id) || null;
}

// A listing belongs to a staff area when it comes from one of the area's
// sources, or (for community submissions) when it carries one of the area's
// interest tags.
export function eventInStaffArea(event, areaId) {
  const area = staffArea(areaId);
  if (!area) return false;
  if (area.sourceIds.includes(event.sourceId)) return true;
  return Boolean(event.tags?.some(tag => area.tags.includes(tag)));
}
