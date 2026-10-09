import { getEnv } from "./env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionAttempt = {
  content: string;
  finishReason: string | null;
  reasoningChars: number;
  completionTokens: number | null;
};

async function requestOnce(args: {
  base: string;
  apiKey: string;
  model: string;
  thinking: "enabled" | "disabled";
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  jsonMode: boolean;
  timeoutMs: number;
}): Promise<CompletionAttempt> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs);
  try {
    const res = await fetch(`${args.base}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        thinking: { type: args.thinking },
        ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      // HTTP/auth/config errors are terminal. Never retried as token issues.
      const body = await res.text().catch(() => "");
      throw new Error(
        `DeepSeek error: http ${res.status} ${body.slice(0, 200)}`
      );
    }
    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string; reasoning_content?: string };
        finish_reason?: string;
      }[];
      usage?: { completion_tokens?: number };
    };
    const message = data.choices?.[0]?.message;
    return {
      // reasoning_content is never the answer. Only visible content counts.
      content: (message?.content ?? "").trim(),
      finishReason: data.choices?.[0]?.finish_reason ?? null,
      reasoningChars: message?.reasoning_content?.length ?? 0,
      completionTokens: data.usage?.completion_tokens ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatComplete(args: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const env = getEnv();
  const base = env.DEEPSEEK_BASE_URL.replace(/\/$/, "");
  const shared = {
    base,
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL,
    thinking: env.DEEPSEEK_THINKING,
    messages: args.messages,
    temperature: args.temperature ?? 0.6,
    jsonMode: args.jsonMode ?? false,
    timeoutMs: args.timeoutMs ?? 45000,
  };
  const first = await requestOnce({ ...shared, maxTokens: args.maxTokens ?? 1000 });
  if (first.content) return first.content;
  // Empty visible output (reasoning-only or finish_reason=length): exactly
  // one bounded recovery with a larger budget, same input and context.
  const retry = await requestOnce({
    ...shared,
    maxTokens: Math.max((args.maxTokens ?? 1000) * 2, 2000),
  });
  if (retry.content) return retry.content;
  throw new Error(
    `DeepSeek error: empty completion after retry (finish_reason=${retry.finishReason ?? "unknown"}, reasoning_chars=${retry.reasoningChars}).`
  );
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
