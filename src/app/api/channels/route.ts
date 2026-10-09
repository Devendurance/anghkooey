import { err, ok, requireSession } from "@/server/api";
import { getChannelStatus } from "@/server/linking";

/** Telegram/iMessage link status for the session's own identity only. */
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    return ok(await getChannelStatus(auth.session.userId));
  } catch {
    return err(500, "internal", "Could not read channel status");
  }
}
