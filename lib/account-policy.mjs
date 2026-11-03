export const BYU_EMAIL_DOMAINS = ['byu.edu', 'student.byu.edu'];

export function normalizeBYUEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(email)) return null;
  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  return BYU_EMAIL_DOMAINS.includes(domain) ? email : null;
}

export function isVerifiedBYUUser(user) {
  return Boolean(user?.id && user.emailVerified === true && normalizeBYUEmail(user.email));
}

export function permissionsFor(user, adminEmails = '') {
  const verified = isVerifiedBYUUser(user);
  const admins = adminEmails.split(',').map(normalizeBYUEmail).filter(Boolean);
  return {
    addListings: verified,
    addTags: verified,
    reportListings: verified,
    reviewReports: verified && admins.includes(normalizeBYUEmail(user.email)),
  };
}

export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://calendar.invalid');
    if (url.origin !== 'https://calendar.invalid' || url.pathname.startsWith('/api/') || url.pathname === '/signin') return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
