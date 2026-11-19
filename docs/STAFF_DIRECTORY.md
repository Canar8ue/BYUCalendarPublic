# BYU Staff Auto-Allow Directory Configuration

`lib/staff-directory.mjs` verifies institutional staff sign-ups without an administrator waiting step when an operator-supplied runtime directory is configured.

## Runtime Configuration

To avoid publishing institutional personal email addresses in public repositories, this codebase loads the directory at runtime from the `STAFF_DIRECTORY_JSON` environment variable (defaulting to an empty map).

- Format: a JSON object mapping verified BYU faculty/staff addresses to area IDs from `lib/staff.mjs` (`law`, `computer-science`, `engineering`, `marriott`, `kennedy`, `life-sciences`, `math`, `athletics`).
- Matching rules (`autoVerifyArea`):
  1. Exact lowercase email match against the configured directory.
  2. When a verified account uses a plain `netid@byu.edu` address, it matches a department-subdomain entry (e.g., `netid@dept.byu.edu`) in the directory.
  3. `@student.byu.edu` addresses and arbitrary third-party or unrecognized subdomains never inherit department auto-verification.
- Shared role inboxes, adjunct addresses, and non-BYU domains must never be included in `STAFF_DIRECTORY_JSON`.
