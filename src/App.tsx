import { useEffect, useState } from 'react'
import { useCamera } from './hooks/useCamera'
import { useAutoCapture } from './hooks/useAutoCapture'
import { useLockbox } from './hooks/useLockbox'
import { CameraView } from './components/CameraView'
import { MetricsOverlay } from './components/MetricsOverlay'
import { CaptureCarousel } from './components/CaptureCarousel'
import { FlowBuilder } from './components/FlowBuilder'
import { PreviewScreen } from './components/PreviewScreen'
import { TaskRunner } from './components/TaskRunner'
import { PoolsProvider } from './lib/poolsContext'
import { RevealedPanel } from './components/RevealedPanel'
import { SharedLogViewer } from './components/SharedLogViewer'
import { SessionHistory } from './components/SessionHistory'
import { AboutModal } from './components/AboutModal'
import { hasSeenAbout, markAboutSeen } from './lib/aboutSeen'
import { DEFAULT_CONFIG } from './lib/captureConfig'
import {
  draftToSpec,
  newDraft,
  newFlowId,
  type FlowItem,
  type HideMode,
  type LockOptions,
  type MaxTotalDraft,
  type TaskDraft,
  type TaskSpec,
} from './lib/tasks'
import {
  clearShareFromLocation,
  decodeConfig,
  decodeLog,
  readShareFromLocation,
  type SharedConfig,
  type TaskLog,
} from './lib/shareConfig'
import { getCustomPoolsSnapshot, IMAGE_POOLS } from './lib/puzzleImages'
import { initCustomImages } from './lib/imageLibrary'
import { formatRemaining } from './lib/time'
import './App.css'

function App() {
  // Stable fallback for unlockedAt — captured once at mount so render stays
  // pure (avoids calling Date.now() during render).
  const [mountedAt] = useState(() => Date.now())
  const lockbox = useLockbox()
  const { videoRef, status, error, resolvedFacingMode, stream, start, stop } = useCamera()
  const active = status === 'ready'
  const [autoCapture, setAutoCapture] = useState(true)
  const { state, metrics, capture, retake, captureNow, roiFraction } = useAutoCapture(
    videoRef,
    active,
    autoCapture,
    DEFAULT_CONFIG,
    stop, // close the camera as soon as the burst finishes
  )

  // The committed-but-not-yet-locked flow. Set when the user finishes the flow
  // builder and confirms; consumed when they capture + lock.
  const [pendingLock, setPendingLock] = useState<{
    tasks: TaskSpec[]
    options: LockOptions
  } | null>(null)

  // A single task being previewed (try-once, no lock). Null = not previewing.
  const [preview, setPreview] = useState<TaskSpec | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  // True until the intro has been dismissed once on this device; opens the
  // About modal by itself on a first visit.
  const [firstVisit, setFirstVisit] = useState(() => !hasSeenAbout())
  // Mirror default: on for selfie cams and desktop webcams (browser usually
  // reports no facingMode), off for rear-facing mobile cameras. The toolbar
  // button stores an explicit override that wins over the default.
  const [mirrorOverride, setMirrorOverride] = useState<boolean | null>(null)
  const mirrored = mirrorOverride ?? resolvedFacingMode !== 'environment'
  // A log handed to us by a `#log=…` link — opens the shared-log viewer.
  const [incomingLog, setIncomingLog] = useState<TaskLog | null>(null)
  // Surfaced when a link couldn't be decoded (e.g. truncated paste).
  const [linkError, setLinkError] = useState<string | null>(null)

  // Flow-design state lives here (not in FlowBuilder) so it survives a round
  // trip to the capture phase and back via "Edit flow".
  const [flowItems, setFlowItems] = useState<FlowItem[]>(() => [
    { id: newFlowId(), type: 'task', task: newDraft('jigsaw') },
  ])
  const [flowHideMode, setFlowHideMode] = useState<HideMode>('show')
  const [loadedConfig, setLoadedConfig] = useState<SharedConfig | null>(null)
  const [flowShuffle, setFlowShuffle] = useState(false)
  const [flowPools, setFlowPools] = useState<string[]>(() => IMAGE_POOLS.slice())
  const [flowMaxTotal, setFlowMaxTotal] = useState<MaxTotalDraft>({
    enabled: false,
    random: false,
    minAmount: 1,
    maxAmount: 1,
    unit: 'hours',
  })

  // User-supplied images live as Blobs in IndexedDB; load and register them
  // before any image task renders. A locked session reloading must wait for
  // this — `imageUrl()` is synchronous, so an unready registry would paint
  // bundled fallbacks for puzzles built from the user's own images.
  const [imagesReady, setImagesReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    initCustomImages()
      .then(() => {
        if (cancelled) return
        // Default-select any custom pools so they're used like the bundled ones.
        const customs = getCustomPoolsSnapshot()
        if (customs.length > 0) {
          setFlowPools((prev) => [...prev, ...customs.filter((p) => !prev.includes(p))])
        }
      })
      .finally(() => {
        if (!cancelled) setImagesReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const captureComplete = capture !== null && capture.frames.length >= DEFAULT_CONFIG.burstCount

  const handleContinue = (tasks: TaskSpec[], options: LockOptions) => {
    setPendingLock({ tasks, options })
  }
  // Start the session immediately with no combination photo: lock away an empty
  // frame set so the task flow runs but there's nothing to reveal at the end.
  const handleStartNoPhoto = async (tasks: TaskSpec[], options: LockOptions) => {
    await lockbox.lockAway([], tasks, options)
  }
  const handleRetake = () => {
    retake()
    start()
  }
  const handleLockNow = async () => {
    if (!capture || !pendingLock) return
    await lockbox.lockAway(capture.frames, pendingLock.tasks, pendingLock.options)
    retake()
    setPendingLock(null)
  }
  const handleBackToFlow = () => {
    // Discard any in-progress capture and return to the builder; the FlowBuilder
    // is kept mounted (CSS-hidden during capture) so its design state survives.
    retake()
    stop()
    setPendingLock(null)
  }
  const handlePreview = (draft: TaskDraft) => {
    setPreview(draftToSpec(draft, flowPools))
  }
  const handleLoadConfig = (config: SharedConfig) => {
    setFlowItems(config.items)
    setFlowHideMode(config.hideMode)
    setFlowShuffle(config.shuffle)
    if (config.pools) setFlowPools(config.pools)
    setLoadedConfig(config)
  }
  const handleClearConfig = () => {
    setLoadedConfig(null)
    setFlowItems([{ id: newFlowId(), type: 'task', task: newDraft('jigsaw') }])
    setFlowHideMode('show')
    setFlowShuffle(false)
    setFlowPools(IMAGE_POOLS.slice())
  }

  // Inbound share links: on first mount, if the URL fragment carries a config
  // or log code, decode it, route the user to the right view, and strip the
  // fragment so a refresh doesn't re-load the same payload. Deferred via
  // `queueMicrotask` so the setState calls land outside the render cycle
  // (the lint rule forbids synchronous setState in an effect body).
  useEffect(() => {
    const incoming = readShareFromLocation()
    if (!incoming) return
    queueMicrotask(() => {
      if (incoming.kind === 'config') {
        const config = decodeConfig(incoming.code)
        if (config) handleLoadConfig(config)
        else setLinkError("That shared link's assignment couldn't be read — the code may be truncated.")
      } else {
        const log = decodeLog(incoming.code)
        if (log) setIncomingLog(log)
        else setLinkError("That shared link's log couldn't be read — the code may be truncated.")
      }
      clearShareFromLocation()
    })
  }, [])

  // Single-task preview view: takes over the screen with a Back button.
  if (preview) {
    return (
      <PoolsProvider value={flowPools}>
        <PreviewScreen spec={preview} onExit={() => setPreview(null)} />
      </PoolsProvider>
    )
  }

  // Locked + not yet revealed: the puzzle takes the whole screen, with just a
  // top bar showing how long the combo has been locked away.
  if (!lockbox.loading && imagesReady && lockbox.meta && lockbox.frames === null) {
    return (
      <PoolsProvider value={lockbox.meta.options.pools}>
      <div className="puzzle-screen">
        <header className="puzzle-topbar">
          <div className="puzzle-topbar-left">
            <span className="puzzle-topbar-label">Locked for</span>
            <span className="puzzle-topbar-time">
              {/* Display only, so both ends come off the device clock — the
                  trusted pair below stays for the auto-unlock deadline. */}
              {formatRemaining(
                lockbox.meta.wallLockedAt != null
                  ? lockbox.wallNow - lockbox.meta.wallLockedAt
                  : lockbox.now - lockbox.meta.lockedAt,
              )}
            </span>
          </div>

          <div className="puzzle-topbar-center">
            {lockbox.meta.tasks.length > 1 && (
              <span className="puzzle-topbar-step">
                Step {lockbox.meta.completedCount + 1}
                {!(
                  lockbox.meta.options.hideMode === 'hide-all' ||
                  (lockbox.meta.options.hideMode === 'hide-random' &&
                    lockbox.meta.options.stepCountRandom)
                ) && ` of ${lockbox.meta.tasks.length}`}
              </span>
            )}
          </div>

          <div className="puzzle-topbar-right">
            {lockbox.deadlineReached ? (
              <button
                type="button"
                className="primary puzzle-topbar-unlock"
                onClick={() => lockbox.reveal('maxtime')}
              >
                Unlock
              </button>
            ) : (
              lockbox.meta.options.maxTotalMs !== null &&
              !(lockbox.meta.options.hideMode === 'hide-random' &&
                lockbox.meta.options.maxTotalRandom) && (
                <span className="puzzle-topbar-step">
                  Auto-unlock in{' '}
                  {formatRemaining(
                    lockbox.meta.lockedAt + lockbox.meta.options.maxTotalMs - lockbox.now,
                  )}
                </span>
              )
            )}
            {!lockbox.timeVerified && <span className="puzzle-topbar-warn">time unverified</span>}
          </div>
        </header>
        <main className="puzzle-stage">
          <TaskRunner
            meta={lockbox.meta}
            onTaskComplete={(result) => lockbox.completeCurrentTask(result)}
            now={lockbox.now}
            timeVerified={lockbox.timeVerified}
          />
        </main>
      </div>
      </PoolsProvider>
    )
  }

  let body
  if (lockbox.loading || !imagesReady) {
    body = <p className="loading">Loading…</p>
  } else if (lockbox.meta && lockbox.frames !== null) {
    body = (
      <main className="app-main">
        <RevealedPanel
          frames={lockbox.frames}
          lockedAt={lockbox.lockedAt ?? 0}
          unlockedAt={lockbox.unlockedAt ?? mountedAt}
          tasks={lockbox.meta?.tasks ?? []}
          taskResults={lockbox.taskResults}
          unlockMethod={lockbox.unlockMethod}
          onStartOver={lockbox.clear}
        />
      </main>
    )
  } else if (pendingLock === null) {
    // Phase A: design the task flow. Its state lives in App, so going back here
    // from the capture phase always restores the user's configuration.
    body = (
      <main className="app-main">
        <FlowBuilder
          items={flowItems}
          setItems={setFlowItems}
          hideMode={flowHideMode}
          setHideMode={setFlowHideMode}
          shuffle={flowShuffle}
          setShuffle={setFlowShuffle}
          pools={flowPools}
          setPools={setFlowPools}
          maxTotal={flowMaxTotal}
          setMaxTotal={setFlowMaxTotal}
          loadedConfig={loadedConfig}
          onLoadConfig={handleLoadConfig}
          onClearConfig={handleClearConfig}
          onContinue={handleContinue}
          onStartNoPhoto={handleStartNoPhoto}
          onPreview={handlePreview}
        />
        {linkError && (
          <div className="panel share-error-panel">
            <p className="share-error">{linkError}</p>
            <button type="button" onClick={() => setLinkError(null)}>Dismiss</button>
          </div>
        )}
        <SharedLogViewer
          initialLog={incomingLog}
          onClose={() => setIncomingLog(null)}
        />
        <SessionHistory />
      </main>
    )
  } else {
    // Phases B (capture) and C (review).
    body = (
      <main className="app-main">
        {(
          <>
            <section className="stage">
              {captureComplete && capture ? (
                <CaptureCarousel frames={capture.frames} />
              ) : (
                <>
                  <CameraView
                    videoRef={videoRef}
                    stream={stream}
                    state={state}
                    roiFraction={roiFraction}
                    settleProgress={metrics.settleProgress}
                    mirrored={mirrored}
                  />

                  {!active && (
                    <div className="camera-cover">
                      {status === 'requesting' ? (
                        <p>Requesting camera…</p>
                      ) : (
                        <>
                          {error && <p className="camera-error">{error}</p>}
                          <button type="button" className="primary" onClick={start}>
                            {status === 'idle' ? 'Start camera' : 'Try again'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {active && (
                    <div className="stage-controls">
                      <MetricsOverlay metrics={metrics} config={DEFAULT_CONFIG} />
                      <button type="button" className="primary" onClick={captureNow}>
                        Capture now
                      </button>
                      <button type="button" onClick={stop}>
                        Stop camera
                      </button>
                      <button
                        type="button"
                        className="mirror-btn"
                        onClick={() => setMirrorOverride(!mirrored)}
                        aria-pressed={mirrored}
                      >
                        {mirrored ? 'Unmirror' : 'Mirror'}
                      </button>
                      <button
                        type="button"
                        className="auto-btn"
                        onClick={() => setAutoCapture((a) => !a)}
                        aria-pressed={autoCapture}
                      >
                        Auto: {autoCapture ? 'On' : 'Off'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            <div className="panel capture-actions">
              {captureComplete ? (
                <>
                  <h2>Ready to lock</h2>
                  <p className="panel-note">
                    Combination captured — lock it away or retake if needed.
                  </p>
                  <div className="panel-actions">
                    <button type="button" onClick={handleBackToFlow}>
                      ← Edit session
                    </button>
                    <button type="button" onClick={handleRetake}>
                      Retake
                    </button>
                    <button type="button" className="primary" onClick={handleLockNow}>
                      Lock away
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>Photograph the combination</h2>
                  <p className="panel-note">
                    Point your camera at the lock — the combination stays hidden until every task is done.
                  </p>
                  <div className="panel-actions">
                    <button type="button" onClick={handleBackToFlow}>
                      ← Edit session
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    )
  }

  // The first-visit intro waits for the design phase: it never covers a
  // revealed combination or a shared log someone was sent a link to.
  const aboutOpen =
    showAbout ||
    (firstVisit && !lockbox.loading && imagesReady && !lockbox.meta && incomingLog === null)
  const closeAbout = () => {
    setShowAbout(false)
    setFirstVisit(false)
    markAboutSeen()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <h1>lockmeup</h1>
          <div className="app-header-links">
            <button type="button" className="about-link" onClick={() => setShowAbout(true)}>
              About
            </button>
            <a
              className="about-link discord-link"
              href="https://discord.gg/83yjSnGMQe"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the Discord"
              title="Join the Discord"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>
        </div>
        <p className="app-header-sub">
          Design tasks, photograph the combination — it stays hidden until every task is done.
        </p>
      </header>
      {body}
      {aboutOpen && <AboutModal onClose={closeAbout} />}
    </div>
  )
}

export default App
