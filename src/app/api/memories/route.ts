import { err, ok, requireSession } from "@/server/api";
import { getAliasUserIds } from "@/server/linking";
import { countMemoriesUnion, listMemoriesUnion } from "@/server/repo";


/** List only the requesting user's memory metadata. Walrus content stays server-side. */
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const stateParam = url.searchParams.get("state");
    const state = stateParam === "active" || stateParam === "superseded" ? stateParam : "all";
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), 100) : 50;
    const ids = await getAliasUserIds(auth.session.userId).catch(() => [auth.session.userId]);
    const [memories, totals] = await Promise.all([listMemoriesUnion(ids, { state, limit }), countMemoriesUnion(ids)]);
    return ok({
      totals,
      memories: memories.map((m) => ({
        blobId: m.blobId,
        memoryKey: m.memoryKey,
        category: m.category,
        state: m.state,
        supersedesBlobId: m.supersedesBlobId,
        createdAt: m.createdAt,
        current: m.state === "active",
      })),
      count: memories.length,
    });
  } catch {
    return err(500, "internal", "Could not list memories");
  }
}
