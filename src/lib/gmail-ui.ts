// Pure Gmail UI helpers shared by Settings. No secrets, no storage access.

export type GmailStatus = {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
};

export function isGmailConnected(
  s: GmailStatus | null
): s is { connected: true; email: string; connectedAt: string } {
  return s !== null && s.connected === true && typeof s.email === "string" && s.email.length > 0;
}

export const GMAIL_SCOPES_NOTE =
  "Google is asked only to confirm your email address and for permission to send mail you approve (the gmail.send scope). Anghkooey never asks to read your inbox.";

export type GmailReturn = { notice: string } | { error: string } | null;

/** Maps the OAuth callback query (?gmail=connected | error&reason=) to user copy. */
export function gmailReturnState(search: string): GmailReturn {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (q.get("gmail") === "connected") {
    return { notice: "Gmail connected. Each email still needs your explicit approval." };
  }
  if (q.get("gmail") !== "error") return null;
  switch (q.get("reason")) {
    case "denied":
      return { error: "The Google connection was declined, so nothing changed. Try again when ready." };
    case "expired":
      return { error: "The Google approval expired before it was used. Start the connection again." };
    case "refresh_missing":
      return { error: "Google did not return a reusable approval. Start the connection again and approve on Google's page." };
    case "session":
      return { error: "Your session ended before Google returned. Start a new session to connect Gmail." };
    case "not_configured":
      return { error: "Gmail connection is not set up yet. Try again later." };
    default:
      return { error: "Gmail could not be connected just now. Try again." };
  }
}
