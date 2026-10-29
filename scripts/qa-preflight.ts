// Fail-closed preflight guard for database-writing test runs.
// Resolves the EFFECTIVE database URL exactly as the app would see it:
// inherited process env wins; otherwise the untracked .env fallback
// (Next.js never overrides inherited env with .env files).
// Refuses when the URL is missing, matches the known production .env
// fingerprint, or is not on the owner-approved untracked allowlist.
// Never prints URLs, credentials, or fingerprints. Exits non-zero on refusal.
//
//   tsx scripts/qa-preflight.ts            # check only
//   tsx scripts/qa-preflight.ts --approve  # owner: approve current effective URL
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ALLOWLIST = join(ROOT, ".qa-allowlist");

function fp(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function parseDbUrl(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("DATABASE_URL=") && !l.startsWith("DATABASE_URL_POOLED"));
  if (!line) return null;
  const v = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  return v || null;
}

/** Fingerprint of the known production URL in untracked .env. Never printed. */
function prodFingerprint(): string | null {
  try {
    if (!existsSync(join(ROOT, ".env"))) return null;
    const v = parseDbUrl(readFileSync(join(ROOT, ".env"), "utf8"));
    return v ? fp(v) : null;
  } catch {
    return null;
  }
}

function allowlist(): string[] {
  try {
    if (!existsSync(ALLOWLIST)) return [];
    return readFileSync(ALLOWLIST, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f]{64}$/.test(s));
  } catch {
    return [];
  }
}

function fail(reason: string): never {
  console.error(`QA preflight REFUSED: ${reason}`);
  process.exit(1);
}

const shellUrl = (process.env.DATABASE_URL ?? "").trim();
let fileUrl: string | null = null;
try {
  if (existsSync(join(ROOT, ".env"))) fileUrl = parseDbUrl(readFileSync(join(ROOT, ".env"), "utf8"));
} catch {
  fileUrl = null;
}
// Next.js precedence: inherited env wins, .env file is the fallback.
const effective = shellUrl || fileUrl || "";
if (!effective) {
  fail("no DATABASE_URL in process env or .env. Source .env.qa with the QA branch URL explicitly; refusing to guess.");
}
const digest = fp(effective);
const prod = prodFingerprint();
if (prod && digest.length === prod.length && timingSafeEqual(Buffer.from(digest), Buffer.from(prod))) {
  fail("effective DATABASE_URL matches the production .env fingerprint. Set the isolated QA branch URL instead.");
}
if (process.argv.includes("--approve")) {
  const list = allowlist();
  if (!list.includes(digest)) {
    appendFileSync(ALLOWLIST, `${digest}\n`, { mode: 0o600 });
  }
  console.log("QA preflight: current effective URL approved (fingerprint recorded, value never printed).");
  process.exit(0);
}
if (!allowlist().includes(digest)) {
  fail("effective DATABASE_URL is not on the owner-approved QA allowlist (.qa-allowlist). Ask the owner to run the approve step for the isolated QA branch.");
}
console.log("QA preflight PASS: effective DATABASE_URL is an approved isolated QA target.");
