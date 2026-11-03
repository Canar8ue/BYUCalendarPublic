// Server-side staff verification flows: sign-up requests (auto-verified when
// the address is on the researched directory), administrator review, and the
// read-time join that marks official listings. Never imported by client code.
import {staffArea} from './staff.mjs';
import {autoVerifyArea} from './staff-directory.mjs';
import {RequestError} from './http.mjs';
import {isVerifiedBYUUser} from './account-policy.mjs';

// A staff request comes from a verified BYU member naming their area. Directory
// members are verified on the spot; everyone else waits for an administrator.
export async function requestStaffStatus(db, account, input) {
  if (!account.user) throw new RequestError(401, 'Sign in with your BYU email to request staff status.');
  if (!isVerifiedBYUUser(account.user)) throw new RequestError(403, 'Verify your BYU email before requesting staff status.');
  const area = staffArea(input?.area);
  if (!area) throw new RequestError(400, 'Choose the field you work in.');
  const auto = autoVerifyArea(account.user.email);
  const autoMatch = auto ? staffArea(auto) || area : area;
  const status = auto ? 'verified' : 'pending';
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO staff_accounts(user_id,email,name,area,status,auto_verified,requested_at,resolved_at,resolved_by)
    VALUES(?,?,?,?,?,?,?,NULL,NULL)
    ON CONFLICT(user_id) DO UPDATE SET area=excluded.area,status=excluded.status,auto_verified=excluded.auto_verified,requested_at=excluded.requested_at,resolved_at=NULL,resolved_by=NULL`)
    .bind(account.user.id, account.user.email, account.user.name || '', autoMatch.id, status, auto ? 1 : 0, now).run();
  return {status, area: autoMatch.id, autoVerified: Boolean(auto)};
}

export async function staffAccountFor(db, userId) {
  if (typeof userId !== 'string' || !userId) return null;
  const row = await db.prepare('SELECT user_id,area,status,auto_verified,name FROM staff_accounts WHERE user_id=?').bind(userId).first();
  return row ? {userId: row.user_id, area: row.area, status: row.status, autoVerified: Boolean(row.auto_verified), name: row.name} : null;
}

// The public account payload exposes only what the UI needs.
export async function staffStateFor(db, userId) {
  const row = await staffAccountFor(db, userId);
  if (!row) return null;
  return {status: row.status, area: row.area, areaLabel: staffArea(row.area)?.label || row.area, autoVerified: row.autoVerified};
}

function requireAdministrator(account) {
  if (!account.user || !account.permissions.reviewReports) throw new RequestError(403, 'Staff review is available to calendar administrators.');
  return account.user;
}

export async function listStaffAccounts(db, account) {
  requireAdministrator(account);
  const {results} = await db.prepare('SELECT user_id,email,name,area,status,auto_verified,requested_at,resolved_at FROM staff_accounts ORDER BY CASE status WHEN \'pending\' THEN 0 WHEN \'verified\' THEN 1 ELSE 2 END,requested_at DESC LIMIT 200').all();
  return results.map(row => ({userId: row.user_id, email: row.email, name: row.name, area: row.area, areaLabel: staffArea(row.area)?.label || row.area, status: row.status, autoVerified: Boolean(row.auto_verified), requestedAt: row.requested_at, resolvedAt: row.resolved_at}));
}

export async function resolveStaffAccount(db, account, input) {
  const admin = requireAdministrator(account);
  const userId = typeof input?.userId === 'string' ? input.userId : '';
  const action = input?.action;
  if (!userId || !['approve', 'deny', 'revoke'].includes(action)) throw new RequestError(400, 'Choose a staff request and an action.');
  const row = await db.prepare('SELECT user_id,status FROM staff_accounts WHERE user_id=?').bind(userId).first();
  if (!row) throw new RequestError(404, 'That staff request no longer exists.');
  const now = new Date().toISOString();
  const status = action === 'approve' ? 'verified' : 'denied';
  await db.prepare('UPDATE staff_accounts SET status=?,resolved_at=?,resolved_by=? WHERE user_id=?').bind(status, now, admin.id, userId).run();
  return {ok: true};
}

// Verified staff indexed by user id, for the read path.
export async function verifiedStaffByUserId(db) {
  const {results} = await db.prepare('SELECT user_id,area,name FROM staff_accounts WHERE status=\'verified\'').all();
  return new Map(results.map(row => [row.user_id, row]));
}

// Staff keep every student power, plus one: correcting listings inside their
// area. Deletion and hiding stay with administrators.
export async function staffEditGrant(db, account) {
  if (!account.user || !account.permissions.addListings) return null;
  const row = await staffAccountFor(db, account.user.id);
  if (!row || row.status !== 'verified') return null;
  return {userId: row.userId, area: row.area};
}
