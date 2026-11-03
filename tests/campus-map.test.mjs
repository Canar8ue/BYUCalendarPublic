import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {campusLocations,resolveCampusLocation,groupCampusEvents} from '../lib/campus-map.mjs';
import {matchesEvent,parseSearch} from '../lib/search.mjs';

const event=(id,location,overrides={})=>({id,title:'Campus gathering',location,format:'In person',start:'2026-09-16T00:00:00Z',end:'2026-09-16T02:00:00Z',allDay:false,category:'Campus life',tags:[],description:'',sourceName:'Test',...overrides});
test('campus room codes and venue aliases resolve to one canonical building',()=>{
 for(const name of ['TNRB 3461','NAC Conference Room (TNRB 3461)','Tanner Building, Provo, Utah, United States','Tanner #151'])assert.equal(resolveCampusLocation(event('a',name))?.code,'TNRB',name);
 for(const name of ['WSC Ballroom & Garden Court','All Over Wilkinson Student Center','3250 in the Wilk','WILK Booth 14','Varsity Theater'])assert.equal(resolveCampusLocation(event('a',name))?.code,'WSC',name);
 assert.equal(resolveCampusLocation(event('a','Clyde Engineering Building'))?.code,'CB');
 assert.equal(resolveCampusLocation(event('a','Engineering Building (EB), Provo'))?.code,'EB');
 assert.equal(resolveCampusLocation(event('a','LaVell Edwards Stadium'))?.code,'LVES');
 assert.equal(resolveCampusLocation(event('a','Marriott Center Annex'))?.code,'MCA');
 assert.equal(resolveCampusLocation(event('a','South Field'))?.id,'w83861533');
});
test('unconfirmed, online, ambiguous and unrelated locations are never pinned by inference',()=>{
 for(const location of ['','TBD','Provo, Utah','Brigham Square','TNRB and WSC','somewhere nearby','Joseph Smith Memorial Building, Salt Lake City','Virtual / TNRB','https://example.org/WSC','TNRBish'])assert.equal(resolveCampusLocation(event('a',location)),null,location);
 assert.equal(resolveCampusLocation(event('a','TNRB',{format:'Online'})),null);
 assert.equal(resolveCampusLocation(event('a','',{title:'Party in the Tanner Building'})),null);
});
test('pins group filtered daily events, preserving category counts and unmapped listings',()=>{
 const events=[event('a','TNRB 151'),event('b','Tanner Building',{category:'Career & business',tags:['Food provided']}),event('c','WSC'),event('d','TBD'),event('e','TNRB',{start:'2026-09-17T00:00:00Z',end:null})];
 const {groups,unmapped}=groupCampusEvents(events,'2026-09-15');
 assert.equal(groups.length,2);assert.equal(groups[0].events.length,2);
 assert.deepEqual(groups[0].colors,[{color:'blue',count:1},{color:'green',count:1}]);assert.deepEqual(unmapped.map(e=>e.id),['d']);
 const filtered=events.filter(e=>matchesEvent(e,parseSearch(''),[],['Food provided']));
 assert.deepEqual(groupCampusEvents(filtered,'2026-09-15').groups[0].events.map(e=>e.id),['b']);
 assert.deepEqual(groupCampusEvents(events,'2026-10-01'),{groups:[],unmapped:[]});
});
test('Mountain dates and exclusive all-day ends are respected by map counts',()=>{
 const events=[event('all','WSC',{allDay:true,start:'2026-09-15',end:'2026-09-17'}),event('night','TNRB',{start:'2026-09-16T05:30:00Z',end:'2026-09-16T07:00:00Z'})];
 assert.equal(groupCampusEvents(events,'2026-09-15').groups.length,2);
 assert.equal(groupCampusEvents(events,'2026-09-16').groups.length,2);
 assert.equal(groupCampusEvents(events,'2026-09-17').groups.length,0);
});
test('lookup anchors and pick identities belong to the paired delivered catalog',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/campus/coordinates.json',import.meta.url),'utf8'));
 const byId=new Map(catalog.features.map(f=>[f.id,f]));
 const ids=new Set();
 for(const location of campusLocations){assert(!ids.has(location.id));ids.add(location.id);assert.deepEqual(location.position,byId.get(location.id).labelPosition);for(const id of location.featureIds)assert(byId.has(id));assert.notEqual(byId.get(location.id).status,'planned');}
 const wsc=campusLocations.find(l=>l.code==='WSC');assert(wsc.featureIds.length>1);
 assert.equal(campusLocations.filter(l=>l.name==='LaVell Edwards Stadium').length,1);
});
test('campus viewer zooms over markers through the public helper, pins never capture the camera, and cache tokens stay in sync',()=>{
 const html=readFileSync(new URL('../public/campus/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/campus/calendar-map.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/campus/calendar-map.css',import.meta.url),'utf8');
 const valley=readFileSync(new URL('../public/campus/valley-context.js',import.meta.url),'utf8');
 // Wheel over a pin zooms the map via the same helper the +/- buttons use; the
 // canvas keeps OrbitControls' native wheel handling. No private internals.
 assert.match(js,/addEventListener\('wheel',event=>\{event\.preventDefault\(\);if\(event\.target!==renderer\.domElement\)zoom\(event\.deltaY<0\?\.9:1\.1\);\},\{passive:false\}\)/);
 assert.doesNotMatch(js,/controls\._on/);
 // Pins answer taps only: forwarding pointerdown into OrbitControls captured the
 // pointer and locked touch look-around after tapping a pin.
 assert.doesNotMatch(js,/labels\.addEventListener\('pointerdown'/);
 assert.match(css,/html,body,canvas,\.pin,\.tools\{touch-action:none\}/);
 const versions=[
  html.match(/calendar-map\.css\?v=([\w-]+)/)?.[1],
  html.match(/calendar-map\.js\?v=([\w-]+)/)?.[1],
  js.match(/valley-context\.js\?v=([\w-]+)/)?.[1],
  js.match(/campus_web\.glb\?v=([\w-]+)/)?.[1],
  js.match(/coordinates\.json\?v=([\w-]+)/)?.[1],
  valley.match(/valley_lod\.glb\?v=([\w-]+)/)?.[1]
 ];
 assert.equal(versions.every(v=>v&&v===versions[0]),true,`Expected matching ?v= tokens across campus assets, got ${versions.join(', ')}`);
});

