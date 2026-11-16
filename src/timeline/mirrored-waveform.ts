// Pure drawing maths of the Mirrored waveform Lane: peak envelope per device pixel column.

import type { SourceAnalysis } from '@/audio/analysis'
import { readColumns } from './peaks'
import type { ColumnEnvelope } from './peaks'
import type { ViewportSnapshot } from './viewport'

export interface MirroredColumns {
  /** Per device pixel column, 0..1: how far the upper half reaches (R, or Mono). */
  readonly up: Float32Array
  /** Per device pixel column, 0..1: how far the lower half reaches (L, or Mono). */
  readonly down: Float32Array
  /** Scratch space for the signed envelope, reused by every frame. */
  readonly envelope: ColumnEnvelope
}

export function createMirroredColumns(columns: number): MirroredColumns {
  return {
    up: new Float32Array(columns),
    down: new Float32Array(columns),
    envelope: { min: new Float32Array(columns), max: new Float32Array(columns) },
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
  const { source, peaks } = analysis
  const sampleRate = source.sampleRate
  const columnsPerSecond = viewport.pixelsPerSecond * devicePixelRatio
  if (total === 0 || !(columnsPerSecond > 0) || source.channels.length === 0) return 0

  const samplesPerColumn = sampleRate / columnsPerSecond
  const startSample = viewport.startTime * sampleRate
  // Columns starting at or after the end of the Source stay 0.
  const endSample = source.duration * sampleRate
  const inside = Math.min(
    total,
    Math.max(0, Math.ceil((endSample - startSample) / samplesPerColumn)),
  )
  if (inside === 0) return 0

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
  }
  if (channelCount === 1) out.up.set(out.down.subarray(0, inside))
  return reads
}
