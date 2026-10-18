# Current checkpoint
- Task: Live QA hotfix complete for stale search dates, placeholder inquiry, and long replies.
- Done: sequential date refinement (checkout-only, checkin-only, full replacement, ambiguous keep), nights-driven checkout, canonical stay shared by search/prompt/itinerary/inquiry, exact-value inquiry rule, concise revision mode, sanitized hotel status logging. Regression tests reproduce the Nov 12-16 to Nov 12-17 two-message thread. No live requests, no key, no new provider.
- Next: owner pulls on AWS, restarts worker, reruns the dated two-message test and checks hotel_status in logs. No second local worker.
- Evidence limits: mocked SerpApi only. Test A missing listings cause still undetermined from available evidence; new hotel_status log will identify it live. Inquiry exactness depends on the model following the strengthened prompt.
