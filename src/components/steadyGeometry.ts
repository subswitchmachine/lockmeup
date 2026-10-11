/**
 * Pure 2D-path helpers used by the SteadyTask canvas. Kept separate from the
 * component so they can be unit-tested without a DOM.
 *
 * All inputs use a tuple Pt = [x, y] in whatever coordinate space the caller
 * cares about; normalisation/pixel-scaling happens outside.
 */

export type Pt = [number, number]

/**
 * Uniform Catmull-Rom interpolation through `ctrl`. The first and last control
 * points are duplicated so the curve passes through the endpoints. `samples`
 * is the number of points emitted per control segment (the final segment emits
 * one extra to close on the endpoint exactly).
 */
export function catmullRom(ctrl: Pt[], samples = 18): Pt[] {
  const pad: Pt[] = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]]
  const out: Pt[] = []
  for (let i = 1; i < pad.length - 2; i++) {
    const [p0, p1, p2, p3] = [pad[i - 1], pad[i], pad[i + 1], pad[i + 2]]
    const n = i < pad.length - 3 ? samples : samples + 1
    for (let j = 0; j < n; j++) {
      const t = j / samples
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  return out
}

/** Cumulative arc length along a polyline plus the total. */
export function pathLengths(pts: Pt[]): { total: number; cum: number[] } {
  const cum = [0]
  for (let i = 0; i < pts.length - 1; i++) {
    cum.push(cum[i] + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
  }
  return { total: cum[cum.length - 1], cum }
}

/**
 * Closest point on the polyline to (qx, qy). Returns the normalised arc-length
 * parameter `t` (0..1) of the foot of the perpendicular and the Euclidean
 * distance from (qx, qy) to that foot.
 */
export function nearest(
  pts: Pt[],
  cum: number[],
  total: number,
  qx: number,
  qy: number,
): { t: number; dist: number } {
  let bestT = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const segLen = cum[i + 1] - cum[i]
    if (segLen === 0) continue
    const u = Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / (segLen * segLen)))
    const dist = Math.hypot(qx - (ax + u * dx), qy - (ay + u * dy))
    if (dist < bestDist) {
      bestDist = dist
      bestT = (cum[i] + u * segLen) / total
    }
  }
  return { t: bestT, dist: bestDist }
}
