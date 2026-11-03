import {UNIT, LOCATIONS, CAT_TRAIL} from './content.mjs?v=20261102polish6';

// Entirely authored game scenes: fictional students, supplies and promotions.
// Outdoor anchors reuse reviewed arrivals; this is not a present-day events guide.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const anchor=(id,name)=>{const p=LOCATIONS.find(p=>p.id===id);return {id,name:name||p.name,x:p.x,z:p.z};};
export const CAMPUS_POINTS=freeze(Object.fromEntries([
  ...LOCATIONS.map(p=>[p.id,anchor(p.id)]),
  ['lane',{id:'lane',name:'Library Lane',x:CAT_TRAIL[2].x,z:CAT_TRAIL[2].z}],
  ['south-lane',{id:'south-lane',name:'South library corner',x:CAT_TRAIL[4].x,z:CAT_TRAIL[4].z}],
]));
const p=id=>CAMPUS_POINTS[id];

export const CAMPUS_DISTRICTS=freeze([
  {id:'central',name:'Central / WSC',description:'A club fair table, welcome cards and room for another person.'},
  {id:'library',name:'Library / JFSB',description:'Reading routes, shared stories and an unhurried courtyard.'},
  {id:'arts',name:'Arts / Music',description:'A chalk pattern, an outdoor program and a shared caption.'},
  {id:'science',name:'Science / Engineering',description:'Small prototypes, careful tests and useful deliveries.'},
  {id:'north',name:'North / athletics',description:'Fan banners, target setup and a visual call-and-response.'},
  {id:'south',name:'South / trailhead',description:'Volunteer packing, scenic observations and preparations for the climb.'},
]);

const student=(id,name,role,color,pack,accessory,home,work,leisure,bio,greeting,repeat,thanks,relationships)=>({
  id,name,role,color,jacket:color,pack,accessory,home:p(home),work:p(work),leisure:p(leisure),bio,greeting,repeat,thanks,relationships,
  schedule:[{until:240,anchor:'work'},{until:480,anchor:'leisure'},{until:720,anchor:'home'}],
});
export const CAMPUS_NPCS=freeze([
  student('leah','Leah','Club fair organizer','#bf7850','#e4c684','map','jkb','wsc','arts-building',
    'Keeps a very organized clipboard and cheerfully changes her plan when someone has a better idea.',
    'I’m Leah. This is our imaginary club fair. The table is ready; the important part is helping people find each other.',
    'There is always room at the shared table. Want to pick up where we left off?',
    'Owen brought a story, Iris brought a pattern, and somebody remembered the tape. That is a pretty good club fair.',
    [{npcId:'owen',text:'Owen is turning our blank welcome cards into little reading routes.'},{npcId:'iris',text:'Iris knows how to make a shared table feel inviting.'}]),
  student('owen','Owen','Reading-route host','#596c96','#bd8c54','case','hbll','jfsb','jkb',
    'A patient reader who prefers a good question to a confident guess and writes captions in pencil.',
    'I’m Owen. My book table is really a story table. We can borrow a view, notice something, and bring a better question back.',
    'No pop quiz. I saved your place on the reading route.',
    'Leah has the route cards now. It is nice when a story gets to leave the table.',
    [{npcId:'leah',text:'Leah asks people what they enjoy before handing them a club card.'},{npcId:'sam',text:'Sam helped us turn a quiet observation into a useful invitation.'}]),
  student('iris','Iris','Community art host','#ae6488','#d2b86e','camera','arts-building','law','music-building',
    'Likes bold shapes, generous captions and art that leaves room for the next person to add something.',
    'I’m Iris. This little art table is fictional, but the question is useful: what could we make together?',
    'Your section is still here. We can add another shape whenever you like.',
    'Priya supplied the clips; Jun supplied the phrase. I think the program has become a collaboration.',
    [{npcId:'priya',text:'Priya treats a display clip like a tiny engineering project.'},{npcId:'jun',text:'Jun says a pause can belong in a picture as well as a melody.'}]),
  student('priya','Priya','Prototype workshop host','#478b88','#d99c5e','tools','bnsn','eb','esc',
    'Tests one small change at a time, labels the uncertain parts and celebrates a repair more than a perfect first try.',
    'I’m Priya. These are game prototypes, so we can be curious without pretending we have solved real engineering today.',
    'The test cards are where you left them. Ready for the next small experiment?',
    'Mateo tested the display outdoors and Sam reused the cases. The best prototype ended up being a useful conversation.',
    [{npcId:'mateo',text:'Mateo is wonderfully honest when a display is too hard to read from a distance.'},{npcId:'sam',text:'Sam finds another use for almost every empty supply case.'}]),
  student('mateo','Mateo','Fan-activity host','#5171ac','#e2d5b3','apron','marriott-center','carillon','bean-museum',
    'An enthusiastic fan who makes the rules readable, keeps practice low pressure and invites the quietest person first.',
    'I’m Mateo. Welcome to our fictional fan booth. We need a banner crew, a target crew and a response you can see without hearing it.',
    'No score to defend. Your place on the crew is still open.',
    'Leah put the visual response on her table. Now the welcome crew and the fan crew can answer each other.',
    [{npcId:'leah',text:'Leah made sure our invitation has room for someone who has never watched a game.'},{npcId:'priya',text:'Priya insisted on a readable score card. Good call.'}]),
  student('sam','Sam','Volunteer outpost host','#6a8658','#d3a871','map','jsb','maeser','lsb',
    'Carries a well-used tote, asks before helping and makes packing lists with room for a rest stop.',
    'I’m Sam. This is an imaginary volunteer outpost. We can pack carefully, leave a place better and help someone prepare for a walk.',
    'The packing list remembers where we stopped. There is no deadline.',
    'Owen wrote the note, Priya sent reusable cases, and Caleb has a preparation card for the trail. Small jobs add up.',
    [{npcId:'owen',text:'Owen wrote a preparation note that starts with “take your time.”'},{npcId:'priya',text:'Priya sends the supplies in cases we can use again.'}]),
]);

const booth=(id,npcId,title,district,point,color,offsetMeters,description)=>({id,npcId,title,district,point:p(point),color,offsetMeters,description});
export const CAMPUS_STANDS=freeze([
  booth('club-fair','leah','Club fair','central','wsc','#bf7850',[-6,0],'Fictional club fair cards and a table that fills with collaborators.'),
  booth('reading-table','owen','Reading table','library','jfsb','#596c96',[3.2,.9],'A book crate, pencilled captions and reading-route cards.'),
  booth('art-table','iris','Art table','arts','law','#ae6488',[3.2,.9],'A chalk-pattern kit, program stand and community caption board.'),
  booth('prototype-booth','priya','Engineering demo','science','eb','#478b88',[3.2,.9],'Fictional prototype cards, clips and reusable supply cases.'),
  booth('fan-booth','mateo','Fan booth','north','carillon','#5171ac',[3.2,-1.4],'Blue and white banner pieces, target cards and a silent cheer board.'),
  booth('volunteer-outpost','sam','Volunteer table','south','maeser','#6a8658',[3.2,.9],'An imaginary volunteer packing table and walking-preparation cards.'),
]);

const step=(id,type,point,label,prompt,complete,extra={})=>({id,type,point:p(point),label,prompt,complete,...extra});
const pickup=(id,point,item,prompt,prop='pack')=>step(id,'interact',point,'Collect '+item,prompt,item+' collected.',{item,prop});
const deliver=(id,point,npcId,item,prompt)=>step(id,'deliver',point,'Give '+item,prompt,item+' delivered.',{npcId,item,prop:'note'});
const notice=(id,point,label,prompt,complete,seconds=4)=>step(id,'observe',point,label,prompt,complete,{seconds,prop:'board'});
const answer=(id,point,label,prompt,complete,options)=>step(id,'choice',point,label,prompt,complete,{prop:'board',choices:options.map(([id,label,correct,feedback])=>({id,label,correct,feedback}))});
const activity=(id,npcId,district,title,description,duration,xp,requires,offer,accepted,outcome,revisit,steps)=>({
  id,npcId,district,title,description,duration,xp,reward:xp+' XP',requires,offer,accepted,outcome,revisit,steps,
});

export const CAMPUS_ACTIVITIES=freeze([
  activity('club-stamp-circuit','leah','central','Club fair stamps','Carry Leah’s fair sheet around the central approaches and make an invitation that welcomes a newcomer.','3–6 min',25,[],
    'A fair sheet should help somebody choose, not just collect stamps. Take this one past Arts and Jesse Knight, then bring it back?',
    'The sheet is on the table. Arts has the first stamp; the next card explains what makes an open invitation.',
    'Leah opens the fair sheet on her table, with three different ways to join in. The imaginary club fair has its first route.',
    'That first sheet is still on the table. It says there are several good ways to belong.',[
      pickup('fair-sheet','wsc','fair sheet','Pick up the blank fair sheet beside Leah’s club table.','stamp'),
      step('arts-stamp','interact','arts-building','Stamp the Arts corner','Use the small game stamp card at the Arts approach.','An Arts stamp joins the fair sheet.',{prop:'stamp'}),
      answer('welcome-wording','jkb','Choose the welcome line','The fictional club card reads: “Curious is enough. No experience required.” Which invitation matches?', 'The fair sheet has a welcoming introduction.',[
        ['beginner','Come try it; beginners are welcome.',true,'A clear invitation leaves room for a first visit.'],
        ['expert','Experienced members only.',false,'Read the card again: it explicitly welcomes a first try.'],
        ['deadline','You must join today.',false,'The card gives curiosity room; it does not set a deadline.'],
      ]),
      deliver('return-sheet','wsc','leah','fair sheet','Bring the stamped sheet to Leah so she can open it on her table.'),
    ]),
  activity('welcome-kit','leah','central','Welcome kit','Bring Owen a welcome kit, then notice the quiet courtyard he wants to include on the route.','4–7 min',25,['club-stamp-circuit'],
    'Owen offered a reading corner for the fair. Could you bring him our welcome kit and notice what makes that corner feel unhurried?',
    'Pick up the welcome kit, find Owen by JFSB, and take a short pause in the courtyard approach.',
    'Owen’s reading corner joins Leah’s fair board. She adds “someone to ask” beside the map, rather than another unexplained acronym.',
    'Owen’s route card is on the board now. It begins with a person you can ask.',[
      pickup('take-welcome-kit','wsc','welcome kit','Collect the labelled welcome kit from Leah’s table.'),
      deliver('owen-welcome-kit','jfsb','owen','welcome kit','Give Owen the welcome kit at his story table.'),
      notice('courtyard-pause','jfsb','Notice the courtyard','Stand still on foot for a few seconds at the JFSB outdoor approach. Notice a detail at your own pace.','You leave a little room for a quiet stop in the route.'),
      step('route-note','interact','jkb','Add the route note','At Jesse Knight’s outdoor game card, add “Ask Owen about the quiet route.”','The welcome route has a person as well as a destination.',{prop:'note'}),
    ]),
  activity('shared-table','leah','central','Fair art table','Bring Iris a table cloth and help prepare an art corner for the growing fair.','5–9 min',30,['welcome-kit'],
    'Iris wants one end of the shared table for art. Could you bring her this cloth and help set out a pattern card?',
    'Take the cloth to Iris by Law. Then set out the pattern card on the Arts approach before coming back.',
    'Leah leaves one end of the fair table open for Iris’s pattern cards. Her stand has changed from a signup desk into a place to stay.',
    'Iris has a permanent corner of the shared table. Leah is still delighted that the plan got bigger.',[
      pickup('take-cloth','wsc','shared table cloth','Pick up the folded cloth from Leah’s club table.','banner'),
      deliver('iris-cloth','law','iris','shared table cloth','Give Iris the cloth for the fair’s art corner.'),
      step('pattern-display','interact','arts-building','Set out the pattern card','Arrange the fictional art card at the Arts approach.','The pattern card points back to the shared fair table.',{prop:'chalk'}),
      notice('fair-space','wsc','Leave room at the table','Pause on foot by the WSC approach and notice the space between the activity tables.','The fair plan includes a clear place for people to arrive.'),
    ]),
  activity('reading-route','owen','library','Library reading route','Carry a reading card to the library approach, choose a thoughtful caption and return it to Owen.','4–7 min',25,[],
    'A reading route can start outside. Take this card to the library approach, pause there, and choose a caption that invites a question.',
    'The blank card is in my crate. There is no need to enter a building.',
    'Owen props your reading card against the book crate. It asks what a place makes you curious about instead of pretending to know every answer.',
    'The card is still in the crate, pencilled question and all. Owen says the question is the useful part.',[
      pickup('take-reading-card','jfsb','reading card','Collect the blank reading card at Owen’s outdoor story table.','book'),
      notice('library-pause','hbll','A page-sized pause','Pause still on foot at the outdoor library approach. Look around without needing to frame a photograph.','You take a moment to notice the approach.',5),
      answer('reading-caption','hbll','Choose a caption','Owen’s note says: “Invite a question. Do not invent a fact.” Choose the caption for this game card.','A pencilled question joins the card.',[
        ['question','What might you discover on your next visit?',true,'A question can welcome the next reader.'],
        ['claim','Every person here reads the same book.',false,'That makes an unsupported claim about other people. Try a question.'],
        ['hurry','Hurry past; there is nothing to notice.',false,'The card is making room for curiosity.'],
      ]),
      deliver('return-reading-card','jfsb','owen','reading card','Bring the captioned card back to Owen.'),
    ]),
  activity('courtyard-conversation','owen','library','Courtyard route','Bring Iris Owen’s quiet-route note and carry her reply back.','6–10 min',30,['reading-route'],
    'Iris asked if our quiet route could appear in her outdoor program. Would you take her a note and bring back the caption she chooses?',
    'The note goes to Iris’s art table by Law. She has left a reply envelope on the nearby game card.',
    'Owen clips Iris’s reply beside the reading card. The program now gives a quiet pause the same space as a performance.',
    'Iris’s reply is still clipped to the crate: “A quiet route belongs in the program too.”',[
      pickup('take-quiet-note','jfsb','quiet-route note','Take Owen’s note from the story table.','note'),
      deliver('iris-quiet-note','law','iris','quiet-route note','Give Iris Owen’s invitation to include a quiet route.'),
      pickup('iris-reply','law','Iris’s reply','Collect Iris’s labelled reply from the outdoor art card.','note'),
      deliver('owen-reply','jfsb','owen','Iris’s reply','Return Iris’s reply to Owen’s story table.'),
    ]),
  activity('careful-caption','owen','library','Maeser observation card','Take a blank observation card south and distinguish an honest observation from an invented story.','7–12 min',35,['courtyard-conversation'],
    'Sam wants a card for people taking a scenic walk. Could you take this blank one south and write what you can honestly notice?',
    'Take the observation card to the Maeser approach. Sam will keep the finished card at the volunteer outpost.',
    'Sam displays the observation card and Owen keeps a copy of its careful caption. Their route celebrates noticing without inventing campus history.',
    'Owen kept the pencilled copy. He likes that the card admits what it does not know.',[
      pickup('take-observation-card','jfsb','observation card','Collect Owen’s blank observation card.','book'),
      notice('south-observation','maeser','Take a scenic pause','Pause still on foot at the outdoor Maeser approach. This is an unhurried observation, not a photograph test.','You give the scenic stop a little time.',6),
      answer('honest-caption','maeser','Choose the careful caption','The game card has no historical source attached. Which caption honestly describes your visit?','The card keeps observation separate from a historical claim.',[
        ['visit','I paused here and noticed the shape of the place.',true,'That describes your visit without inventing a historical fact.'],
        ['legend','This is exactly where every campus tradition began.',false,'The card has no source for that claim. Choose an observation.'],
        ['date','This view has looked identical for a hundred years.',false,'You have not compared dated references. Describe this visit.'],
      ]),
      deliver('sam-observation','maeser','sam','observation card','Give Sam the finished card for the volunteer outpost.'),
    ]),
  activity('chalk-pattern','iris','arts','Chalk pattern','Restore a fictional chalk-pattern card and leave space for the next person’s contribution.','3–6 min',25,[],
    'Our game’s chalk pattern lost a few shapes. Take this kit to Arts and help restore the pattern without filling every empty space?',
    'The kit is here. The Arts card shows the full pattern, so there is no memory test.',
    'Iris displays the restored pattern at her table with one empty square for the next artist.',
    'There is still an empty square. Iris calls it an invitation, not an unfinished job.',[
      pickup('take-chalk-kit','law','chalk-pattern kit','Collect the kit from Iris’s art table.','chalk'),
      step('chalk-outline','interact','arts-building','Restore the outline','Arrange the first pieces of the fictional pattern card at the Arts approach.','The outline is ready for its final shape.',{prop:'chalk'}),
      answer('chalk-order','arts-building','Complete the pattern','The printed pattern is circle, triangle, circle, triangle. Which shape follows the next circle?','The pattern is restored, with space left for another artist.',[
        ['triangle','Triangle',true,'The repeating pair is complete.'],
        ['square','Square',false,'The printed pattern repeats a circle–triangle pair.'],
        ['circle','Another circle',false,'Read the pair on the printed card: circle, then triangle.'],
      ]),
      deliver('return-chalk-kit','law','iris','chalk-pattern kit','Bring the kit back to Iris so she can set out the finished card.'),
    ]),
  activity('outdoor-program','iris','arts','Outdoor program','Take Priya an outdoor-program mockup, then notice a quiet beat at Music.','7–12 min',30,['chalk-pattern'],
    'Priya offered to make clips for the outdoor program. Would you take her the mockup, then pause by Music and leave a little room between the notes?',
    'The program mockup goes to Priya at Engineering. Your next outdoor stop is Music; sound is optional.',
    'Iris clips the program to her display. It includes a small quiet interval inspired by Jun, with no sound requirement.',
    'Jun’s quiet interval is still in the program. Iris refuses to fill it with another announcement.',[
      pickup('take-program','law','program mockup','Collect the folded program mockup from Iris.','note'),
      deliver('priya-program','eb','priya','program mockup','Give Priya the mockup for her display clips.'),
      step('music-program','visit','music-building','Walk to the Music approach','Continue on foot to the reviewed outdoor Music approach.','You reach the program’s quiet interval.',{prop:'board'}),
      notice('music-interval','music-building','Leave a quiet interval','Stand still on foot for a few seconds. Notice the pause; audio is optional and nothing needs to be timed to music.','There is room between the notes.',5),
    ]),
  activity('shared-caption','iris','arts','Museum caption','Carry a caption frame to the museum approach and invite Owen to add a second voice.','6–10 min',35,['outdoor-program'],
    'Sofia’s project gave me an idea: a caption can leave room for a second voice. Take this frame past the museum, then give it to Owen?',
    'Pick up the caption frame. Its game card asks you to notice, then invite somebody else to add a thought.',
    'Iris and Owen put their shared caption beside the program. Sofia gets a credit on the display for the idea that started it.',
    'The caption has room beneath it for a visitor’s thought. Iris likes a display that can keep growing.',[
      pickup('take-caption-frame','law','caption frame','Collect the small caption frame from Iris.','board'),
      notice('museum-caption-pause','moa','Notice before writing','Pause still on foot at the museum’s outdoor approach. This activity asks for noticing, not camera framing.','You give the caption a little context.',5),
      answer('shared-caption-line','moa','Choose the shared caption','Iris’s note reads: “Leave room for another voice.” Which ending matches?','The caption invites another person in.',[
        ['invite','What would you add to this view?',true,'A question makes room for a second voice.'],
        ['final','There is only one correct way to see this.',false,'Iris asked for room for another voice.'],
        ['exclude','Please do not add your own thought.',false,'That closes the invitation Iris wants to make.'],
      ]),
      deliver('owen-caption','jfsb','owen','caption frame','Give Owen the frame so he can add the reading table’s voice.'),
    ]),
  activity('balanced-prototype','priya','science','Bridge prototype','Move a fictional bridge-model card to the test station and choose the braced arrangement shown in its diagram.','4–7 min',25,[],
    'This is a little game prototype. Could you take the model card to our outdoor test station and compare the two arrangements on the diagram?',
    'The model card is beside me. The test card near Benson explains the rule; no engineering knowledge is assumed.',
    'Priya displays the model with its test note: one small change, one clear result. The fictional demo booth is ready to open.',
    'The test note is still beside the model. Priya is proud that you wrote down what you changed.',[
      pickup('take-model-card','eb','bridge-model card','Collect the fictional bridge-model card at Priya’s workshop.','prototype'),
      step('model-test','interact','bnsn','Set up the model test','Place the game model card at the outdoor Benson test marker.','The two arrangements are ready to compare.',{prop:'prototype'}),
      answer('model-bracing','bnsn','Read the test diagram','The game diagram labels a triangle “braced” and an open rectangle “unbraced.” Choose the braced arrangement.','The fictional model follows its printed test diagram.',[
        ['triangle','The triangle shown as braced.',true,'You used the evidence on the card.'],
        ['rectangle','The open rectangle shown as unbraced.',false,'The diagram explicitly labels the triangle as braced.'],
        ['guess','Do not read the diagram; guess.',false,'The test asks you to compare the two labelled arrangements.'],
      ]),
      deliver('return-model-card','eb','priya','bridge-model card','Return the model card and its test note to Priya.'),
    ]),
  activity('readable-demo','priya','science','Demo signs','Bring Mateo a display prototype and notice how a north-campus approach gives a sign room to be seen.','9–15 min',30,['balanced-prototype'],
    'Mateo offered to try a display at the fan booth. Could you take him this prototype and notice the space around the nearby outdoor approach?',
    'Carry the display prototype to Mateo at the Carillon booth. There is a short pause at the Bean Museum approach afterward.',
    'Mateo’s readability note joins Priya’s display. She enlarges the imaginary demo card instead of adding another paragraph.',
    'The demo card still has the bigger lettering Mateo asked for. Priya calls that a successful test.',[
      pickup('take-display','eb','display prototype','Collect the light fictional display prototype from Priya.','prototype'),
      deliver('mateo-display','carillon','mateo','display prototype','Give Mateo the display prototype for an outdoor readability check.'),
      notice('north-sign-space','bean-museum','Give the display some room','Pause still on foot at the museum’s outdoor approach. Notice how much space a simple display needs.','You make a note about a clear, simple display.',5),
      step('readability-note','interact','marriott-center','Leave the test note','Add “larger lettering, fewer words” to the fictional north-campus test card.','The readability test has a useful next change.',{prop:'note'}),
    ]),
  activity('reusable-workshop','priya','science','Workshop supplies','Send Sam a reusable supply case and bring a spare clip set back to the workshop.','8–13 min',35,['readable-demo'],
    'Sam needs a way to carry packing supplies. This prototype case can do that. Could you bring it over and collect the spare clips on your way back?',
    'Take the labelled case to Sam’s south-campus outpost. The clip set waits at the outdoor Life Sciences game card.',
    'Sam reuses the prototype case for volunteer packs. Priya’s workshop display now includes an empty spot labelled “out doing another job.”',
    'Priya keeps the empty spot on purpose. Sam’s case is still doing something useful.',[
      pickup('take-case','eb','reusable supply case','Collect the empty reusable case at Priya’s workshop.','pack'),
      deliver('sam-case','maeser','sam','reusable supply case','Give Sam the case for the volunteer packing table.'),
      pickup('spare-clips','lsb','spare clip set','Collect the labelled fictional clip set from the Life Sciences outdoor card.','prototype'),
      deliver('priya-clips','eb','priya','spare clip set','Bring the spare clip set back to Priya.'),
    ]),
  activity('fan-banner','mateo','north','Fan banner','Prepare a blue-and-white banner card and bring its arrangement back to Mateo.','4–7 min',25,[],
    'Our imaginary fan booth could use a readable banner. Take this layout card to the Marriott approach and help finish the pattern?',
    'The banner layout is on my table. The pattern is printed on the card, so you can take your time.',
    'Mateo opens the blue-and-white banner above his table. He leaves the invitation below it in plain words.',
    'The banner is still up. Mateo likes that somebody new can read the invitation without knowing a chant.',[
      pickup('take-banner-layout','carillon','banner layout','Collect the folded blue-and-white layout card from Mateo.','banner'),
      step('banner-hang','interact','marriott-center','Set out the banner pieces','Arrange the fictional banner pieces at the outdoor Marriott game card.','The banner has room for its final piece.',{prop:'banner'}),
      answer('banner-pattern','marriott-center','Finish the banner pattern','The card shows blue, white, blue, white. Which color follows the next blue?','The blue-and-white layout is complete.',[
        ['white','White',true,'The alternating pattern is complete.'],
        ['blue','Another blue',false,'The printed pattern alternates blue and white.'],
        ['orange','Orange',false,'Use the blue-and-white pattern printed on the card.'],
      ]),
      deliver('return-banner-layout','carillon','mateo','banner layout','Return the banner layout to Mateo so he can open it at the booth.'),
    ]),
  activity('target-crew','mateo','north','Football practice setup','Help set out fictional football-practice target cards, without a timer or score requirement.','7–12 min',30,['fan-banner'],
    'The practice line needs a setup crew before it needs a scoreboard. Could you place the two game target cards and bring me the layout sheet?',
    'Take the layout sheet. The first target card is by Marriott; the second is outside the stadium approach.',
    'Mateo displays the finished target layout. His practice board now says “take another try” instead of listing a high score.',
    'The target layout is still open at the booth. Mateo is recruiting people for a first try, not defending a record.',[
      pickup('target-layout','carillon','target layout sheet','Collect Mateo’s practice-line layout sheet.','target'),
      step('near-target','interact','marriott-center','Set the near target card','Arrange the first fictional football-practice target card at the outdoor approach.','The near target card is ready.',{prop:'target'}),
      step('far-target','interact','stadium','Set the far target card','Continue to the stadium’s reviewed outdoor arrival and arrange the second game target card.','The far target card is ready.',{prop:'target'}),
      notice('target-line-pause','stadium','Check the practice space','Pause still on foot at the outdoor target card. Leave room around a low-pressure practice line.','The layout leaves room for someone’s first try.'),
      deliver('return-target-layout','carillon','mateo','target layout sheet','Bring Mateo the completed layout sheet.'),
    ]),
  activity('visible-cheer','mateo','north','Cheer cards','Bring Leah a visual response card and carry the welcome crew’s reply back north.','8–13 min',35,['target-crew'],
    'A cheer should work for someone playing silently too. Would you take Leah this visual response and bring back the welcome crew’s reply?',
    'The response card reads GO → CREW. Give it to Leah, read the matching game prompt, then collect her reply.',
    'Mateo turns the silent response board toward the path. Leah’s fair table carries the matching card, so the two crews can answer each other.',
    'GO and CREW are still on the response board. Mateo says a quiet player is fully part of the cheer.',[
      pickup('take-response-card','carillon','visual response card','Collect Mateo’s GO → CREW response card.','banner'),
      deliver('leah-response-card','wsc','leah','visual response card','Give Leah the visual response card for the shared table.'),
      answer('visible-response','wsc','Choose the visible response','The complete printed sequence is GO → CREW. The welcome crew shows GO. Which response follows?','The welcome crew has a visible reply.',[
        ['crew','CREW',true,'The printed call-and-response is complete.'],
        ['go','GO again',false,'Read the full printed sequence: GO, then CREW.'],
        ['silence','No response for silent players.',false,'The activity is designed to work entirely with visible words.'],
      ]),
      pickup('take-welcome-reply','wsc','welcome crew reply','Collect Leah’s labelled reply from the WSC game card.','note'),
      deliver('mateo-welcome-reply','carillon','mateo','welcome crew reply','Bring the welcome crew’s reply back to Mateo.'),
    ]),
  activity('care-pack','sam','south','Volunteer kit','Carry a volunteer bag to the south-campus packing card and follow its printed packing plan.','4–7 min',25,[],
    'These are fictional volunteer supplies. Could you help pack one carefully? The printed plan tells us exactly what goes where.',
    'Take the bag to the outdoor JSB packing card. No real giveaway or volunteer shift is implied.',
    'Sam puts the finished game pack on the ready shelf and keeps the packing plan where the next helper can read it.',
    'Your finished pack is on the ready shelf. Sam kept the clear instructions beside it.',[
      pickup('take-volunteer-bag','maeser','volunteer bag','Collect the fictional volunteer bag from Sam’s outpost.'),
      step('fold-pack','interact','jsb','Fold the soft layer','At the outdoor JSB game card, fold the imaginary cloth layer for the pack.','The soft layer is folded.',{prop:'pack'}),
      answer('packing-order','jsb','Follow the packing plan','The printed game plan says “bottle low, soft cloth on top.” Which arrangement matches?','The pack follows its printed plan.',[
        ['cloth-top','Bottle low, cloth on top.',true,'The arrangement matches the complete printed plan.'],
        ['bottle-top','Cloth low, bottle on top.',false,'Read the plan again: bottle low, soft cloth on top.'],
        ['skip','Leave out the cloth layer.',false,'The plan includes both pieces.'],
      ]),
      deliver('return-volunteer-bag','maeser','sam','volunteer bag','Bring the packed bag back to Sam’s ready shelf.'),
    ]),
  activity('leave-a-place-better','sam','south','South campus cleanup','Walk a fictional cleanup route and return the sorted game tokens to Sam.','6–10 min',30,['care-pack'],
    'There are three paper cleanup tokens in this game scene. Could you collect the marked set and sort them by the printed labels?',
    'Pick up the reusable game pouch. The tokens are at the Life Sciences and Eyring outdoor cards.',
    'Sam empties the game pouch into the labelled sorting tray. The outpost now shows a completed cleanup route instead of three loose tokens.',
    'The tray shows the completed route. Sam is glad the reusable pouch is ready for the next small job.',[
      pickup('take-cleanup-pouch','maeser','cleanup pouch','Collect the reusable pouch for this fictional cleanup scene.'),
      step('south-token','interact','lsb','Collect the south game token','Collect the clearly marked paper cleanup token from the outdoor Life Sciences card.','The south token joins the reusable pouch.',{prop:'note'}),
      step('science-tokens','interact','esc','Collect the science game tokens','Collect the two remaining fictional paper tokens at the Eyring outdoor card.','The complete marked set is in the pouch.',{prop:'note'}),
      answer('sort-cleanup','esc','Read the sorting labels','The game tray labels are PAPER and REUSE. The tokens are marked paper. Which tray matches?','The tokens have a labelled destination.',[
        ['paper','PAPER',true,'The printed token material matches the tray label.'],
        ['reuse','REUSE',false,'The pouch is reusable; these marked tokens are paper.'],
        ['ground','Leave them on the ground.',false,'Sam asked you to return the marked set to the sorting tray.'],
      ]),
      deliver('return-cleanup-pouch','maeser','sam','cleanup pouch','Return the token pouch to Sam’s labelled game sorting tray.'),
    ]),
  activity('walking-preparation','sam','south','Walking route prep','Bring Owen a walking-preparation card, take a quiet south-campus pause and return with his note.','8–13 min',35,['leave-a-place-better'],
    'Caleb’s climb is a separate adventure. Before a longer walk, I like a clear plan and permission to pause. Would you ask Owen to help write that card?',
    'Take the preparation card to Owen at JFSB. Bring his labelled note back after a quiet outdoor pause by JSB.',
    'Sam displays Owen’s note: “Take your time; the route will wait.” Caleb gets a named thank-you on the preparation board, without implying you have completed the hike.',
    'The preparation card stays on the outpost board. Sam reminds you that Caleb’s actual climb is its own story.',[
      pickup('take-preparation-card','maeser','walking-preparation card','Collect Sam’s blank preparation card.','note'),
      deliver('owen-preparation','jfsb','owen','walking-preparation card','Give Owen the preparation card for a few careful words.'),
      pickup('owen-walking-note','jfsb','Owen’s walking note','Collect Owen’s labelled walking note beside his story table.','note'),
      notice('walking-pause','jsb','Make room for a pause','Pause still on foot at the reviewed outdoor JSB approach. There is no countdown to beat or real-time appointment.','You leave room in the plan for a quiet pause.',5),
      deliver('sam-walking-note','maeser','sam','Owen’s walking note','Bring Owen’s walking note back to Sam’s outpost.'),
    ]),
  activity('campus-common-table','leah','central','Final fair invitation','Link six finished district stories and bring a final invitation back to the shared table.','10–16 min',50,
    ['shared-table','careful-caption','shared-caption','reusable-workshop','visible-cheer','walking-preparation'],
    'Six corners of campus have become six collaborations. One last invitation? Take it to Sam, pick up the program at Music, and bring it home to the shared table.',
    'The final invitation waits at my table. This is a game gathering, available whenever you are ready; no real-world hour is required.',
    'Leah opens the common-table program. Owen’s card, Iris’s pattern, Priya’s clips, Mateo’s response and Sam’s preparation note now share the display. The campus loop has a place to return to.',
    'The common-table program is still open. Leah remembers every corner that helped make it, and there is still an empty place at the table.',[
      pickup('take-common-invitation','wsc','common-table invitation','Collect Leah’s final invitation from the shared table.','banner'),
      deliver('sam-common-invitation','maeser','sam','common-table invitation','Give Sam the invitation for the volunteer crew.'),
      pickup('collect-common-program','music-building','common-table program','Collect the finished fictional program from the outdoor Music game card.','book'),
      deliver('leah-common-program','wsc','leah','common-table program','Bring the program to Leah at the common table.'),
    ]),
]);

// Stand offsets are meters, while gameplay coordinates use this shared scale.
export const CAMPUS_UNIT=UNIT;
