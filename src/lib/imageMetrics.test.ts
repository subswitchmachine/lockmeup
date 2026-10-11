import { describe, expect, it } from 'vitest'
import {
  accumulateBaseline,
  centerRoi,
  laplacianVariance,
  meanAbsDiff,
  toGrayscale,
  type GrayFrame,
} from './imageMetrics'

// Plain object that satisfies the ImageData shape used by toGrayscale.
function rgba(width: number, height: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

function gray(width: number, height: number, fill: number): GrayFrame {
  const data = new Uint8ClampedArray(width * height)
  data.fill(fill)
  return { data, width, height }
}

describe('toGrayscale', () => {
  it('produces the right luma for solid colours', () => {
    // Pure red → 0.299 * 255 ≈ 76 (BT.601). The lib uses (77,150,29)/256 fixed-point.
    const out = toGrayscale(rgba(2, 2, [255, 0, 0, 255]))
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    for (const v of out.data) expect(v).toBeGreaterThanOrEqual(75)
    for (const v of out.data) expect(v).toBeLessThanOrEqual(80)
  })

  it('maps black to 0 and white to ~255', () => {
    expect(Array.from(toGrayscale(rgba(1, 1, [0, 0, 0, 255])).data)).toEqual([0])
    const white = toGrayscale(rgba(1, 1, [255, 255, 255, 255]))
    expect(white.data[0]).toBeGreaterThanOrEqual(250)
  })

  it('handles non-square frames', () => {
    const out = toGrayscale(rgba(4, 2, [128, 128, 128, 255]))
    expect(out.data).toHaveLength(8)
  })
})

describe('centerRoi', () => {
  it('extracts a centered square of side floor(min*fraction)', () => {
    const frame = gray(10, 10, 0)
    // Mark a 4x4 centered block with 200.
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) frame.data[y * 10 + x] = 200
    const roi = centerRoi(frame, 0.4)
    expect(roi.width).toBe(4)
    expect(roi.height).toBe(4)
    expect([...roi.data]).toEqual(Array(16).fill(200))
  })

  it('uses the smaller dimension when not square', () => {
    const frame = gray(20, 10, 0)
    const roi = centerRoi(frame, 0.5)
    // min(20,10) = 10, side = 5
    expect(roi.width).toBe(5)
    expect(roi.height).toBe(5)
  })

  it('clamps to at least 1 px', () => {
    const roi = centerRoi(gray(10, 10, 7), 0)
    expect(roi.width).toBe(1)
    expect(roi.height).toBe(1)
    expect(roi.data[0]).toBe(7)
  })
})

describe('laplacianVariance', () => {
  it('returns 0 for a uniform frame', () => {
    expect(laplacianVariance(gray(10, 10, 128))).toBe(0)
  })

  it('returns 0 for frames smaller than the kernel', () => {
    expect(laplacianVariance(gray(2, 2, 0))).toBe(0)
    expect(laplacianVariance(gray(10, 2, 0))).toBe(0)
  })

  it('scores a sharp checkerboard much higher than a blurry gradient', () => {
    // Checkerboard
    const cb = gray(8, 8, 0)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) cb.data[y * 8 + x] = (x + y) % 2 === 0 ? 0 : 255
    }
    // Gentle linear ramp
    const ramp = gray(8, 8, 0)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) ramp.data[y * 8 + x] = Math.round((x / 7) * 255)
    }
    expect(laplacianVariance(cb)).toBeGreaterThan(laplacianVariance(ramp) * 10)
  })
})

describe('meanAbsDiff', () => {
  it('is 0 for identical frames', () => {
    const a = gray(4, 4, 128)
    const b = gray(4, 4, 128)
    expect(meanAbsDiff(a, b)).toBe(0)
  })

  it('returns 0 for mismatched dimensions', () => {
    expect(meanAbsDiff(gray(4, 4, 0), gray(5, 4, 0))).toBe(0)
  })

  it('matches the analytical mean abs diff', () => {
    const a = gray(2, 2, 100)
    const b = gray(2, 2, 130)
    expect(meanAbsDiff(a, b)).toBe(30)
  })

  it('handles asymmetric differences', () => {
    const a = gray(2, 1, 0)
    a.data[0] = 0
    a.data[1] = 200
    const b = gray(2, 1, 100)
    // |0-100| + |200-100| = 200, / 2 = 100
    expect(meanAbsDiff(a, b)).toBe(100)
  })
})

describe('accumulateBaseline', () => {
  it('returns a copy of the frame when there is no prior baseline', () => {
    const frame = gray(2, 2, 50)
    const out = accumulateBaseline(null, frame, 0.1)
    expect(out.data).not.toBe(frame.data)
    expect([...out.data]).toEqual([50, 50, 50, 50])
  })

  it('blends towards the new frame by weight', () => {
    const base = gray(1, 1, 100)
    const frame = gray(1, 1, 200)
    const out = accumulateBaseline(base, frame, 0.5)
    // 100*0.5 + 200*0.5 = 150
    expect(out.data[0]).toBe(150)
  })

  it('resets when the input dimensions disagree with the baseline', () => {
    const base = gray(2, 2, 100)
    const frame = gray(3, 3, 200)
    const out = accumulateBaseline(base, frame, 0.5)
    expect(out.width).toBe(3)
    expect(out.height).toBe(3)
    expect([...out.data]).toEqual(Array(9).fill(200))
  })

  it('weight 0 keeps the baseline unchanged', () => {
    const out = accumulateBaseline(gray(2, 2, 100), gray(2, 2, 200), 0)
    expect([...out.data]).toEqual([100, 100, 100, 100])
  })
})
