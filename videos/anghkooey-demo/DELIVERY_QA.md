# Final delivery QA

- File: `videos/anghkooey-demo/anghkooey-demo-FINAL-1080p60.mp4`.
- Verified: 175 seconds, 1920x1080, 60 fps, 10,500 frames, H.264/AAC, limited-range colour.
- SHA-256: `b8c7b657551ba5d1f72407b197df2a760f64c67409491ed2c58a80c1336f4b6e`.
- Full audio/video decode: passed, exit 0.
- HyperFrames composition check: zero errors and zero warnings. All three narration/caption timing tests pass.
- Audio: -16.0 LUFS, -1.5 dBFS true peak, no clipping. Independent ElevenLabs transcription of final encoded audio returns 331 recognized words, normalized word error 0.3%, English confidence 1. Final AAC bytes match the transcribed AAC exactly after colour correction.
- Visual review: representative encoded samples across all eight chapters plus full-resolution recall proof. Original phone headers are masked, desktop contacts excluded, Web code-value frames excluded. Genuine evidence stays above the corrected caption rail.
- Captions: 59 aligned phrases, no overlapping time windows. All fit a single 46px Satoshi line. Editable SRT, ASS and HTML retained.
- Original score and confirmation accents retained with reproducible generator. ElevenLabs narration and alignment files retained.

## Evidence and review limits

- Earlier and later questions differ. This is not a controlled identical-query test or proof of globally empty memory.
- iMessage visibly recalls quiet hotels and natural light. It doesn't recall busy-road/sleep details in this exchange and can't confirm source-channel provenance.
- Fresh Web save/recall failed. Separately labelled earlier Web receipts and correction records are genuine. Profile 2/2 only proves linked status.
- Audio review is technical measurement and independent transcription. No human headphone audition occurred. Muted review used sampled frames rather than continuous human playback.

## Recovery

HyperFrames completed the initial capture but failed final AAC true-peak validation. Recovery reused 6,767 frames and recaptured only 3,733 with HyperFrames 0.8.143 native snapshot helpers. Final FFmpeg encoding replaces only y930-1080 captions, normalizes the complete original mix, and explicitly converts JPEG full range before video overlays. Temporary recovery frames are cleaned after verified delivery.
