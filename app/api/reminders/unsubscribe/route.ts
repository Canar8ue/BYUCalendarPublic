import {unsubscribeRequest} from '../../../../lib/reminders-server';
export const dynamic = 'force-dynamic';

// GET is the link mail clients render; POST is the RFC 8058 one-click
// List-Unsubscribe handoff, which carries the same signed query parameters.
export async function GET(request: Request) {
  return unsubscribeRequest(request);
}

export async function POST(request: Request) {
  return unsubscribeRequest(request);
}
