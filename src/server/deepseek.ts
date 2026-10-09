import { getEnv } from "./env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatComplete(args: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const env = getEnv();
  const base = env.DEEPSEEK_BASE_URL.replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 45000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: args.messages,
        max_tokens: args.maxTokens ?? 1000,
        temperature: args.temperature ?? 0.6,
        ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `DeepSeek error: http ${res.status} ${body.slice(0, 200)}`
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
      usage?: { completion_tokens?: number };
    };
    const content = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      const reasoningChars =
        data.choices?.[0]?.message?.reasoning_content?.length ?? 0;
      throw new Error(
        `DeepSeek error: empty completion (reasoning_chars=${reasoningChars}). Retry with a larger token budget.`
      );
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal live probe. Uses a tiny completion, never logs the key. */
export async function checkDeepSeek(): Promise<{
  ok: boolean;
  model?: string;
  latencyMs?: number;
  status?: number;
  message?: string;
}> {
  const start = Date.now();
  try {
    const env = getEnv();
    await chatComplete({
      messages: [{ role: "user", content: "Reply with the word ok." }],
      // deepseek-flash spends tokens on reasoning_content first; keep
      // enough budget for the visible answer too.
      maxTokens: 300,
      timeoutMs: 30000,
    });
    return { ok: true, model: env.DEEPSEEK_MODEL, latencyMs: Date.now() - start };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const m = msg.match(/http (\d+)/);
    return { ok: false, status: m ? Number(m[1]) : undefined, message: msg.slice(0, 200) };
  }
}
