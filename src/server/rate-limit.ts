import { getSql } from "./db";

/**
 * Production-compatible fixed-window rate limiting backed by Postgres.
 * Falls open (allows) only when the database itself is unreachable, so a
 * DB outage degrades to no-limit rather than blocking chat.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
  const sql = getSql();
  const windowSec = Math.max(1, Math.floor(windowMs / 1000));
  try {
    const rows = await sql`
      insert into rate_limits (bucket_key, count, window_start)
      values (${key}, 1, now())
      on conflict (bucket_key) do update set
        count = case
          when rate_limits.window_start < now() - (${windowSec} * interval '1 second')
          then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - (${windowSec} * interval '1 second')
          then now()
          else rate_limits.window_start
        end
      returning count`;
    const count = rows[0].count as number;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export function rateLimitedResponse() {
  return { ok: false as const, error: { code: "rate_limited", message: "Too many requests. Slow down and retry." } };
}
