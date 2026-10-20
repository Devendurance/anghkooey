# Current checkpoint
- Task: Hotel contact pre-production hardening complete, verified, ready to commit.
- Done: pinned-TLS transport with per-hop DNS validation, pre-search stale invalidation, redirect-to-platform rejection, honest evidence wording, currency-aware rates, test-inbox-only CONTACT copy. New unit tests pass; DB tests skip without DATABASE_URL here. Typecheck, eslint, build pass; 120 passed 21 skipped across 10 suites.
- Next: commit and push, then owner runs migrate 006, pulls both hosts, restarts worker, runs the live HOTELS and CONTACT test. Untested here: real page fetches, DB paths, live iMessage flow.
- Evidence limits: stubbed transport and DNS, static checks only. No live fetches, no email sent. No credentials in repo.
