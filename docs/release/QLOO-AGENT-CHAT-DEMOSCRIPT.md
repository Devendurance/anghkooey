# Agentic dining demo script (web chat, ~60 seconds)

Prerequisites: signed-in web session with memory consent on (any mode works;
the dining flow itself is session-only). Qloo env configured on the server.

## Take 1 — explicit request, approval, grounded answer (the pass)

1. Send: `Find dining like Nobu in Lagos`
   Expect: the concierge does NOT call Qloo yet. It names the exact anchor
   and city and asks for a yes:
   `Qloo dining lookup — anchor “Nobu” in “Lagos”. Reply yes …`
2. Send: `Yes, please`
   Expect: a recommendation naming ONLY the live Qloo venues (e.g. Izanagi
   Japanese Cuisine, ILE EROS LAGOS, Talindo Steak House), each tied to its
   Qloo note or marked Not available; personal memory kept separate; a clear
   not-verified line (availability, prices, bookings).
3. State what happened: explicit request → transparent approval → real
   Search + Insights rerun → grounded answer. Nothing was booked.

## Take 2 — missing details are asked, never invented (30 seconds)

1. Send: `Recommend places like Nobu for dinner`
   Expect: `Got the anchor “Nobu”. Which city should I search in?`
2. Send: `Find dining in Lagos`
   Expect: asks for a named place; explicitly says it won't guess one.

## Take 3 — correction (optional, 20 seconds)

1. After a proposal for Nobu, send: `Actually make it Terra`
   Expect: a NEW proposal for anchor “Terra” in “Lagos”, requiring a fresh
   yes before any Qloo call.

## What is NOT shown

- No Walrus writes happen in this flow (dining stays conversational).
- If Qloo is down or the rate-limit store cannot verify allowance, the
  concierge says so honestly and names no venues.
- `/taste` remains the visual before/after comparison experience.
