import { useEffect, useRef, useState } from 'react'
import type { CaptureFrame } from '../hooks/useAutoCapture'
import { buildShareUrl, encodeLog, type TaskLog } from '../lib/shareConfig'
import { appendHistory } from '../lib/sessionHistory'
import type { TaskResult, TaskSpec } from '../lib/tasks'
import { CaptureCarousel } from './CaptureCarousel'
import { SessionLog } from './SessionLog'

interface RevealedPanelProps {
  frames: CaptureFrame[]
  lockedAt: number
  unlockedAt: number
  tasks: TaskSpec[]
  taskResults: TaskResult[]
  unlockMethod: 'tasks' | 'maxtime'
  onStartOver: () => void
}

export function RevealedPanel({
  frames,
  lockedAt,
  unlockedAt,
  tasks,
  taskResults,
  unlockMethod,
  onStartOver,
}: RevealedPanelProps) {
  const [shareCode, setShareCode] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  // Independent "copied" flags so the two buttons can flash at once.
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const log: TaskLog = { v: 1, lockedAt, unlockedAt, unlockMethod, tasks, results: taskResults }

  // Persist this completed session to the browser-local history once. The store
  // de-dupes by lock/unlock time, so a re-render won't add a duplicate; the ref
  // just avoids redundant writes within this mount.
  const savedRef = useRef(false)
  useEffect(() => {
    if (savedRef.current) return
    savedRef.current = true
    appendHistory(log)
    // Intentionally run once on mount; the log is fully determined by the reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lazily compute the code + URL on first share; reused for both copy buttons.
  const ensureCode = () => {
    if (shareCode) return { code: shareCode, url: shareUrl! }
    const code = encodeLog(log)
    const url = buildShareUrl('log', code)
    setShareCode(code)
    setShareUrl(url)
    return { code, url }
  }

  const flash = (set: (v: boolean) => void) => {
    set(true)
    setTimeout(() => set(false), 2000)
  }

  const handleCopyCode = () => {
    const { code } = ensureCode()
    navigator.clipboard.writeText(code).then(() => flash(setCopiedCode))
  }
  const handleCopyLink = () => {
    const { url } = ensureCode()
    navigator.clipboard.writeText(url).then(() => flash(setCopiedLink))
  }

  // Sessions started "without a photo" have no combination to reveal — skip the
  // carousel and adjust the copy accordingly.
  const hasPhoto = frames.length > 0

  return (
    <>
      {hasPhoto && (
        <section className="stage">
          <CaptureCarousel frames={frames} revealed />
        </section>
      )}
      <div className="panel">
        <h2>{hasPhoto ? 'Released' : 'Done'}</h2>
        <p className="panel-note">
          {hasPhoto
            ? 'Session complete — here is your combination.'
            : 'Session complete — all tasks finished.'}
        </p>

        <SessionLog log={log} />

        <div className="panel-actions">
          <button type="button" onClick={handleCopyLink}>
            {copiedLink ? 'Link copied!' : 'Copy share link'}
          </button>
          <button type="button" onClick={handleCopyCode}>
            {copiedCode ? 'Code copied!' : 'Copy log code'}
          </button>
          <button type="button" className="primary" onClick={onStartOver}>
            New session
          </button>
        </div>

        {shareCode && (
          <div className="share-panel">
            <p className="share-panel-title">Share link</p>
            <textarea className="share-code-output" readOnly value={shareUrl ?? ''} rows={2} />
            <p className="share-panel-title">Log code</p>
            <textarea className="share-code-output" readOnly value={shareCode} rows={4} />
          </div>
        )}
      </div>
    </>
  )
}
