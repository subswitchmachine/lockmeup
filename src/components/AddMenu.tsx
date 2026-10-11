import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { KIND_LABEL, type TaskKind } from './flowModel'

/**
 * "+ Add" dropdown used throughout the flow builder to append a task (and,
 * where allowed, a pool or loop group). The menu is positioned with fixed
 * coordinates computed from the trigger's rect at open time so it isn't clipped
 * at the bottom of the viewport.
 */
export function AddMenu({
  onAdd,
  allowPool,
  allowLoop,
}: {
  onAdd: (v: string) => void
  allowPool?: boolean
  allowLoop?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const maxH = Math.min(320, window.innerHeight * 0.65)
      const spaceBelow = window.innerHeight - rect.bottom - 8
      if (spaceBelow >= 120) {
        setDropdownStyle({ top: rect.bottom + 4, left: rect.left, maxHeight: Math.min(maxH, spaceBelow) })
      } else {
        setDropdownStyle({ bottom: window.innerHeight - rect.top + 4, left: rect.left, maxHeight: Math.min(maxH, rect.top - 8) })
      }
    }
    setOpen((o) => !o)
  }

  const select = (v: string) => {
    setOpen(false)
    onAdd(v)
  }

  return (
    <div ref={containerRef} className="flow-add-menu">
      <button type="button" className="flow-add-trigger" onClick={toggle}>
        + Add {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="flow-add-dropdown" style={dropdownStyle}>
          <p className="flow-add-group">Tasks</p>
          {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
            <button key={k} type="button" className="flow-add-item" onClick={() => select(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
          {(allowPool || allowLoop) && (
            <>
              <div className="flow-add-divider" />
              <p className="flow-add-group">Groups</p>
              {allowPool && (
                <button type="button" className="flow-add-item" onClick={() => select('pool')}>
                  🎲 Pool
                </button>
              )}
              {allowLoop && (
                <button type="button" className="flow-add-item" onClick={() => select('loop')}>
                  🔁 Loop
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
