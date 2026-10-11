interface ProceedPanelProps {
  title: string
  note?: string
  /** Button label — "Next task" or "Unlock". */
  nextLabel: string
  onComplete: () => void
}

/**
 * Shared "task complete" panel: a heading and a single proceed button. Used by
 * every non-jigsaw task so completion looks consistent across the app.
 */
export function ProceedPanel({ title, note, nextLabel, onComplete }: ProceedPanelProps) {
  return (
    <div className="panel locked-panel">
      <h2>{title}</h2>
      {note && <p className="panel-note">{note}</p>}
      <div className="panel-actions">
        <button type="button" className="primary" onClick={onComplete}>
          {nextLabel}
        </button>
      </div>
    </div>
  )
}
