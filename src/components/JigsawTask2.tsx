import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { imageUrl } from '../lib/puzzleImages'
import { gridForAspect } from '../lib/tasks'
import { buildClipPaths, hash32, recommendedMargin } from '../lib/jigsawGeometry'
import {
  groupsOf,
  isSolvedUpright,
  rotateGroup,
  snapGroup,
  translateGroup,
  type PieceState,
} from '../lib/jigsawSolver'
import { clearTaskProgress, loadTaskProgress, saveTaskProgress } from '../lib/taskProgressStore'

interface JigsawTask2Props {
  imageId: string
  /** Target piece count; the grid is derived from the image's aspect ratio. */
  pieces: number
  /** When true, pieces start at random 90° orientations and can be tapped to rotate. */
  rotate: boolean
  /** Label for the proceed button shown once solved (e.g. "Unlock"). */
  nextLabel: string
  /** Called when the user proceeds from the solved screen. */
  onComplete: (errors: number) => void
  /**
   * Stable key for persisting in-progress state across reloads (`<lockedAt>:<index>`).
   * Omitted in preview, where the puzzle is ephemeral.
   */
  persistKey?: string
}

/** World pixels per piece body edge. Boards are navigated by pan/zoom, so this is fixed. */
const CELL = 46
const SNAP_FRAC = 0.34 // snap tolerance as a fraction of cell
const TAP_PX = 6 // pointer travel (screen px) under which a press counts as a tap
const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const PAN_SPEED = 700 // keyboard pan speed in screen px/sec
const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'])
const PILE_FRAC = 1.0 // starting pile size as a fraction of the assembled area
const VIEW_PAD = 0.4 // empty working room around the pile when fitting the initial view
const JITTER_DEG = 9 // cosmetic ± tilt on loose pieces, for a "dumped out of a box" look
const SAVE_MS = 400

interface Layout {
  count: number
  cols: number
  rows: number
  cell: number
  margin: number
  box: number
  clips: string[]
  /** Per-piece data-URI SVG `background-image` tracing the piece outline (piece border). */
  edgeUrls: string[]
  url: string
  imgW: number
  imgH: number
  cropX: number
  cropY: number
}

interface View {
  panX: number
  panY: number
  zoom: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/**
 * Classic interlocking jigsaw built with plain DOM elements (no puzzle library):
 * each piece is a `<div>` whose slice of the image is revealed by a CSS
 * `clip-path` with unique, seeded tab/slot edges. Pieces scatter across a
 * pan/zoom world; drag to move a piece or its connected group, tap to rotate it
 * 90° (when `rotate` is on). Correct neighbours at a matching orientation snap
 * together; assembling everything upright reveals the finished picture.
 *
 * All interaction runs through refs + direct `style.transform` writes so React
 * never re-renders during a drag — this keeps large (1000–3000 piece) boards
 * smooth. In-progress layout is serialised to IndexedDB and restored on reload.
 */
export function JigsawTask2({
  imageId,
  pieces,
  rotate,
  nextLabel,
  onComplete,
  persistKey,
}: JigsawTask2Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])

  const stateRef = useRef<PieceState[]>([])
  const groupsRef = useRef<Map<number, number[]>>(new Map())
  const viewRef = useRef<View>({ panX: 0, panY: 0, zoom: 1 })
  const zRef = useRef(1)
  const seedRef = useRef(0)
  const jitterRef = useRef<number[]>([]) // per-piece cosmetic tilt (deg), seed-derived

  // Active pointer bookkeeping for drag / pan / pinch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureRef = useRef<{
    mode: 'idle' | 'piece' | 'pan' | 'pinch'
    pointerId: number
    group: number
    /** All groups currently being carried (primary + any right-click additions). */
    carried: number[]
    lastX: number
    lastY: number
    travel: number
    // pinch
    baseDist: number
    baseZoom: number
    wx: number
    wy: number
  }>({ mode: 'idle', pointerId: -1, group: -1, carried: [], lastX: 0, lastY: 0, travel: 0, baseDist: 0, baseZoom: 1, wx: 0, wy: 0 })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearedRef = useRef(false)
  const solvedRef = useRef(false)

  // Keys currently held for keyboard panning, plus the rAF that drives it.
  const panKeysRef = useRef<Set<string>>(new Set())
  const panRafRef = useRef<number | null>(null)

  const [layout, setLayout] = useState<Layout | null>(null)
  const [solved, setSolved] = useState(false)
  const [solvedRect, setSolvedRect] = useState<Rect | null>(null)
  const [greyBg, setGreyBg] = useState(false)

  // ---- Build layout (image + geometry + initial state) ---------------------
  // Done asynchronously *before* the pieces render, so they paint in their final
  // positions (no flash) and a restored puzzle comes back exactly as it was.
  useLayoutEffect(() => {
    let cancelled = false
    clearedRef.current = false
    solvedRef.current = false

    const url = imageUrl(imageId)
    const seed = persistKey ? hash32(`${imageId}:${pieces}:${persistKey}`, 0x9e3779b9) : Math.floor(Math.random() * 0xffffffff)
    seedRef.current = seed

    const img = new Image()
    img.src = url
    const run = async () => {
      setSolved(false)
      setSolvedRect(null)
      setLayout(null)
      await img.decode().catch(() => undefined)
      if (cancelled) return
      const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1)
      const { cols, rows } = gridForAspect(pieces, aspect)
      const count = cols * rows
      const cell = CELL
      const margin = recommendedMargin(cell)
      const box = cell + 2 * margin

      // Cover-scale the image over the assembled area, centre-cropping the excess.
      const targetW = cols * cell
      const targetH = rows * cell
      const scale = Math.max(targetW / (img.naturalWidth || 1), targetH / (img.naturalHeight || 1))
      const imgW = (img.naturalWidth || 1) * scale
      const imgH = (img.naturalHeight || 1) * scale
      const cropX = (imgW - targetW) / 2
      const cropY = (imgH - targetH) / 2

      const clips = buildClipPaths(cols, rows, cell, margin, seed)
      // Bake each piece's outline into a data-URI SVG background so the border
      // needs no live per-piece <svg> (which re-strokes on every drag frame and
      // lags large boards). Encoded once here, not on each render.
      const edgeUrls = clips.map(
        (d) =>
          `url("data:image/svg+xml,` +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${box} ${box}'>` +
              `<path d='${d}' fill='none' stroke='#000' stroke-width='1'/></svg>`,
          ) +
          `")`,
      )
      // Deterministic per-piece tilt so the loose pile looks tossed, not gridded.
      jitterRef.current = Array.from(
        { length: count },
        (_, i) => (hash32(`${i}:jit`, seed) / 0xffffffff - 0.5) * 2 * JITTER_DEG,
      )

      // Restore persisted state if it matches this exact puzzle, else scatter.
      let restored = false
      if (persistKey) {
        const saved = (await loadTaskProgress(persistKey)) as
          | { imageId: string; pieces: number; rotate: boolean; state: PieceState[]; view: View }
          | null
        if (
          !cancelled &&
          saved &&
          saved.imageId === imageId &&
          saved.pieces === pieces &&
          saved.rotate === rotate &&
          Array.isArray(saved.state) &&
          saved.state.length === count
        ) {
          stateRef.current = saved.state.map((s) => ({ cx: s.cx, cy: s.cy, o: s.o & 3, g: s.g }))
          if (saved.view) viewRef.current = { ...saved.view }
          restored = true
        }
      }
      if (cancelled) return

      if (!restored) {
        scatter(stateRef, count, cols, cell, rotate)
        fitView(viewRef, rootRef.current, cols, rows, cell)
      }
      groupsRef.current = groupsOf(stateRef.current)

      setLayout({ count, cols, rows, cell, margin, box, clips, edgeUrls, url, imgW, imgH, cropX, cropY })
      if (!restored) scheduleSave() // persist the initial scatter immediately-ish
    }
    void run()

    return () => {
      cancelled = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, pieces, rotate, persistKey])

  // ---- Position pieces + wire wheel once the layout is rendered -------------
  useLayoutEffect(() => {
    if (!layout) return
    applyView()
    for (let i = 0; i < layout.count; i++) applyPiece(i)
    checkSolved() // a restored puzzle may already be finished

    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (solvedRef.current) return // pan is already off once solved; keep zoom off too
      const rect = root.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015))
      scheduleSave()
    }
    root.addEventListener('wheel', onWheel, { passive: false })

    // ---- Keyboard panning (WASD + arrow keys) ------------------------------
    // A rAF loop runs only while a pan key is held, nudging the view each frame
    // so movement is smooth and frame-rate independent. Window-level so the
    // board pans without needing focus (only one task is live at a time).
    const keys = panKeysRef.current
    let last = 0
    const step = (t: number) => {
      if (last === 0) last = t
      const dt = Math.min((t - last) / 1000, 0.05) // clamp after tab-switch stalls
      last = t
      if (!solvedRef.current) {
        let dx = 0
        let dy = 0
        if (keys.has('a') || keys.has('arrowleft')) dx += 1
        if (keys.has('d') || keys.has('arrowright')) dx -= 1
        if (keys.has('w') || keys.has('arrowup')) dy += 1
        if (keys.has('s') || keys.has('arrowdown')) dy -= 1
        if (dx || dy) {
          const panDx = dx * PAN_SPEED * dt
          const panDy = dy * PAN_SPEED * dt
          viewRef.current.panX += panDx
          viewRef.current.panY += panDy
          applyView()
          // If a piece is mid-drag, shift it the opposite way in world space so it
          // stays pinned under the cursor while the board scrolls beneath it.
          const gst = gestureRef.current
          if (gst.mode === 'piece') {
            const z = viewRef.current.zoom
            for (const grp of gst.carried) {
              translateGroup(stateRef.current, groupsRef.current, grp, -panDx / z, -panDy / z)
              applyGroup(grp)
            }
          }
        }
      }
      if (keys.size === 0) {
        panRafRef.current = null
        last = 0
        scheduleSave()
        return
      }
      panRafRef.current = requestAnimationFrame(step)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (solvedRef.current || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (!PAN_KEYS.has(k)) return
      e.preventDefault()
      keys.add(k)
      if (panRafRef.current == null) panRafRef.current = requestAnimationFrame(step)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase())
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // ---- Right-click to pick up an additional piece/group ------------------
    // While a drag is in progress, right-clicking another piece adds its group
    // to the carried set so several can be hauled at once. The carried groups
    // sit on top under the cursor, so we hit-test past them to the piece below.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const g = gestureRef.current
      if (g.mode !== 'piece' || solvedRef.current) return
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const pe = (el as HTMLElement).closest?.('.jigsaw2-piece') as HTMLElement | null
        if (!pe) continue
        const grp = stateRef.current[Number(pe.dataset.index)].g
        if (g.carried.includes(grp)) continue // skip already-carried pieces on top
        for (const m of groupsRef.current.get(grp) ?? []) jitterRef.current[m] = 0
        g.carried.push(grp)
        applyGroup(grp)
        bringToFront(grp)
        setWillChange(grp, true)
        break
      }
    }
    root.addEventListener('contextmenu', onContextMenu)

    return () => {
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (panRafRef.current != null) cancelAnimationFrame(panRafRef.current)
      panRafRef.current = null
      keys.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // ---- Imperative rendering helpers ----------------------------------------
  function applyView() {
    const w = worldRef.current
    if (!w) return
    const { panX, panY, zoom } = viewRef.current
    w.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
  }

  function applyPiece(i: number) {
    const el = nodeRefs.current[i]
    const s = stateRef.current[i]
    if (!el || !s || !layout) return
    const half = layout.box / 2
    // Loose (singleton) pieces get a cosmetic tilt; once snapped into a group they
    // straighten to their true 90° orientation so clusters and the solve are clean.
    const loose = (groupsRef.current.get(s.g)?.length ?? 1) === 1
    const jit = loose ? jitterRef.current[i] ?? 0 : 0
    el.style.transform = `translate(${s.cx - half}px, ${s.cy - half}px) rotate(${s.o * 90 + jit}deg)`
  }

  function bringToFront(group: number) {
    zRef.current += 1
    const z = String(zRef.current)
    for (const m of groupsRef.current.get(group) ?? []) {
      const el = nodeRefs.current[m]
      if (el) el.style.zIndex = z
    }
  }

  /**
   * Hint the GPU to promote the active group while it's being dragged, then drop
   * the hint on release. Capped so dragging a near-complete puzzle doesn't
   * promote thousands of pieces to their own layers (which would blow up memory).
   */
  function setWillChange(group: number, on: boolean) {
    const members = groupsRef.current.get(group) ?? []
    if (on && members.length > 200) return
    const v = on ? 'transform' : ''
    for (const m of members) {
      const el = nodeRefs.current[m]
      if (el) el.style.willChange = v
    }
  }

  function applyGroup(group: number) {
    for (const m of groupsRef.current.get(group) ?? []) applyPiece(m)
  }

  /**
   * Dump several carried groups into a loose pile centred on (cx, cy) in world
   * space — no snapping/connection checks, mirroring the initial scatter so the
   * result looks like a freshly tipped-out box.
   */
  function pileDrop(carried: number[], cx: number, cy: number) {
    if (!layout) return
    const { cell } = layout
    let total = 0
    for (const grp of carried) total += groupsRef.current.get(grp)?.length ?? 0
    const radius = Math.max(cell, Math.sqrt(total) * cell * 0.7)
    for (const grp of carried) {
      const members = groupsRef.current.get(grp) ?? []
      if (!members.length) continue
      // Move the whole group so its centroid lands at a scattered pile position.
      let gx = 0
      let gy = 0
      for (const m of members) {
        gx += stateRef.current[m].cx
        gy += stateRef.current[m].cy
      }
      gx /= members.length
      gy /= members.length
      const t = Math.random() * 2 * Math.PI
      const rr = Math.sqrt(Math.random())
      const tx = cx + radius * rr * Math.cos(t) + (Math.random() - 0.5) * cell
      const ty = cy + radius * rr * Math.sin(t) + (Math.random() - 0.5) * cell
      translateGroup(stateRef.current, groupsRef.current, grp, tx - gx, ty - gy)
      // Re-toss loose singletons with a fresh cosmetic tilt, like the start pile.
      if (members.length === 1) {
        jitterRef.current[members[0]] = (Math.random() - 0.5) * 2 * JITTER_DEG
      }
      applyGroup(grp)
    }
  }

  /** Snap the dragged group onto placed neighbours, re-render it, check for a win. */
  function settleAndCheck(group: number) {
    if (!layout) return
    const fg = snapGroup(
      stateRef.current,
      groupsRef.current,
      layout.cols,
      layout.rows,
      layout.cell,
      SNAP_FRAC * layout.cell,
      group,
    )
    applyGroup(fg)
    checkSolved()
    scheduleSave()
  }

  function checkSolved() {
    if (!layout || solvedRef.current) return
    if (!isSolvedUpright(stateRef.current, groupsRef.current, layout.count)) return
    const members = groupsRef.current.get(stateRef.current[0].g) ?? []

    solvedRef.current = true
    // Assembled body bounding box (world) → screen, to lay the clean image over it.
    const { cell } = layout
    const { zoom } = viewRef.current
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of members) {
      const s = stateRef.current[m]
      minX = Math.min(minX, s.cx - cell / 2)
      minY = Math.min(minY, s.cy - cell / 2)
      maxX = Math.max(maxX, s.cx + cell / 2)
      maxY = Math.max(maxY, s.cy + cell / 2)
    }
    const { panX, panY } = viewRef.current
    setSolvedRect({
      x: minX * zoom + panX,
      y: minY * zoom + panY,
      w: (maxX - minX) * zoom,
      h: (maxY - minY) * zoom,
    })
    setSolved(true)
  }

  // ---- View transforms ------------------------------------------------------
  function zoomAt(sx: number, sy: number, factor: number) {
    const v = viewRef.current
    const wx = (sx - v.panX) / v.zoom
    const wy = (sy - v.panY) / v.zoom
    const z = clampZoom(v.zoom * factor)
    v.zoom = z
    v.panX = sx - wx * z
    v.panY = sy - wy * z
    applyView()
  }

  // ---- Persistence ----------------------------------------------------------
  function scheduleSave() {
    if (!persistKey || clearedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (clearedRef.current) return
      void saveTaskProgress(persistKey, {
        imageId,
        pieces,
        rotate,
        state: stateRef.current.map((s) => ({
          cx: Math.round(s.cx * 100) / 100,
          cy: Math.round(s.cy * 100) / 100,
          o: s.o,
          g: s.g,
        })),
        view: { ...viewRef.current },
      })
    }, SAVE_MS)
  }

  // ---- Pointer handling -----------------------------------------------------
  function screenPos(e: ReactPointerEvent): [number, number] {
    const rect = rootRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!layout || solved) return
    const [sx, sy] = screenPos(e)
    pointersRef.current.set(e.pointerId, { x: sx, y: sy })
    e.currentTarget.setPointerCapture(e.pointerId)

    const g = gestureRef.current
    // Second finger → pinch zoom (only from a pan/idle start, not mid-piece-drag).
    if (pointersRef.current.size === 2 && g.mode !== 'piece') {
      const pts = [...pointersRef.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const mx = (pts[0].x + pts[1].x) / 2
      const my = (pts[0].y + pts[1].y) / 2
      g.mode = 'pinch'
      g.baseDist = dist
      g.baseZoom = viewRef.current.zoom
      g.wx = (mx - viewRef.current.panX) / viewRef.current.zoom
      g.wy = (my - viewRef.current.panY) / viewRef.current.zoom
      return
    }
    if (pointersRef.current.size > 1) return

    const pieceEl = (e.target as HTMLElement).closest('.jigsaw2-piece') as HTMLElement | null
    g.pointerId = e.pointerId
    g.lastX = sx
    g.lastY = sy
    g.travel = 0
    if (pieceEl) {
      const idx = Number(pieceEl.dataset.index)
      g.mode = 'piece'
      g.group = stateRef.current[idx].g
      g.carried = [g.group]
      // Straighten the piece out of its tossed tilt the moment it's grabbed.
      for (const m of groupsRef.current.get(g.group) ?? []) jitterRef.current[m] = 0
      applyGroup(g.group)
      bringToFront(g.group)
      setWillChange(g.group, true)
    } else {
      g.mode = 'pan'
      g.group = -1
      g.carried = []
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current
    if (g.mode === 'idle') return
    const [sx, sy] = screenPos(e)
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: sx, y: sy })

    if (g.mode === 'pinch') {
      const pts = [...pointersRef.current.values()]
      if (pts.length < 2) return
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      const mx = (pts[0].x + pts[1].x) / 2
      const my = (pts[0].y + pts[1].y) / 2
      const v = viewRef.current
      v.zoom = clampZoom(g.baseZoom * (dist / g.baseDist))
      v.panX = mx - g.wx * v.zoom
      v.panY = my - g.wy * v.zoom
      applyView()
      return
    }
    if (e.pointerId !== g.pointerId) return

    const dxs = sx - g.lastX
    const dys = sy - g.lastY
    g.lastX = sx
    g.lastY = sy
    g.travel += Math.abs(dxs) + Math.abs(dys)

    if (g.mode === 'pan') {
      viewRef.current.panX += dxs
      viewRef.current.panY += dys
      applyView()
    } else if (g.mode === 'piece') {
      const z = viewRef.current.zoom
      for (const grp of g.carried) {
        translateGroup(stateRef.current, groupsRef.current, grp, dxs / z, dys / z)
        applyGroup(grp)
      }
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current
    pointersRef.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)

    if (g.mode === 'pinch') {
      gestureRef.current.mode = 'idle'
      scheduleSave()
      return
    }
    if (e.pointerId !== g.pointerId) return

    if (g.mode === 'piece') {
      if (g.carried.length > 1) {
        // Carrying several groups: don't try to connect them — just dump them
        // into a fresh pile at the cursor, like the initial scatter.
        const [sx, sy] = screenPos(e)
        const v = viewRef.current
        pileDrop(g.carried, (sx - v.panX) / v.zoom, (sy - v.panY) / v.zoom)
        scheduleSave()
      } else if (g.travel < TAP_PX) {
        if (rotate) {
          rotateGroup(stateRef.current, groupsRef.current, g.group)
          applyGroup(g.group)
          settleAndCheck(g.group)
        }
      } else {
        settleAndCheck(g.group)
      }
      for (const grp of g.carried) setWillChange(grp, false)
    } else if (g.mode === 'pan') {
      scheduleSave()
    }
    gestureRef.current.mode = 'idle'
    gestureRef.current.carried = []
  }

  function finishSolved() {
    if (persistKey) {
      clearedRef.current = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void clearTaskProgress(persistKey)
    }
    onComplete(0)
  }

  return (
    <div className="jigsaw2" ref={rootRef}>
      <div
        className={`jigsaw2-surface${greyBg ? ' jigsaw2-surface--grey' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="jigsaw2-world" ref={worldRef}>
          {layout &&
            layout.clips.map((d, i) => {
              const c = i % layout.cols
              const r = Math.floor(i / layout.cols)
              return (
                <div
                  key={i}
                  data-index={i}
                  ref={(el) => {
                    nodeRefs.current[i] = el
                  }}
                  className="jigsaw2-piece"
                  style={{ width: layout.box, height: layout.box }}
                >
                  {/* Visual slice, clipped to the seeded jigsaw outline. */}
                  <div
                    className="jigsaw2-piece-img"
                    style={{
                      backgroundImage: `url(${layout.url})`,
                      backgroundSize: `${layout.imgW}px ${layout.imgH}px`,
                      backgroundPosition: `${layout.margin - c * layout.cell - layout.cropX}px ${layout.margin - r * layout.cell - layout.cropY}px`,
                      clipPath: `path('${d}')`,
                    }}
                  />
                  {/* Thin black outline tracing the same jigsaw edge. clip-path
                      can't draw a border, so the identical path is baked into a
                      data-URI SVG background (see edgeUrls) — a cheap raster blit
                      rather than a live vector stroke that repaints on each drag. */}
                  <div
                    className="jigsaw2-piece-edge"
                    style={{ backgroundImage: layout.edgeUrls[i] }}
                  />
                  {/* Rectangular hit target over the whole piece body (the clip-path
                      would otherwise shrink clicks to the visible shape, making
                      slots and tab necks fiddly). The core tiles edge-to-edge when
                      assembled, so neighbours don't steal each other's clicks. */}
                  <div
                    className="jigsaw2-piece-hit"
                    style={{
                      left: layout.margin,
                      top: layout.margin,
                      width: layout.cell,
                      height: layout.cell,
                    }}
                  />
                </div>
              )
            })}
        </div>
      </div>

      {!solved && layout && (
        <button
          type="button"
          className={`jigsaw2-bg-toggle${greyBg ? ' active' : ''}`}
          onClick={() => setGreyBg((x) => !x)}
          title="Toggle grey background"
        >
          Grey bg
        </button>
      )}
      {!layout && <p className="jigsaw2-loading">Loading puzzle…</p>}

      {solved && solvedRect && (
        <img
          className="jigsaw2-finished"
          src={imageUrl(imageId)}
          alt="Completed puzzle"
          style={{ left: solvedRect.x, top: solvedRect.y, width: solvedRect.w, height: solvedRect.h }}
        />
      )}
      {solved && (
        <div className="jigsaw2-solved-bar">
          <span className="jigsaw2-solved-msg">Puzzle solved!</span>
          <button type="button" className="primary" onClick={finishSolved}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  )
}

// ---- Pure init helpers ------------------------------------------------------

/** Scatter every piece as its own group into a compact pile over the solution. */
function scatter(
  stateRef: { current: PieceState[] },
  count: number,
  cols: number,
  cell: number,
  rotate: boolean,
) {
  const rows = count / cols
  const W = cols * cell
  const H = rows * cell
  const cx = W / 2 // centre the pile on the assembled area
  const cy = H / 2
  const ax = (W * PILE_FRAC) / 2 // ellipse half-axes
  const ay = (H * PILE_FRAC) / 2
  const next: PieceState[] = new Array(count)
  for (let i = 0; i < count; i++) {
    // Roughly ellipse-shaped, but messy: a ragged radius flings the odd piece
    // past the edge, plus a little per-piece jitter so it isn't a clean disc.
    const t = Math.random() * 2 * Math.PI
    const rr = Math.sqrt(Math.random()) * (0.8 + Math.random() * Math.random() * 0.7)
    next[i] = {
      cx: cx + ax * rr * Math.cos(t) + (Math.random() - 0.5) * cell,
      cy: cy + ay * rr * Math.sin(t) + (Math.random() - 0.5) * cell,
      o: rotate ? Math.floor(Math.random() * 4) : 0,
      g: i,
    }
  }
  stateRef.current = next
}

/** Centre the initial view so the whole scatter region fits the viewport. */
function fitView(
  viewRef: { current: View },
  root: HTMLElement | null,
  cols: number,
  rows: number,
  cell: number,
) {
  const rw = cols * cell * (1 + 2 * VIEW_PAD)
  const rh = rows * cell * (1 + 2 * VIEW_PAD)
  const vw = root?.clientWidth || 800
  const vh = root?.clientHeight || 600
  const zoom = clampZoom(Math.min(vw / rw, vh / rh) * 0.95)
  // Centre the assembled area (and the pile sitting on it) in the viewport.
  const cx = (cols * cell) / 2
  const cy = (rows * cell) / 2
  viewRef.current = { zoom, panX: vw / 2 - cx * zoom, panY: vh / 2 - cy * zoom }
}

