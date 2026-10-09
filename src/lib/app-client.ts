// Browser helpers shared by the web app routes.

export type ApiResult = { status: number; ok: boolean; body: Record<string, unknown> };

export async function call(path: string, init?: RequestInit): Promise<ApiResult> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ok: res.ok && body.ok === true, body };
}

export function errorMessage(r: ApiResult, fallback = "Something went wrong. Try again."): string {
  return (r.body.error as { message?: string } | undefined)?.message ?? fallback;
}

export const shortBlob = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

/** Pulls the stated fact out of the stored memory format. Recall receipts are capped at 140 chars server-side. */
export function factText(stored: string, capped = false): { domain: string | null; fact: string } {
  const domain = stored.match(/DOMAIN:\s*([a-z_]+)/i)?.[1] ?? null;
  const raw = stored.match(/FACT:\s*([^\n]*)/)?.[1]?.trim() || stored;
  return { domain, fact: capped && stored.length >= 140 ? `${raw}…` : raw };
}

/** "stay.room_location_preference" -> "Room location preference" */
export function topicLabel(key: string | null): string | null {
  const last = key?.split(".").pop()?.replace(/_/g, " ").trim();
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : null;
}
