"use client";

import { ArrowUp, Plus, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { FoldedA } from "@/components/brand/FoldedA";
import { call, errorMessage, factText, shortBlob, type ApiResult } from "@/lib/app-client";
import { CONVERSATION_KEY_PREFIX } from "@/lib/site";

type Receipt = { blobId: string; reason: string };
type SaveStatus = "confirmed" | "failed" | "none";
type MemoryStatus = "ok" | "partial" | "unavailable";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  restored?: boolean;
  status?: "sending" | "failed" | "sent";
  idempotencyKey?: string;
  error?: string;
  receipts?: Receipt[];
  saveStatus?: SaveStatus;
  savedBlobIds?: string[];
  memoryOn?: boolean;
  memoryStatus?: MemoryStatus;
};

type Session = { userId: string; expiresAt: string; consent: boolean };
type Phase = "booting" | "ready" | "boot-failed" | "expired";
const MAX_CHARS = 4000;
const RETENTION_HOURS = 24;
const SLOW_AFTER_MS = 9000;

const STARTERS = [
  "I sleep badly near elevators, so I always want a quiet room away from them.",
  "I'm vegetarian and I don't enjoy very spicy food.",
  "I prefer direct flights, even if they cost a little more.",
];

function apiMessage(r: ApiResult): string {
  if (r.status === 429) return "You're sending messages quickly. Wait a minute, then retry.";
  if (r.status === 502) return "The chat provider didn't respond. Your message is safe, retry when ready.";
  return errorMessage(r, "Something went wrong. Retry when ready.");
}

/** Renders the light Markdown DeepSeek emits (bold, bullets, headings) as React nodes. Never injects HTML. */
function RichText({ text }: { text: string }) {
  return text.split("\n").map((raw, i) => {
    const bullet = /^\s*[-*]\s+/.test(raw);
    const line = raw.replace(/^\s*[-*]\s+/, "").replace(/^#{1,6}\s+/, "");
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={j}>{p.slice(2, -2)}</strong> : p
    );
    return (
      <span key={i} className={bullet ? "chat-li" : "chat-line"}>
        {parts}
        {"\n"}
      </span>
    );
  });
}

const uid = () => crypto.randomUUID();
const storeKey = (userId: string) => `${CONVERSATION_KEY_PREFIX}${userId}`;

function readStored(userId: string): { id: string; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(userId)) ?? "null") as { id?: unknown; at?: unknown } | null;
    return v && typeof v.id === "string" && typeof v.at === "number" ? { id: v.id, at: v.at } : null;
  } catch {
    return null;
  }
}

function writeStored(userId: string, id: string | null) {
  try {
    if (id) localStorage.setItem(storeKey(userId), JSON.stringify({ id, at: Date.now() }));
    else localStorage.removeItem(storeKey(userId));
  } catch {
    // Storage can be unavailable (private mode). History restore is best-effort.
  }
}

function toRestored(rows: unknown): Msg[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((m: { role: "user" | "assistant"; text: string }) => ({
    id: uid(),
    role: m.role,
    text: m.text,
    restored: true,
    status: m.role === "user" ? "sent" : undefined,
  }));
}

export function Chat() {
  const [phase, setPhase] = useState<Phase>("booting");
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  const conversationRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const setConversation = useCallback((userId: string, id: string | null) => {
    conversationRef.current = id;
    writeStored(userId, id);
  }, []);

  const boot = useCallback(async () => {
    setPhase("booting");
    try {
      const s = await call("/api/session", { method: "POST" });
      if (!s.ok) throw new Error(apiMessage(s));
      const next: Session = {
        userId: String(s.body.userId),
        expiresAt: String(s.body.expiresAt),
        consent: s.body.consent === true,
      };
      setSession(next);
      conversationRef.current = null;
      setMessages([]);

      const stored = readStored(next.userId);
      if (stored) {
        const h = await call(`/api/conversations?id=${encodeURIComponent(stored.id)}`);
        const restored = h.ok ? toRestored(h.body.messages) : [];
        if (restored.length > 0) {
          conversationRef.current = stored.id;
          setMessages(restored);
        } else if (h.ok && Date.now() - stored.at < RETENTION_HOURS * 3_600_000) {
          conversationRef.current = stored.id;
        } else {
          writeStored(next.userId, null);
          if (h.ok) setNotice(`Your last conversation is older than ${RETENTION_HOURS} hours, so its messages are gone.`);
        }
      }
      setPhase("ready");
    } catch {
      setPhase("boot-failed");
    }
  }, []);

  useEffect(() => {
    // Session bootstrap is an external sync with the API on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
  }, [boot]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (!sending) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(t);
      setSlow(false);
    };
  }, [sending]);

  const patchMsg = (id: string, patch: Partial<Msg>) =>
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const reloadTranscript = useCallback(async (conversationId: string) => {
    const h = await call(`/api/conversations?id=${encodeURIComponent(conversationId)}`);
    if (h.ok) setMessages(toRestored(h.body.messages));
  }, []);

  const send = useCallback(
    async (text: string, retry?: Msg) => {
      if (sendingRef.current || !session) return;
      const body = text.trim();
      if (!body || body.length > MAX_CHARS) return;
      sendingRef.current = true;
      setSending(true);
      setNotice(null);

      const msg: Msg = retry
        ? { ...retry, status: "sending", error: undefined }
        : { id: uid(), role: "user", text: body, status: "sending", idempotencyKey: `web-${uid()}` };
      if (retry) patchMsg(msg.id, msg);
      else {
        setMessages((list) => [...list, msg]);
        setDraft("");
      }

      try {
        let conversationId = conversationRef.current;
        if (!conversationId) {
          const c = await call("/api/conversations", { method: "POST" });
          if (c.status === 401) {
            setPhase("expired");
            patchMsg(msg.id, { status: "failed", error: "Your browser session ended before this was sent." });
            return;
          }
          if (!c.ok) {
            patchMsg(msg.id, { status: "failed", error: apiMessage(c) });
            return;
          }
          conversationId = String(c.body.conversationId);
          setConversation(session.userId, conversationId);
        }

        const r = await call("/api/chat", {
          method: "POST",
          body: JSON.stringify({ message: msg.text, conversationId, idempotencyKey: msg.idempotencyKey }),
        });

        if (r.ok) {
          const memoryOn = r.body.consent === true;
          patchMsg(msg.id, { status: "sent" });
          setMessages((list) => [
            ...list,
            {
              id: uid(),
              role: "assistant",
              text: String(r.body.answer ?? ""),
              receipts: (r.body.memoryReceipts as Receipt[] | undefined) ?? [],
              saveStatus: (r.body.saveStatus as SaveStatus | undefined) ?? "none",
              savedBlobIds: (r.body.savedBlobIds as string[] | undefined) ?? [],
              memoryOn,
              memoryStatus: (r.body.memoryStatus as MemoryStatus | undefined) ?? "ok",
            },
          ]);
          setSession((s) => (s ? { ...s, consent: memoryOn } : s));
          setConversation(session.userId, conversationId);
          return;
        }

        if (r.status === 409) {
          await reloadTranscript(conversationId);
          setNotice("That message was already answered. Showing the saved transcript. Receipts aren't kept in history.");
          return;
        }
        if (r.status === 401) setPhase("expired");
        if (r.status === 404) setConversation(session.userId, null);
        patchMsg(msg.id, {
          status: "failed",
          error:
            r.status === 401
              ? "Your browser session ended before this was sent."
              : r.status === 404
                ? "That conversation is no longer available. Retry to send it in a new one."
                : apiMessage(r),
        });
      } catch {
        patchMsg(msg.id, { status: "failed", error: "Couldn't reach Anghkooey. Check your connection, then retry." });
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [session, setConversation, reloadTranscript]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const editFailed = (m: Msg) => {
    setMessages((list) => list.filter((x) => x.id !== m.id));
    setDraft(m.text);
    inputRef.current?.focus();
  };

  const newConversation = () => {
    if (sendingRef.current || !session) return;
    setConversation(session.userId, null);
    setMessages([]);
    setNotice(null);
    inputRef.current?.focus();
  };

  const setMemory = async (on: boolean) => {
    setConsentBusy(true);
    try {
      const r = await call("/api/settings", { method: "PATCH", body: JSON.stringify({ consent: on }) });
      if (r.ok) {
        setSession((s) => (s ? { ...s, consent: r.body.consent === true } : s));
        setConsentOpen(false);
        setNotice(on ? "Memory is on. Useful details you share can now be saved to Walrus." : "Memory is off. Nothing new will be saved.");
      } else {
        if (r.status === 401) setPhase("expired");
        setNotice(`Memory setting wasn't changed. ${apiMessage(r)}`);
      }
    } catch {
      setNotice("Memory setting wasn't changed. Check your connection and try again.");
    } finally {
      setConsentBusy(false);
    }
  };

  if (phase === "booting" || phase === "boot-failed") {
    return (
      <div className="chat-center" aria-live="polite">
        <FoldedA className="h-10 w-auto opacity-80" />
        {phase === "booting" ? (
          <p className="t-caption">Opening your private session…</p>
        ) : (
          <>
            <p className="chat-text text-center">Anghkooey couldn&rsquo;t start a session right now.</p>
            <button type="button" className="app-btn app-btn-glass" onClick={() => void boot()}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
              Try again
            </button>
          </>
        )}
      </div>
    );
  }

  const memoryOn = session?.consent === true;
  const expiry = session ? new Date(session.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "";
  const over = draft.length > MAX_CHARS;
  const canSend = phase === "ready" && !sending && draft.trim().length > 0 && !over;

  return (
    <div className="chat">
      <h1 className="sr-only">Chat with Anghkooey</h1>

      <div className="chat-toolbar">
        <button
          type="button"
          role="switch"
          aria-checked={memoryOn}
          aria-describedby="memory-desc"
          className="chat-memory"
          data-on={memoryOn}
          disabled={consentBusy || phase !== "ready"}
          onClick={() => (memoryOn ? void setMemory(false) : setConsentOpen((v) => !v))}
        >
          <span aria-hidden className="chat-memory-dot" />
          Memory {memoryOn ? "on" : "off"}
        </button>
        <span id="memory-desc" className="sr-only">
          {memoryOn ? "Useful details you share are saved to Walrus. Press to stop new saves." : "Nothing is saved. Press to review how memory works and turn it on."}
        </span>
        <button
          type="button"
          className="app-btn app-btn-quiet"
          onClick={newConversation}
          disabled={sending || phase !== "ready"}
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          New conversation
        </button>
      </div>

      {consentOpen && !memoryOn ? (
        <section className="chat-consent" aria-labelledby="consent-title">
          <h2 id="consent-title" className="chat-consent-title">
            Let Anghkooey remember what matters?
          </h2>
          <ul className="chat-consent-list">
            <li>Preferences and experiences you share can be saved as memories on Walrus Mainnet, encrypted by the MemWal relayer.</li>
            <li>Later answers can use them, and each reply shows which memories it used.</li>
            <li>Turning memory off stops new saves. It doesn&rsquo;t erase memories already stored on Walrus.</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="app-btn app-btn-primary" disabled={consentBusy} onClick={() => void setMemory(true)}>
              {consentBusy ? "Turning on…" : "Turn memory on"}
            </button>
            <button type="button" className="app-btn app-btn-glass" onClick={() => setConsentOpen(false)}>
              Not now
            </button>
          </div>
        </section>
      ) : null}

      {phase === "expired" ? (
        <div className="chat-banner" role="alert">
          <p>
            Your browser session has ended. A new session starts fresh: earlier history and any memories tied to the old
            session can&rsquo;t be recovered here.
          </p>
          <button type="button" className="app-btn app-btn-glass" onClick={() => void boot()}>
            Start a new session
          </button>
        </div>
      ) : null}

      <div ref={logRef} className="chat-log" role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Conversation">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <FoldedA className="h-12 w-auto" />
            <p className="chat-welcome-title">Tell me one thing that shapes how you stay, eat, or travel.</p>
            <p className="chat-text max-w-[36rem]">
              {memoryOn
                ? "Memory is on, so useful details can be saved and used in later conversations."
                : "You can chat right away. Memory is off, so nothing is saved until you turn it on."}
            </p>
            <p className="t-caption max-w-[36rem]">
              This browser keeps your private session until {expiry}. There&rsquo;s no account yet, so clearing cookies
              or switching devices starts over. Messages stay visible for {RETENTION_HOURS} hours.
            </p>
            <div className="chat-starters" role="group" aria-label="Conversation starters">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-starter"
                  onClick={() => {
                    setDraft(s);
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="chat-list">
            {messages[0]?.restored ? (
              <li className="chat-note">Restored from the last {RETENTION_HOURS} hours. Memory receipts aren&rsquo;t kept in history.</li>
            ) : null}
            {messages.map((m) => (
              <li key={m.id} className="chat-row" data-role={m.role}>
                <div className="chat-bubble" data-role={m.role} data-status={m.status}>
                  <span className="sr-only">{m.role === "user" ? "You: " : "Anghkooey: "}</span>
                  {m.role === "assistant" ? <RichText text={m.text} /> : m.text}
                </div>
                {m.role === "user" && m.status === "failed" ? (
                  <div className="chat-failed" role="alert">
                    <span>{m.error}</span>
                    <span className="flex gap-2">
                      {phase === "ready" ? (
                        <button type="button" className="chat-link" disabled={sending} onClick={() => void send(m.text, m)}>
                          Retry
                        </button>
                      ) : null}
                      <button type="button" className="chat-link" onClick={() => editFailed(m)}>
                        Edit
                      </button>
                    </span>
                  </div>
                ) : null}
                {m.role === "assistant" && !m.restored ? <Receipts m={m} /> : null}
              </li>
            ))}
            {sending ? (
              <li className="chat-row" data-role="assistant">
                <div className="chat-typing" role="status">
                  <span aria-hidden className="chat-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {slow ? "Still working. Saving to Walrus can take a little longer." : "Anghkooey is thinking"}
                </div>
              </li>
            ) : null}
          </ol>
        )}
      </div>

      {notice ? (
        <p className="chat-notice" role="status">
          {notice}
        </p>
      ) : null}

      <form className="chat-composer" onSubmit={onSubmit}>
        <label htmlFor="chat-input" className="chat-label">
          Message Anghkooey
        </label>
        <div className="chat-field">
          <textarea
            id="chat-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="A preference, a past stay, or a question"
            aria-describedby="chat-help"
            aria-invalid={over || undefined}
            disabled={phase !== "ready"}
            className="chat-input"
          />
          <button type="submit" className="chat-send" disabled={!canSend} aria-label={sending ? "Sending" : "Send message"}>
            <ArrowUp aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <p id="chat-help" className="chat-help">
          {over ? `${draft.length - MAX_CHARS} characters over the ${MAX_CHARS} limit.` : "Enter to send, Shift + Enter for a new line."}
        </p>
      </form>
    </div>
  );
}

function Receipts({ m }: { m: Msg }) {
  const receipts = m.receipts ?? [];
  const memoryStatus = m.memoryStatus ?? "ok";
  return (
    <div className="chat-receipts">
      {memoryStatus === "unavailable" ? (
        <p className="chat-receipt" data-kind="failed" role="status">
          Memory lookup unavailable right now. Stored memories were not checked. Retry for a full check.
        </p>
      ) : null}
      {memoryStatus === "partial" ? (
        <p className="chat-receipt" data-kind="failed" role="status">
          Partial memory check. Some namespaces could not be reached, so results may be incomplete. Retry for full coverage.
        </p>
      ) : null}
      {receipts.length > 0 ? (
        <details className="chat-receipt" data-kind="recall">
          <summary>
            Used {receipts.length} {receipts.length === 1 ? "memory" : "memories"} from Walrus
          </summary>
          <ul>
            {receipts.map((r) => {
              const { domain, fact } = factText(r.reason, true);
              return (
                <li key={r.blobId}>
                  <span>{fact}</span>
                  <span className="chat-receipt-meta">
                    {domain ? <span>{domain}</span> : null}
                    <code title={r.blobId}>{shortBlob(r.blobId)}</code>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : memoryStatus === "ok" ? (
        <p className="chat-receipt" data-kind="none">
          No relevant memory matched this query
        </p>
      ) : null}
      {m.saveStatus === "confirmed" ? (
        <p className="chat-receipt" data-kind="saved">
          Saved to Walrus Mainnet
          {(m.savedBlobIds ?? []).map((id) => (
            <code key={id} title={id}>
              {shortBlob(id)}
            </code>
          ))}
        </p>
      ) : m.saveStatus === "failed" ? (
        <p className="chat-receipt" data-kind="failed">
          Memory save failed. Nothing new was stored.
        </p>
      ) : m.memoryOn === false ? (
        <p className="chat-receipt" data-kind="none">
          Memory off, nothing saved
        </p>
      ) : null}
    </div>
  );
}
