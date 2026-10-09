import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { getAliasUserIds } from "@/server/linking";
import { classifyMemwalError, recallFacts, type MemwalDiagnosis } from "@/server/memwal";
import { checkRateLimit, rateLimitedResponse } from "@/server/rate-limit";
import { getMemoriesByBlobIds } from "@/server/repo";

const searchSchema = z.object({ query: z.string().trim().min(2, "Type a few words to search").max(200) });
const LIMIT = 8;

/**
 * Bounded semantic search over the session user's own Walrus namespaces
 * (canonical + merged). Returns matching memories only, never a full
 * inventory. Hits are kept only when their metadata belongs to the alias set.
 */
export async function POST(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const rl = await checkRateLimit(`memsearch:${auth.session.userId}`, 10, 60_000);
  if (!rl.allowed) return err(429, "rate_limited", rateLimitedResponse().error.message);

  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = searchSchema.safeParse(body.value);
  if (!parsed.success) return err(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid search");

  // Settled fan-out: one failing namespace must not discard matches from
  // namespaces that succeeded. Unavailable only when no lookup succeeded.
  let aliasComplete = true;
  let ids: string[];
  try {
    ids = await getAliasUserIds(auth.session.userId);
  } catch {
    ids = [auth.session.userId];
    aliasComplete = false;
  }
  const started = Date.now();
  const settled = await Promise.all(
    ids.map((userId) =>
      recallFacts({ userId, query: parsed.data.query, limit: LIMIT, maxDistance: 0.8 }).then(
        (hits) => ({ ok: true as const, hits, diagnosis: null as MemwalDiagnosis | null }),
        (e: unknown) => ({
          ok: false as const,
          hits: [] as { blob_id: string; text: string; distance: number }[],
          diagnosis:
            ((e as { diagnosis?: MemwalDiagnosis }).diagnosis ?? {
              ...classifyMemwalError(e),
              durationMs: 0,
            }),
        })
      )
    )
  );
  const failed = settled.filter((r) => !r.ok).length;
  if (failed > 0) {
    // Sanitized: counts and failure class only. No query text, no ids.
    const diags = settled.flatMap((r) => (r.diagnosis ? [r.diagnosis] : []));
    const counts = new Map<string, number>();
    for (const d of diags) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    const first = diags.find((d) => d.category === top);
    console.error(
      JSON.stringify({
        op: "search",
        category: top,
        httpStatus: first?.httpStatus ?? null,
        code: first?.code ?? null,
        retryable: diags.some((d) => d.retryable),
        durationMs: Date.now() - started,
        nsFailed: failed,
        nsTotal: settled.length,
      })
    );
  }
  if (failed === settled.length) {
    return err(502, "upstream", "Walrus search is unavailable right now. Try again.");
  }
  try {
    const searchStatus = failed > 0 || !aliasComplete ? "partial" : "ok";
    const hits = settled.flatMap((r) => r.hits).sort((a, b) => a.distance - b.distance);
    const meta = new Map((await getMemoriesByBlobIds(ids, hits.map((h) => h.blob_id))).map((m) => [m.blobId, m]));
    const seen = new Set<string>();
    const matches = hits
      .filter((h) => meta.has(h.blob_id) && !seen.has(h.blob_id) && seen.add(h.blob_id))
      .slice(0, LIMIT)
      .map((h) => {
        const m = meta.get(h.blob_id)!;
        return {
          blobId: h.blob_id,
          text: h.text,
          category: m.category,
          state: m.state,
          memoryKey: m.memoryKey,
          createdAt: m.createdAt,
        };
      });
    return ok({ query: parsed.data.query, matches, limit: LIMIT, searchStatus });
  } catch {
    return err(502, "upstream", "Walrus search is unavailable right now. Try again.");
  }
}
