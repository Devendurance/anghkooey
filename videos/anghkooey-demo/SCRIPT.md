# Final voiceover

Minimal truthful adaptations from the supplied script. Timing measured from ElevenLabs audio, not word-count estimates.

## 01 The frustration (0-17s)

Here's the part of travel planning nobody likes: explaining yourself all over again. The quiet room. The morning light. The road noise that ruined your last stay. Those small details matter.

## 02 Meet Anghkooey (17-38s)

So I built Anghkooey, an AI concierge whose name means remember. With your permission, it keeps the small details behind your choices and brings them back when they're relevant. Watch what changes.

## 03 Before memory (38-65s)

Before linking, I ask about a traveller's hotel preferences. Anghkooey won't guess from what's available here. In Telegram, I enable memory and share what matters: quiet hotels, beautiful natural light, and no rooms facing busy roads. The preference is acknowledged. A separate Web save shows a confirmed Walrus receipt.

## 04 The moment it remembers (65-91s)

First, the connection is confirmed. Now I ask about my saved preferences. This time, Anghkooey doesn't make me repeat the story. It recalls quiet hotels and natural lighting, two durable preferences. The actual reply makes the change visible. It also honestly flags what it can't confirm about where those preferences were shared.

## 05 Memory follows you (91-116s)

People don't live in one tab. Anghkooey works through Telegram and iMessage. From Profile, I generate a one-time linking code and confirm through the messaging channel. Existing accounts require an explicit merge confirmation. Once linked, those preferences can follow me across conversations.

## 06 Remember, responsibly (116-139s)

Memory also needs a way to change. In the Memories library, I can review confirmed records, search for relevant facts, and correct an outdated preference. A correction creates a new Walrus blob and retires the previous version from future recall. Saving memory starts with permission.

## 07 The engineering (139-162s)

Underneath: DeepSeek Flash, memory orchestration, Walrus, Neon for account state, and a persistent Photon messaging worker. The engineering challenges were real: ESM-only SDK imports, missing peer packages, reasoning tokens consuming response budgets, and duplicate workers. We addressed them and documented the lessons.

## 08 The close (162-175s)

No fake bookings. No memory claims without proof. A concierge that remembers what matters and lets you correct it. Anghkooey. You shouldn't have to explain yourself twice.
