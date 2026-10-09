import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    prepare: false,
  });
  return sql;
}

export async function pingDb(timeoutMs = 5000): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  const client = getSql();
  const probe = client`select 1 as ok`;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("db ping timeout")), timeoutMs)
  );
  await Promise.race([probe, timeout]);
  return { ok: true, latencyMs: Date.now() - start };
}

export async function closeDb() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
