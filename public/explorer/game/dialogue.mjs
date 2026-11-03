import {NPC_DEFINITIONS} from './district-content.mjs?v=20261102polish6';
import {activityStatus} from './activities.mjs?v=20261102polish6';

const choice=(id,label,action=id)=>({id,label,action});
const later=()=>choice('later','See you in a bit.','decline');
const card=(s,id)=>s.maya.stage===3&&!s.maya.cards.includes(id)?[choice('card-'+id,'Hand over Maya’s game-day card.','maya:card:'+id)]:[];

export function getConversation(s,npcId){
  const npc=NPC_DEFINITIONS.find(n=>n.id===npcId);if(!npc)return null;
  const repeat=(s.talks[npcId]||0)>1;
  let text='',choices=[];
  if(npcId==='maya'){
    const lines=[
      repeat?'Back for a cookie, or ready to join the setup crew? We are making this little corner feel like a place to stay.':'Hi! I’m Maya. This is our imaginary game-day cookie stand. A cookie is a great introduction; three pennants and a few invitations make a gathering. Want to help?',
      'Pick one. The sugar cookies have very enthusiastic blue sprinkles. The chocolate ones are quieter, but equally qualified.',
      `I saved the ${s.maya.cookie||'cookie'} for you. Three pennants: library approach, Arts approach, and Library Lane. Place them where the small bases are waiting.`,
      'Look at those pennants! Could you hand these game-day cards to Eli, Jun and Sofia? Give each one to the person, so I know they got the invitation.',
      'Everybody got a card? You made this happen. Come around the counter; I have a thank-you for the cookie crew.',
      'Cookie crew! I still have your colors on the stand. '+(s.eli.stage===5?'Eli can point out Jesse Knight on his map now. ':'Eli is keeping that invitation in his map. ')+(s.jun.stage>=3?'Jun brought his case over. ':'Jun liked the invitation. ')+(s.sofia.stage===3?'Sofia’s photographs are on the board.':'Sofia is collecting stories for her project.'),
    ];text=lines[s.maya.stage];
    if(s.maya.stage===0)choices.push(choice('maya:start','I’ll help get the stand ready.'));
    if(s.maya.stage===1)choices.push(choice('chocolate','Chocolate chip, please.','maya:cookie:chocolate'),choice('sugar','The blue-sprinkle sugar cookie.','maya:cookie:sugar'),choice('oat','Oat cookie for me.','maya:cookie:oat'));
    if(s.maya.stage===4)choices.push(choice('maya:finish','The invitations are delivered.'));
    if(s.eli.stage===3)choices.push(choice('eli:collect','Eli asked for a welcome card.'));
    if(s.jun.stage===2)choices.push(choice('jun:invite','Jun would love to play a little music here.'));
  }
  if(npcId==='eli'){
    const lines=[
      repeat?'I have revised the map. It now says “ask someone kind.” Is that you?':'I’m Eli. My map says JKB and my brain says… absolutely nothing. Could you walk with me to Jesse Knight? I can keep up if we stay near each other.',
      'Jesse Knight. Not Joseph F. Smith. One building, one acronym. I’m following you; slow down a little if I fall behind.',
      'JKB. Jesse Knight Building. I’ve got it now. Maya said there might be a welcome card with a tiny district map on the back. Could you bring me one?',
      'Thanks. I’ll wait here and practice saying the whole name. Maya’s at the cookie stand by the student center.',
      'You came back! Is that the welcome card? I’m putting it in the map, right where the mystery acronyms used to be.',
      repeat?'I found it again by myself. JKB: Jesse Knight. Next time I can show someone else.':'There you are! The welcome card helped. Maya’s stand is my next stop after class. I can point to it on the map now.',
    ];text=lines[s.eli.stage];
    if(s.eli.stage===0)choices.push(choice('eli:start','Let’s walk there together.'));
    if(s.eli.stage===2)choices.push(choice('eli:errand','I’ll ask Maya for the welcome card.'));
    if(s.eli.stage===4)choices.push(choice('eli:finish','Here’s your welcome card.'));
    choices.push(...card(s,'eli'));
  }
  if(npcId==='nora'){
    const crash=s.nora.crashes?'Saw that spill. You all right? No points lost. We will work on the stop. ':'',lines=[
      'I’m Nora. A clean stop is my favorite scooter trick. Want a short lesson, then a careful-turning challenge? No timer. No perfect run required.',
      crash+'First, get moving above 2 m/s. Then hold F — or the Brake button — and come below 1.2 m/s near my workshop. Fast is optional. Control is useful.',
      crash+'Good stop. Now three gates down Library Lane, in order. Stay below 6.5 m/s and take the corners however slowly you like.',
      'You rode the whole practice line. Ready for the workshop challenge? Same gates, below 4 m/s, and hold Brake at the final gate. This deck has been waiting for a careful rider.',
      crash+'Below 4 m/s through all three gates. At the last one, hold Brake. You can pause or come back later; I’ll remember your place.',
      'That was a tidy line. Seafoam workshop deck: yours. You can equip it in the wardrobe. I am still going to compliment the stop more than the speed.',
    ];text=lines[s.nora.stage];
    if(s.nora.stage===0)choices.push(choice('nora:start','Teach me the clean stop.'));
    if(s.nora.stage===3)choices.push(choice('nora:mastery','Let’s try the careful-turning challenge.'));
  }
  if(npcId==='jun'){
    const lines=[
      'I’m Jun. Inside this case: one instrument and several overambitious ideas. I’m taking a phrase over to Music. Meet me there? We can play it with symbols, so sound is optional.',
      'Here is the phrase: Sun, Wave, Star, Wave, Sun, Moon. Watch the symbols, or listen if you like. There is no timer; I care about the shape of it.',
      'That is it. You gave the phrase room to breathe. Would you ask Maya if there is space for a tiny gathering at her stand? A counter makes a pretty good percussion instrument.',
      'Maya made room! I brought my case, and she found the beat in a cookie tray. Ready for our afternoon duet?',
      repeat?'Maya has been tapping that phrase all afternoon. I think the cookie tray has joined the ensemble.':'The phrase sounds different here with people around it. Thanks for helping it find a place outside the practice room.',
    ];text=lines[s.jun.stage];
    if(s.jun.stage===0)choices.push(choice('jun:start','I’ll meet you at Music.'));
    if(s.jun.stage===1)choices.push(choice('jun:play','Play the visual call-and-response.'));
    if(s.jun.stage===3)choices.push(choice('jun:finish','Let’s play the afternoon duet.'));
    choices.push(...card(s,'jun'));
  }
  if(npcId==='sofia'){
    const lines=[
      'I’m Sofia. My final project started as photographs of buildings. Now it is about how places become familiar. Could you help with two compositions: the library entrance and the Arts Building?',
      'For the library: let the entrance pavilion anchor the frame. For Arts: give the building a little breathing room. Stand at each approach, open Photo mode, and point the camera toward the building. I’ll meet you by Maya’s board when both are ready.',
      'There they are. The library feels like a beginning; Arts feels like an invitation. Hang them here? Then people walking past can add their own stories.',
      repeat&&s.eli.stage===5?'Eli recognized your library photograph before he read the caption. That is exactly the project I wanted to make.':s.jun.stage>=3?'Your photographs are on the board. Jun called the Arts one a rest between notes. I am keeping that as the caption.':'Your photographs are on the board. The next person who stops here can add their own story. That is exactly the project I wanted to make.',
    ];text=lines[s.sofia.stage];
    if(s.sofia.stage===0)choices.push(choice('sofia:start','I’ll help with the two compositions.'));
    if(s.sofia.stage===2)choices.push(choice('sofia:finish','Hang the photographs on the board.'));
    choices.push(...card(s,'sofia'));
  }
  choices.push(later());
  const activityId={'maya':'cookie-stand',eli:'newcomer',nora:'scooter-school',jun:'campus-duet',sofia:'photo-board'}[npcId];
  return {id:npcId+':'+s[npcId].stage,npcId,name:npc.name,role:npc.role,color:npc.color,text,choices,objective:activityStatus(s,activityId).text};
}
