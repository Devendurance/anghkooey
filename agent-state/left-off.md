# Current task
- Doing: finish official 175s Anghkooey film and deliver MP4.
- Done: eight scenes, George ElevenLabs voice, original score, genuine live/archived UI, aligned captions. HyperFrames check had zero errors/warnings. Caption overlap fix has 3 passing Node tests. Audio-only Scribe transcription matches narration.
- Export issue: first HyperFrames capture completed 10500 frames, but final AAC validation exited 1073807364. Its streaming video was not retained.
- Recovery: 6767 JPEG frames and complete 175s audio mix retained in C:/Users/USER/AppData/Local/Temp/hf-render-aFkSc7. scripts/recover-frames.mjs is recapturing 3733 missing frames using native HyperFrames API. Recovery bootstrap lacked root timeline initialization. Explicit registration added to compiled HTML and build.mjs.
- Next: inspect recovery.log. After verification/recovery.json confirms 10500, run scripts/deliver.mjs with preserved audio.m4a. Then ffprobe/decode, rendered-frame/privacy/audio QA, update docs, commit/push and clean temporary frames.
- Limitation: fresh separate Web save failed, so confirmed receipts/corrections are labelled genuine earlier recordings. No identical-query controlled before/after or successful linked-Web recall claim.
