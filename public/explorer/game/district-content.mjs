import {UNIT, LOCATIONS, CAT_TRAIL, TRIALS} from './content.mjs?v=20261102polish6';

// Authored game scenes. These are fictional students and a fictional promotion,
// never real calendar listings or a claim about present-day giveaways.
const location = id => {const p=LOCATIONS.find(value=>value.id===id);return {x:p.x,z:p.z};};
const point = (id,name,p,extra={}) => Object.freeze({id,name,x:p.x,z:p.z,...extra});
export const DISTRICT_POINTS = Object.freeze({
  stand:point('cookie-stand','Maya’s cookie stand',location('wsc')),
  library:point('library','Library approach',location('hbll')),
  jkb:point('jkb','Jesse Knight approach',location('jkb')),
  arts:point('arts','Arts approach',location('arts-building')),
  music:point('music','Music approach',location('music-building')),
  moa:point('moa','Museum of Art approach',location('moa')),
  lane:point('lane','Library Lane',CAT_TRAIL[2]),
  nora:point('nora','Nora’s scooter workshop',CAT_TRAIL[1]),
  pennants:Object.freeze([
    point('library','Library pennant',location('hbll')),
    point('arts','Arts pennant',location('arts-building')),
    point('lane','Library Lane pennant',CAT_TRAIL[2]),
  ]),
  gates:Object.freeze(TRIALS[0].points.slice(1).map((p,index)=>point('gate-'+index,'Practice gate '+(index+1),p))),
  photos:Object.freeze([
    point('library','A new chapter',location('hbll'),{target:'hbll',description:'Frame the library’s entrance pavilion from its outdoor approach.'}),
    point('arts','A place to make things',location('arts-building'),{target:'arts-building',description:'Frame the Arts Building from its outdoor approach.'}),
  ]),
});

const character = (id,name,role,color,accessory,home,work,leisure,bio) => Object.freeze({
  id,name,role,color,jacket:color,pack:id==='nora'?'#d8bd79':'#a56b4a',accessory,bio,
  home,work,leisure,schedule:Object.freeze([{until:240,anchor:'work'},{until:480,anchor:'leisure'},{until:720,anchor:'home'}].map(Object.freeze)),
});
export const NPC_DEFINITIONS = Object.freeze([
  character('maya','Maya','Cookie stand host','#3d78b2','apron',DISTRICT_POINTS.stand,DISTRICT_POINTS.stand,DISTRICT_POINTS.arts,'The organizer with a tray of cookies, a football pennant and a plan for making strangers feel welcome.'),
  character('eli','Eli','New student','#d9a64e','map',DISTRICT_POINTS.library,DISTRICT_POINTS.jkb,DISTRICT_POINTS.stand,'He can remember a whole story; a string of building acronyms is another matter.'),
  character('nora','Nora','Scooter tinkerer','#427d70','tools',DISTRICT_POINTS.nora,DISTRICT_POINTS.nora,DISTRICT_POINTS.lane,'A careful rider who treats a clean stop as a more impressive trick than a fast lap.'),
  character('jun','Jun','Music student','#7b649f','case',DISTRICT_POINTS.arts,DISTRICT_POINTS.music,DISTRICT_POINTS.stand,'Carries a music case and hears rhythms in ordinary campus sounds. Happy to rehearse without sound.'),
  character('sofia','Sofia','Student photographer','#be795d','camera',DISTRICT_POINTS.moa,DISTRICT_POINTS.moa,DISTRICT_POINTS.stand,'Her final project is about the people who make familiar buildings feel like home.'),
]);

export const ACTIVITIES = Object.freeze([
  {id:'cookie-stand',npcId:'maya',title:'Maya’s cookie stand',description:'Choose a cookie, arrange three pennants and invite the district to Maya’s fictional football booth.',xp:60,reward:'60 XP and Cookie Crew colors',total:5},
  {id:'newcomer',npcId:'eli',title:'Help Eli find Jesse Knight',description:'Walk with Eli to Jesse Knight, then bring back a welcome card from Maya.',xp:50,reward:'50 XP',total:5},
  {id:'scooter-school',npcId:'nora',title:'Scooter practice',description:'Learn a controlled brake, ride three practice gates, then try Nora’s careful-turning challenge.',xp:60,reward:'60 XP and the workshop deck',total:5},
  {id:'campus-duet',npcId:'jun',title:'Jun’s rehearsal',description:'Meet Jun at Music, play a visual call-and-response and invite Maya to a small gathering.',xp:50,reward:'50 XP',total:4},
  {id:'photo-board',npcId:'sofia',title:'Sofia’s photo board',description:'Help Sofia compose two campus photographs and exhibit them at the stand.',xp:50,reward:'50 XP',total:3},
].map(Object.freeze));
export const ACTIVITY_REWARDS = Object.freeze(ACTIVITIES.map(a=>Object.freeze({id:'activity:'+a.id,xp:a.xp,activityId:a.id})));
export const RHYTHM_SEQUENCE = Object.freeze([0,1,2,1,0,3]);
export const RHYTHM_NOTES = Object.freeze(['Sun','Wave','Star','Moon']);
export const COOKIE_CHOICES = Object.freeze(['chocolate','sugar','oat']);
export const INTERACTION_DISTANCE = 4*UNIT;
