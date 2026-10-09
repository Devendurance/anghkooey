# Project state
- App: Next 16.4, DeepSeek Flash, MemWal/Walrus Mainnet, Neon account state, persistent Photon worker.
- Live: https://anghkooey.vercel.app. Repo: github.com/Devendurance/anghkooey.
- Film source: videos/anghkooey-demo. Eight chapters total 175s, 1920x1080/60fps, ElevenLabs VO, Satoshi/Cormorant, original music, genuine evidence.
- Final MP4 completed and verified: `videos/anghkooey-demo/anghkooey-demo-FINAL-1080p60.mp4`. Full AV decode passes. Audio -16.0 LUFS, true peak -1.5 dBFS. Independent final-audio ASR matches 331 words with 0.3% normalized word error. No human headphone audition.
- Recovered 6,767 saved frames, captured only 3,733 missing frames through pinned CLI snapshot helpers, then applied corrected captions and explicit JPEG colour-range conversion. HyperFrames check and all three timing tests pass.
- No application source or database schema was changed for the film.
- Memory recall honesty fix: orchestrator tracks per-namespace recallStatus (ok/partial/unavailable), prompts never claim empty account on zero hits or failures, /api/chat exposes memoryStatus, Web and Photon show distinct retriable states. Regression tests in tests/memory-recall-status.test.ts use mocks, no Mainnet writes.
- Walrus outage fix: memwal classifies failures (config/init/auth/upstream/network) with one bounded retry for transient 429/503/timeout only, sanitized logs carry op/category/status/code/duration without secrets. Search route uses settled fan-out with searchStatus partial and returns good-namespace matches instead of failing whole search. Local recall verified working (2 hits, 0.38) against same relayer, so Vercel all-namespace failure is environment-side. Tests in memwal-reliability and memories-search-status, all mocked.
