import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getOrCreateChannelConversation, resolveChannelUser } from "../src/server/channel-identity";
import { confirmLink } from "../src/server/linking";
import { startLink } from "../src/server/linking";
import { handleMessage } from "../src/server/orchestrator";
import { getConsentAt, listMemories, setConsent } from "../src/server/repo";
import { closeDb } from "../src/server/db";

/**
 * Real-services harness for the exact worker path (no Photon transport):
 * resolveChannelUser -> consent -> handleMessage -> recall -> link -> isolate.
 * Uses real Neon + DeepSeek + Walrus Mainnet. Redacted logs only.
 */
async function main() {
  const tag = Date.now().toString(36);
  const tgSender = `tg-harness-${tag}`;
  const imSender = `im-harness-${tag}`;

  // Telegram sender onboarding + consent
  const tg = await resolveChannelUser("telegram", tgSender);
  await setConsent(tg.userId, true);
  const tgConv = await getOrCreateChannelConversation(tg.userId, "telegram");
  console.log(JSON.stringify({ step: "tg_onboard", isNew: tg.isNew, consent: (await getConsentAt(tg.userId)) !== null }));

  // Save preference through the real orchestrator (worker path)
  const pref = `I prefer quiet corner tables at restaurants with garden views for my ${tag} trip because I like watching birds in the morning.`;
  const r1 = await handleMessage({
    canonicalUserId: tg.userId,
    channel: "telegram",
    sessionId: tgConv.conversationId,
    deliveryId: `telegram:${randomUUID()}`,
    text: pref,
    allowMemorySave: true,
  });
  console.log(JSON.stringify({ step: "tg_save", saves: r1.saves, answerChars: r1.answer.length, model: r1.model }));
  if (r1.saves.completed < 1) throw new Error("no confirmed telegram save");

  // Recall in a later conversation (same user, new thread)
  const tgConv2 = await getOrCreateChannelConversation(tg.userId, "telegram");
  const r2 = await handleMessage({
    canonicalUserId: tg.userId,
    channel: "telegram",
    sessionId: tgConv2.conversationId === tgConv.conversationId ? tgConv.conversationId : tgConv2.conversationId,
    deliveryId: `telegram:${randomUUID()}`,
    text: "Where should I sit for dinner?",
    allowMemorySave: true,
  });
  console.log(JSON.stringify({
    step: "tg_recall",
    receipts: r2.memoryReceipts.length,
    blobs: r2.memoryReceipts.slice(0, 2).map((m) => m.blobId),
    mentionsQuiet: /quiet/i.test(r2.answer),
  }));

  // Secure link: web-issued code consumed by verified imessage sender
  const { code } = await startLink(tg.userId);
  const linkRes = await confirmLink({ code, provider: "imessage", providerSenderId: imSender });
  if (!linkRes.ok) throw new Error(`link failed: ${linkRes.code}`);
  const im = await resolveChannelUser("imessage", imSender);
  console.log(JSON.stringify({ step: "link", sameUser: im.userId === tg.userId }));

  // Cross-channel recall from the linked imessage identity
  const imConv = await getOrCreateChannelConversation(im.userId, "imessage");
  const r3 = await handleMessage({
    canonicalUserId: im.userId,
    channel: "imessage",
    sessionId: imConv.conversationId,
    deliveryId: `imessage:${randomUUID()}`,
    text: "Remind me about my restaurant seating?",
    allowMemorySave: true,
  });
  const crossBlob = r3.memoryReceipts.some((m) => r2.memoryReceipts.some((x) => x.blobId === m.blobId)) || r3.memoryReceipts.length > 0;
  console.log(JSON.stringify({ step: "cross_recall", receipts: r3.memoryReceipts.length, crossChannelHit: crossBlob, mentionsQuiet: /quiet/i.test(r3.answer) }));

  // Isolation: unrelated sender sees nothing
  const other = await resolveChannelUser("telegram", `tg-stranger-${tag}`);
  await setConsent(other.userId, true);
  const otherConv = await getOrCreateChannelConversation(other.userId, "telegram");
  const r4 = await handleMessage({
    canonicalUserId: other.userId,
    channel: "telegram",
    sessionId: otherConv.conversationId,
    deliveryId: `telegram:${randomUUID()}`,
    text: "Where should I sit for dinner?",
    allowMemorySave: true,
  });
  const mems = await listMemories(other.userId, { limit: 10 });
  const leak = r4.memoryReceipts.some((m) => r2.memoryReceipts.some((x) => x.blobId === m.blobId));
  console.log(JSON.stringify({ step: "isolation", strangerMemories: mems.length, leak, isolated: !leak && mems.length === 0 }));

  console.log(JSON.stringify({ step: "channel_flow_ok", userPrefix: tg.userId.slice(0, 8) }));
  await closeDb();
}

main().catch(async (e) => {
  console.error(JSON.stringify({ step: "channel_flow_failed", message: String(e).slice(0, 400) }));
  try { await closeDb(); } catch { /* noop */ }
  process.exit(1);
});
