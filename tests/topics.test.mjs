import test from 'node:test';
import assert from 'node:assert/strict';
import {TOPICS,findTopic,topicForTag,topicForCategory,topicDescription,relatedTopics} from '../lib/topics.mjs';

test('every topic is reachable across the related-topics link graph',()=>{
 const visited=new Set([TOPICS[0].slug]);
 const queue=[TOPICS[0]];
 while(queue.length){
  const current=queue.shift();
  for(const next of relatedTopics(current,8)){
   assert.notEqual(next.slug,current.slug);
   if(!visited.has(next.slug)){visited.add(next.slug);queue.push(next);}
  }
 }
 assert.equal(visited.size,TOPICS.length);
});

test('topic lookups and descriptions stay bounded and consistent',()=>{
 assert.equal(topicForTag('Food provided')?.slug,'free-food');
 assert.equal(topicForCategory('Career & business')?.slug,'career-and-business');
 assert.equal(topicForTag('Nonexistent'),null);
 for(const topic of TOPICS){
  assert.equal(findTopic(topic.slug)?.slug,topic.slug);
  const desc=topicDescription(topic);
  assert.ok(desc.length>20&&desc.length<=155,topic.slug);
 }
});
