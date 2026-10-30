#!/usr/bin/env npx tsx
// Owner-only TasteProof approval handoff (Option C / C3).
// The browser never mints or displays approval tokens: the owner runs this
// from a trusted machine with TASTEPROOF_ISSUER_TOKEN in the environment.
// The server revalidates the exact confirmed inputs before minting; the
// printed approval is a short-lived bearer for those identical inputs only.
// Keep it out of screenshots, logs and chat transcripts. Usage:
//   TASTEPROOF_ISSUER_TOKEN=... npx tsx scripts/mint-taste-approval.ts \
//     --base https://<host> \
//     --anchors "Nobu Restaurant" --anchors "Ryuichi Sakamoto" \
//     --entity-ids "<id-1>" --entity-ids "<id-2>" \
//     --city Lagos --proposed "ILE EROS LAGOS" --proposed "NOK by Alara"
import "dotenv/config";

function usage(exit: number): never {
  console.error(
    [
      "Usage:",
      "  TASTEPROOF_ISSUER_TOKEN=... npx tsx scripts/mint-taste-approval.ts \\",
      "    --base <server-origin> --anchors <name> [--anchors <name>] \\",
      "    --entity-ids <id> [--entity-ids <id>] --city <city> \\",
      "    --proposed <venue> [--proposed <venue>] [--ops verify,investigate]",
      "",
      "Env (server-side, never commit values):",
      "  TASTEPROOF_ISSUER_TOKEN   owner/operator credential for POST /api/tasteapproval",
    ].join("\n")
  );
  process.exit(exit);
}

function takeAll(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && i + 1 < argv.length) out.push(argv[++i]);
  }
  return out;
}

function takeOne(argv: string[], flag: string): string | null {
  const idx = argv.lastIndexOf(flag);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) usage(0);
  const issuer = (process.env.TASTEPROOF_ISSUER_TOKEN ?? "").trim();
  if (!issuer) {
    console.error("Missing TASTEPROOF_ISSUER_TOKEN in the environment. Refusing to mint anonymously.");
    process.exit(1);
  }
  const base = (takeOne(argv, "--base") ?? "").replace(/\/+$/, "");
  const anchors = takeAll(argv, "--anchors").map((s) => s.trim()).filter(Boolean);
  const entityIds = takeAll(argv, "--entity-ids").map((s) => s.trim()).filter(Boolean);
  const city = (takeOne(argv, "--city") ?? "").trim();
  const proposed = takeAll(argv, "--proposed").map((s) => s.trim()).filter(Boolean);
  const opsRaw = (takeOne(argv, "--ops") ?? "verify,investigate").split(",").map((s) => s.trim()).filter(Boolean);
  if (!base || anchors.length < 1 || anchors.length > 3 || entityIds.length !== anchors.length || !city || proposed.length < 1 || proposed.length > 5) {
    usage(2);
  }
  if (!opsRaw.every((o) => o === "verify" || o === "investigate")) usage(2);
  let res: Response;
  try {
    res = await fetch(`${base}/api/tasteapproval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${issuer}` },
      body: JSON.stringify({ anchors, entityIds, city, proposed, ops: opsRaw }),
    });
  } catch (e) {
    console.error(`Request failed: ${String(e).slice(0, 160)}`);
    process.exit(1);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.ok !== true) {
    const code = (json?.error as { code?: string } | undefined)?.code ?? "unknown";
    const message = (json?.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    console.error(`Minting failed [${code}]: ${message}`);
    process.exit(1);
  }
  const approval = json.approval as string;
  const expiresAt = json.expiresAt as number;
  console.log(JSON.stringify({ approval, expiresAt, anchors, entityIds, city, proposed, ops: opsRaw }, null, 2));
  console.log("---");
  console.log("MCP call order (Streamable HTTP POST <base>/api/mcp):");
  console.log("1. tools/list — confirm tasteproof_verify_shortlist + tasteproof_investigate_gap are advertised");
  console.log("2. tools/call tasteproof_capabilities {} — no approval, no provider calls");
  console.log("3. tools/call tasteproof_verify_shortlist {approval, anchors, entityIds, city, proposed}");
  console.log("4. tools/call tasteproof_investigate_gap {approval, anchors, entityIds, city, proposed, target} — only for REVIEW/NOT_OBSERVED targets");
  console.log(`Approval expires at ${new Date(expiresAt).toISOString()} and is bound to these exact inputs. Handle it as a bearer credential.`);
}

void main();
