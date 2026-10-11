import type { FlowItem, HideMode } from '../lib/tasks'
import { IMAGE_POOLS } from '../lib/puzzleImages'
import { HIDE_MODE_LABEL, KIND_LABEL, summarize } from './flowModel'

/**
 * Read-only renderers for a designed flow, used by the locked/summary views:
 * `ReadOnlyOptions` shows the lock-level settings and `ReadOnlyFlowItem`
 * recursively renders a task / pool / loop with no editing controls.
 */

export function ReadOnlyOptions({
  shuffle,
  hideMode,
  pools,
}: {
  shuffle: boolean
  hideMode: HideMode
  pools?: string[]
}) {
  const poolList = pools && pools.length > 0 ? pools : IMAGE_POOLS
  return (
    <dl className="flow-readonly-options">
      <div className="flow-readonly-option">
        <dt>Image pools</dt>
        <dd>{poolList.join(', ') || '—'}</dd>
      </div>
      <div className="flow-readonly-option">
        <dt>Task order</dt>
        <dd>{shuffle ? 'Shuffled' : 'As listed'}</dd>
      </div>
      <div className="flow-readonly-option">
        <dt>Details</dt>
        <dd>{HIDE_MODE_LABEL[hideMode]}</dd>
      </div>
    </dl>
  )
}

export function ReadOnlyFlowItem({ item }: { item: FlowItem }) {
  if (item.type === 'task') {
    return (
      <div className="flow-row flow-row-readonly">
        <span className="flow-tag">{KIND_LABEL[item.task.kind]}</span>
        <span className="flow-summary-text">{summarize(item.task)}</span>
      </div>
    )
  }
  if (item.type === 'pool') {
    return (
      <div className="flow-loop">
        <div className="flow-loop-head">
          <span className="flow-tag">🎲 Pool</span>
          <span className="flow-unit">one at random</span>
        </div>
        <ol className="flow-list flow-loop-list">
          {item.tasks.map((t) => (
            <li key={t.id}>
              <div className="flow-row flow-row-readonly">
                <span className="flow-tag">{KIND_LABEL[t.task.kind]}</span>
                <span className="flow-summary-text">{summarize(t.task)}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  // loop
  return (
    <div className="flow-loop">
      <div className="flow-loop-head">
        <span className="flow-tag">🔁 Repeat</span>
        <span className="flow-unit">
          {item.minRepeat === item.maxRepeat ? `${item.minRepeat}×` : `${item.minRepeat}–${item.maxRepeat}×`}
        </span>
      </div>
      <ol className="flow-list flow-loop-list">
        {item.children.map((c) => (
          <li key={c.id}>
            <ReadOnlyFlowItem item={c} />
          </li>
        ))}
      </ol>
    </div>
  )
}
