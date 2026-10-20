# Current checkpoint
- Task: Pinned HTTPS lookup-contract fix complete, verified, committed and pushed (6f8590e).
- Done: pinnedLookup honours the Node `all` callback contract with explicit autoSelectFamily:false, new transport_config category with fail-fast and diagnostics wiring, deduped retry copy. New tests pass (real local socket, no mocks for the resolver path). Typecheck, eslint, build pass; full suite 221 passed, 34 skipped, 0 failed (videos collection failure fixed via vitest exclude + node:test script).
- Next: owner pulls both hosts, restarts worker, reruns CONTACT 1,2 live plus `npm run diagnose:hotel <url>` against a real hotel page.
- Evidence limits: stubbed transport/DNS/Google, static checks only. No live email sent. No credentials in repo.
