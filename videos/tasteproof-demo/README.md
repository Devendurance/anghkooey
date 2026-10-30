# TasteProof demo video — released cut (124s, 1080p, captioned)

File: `tasteproof-demo-1080p.mp4` (H.264 yuv420p 1920×1080 25fps, no audio track — captioned, not narrated).
Build: Playwright Chromium capture of production + HTML transcript cards + FFmpeg concat + burnt-in SRT.
Owner action: upload the MP4 to YouTube, paste the link into the Devpost entry.

## Reproduce

```bash
# 1. Screen footage (live production, real Qloo; ~5 rate-limited calls)
npx tsx scripts/demo-capture-tmp.ts   # test-artifacts/demo/page@*.webm + stills
# 2. Cards
npx tsx scripts/demo-cards-tmp.ts     # test-artifacts/demo/cards/*.png
# 3. Transcript (real MCP vs production; token stays in the variable, cards show it redacted)
npx tsx scripts/demo-transcript-tmp.ts # test-artifacts/demo/mcp-transcript.txt
# 4. Assemble (hermes FFmpeg with drawtext/subtitles/x264)
#    see build notes in git history; segments: title 8s + footage 45.5s + consent 7s +
#    list 12s + verify 14s + gap 14s + receipt 13s + closing 11s = 124.5s
```

`captions.srt` carries the narration script (17 cues, burnt in with libass + DejaVu Sans).

## Verification (release cut)

- `ffprobe`: 124.52s, 1920×1080, h264, single video stream.
- All SRT cues end ≤ 124.0s; no credential, user-data, or env-value strings in video, captions, cards, or stills (approval shown truncated+redacted only).
- Every venue, verdict, and provider count matches the recorded production runs (see `docs/hackathons/QLOO-DEMO-SCRIPT.md` shot list).
- No fixtures presented as live; no invented metrics; no autonomous-agent claims.
