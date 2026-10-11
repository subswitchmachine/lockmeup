import type { LiveMetrics } from '../hooks/useAutoCapture'
import type { CaptureConfig } from '../lib/captureConfig'

interface MetricsOverlayProps {
  metrics: LiveMetrics
  config: CaptureConfig
}

interface RowProps {
  label: string
  value: number
  /** Threshold the value is compared against, for the bar + pass marker. */
  threshold: number
  /** Whether higher-than-threshold is the "good" direction. */
  higherIsPass: boolean
  /** Full-scale value for the bar (defaults to threshold * 2.5). */
  scale?: number
}

function MetricRow({ label, value, threshold, higherIsPass, scale }: RowProps) {
  const max = scale ?? threshold * 2.5
  const pass = higherIsPass ? value > threshold : value < threshold
  return (
    <div className={`metric-row ${pass ? 'pass' : 'fail'}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-bar">
        <div className="metric-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        <div className="metric-mark" style={{ left: `${Math.min(100, (threshold / max) * 100)}%` }} />
      </div>
      <span className="metric-value">{value.toFixed(1)}</span>
    </div>
  )
}

/** Live readout of the three capture signals plus thresholds, for tuning. */
export function MetricsOverlay({ metrics, config }: MetricsOverlayProps) {
  return (
    <div className="metrics-overlay">
      <MetricRow
        label="Focus"
        value={metrics.sharpness}
        threshold={config.focusThreshold}
        higherIsPass
      />
      <MetricRow
        label="Motion"
        value={metrics.motion}
        threshold={config.stillThreshold}
        higherIsPass={false}
        scale={config.motionThreshold * 2.5}
      />
      <MetricRow
        label="Presence"
        value={metrics.baselineDiff}
        threshold={config.arrivalThreshold}
        higherIsPass
      />
    </div>
  )
}
