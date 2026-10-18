# Current checkpoint
- Task: Slice Gmail-C reliability fix complete and verified, ready to commit.
- Done: shared resolveEffectiveStay for Trip Brief and email drafts, same-month range parsing, explicit party size with omission plus preview note, receipt-write failure as unknown with Sent-folder copy, persist seam. New unit tests pass; DB reliability tests written but skip without DATABASE_URL here. Typecheck, eslint, build pass; 100 passed 16 skipped across 9 mocked suites.
- Next: commit and push, then owner sets GMAIL_SEND_TEST_TO, runs migrate 005, pulls both hosts, restarts worker, runs 3-message live test. Untested here: real Gmail API, DB atomic and receipt-failure paths, live iMessage flow.
- Evidence limits: stubbed Google fetch and static checks only. No live email sent. No credentials in repo.
