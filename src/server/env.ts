import { z } from "zod";

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().min(1, "DEEPSEEK_API_KEY is required"),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  // Official current model: deepseek-flash at https://api.deepseek.com.
  // Fully configurable via DEEPSEEK_MODEL; no silent fallback elsewhere.
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-flash"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MEMWAL_PRIVATE_KEY: z.string().min(1, "MEMWAL_PRIVATE_KEY is required"),
  MEMWAL_ACCOUNT_ID: z.string().min(1, "MEMWAL_ACCOUNT_ID is required"),
  MEMWAL_SERVER_URL: z
    .string()
    .url()
    .default("https://relayer.memory.walrus.xyz"),
  APP_SESSION_SECRET: z.string().min(16).optional(),
  WEB_BASE_URL: z.string().url().optional(),
  PHOTON_PROJECT_ID: z.string().optional(),
  PHOTON_PROJECT_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(
      `Missing or invalid server env: ${missing.join(", ")}. See .env.example.`
    );
  }
  cached = parsed.data;
  return cached;
}

/** Presence-only diagnostics. Never returns secret values. */
export function envDiagnostics(): Record<string, "present" | "missing"> {
  const keys = [
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "DEEPSEEK_MODEL",
    "DATABASE_URL",
    "MEMWAL_PRIVATE_KEY",
    "MEMWAL_ACCOUNT_ID",
    "MEMWAL_SERVER_URL",
    "PHOTON_PROJECT_ID",
    "PHOTON_PROJECT_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "APP_SESSION_SECRET",
    "WEB_BASE_URL",
  ] as const;
  const out: Record<string, "present" | "missing"> = {};
  for (const k of keys) out[k] = process.env[k] ? "present" : "missing";
  return out;
}

/** For tests: clear the cached env. */
export function __resetEnvCache() {
  cached = null;
}
