// Pure drawing maths of the Mirrored waveform Lane: peak and RMS envelopes per device pixel column.

import type { SourceAnalysis } from '@/audio/analysis'
import { readColumns } from './peaks'
import type { ColumnEnvelope } from './peaks'
import type { ViewportSnapshot } from './viewport'

export interface MirroredColumns {
  /** Per device pixel column, 0..1: how far the upper half reaches (R, or Mono). */
  readonly up: Float32Array
  /** Per device pixel column, 0..1: how far the lower half reaches (L, or Mono). */
  readonly down: Float32Array
  /** Per device pixel column, 0..1: the RMS (average level) of the upper half. Same mapping as `up`. */
  readonly upRms: Float32Array
  /** Per device pixel column, 0..1: the RMS of the lower half. Same mapping as `down`. */
  readonly downRms: Float32Array
  /** Scratch space for the signed envelope, reused by every frame. */
  readonly envelope: ColumnEnvelope
  /** Scratch space of the smoothed read (columns + both margins). Grown on first use, then reused. */
  smoothing: ColumnEnvelope
}

function createEnvelope(columns: number): ColumnEnvelope {
  return {
    min: new Float32Array(columns),
    max: new Float32Array(columns),
    rms: new Float32Array(columns),
  }
}

export function createMirroredColumns(columns: number): MirroredColumns {
  return {
    up: new Float32Array(columns),
    down: new Float32Array(columns),
    upRms: new Float32Array(columns),
    downRms: new Float32Array(columns),
    envelope: createEnvelope(columns),
    smoothing: createEnvelope(0),
  }
}

/** Peak absolute value of the signed envelope, clamped to full scale. */
function absolutePeaks(envelope: ColumnEnvelope, target: Float32Array, columns: number): void {
  for (let i = 0; i < columns; i++) {
    const lo = Math.abs(envelope.min[i]!)
    const hi = Math.abs(envelope.max[i]!)
    target[i] = Math.min(1, lo > hi ? lo : hi)
  }
}

/** How many of `total` device pixel columns start before the end of the Source. */
export function columnsInsideSource(
  analysis: SourceAnalysis,
  viewport: ViewportSnapshot,
  devicePixelRatio: number,
  total: number,
): number {
  const columnsPerSecond = viewport.pixelsPerSecond * devicePixelRatio
  if (!(columnsPerSecond > 0)) return 0
  const remaining = (analysis.source.duration - viewport.startTime) * columnsPerSecond
  return Math.min(total, Math.max(0, Math.ceil(remaining)))
}

/**
 * Fills the peak absolute value of each device pixel column. Stereo: up = R (Channel 1), down = L (Channel 0).
 * Mono: both = the single Channel. Returns the number of buckets or samples read (the work of one frame).
 */
export function readMirroredColumns(
  analysis: SourceAnalysis,
  viewport: ViewportSnapshot,
  devicePixelRatio: number,
  out: MirroredColumns,
): number {
  const total = out.up.length
  out.up.fill(0)
  out.down.fill(0)
  out.upRms.fill(0)
  out.downRms.fill(0)
  const { source, peaks } = analysis
  const sampleRate = source.sampleRate
  // Columns starting at or after the end of the Source stay 0.
  const inside = columnsInsideSource(analysis, viewport, devicePixelRatio, total)
  if (inside === 0 || source.channels.length === 0) return 0

  const samplesPerColumn = sampleRate / (viewport.pixelsPerSecond * devicePixelRatio)
  const startSample = viewport.startTime * sampleRate

  const channelCount = source.channels.length
  const downIndex = 0
  const upIndex = channelCount > 1 ? 1 : 0
  let reads = 0
  for (let ch = 0; ch <= upIndex; ch++) {
    reads += readColumns(
      peaks.pyramids[ch]!,
      source.channels[ch]!,
      startSample,
      samplesPerColumn,
      inside,
      out.envelope,
    )
    absolutePeaks(out.envelope, ch === downIndex ? out.down : out.up, inside)
    const rmsTarget = ch === downIndex ? out.downRms : out.upRms
    for (let i = 0; i < inside; i++) rmsTarget[i] = Math.min(1, out.envelope.rms[i]!)
  }
  if (channelCount === 1) {
    out.up.set(out.down.subarray(0, inside))
    out.upRms.set(out.downRms.subarray(0, inside))
  }
  return reads
}

/** Half-width of the smoothed peak's moving average, in CSS pixels. */
export const SMOOTHING_RADIUS_CSS_PIXELS = 4

/** The smoothing radius in device pixel columns. */
export function smoothingRadiusColumns(devicePixelRatio: number): number {
  return Math.round(SMOOTHING_RADIUS_CSS_PIXELS * devicePixelRatio)
}

/**
 * Like readMirroredColumns for up/down only (the RMS arrays are left alone), but each column is the
 * moving average of the peaks of the `radiusColumns` columns on each side and itself. Stable under
 * scrolling: the margins outside the canvas are read too, so a column depends only on the time it
 * covers. Columns before time 0 or after the end of the Source are not part of any average.
 * Work is O(columns + 2 * radius) per Channel. Returns the number of buckets or samples read.
 */
export function readSmoothedMirroredColumns(
  analysis: SourceAnalysis,
  viewport: ViewportSnapshot,
  devicePixelRatio: number,
  out: MirroredColumns,
  radiusColumns: number,
): number {
  const total = out.up.length
  out.up.fill(0)
  out.down.fill(0)
  const { source, peaks } = analysis
  const inside = columnsInsideSource(analysis, viewport, devicePixelRatio, total)
  if (inside === 0 || source.channels.length === 0) return 0

  const radius = Math.max(0, Math.floor(radiusColumns))
  const columnsPerSecond = viewport.pixelsPerSecond * devicePixelRatio
  const samplesPerColumn = source.sampleRate / columnsPerSecond
  // Columns are numbered from the first visible one. Those that exist are [first, end).
  const first = Math.max(-radius, Math.ceil(-viewport.startTime * columnsPerSecond))
  const end = Math.min(
    total + radius,
    Math.ceil((source.duration - viewport.startTime) * columnsPerSecond),
  )
  if (end <= first) return 0
  const needed = end - first
  if (out.smoothing.min.length < needed) out.smoothing = createEnvelope(needed + 2 * radius)
  const scratch = out.smoothing
  const startSample = viewport.startTime * source.sampleRate + first * samplesPerColumn

  const channelCount = source.channels.length
  const downIndex = 0
  const upIndex = channelCount > 1 ? 1 : 0
  let reads = 0
  for (let ch = 0; ch <= upIndex; ch++) {
    reads += readColumns(
      peaks.pyramids[ch]!,
      source.channels[ch]!,
      startSample,
      samplesPerColumn,
      needed,
      scratch,
    )
    // The peaks go in scratch.min (index = column - first).
    absolutePeaks(scratch, scratch.min, needed)
    const peak = scratch.min
    const target = ch === downIndex ? out.down : out.up
    // Running sum over the window [c - radius, c + radius], clipped to the columns that exist.
    let sum = 0
    for (let c = Math.max(first, -radius); c <= Math.min(end - 1, radius - 1); c++) {
      sum += peak[c - first]!
    }
    for (let c = 0; c < inside; c++) {
      const entering = c + radius
      if (entering >= first && entering < end) sum += peak[entering - first]!
      const leaving = c - radius - 1
      if (leaving >= first && leaving < end) sum -= peak[leaving - first]!
      const count = Math.min(end - 1, c + radius) - Math.max(first, c - radius) + 1
      target[c] = count > 0 ? Math.min(1, Math.max(0, sum / count)) : 0
    }
  }
  if (channelCount === 1) out.up.set(out.down.subarray(0, inside))
  return reads
}
