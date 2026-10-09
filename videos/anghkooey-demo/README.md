# Anghkooey official demo

Editable 175-second HyperFrames project, 1920x1080 at 60 fps. Eight chapters use genuine product recordings and clearly labelled earlier successful Web evidence. ElevenLabs George narration and character alignment are retained in `audio/`. `captions.srt` and `captions.ass` are aligned to that narration. Music and confirmation sounds are original and reproducible with `node scripts/music.mjs`.

## Edit or render

- Generate original music locally with `node scripts/music.mjs`.
- Rebuild HTML with `node scripts/build.mjs`.
- Test captions with `node --test scripts/captions.test.mjs`.
- Validate with `npm run check`.
- Open Studio with `npx hyperframes@0.8.143 preview --background`.
- Render with `npm run render -- --fps 60 --quality delivery --workers 1`.

The requested final filename is `anghkooey-demo-FINAL-1080p60.mp4`. Export status and verified measurements are recorded in `DELIVERY_QA.md` once output verification completes.

## Recovery

HyperFrames completed a first capture but failed in its final AAC true-peak validation. A second partial capture preserved 6,767 frames and a complete 175-second mix. `scripts/recover-frames.mjs <preserved-work-dir>` uses the same pinned CLI's snapshot helpers to capture only missing frames. `scripts/deliver.mjs <audio.m4a>` encodes recovered frames with corrected, non-overlapping captions and a measured loudness pass. It replaces only the caption rail below y930. Product proof remains above it.

Raw sources, private captures, temporary frames and final binaries stay local. They aren't committed. No fresh Web-save or linked-Web-recall success is claimed. The supplied earlier and later iMessage questions differ, and the reply recalls quiet hotels and natural light only. Automated audio transcription confirms the narration, but doesn't replace a human listening review.
