# Current checkpoint
- Task: Slice Gmail-C single send complete, verified, ready to commit.
- Done: migration 005, gmail-send.ts, worker EMAIL/PREVIEW/SEND/CANCEL handlers, privacy plus settings copy, 10 unit tests pass (6 DB tests skip without DATABASE_URL here). Typecheck, eslint, build pass; 95 passed 12 skipped across 9 mocked suites.
- Next: commit and push, then owner sets GMAIL_SEND_TEST_TO, runs migrate, pulls both hosts, restarts worker, runs 3-message live test. Untested here: real Gmail API, DB atomic-claim tests (skipped in sandbox), live iMessage flow.
- Evidence limits: stubbed Google fetch and static checks only. No live email sent. No credentials in repo.
