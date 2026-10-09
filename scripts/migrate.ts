import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not configured. See .env.example.");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const files = ["001_init.sql", "002_slice2.sql", "003_merge.sql"];
    const applied: string[] = [];
    for (const f of files) {
      const p = path.resolve(scriptDir, "..", "db", "migrations", f);
      const migration = await readFile(p, "utf8");
      await sql.unsafe(migration);
      applied.push(f.replace(/\.sql$/, ""));
    }
    console.log(JSON.stringify({ ok: true, migrations: applied }));
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: String(e).slice(0, 300) }));
  process.exit(1);
});
