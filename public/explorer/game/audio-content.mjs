// Production audio is generated once, then self-hosted. No API calls in-game.
export const VOICE_LINES = Object.freeze({
  intro: {speaker:'Maya', text:'I’m Maya. Four pieces of your lost page are somewhere out here. Start with the library. Follow the gold marker.'},
  'fragment-orientation': {speaker:'Maya', text:'Your first piece! The library, the student center, and a little curiosity. That’s a pretty good start. Next stop: the science district. Your scooter is always one tap away.'},
  'fragment-long-way': {speaker:'Maya', text:'Two pieces. Nicely wandered! Now head east. Someone left a melody between the Arts Building and the Music Building. There’s a whole different rhythm over there.'},
  'fragment-sound-vision': {speaker:'Maya', text:'Three pieces, one very good detour. Your last lead points north, toward the bells. Keep an eye out for someone in blue and white.'},
  'fragment-familiar-face': {speaker:'Maya', text:'You found the last piece. Bring them back to the little departure board where we started. I have a feeling your calendar is going to look a lot more interesting now.'},
  finale: {speaker:'Maya', text:'There it is. Your way back.'},
  'cat-start': {speaker:'Maya', text:'Well, hello there. That cat looks like it knows exactly where it’s going. Which is more than we can say. Follow the little paw prints.'},
  'cat-finish': {speaker:'Maya', text:'Mystery solved. It wasn’t a secret passage. It was a very carefully selected napping spot. I think you’ve made a friend.'},
  delivery: {speaker:'Noah · slightly lost student', text:'Hey! I took the scenic route, and now I can’t find Engineering. Could you scout the way for me? No rush. Well… a little rush. Thank you!'},
  'lost-found': {speaker:'Noah', text:'My notebook, my scarf, and my water bottle! I was having a spectacularly disorganized day. Thanks for bringing everything home.'},
  music: {speaker:'Maya', text:'Sun, wave, star. You found the campus melody. Sometimes the way forward is just three little notes.'},
  cosmo: {speaker:'Maya', text:'There he is! The most enthusiastic person on campus. And somehow, always in three places at once.'},
});

export const MUSIC_TRACKS = Object.freeze([
  {id:'music-day', mood:'day', title:'Taking the Long Way', seconds:75, prompt:'Original cozy exploration game instrumental, bright open-air university campus on a clear afternoon, 84 BPM, warm felt piano, clean fingerpicked nylon guitar, rounded bass, tiny brushed percussion, organic hand played melody, spacious detailed stereo production, relaxed curious hopeful mood, beautifully developed four bar motif with gentle variations. No vocals, no spoken words, no dramatic drums. A continuous background bed, similar opening and ending harmony for a gentle loop crossfade. No big intro or abrupt ending. No artist imitation.'},
  {id:'music-sunset', mood:'sunset', title:'A Good Place to Get Lost', seconds:75, prompt:'Original premium cozy adventure game soundtrack instrumental, golden-hour campus beneath Utah mountains, 76 BPM, intimate Rhodes electric piano, soft marimba, warm acoustic guitar, rich major ninth chords, mellow brushed lo-fi drums, lyrical memorable original motif, wistful and quietly uplifting, natural spacious mastering. No vocals or speech, no vinyl crackle, no loud impacts. Sustained background groove with delicate development and compatible beginning and end harmony for a gentle looping crossfade. No dramatic intro, no ending fade. No artist imitation.'},
  {id:'music-night', mood:'night', title:'After the Last Class', seconds:75, prompt:'Original peaceful night exploration game instrumental, moonlit university campus and distant mountain silhouettes, 68 BPM, soft felt piano, delicate bell celesta, restrained ambient strings and warm analog pad, very soft acoustic bass, almost no percussion, tender spacious original melody, rich quiet harmonic detail, serene magical blue-hour mood, professional clean stereo mix. No vocals, no speech, no loud drums. Continuous gentle background texture with matching beginning and ending harmony for looping crossfade, no intro or final cadence. No artist imitation.'},
]);

export const SOUND_EFFECTS = Object.freeze([
  {id:'ambience', seconds:16, loop:true, prompt:'Seamless loop of a peaceful outdoor university garden: gentle breeze rustling leafy trees, scattered small songbirds in the distance, soft spacious open-air atmosphere. Natural quiet field recording, no human voices, no traffic, no music, no abrupt sounds.'},
  {id:'scooter', seconds:5, loop:true, prompt:'Seamless steady quiet electric scooter motor and rubber wheels rolling smoothly over clean pavement, gentle warm electric whirr, no acceleration, no voices, no music, close clean game sound effect.'},
  {id:'step', seconds:.6, prompt:'One single clean sneaker footstep on a stone campus walkway. Soft friendly game foley, dry close recording, no reverb, no background, no voices, no music.'},
  {id:'cat', seconds:1.4, prompt:'One adorable friendly small cat meow followed by a short contented purr. Close natural clean recording, no background sounds, no speech, no music.'},
  {id:'discovery', seconds:2.1, prompt:'A polished cozy adventure game discovery sound: delicate ascending glass bell arpeggio, warm soft magical shimmer, satisfying gentle final note. Clean short UI reward, no voices, no background, no harsh high frequencies.'},
  {id:'quest', seconds:3.5, prompt:'Original cozy game quest complete stinger, uplifting little orchestral flourish with marimba, soft strings and sparkling bells, celebratory and warm rather than bombastic, clean resolved ending. No voices, no background.'},
  {id:'fragment', seconds:3, prompt:'Magical paper fragment recovered in a cozy adventure game: delicate paper flutter, warm shimmering glass chimes rising, soft magical sparkle, satisfying resonant completion. No voices, no background, clean game reward effect.'},
  {id:'checkpoint', seconds:.7, prompt:'One crisp friendly arcade checkpoint ping, two quick soft ascending glass bell notes with tiny whoosh, immediately readable but gentle. No voices, no background, clean short sound.'},
  {id:'shutter', seconds:.6, prompt:'One satisfying soft vintage instant camera shutter click and tiny mechanical release. Clean dry close foley, no speech, no background, no music.'},
  {id:'horn', seconds:.8, prompt:'One playful friendly bicycle bell ding-ding with short natural metal ring decay, close clean recording, not an aggressive car horn, no voices, no background.'},
]);
