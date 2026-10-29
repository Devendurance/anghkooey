# TasteProof demo script — 2–3 minutes (shot list included)

> Every beat below was verified live on production or by recorded automated
> tests. Do not ad-lib venue names, ratings, or availability.

## Beat 1 — Problem / hook (0:00–0:25)

**Say:** “Travel assistants ask what you want every time — and forget why you
liked anything. Worse, their dining tips invent restaurants with total
confidence. What if your concierge remembered your taste *and proved it*?”

**Show:** landing page → click into `/taste`.

## Beat 2 — Consent-based agentic Qloo lookup (0:25–1:00)

**Say:** “I’ll ask for dining like Nobu in Lagos. Watch: it doesn’t fire
immediately. It proposes the exact lookup — anchor plus city — and waits for
my yes. Only those two strings ever leave the chat.”

**Show (web chat):** send *“Find dining like Nobu in Lagos”* → proposal
appears → send *“Yes, please.”*

## Beat 3 — Live evidence-grounded recommendations (1:00–1:40)

**Say:** “This is a live Qloo Search plus Insights call. The answer may only
mention returned venues — each tied to its Qloo tags — with memory context
kept separate and a plain list of what isn’t verified.”

**Show:** grounded answer naming Izanagi Japanese Cuisine, ILE EROS LAGOS,
Talindo Steak House.

## Beat 4 — TasteProof photographic cards (1:40–2:05)

**Say:** “The same evidence as inspectable cards: real Qloo photos, real
tags, affinity labeled as Qloo’s ranking signal — never a match percentage.”

**Show:** `/taste` cards (screenshot: `docs/media/qloo-tasteproof-desktop.png`;
close-up: `docs/media/qloo-tasteproof-evidence.png`).

## Beat 5 — Terra correction, before/after and Undo (2:05–2:40)

**Say:** “Change your mind? Correct the anchor and it reruns Qloo — a real
changed ranking with an Undo that restores without another lookup.”

**Show:** enter `Terra Kulture` → approve → comparison + Undo → press Undo,
Nobu results restored (screenshot: `docs/media/qloo-tasteproof-comparison.png`).

## Beat 6 — What makes Qloo indispensable (2:40–3:00)

**Say:** “Memory recalls that I liked Nobu. Qloo turns that into discovery —
ranked, photographed venues in a city I don’t know, with the cultural fit
explained. Your tastes, remembered. Cultural fit, backed by Qloo.”

**Show:** mobile view (`docs/media/qloo-tasteproof-mobile.png`) → repo link.

## Shot list (all recorded/verified)

| # | Shot | Source |
|---|------|--------|
| 1 | Desktop discovery, 3 photo cards | `docs/media/qloo-tasteproof-desktop.png` (Playwright 1440×900, production) |
| 2 | Evidence close-up (tags/affinity) | `docs/media/qloo-tasteproof-evidence.png` |
| 3 | Correction comparison + Undo | `docs/media/qloo-tasteproof-comparison.png` |
| 4 | Mobile discovery | `docs/media/qloo-tasteproof-mobile.png` (390×844) |

## Do-not-claim list

- No availability, price, rating, or booking claims.
- No affinity-as-probability language.
- No unrecorded chat voice-over; the live chat pass is owner-verified by browser only.
