import "dotenv/config";
import { createHash } from "node:crypto";
import { Spectrum } from "spectrum-ts";
import { telegram } from "spectrum-ts/providers/telegram";
import { imessage } from "spectrum-ts/providers/imessage";
import { getOrCreateChannelConversation, resolveChannelUser } from "../src/server/channel-identity";
import { cancelMerge, confirmLink, confirmMerge, requestMerge } from "../src/server/linking";
import { handleMessage } from "../src/server/orchestrator";
import { getConsentAt, listMemories, setConsent } from "../src/server/repo";
import { checkRateLimit } from "../src/server/rate-limit";

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
  return [
    "Anghkooey here. I remember your hotel, travel and dining preferences.",
    channel === "telegram" ? "Commands: /start /help /memory /connect" : "Commands: HELP, MEMORY, CONNECT work too.",
    "Memory is off until you say YES. Say YES to enable it, or ask me anything and I will answer without saving.",
    "To link this chat to your web account: open your web session, create a link code, then send that code here.",
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
          saves: result.saves,
          consent: allowSave,
          latency_ms: Date.now() - started,
        })
      );
    } catch (e) {
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

main().catch((e) => {
  console.error(JSON.stringify({ worker: "photon", fatal: String(e).slice(0, 300) }));
  process.exit(1);
});
