import {z} from 'zod';
import {readAccount, authConfiguration} from '../../../../lib/auth';
import {requireContributor} from '../../../../lib/community-store.mjs';
import {setDigestOptIn} from '../../../../lib/reminders-server';
import {json, readJSON, requireSameOrigin, errorResponse, RequestError} from '../../../../lib/http.mjs';
export const dynamic = 'force-dynamic';
const schema = z.object({optedIn: z.boolean()}).strict();

export async function POST(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    requireSameOrigin(request, authConfiguration().origin);
    const parsed = schema.safeParse(await readJSON(request, 1000));
    if (!parsed.success) throw new RequestError(400, 'Invalid digest setting.');
    return json(await setDigestOptIn(user.id, parsed.data.optedIn));
  } catch (error) { return errorResponse(error); }
}
