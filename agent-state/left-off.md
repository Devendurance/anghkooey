# Current checkpoint
- Task: pinpoint Vercel MemWal init failure with staged diagnostics.
- Done: createMemoryClient separates import, env validation, and SDK create plus key normalization into enumerated stages with sanitized logs. Production evidence (phase init, 5-7ms, no HTTP status, all 4 namespaces) rules out auth 401 and vector or identity causes, which were left untouched.
- Done: tests 80 passed (6 new stage tests proving tags and non-leakage), typecheck/lint/build pass. No Mainnet writes, no re-merges, no DB reset.
- Next: commit and push, verify Vercel READY, then owner retries one production search or chat and reads the stage field in Vercel logs. If stage is key_format_invalid, re-enter MEMWAL_PRIVATE_KEY in Vercel without quotes or whitespace and confirm the delegate matches the intended account. Untested: production recall receipt and search matches.
- Evidence limits: 20-user channel:evidence is bounded, not a full inventory. Dashboard zero is pre-July-30 migration scope. Never claim empty account from zero hits.
