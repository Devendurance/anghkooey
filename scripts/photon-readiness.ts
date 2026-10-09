import "dotenv/config";
import { pingDb, closeDb } from "../src/server/db";

/** Read-only readiness: env presence only, SDK load, DB ping. Never prints values. */
async function main() {
  const keys = [
    "PHOTON_PROJECT_ID",
    "PHOTON_PROJECT_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "APP_SESSION_SECRET",
    "DATABASE_URL",
    "DEEPSEEK_API_KEY",
    "MEMWAL_PRIVATE_KEY",
    "MEMWAL_ACCOUNT_ID",
    "MEMWAL_SERVER_URL",
  ] as const;
  const env: Record<string, "present" | "missing"> = {};
  for (const k of keys) env[k] = process.env[k] ? "present" : "missing";

  let spectrum = "missing";
  let providers = { telegram: false, imessage: false };
  try {
    const mod = await import("spectrum-ts");
    spectrum = typeof mod.Spectrum === "function" ? "12.10.1" : "loaded";
    const tg = await import("spectrum-ts/providers/telegram");
    const im = await import("spectrum-ts/providers/imessage");
    providers = { telegram: typeof tg.telegram?.config === "function", imessage: typeof im.imessage?.config === "function" };
  } catch (e) {
    spectrum = `load_failed:${String(e).slice(0, 120)}`;
  }

  let db: unknown = { ok: false, message: "DATABASE_URL missing" };
  if (env.DATABASE_URL === "present") {
    try {
      db = await pingDb(8000);
    } catch (e) {
      db = { ok: false, message: String(e).slice(0, 200) };
    } finally {
      await closeDb().catch(() => {});
    }
  }

  const prodSecretRequired = process.env.NODE_ENV === "production" ? env.APP_SESSION_SECRET === "present" : true;
  console.log(JSON.stringify({ env, spectrum, providers, db, prodSecretRequired }, null, 2));
  const fatal = env.PHOTON_PROJECT_ID === "missing" || env.PHOTON_PROJECT_SECRET === "missing" || env.TELEGRAM_BOT_TOKEN === "missing";
  if (fatal) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, message: String(e).slice(0, 300) }));
  process.exit(1);
});
