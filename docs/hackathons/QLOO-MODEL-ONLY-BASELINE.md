# Qloo-disabled baseline: recorded model-only experiment

Date: 2026-10-29 (Option B Slice 4 session).
Purpose: show what evidence is lost when Qloo is absent. This is a recorded
experiment, not a live recommendation and not a booking result.

## Method (reproducible)

Server-side script importing only `dotenv/config` and `src/server/qloo.ts`'s
sibling adapter `src/server/deepseek.ts` (`chatComplete`). No Qloo import, no
Qloo request, no memory/session reads, no writes of any kind.

- Model: `deepseek-flash` (server default)
- Settings: `maxTokens: 300`, `temperature: 0.6`, default timeout
- System prompt (exact): "You are Anghkooey, a personal concierge for hotels,
  travel, and dining. Answer concisely from your own training only."
- User prompt (exact): "Find dining like Nobu Restaurant and Ryuichi Sakamoto
  in Lagos."

## Verbatim returned text

> I can't verify current Lagos restaurants from my training alone, but here are
> directions to explore:
>
> - **Nobu-style (upscale Japanese/Peruvian fusion):** Look for high-end Japanese
>   restaurants in Victoria Island or Ikoyi. Names that have circulated include
>   **Nok by Alara** (pan-African, not Japanese) and **Wakame** (Japanese-leaning,
>   VI) — confirm they're still operating.
>
> - **Ryuichi Sakamoto vibe** (minimalist, artistic, atmospheric): This is more
>   about ambience than cuisine — seek intimate chef-led spots with
>   design-forward interiors, e.g. omakase or tasting-menu places in Ikoyi.
>
> - **Practical tip:** Search Instagram and Google Maps for "omakase Lagos" or
>   "Japanese restaurant Victoria Island," and check recent reviews, since Lagos
>   dining changes fast.
>
> I'd recommend verifying any specific venue before booking.

## Reading

Lost without Qloo: verified venue entity IDs, joint photos, per-venue Qloo
affinity, addresses, and per-anchor attribution. Gained risks: named-but-
unverified venues, generic guidance that hedges instead of resolving, and no
way to re-verify or correct against a provider record.
