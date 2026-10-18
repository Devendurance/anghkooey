import { err, ok, requireSession } from "@/server/api";
import { getGmailStatus } from "@/server/gmail";

/** Connection status for the caller's canonical identity. No token material. */
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const status = await getGmailStatus(auth.session.userId);
    return ok(status);
  } catch {
    return err(500, "internal", "Could not read Gmail status");
  }
}
