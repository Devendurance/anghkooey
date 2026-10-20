import "dotenv/config";
import { createHash } from "node:crypto";
import { Spectrum } from "spectrum-ts";
import { telegram } from "spectrum-ts/providers/telegram";
import { imessage } from "spectrum-ts/providers/imessage";
import { getOrCreateChannelConversation, resolveChannelUser } from "../src/server/channel-identity";
import { cancelMerge, confirmLink, confirmMerge, getCanonicalUserId, requestMerge } from "../src/server/linking";
import { handleMessage } from "../src/server/orchestrator";
import { isHotelsCommand, parseContactCommand, type DiscoveryResult } from "../src/server/hotel-contacts";
import {
  approveBatch,
  cancelBatch,
  formatApprovalPrompt,
  formatBatchResult,
  formatBatchStatusView,
  getBatchMode,
  getBatchStatus,
  getPendingBatchPreviews,
  isCancelAllCommand,
  isInquiriesCommand,
  isInquireCommand,
  isPreviewAllCommand,
  issueBatchCode,
  parseSendAllCommand,
  prepareBatch,
  renderBatchPreviews,
} from "../src/server/gmail-batch";
import {
  approveAndSend,
  cancelPending,
  formatPreviewMessage,
  getPendingDraft,
  isCancelCommand,
  isPrepareCommand,
  isPreviewCommand,
  parseSendCommand,
  prepareDraft,
} from "../src/server/gmail-send";
import { getConsentAt, listMemories, setConsent } from "../src/server/repo";
import { checkRateLimit } from "../src/server/rate-limit";
import { isDuplicateDeliveryError } from "../src/server/repo";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(JSON.stringify({ worker: "photon", fatal: `missing_env:${name}` }));
    process.exit(1);
  }
  return v;
}

function hash12(v: string): string {
  return createHash("sha256").update(v).digest("hex").slice(0, 12);
}

const LINK_CODE_RE = /^[A-Za-z0-9_-]{32}$/;
const CONSENT_YES_RE = /^(yes|yeah|yep|i agree|agree|enable memory|turn on memory|\/consent|consent yes)$/i;

function helpText(channel: string): string {
  const start = channel === "telegram" ? "/start /help /memory /connect" : "HELP, MEMORY, CONNECT";
  // Same predicate as the batch sender: anything but an explicit live flag
  // is test mode, so HELP never implies hotels get contacted while it is off.
  const batchScope =
    getBatchMode() === "live"
      ? "Batch mail goes to the verified hotel contacts."
      : "While live sending is off, batch mail goes only to the controlled test inbox. No hotel is contacted.";
  return [
    "Anghkooey here. I remember your hotel, travel and dining preferences.",
    `Start here: ${start}. Memory stays off until you say YES.`,
    "MEMORY: review saved preferences. YES: enable saving. CONNECT: link web and chat (send the code from your web session; codes expire in 10 min).",
    "HOTELS: TRIP BRIEF with destination and dates plans a stay. HOTELS shows the shortlist. CONTACT 1,2 finds contact methods (forms are links only, never submitted).",
    "GMAIL: EMAIL prepares one inquiry. PREVIEW inspects the draft. SEND <code> approves that exact email once. CANCEL stops the pending draft.",
    "MULTI-HOTEL: INQUIRE 1,2 prepares a batch. PREVIEW ALL inspects it. SEND ALL <code> approves that exact batch. INQUIRIES checks status. CANCEL ALL stops the pending batch.",
    batchScope,
    "A Gmail receipt confirms Gmail accepted the email, not delivery to the inbox. Nothing sends until you approve it.",
  ].join("\n");
}

async function main() {
  const projectId = need("PHOTON_PROJECT_ID");
  const projectSecret = need("PHOTON_PROJECT_SECRET");
  const botToken = need("TELEGRAM_BOT_TOKEN");
  need("DATABASE_URL");
  need("DEEPSEEK_API_KEY");
  need("MEMWAL_PRIVATE_KEY");
  need("MEMWAL_ACCOUNT_ID");
  if (process.env.NODE_ENV === "production" && !process.env.APP_SESSION_SECRET) {
    console.error(JSON.stringify({ worker: "photon", fatal: "missing_env:APP_SESSION_SECRET" }));
    process.exit(1);
  }

  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [telegram.config({ botToken }), imessage.config()],
  });
  console.log(JSON.stringify({ worker: "photon", ready: true, providers: ["telegram", "imessage"] }));

  const shutdown = async () => {
    console.log(JSON.stringify({ worker: "photon", shutdown: "stopping" }));
    try {
      await app.stop();
    } catch {
      // best effort
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for await (const [space, message] of app.messages) {
    const started = Date.now();
    try {
      if (message.direction === "outbound") continue;
      const platform =
        message.platform === "telegram" ? "telegram" : message.platform === "imessage" ? "imessage" : null;
      if (!platform) continue; // only launch channels in this worker

      const senderId = message.sender?.id != null ? String(message.sender.id) : null;
      if (!senderId) {
        await space.send("I could not verify who sent that, so I did not act on it. Please resend from your own account.");
        continue;
      }

      // Group chats are out of scope for personal memory.
      const spaceType = (space as unknown as { type?: string }).type;
      if (spaceType === "group") {
        await message.reply("I only use personal memory in direct messages, not group chats.");
        continue;
      }

      if (message.content.type !== "text") {
        await message.reply("I can only read text messages here. Please send your request as text.");
        continue;
      }
      const text = message.content.text.trim().slice(0, 4000);
      if (!text) continue;

      const rl = await checkRateLimit(`channel:${platform}:${hash12(senderId)}`, 20, 60_000);
      if (!rl.allowed) {
        await message.reply("You are sending messages too quickly. Please wait a moment and try again.");
        continue;
      }

      const { userId, isNew } = await resolveChannelUser(platform, senderId);
      const { conversationId } = await getOrCreateChannelConversation(userId, platform);
      let consentAt = await getConsentAt(userId).catch(() => null);

      const lower = text.toLowerCase();
      if (lower === "/start" || lower === "start") {
        await space.responding(async () => {
          await message.reply(
            isNew || !consentAt
              ? `Welcome. ${helpText(platform)}`
              : `Welcome back. Memory is ${consentAt ? "ON" : "OFF"}. ${helpText(platform)}`
          );
        });
        continue;
      }
      if (lower === "/help" || lower === "help") {
        await message.reply(helpText(platform));
        continue;
      }
      if (lower === "/memory" || lower === "memory") {
        const mems = await listMemories(userId, { state: "active", limit: 50 }).catch(() => []);
        await message.reply(
          mems.length === 0
            ? "I hold no confirmed memories for you yet. State a preference and I will save it once memory is ON."
            : `I hold ${mems.length} confirmed memor${mems.length === 1 ? "y" : "ies"} for you. To fix one, just tell me the correction in plain words.`
        );
        continue;
      }
      if (lower === "/connect" || lower === "connect") {
        await message.reply(
          "To use one memory across web and this chat: 1) open your web session and create a link code, 2) send that code here as a single message. If this chat already has its own saved memories, I will ask you to confirm the consolidation before anything changes. Codes expire after 10 minutes and work once."
        );
        continue;
      }
      if (lower === "merge yes" || lower === "/merge-yes") {
        const res = await confirmMerge({ provider: platform, providerSenderId: senderId });
        if (res.ok) {
          await message.reply(
            "Done. This chat now shares one memory with your web account. Nothing saved was lost; your earlier memories are still recalled."
          );
        } else if (res.code === "expired") {
          await message.reply("That consolidation window expired. Send a fresh web code here to start over.");
        } else if (res.code === "used") {
          await message.reply("That consolidation was already decided. Send a fresh web code if you still need to link.");
        } else {
          await message.reply("There is no pending consolidation for this chat. Send a fresh web code here to start one.");
        }
        console.log(
          JSON.stringify({ worker: "photon", event: "merge_confirm", platform, ok: res.ok, latency_ms: Date.now() - started })
        );
        continue;
      }
      if (lower === "merge no" || lower === "/merge-no") {
        const cancelled = await cancelMerge({ provider: platform, providerSenderId: senderId });
        await message.reply(
          cancelled
            ? "Cancelled. This chat keeps its own separate memory. Send a fresh web code any time to try again."
            : "There is no pending consolidation for this chat."
        );
        continue;
      }

      // Secure linking: code from the message, identity from the verified event.
      if (LINK_CODE_RE.test(text)) {
        const res = await confirmLink({ code: text, provider: platform, providerSenderId: senderId });
        if (res.ok) {
          await message.reply("Linked. This chat now shares memory with your web account.");
        } else if (res.code === "conflict") {
          // Existing standalone account: open an explicit approval window.
          const mr = await requestMerge({ code: text, provider: platform, providerSenderId: senderId });
          if (mr.ok) {
            const parts = mr.sourceMemories === 0 && mr.targetMemories === 0
              ? "Neither side holds confirmed memories yet."
              : `This chat holds ${mr.sourceMemories} confirmed memor${mr.sourceMemories === 1 ? "y" : "ies"}; your web account holds ${mr.targetMemories}.`;
            await message.reply(
              `${parts} Reply MERGE YES within 15 minutes to consolidate this chat into your web account, or MERGE NO to keep them separate. Nothing changes until you confirm, and nothing saved is deleted either way.`
            );
          } else if (mr.code === "expired" || mr.code === "used") {
            await message.reply("That code expired or was already used. Please create a fresh one and send it here.");
          } else {
            await message.reply("I did not recognize that code. Please check it and try again.");
          }
        } else if (res.code === "expired") {
          await message.reply("That code expired. Please create a fresh one and send it here.");
        } else if (res.code === "used") {
          await message.reply("That code was already used. Please create a fresh one.");
        } else {
          await message.reply("I did not recognize that code. Please check it and try again.");
        }
        console.log(
          JSON.stringify({ worker: "photon", event: "link_attempt", platform, ok: res.ok, latency_ms: Date.now() - started })
        );
        continue;
      }

      // Consent onboarding: explicit YES enables durable memory.
      if (!consentAt && CONSENT_YES_RE.test(text)) {
        await setConsent(userId, true);
        consentAt = await getConsentAt(userId).catch(() => new Date().toISOString());
        await message.reply("Memory is now ON. Tell me a hotel, travel or dining preference and I will remember it.");
        continue;
      }

      // Gmail approved single send. Runs before the generic orchestrator so
      // approvals never trigger memory extraction or an LLM reply.
      const sendCode = parseSendCommand(text);
      if (sendCode || isPreviewCommand(text) || isCancelCommand(text) || isPrepareCommand(text)) {
        const { getCanonicalUserId } = await import("../src/server/linking");
        const canonical = await getCanonicalUserId(userId).catch(() => userId);
        const gmailLog = (event: string, status: string) =>
          console.log(
            JSON.stringify({
              worker: "photon",
              event,
              platform,
              sender_hash: hash12(senderId),
              status,
              latency_ms: Date.now() - started,
            })
          );
        try {
          if (sendCode) {
            const rl = await checkRateLimit(`gmail:send:${hash12(senderId)}`, 5, 60_000);
            if (!rl.allowed) {
              await message.reply("You are sending approvals too quickly. Wait a moment and try again.");
              continue;
            }
            const outcome = await approveAndSend({ canonicalUserId: canonical, code: sendCode });
            if (outcome.status === "sent") {
              await message.reply(
                `Accepted by Gmail (receipt ${outcome.gmailMessageId.slice(0, 12)}). Your inquiry was handed to Gmail; delivery to the inbox is up to Gmail.`
              );
            } else if (outcome.status === "already_sent") {
              await message.reply(
                `That approval was already used (receipt ${outcome.gmailMessageId.slice(0, 12)}). Nothing was sent twice.`
              );
            } else if (outcome.status === "invalid_code") {
              await message.reply("That code doesn't match a pending email. Reply PREVIEW to see the current draft.");
            } else if (outcome.status === "expired") {
              await message.reply("That approval expired. Ask for a fresh preview to approve again.");
            } else if (outcome.status === "cancelled") {
              await message.reply("That email was cancelled. Ask for a new preview to start over.");
            } else if (outcome.status === "failed" && outcome.errorCode === "refresh_failed") {
              await message.reply("Gmail needs reconnecting. Open Settings and connect Gmail again.");
            } else if (outcome.status === "failed") {
              await message.reply("Gmail didn't accept it, so nothing was sent. Reply PREVIEW for a fresh draft.");
            } else if (outcome.status === "unknown" && outcome.errorCode === "receipt_unstored") {
              await message.reply(
                "Gmail accepted your email, but I couldn't save the receipt. Check your Gmail Sent folder to confirm, then reply PREVIEW before approving anything again."
              );
            } else {
              await message.reply(
                "The send outcome is uncertain — Gmail may already have it — so it was NOT retried. Check your Gmail Sent folder before approving anything again."
              );
            }
            gmailLog("gmail_send", outcome.status);
            continue;
          }
          if (isPreviewCommand(text)) {
            const draft = await getPendingDraft(canonical);
            if (!draft) {
              await message.reply("No pending email. Say EMAIL to prepare a hotel inquiry.");
            } else if (draft.expired) {
              await message.reply("The pending email expired. Say EMAIL to prepare a fresh one.");
            } else {
              await message.reply(formatPreviewMessage({ ...draft, code: null }).slice(0, 3500));
            }
            gmailLog("gmail_preview", draft ? (draft.expired ? "expired" : "shown") : "none");
            continue;
          }
          if (isCancelCommand(text)) {
            const { cancelled } = await cancelPending(canonical);
            await message.reply(cancelled ? "Cancelled. No email was sent." : "No pending email to cancel.");
            gmailLog("gmail_cancel", cancelled ? "cancelled" : "none");
            continue;
          }
          const rl = await checkRateLimit(`gmail:prepare:${hash12(senderId)}`, 5, 60_000);
          if (!rl.allowed) {
            await message.reply("You are preparing emails too quickly. Wait a moment and try again.");
            continue;
          }
          const prepared = await prepareDraft({ canonicalUserId: canonical, conversationId });
          if (prepared.status === "no_gmail") {
            await message.reply("No Gmail connected for this chat. Connect Gmail in your web Settings first.");
          } else if (prepared.status === "need_info") {
            await message.reply(
              `To draft the email I still need: ${prepared.missing.join(", ")}. Tell me, then say EMAIL again.`
            );
          } else {
            await space.responding(async () => {
              await message.reply(formatPreviewMessage(prepared.preview).slice(0, 3500));
            });
          }
          gmailLog("gmail_prepare", prepared.status);
          continue;
        } catch {
          // Uncaught here means the outcome is genuinely unknown: the throw
          // may have happened after Gmail accepted the message. Never claim
          // nothing was sent.
          await message.reply("Could not confirm the send outcome. Check Gmail Sent before attempting another send.");
          gmailLog("gmail_error", "uncertain");
          continue;
        }
      }

      // Hotel shortlist and contact verification. Read-only until a future
      // batch milestone: never sends email, never touches Gmail credentials.
      // Runs before the generic orchestrator so selections stay exact.
      const contactSel = parseContactCommand(text);
      if (isHotelsCommand(text) || contactSel) {
        const canonical = await getCanonicalUserId(userId).catch(() => userId);
        const hotelLog = (event: string, status: string) =>
          console.log(
            JSON.stringify({
              worker: "photon",
              event,
              platform,
              sender_hash: hash12(senderId),
              status,
              latency_ms: Date.now() - started,
            })
          );
        try {
          const rl = await checkRateLimit(`hotels:${hash12(senderId)}`, 10, 60_000);
          if (!rl.allowed) {
            await message.reply("You are checking hotels too quickly. Wait a moment and try again.");
            continue;
          }
          const { getActiveShortlist, isShortlistUsable } = await import("../src/server/hotel-contacts");
          const shortlist = await getActiveShortlist(canonical);
          const today = new Date().toISOString().slice(0, 10);
          if (!shortlist || shortlist.items.length === 0) {
            await message.reply("No hotel shortlist yet. Ask for a TRIP BRIEF with destination and dates first.");
            hotelLog(contactSel ? "hotel_contact" : "hotel_list", "none");
            continue;
          }
          if (!isShortlistUsable(shortlist, today)) {
            await message.reply("That shortlist is no longer current. Ask for a fresh TRIP BRIEF to refresh candidates.");
            hotelLog(contactSel ? "hotel_contact" : "hotel_list", "stale");
            continue;
          }
          if (!contactSel) {
            const { formatShortlistMessage } = await import("../src/server/hotel-contacts");
            await message.reply(formatShortlistMessage(shortlist).slice(0, 3500));
            hotelLog("hotel_list", "shown");
            continue;
          }
          if (contactSel.some((n) => n < 1 || n > shortlist.items.length)) {
            await message.reply(`Pick numbers 1 to ${shortlist.items.length} from your current shortlist. Reply HOTELS to see it.`);
            hotelLog("hotel_contact", "invalid");
            continue;
          }
          const { discoverHotelContact, formatContactResults, saveContactResult } = await import("../src/server/hotel-contacts");
          const results: { position: number; name: string; result: DiscoveryResult }[] = [];
          await space.responding(async () => {
            for (const n of contactSel) {
              const item = shortlist.items[n - 1];
              const result = await discoverHotelContact({ name: item.name, sourceUrl: item.sourceUrl });
              await saveContactResult({ canonicalUserId: canonical, shortlistId: shortlist.id, position: n, result }).catch(() => false);
              results.push({ position: n, name: item.name, result });
            }
            await message.reply(formatContactResults(shortlist, results).slice(0, 3500));
          });
          hotelLog("hotel_contact", "done");
          continue;
        } catch {
          await message.reply("Something went wrong looking up hotels. No email was sent. Try again in a moment.");
          hotelLog(contactSel ? "hotel_contact" : "hotel_list", "failed");
          continue;
        }
      }

      // Approved multi-hotel outreach. Read-only until an explicit SEND ALL
      // approval for the exact snapshot. Never touches Gmail-C single sends.
      const inquireSel = isInquireCommand(text);
      const sendAllCode = parseSendAllCommand(text);
      const isBatchCmd =
        inquireSel !== null || sendAllCode !== null || isPreviewAllCommand(text) || isCancelAllCommand(text) || isInquiriesCommand(text);
      if (isBatchCmd) {
        const { getCanonicalUserId } = await import("../src/server/linking");
        const canonical = await getCanonicalUserId(userId).catch(() => userId);
        const batchLog = (event: string, status: string) =>
          console.log(
            JSON.stringify({
              worker: "photon",
              event,
              platform,
              sender_hash: hash12(senderId),
              status,
              latency_ms: Date.now() - started,
            })
          );
        try {
          const rl = await checkRateLimit(`gmailbatch:${hash12(senderId)}`, sendAllCode ? 5 : 10, 60_000);
          if (!rl.allowed) {
            await message.reply("You are sending batch requests too quickly. Wait a moment and try again.");
            continue;
          }
          if (sendAllCode) {
            const outcome = await approveBatch({ canonicalUserId: canonical, code: sendAllCode });
            if (outcome.status === "invalid_code") {
              await message.reply("That code doesn't match a pending email batch. Reply INQUIRIES to check status.");
            } else if (outcome.status === "expired") {
              await message.reply("That batch approval expired. Say INQUIRE 1 to prepare a fresh batch.");
            } else if (outcome.status === "cancelled") {
              await message.reply("That batch was cancelled. Say INQUIRE 1 to start over.");
            } else if (outcome.status === "live_disabled") {
              await message.reply("Live sending is currently disabled, so nothing was sent. The batch is unchanged.");
            } else {
              await message.reply(formatBatchResult({ mode: outcome.mode, items: outcome.items }).slice(0, 3500));
            }
            batchLog("gmail_batch_send", outcome.status);
            continue;
          }
          if (isPreviewAllCommand(text)) {
            const st = await getBatchStatus(canonical);
            if (!st.found || st.status !== "pending") {
              await message.reply("No pending email batch. Say INQUIRE 1 to prepare one from your shortlist.");
            } else {
              const previews = await getPendingBatchPreviews(canonical);
              if (previews.length === 0) {
                await message.reply("No pending email batch. Say INQUIRE 1 to prepare one from your shortlist.");
              } else {
                // Parts already fit iMessage limits; send them whole so no
                // character of the approved preview can be lost in transit.
                for (const part of renderBatchPreviews(previews, st.mode ?? "test")) {
                  await message.reply(part);
                }
                await message.reply("Use the code from the original approval message to approve this exact batch.");
              }
            }
            batchLog("gmail_batch_preview", "shown");
            continue;
          }
          if (isCancelAllCommand(text)) {
            const { cancelled } = await cancelBatch(canonical);
            await message.reply(cancelled ? "Batch cancelled. No email was sent." : "No pending email batch to cancel.");
            batchLog("gmail_batch_cancel", cancelled ? "cancelled" : "none");
            continue;
          }
          if (isInquiriesCommand(text)) {
            const st = await getBatchStatus(canonical);
            await message.reply(formatBatchStatusView(st).slice(0, 3500));
            batchLog("gmail_batch_status", st.found ? st.status ?? "found" : "none");
            continue;
          }
          if (inquireSel) {
            const prepared = await prepareBatch({ canonicalUserId: canonical, conversationId, positions: inquireSel });
            if (prepared.status === "no_gmail") {
              await message.reply("No Gmail connected for this chat. Connect Gmail in your web Settings first.");
            } else if (prepared.status === "need_info") {
              await message.reply(`To draft the emails I still need: ${prepared.missing.join(", ")}. Tell me, then say INQUIRE ${inquireSel.join(",")} again.`);
            } else if (prepared.status === "no_shortlist") {
              await message.reply("No hotel shortlist yet. Ask for a TRIP BRIEF with destination and dates first.");
            } else if (prepared.status === "stale_shortlist") {
              await message.reply("That shortlist is no longer current. Ask for a fresh TRIP BRIEF to refresh candidates.");
            } else if (prepared.status === "invalid_selection") {
              await message.reply(`Pick numbers 1 to ${prepared.max} from your current shortlist. Reply HOTELS to see it.`);
            } else if (prepared.status === "unverified_contact") {
              await message.reply(`No verified contact for ${prepared.hotelName} (pick ${prepared.position}): ${prepared.reason} Reply CONTACT ${prepared.position} to verify one first.`);
            } else if (prepared.status === "not_configured") {
              await message.reply("Email sending is not configured right now. Try again later.");
            } else {
              const total = prepared.previews.length;
              try {
                // Every preview part must arrive intact before any approval
                // code exists. A failed send aborts with no code issued.
                for (const part of renderBatchPreviews(prepared.previews, prepared.mode)) {
                  await message.reply(part);
                }
                const issued = await issueBatchCode({ canonicalUserId: canonical, batchId: prepared.batchId });
                if (!issued) {
                  await message.reply("The batch changed before approval. Say INQUIRE again for a fresh preview.");
                } else {
                  await message.reply(formatApprovalPrompt({ count: total, code: issued.code, expiresAt: issued.expiresAt, mode: prepared.mode }).slice(0, 3500));
                }
              } catch {
                await message.reply("Something went wrong preparing the batch. No email was sent and no approval was issued. Try again.");
              }
            }
            batchLog("gmail_batch_prepare", prepared.status);
            continue;
          }
          continue;
        } catch {
          await message.reply("Could not confirm the batch outcome. Check Gmail Sent before attempting another send.");
          batchLog("gmail_batch_error", "uncertain");
          continue;
        }
      }

      const allowSave = consentAt !== null;
      const result = await handleMessage({
        canonicalUserId: userId,
        channel: platform,
        sessionId: conversationId,
        deliveryId: `${platform}:${String(message.id)}`,
        text,
        allowMemorySave: allowSave,
      });

      let out = result.answer.slice(0, 3500);
      if (result.recallStatus === "unavailable") {
        out += "\n\n(Memory lookup is unavailable right now, so stored preferences could not be checked. Retry for a full check.)";
      } else if (result.recallStatus === "partial") {
        out += "\n\n(Partial memory check: some namespaces were unreachable, so results may be incomplete.)";
      }
      if (!allowSave) {
        out += "\n\n(Memory is OFF. Say YES any time to let me remember preferences.)";
      } else if (result.saves.completed > 0) {
        out += "\n\nSaved to memory.";
      } else if (result.saves.failed > 0) {
        out += "\n\nI could not confirm saving that just now, so I left your stored memory unchanged.";
      }
      await space.responding(async () => {
        await message.reply(out);
      });
      console.log(
        JSON.stringify({
          worker: "photon",
          platform,
          sender_hash: hash12(senderId),
          recall_count: result.memoryReceipts.length,
          recall_status: result.recallStatus,
          saves: result.saves,
          consent: allowSave,
          latency_ms: Date.now() - started,
        })
      );
    } catch (e) {
      if (isDuplicateDeliveryError(e)) {
        // Expected idempotency: another worker owns this delivery and
        // sends the one user-visible reply. Stay silent here.
        const dupPlatform =
          message.platform === "telegram"
            ? "telegram"
            : message.platform === "imessage"
              ? "imessage"
              : "unknown";
        console.log(
          JSON.stringify({
            worker: "photon",
            event: "duplicate_delivery",
            platform: dupPlatform,
            latency_ms: Date.now() - started,
          })
        );
      } else {
        try {
          await space.send("Something went wrong on my side. Please try again in a moment.");
        } catch {
          // best effort
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error(
          JSON.stringify({
            worker: "photon",
            error: msg.slice(0, 200),
            transient: /fetch failed|timeout|abort|econn|socket/i.test(msg),
          })
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ worker: "photon", fatal: String(e).slice(0, 300) }));
  process.exit(1);
});
