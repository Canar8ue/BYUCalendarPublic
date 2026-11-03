// Validation and normalization for the moderator inbox. Pure functions so the
// domain tests can run without Worker bindings; persistence lives in
// inbox-server.ts.
import {load} from 'cheerio/slim';
import {RequestError} from './http.mjs';

// Stored bodies are bounded so a giant mail cannot bloat D1 rows; the reply
// text is bounded well below the API payload limits.
export const INBOX_BODY_LIMIT = 100000;
export const INBOX_REPLY_LIMIT = 8000;
const SUBJECT_LIMIT = 500;
const PREVIEW_LIMIT = 160;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function boundedText(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

// Returns the fields worth storing from an `email.received` webhook, or null
// when the mail is not addressed to the configured inbox. Mail for other
// addresses at the receiving domain is acknowledged but never stored.
export function normalizeInboundEmail(data, inboxAddress) {
  if (!data || typeof data !== 'object') return null;
  const id = typeof data.email_id === 'string' ? data.email_id : '';
  if (!id || id.length > 200 || !/^[\w-]+$/.test(id)) return null;
  const to = Array.isArray(data.to) ? data.to.map(value => String(value).trim().toLowerCase()) : [];
  if (!to.includes(inboxAddress)) return null;
  const fromAddress = String(data.from || '').trim().toLowerCase();
  if (fromAddress.length > 254 || !EMAIL_PATTERN.test(fromAddress)) return null;
  const received = new Date(data.created_at || Date.now());
  return {
    id,
    fromAddress,
    toAddress: inboxAddress,
    subject: boundedText(data.subject, SUBJECT_LIMIT).replace(/[\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim(),
    messageId: boundedText(data.message_id, 998).trim(),
    receivedAt: (Number.isNaN(received.getTime()) ? new Date() : received).toISOString(),
  };
}

// Bodies are shown as plain text. HTML-only mail is reduced to text server-
// side; stored content is never re-rendered as HTML in the browser.
export function htmlToText(html) {
  if (typeof html !== 'string' || !html.trim()) return '';
  const $ = load(html);
  $('script,style,noscript,svg,head,iframe,object').remove();
  $('br').replaceWith('\n');
  for (const element of $('p,div,tr,li,blockquote,h1,h2,h3,h4,h5,h6,pre').get()) {
    $(element).after('\n');
  }
  return (($('body').text() || $.root().text()) || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildPreview(text) {
  const firstLine = boundedText(text, 400).split('\n').find(line => line.trim()) || '';
  return firstLine.trim().slice(0, PREVIEW_LIMIT);
}

export function parseReadInput(input) {
  const id = input?.id;
  if (typeof id !== 'string' || !id || id.length > 200) throw new RequestError(400, 'Check your submission.');
  return {id};
}

export function parseReply(input) {
  const id = input?.id;
  if (typeof id !== 'string' || !id || id.length > 200) throw new RequestError(400, 'Check your submission.');
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) throw new RequestError(400, 'Write a reply before sending.');
  if (body.length > INBOX_REPLY_LIMIT) throw new RequestError(400, `Keep replies under ${INBOX_REPLY_LIMIT} characters.`);
  return {id, body};
}
