import {
  newDraft,
  newFlowId,
  type FlowChild,
  type FlowItem,
  type TaskDraft,
} from '../lib/tasks'
import { KIND_LABEL, newPoolChild, summarize, type TaskKind } from './flowModel'
import { move, type RowCtrl } from '../lib/flowUtils'
import { NumberInput, RandomToggle, RangeInputs, RowButtons } from './flowControls'
import { AddMenu } from './AddMenu'

/**
 * Editable renderers for the items in a flow being designed: a single task row,
 * a pool (pick-one group), and a loop (repeat group). They recurse — a loop
 * contains children, a pool contains tasks — and open the task modal via the
 * shared `openEditor`/`onPreview` callbacks threaded down from FlowBuilder.
 */

type OpenEditor = (draft: TaskDraft, save: (d: TaskDraft) => void) => void
type OnPreview = (draft: TaskDraft) => void

function TaskRow({
  draft,
  onEdit,
  onPreview,
  ctrl,
}: {
  draft: TaskDraft
  onEdit: () => void
  onPreview: () => void
  ctrl: RowCtrl
}) {
  return (
    <div className="flow-row">
      <button type="button" className="flow-row-edit" onClick={onEdit}>
        <span className="flow-tag">{KIND_LABEL[draft.kind]}</span>
        <span className="flow-summary-text">{summarize(draft)}</span>
        <span className="flow-edit-hint">Edit ▸</span>
      </button>
      <button
        type="button"
        className="flow-row-preview"
        onClick={onPreview}
        aria-label="Preview task"
        title="Try this task once"
      >
        ▶
      </button>
      <RowButtons {...ctrl} />
    </div>
  )
}

export function ChildEditor({
  child,
  onChange,
  openEditor,
  onPreview,
  ...ctrl
}: {
  child: FlowChild
  onChange: (c: FlowChild) => void
  openEditor: OpenEditor
  onPreview: OnPreview
} & RowCtrl) {
  if (child.type === 'pool') {
    return (
      <PoolEditor
        pool={child}
        onChange={onChange}
        openEditor={openEditor}
        onPreview={onPreview}
        {...ctrl}
      />
    )
  }
  return (
    <TaskRow
      draft={child.task}
      onEdit={() => openEditor(child.task, (t) => onChange({ ...child, task: t }))}
      onPreview={() => onPreview(child.task)}
      ctrl={ctrl}
    />
  )
}

function PoolEditor({
  pool,
  onChange,
  openEditor,
  onPreview,
  ...ctrl
}: {
  pool: Extract<FlowChild, { type: 'pool' }>
  onChange: (c: FlowChild) => void
  openEditor: OpenEditor
  onPreview: OnPreview
} & RowCtrl) {
  const addTask = (kind: TaskKind) =>
    openEditor(newDraft(kind), (task) =>
      onChange({ ...pool, tasks: [...pool.tasks, { id: newFlowId(), task }] }),
    )
  const replaceTask = (tid: string, task: TaskDraft) =>
    onChange({ ...pool, tasks: pool.tasks.map((t) => (t.id === tid ? { ...t, task } : t)) })
  const removeTask = (tid: string) =>
    onChange({ ...pool, tasks: pool.tasks.filter((t) => t.id !== tid) })
  const moveTask = (tid: string, dir: -1 | 1) =>
    onChange({
      ...pool,
      tasks: move(pool.tasks, pool.tasks.findIndex((t) => t.id === tid), dir),
    })

  return (
    <div className="flow-loop">
      <div className="flow-loop-head">
        <span className="flow-tag">🎲 Pool</span>
        <span className="flow-unit">one at random</span>
        <RowButtons {...ctrl} />
      </div>
      <ol className="flow-list flow-loop-list">
        {pool.tasks.map((t, i) => (
          <li key={t.id}>
            <TaskRow
              draft={t.task}
              onEdit={() => openEditor(t.task, (d) => replaceTask(t.id, d))}
              onPreview={() => onPreview(t.task)}
              ctrl={{
                onUp: i > 0 ? () => moveTask(t.id, -1) : undefined,
                onDown: i < pool.tasks.length - 1 ? () => moveTask(t.id, 1) : undefined,
                onRemove: () => removeTask(t.id),
              }}
            />
          </li>
        ))}
      </ol>
      <AddMenu onAdd={(v) => addTask(v as TaskKind)} />
    </div>
  )
}

export function LoopEditor({
  loop,
  onChange,
  openEditor,
  onPreview,
  ...ctrl
}: {
  loop: Extract<FlowItem, { type: 'loop' }>
  onChange: (i: FlowItem) => void
  openEditor: OpenEditor
  onPreview: OnPreview
} & RowCtrl) {
  const addChild = (v: string) => {
    if (v === 'pool') {
      onChange({ ...loop, children: [...loop.children, newPoolChild()] })
      return
    }
    openEditor(newDraft(v as TaskKind), (task) =>
      onChange({
        ...loop,
        children: [...loop.children, { id: newFlowId(), type: 'task', task }],
      }),
    )
  }
  const replaceChild = (cid: string, c: FlowChild) =>
    onChange({ ...loop, children: loop.children.map((x) => (x.id === cid ? c : x)) })
  const removeChild = (cid: string) =>
    onChange({ ...loop, children: loop.children.filter((x) => x.id !== cid) })
  const moveChild = (cid: string, dir: -1 | 1) =>
    onChange({
      ...loop,
      children: move(loop.children, loop.children.findIndex((x) => x.id === cid), dir),
    })

  return (
    <div className="flow-loop">
      <div className="flow-loop-head">
        <span className="flow-tag">🔁 Repeat</span>
        {loop.random ? (
          <RangeInputs
            min={loop.minRepeat}
            max={loop.maxRepeat}
            onChange={(min, max) => onChange({ ...loop, minRepeat: min, maxRepeat: max })}
          />
        ) : (
          <NumberInput
            value={loop.minRepeat}
            onChange={(v) => onChange({ ...loop, minRepeat: v, maxRepeat: v })}
          />
        )}
        <span className="flow-unit">×</span>
        <RandomToggle
          checked={loop.random}
          onChange={(r) =>
            onChange({
              ...loop,
              random: r,
              maxRepeat: r ? loop.maxRepeat : loop.minRepeat,
            })
          }
        />
        <RowButtons {...ctrl} />
      </div>
      <ol className="flow-list flow-loop-list">
        {loop.children.map((c, i) => (
          <li key={c.id}>
            <ChildEditor
              child={c}
              onChange={(nc) => replaceChild(c.id, nc)}
              openEditor={openEditor}
              onPreview={onPreview}
              onUp={i > 0 ? () => moveChild(c.id, -1) : undefined}
              onDown={i < loop.children.length - 1 ? () => moveChild(c.id, 1) : undefined}
              onRemove={() => removeChild(c.id)}
            />
          </li>
        ))}
      </ol>
      <AddMenu onAdd={addChild} allowPool />
    </div>
  )
}
