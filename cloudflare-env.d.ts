declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
    RESEND_INBOUND_SECRET?: string;
    REMINDERS_DISPATCH_TOKEN?: string;
    CALENDAR_INBOX_ADDRESS?: string;
    CALENDAR_ADMIN_EMAILS?: string;
    SEARCH_ASSIST_API_KEY?: string;
    SEARCH_ASSIST_BASE_URL?: string;
    SEARCH_ASSIST_MODEL?: string;
  }
}
