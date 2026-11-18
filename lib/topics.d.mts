export type Topic={slug:string;title:string;blurb:string;tag?:string;category?:string};
export const TOPICS:Topic[];
export function findTopic(slug:string):Topic|null;
export function topicForTag(tag:string):Topic|null;
export function topicForCategory(category:string):Topic|null;
export function topicCalendarHref(topic:Topic):string;
export function topicDescription(topic:Topic):string;
export function relatedTopics(topic:Topic,count?:number):Topic[];
