import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPUS_ACTIVITIES,CAMPUS_DISTRICTS,CAMPUS_NPCS,CAMPUS_POINTS,CAMPUS_STANDS} from '../public/explorer/game/campus-content.mjs';

test('campus expansion has unique persistent identities and reachable prerequisite chains',()=>{
  for(const list of [CAMPUS_ACTIVITIES,CAMPUS_DISTRICTS,CAMPUS_NPCS,CAMPUS_STANDS]){
    assert.equal(new Set(list.map(value=>value.id)).size,list.length);
    assert.ok(Object.isFrozen(list));
  }
  assert.equal(CAMPUS_ACTIVITIES.length,19);
  assert.equal(CAMPUS_NPCS.length,6);
  assert.equal(CAMPUS_STANDS.length,6);
  assert.equal(CAMPUS_DISTRICTS.length,6);
  const ids=new Set(CAMPUS_ACTIVITIES.map(a=>a.id)),districts=new Set(CAMPUS_DISTRICTS.map(d=>d.id)),npcs=new Set(CAMPUS_NPCS.map(n=>n.id));
  const reached=new Set();
  while(true){const before=reached.size;for(const a of CAMPUS_ACTIVITIES)if(a.requires.every(id=>reached.has(id)))reached.add(a.id);if(before===reached.size)break;}
  assert.deepEqual(reached,ids,'No new story may depend on an unknown, original-district or cyclic prerequisite.');
  for(const a of CAMPUS_ACTIVITIES){
    assert.ok(districts.has(a.district));assert.ok(npcs.has(a.npcId));
    assert.ok(a.requires.every(id=>ids.has(id)&&id!==a.id));
    assert.ok(a.offer&&a.accepted&&a.outcome&&a.revisit&&a.description);
    assert.ok(Number.isInteger(a.xp)&&a.xp>0&&a.xp<=60);
  }
});

test('every authored activity includes a physical journey, meaningful choices and supplied deliveries',()=>{
  const kinds=new Set(['interact','choice','observe','visit','deliver']),points=new Set(Object.values(CAMPUS_POINTS));
  const recipients=new Set([...CAMPUS_NPCS.map(n=>n.id),'maya','eli','nora','jun','sofia']);
  for(const a of CAMPUS_ACTIVITIES){
    assert.ok(a.steps.length>=3&&a.steps.length<=8,a.id);
    assert.equal(new Set(a.steps.map(step=>step.id)).size,a.steps.length,a.id);
    assert.ok(new Set(a.steps.map(step=>step.point.id)).size>=2,a.id+' must leave its starting place.');
    const supplied=new Set();
    for(const step of a.steps){
      assert.ok(kinds.has(step.type),a.id+':'+step.id);
      assert.ok(points.has(step.point),'Every activity object uses a reviewed outdoor arrival.');
      assert.ok(step.label&&step.prompt&&step.complete);
      assert.ok(Number.isFinite(step.point.x)&&Number.isFinite(step.point.z));
      if(step.type==='choice'){
        assert.ok(step.choices.length>=2);
        assert.equal(step.choices.filter(c=>c.correct===true).length,1);
        assert.equal(new Set(step.choices.map(c=>c.id)).size,step.choices.length);
        assert.ok(step.choices.every(c=>c.label&&c.feedback));
      }
      if(step.type==='observe')assert.ok(step.seconds>=3&&step.seconds<=10);
      if(step.type==='deliver'){
        assert.ok(recipients.has(step.npcId));assert.ok(supplied.has(step.item),a.id+': '+step.item+' needs a preceding pickup.');supplied.delete(step.item);
      }else if(step.item)supplied.add(step.item);
    }
    assert.equal(supplied.size,0,a.id+' may not leave an unaccounted carried item.');
  }
});

test('six staffed booths give every new character a distinct role and another named connection',()=>{
  assert.equal(new Set(CAMPUS_STANDS.map(s=>s.npcId)).size,6);
  const known=new Set([...CAMPUS_NPCS.map(n=>n.id),'maya','eli','nora','jun','sofia','caleb']);
  for(const n of CAMPUS_NPCS){
    assert.ok(CAMPUS_STANDS.some(s=>s.npcId===n.id));
    assert.ok(CAMPUS_ACTIVITIES.filter(a=>a.npcId===n.id).length>=3);
    assert.ok(n.greeting&&n.repeat&&n.thanks&&n.bio&&n.accessory);
    assert.ok(n.relationships.length>=2&&n.relationships.every(r=>known.has(r.npcId)&&r.text));
    assert.equal(n.schedule.at(-1).until,720);
    assert.ok(n.schedule.every((s,i)=>s.until>(n.schedule[i-1]?.until||0)&&['home','work','leisure'].includes(s.anchor)));
  }
  for(const s of CAMPUS_STANDS){assert.equal(s.offsetMeters.length,2);assert.ok(s.offsetMeters.every(Number.isFinite));}
});
