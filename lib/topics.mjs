// Curated public landing pages, each mapping to the same tag/category filters
// the live calendar uses. Copy stays honest: a topic page only claims the
// coverage its filter actually matches, and counts come from live data.
export const TOPICS=[
 {slug:'free-food',title:'Free food at BYU',tag:'Food provided',blurb:'Events across BYU where the source itself says food is provided — pizza, lunch, tacos, and more, collected from university and club calendars in one list.'},
 {slug:'snacks',title:'BYU events with snacks',tag:'Snacks',blurb:'Cookies, candy, refreshments, and treats — including the free candy tables customarily set out at Tanner Building events.'},
 {slug:'drinks',title:'BYU events with drinks',tag:'Drinks',blurb:'Listings that mention provided drinks or soda, from department talks to club socials.'},
 {slug:'free-admission',title:'Free BYU events',tag:'Free admission',blurb:'Events whose sources confirm free admission — no ticket purchase required.'},
 {slug:'open-invite',title:'Open-invitation BYU events',tag:'Open invite',blurb:'Events explicitly open to all BYU students or the public. No membership required.'},
 {slug:'in-person',title:'In-person BYU events',tag:'In person',blurb:'Events with a confirmed physical location on or around campus.'},
 {slug:'online',title:'Online BYU events',tag:'Online',blurb:'Virtual and streamed events you can attend from anywhere.'},
 {slug:'is',title:'Information Systems (IS) events',tag:'IS',blurb:'Information Systems events at BYU — AIS activities, IS department listings, MISM program events, and Marriott IS calendars, merged into one feed.'},
 {slug:'ais',title:'AIS — Association for Information Systems',tag:'AIS',blurb:'The AIS student chapter\'s public activities calendar: socials, competitions, networking, and IT career events.'},
 {slug:'accounting',title:'BYU accounting events',tag:'Accounting',blurb:'Accounting Society meetings, MACC events, Beta Alpha Psi topics, and recruiter sessions for accounting students.'},
 {slug:'finance',title:'BYU finance events',tag:'Finance',blurb:'Finance-related seminars, alumni panels, and investment banking and asset management recruiter events.'},
 {slug:'marketing',title:'BYU marketing events',tag:'Marketing',blurb:'Marketing Association events and marketing career sessions across the Marriott School.'},
 {slug:'entrepreneurship',title:'BYU entrepreneurship events',tag:'Entrepreneurship',blurb:'Builder fests, pitch nights, and Ballard Center and CET programs for BYU founders.'},
 {slug:'clubs',title:'BYU club events',tag:'Clubs',blurb:'Meetings, socials, and activities from BYU\'s hundreds of student organizations — collected from the public club directory and department calendars.'},
 {slug:'networking',title:'BYU networking events',tag:'Networking',blurb:'Mixers, meet-the-firm nights, and professional networking events across campus.'},
 {slug:'workshops',title:'BYU workshops & training',tag:'Workshops',blurb:'Hands-on workshops and training sessions, from technical skills to career prep.'},
 {slug:'recruiting',title:'BYU career fairs & recruiting',tag:'Recruiting',blurb:'Career fairs, info sessions, and on-campus recruiting from employers hiring BYU students.'},
 {slug:'engineering',title:'BYU engineering events',tag:'Engineering',blurb:'Engineering college events: seminar series, career fairs, and student society activities.'},
 {slug:'computer-science',title:'BYU computer science events',tag:'Computer Science',blurb:'CS department events, tech talks, and cybersecurity and programming activities.'},
 {slug:'math',title:'BYU math events',tag:'Math',blurb:'Mathematics department colloquia, ACME activities, and math community events.'},
 {slug:'acme',title:'ACME events at BYU',tag:'ACME',blurb:'Applied and Computational Mathematics Emphasis activities, including sACME socials.'},
 {slug:'life-sciences',title:'BYU life sciences events',tag:'Life Sciences',blurb:'Life Sciences college events, including Bean Museum programming and department seminars.'},
 {slug:'international',title:'International events at BYU',tag:'International',blurb:'Kennedy Center lectures and international-focused programming across campus.'},
 {slug:'law',title:'BYU Law events',tag:'Law',blurb:'Public J. Reuben Clark Law School events: lectures, symposia, and career programming.'},
 {slug:'campus-life',title:'Campus life at BYU',category:'Campus life',blurb:'The broad BYU campus experience — activities, performances, traditions, and everything student life offers.'},
 {slug:'career-and-business',title:'Career & business events at BYU',category:'Career & business',blurb:'Career fairs, employer info sessions, and business events from the Marriott School and across campus.'},
 {slug:'academic',title:'Academic dates & events at BYU',category:'Academic',blurb:'Academic deadlines, department seminars, and university academic calendar entries.'},
 {slug:'arts-and-culture',title:'Arts & culture at BYU',category:'Arts & culture',blurb:'Concerts, theatre, museum exhibitions, and film — BYU\'s performing and fine arts calendar.'},
 {slug:'performances',title:'Shows & performances at BYU',tag:'Performances',blurb:'Dance showcases, concerts, recitals, comedy nights, and student performances from across campus — searchable even when the listing never uses the word “show”.'},
 {slug:'sports-and-recreation',title:'Sports & recreation at BYU',category:'Sports & recreation',blurb:'Athletics, intramurals, and recreation events across BYU.'},
 {slug:'faith-and-learning',title:'Faith & learning at BYU',category:'Faith & learning',blurb:'Devotionals, forums, and religious programming at Brigham Young University.'},
];

export function findTopic(slug){
 return TOPICS.find(topic=>topic.slug===slug)||null;
}

export function topicCalendarHref(topic){
 return topic.category?'/?categories='+encodeURIComponent(topic.category):'/?tags='+encodeURIComponent(topic.tag);
}
