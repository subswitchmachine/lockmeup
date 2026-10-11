/**
 * Pure image-analysis helpers. No DOM, no React — operate on raw pixel buffers
 * so they can be unit-tested without a camera.
 */

/** A grayscale frame: one Uint8 luma value per pixel, plus its dimensions. */
export interface GrayFrame {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Convert an RGBA ImageData buffer to a single-channel grayscale frame using
 * the standard Rec. 601 luma weights.
 */
export function toGrayscale(image: ImageData): GrayFrame {
  const { data, width, height } = image
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // 0.299 R + 0.587 G + 0.114 B
    out[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  }
  return { data: out, width, height }
}

/**
 * Crop a centered square region of interest from a grayscale frame.
 * `fraction` is the ROI side length as a fraction of the smaller dimension.
 */
export function centerRoi(frame: GrayFrame, fraction: number): GrayFrame {
  const side = Math.max(1, Math.floor(Math.min(frame.width, frame.height) * fraction))
  const x0 = Math.floor((frame.width - side) / 2)
  const y0 = Math.floor((frame.height - side) / 2)
  const out = new Uint8ClampedArray(side * side)
  for (let y = 0; y < side; y++) {
    const srcRow = (y0 + y) * frame.width + x0
    out.set(frame.data.subarray(srcRow, srcRow + side), y * side)
  }
  return { data: out, width: side, height: side }
}

/**
 * Focus metric: variance of the Laplacian. Sharp images have strong
 * second-derivative responses (crisp edges) and thus high variance; blurry
 * images respond weakly and score low. Border pixels are skipped.
 */
export function laplacianVariance(frame: GrayFrame): number {
  const { data, width, height } = frame
  if (width < 3 || height < 3) return 0
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      // 4-neighbour Laplacian kernel.
      const lap =
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

/**
 * Mean absolute per-pixel difference between two equally-sized grayscale
 * frames. Used both for motion (consecutive frames) and presence (vs. the
 * empty-scene baseline). Returns 0 if the frames are not comparable.
 */
export function meanAbsDiff(a: GrayFrame, b: GrayFrame): number {
  if (a.width !== b.width || a.height !== b.height) return 0
  const da = a.data
  const db = b.data
  let sum = 0
  for (let i = 0; i < da.length; i++) {
    sum += Math.abs(da[i] - db[i])
  }
  return da.length === 0 ? 0 : sum / da.length
}

/**
 * Fold a new grayscale frame into a running average baseline (exponential
 * moving average). Returns a fresh frame; inputs are not mutated.
 */
export function accumulateBaseline(
  baseline: GrayFrame | null,
  frame: GrayFrame,
  weight: number,
): GrayFrame {
  if (!baseline || baseline.data.length !== frame.data.length) {
    return { data: frame.data.slice(), width: frame.width, height: frame.height }
  }
  const out = new Uint8ClampedArray(frame.data.length)
  for (let i = 0; i < out.length; i++) {
    out[i] = baseline.data[i] * (1 - weight) + frame.data[i] * weight
  }
  return { data: out, width: frame.width, height: frame.height }
}
