import { describe, expect, it } from "vitest";
import { createTasteApproval, verifyTasteApproval } from "@/server/taste-approval";

const SECRET = "SYNTHETIC-APPROVAL-SECRET-DO-NOT-USE";
const INPUT = {
  anchors: ["Nobu Restaurant", "Ryuichi Sakamoto"],
  entityIds: ["QLOO-NOBU-1", "QLOO-SAK-1"],
  city: "Lagos",
  proposed: ["ILE EROS LAGOS", "Ghost Bistro Xyz"],
  ops: ["verify", "investigate"] as const,
};

describe("taste approval artifact (synthetic)", () => {
  it("round-trips for identical inputs", () => {
    const { token } = createTasteApproval({ ...INPUT, ops: [...INPUT.ops] }, SECRET, 1_000_000);
    const chk = verifyTasteApproval(
      token,
      { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "verify" },
      SECRET,
      1_000_000 + 60_000
    );
    expect(chk.ok).toBe(true);
  });

  it("rejects tampered anchors, IDs, city and shortlist", () => {
    const { token } = createTasteApproval({ ...INPUT, ops: [...INPUT.ops] }, SECRET, 1_000_000);
    for (const variant of [
      { ...INPUT, anchors: ["Nobu Restaurant"] },
      { ...INPUT, entityIds: ["QLOO-NOBU-1", "QLOO-FORGED-9"] },
      { ...INPUT, city: "Accra" },
      { ...INPUT, proposed: ["ILE EROS LAGOS"] },
    ]) {
      const chk = verifyTasteApproval(
        token,
        { anchors: variant.anchors, entityIds: variant.entityIds, city: variant.city, proposed: variant.proposed, op: "verify" },
        SECRET,
        1_000_000 + 60_000
      );
      expect(chk.ok).toBe(false);
      if (!chk.ok) expect(chk.code).toBe("approval_mismatch");
    }
  });

  it("rejects forged signatures and wrong secrets", () => {
    const { token } = createTasteApproval({ ...INPUT, ops: [...INPUT.ops] }, SECRET, 1_000_000);
    const bad = token.slice(0, -4) + "AAAA";
    const chk = verifyTasteApproval(
      bad,
      { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "verify" },
      SECRET,
      1_000_000 + 60_000
    );
    expect(chk.ok).toBe(false);
    const wrong = verifyTasteApproval(
      token,
      { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "verify" },
      "WRONG-SECRET",
      1_000_000 + 60_000
    );
    expect(wrong.ok).toBe(false);
  });

  it("rejects expired approval and missing operations", () => {
    const { token } = createTasteApproval({ ...INPUT, ops: ["verify"] }, SECRET, 1_000_000);
    const expired = verifyTasteApproval(
      token,
      { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "verify" },
      SECRET,
      1_000_000 + 11 * 60_000
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.code).toBe("expired_approval");
    const wrongOp = verifyTasteApproval(
      token,
      { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "investigate" },
      SECRET,
      1_000_000 + 60_000
    );
    expect(wrongOp.ok).toBe(false);
  });

  it("allows replay for identical inputs within expiry (documented, not one-time)", () => {
    const { token } = createTasteApproval({ ...INPUT, ops: [...INPUT.ops] }, SECRET, 1_000_000);
    for (const t of [1_000_000 + 60_000, 1_000_000 + 9 * 60_000]) {
      const chk = verifyTasteApproval(
        token,
        { anchors: INPUT.anchors, entityIds: INPUT.entityIds, city: INPUT.city, proposed: INPUT.proposed, op: "verify" },
        SECRET,
        t
      );
      expect(chk.ok).toBe(true);
    }
  });
});
