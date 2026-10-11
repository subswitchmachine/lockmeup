# CLAUDE.md

## Project overview

lockmeup is a browser-only self-locking commitment device. The user designs a task session, photographs a lock combination, and the photo is encrypted and hidden until every task is complete. No backend — everything lives in IndexedDB and Web Crypto.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # tsc -b && vite build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (type-check without emitting)
npm run preview    # serve the production build
```

## Architecture

### Three phases (all in App.tsx)

1. **Design** (`pendingLock === null`, lockbox not loaded) — `FlowBuilder` lets the user build a task flow. Flow-design state is owned by App so it survives the round-trip to phase 2 and back.

2. **Capture** (`pendingLock !== null`) — camera view + auto-capture. `useAutoCapture` watches for stillness and triggers a burst. After the burst the user reviews frames and clicks "Lock away", which encrypts and stores everything.

3. **Locked / Revealed** — driven entirely by `useLockbox`. If frames are `null` the lock is active and `TaskRunner` renders the current task. Once all tasks complete (or `maxTotalMs` elapses), `useLockbox` decrypts the frames and `RevealedPanel` shows them.

PreviewScreen (try a task without locking) is a full-screen takeover rendered before these three phases are checked. `AboutModal` describes the app; it opens by itself on a first visit (flag in localStorage via `aboutSeen.ts`) and again from the header's About button.

### Key files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Phase router, owns flow-design state |
| `src/hooks/useLockbox.ts` | Loads IndexedDB record, advances task progress, triggers reveal |
| `src/hooks/useAutoCapture.ts` | Camera burst logic, settle detection |
| `src/hooks/useCamera.ts` | `getUserMedia` wrapper |
| `src/lib/tasks.ts` | All task types: `TaskDraft` (editor), `TaskSpec` (runtime), `FlowItem` (flow builder), `expandFlow()` |
| `src/lib/lockStore.ts` | IndexedDB read/write, AES-GCM encrypt/decrypt via `crypto.ts` |
| `src/lib/shareConfig.ts` | Share code encode/decode (base64 + rot13 obfuscation, not encryption) |
| `src/lib/trustedTime.ts` | External time fetch to resist clock manipulation |
| `src/lib/puzzleImages.ts` | Registry of bundled images used by puzzle tasks |
| `src/components/TaskEditor.tsx` | Modal editor for a single `TaskDraft` |
| `src/components/FlowBuilder.tsx` | Full flow design UI: task list, pools, loops, share/import |
| `src/components/TaskRunner.tsx` | Renders the current live task from a `TaskSpec` |

### Data model

```
FlowItem[]          — what the user designs (drafts with ranges, pools, loops)
     ↓ expandFlow() at lock time
TaskSpec[]          — concrete runtime values (randomness resolved)
     ↓ encrypted + stored in IndexedDB
EncryptedRecord     — { iv, data (encrypted frames+tasks), tasks (plaintext), completedCount, options }
```

`TaskDraft` and `TaskSpec` are separate union types. Drafts have `min/max` ranges; specs have resolved single values. `draftToSpec()` in `tasks.ts` resolves a draft to a spec.

### Security model

- Frames are encrypted with AES-GCM (key derived by Web Crypto, stored in IndexedDB alongside the ciphertext — this is a commitment device, not a secret store).
- Task specs and `completedCount` are stored **plaintext** so the locked UI can render the current task without decrypting the frames.
- Task completion is client-side. A user with DevTools can advance `completedCount` manually. The About modal acknowledges this.
- Share codes use base64 + rot13 — obfuscation to prevent casual reading, not security.

### Two clocks (IMPORTANT)

Never measure a duration across both of these — that was a real bug (a session
finished in seconds reported 18 minutes).

- **Trusted time** (`trustedNow()`, `StoredLock.lockedAt`, `useLockbox.now`) —
  *enforcement only*: the `maxTotalMs` deadline and timed `wait` tasks. It resists
  an OS clock set forward, but it can be unavailable (offline → `null`) or wrong
  (a provider with a bad clock), so it must never appear in something the user
  reads as elapsed time.
- **Device clock** (`Date.now()`, `StoredLock.wallLockedAt`, `useLockbox.wallNow`,
  `unlockedAt`) — *display only*: the "Locked for" header and everything in
  `TaskLog` / `SessionLog`. Always consistent with itself; tampering with it only
  distorts the user's own log, never the unlock gate.

`wallLockedAt` is optional — records written before it existed fall back to
`lockedAt`. `syncTrustedTime()` queries its sources in parallel and takes the
**median**, so one provider with a skewed clock can't poison the anchor.

### Backward compatibility (IMPORTANT)

This app is **live**, and a lock can stay active for days. A user may refresh into a newer deployed version while a lock from an older version is still in IndexedDB. **Updates must never break the ability to open or complete an existing lock.** Concretely:

- Never delete or destructively migrate the lock store. The `onupgradeneeded` in `lockStore.ts` predates real users; bumping `DB_VERSION` to drop the store would orphan live locks. Add fields, don't remove or rename them.
- Treat `EncryptedRecord` / `StoredLock` (and `TaskSpec`, `LockOptions`) as append-only. Make new fields optional and tolerate their absence — see `migrateOptions()` in `useLockbox.ts`, which backfills defaults for records written by older versions.
- The runtime must render any `TaskSpec` shape an older version could have stored. Don't change the meaning of existing fields; introduce a new variant/field instead.
- Custom images live in their own IndexedDB DB (`combo-custom-images`); the same rule applies — a locked session resolves `imageId`s against whatever is stored, so don't drop or re-key that store.

When in doubt, write a record with the old code path and confirm the new code can still open and complete it.

### Canvas-based tasks

`SteadyTask`, `HoldTask`, and `TapTask` use a `requestAnimationFrame` loop with `useRef` for all mutable render state. Avoid converting those refs to `useState` — the RAF loop reads them directly each frame and React re-renders would cause jank.

`SteadyTask` specifically:
- Path geometry is normalised `[0,1]×[0,1]` then scaled to canvas pixels each frame (handles resize)
- `progressRef` tracks 0→1 along the path; only forward movement counts
- `activeRef` prevents teleport: a drag session only contributes once it starts within `wallDist` of the current frontier
- `wallDist = hw - probeR` — collision is edge-of-circle, not pointer centre

### Camera / capture

`useAutoCapture` runs a `captureMachine` state machine (idle → settling → captured). It monitors sharpness, brightness, and motion via `imageMetrics.ts`. `DEFAULT_CONFIG` in `captureConfig.ts` controls thresholds and burst count.

The camera preview is mirrored (`scaleX(-1)`) but captured frames use raw pixels.

### Flow builder

`FlowItem` can be a task, a pool (one child drawn at random), or a loop (children repeated N times with optional random repeat count). `expandFlow()` flattens this tree into a flat `TaskSpec[]` at lock time.

The `AddMenu` dropdown uses `position: fixed` with coordinates from `getBoundingClientRect()` at open time — this is intentional to prevent clipping at the bottom of the viewport.

### Shared images

Images in `src/img/<pool>/` are bundled at build time and registered in `puzzleImages.ts`. They are used as the source material for jigsaw, sliding, memory, sequence, and slideshow tasks.

`src/img/` is **gitignored** — the real images live in a separate private repo (`subswitchmachine/lockmeup-images`) that the deploy workflow checks out into `src/img` using the `IMAGES_DEPLOY_KEY` secret. Locally, clone that repo into `src/img` to work with the real set. When `src/img` is empty the registry falls back to the placeholder pool in `src/img-sample/`, which exists so a bare checkout (and the tests) still run. Stored `imageId`s are `<pool>/<filename>`, so never rename files or pools in the images repo — live locks resolve against them.

## Conventions

- All CSS is in `src/App.css` and `src/index.css` (global tokens). No CSS modules, no Tailwind.
- CSS custom properties for theming: `--text`, `--text-h`, `--bg`, `--panel`, `--border`, `--accent`, `--accent-bg`, `--accent-border`, `--pass`, `--fail`, `--shadow`.
- Task editor rows use the `Row` component (label + controls grid). Section dividers use `ModalSection`.
- `flow-random` is a pill-style toggle label that hides its checkbox visually — the whole label is the click target, `:has(:checked)` drives the active style.
- No test suite. TypeScript + manual testing.
- `newFlowId()` uses a module-level counter for stable React keys — the flow is never persisted in draft form, so this is fine.
