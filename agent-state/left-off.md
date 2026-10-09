# Current checkpoint
- Task: production Walrus recall/search outage fix.
- Done: root cause narrowed to Vercel-side MemWal failure on all namespaces (local recall works, 2 hits at 0.38). Exact error class still needs one production recall with new classified logging. Most likely 401 AUTH_REJECTED from invalid or mismatched Vercel MEMWAL keys.
- Done: memwal failure classification plus one bounded transient-only retry, sanitized logs (op/category/status/code/duration, no secrets). Search route settled fan-out with searchStatus partial. Orchestrator recallDiag summary. Tests 74 passed, typecheck/lint/build pass. No new blobs, no re-merges, no DB reset.
- Next: commit and push, verify Vercel deployment READY, then owner triggers one production chat or search and reads Vercel logs for op memwal_recall or recall or search lines. Untested: authenticated production recall receipt, production search matches, failure-state UI in prod.
- Evidence limits: 20-user channel:evidence is bounded, not a full inventory. Dashboard zero is pre-July-30 migration scope. Never claim empty account from zero hits.
