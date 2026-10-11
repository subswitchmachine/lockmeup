import { useState, useRef, useLayoutEffect, type Dispatch, type SetStateAction } from 'react'
import {
  expandFlow,
  flowTaskRange,
  hasRandomStepCount,
  newDraft,
  newFlowId,
  resolveDuration,
  type FlowItem,
  type HideMode,
  type LockOptions,
  type MaxTotalDraft,
  type TaskDraft,
  type TaskSpec,
} from '../lib/tasks'
import { newLoop, newPoolChild, type TaskKind } from './flowModel'
import { ReadOnlyFlowItem, ReadOnlyOptions } from './FlowReadOnly'
import { AddMenu } from './AddMenu'
import { ChildEditor, LoopEditor } from './FlowItemEditors'
import { flushPendingEdits, move, type RowCtrl } from '../lib/flowUtils'
import {
  NumberInput,
  RandomToggle,
  RangeInputs,
  UnitSelect,
} from './flowControls'
import { TaskEditor } from './TaskEditor'
import { useImagePools } from '../hooks/useImagePools'
import { importImageFolder, removeImagePool } from '../lib/imageLibrary'
import { buildShareUrl, decodeConfig, encodeConfig, type SharedConfig } from '../lib/shareConfig'
import {
  deleteDesign,
  formatDesignAge,
  loadSavedDesigns,
  saveDesign,
  type SavedDesign,
} from '../lib/savedDesigns'

interface FlowBuilderProps {
  // The flow-design state is owned by the parent (App), so it survives the
  // round-trip to the capture phase even if this component re-mounts.
  items: FlowItem[]
  setItems: Dispatch<SetStateAction<FlowItem[]>>
  hideMode: HideMode
  setHideMode: Dispatch<SetStateAction<HideMode>>
  shuffle: boolean
  setShuffle: Dispatch<SetStateAction<boolean>>
  pools: string[]
  setPools: Dispatch<SetStateAction<string[]>>
  maxTotal: MaxTotalDraft
  setMaxTotal: Dispatch<SetStateAction<MaxTotalDraft>>
  /** Non-null when the flow was loaded from a share code. */
  loadedConfig: SharedConfig | null
  onLoadConfig: (config: SharedConfig) => void
  onClearConfig: () => void
  /** Commit the flow and proceed to capture the combo photo. */
  onContinue: (tasks: TaskSpec[], options: LockOptions) => void
  /** Commit the flow and start immediately with no combo photo to reveal. */
  onStartNoPhoto: (tasks: TaskSpec[], options: LockOptions) => void
  /** Try a single task without locking anything (back button exits). */
  onPreview: (draft: TaskDraft) => void
}

/**
 * Designs the unlock task flow: an ordered list of tasks, pools (one random
 * candidate per run), and loops. Tasks are edited in a modal (click any task
 * row to open it); pools/loops keep inline repeat controls.
 */
export function FlowBuilder({
  items,
  setItems,
  hideMode,
  setHideMode,
  shuffle,
  setShuffle,
  pools,
  setPools,
  maxTotal,
  setMaxTotal,
  loadedConfig,
  onLoadConfig,
  onClearConfig,
  onContinue,
  onStartNoPhoto,
  onPreview,
}: FlowBuilderProps) {
  const [editor, setEditor] = useState<{
    draft: TaskDraft
    save: (d: TaskDraft) => void
  } | null>(null)
  const [importInput, setImportInput] = useState('')
  const [importError, setImportError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareName, setShareName] = useState('')
  const [shareHide, setShareHide] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>(() => loadSavedDesigns())
  const [savingName, setSavingName] = useState<string | null>(null)
  // Which destination the user is heading to (capture a photo vs. start with no
  // photo) — non-null while the "no max session time" confirm is showing.
  const [noMaxConfirm, setNoMaxConfirm] = useState<'capture' | 'nophoto' | null>(null)

  const { pools: allPoolNames, customPools } = useImagePools()
  // Shares carry pool *names* only, not image data — a design drawing from a
  // local folder can't be reproduced on someone else's machine, so block it.
  const usesCustomPool = pools.some((p) => customPools.includes(p))
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState('')

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    // Reset the input so re-picking the same selection fires onChange again.
    e.target.value = ''
    if (files.length === 0) return
    setImageError('')
    const added = await importImageFolder(files)
    if (added.length === 0) {
      setImageError('No images found in that selection.')
      return
    }
    // Auto-select the freshly added pools so they're used right away.
    setPools((prev) => [...prev, ...added.filter((p) => !prev.includes(p))])
  }

  const handleRemoveImagePool = async (pool: string) => {
    await removeImagePool(pool)
    setPools((prev) => prev.filter((p) => p !== pool))
  }

  const openEditor = (draft: TaskDraft, save: (d: TaskDraft) => void) =>
    setEditor({ draft, save })

  const range = flowTaskRange(items)
  const stepCountRandom = hasRandomStepCount(items)

  // Mirror the design state so the "Capture combination" click handlers can
  // read the post-blur values after flushPendingEdits() (the closure-captured
  // props are still the stale, pre-blur ones). Uses useLayoutEffect because
  // flushSync flushes layout effects synchronously but defers passive effects
  // — we need this ref updated before flushPendingEdits returns.
  const latestRef = useRef({ items, shuffle, pools, hideMode, maxTotal })
  useLayoutEffect(() => {
    latestRef.current = { items, shuffle, pools, hideMode, maxTotal }
  }, [items, shuffle, pools, hideMode, maxTotal])

  const buildAndContinue = (target: 'capture' | 'nophoto') => {
    flushPendingEdits()
    const s = latestRef.current
    const tasks = expandFlow(s.items, { shuffle: s.shuffle, pools: s.pools })
    const options: LockOptions = {
      hideMode: s.hideMode,
      stepCountRandom: hasRandomStepCount(s.items),
      maxTotalMs: s.maxTotal.enabled
        ? resolveDuration(s.maxTotal.minAmount, s.maxTotal.maxAmount, s.maxTotal.unit)
        : null,
      maxTotalRandom: s.maxTotal.enabled && s.maxTotal.minAmount !== s.maxTotal.maxAmount,
      pools: s.pools,
    }
    if (target === 'nophoto') onStartNoPhoto(tasks, options)
    else onContinue(tasks, options)
  }

  const attemptContinue = (target: 'capture' | 'nophoto') => {
    flushPendingEdits()
    if (!latestRef.current.maxTotal.enabled) {
      setNoMaxConfirm(target)
      return
    }
    buildAndContinue(target)
  }

  const addItem = (v: string) => {
    if (v === 'loop') { setItems((it) => [...it, newLoop()]); return }
    if (v === 'pool') { setItems((it) => [...it, newPoolChild()]); return }
    openEditor(newDraft(v as TaskKind), (saved) =>
      setItems((it) => [...it, { id: newFlowId(), type: 'task', task: saved }]),
    )
  }
  const replaceItem = (id: string, next: FlowItem) =>
    setItems((it) => it.map((x) => (x.id === id ? next : x)))
  const removeItem = (id: string) => setItems((it) => it.filter((x) => x.id !== id))
  const moveItem = (id: string, dir: -1 | 1) =>
    setItems((it) => move(it, it.findIndex((x) => x.id === id), dir))

  const handleImport = () => {
    // Accept either a raw code or a full share URL — extract `#config=…` from
    // pasted links so the user doesn't have to clip them by hand.
    const raw = importInput.trim()
    const fromUrl = raw.match(/[#?&]config=([^&]+)/)
    const candidate = fromUrl ? decodeURIComponent(fromUrl[1]) : raw
    const config = decodeConfig(candidate)
    if (!config) { setImportError('Invalid code — check that you copied it fully.'); return }
    onLoadConfig(config)
    setImportInput('')
    setImportError('')
    setImportOpen(false)
  }

  /**
   * Compute the share payload (code + URL) for the current draft and copy one
   * of the two to the clipboard. The code is the raw text payload; the URL
   * embeds it in `#config=` so opening the link auto-loads the assignment.
   */
  const handleGenerateShare = (target: 'link' | 'code') => {
    const code = encodeConfig({
      v: 1,
      name: shareName.trim() || 'Untitled',
      hideConfig: shareHide,
      items,
      hideMode,
      shuffle,
      pools,
    })
    const url = buildShareUrl('config', code)
    setShareCode(code)
    setShareUrl(url)
    const text = target === 'link' ? url : code
    navigator.clipboard.writeText(text).then(() => {
      if (target === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      }
    })
  }

  const handleSaveDesign = () => {
    if (!savingName?.trim()) return
    saveDesign({ name: savingName.trim(), items, hideMode, shuffle, pools, maxTotal })
    setSavedDesigns(loadSavedDesigns())
    setSavingName(null)
  }

  const handleLoadDesign = (d: SavedDesign) => {
    setItems(d.items)
    setHideMode(d.hideMode)
    setShuffle(d.shuffle)
    if (d.pools) setPools(d.pools)
    setMaxTotal(d.maxTotal)
    onClearConfig()
    setSavedOpen(false)
  }

  const handleDeleteDesign = (id: string) => {
    deleteDesign(id)
    setSavedDesigns(loadSavedDesigns())
  }

  const summary =
    range.min === range.max
      ? `${range.max} task${range.max === 1 ? '' : 's'} total`
      : `${range.min}–${range.max} tasks total`

  const maxTotalSection = (
    <>
      <label className="flow-option">
        <input
          type="checkbox"
          checked={maxTotal.enabled}
          onChange={(e) => setMaxTotal({ ...maxTotal, enabled: e.target.checked })}
        />
        Max session time — unlocks even if tasks are unfinished
      </label>
      {maxTotal.enabled && (
        <div className="flow-controls flow-maxtotal">
          {maxTotal.random ? (
            <RangeInputs
              min={maxTotal.minAmount}
              max={maxTotal.maxAmount}
              onChange={(min, max) => setMaxTotal({ ...maxTotal, minAmount: min, maxAmount: max })}
            />
          ) : (
            <NumberInput
              value={maxTotal.minAmount}
              onChange={(v) => setMaxTotal({ ...maxTotal, minAmount: v, maxAmount: v })}
            />
          )}
          <UnitSelect
            value={maxTotal.unit}
            onChange={(u) => setMaxTotal({ ...maxTotal, unit: u })}
          />
          <RandomToggle
            checked={maxTotal.random}
            onChange={(r) =>
              setMaxTotal({ ...maxTotal, random: r, maxAmount: r ? maxTotal.maxAmount : maxTotal.minAmount })
            }
          />
        </div>
      )}
    </>
  )

  const confirmModal = noMaxConfirm && (
    <div className="modal-backdrop" onClick={() => setNoMaxConfirm(null)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">No max session time</h2>
        <p className="modal-desc">
          Some task configurations can be nearly impossible — if you
          can't finish them, the session never ends.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={() => setNoMaxConfirm(null)}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => { const t = noMaxConfirm; setNoMaxConfirm(null); buildAndContinue(t) }}
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )

  // ── Loaded-config (read-only) view ───────────────────────────────────────
  if (loadedConfig) {
    return (
      <div className="panel flow-builder">
        <div className="loaded-config-banner">
          <div>
            <strong className="loaded-config-name">{loadedConfig.name}</strong>
            <span className="loaded-config-label">Loaded assignment</span>
          </div>
          <button type="button" onClick={onClearConfig}>Clear</button>
        </div>

        {!loadedConfig.hideConfig && (
          <>
            <ol className="flow-list flow-list-readonly">
              {loadedConfig.items.map((item) => (
                <li key={item.id} className="flow-item">
                  <ReadOnlyFlowItem item={item} />
                </li>
              ))}
            </ol>

            <ReadOnlyOptions
              shuffle={loadedConfig.shuffle}
              hideMode={loadedConfig.hideMode}
              pools={loadedConfig.pools}
            />
          </>
        )}

        {maxTotalSection}

        <div className="panel-actions">
          <button type="button" onClick={() => attemptContinue('nophoto')}>
            Start without a photo
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => attemptContinue('capture')}
          >
            Capture combination →
          </button>
        </div>
        {confirmModal}
      </div>
    )
  }

  // ── Normal editable view ─────────────────────────────────────────────────
  return (
    <div className="panel flow-builder">
      <h2>Design the session</h2>
      <p className="panel-note">
        Click a task to configure it. Use pools to pick one task at random, or loops to repeat
        steps.
      </p>

      {/* Import config */}
      {importOpen ? (
        <div className="share-panel">
          <h3 className="share-panel-title">Load assignment</h3>
          <textarea
            className="share-code-input"
            value={importInput}
            onChange={(e) => { setImportInput(e.target.value); setImportError('') }}
            placeholder="Paste assignment code here…"
            rows={4}
            spellCheck={false}
          />
          {importError && <p className="share-error">{importError}</p>}
          <div className="share-panel-actions">
            <button type="button" onClick={() => { setImportOpen(false); setImportError('') }}>Cancel</button>
            <button type="button" className="primary" disabled={!importInput.trim()} onClick={handleImport}>Load</button>
          </div>
        </div>
      ) : (
        <button type="button" className="share-import-btn" onClick={() => setImportOpen(true)}>
          Load assignment…
        </button>
      )}

      <ol className="flow-list">
        {items.map((item, i) => {
          const ctrl: RowCtrl = {
            onUp: i > 0 ? () => moveItem(item.id, -1) : undefined,
            onDown: i < items.length - 1 ? () => moveItem(item.id, 1) : undefined,
            onRemove: () => removeItem(item.id),
          }
          return (
            <li key={item.id} className="flow-item">
              {item.type === 'loop' ? (
                <LoopEditor loop={item} onChange={(n) => replaceItem(item.id, n)} openEditor={openEditor} onPreview={onPreview} {...ctrl} />
              ) : (
                <ChildEditor child={item} onChange={(c) => replaceItem(item.id, c)} openEditor={openEditor} onPreview={onPreview} {...ctrl} />
              )}
            </li>
          )
        })}
      </ol>

      <AddMenu onAdd={addItem} allowPool allowLoop />

      <label className="flow-option">
        <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
        Shuffle task order
      </label>

      {allPoolNames.length > 0 && (
        <div className="flow-option flow-option-row">
          <span className="flow-option-label">Image pools</span>
          <div className="flow-pools-col">
          <div className="flow-pools">
            {allPoolNames.map((p) => {
              const selected = pools.includes(p)
              // Block deselecting when this is the only one left — at least one
              // pool must always be active so image tasks have something to draw.
              const isLast = selected && pools.length === 1
              const isCustom = customPools.includes(p)
              return (
                <span key={p} className="flow-pool">
                  <label className="flow-random">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={isLast}
                      onChange={(e) => {
                        const next = e.target.checked
                        setPools((prev) =>
                          next
                            ? prev.includes(p) ? prev : [...prev, p]
                            : prev.filter((x) => x !== p),
                        )
                      }}
                    />
                    <span>{p}</span>
                  </label>
                  {isCustom && (
                    <button
                      type="button"
                      className="flow-pool-remove"
                      aria-label={`Remove ${p}`}
                      title="Remove your images"
                      onClick={() => handleRemoveImagePool(p)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              )
            })}
          </div>
          <div className="flow-pools-add">
            <input
              ref={folderInputRef}
              type="file"
              // webkitdirectory lets the user pick a whole folder; widely
              // supported and avoids the Chromium-only File System Access API.
              {...{ webkitdirectory: '', directory: '' }}
              multiple
              accept="image/*"
              hidden
              onChange={handleAddImages}
            />
            {/* A folder picker greys out individual files, so loose images
                need their own plain multi-file input. */}
            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept="image/*"
              hidden
              onChange={handleAddImages}
            />
            <button type="button" onClick={() => filesInputRef.current?.click()}>
              + Use your own images…
            </button>
            <button type="button" onClick={() => folderInputRef.current?.click()}>
              + Use a folder…
            </button>
            {imageError && <span className="share-error">{imageError}</span>}
          </div>
          </div>
        </div>
      )}

      <div className="flow-option flow-option-row">
        <span className="flow-option-label">Details shown during tasks</span>
        <select value={hideMode} onChange={(e) => setHideMode(e.target.value as HideMode)} className="flow-option-select">
          <option value="show">Show everything</option>
          <option value="hide-random">Hide random values (timers, step count)</option>
          <option value="hide-all">Hide all details (timers and step count)</option>
        </select>
      </div>

      {maxTotalSection}

      <p className="flow-summary">
        {summary}
        {(hideMode === 'hide-all' || (hideMode === 'hide-random' && stepCountRandom)) && ' · step count hidden'}
      </p>

      {/* Saved designs panel */}
      {savedOpen && (
        <div className="share-panel">
          <h3 className="share-panel-title">Saved designs</h3>
          {savedDesigns.length === 0 && (
            <p className="saved-empty">No saved designs yet.</p>
          )}
          {savedDesigns.map((d) => (
            <div key={d.id} className="saved-row">
              <div className="saved-info">
                <span className="saved-name">{d.name}</span>
                <span className="saved-date">{formatDesignAge(d.savedAt)}</span>
              </div>
              <button type="button" onClick={() => handleLoadDesign(d)}>Load</button>
              <button type="button" className="saved-delete" onClick={() => handleDeleteDesign(d.id)} aria-label="Delete">✕</button>
            </div>
          ))}
          <div className="saved-footer">
            {savingName !== null ? (
              <div className="saved-save-row">
                <input
                  className="share-name-input"
                  type="text"
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDesign(); if (e.key === 'Escape') setSavingName(null) }}
                  placeholder="Design name…"
                  autoFocus
                />
                <button type="button" className="primary" disabled={!savingName.trim()} onClick={handleSaveDesign}>Save</button>
                <button type="button" onClick={() => setSavingName(null)}>Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setSavingName('')}>+ Save current design</button>
            )}
            {savingName === null && (
              <button type="button" onClick={() => setSavedOpen(false)}>Close</button>
            )}
          </div>
        </div>
      )}

      {/* Share panel */}
      {shareOpen && (
        <div className="share-panel">
          <h3 className="share-panel-title">Share assignment</h3>
          <div className="share-panel-row">
            <label className="share-panel-label">Name</label>
            <input
              className="share-name-input"
              type="text"
              value={shareName}
              onChange={(e) => { setShareName(e.target.value); setShareCode(''); setShareUrl('') }}
              placeholder="e.g. Weekend session"
            />
          </div>
          <label className="flow-option">
            <input
              type="checkbox"
              checked={shareHide}
              onChange={(e) => { setShareHide(e.target.checked); setShareCode(''); setShareUrl('') }}
            />
            Hide tasks from the person completing them
          </label>
          <div className="share-panel-actions">
            <button type="button" onClick={() => { setShareOpen(false); setShareCode(''); setShareUrl('') }}>Cancel</button>
            <button
              type="button"
              className="primary"
              disabled={!shareName.trim()}
              onClick={() => handleGenerateShare('link')}
            >
              {copiedLink ? 'Link copied!' : 'Copy share link'}
            </button>
            <button
              type="button"
              disabled={!shareName.trim()}
              onClick={() => handleGenerateShare('code')}
            >
              {copiedCode ? 'Code copied!' : 'Copy code'}
            </button>
          </div>
          {shareUrl && (
            <>
              <p className="share-panel-title">Share link</p>
              <textarea
                className="share-code-output"
                readOnly
                value={shareUrl}
                rows={2}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </>
          )}
          {shareCode && (
            <>
              <p className="share-panel-title">Code</p>
              <textarea
                className="share-code-output"
                readOnly
                value={shareCode}
                rows={4}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </>
          )}
        </div>
      )}

      <div className="panel-actions">
        {!shareOpen && !savedOpen && (
          <button type="button" onClick={() => { setSavedOpen(true); setSavingName(null) }}>
            Saved…
          </button>
        )}
        {!shareOpen && !savedOpen && (
          // A disabled button doesn't fire hover events, so the tooltip lives on
          // the wrapping span to explain why sharing is unavailable.
          <span
            title={usesCustomPool ? "Can't share a design that uses your own images — they only exist on this device." : undefined}
          >
            <button
              type="button"
              disabled={range.max === 0 || usesCustomPool}
              onClick={() => { setShareOpen(true); setShareCode('') }}
            >
              Share…
            </button>
          </span>
        )}
        <button
          type="button"
          disabled={range.max === 0}
          onClick={() => { if (range.max > 0) attemptContinue('nophoto') }}
        >
          Start without a photo
        </button>
        <button
          type="button"
          className="primary"
          disabled={range.max === 0}
          onClick={() => { if (range.max > 0) attemptContinue('capture') }}
        >
          Capture combination →
        </button>
      </div>

      {editor && (
        <TaskEditor
          initial={editor.draft}
          onSave={(d) => { editor.save(d); setEditor(null) }}
          onCancel={() => setEditor(null)}
        />
      )}
      {confirmModal}
    </div>
  )
}

