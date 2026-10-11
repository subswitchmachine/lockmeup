import { useEffect, useState } from 'react'
import { imageUrl } from '../lib/puzzleImages'
import { laplacianVariance, toGrayscale } from '../lib/imageMetrics'
import { GAP, isSolved, scramble } from './slidingPuzzle'

interface SlidingTaskProps {
  imageId: string
  /** Tile count on the shorter side; the longer side is derived from the image. */
  size: number
  /** Number low-detail tiles so solid-color regions stay solvable. Default on. */
  assist?: boolean
  nextLabel: string
  onComplete: (errors: number) => void
}

const TILE_GAP = 2 // px between tiles

// Per-tile sample resolution (px) and the Laplacian-variance floor below which a
// tile counts as "flat" (near-uniform). A solid tile scores ≈0; textured tiles
// score well above this. Tuned by eye on 0–255 luma.
const SAMPLE = 12
const FLAT_VARIANCE_THRESHOLD = 40

interface Grid {
  cols: number
  rows: number
  w: number // image natural width
  h: number // image natural height
  board: number[]
  /** Per solved-tile-index: true when that tile is near-uniform (gets a number hint). */
  flat: boolean[]
}

/**
 * Detect near-uniform tiles by stretching the image across a cols×rows grid of
 * small sample blocks and measuring each block's Laplacian variance. Returns an
 * all-false array if pixel access is unavailable (e.g. a tainted canvas).
 */
function detectFlatTiles(img: HTMLImageElement, cols: number, rows: number): boolean[] {
  const flat = new Array(cols * rows).fill(false)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = cols * SAMPLE
    canvas.height = rows * SAMPLE
    const ctx = canvas.getContext('2d')
    if (!ctx) return flat
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (let tr = 0; tr < rows; tr++) {
      for (let tc = 0; tc < cols; tc++) {
        const region = ctx.getImageData(tc * SAMPLE, tr * SAMPLE, SAMPLE, SAMPLE)
        const variance = laplacianVariance(toGrayscale(region))
        flat[tr * cols + tc] = variance < FLAT_VARIANCE_THRESHOLD
      }
    }
  } catch {
    return new Array(cols * rows).fill(false)
  }
  return flat
}

export function SlidingTask({ imageId, size, assist, nextLabel, onComplete }: SlidingTaskProps) {
  const url = imageUrl(imageId)
  const showHints = assist ?? true
  const [grid, setGrid] = useState<Grid | null>(null)

  // Derive a rectangular grid (square tiles) from the image's aspect once loaded:
  // `size` tiles on the short side, the long side scaled to match the aspect.
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.src = url
    img.onload = () => {
      if (cancelled) return
      const a = img.naturalWidth / img.naturalHeight
      const cols = a >= 1 ? Math.max(2, Math.round(size * a)) : Math.max(2, size)
      const rows = a >= 1 ? Math.max(2, size) : Math.max(2, Math.round(size / a))
      let board = scramble(cols, rows)
      if (isSolved(board)) board = scramble(cols, rows)
      const flat = detectFlatTiles(img, cols, rows)
      setGrid({ cols, rows, w: img.naturalWidth, h: img.naturalHeight, board, flat })
    }
    return () => {
      cancelled = true
    }
  }, [url, size])

  if (!grid) return <p className="jigsaw-loading">Loading puzzle…</p>

  const { cols, rows, board } = grid
  const solved = isSolved(board)

  const move = (idx: number) => {
    if (solved) return
    const gap = board.indexOf(GAP)
    const dr = Math.abs(Math.floor(idx / cols) - Math.floor(gap / cols))
    const dc = Math.abs((idx % cols) - (gap % cols))
    if (dr + dc !== 1) return // not adjacent to the gap
    const next = board.slice()
    ;[next[idx], next[gap]] = [next[gap], next[idx]]
    setGrid({ ...grid, board: next })
  }

  if (solved) {
    // Reveal the full (undistorted) image, like the jigsaw's finished view.
    return (
      <div className="sliding-solved">
        <span className="jigsaw-solved-msg">Solved!</span>
        <img className="sliding-finished" src={url} alt="Completed image" />
        <button type="button" className="primary" onClick={() => onComplete(0)}>
          {nextLabel}
        </button>
      </div>
    )
  }

  // Square tiles sized to fit the viewport; the board is cols×rows of them. The
  // image is cover-fit to the (gap-less) content area — its aspect ≈ cols/rows,
  // so only the small rounding residual is cropped.
  const maxW = Math.min(window.innerWidth * 0.9, 640)
  const maxH = window.innerHeight * 0.7
  const tile = Math.max(
    20,
    Math.floor(Math.min((maxW - (cols - 1) * TILE_GAP) / cols, (maxH - (rows - 1) * TILE_GAP) / rows)),
  )
  const boardW = cols * tile + (cols - 1) * TILE_GAP
  const boardH = rows * tile + (rows - 1) * TILE_GAP
  const contentW = cols * tile
  const contentH = rows * tile
  const scale = Math.max(contentW / grid.w, contentH / grid.h)
  const renderW = grid.w * scale
  const renderH = grid.h * scale
  const cropX = (renderW - contentW) / 2
  const cropY = (renderH - contentH) / 2

  return (
    <div className="sliding">
      <div
        className="sliding-board"
        style={{ width: boardW, height: boardH, gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {board.map((t, idx) => {
          if (t === GAP) return <div key={idx} className="sliding-gap" />
          const tr = Math.floor(t / cols)
          const tc = t % cols
          return (
            <button
              key={idx}
              type="button"
              className="sliding-tile"
              onClick={() => move(idx)}
              style={{
                backgroundImage: `url(${url})`,
                backgroundSize: `${renderW}px ${renderH}px`,
                backgroundPosition: `${-(cropX + tc * tile)}px ${-(cropY + tr * tile)}px`,
              }}
            >
              {showHints && grid.flat[t] && <span className="sliding-hint">{t + 1}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
