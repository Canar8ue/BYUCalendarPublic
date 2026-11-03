'use client';
// First-visit filter questions, shown over the launch screen once its
// animation has settled (the loader calls back through onMinWait). Everything
// here borrows the launch screen's own language — BYU-blue field, white
// Archivo, pale-blue accents — so it reads as part of the choreography: the
// choices are plain clickable text, never boxed pills. The calendar stays
// hidden behind the curtain until the visitor clicks one choice (which opens
// the calendar with that filter applied) or skips; nothing else dismisses it.
import {CATEGORIES} from '../lib/catalog.mjs';

export const ONBOARDING_FLAG = 'byucalendar-onboard-v2';
export function onboardingSeen(): boolean {
  try { return Boolean(localStorage.getItem(ONBOARDING_FLAG)); } catch { return true; }
}
export function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_FLAG, 'seen'); } catch {/* stay quiet */}
}

// Quick interests beyond the six categories; every entry is a real calendar tag.
const QUICK_TAGS:[string,string][] = [['Food provided','Free food'],['Snacks','Snacks'],['Clubs','Clubs'],['IS','IS / AIS']];

export default function Onboarding({onDone}:{onDone:(shape:{categories:string[];tags:string[]})=>void}){
 return <div className="onboarding" role="dialog" aria-label="Pick what you want to see">
  <div className="onboarding-questions">
   <div className="onboarding-kicker">WELCOME TO BYU CALENDAR</div>
   <h2>What do you want to see?</h2>
   <p>Tap one and the calendar opens with it. You can change anything after.</p>
   <div className="onboarding-choices">
    {CATEGORIES.map(c=><button key={c.id} className="onboarding-choice" onClick={()=>onDone({categories:[c.id],tags:[]})}>{c.id}</button>)}
    {QUICK_TAGS.map(([tag,label])=><button key={tag} className="onboarding-choice" onClick={()=>onDone({categories:[],tags:[tag]})}>{label}</button>)}
   </div>
   <button className="onboarding-skip" onClick={()=>onDone({categories:[],tags:[]})}>Skip — show everything</button>
  </div>
 </div>;
}
