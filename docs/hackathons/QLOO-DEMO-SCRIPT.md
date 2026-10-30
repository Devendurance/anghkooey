# TasteProof demo script — 2–3 minutes, OPTIONAL (shot list included)

> No video is required by the Qloo Agentic Hackathon, and none is blocking
> submission. Use this script only if recording. Every beat below was verified
> live on production or by recorded automated tests. Do not ad-lib venue names,
> ratings, or availability.

## Beat 1 — Problem / hook (0:00–0:25)

**Say:** “Travel assistants ask what you want every time — and forget why you
liked anything. Worse, their dining tips invent restaurants with total
confidence. What if your concierge remembered your taste *and proved it*?”

**Show:** landing page → click into `/taste`.

## Beat 2 — Consent-based Qloo lookup (0:25–0:55)

**Say:** “I’ll look up dining in Lagos — typed by hand with memory saving OFF,
so this demo creates no durable memories and claims nothing about saved
memories. Watch: nothing fires immediately. First the anchor resolves through
Qloo Search; I confirm the exact entity; only then does Insights run.”

**Show (taste):** anchor `Nobu Restaurant` → **Resolve anchors** → confirm
`Nobu Restaurant [FF6EE520]`.

## Beat 3 — Multi-anchor combined discovery (0:55–1:35)

**Say:** “Now add a second reference — Ryuichi Sakamoto — and confirm the
artist entity. One combined Qloo request, both anchors attributed on every
venue. Compare with the single-anchor baseline: shared two, Talindo out,
NOK by Alara in, order flipped — computed from real IDs, not vibes.”

**Show:** add anchor → resolve → confirm both → approval summary →
**Approve combined discovery** → joint cards → **Compare with Nobu
Restaurant alone** → added/removed display (screenshots:
`docs/media/qloo-tasteproof-multi-approval.png`,
`docs/media/qloo-tasteproof-multi-compare.png`).

## Beat 4 — Evidence, trace, and the no-Qloo baseline (1:35–2:20)

**Say:** “Each venue lists which anchors Qloo actually attributes — or says
the details are unavailable. The trace shows only completed steps: what I
approved, what the server observed. And without Qloo? A recorded model-only
answer that hedges and names unverified spots — the difference is the point.”

**Show:** per-venue attribution panel, execution trace
(`docs/media/qloo-tasteproof-multi-evidence.png`,
`docs/media/qloo-tasteproof-multi-trace.png`), baseline panel.

## Beat 5 — Correction and close (2:20–2:50)

**Say:** “Change your mind? Correct the anchor and it re-resolves — a real
changed ranking with an Undo that restores without another lookup. Your
tastes, remembered. Cultural fit, backed by Qloo — with receipts.”

**Show:** correction comparison + Undo → mobile view
(`docs/media/qloo-tasteproof-comparison.png`,
`docs/media/qloo-tasteproof-mobile.png`) → repo link.

## Shot list (all recorded/verified)

| # | Shot | Source |
|---|------|--------|
| 1 | Desktop discovery, 3 photo cards | `docs/media/qloo-tasteproof-desktop.png` (Playwright 1440×900, production) |
| 2 | Evidence close-up (tags/affinity) | `docs/media/qloo-tasteproof-evidence.png` |
| 3 | Correction comparison + Undo | `docs/media/qloo-tasteproof-comparison.png` |
| 4 | Mobile discovery | `docs/media/qloo-tasteproof-mobile.png` (390×844) |
| 5 | Multi-anchor approval summary | `docs/media/qloo-tasteproof-multi-approval.png` (production element capture) |
| 6 | Per-venue anchor attribution | `docs/media/qloo-tasteproof-multi-evidence.png` (production element capture) |
| 7 | Single-vs-combined comparison | `docs/media/qloo-tasteproof-multi-compare.png` (production element capture) |
| 8 | Execution trace | `docs/media/qloo-tasteproof-multi-trace.png` (production element capture) |

Shots 5–8 are text-panel element captures (no venue photographs) from the live
production run that confirmed Nobu `FF6EE520` + Sakamoto artist `B0DEDE63`.

## Do-not-claim list

- No availability, price, rating, or booking claims.
- No affinity-as-probability (or cross-request comparison) language.
- No memory-recall claims: the demo types anchors by hand with saving OFF.
- No unrecorded chat voice-over; the live agentic chat path is unit-verified
  and the owner browser pass is pending — say so if asked.
