// Gameplay anchors are deliberately OUTSIDE source building footprints. They are
// candidate outdoor arrival positions, not the rooftop pins in coordinates.json.
// World collision/ground checks remain authoritative at runtime.
export const UNIT = 0.044571444392204285;
export const SPAWN = Object.freeze({x: 2.85, z: -1});
export const SCOOTER_STAND = Object.freeze({x: 5.45, z: 2.8});

const place = (id, name, code, x, z, description, district) => Object.freeze({id, name, code, x, z, radius: .8, description, district});
export const LOCATIONS = Object.freeze([
  place('hbll', 'Harold B. Lee Library', 'HBLL', 2.85, -.15, 'A new page in your campus passport. The library makes a good place to begin.', 'central'),
  place('wsc', 'Wilkinson Student Center', 'WSC', 10.1, 3.55, 'A meeting point for your imaginary campus adventure.', 'central'),
  place('jfsb', 'Joseph F. Smith Building', 'JFSB', -4.4, 4.95, 'Pause by the building and take in its curved campus silhouette.', 'central'),
  place('moa', 'Museum of Art', 'MOA', 7.6, -5.85, 'A little art, a little wandering, one more passport stamp.', 'central'),
  place('tnrb', 'Tanner Building', 'TNRB', -9.5, -.72, 'Business district discovered. Your next big idea can wait five minutes.', 'science'),
  place('esc', 'Eyring Science Center', 'ESC', 1.48, 13.3, 'Science, a planetarium silhouette, and a reason to look up.', 'science'),
  place('eb', 'Engineering Building', 'EB', 10.7, 18.1, 'Every adventure needs a little engineering.', 'science'),
  place('bnsn', 'Benson Building', 'BNSN', 1.65, 19.1, 'Another piece of the science district in your passport.', 'science'),
  place('lsb', 'Life Sciences Building', 'LSB', 2.4, 21.4, 'The south end of campus opens up around you.', 'science'),
  place('music-building', 'Music Building', 'MB', 22.4, 3.3, 'Somewhere between a melody and a very pleasant detour.', 'arts'),
  place('arts-building', 'Arts Building', 'ARTS', 7.6, 2.8, 'A colorful chapter of your campus route.', 'arts'),
  place('carillon', 'Centennial Carillon Tower', 'BELL', 9.7, -13.65, 'A landmark worth stopping for. Listen, or simply enjoy the view.', 'north'),
  place('marriott-center', 'Marriott Center', 'MC', 2.6, -17.1, 'Your northern adventure is taking shape.', 'north'),
  place('bean-museum', 'Bean Life Science Museum', 'MLBM', 10.2, -15.1, 'A destination for the curious explorer.', 'north'),
  place('stadium', 'LaVell Edwards Stadium', 'LVES', -16.8, -30.8, 'A big landmark for a small campus passport.', 'north'),
  place('maeser', 'Maeser Building', 'MSRB', -13.9, 24.2, 'Take the scenic route and collect a quieter campus moment.', 'scenic'),
  place('kimball', 'Kimball Tower', 'KMBL', -4.5, 14.9, 'Hard to miss from a distance. Now it is on your passport.', 'science'),
  place('jkb', 'Jesse Knight Building', 'JKB', -1.2, 3.1, 'A central-campus stop, one short walk from your next discovery.', 'central'),
  place('law', 'J. Reuben Clark Law Building', 'JRCB', 15.7, 2.7, 'The eastward route has a new landmark.', 'arts'),
  place('jsb', 'Joseph Smith Building', 'JSB', -6.2, 17.65, 'A southern-campus discovery added to the collection.', 'scenic'),
  place('hinckley', 'Hinckley Center', 'HC', -4.85, -8.8, 'A northwestern detour with a distinctive roofline.', 'north'),
  place('ipf', 'Indoor Practice Facility', 'IPF', -23.7, 13.65, 'Training grounds for your exploration skills.', 'scenic'),
  place('richards', 'Richards Building', 'RB', -9.7, 6, 'The western campus route rewards a little wandering.', 'scenic'),
  place('fieldhouse', 'Smith Fieldhouse', 'SFH', -22.75, 12.4, 'Your passport has room for one more sporting landmark.', 'scenic'),
]);

export const CAT_TRAIL = Object.freeze([
  {id: 'parked-car', x: 5.45, z: 3.25, hint: 'A little cat is hiding beside the parked car, south of the Arts Building.'},
  {id: 'first-paws', x: 5.45, z: 4.9, hint: 'Fresh paw prints lead south between the library and the student center.'},
  {id: 'library-lane', x: 5.45, z: 7.7, hint: 'The prints keep going down the narrow outdoor lane.'},
  {id: 'wrong-turn', x: 5.55, z: 10.4, hint: 'A fork in the trail! The little paw prints turn west around the library.'},
  {id: 'last-meow', x: 3.15, z: 10.2, hint: 'There is a soft meow just beyond the library’s southern corner.'},
  {id: 'cat-nap', x: 1.6, z: 10.2, hint: 'Found a perfect napping spot. Approach gently and say hello.'},
].map(Object.freeze));

export const COSMO_SPOTS = Object.freeze([
  {id: 'cosmo-wave', x: 2.4, z: -1, hint: 'A familiar blue-and-white figure waves near the library’s north approach.'},
  {id: 'cosmo-bells', x: 9.9, z: -13.7, hint: 'The next clue says: find the tower that makes music in the sky.'},
  {id: 'cosmo-stadium', x: -11.7, z: -34.8, hint: 'A final celebration awaits outside the stadium’s eastern side.'},
].map(Object.freeze));

export const LOST_ITEMS = Object.freeze([
  {id: 'blue-notebook', name: 'Blue notebook', x: -1.2, z: 3.1, hint: 'The illustrated clue shows the Jesse Knight Building.'},
  {id: 'striped-scarf', name: 'Striped scarf', x: -9.5, z: -.72, hint: 'A scarf wandered over to the Tanner approach.'},
  {id: 'red-bottle', name: 'Red water bottle', x: 1.48, z: 13.3, hint: 'Look for a red bottle beside the Eyring discovery marker.'},
].map(Object.freeze));
export const TUNE_NOTES = Object.freeze([
  {id: 'note-sun', name: 'Sun note', symbol: '☀', x: 7.6, z: 2.8},
  {id: 'note-wave', name: 'Wave note', symbol: '≈', x: 15.7, z: 2.7},
  {id: 'note-star', name: 'Star note', symbol: '✦', x: 22.4, z: 3.3},
].map(Object.freeze));
export const PHOTO_SPOTS = Object.freeze([
  {id: 'photo-library', name: 'Library postcard', x: 2.85, z: -.15, target: 'hbll'},
  {id: 'photo-arts', name: 'Arts postcard', x: 7.6, z: 2.8, target: 'arts-building'},
  {id: 'photo-bells', name: 'Carillon postcard', x: 9.7, z: -13.65, target: 'carillon'},
].map(Object.freeze));

export const SECRETS = Object.freeze([
  {id: 'page-zero', name: 'The missing zero', x: 2.85, z: -2.1},
  {id: 'candy-break', name: 'A very important candy break', x: -9.5, z: -.4},
  {id: 'tiny-parking', name: 'Parking for tiny scooters', x: 5.6, z: 2.9},
  {id: 'cat-sticker', name: 'Cat person confirmed', x: 1.6, z: 10.2},
  {id: 'bell-secret', name: 'A note in the sky', x: 10.1, z: -13.65},
  {id: 'paper-plane', name: 'An excellent paper airplane', x: 7.7, z: -5.85},
  {id: 'dance-floor', name: 'An extremely unofficial dance floor', x: -11.7, z: -34.3},
  {id: 'confident-duck', name: 'A very confident duck', x: -13.9, z: 24.6},
  {id: 'tiny-campus', name: 'A campus within a campus', x: 10.5, z: 3.55},
  {id: 'wrong-way', name: 'The scenic way to class', x: -6.2, z: 17.65},
  {id: 'quiet-bench', name: 'Five minutes of peace', x: -4.4, z: 4.95},
  {id: 'developer-card', name: 'Greetings from the missing page', x: 2.6, z: -17.1},
].map(Object.freeze));

export const TRIALS = Object.freeze([
  {id: 'central-loop', name: 'Library Lane', targetSeconds: 32, points: [{x: 5.45, z: 3.25}, {x: 5.45, z: 7.7}, {x: 5.55, z: 10.4}, {x: 1.6, z: 10.2}]},
  {id: 'arts-run', name: 'Arts Express', targetSeconds: 80, points: [{x: 7.6, z: 2.8}, {x: 15.7, z: 2.7}, {x: 22.4, z: 3.3}]},
  {id: 'northbound', name: 'Northbound', targetSeconds: 115, points: [{x: 2.85, z: -2.1}, {x: 7.6, z: -5.85}, {x: 9.9, z: -13.7}, {x: 10.2, z: -15.1}]},
].map(trial => Object.freeze({...trial, points: Object.freeze(trial.points.map(Object.freeze))})));

export const QUESTS = Object.freeze([
  {id: 'cat', title: 'Paws and Effect', description: 'Follow six small clues from the parked car and find the campus cat.', xp: 80},
  {id: 'cosmo', title: 'Where’s Cosmo?', description: 'Find Cosmo in three corners of campus.', xp: 100},
  {id: 'delivery', title: 'Late for Class', description: 'Deliver a forgotten notebook to Engineering.', xp: 60},
  {id: 'lost-found', title: 'Lost and Found', description: 'Find three belongings and return them to their owner.', xp: 60},
  {id: 'music', title: 'Campus in Tune', description: 'Collect three symbols and play their melody.', xp: 60},
  {id: 'photo', title: 'Golden Hour Club', description: 'Photograph three campus landmarks.', xp: 60},
  {id: 'main', title: 'Find Your Way Back', description: 'Recover four lost-page fragments by exploring each campus district.', xp: 100},
].map(Object.freeze));

export const MAIN_CHAPTERS = Object.freeze([
  {id: 'orientation', title: 'Orientation', objective: 'Discover the library, Wilkinson Student Center, and JFSB.', locations: ['hbll', 'wsc', 'jfsb'], xp: 30},
  {id: 'long-way', title: 'The Long Way Around', objective: 'Visit Tanner and Eyring to recover the science-district fragment.', locations: ['tnrb', 'esc'], xp: 40},
  {id: 'sound-vision', title: 'Sound and Vision', objective: 'Discover the Arts Building and Music Building.', locations: ['arts-building', 'music-building'], xp: 50},
  {id: 'familiar-face', title: 'A Familiar Face', objective: 'Find the Carillon Tower and Marriott Center to complete the lost page.', locations: ['carillon', 'marriott-center'], xp: 60},
].map(chapter => Object.freeze({...chapter, locations: Object.freeze(chapter.locations)})));

export const FRAGMENTS = Object.freeze(MAIN_CHAPTERS.map((chapter,index) => {
  const place=LOCATIONS.find(location=>location.id===chapter.locations.at(-1));
  return Object.freeze({id:chapter.id,x:place.x,z:place.z,title:chapter.title,number:index+1});
}));
export const OUTFITS = Object.freeze([
  {id:'classic',name:'First-day blue',level:1,jacket:'#336b9a',pack:'#d4a556'},
  {id:'forest',name:'Trail society',level:2,jacket:'#326b64',pack:'#e0b86a'},
  {id:'plum',name:'After-hours artist',level:3,jacket:'#574c8d',pack:'#d6956c'},
  {id:'sunset',name:'Golden-hour club',level:5,jacket:'#bd674e',pack:'#f0c877'},
  {id:'cat',name:'Official cat person',quest:'cat',jacket:'#d2934e',pack:'#6c8467'},
  {id:'racer',name:'Track jacket',gold:1,jacket:'#e5ae4e',pack:'#244e64'},
  {id:'cookiecrew',name:'Cookie crew',activity:'cookie-stand',jacket:'#3d78b2',pack:'#f3d79c'},
]);
export const DECKS = Object.freeze([
  {id:'classic',name:'Campus blue',level:1,color:'#275b9c'},
  {id:'sea',name:'Sea glass',level:2,color:'#377e78'},
  {id:'gold',name:'Golden ticket',level:4,color:'#bd862e'},
  {id:'cosmo',name:'Cougar spirit',quest:'cosmo',color:'#f2eee0'},
  {id:'comet',name:'Comet',gold:3,color:'#ebba51'},
  {id:'workshop',name:'Nora’s workshop',activity:'scooter-school',color:'#65b8aa'},
]);
export const SECRET_STORIES = Object.freeze({
  'page-zero':'Found: the missing zero from the 404. It was taking a personal day.',
  'candy-break':'The Tanner candy economy appears to be thriving. Your research is complete.',
  'tiny-parking':'Reserved for one extremely small scooter. The parking attendant is a ladybug.',
  'cat-sticker':'Membership in the campus cat appreciation society: approved by the cat.',
  'bell-secret':'The bell sends a note out over the rooftops. For a moment, the whole campus listens.',
  'paper-plane':'A tiny paper pilot has logged more campus miles than most freshmen.',
  'dance-floor':'An unofficial dance floor. All skill levels welcome. Especially yours.',
  'confident-duck':'The duck has no student ID, no timetable, and absolutely no doubts.',
  'tiny-campus':'A campus inside a campus. A much smaller version of you is probably lost here too.',
  'wrong-way':'The scenic way to class. Estimated arrival: eventually.',
  'quiet-bench':'Nothing to solve. Nothing to collect for a moment. Just a very good place to sit.',
  'developer-card':'Dear wanderer: thanks for taking the detour. We made this little world for you.',
});

// Routes and anchor availability are fiction within the game. No real-world
// access, scooter permission, building entrance, or current-event claim is made.
