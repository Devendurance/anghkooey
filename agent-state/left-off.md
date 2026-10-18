# Current checkpoint
- Task: Slice Gmail-B UI complete: settings section plus public privacy page.
- Done: gmail-ui helpers, Connected Gmail section with all states, /privacy page with actual-behavior copy, footer and settings links. 12 UI tests pass. Typecheck, eslint, build pass with /privacy prerendered. Commit pending, then push.
- Next: owner Google credentials plus migration 004, then live browser connect test from /settings. Untested: real Google consent, DB boundary tests in sandbox.
- Evidence limits: stubbed fetch and static copy checks only. No live Google calls, no email sent.
