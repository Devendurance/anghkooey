import "dotenv/config";
import { envDiagnostics } from "../src/server/env";
import { pingDb, closeDb } from "../src/server/db";
import { checkDeepSeek } from "../src/server/deepseek";
import { checkWalrus } from "../src/server/memwal";

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function main() {
  const env = envDiagnostics();
  const out: Record<string, unknown> = { env, services: {} as Record<string, unknown> };

  if (env.DATABASE_URL === "present") {
    try {
      const db = await withTimeout(pingDb(8000), 9000, "db");
      (out.services as Record<string, unknown>).db = { ...db };
    } catch (e) {
      (out.services as Record<string, unknown>).db = {
        ok: false,
        message: String(e).slice(0, 200),
      };
    } finally {
      await closeDb().catch(() => {});
    }
  } else {
    (out.services as Record<string, unknown>).db = { ok: false, message: "DATABASE_URL missing" };
  }

  if (env.DEEPSEEK_API_KEY === "present") {
    (out.services as Record<string, unknown>).deepseek = await withTimeout(
      checkDeepSeek(),
      25000,
      "deepseek"
    );
  } else {
    (out.services as Record<string, unknown>).deepseek = {
      ok: false,
      message: "DEEPSEEK_API_KEY missing",
    };
  }

  if (env.MEMWAL_PRIVATE_KEY === "present" && env.MEMWAL_ACCOUNT_ID === "present") {
    (out.services as Record<string, unknown>).walrus = await withTimeout(
      checkWalrus(),
      25000,
      "walrus"
    );
  } else {
    (out.services as Record<string, unknown>).walrus = {
      ok: false,
      message: "MEMWAL credentials missing",
    };
  }

  (out.services as Record<string, unknown>).photon = {
    ok: false,
    message:
      env.PHOTON_PROJECT_ID === "present"
        ? "Photon adapter lands in Slice 3; credentials present but transport not yet verified"
        : "PHOTON credentials missing (Slice 3)",
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: String(e).slice(0, 300) }));
  process.exit(1);
});
