import type { TaskLog } from '../lib/shareConfig'
import type { TaskSpec } from '../lib/tasks'
import { formatRemaining } from '../lib/time'
import { KIND_LABEL, specSummary } from './sessionLogModel'

interface SessionLogProps {
  log: TaskLog
}

export function SessionLog({ log }: SessionLogProps) {
  const totalMs = log.unlockedAt - log.lockedAt

  // Pair each result with its corresponding task spec (same index).
  const rows = log.results.map((r, i) => ({ result: r, spec: log.tasks[i] as TaskSpec | undefined }))

  return (
    <div className="session-log">
      <table className="session-log-table">
        <tbody>
          <tr>
            <td className="session-log-label">Locked</td>
            <td>{new Date(log.lockedAt).toLocaleString()}</td>
          </tr>
          <tr>
            <td className="session-log-label">Unlocked</td>
            <td>{new Date(log.unlockedAt).toLocaleString()}</td>
          </tr>
          <tr>
            <td className="session-log-label">Total time</td>
            <td>{formatRemaining(totalMs)}</td>
          </tr>
          <tr>
            <td className="session-log-label">Method</td>
            <td>{log.unlockMethod === 'maxtime' ? 'Time limit' : 'Task completion'}</td>
          </tr>
        </tbody>
      </table>

      {rows.length > 0 && (
        <>
          <h3 className="session-log-title">Tasks</h3>
          <table className="session-log-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Config</th>
                <th>Time</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ result, spec }, i) => (
                <tr key={i}>
                  <td>{KIND_LABEL[result.kind]}</td>
                  <td className="session-log-config">{spec ? specSummary(spec) : '—'}</td>
                  <td>{formatRemaining(result.durationMs)}</td>
                  <td>{result.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
