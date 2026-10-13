# lockmeup

A self-locking commitment device for the browser. Design a session of tasks, photograph the combination to whatever you've locked away, and the photo stays hidden until every task is complete.

## What it does

1. **Design a session** — build an ordered list of tasks in the flow builder. Tasks can be grouped into pools (one picked at random) or loops (repeated N times). Individual values can be randomised within ranges so the person completing them doesn't know exactly what they're in for.

2. **Photograph the combination** — point your camera at the lock and the app captures a burst of frames. The photos are encrypted with AES-GCM and stored in IndexedDB; only the task metadata lives in plaintext.

3. **Complete the tasks** — the encrypted frames are only decrypted once every task in the series is finished (or an optional max-session-time elapses). Then the combination is revealed.

Everything runs entirely in the browser. No data is sent to any server.

## Play safe

If you use lockmeup for self-bondage, **always have a backup way out that doesn't depend on this app**. Browser data can be cleared, a battery can die, a photo can come out unreadable, and software has bugs — any of these could leave the combination out of reach for good.

- Keep an emergency release within reach: a spare key or the written combination in a sealed envelope or tamper-evident container, or safety shears or cutters that can defeat whatever is holding you.
- Test the backup before you lock, and make sure you can reach and use it from the position you'll actually be in.
- Never use anything that restricts breathing or circulation, and never play while intoxicated. Keep a phone within reach, and ideally tell someone you trust.
- Set a max session time, and only lock yourself into something you could safely stay in for much longer than you plan to.

You use lockmeup at your own risk.

## Task types

| Task | Description |
|------|-------------|
| 🧩 Puzzle | Reassemble a scrambled photo (12–500 pieces) |
| 🔢 Sliding | Slide tiles on a grid to restore the image |
| 🃏 Memory | Flip pairs of tiles to find every matching set |
| ⌨ Typing | Type a phrase a set number of times |
| ⏱ Wait | Wait out a timer |
| ✊ Hold | Keep a moving circle inside a target zone |
| 🧘 Hold still | Stay motionless while the webcam monitors movement |
| 👆 Tap | Tap a button on cue within a time window |
| 🧠 Sequence | Watch tiles light up in a sequence, then reproduce it |
| ✋ Steady hand | Trace a path without touching the walls |

Most tasks support randomised durations/counts, difficulty settings, failure penalties, and an optional slideshow background.

## Sharing sessions

The flow builder can export a **share code** — a compact string you can send to someone else. They paste it into the import panel to load your designed session. Optionally, the task list can be hidden from the person completing it.

After a session completes, a **session log** can be exported as a share code for record-keeping.

## Privacy and security

- All data stays on-device. Photos, tasks, and logs are never uploaded anywhere.
- Captured frames are encrypted at rest (AES-GCM via the Web Crypto API).
- Task completion is enforced client-side. This is a **commitment device**, not a tamper-proof vault — a technically determined person with DevTools access could bypass it.
- Time verification fetches an external time source at startup to make clock manipulation harder, but is not authoritative.

## AI disclosure

Much of lockmeup's code was written with the help of AI coding tools. I'm a professional software engineer and I have reviewed the AI-written code myself.

## Running locally

```bash
npm install
npm run dev
```

Requires a browser with camera access for the capture step. The Hold still task requires webcam access and loads the MediaPipe face detector on demand.

### Images

The images used by the picture-based tasks are not part of this repository. A fresh checkout uses the handful of placeholders in `src/img-sample/`. To use your own, add folders of images under `src/img/` (gitignored) — each folder becomes a selectable pool — or load a folder from the app itself.

## Building

```bash
npm run build   # tsc + vite
npm run preview # serve the production build locally
```

## Stack

- React 19, TypeScript 6, Vite 8
- Web Crypto API — AES-GCM encryption of captured frames
- IndexedDB — persistent frame storage across page reloads
- MediaPipe Tasks Vision — face detection for the Hold still task
- headbreaker — jigsaw puzzle engine
