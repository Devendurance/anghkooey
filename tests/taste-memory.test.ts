import { describe, expect, it } from "vitest";
import {
  anchorLooksNamed,
  buildTasteEvidence,
  guidanceFor,
  suggestAnchors,
} from "@/lib/taste-evidence";

// All fixtures below are SYNTHETIC and hand-written for offline regression.
// They never represent real user memories or live Qloo responses.

const SYNTHETIC_QLOO = {
  anchor: "Synthetic Bistro",
  city: "Nowhere",
  resolved: { name: "Synthetic Bistro", entity_id: "SYNTH-E-1", kind: "restaurant" },
  candidates: [
    { name: "Synthetic One", entity_id: "SYNTH-C-1", kind: "place", place: "Nowhere", explanation: "Synthetic note." },
    { name: "Synthetic Two", entity_id: "SYNTH-C-2", kind: "place", place: null, explanation: null },
  ],
};

describe("taste memory evidence (synthetic fixtures)", () => {
  it("treats capitalized names as named anchors", () => {
    expect(anchorLooksNamed("Nobu Restaurant")).toBe(true);
    expect(anchorLooksNamed("Terra Kulture")).toBe(true);
  });

  it("treats lowercase descriptions as not named", () => {
    expect(anchorLooksNamed("quiet places")).toBe(false);
    expect(anchorLooksNamed("somewhere authentic")).toBe(false);
  });

  it("guides generic anchors without inventing an entity", () => {
    const g = guidanceFor("quiet places");
    expect(typeof g).toBe("string");
    expect(g).toContain("Qloo");
    expect(guidanceFor("Nobu")).toBeNull();
  });

  it("suggests capitalized phrases from a memory's own words", () => {
    const s = suggestAnchors("I loved Nobu because the late seating in Lagos was calm");
    expect(s).toContain("Nobu");
    expect(s).toContain("Lagos");
  });

  it("never suggests stopwords or short fragments", () => {
    expect(suggestAnchors("The food was good and quiet")).toEqual([]);
  });

  it("builds a memory-backed panel passing through only present fields", () => {
    const e = buildTasteEvidence(
      { fact: "Synthetic fact", domain: "dining", blobId: "SYNTH-BLOB-1" },
      SYNTHETIC_QLOO
    );
    expect(e.personal).toMatchObject({ fromMemory: true, fact: "Synthetic fact", blobId: "SYNTH-BLOB-1" });
    expect(e.qloo.entityId).toBe("SYNTH-E-1");
    expect(e.qloo.candidateIds).toEqual(["SYNTH-C-1", "SYNTH-C-2"]);
    expect(e.notVerified).toContain("Live availability");
    expect(e.notVerified).toContain("Noise levels");
  });

  it("labels manual anchors as not from memory", () => {
    const e = buildTasteEvidence(null, SYNTHETIC_QLOO);
    expect(e.personal.fromMemory).toBe(false);
    if (!e.personal.fromMemory) expect(e.personal.note).toContain("not from saved memory");
  });

  it("never leaks memory content into the Qloo evidence block", () => {
    const e = buildTasteEvidence(
      { fact: "Synthetic private fact", domain: null, blobId: "SYNTH-BLOB-9" },
      SYNTHETIC_QLOO
    );
    expect(JSON.stringify(e.qloo)).not.toContain("Synthetic private fact");
    expect(JSON.stringify(e.qloo)).not.toContain("SYNTH-BLOB-9");
  });
});
