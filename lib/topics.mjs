// Curated public landing pages, each mapping to the same tag/category filters
// the live calendar uses. Copy stays honest: a topic page only claims the
// coverage its filter actually matches, and counts come from live data.
export const TOPICS=[
 {slug:'free-food',title:'Free Food at BYU',tag:'Food provided',blurb:'Events across BYU where the source itself says food is provided — pizza, lunch, tacos, and more, collected from university and club calendars in one list.'},
 {slug:'snacks',title:'BYU Events with Snacks',tag:'Snacks',blurb:'Cookies, candy, refreshments, and treats — including the free candy tables customarily set out at Tanner Building events.'},
 {slug:'drinks',title:'BYU Events with Drinks',tag:'Drinks',blurb:'Listings that mention provided drinks or soda, from department talks to club socials.'},
 {slug:'free-admission',title:'Free BYU Events',tag:'Free admission',blurb:'Events whose sources confirm free admission — no ticket purchase required.'},
 {slug:'open-invite',title:'Open-Invitation BYU Events',tag:'Open invite',blurb:'Events explicitly open to all BYU students or the public. No membership required.'},
 {slug:'in-person',title:'In-Person BYU Events',tag:'In person',blurb:'Events with a confirmed physical location on or around campus.'},
 {slug:'online',title:'Online BYU Events',tag:'Online',blurb:'Virtual and streamed events you can attend from anywhere.'},
 {slug:'is',title:'Information Systems (IS) Events',tag:'IS',blurb:'Information Systems events at BYU — AIS activities, IS department listings, MISM program events, and Marriott IS calendars, merged into one feed.'},
 {slug:'ais',title:'AIS — Association for Information Systems',tag:'AIS',blurb:'The AIS student chapter\'s public activities calendar: socials, competitions, networking, and IT career events.'},
 {slug:'accounting',title:'BYU Accounting Events',tag:'Accounting',blurb:'Accounting Society meetings, MACC events, Beta Alpha Psi topics, and recruiter sessions for accounting students.'},
 {slug:'finance',title:'BYU Finance Events',tag:'Finance',blurb:'Finance-related seminars, alumni panels, and investment banking and asset management recruiter events.'},
 {slug:'marketing',title:'BYU Marketing Events',tag:'Marketing',blurb:'Marketing Association events and marketing career sessions across the Marriott School.'},
 {slug:'entrepreneurship',title:'BYU Entrepreneurship Events',tag:'Entrepreneurship',blurb:'Builder fests, pitch nights, and Ballard Center and CET programs for BYU founders.'},
 {slug:'clubs',title:'BYU Club Events',tag:'Clubs',blurb:'Club meetings, socials, and activities from connected public calendars and dated student-organization listings. Check each organizer for changes and eligibility.'},
 {slug:'networking',title:'BYU Networking Events',tag:'Networking',blurb:'Mixers, meet-the-firm nights, and professional networking events across campus.'},
 {slug:'workshops',title:'BYU Workshops & Training',tag:'Workshops',blurb:'Hands-on workshops and training sessions, from technical skills to career prep.'},
 {slug:'recruiting',title:'BYU Career Fairs & Recruiting',tag:'Recruiting',blurb:'Career fairs, info sessions, and on-campus recruiting from employers hiring BYU students.'},
 {slug:'engineering',title:'BYU Engineering Events',tag:'Engineering',blurb:'Engineering college events: seminar series, career fairs, and student society activities.'},
 {slug:'computer-science',title:'BYU Computer Science Events',tag:'Computer Science',blurb:'CS department events, tech talks, and cybersecurity and programming activities.'},
 {slug:'math',title:'BYU Math Events',tag:'Math',blurb:'Mathematics department colloquia, ACME activities, and math community events.'},
 {slug:'acme',title:'ACME Events at BYU',tag:'ACME',blurb:'Applied and Computational Mathematics Emphasis activities, including sACME socials.'},
 {slug:'life-sciences',title:'BYU Life Sciences Events',tag:'Life Sciences',blurb:'Life Sciences college events, including Bean Museum programming and department seminars.'},
 {slug:'international',title:'International Events at BYU',tag:'International',blurb:'Kennedy Center lectures and international-focused programming across campus.'},
 {slug:'law',title:'BYU Law Events',tag:'Law',blurb:'Public J. Reuben Clark Law School events: lectures, symposia, and career programming.'},
 {slug:'campus-life',title:'Campus Life at BYU',category:'Campus life',blurb:'The broad BYU campus experience — activities, performances, traditions, and everything student life offers.'},
 {slug:'career-and-business',title:'Career & Business Events at BYU',category:'Career & business',blurb:'Career fairs, employer info sessions, and business events from the Marriott School and across campus.'},
 {slug:'academic',title:'Academic Dates & Events at BYU',category:'Academic',blurb:'Academic deadlines, department seminars, and university academic calendar entries.'},
 {slug:'arts-and-culture',title:'Arts & Culture at BYU',category:'Arts & culture',blurb:'Concerts, theatre, museum exhibitions, and film — BYU\'s performing and fine arts calendar.'},
 {slug:'performances',title:'Shows & Performances at BYU',tag:'Performances',blurb:'Dance showcases, concerts, recitals, comedy nights, and student performances from across campus — searchable even when the listing never uses the word “show”.'},
 {slug:'sports-and-recreation',title:'Sports & Recreation at BYU',category:'Sports & recreation',blurb:'Athletics, intramurals, and recreation events across BYU.'},
 {slug:'faith-and-learning',title:'Faith & Learning at BYU',category:'Faith & learning',blurb:'Devotionals, forums, and religious programming at Brigham Young University.'},
];

const TOPIC_GROUPS={
 career:['career-and-business','recruiting','networking','workshops','is','ais','accounting','finance','marketing','entrepreneurship'],
 stem:['engineering','computer-science','math','acme','life-sciences','workshops','recruiting'],
 perks:['free-food','snacks','drinks','free-admission','open-invite','in-person','online'],
 campus:['campus-life','clubs','performances','arts-and-culture','sports-and-recreation','faith-and-learning','international','law','academic'],
};

export function findTopic(slug){
 return TOPICS.find(topic=>topic.slug===slug)||null;
}

export function topicForTag(tag){
 return TOPICS.find(topic=>topic.tag===tag)||null;
}

export function topicForCategory(category){
 return TOPICS.find(topic=>topic.category===category)||null;
}

export function topicCalendarHref(topic){
 return topic.category?'/?categories='+encodeURIComponent(topic.category):'/?tags='+encodeURIComponent(topic.tag);
}

export function topicDescription(topic){
 const text=String(topic?.blurb||'').trim();
 if(text.length<=155)return text;
 const cut=text.slice(0,154);
 const space=cut.lastIndexOf(' ');
 return (space>90?cut.slice(0,space):cut).replace(/[,:;—-]+$/,'')+'…';
}

export function relatedTopics(topic,count=8){
 const total=TOPICS.length,index=TOPICS.findIndex(t=>t.slug===topic.slug);
 const ring=index>=0?[1,2].map(step=>TOPICS[(index+step)%total]).filter(t=>t&&t.slug!==topic.slug):[];
 const picks=[],seen=new Set([topic.slug,...ring.map(t=>t.slug)]);
 const peerLimit=Math.max(0,count-ring.length);
 for(const group of Object.values(TOPIC_GROUPS)){
  if(!group.includes(topic.slug))continue;
  for(const slug of group){
   if(picks.length>=peerLimit)break;
   if(seen.has(slug))continue;
   const match=findTopic(slug);
   if(match){seen.add(slug);picks.push(match);}
  }
 }
 for(const neighbor of ring){
  if(picks.length>=count)break;
  picks.push(neighbor);
 }
 for(let offset=1;picks.length<count&&offset<total;offset++){
  const candidate=TOPICS[(Math.max(index,0)+offset)%total];
  if(candidate&&!seen.has(candidate.slug)){seen.add(candidate.slug);picks.push(candidate);}
 }
 return picks;
}
