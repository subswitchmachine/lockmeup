import { useState } from 'react'
import type { TaskLog } from '../lib/shareConfig'
import { clearHistory, loadHistory, removeHistory } from '../lib/sessionHistory'
import { formatRemaining } from '../lib/time'
import { SessionLog } from './SessionLog'

/**
 * Browser-local list of past sessions. Each entry is a saved `TaskLog` (no
 * frames). Collapsed by default; expanding a row reveals the full SessionLog.
 */
export function SessionHistory() {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<TaskLog[]>(() => loadHistory())
  // Which entry is expanded, keyed by lock/unlock identity.
  const [expanded, setExpanded] = useState<string | null>(null)

  const entryId = (log: TaskLog) => `${log.lockedAt}-${log.unlockedAt}`

  const handleOpen = () => {
    // Re-read on open so a session completed earlier this visit shows up.
    setHistory(loadHistory())
    setOpen(true)
  }

  const handleClearAll = () => {
    clearHistory()
    setHistory([])
    setExpanded(null)
  }

  const handleRemove = (log: TaskLog) => {
    setHistory(removeHistory(log))
    if (expanded === entryId(log)) setExpanded(null)
  }

  if (!open) {
    return (
      <div className="session-history">
        <button type="button" className="share-import-btn" onClick={handleOpen}>
          Past sessions
        </button>
      </div>
    )
  }

  return (
    <div className="panel session-history">
      <div className="share-panel-row">
        <p className="share-panel-title">Past sessions</p>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {history.length > 0 && (
            <button type="button" onClick={handleClearAll}>
              Clear all
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="panel-note">No completed sessions yet.</p>
      ) : (
        <ul className="session-history-list">
          {history.map((log) => {
            const id = entryId(log)
            const isOpen = expanded === id
            return (
              <li key={id} className="session-history-item">
                <div className="session-history-row">
                  <button
                    type="button"
                    className="session-history-toggle"
                    onClick={() => setExpanded(isOpen ? null : id)}
                    aria-expanded={isOpen}
                  >
                    <span className="session-history-date">
                      {new Date(log.unlockedAt).toLocaleString()}
                    </span>
                    <span className="session-history-meta">
                      {log.results.length} task{log.results.length === 1 ? '' : 's'} ·{' '}
                      {formatRemaining(log.unlockedAt - log.lockedAt)} ·{' '}
                      {log.unlockMethod === 'maxtime' ? 'time limit' : 'completed'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="session-history-remove"
                    onClick={() => handleRemove(log)}
                    aria-label="Remove this session from history"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                {isOpen && <SessionLog log={log} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
