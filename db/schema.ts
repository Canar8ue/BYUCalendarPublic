import {sqliteTable,text,integer,real,index,uniqueIndex,primaryKey} from "drizzle-orm/sqlite-core";
export const sources=sqliteTable("source_snapshots",{id:text("id").primaryKey(),payload:text("payload").notNull(),lastSuccess:text("last_success").notNull(),lastAttempt:text("last_attempt"),error:text("error"),lockUntil:integer("lock_until").notNull().default(0)});
export const preferences=sqliteTable("user_preferences",{userId:text("user_id").primaryKey(),payload:text("payload").notNull()});
// One daily digest email per member: the opt-in flag (the digest is off until
// the member turns it on) plus the last day a digest was sent, which is what
// makes the morning dispatch idempotent. The legacy opted_out column from
// migration 0005 is retained only so rolling back stays possible.
export const emailDigests=sqliteTable("email_digests",{userId:text("user_id").primaryKey().references(()=>authUser.id,{onDelete:"cascade"}),optedOut:integer("opted_out",{mode:"boolean"}).notNull().default(false),optedIn:integer("opted_in",{mode:"boolean"}).notNull().default(false),lastDay:text("last_day").notNull().default(""),lastSentAt:text("last_sent_at"),lastCount:integer("last_count")});

// "Picked for you" personalization: the chat-built interest profile, plus
// decaying taste counters derived from signed-in activity. Counters store
// categories and tags only — never which specific events a member viewed.
export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => authUser.id, {onDelete: "cascade"}),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const profileActivity = sqliteTable("profile_activity", {
  userId: text("user_id").notNull().references(() => authUser.id, {onDelete: "cascade"}),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  score: real("score").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, t => [primaryKey({columns: [t.userId, t.kind, t.value]})]);

export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', {mode: 'boolean'}).notNull().default(false), image: text('image'),
  createdAt: integer('createdAt', {mode: 'timestamp_ms'}).notNull(), updatedAt: integer('updatedAt', {mode: 'timestamp_ms'}).notNull(),
});
export const authSession = sqliteTable('auth_session', {
  id: text('id').primaryKey(), userId: text('userId').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  token: text('token').notNull().unique(), expiresAt: integer('expiresAt', {mode: 'timestamp_ms'}).notNull(),
  ipAddress: text('ipAddress'), userAgent: text('userAgent'),
  createdAt: integer('createdAt', {mode: 'timestamp_ms'}).notNull(), updatedAt: integer('updatedAt', {mode: 'timestamp_ms'}).notNull(),
}, t => [index('auth_session_user_idx').on(t.userId)]);
export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(), userId: text('userId').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  accountId: text('accountId').notNull(), providerId: text('providerId').notNull(),
  accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', {mode: 'timestamp_ms'}), refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {mode: 'timestamp_ms'}),
  scope: text('scope'), password: text('password'),
  createdAt: integer('createdAt', {mode: 'timestamp_ms'}).notNull(), updatedAt: integer('updatedAt', {mode: 'timestamp_ms'}).notNull(),
}, t => [index('auth_account_user_idx').on(t.userId), uniqueIndex('auth_account_provider_idx').on(t.providerId, t.accountId)]);
export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expiresAt', {mode: 'timestamp_ms'}).notNull(),
  createdAt: integer('createdAt', {mode: 'timestamp_ms'}).notNull(), updatedAt: integer('updatedAt', {mode: 'timestamp_ms'}).notNull(),
}, t => [index('auth_verification_identifier_idx').on(t.identifier)]);
export const authRateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('lastRequest').notNull(),
});
export const actionLimits = sqliteTable('action_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('action_limits_expiry_idx').on(t.expiresAt)]);
export const communityListings = sqliteTable('community_listings', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => authUser.id),
  payload: text('payload').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('community_listings_user_idx').on(t.userId)]);
export const communityTags = sqliteTable('community_tags', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull(), tag: text('tag').notNull(), note: text('note').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('community_tags_event_tag_idx').on(t.eventId, t.tag)]);
export const listingReports = sqliteTable('listing_reports', {
  id: text('id').primaryKey(), eventId: text('event_id').notNull(), userId: text('user_id').notNull().references(() => authUser.id),
  reason: text('reason').notNull(), details: text('details').notNull(), eventSnapshot: text('event_snapshot').notNull(),
  status: text('status').notNull().default('open'), createdAt: text('created_at').notNull(),
  reviewedAt: text('reviewed_at'), reviewedBy: text('reviewed_by').references(() => authUser.id),
}, t => [index('listing_reports_status_idx').on(t.status, t.createdAt), uniqueIndex('listing_reports_event_user_idx').on(t.eventId, t.userId)]);
export const listingModeration = sqliteTable('listing_moderation', {
  eventId: text('event_id').primaryKey(), hidden: integer('hidden', {mode: 'boolean'}).notNull(),
  reviewedBy: text('reviewed_by').notNull().references(() => authUser.id), updatedAt: text('updated_at').notNull(),
  snapshot: text('snapshot'),
});
// Moderator corrections for source listings: the patch is layered over the
// merged calendar at read time so source refreshes cannot revert it.
export const eventOverrides = sqliteTable('event_overrides', {
  eventId: text('event_id').primaryKey(), patch: text('patch').notNull(),
  reviewedBy: text('reviewed_by').notNull().references(() => authUser.id), updatedAt: text('updated_at').notNull(),
});
export const inboundEmails = sqliteTable('inbound_emails', {
  id: text('id').primaryKey(), fromAddress: text('from_address').notNull(), toAddress: text('to_address').notNull(),
  subject: text('subject').notNull().default(''), preview: text('preview').notNull().default(''),
  bodyText: text('body_text').notNull().default(''), messageId: text('message_id'),
  receivedAt: text('received_at').notNull(), readAt: text('read_at'), repliedAt: text('replied_at'),
}, t => [index('inbound_emails_received_idx').on(t.receivedAt)]);
export const emailReplies = sqliteTable('email_replies', {
  id: text('id').primaryKey(), inboundId: text('inbound_id').notNull(), toAddress: text('to_address').notNull(),
  subject: text('subject').notNull(), bodyText: text('body_text').notNull(),
  sentBy: text('sent_by').notNull(), sentAt: text('sent_at').notNull(),
}, t => [index('email_replies_inbound_idx').on(t.inboundId)]);
// Aggregate, cookieless usage analytics: no account ids, names, or IP addresses
// are ever written here — only the action, coarse request context, and a day key.
export const analyticsEvents = sqliteTable('analytics_events', {
  id: integer('id').primaryKey({autoIncrement: true}),
  ts: text('ts').notNull(), day: text('day').notNull(), type: text('type').notNull(),
  name: text('name').notNull().default(''), detail: text('detail'),
  country: text('country'), device: text('device'), referrer: text('referrer'),
}, t => [index('analytics_day_idx').on(t.day, t.type), index('analytics_lookup_idx').on(t.type, t.name, t.day)]);
// BYU professor/staff verification: pending until an administrator approves,
// unless the address is on the auto-allow directory. Verified staff publish
// "BYU added event" listings and can correct listings inside their area.
export const staffAccounts = sqliteTable("staff_accounts", {
  userId: text("user_id").primaryKey().references(() => authUser.id, {onDelete: "cascade"}),
  email: text("email").notNull(), name: text("name").notNull(), area: text("area").notNull(),
  status: text("status").notNull().default("pending"),
  autoVerified: integer("auto_verified", {mode: "boolean"}).notNull().default(false),
  requestedAt: text("requested_at").notNull(),
  resolvedAt: text("resolved_at"), resolvedBy: text("resolved_by"),
}, t => [index('staff_accounts_status_idx').on(t.status)]);
// Public RSVP records and profiles: saving an event lists the member on its
// RSVP page (unless they opt out), optionally with an avatar they uploaded.
export const eventSaves = sqliteTable("event_saves", {
  userId: text("user_id").notNull().references(() => authUser.id, {onDelete: "cascade"}),
  eventId: text("event_id").notNull(),
  savedAt: text("saved_at").notNull(),
}, t => [primaryKey({columns: [t.userId, t.eventId]}), index('event_saves_event_idx').on(t.eventId)]);
export const publicProfiles = sqliteTable("public_profiles", {
  userId: text("user_id").primaryKey().references(() => authUser.id, {onDelete: "cascade"}),
  avatar: text("avatar"),
  hidden: integer("hidden", {mode: "boolean"}).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});
