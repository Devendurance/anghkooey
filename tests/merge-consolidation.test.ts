import "dotenv/config";
import { describe, expect, it } from "vitest";
import { getSql } from "../src/server/db";
import { resolveChannelUser } from "../src/server/channel-identity";
import {
  cancelMerge,
  confirmMerge,
  getAliasUserIds,
  requestMerge,
  startLink,
} from "../src/server/linking";
import { listMemoriesUnion } from "../src/server/repo";

const tag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;

describe("existing-account consolidation (real Neon, throwaway users)", () => {
  it("merges a standalone channel account into a web account with memory preserved", async () => {
    const sql = getSql();
    const t = tag();
    const sender = `tg-test-${t}`;
    const createdUsers: string[] = [];
    try {
      const w = await sql`insert into users (consent_at) values (now()) returning id`;
      const webId = w[0].id as string;
      createdUsers.push(webId);
      const ch = await resolveChannelUser("telegram", sender);
      createdUsers.push(ch.userId);
      await sql`update users set consent_at = now() where id = ${ch.userId}`;
      // Fake metadata rows (no Walrus writes): one active blob per account.
      await sql`insert into memory_metadata (blob_id, user_id, memory_key, category, state) values (${`blob-w-${t}`}, ${webId}, 'stay.k', 'hotel', 'active')`;
      await sql`insert into memory_metadata (blob_id, user_id, memory_key, category, state) values (${`blob-c-${t}`}, ${ch.userId}, 'stay.k', 'hotel', 'active')`;

      const { code } = await startLink(webId);
      const req = await requestMerge({ code, provider: "telegram", providerSenderId: sender });
      expect(req.ok).toBe(true);
      if (req.ok) {
        expect(req.status).toBe("approval_needed");
        expect(req.sourceMemories).toBe(1);
        expect(req.targetMemories).toBe(1);
      }

      // Replay of the same web code is dead.
      const replay = await requestMerge({ code, provider: "telegram", providerSenderId: sender });
      expect(replay.ok).toBe(false);

      const done = await confirmMerge({ provider: "telegram", providerSenderId: sender });
      expect(done.ok).toBe(true);
      if (done.ok) {
        expect(done.canonicalUserId).toBe(webId);
        expect(done.mergedUserId).toBe(ch.userId);
      }

      // Identity now resolves to canonical; union lists both blobs.
      const again = await resolveChannelUser("telegram", sender);
      expect(again.userId).toBe(webId);
      expect(await getAliasUserIds(webId)).toContain(ch.userId);
      const mems = await listMemoriesUnion([webId, ch.userId], { state: "active" });
      const blobs = mems.map((m) => m.blobId);
      expect(blobs).toContain(`blob-w-${t}`);
      expect(blobs).toContain(`blob-c-${t}`);

      // Second confirm is a safe replay failure, not a double merge.
      const twice = await confirmMerge({ provider: "telegram", providerSenderId: sender });
      expect(twice.ok).toBe(false);

      // Another sender cannot hijack this approval (no pending request for them).
      const stranger = await confirmMerge({ provider: "telegram", providerSenderId: `tg-stranger-${t}` });
      expect(stranger.ok).toBe(false);

      // Cancel path on a fresh request.
      const ch2 = await resolveChannelUser("telegram", `tg-test2-${t}`);
      createdUsers.push(ch2.userId);
      const { code: code2 } = await startLink(webId);
      const req2 = await requestMerge({ code: code2, provider: "telegram", providerSenderId: `tg-test2-${t}` });
      expect(req2.ok).toBe(true);
      expect(await cancelMerge({ provider: "telegram", providerSenderId: `tg-test2-${t}` })).toBe(true);
      const afterCancel = await confirmMerge({ provider: "telegram", providerSenderId: `tg-test2-${t}` });
      expect(afterCancel.ok).toBe(false);
    } finally {
      await sql`delete from merge_requests where provider_sender_id like ${`%${t}%`}`.catch(() => []);
      await sql`delete from user_merges where merged_user_id = any(${createdUsers})`.catch(() => []);
      await sql`delete from channel_identities where provider_sender_id like ${`%${t}%`}`.catch(() => []);
      await sql`delete from memory_metadata where blob_id like ${`%${t}%`}`.catch(() => []);
      await sql`delete from link_tokens where source_user_id = any(${createdUsers})`.catch(() => []);
      for (const u of createdUsers) {
        await sql`delete from users where id = ${u}`.catch(() => []);
      }
    }
  }, 60000);
});
