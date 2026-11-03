import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAvatar, rsvpEntry, MAX_AVATAR_CHARS} from '../lib/rsvp.mjs';

test('avatars accept only bounded PNG, JPEG, and WebP data URLs',()=>{
 // A minimal valid PNG data URL passes through unchanged.
 const tiny='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
 assert.equal(cleanAvatar(tiny),tiny);
 assert.equal(cleanAvatar('data:image/jpeg;base64,'+'A'.repeat(100)),'data:image/jpeg;base64,'+'A'.repeat(100));
 // Clearing uses null; everything else a member may not store is rejected.
 assert.equal(cleanAvatar(null),null);
 assert.equal(cleanAvatar(''),null);
 assert.equal(cleanAvatar(undefined),null);
 assert.equal(cleanAvatar('data:image/svg+xml;base64,PHN2Zw=='),undefined,'SVG is refused');
 assert.equal(cleanAvatar('https://example.com/me.png'),undefined,'remote URLs are refused');
 assert.equal(cleanAvatar(42),undefined,'non-strings are refused');
 assert.equal(cleanAvatar('data:image/png;base64,'+'A'.repeat(MAX_AVATAR_CHARS)),undefined,'oversized avatars are refused');
});

test('RSVP entries show initials to everyone and identities to members',()=>{
 const row={name:'Jordan Garcia',email:'jordan@byu.edu',avatar:null};
 assert.deepEqual(rsvpEntry(row,false),{initial:'J',avatar:null});
 assert.deepEqual(rsvpEntry(row,true),{initial:'J',avatar:null,name:'Jordan Garcia',email:'jordan@byu.edu'});
 // Odd names fall back to the email, then a question mark.
 assert.equal(rsvpEntry({name:'',email:'go@byu.edu',avatar:null},false).initial,'G');
 assert.equal(rsvpEntry({name:'',email:'',avatar:null},false).initial,'?');
 assert.equal(rsvpEntry({name:'  byu  ',email:'x@byu.edu',avatar:'data:image/png;base64,AA=='},false).avatar,'data:image/png;base64,AA==');
});
