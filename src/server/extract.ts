import { z } from "zod";

export const factSchema = z.object({
  text: z.string().min(12).max(500),
  category: z.enum(["hotel", "travel", "dining"]),
  scope: z.enum(["durable", "trip_specific"]),
  memory_key: z
    .string()
    .regex(/^[a-z]+[a-z0-9]*(\.[a-z0-9_]+)+$/, "dotted key e.g. stay.noise_preference")
    .max(80),
  confidence: z.number().min(0).max(1),
  sensitive: z.boolean(),
  correction_of: z.string().min(1).max(128).optional(),
  reason: z.string().max(300).optional(),
});

export type FactCandidate = z.infer<typeof factSchema>;

const factsArray = z.array(factSchema).max(3);

export function validateFacts(input: unknown): FactCandidate[] {
  const parsed = factsArray.safeParse(input);
  if (!parsed.success) return [];
  return parsed.data;
}

/**
 * Safely parse model extraction output into candidate items.
 * Never throws: empty, fence-wrapped or malformed input yields [].
 * Parsing alone never saves anything; validateFacts + isSaveWorthy +
 * confirmed Walrus persistence still gate every save downstream.
 */
export function parseFactsPayload(raw: string): unknown[] {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const facts = (parsed as { facts?: unknown }).facts;
      if (Array.isArray(facts)) return facts;
    }
    return [];
  } catch {
    return [];
  }
}

const SECRET_PATTERNS = [
  /password/i,
  /seed phrase/i,
  /mnemonic/i,
  /\bsuiprivkey1/i,
  /0x[a-f0-9]{64}/i,
  /card\s*(number|no\.?)/i,
  /\b\d{12,19}\b/,
  /passport\s*(no|number)/i,
];

const INVENTORY_CLAIM = [
  /i (booked|reserved) .* for you/i,
  /room is available tonight/i,
  /price is \$|price is confirmed/i,
  /real-?time (price|availability)/i,
];

/** Policy gate: only directly stated, non-sensitive, relevant facts pass. */
export function isSaveWorthy(f: FactCandidate): boolean {
  if (f.sensitive) return false;
  if (f.confidence < 0.6) return false;
  if (SECRET_PATTERNS.some((re) => re.test(f.text))) return false;
  if (INVENTORY_CLAIM.some((re) => re.test(f.text))) return false;
  // Must read like a user-stated preference, experience, or constraint.
  if (!/[a-z]{3,}/i.test(f.text)) return false;
  return true;
}

export function formatFactForStorage(f: FactCandidate): string {
  const recorded = new Date().toISOString().slice(0, 10);
  const lines = [
    "TYPE: user-stated preference fact",
    `DOMAIN: ${f.category}`,
    `KEY: ${f.memory_key}`,
    `FACT: ${f.text}`,
    `WHY: ${f.reason ?? "stated directly by the user"}`,
    `SCOPE: ${f.scope === "durable" ? "durable preference" : "trip-specific constraint"}`,
    `RECORDED: ${recorded}`,
    "SOURCE: stated directly by the user",
  ];
  if (f.correction_of) lines.push(`CORRECTS: ${f.correction_of}`);
  return lines.join("\n");
}

export function buildExtractionPrompt(userText: string): string {
  return [
    "Extract 0 to 3 durable user preference facts from the message below.",
    "Only propose a fact when the user directly states a preference, avoidance, constraint, experience, or correction about hotels, travel, or dining.",
    "Never turn assistant guesses, recommendations, prices, availability, or bookings into facts.",
    "Mark sensitive=true for passwords, keys, payment details, IDs, precise home addresses, or health/political/sexual content.",
    "Reply with a JSON array only. Each item: {text, category, scope, memory_key, confidence, sensitive, correction_of?, reason?}.",
    "category is hotel|travel|dining. scope is durable|trip_specific. memory_key is dotted lowercase like stay.noise_preference.",
    `MESSAGE: ${userText.slice(0, 2000)}`,
  ].join("\n");
}
