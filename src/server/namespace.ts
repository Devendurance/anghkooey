const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(v: string): boolean {
  return UUID_RE.test(v);
}

export function assertUUID(v: string, label = "userId"): string {
  if (!isValidUUID(v)) throw new Error(`Invalid ${label}: not a UUID`);
  return v;
}

/**
 * Deterministic per-user Walrus namespace from the canonical app UUID.
 * Server-side only. Never accept a namespace from client input.
 */
export function namespaceFor(userId: string): string {
  assertUUID(userId);
  return `anghkooey:v1:u:${userId}`;
}
