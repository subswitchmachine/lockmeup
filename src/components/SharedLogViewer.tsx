import { useEffect, useState } from 'react'
import { decodeLog, type TaskLog } from '../lib/shareConfig'
import { SessionLog } from './SessionLog'

interface SharedLogViewerProps {
  /** Pre-decoded log (e.g. from a `#log=…` share link) — opens the viewer
   *  immediately with `log` populated and no paste step. */
  initialLog?: TaskLog | null
  /** Fired when the viewer closes; lets the parent forget any incoming log. */
  onClose?: () => void
}

export function SharedLogViewer({ initialLog, onClose }: SharedLogViewerProps = {}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [log, setLog] = useState<TaskLog | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Adopt an incoming log from a share link. We watch the prop identity so a
  // second link in the same session re-opens the viewer. Deferred via
  // `queueMicrotask` so the setStates run outside the render cycle (the lint
  // rule forbids synchronous setState in an effect body).
  useEffect(() => {
    if (!initialLog) return
    queueMicrotask(() => {
      setLog(initialLog)
      setOpen(true)
      setError(null)
    })
  }, [initialLog])

  const handleDecode = () => {
    // Accept a raw code or a `#log=…` share URL — pull the code out of the
    // URL form so the user can paste a link they were sent.
    const raw = input.trim()
    const fromUrl = raw.match(/[#?&]log=([^&]+)/)
    const candidate = fromUrl ? decodeURIComponent(fromUrl[1]) : raw
    const decoded = decodeLog(candidate)
    if (decoded) {
      setLog(decoded)
      setError(null)
    } else {
      setLog(null)
      setError('Invalid log code — check that you pasted it correctly.')
    }
  }

  const handleClose = () => {
    setOpen(false)
    setInput('')
    setLog(null)
    setError(null)
    onClose?.()
  }

  if (!open) {
    return (
      <div className="shared-log-viewer">
        <button type="button" className="share-import-btn" onClick={() => setOpen(true)}>
          View session log
        </button>
      </div>
    )
  }

  return (
    <div className="panel shared-log-viewer">
      <div className="share-panel-row">
        <p className="share-panel-title">View session log</p>
        <button type="button" onClick={handleClose} style={{ marginLeft: 'auto' }}>
          Close
        </button>
      </div>
      <textarea
        className="share-code-input"
        value={input}
        onChange={(e) => { setInput(e.target.value); setLog(null); setError(null) }}
        placeholder="Paste log code here…"
        rows={4}
      />
      <div className="share-panel-actions">
        <button type="button" className="primary" onClick={handleDecode} disabled={!input.trim()}>
          Decode
        </button>
      </div>
      {error && <p className="share-error">{error}</p>}
      {log && <SessionLog log={log} />}
    </div>
  )
}
