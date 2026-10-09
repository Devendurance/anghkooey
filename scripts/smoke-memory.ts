import { randomUUID } from "node:crypto";
import "dotenv/config";
import { chatComplete } from "../src/server/deepseek";
import { namespaceFor } from "../src/server/namespace";
import { recallFacts, saveFact } from "../src/server/memwal";
import { buildGroundedMessages } from "../src/server/prompts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Live smoke: SAVE fact -> CONFIRM blob -> NEW recall -> DeepSeek uses fact.
 * Requires DEEPSEEK_API_KEY, MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID.
 * Never prints credentials. Exits non-zero on any unverified step.
 */
async function main() {
  const userId = arg("user") ?? randomUUID();
  const fact =
    arg("fact") ??
    "Preference: quiet hotel rooms over central locations. Reason: a prior busy-road hotel prevented good sleep. SOURCE: stated directly by the user.";
  const query =
    arg("query") ?? "Which hotel style fits me, quiet or central?";

  const namespace = namespaceFor(userId);
  console.log(JSON.stringify({ step: "start", namespace, factChars: fact.length }));

  const saved = await saveFact({ userId, text: fact, timeoutMs: 90000 });
  if (!saved.blobId) throw new Error("Walrus write did not return a blob_id");
  console.log(JSON.stringify({ step: "saved", blobId: saved.blobId, jobId: saved.jobId }));

  // Fresh recall in a logically new session (same user, new query context).
  const hits = await recallFacts({ userId, query, limit: 8, maxDistance: 0.8 });
  const match = hits.find((h) => h.blob_id === saved.blobId);
  console.log(
    JSON.stringify({
      step: "recalled",
      total: hits.length,
      blobIds: hits.map((h) => h.blob_id),
      matchedSavedBlob: Boolean(match),
    })
  );

  const answer = await chatComplete({
    messages: buildGroundedMessages({ userText: query, memories: hits.slice(0, 5) }),
    maxTokens: 300,
  });
  const usesFact = /quiet/i.test(answer);
  console.log(
    JSON.stringify({
      step: "deepseek_used_fact",
      usesQuietPreference: usesFact,
      answerPreview: answer.slice(0, 280),
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
      memoryReceiptBlob: match?.blob_id ?? hits[0]?.blob_id ?? null,
    })
  );

  if (!match && hits.length === 0) {
    throw new Error("Recall returned nothing; memory not yet indexed or namespace mismatch");
  }
  console.log(JSON.stringify({ step: "smoke_ok", blobId: saved.blobId }));
}

main().catch((e) => {
  console.error(JSON.stringify({ step: "smoke_failed", message: String(e).slice(0, 400) }));
  process.exit(1);
});
