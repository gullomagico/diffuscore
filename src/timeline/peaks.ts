// Min/max peak pyramid (ADR-0001): our own implementation, pure and worker-free.
// Everything here is plain data (typed arrays and numbers) so it crosses the worker boundary.

/** One level of a peak pyramid: the signed minimum and maximum of each bucket. */
export interface PeakLevel {
  /** Bucket size in whole samples. The last bucket of a level may cover fewer samples. */
  readonly samplesPerBucket: number
  readonly min: Float32Array
  readonly max: Float32Array
}

/** The peak pyramid of one Channel. */
export interface PeakPyramid {
  /** Hz, read from the Source. */
  readonly sampleRate: number
  /** Length of the Channel in samples. */
  readonly length: number
  /** Finest first. Each level's samplesPerBucket is twice the previous one's. */
  readonly levels: readonly PeakLevel[]
}

/** The peak data of a Source: one pyramid per Channel, in Channel order. */
export interface SourcePeaks {
  readonly pyramids: readonly PeakPyramid[]
}

/** Duration of the finest level's bucket. Converted to whole samples with the Source's sample rate. */
export const FINEST_BUCKET_SECONDS = 0.001

const PROGRESS_STEPS = 100

/** Builds the pyramid of one Channel. onProgress receives a 0..1 fraction, throttled (about 100 calls at most), ending with exactly 1. */
export function buildPeakPyramid(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): PeakPyramid {
  const length = samples.length
  if (length === 0) {
    onProgress?.(1)
    return { sampleRate, length, levels: [] }
  }

  const finest = Math.max(1, Math.round(FINEST_BUCKET_SECONDS * sampleRate))
  const count = Math.ceil(length / finest)
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  const levels: PeakLevel[] = [{ samplesPerBucket: finest, min, max }]

  // The finest level is the only one that touches every sample: process it in chunks.
  const chunk = Math.max(1, Math.ceil(count / PROGRESS_STEPS))
  for (let first = 0; first < count; first += chunk) {
    const end = Math.min(count, first + chunk)
    for (let b = first; b < end; b++) {
      const from = b * finest
      const to = Math.min(length, from + finest)
      let lo = samples[from]
      let hi = lo
      for (let i = from + 1; i < to; i++) {
        const v = samples[i]
        if (v < lo) lo = v
        else if (v > hi) hi = v
      }
      min[b] = lo
      max[b] = hi
    }
    // Coarser levels are about as cheap as one more finest pass at most: keep the last 1 for the end.
    onProgress?.((end / count) * 0.99)
  }

  let previous = levels[0]
  while (previous.min.length > 1) {
    const fineMin = previous.min
    const fineMax = previous.max
    const n = Math.ceil(fineMin.length / 2)
    const coarseMin = new Float32Array(n)
    const coarseMax = new Float32Array(n)
    for (let j = 0; j < n; j++) {
      const a = 2 * j
      const b = a + 1
      if (b < fineMin.length) {
        coarseMin[j] = fineMin[a] < fineMin[b] ? fineMin[a] : fineMin[b]
        coarseMax[j] = fineMax[a] > fineMax[b] ? fineMax[a] : fineMax[b]
      } else {
        coarseMin[j] = fineMin[a]
        coarseMax[j] = fineMax[a]
      }
    }
    previous = { samplesPerBucket: previous.samplesPerBucket * 2, min: coarseMin, max: coarseMax }
    levels.push(previous)
  }

  onProgress?.(1)
  return { sampleRate, length, levels }
}

/** Index into pyramid.levels of the level to draw with, or -1 when a column is narrower than one finest bucket and raw samples must be read. */
export function pickPeakLevel(pyramid: PeakPyramid, samplesPerColumn: number): number {
  for (let k = pyramid.levels.length - 1; k >= 0; k--) {
    if (pyramid.levels[k].samplesPerBucket <= samplesPerColumn) return k
  }
  return -1
}

export interface ColumnEnvelope {
  readonly min: Float32Array
  readonly max: Float32Array
}

/**
 * Fills out.min[i] / out.max[i] for `columns` consecutive pixel columns. Column i covers the
 * samples [startSample + i * samplesPerColumn, startSample + (i + 1) * samplesPerColumn).
 * startSample and samplesPerColumn are fractional. Returns the number of buckets or raw samples read.
 */
export function readColumns(
  pyramid: PeakPyramid,
  samples: Float32Array,
  startSample: number,
  samplesPerColumn: number,
  columns: number,
  out: ColumnEnvelope,
): number {
  if (pyramid.length === 0) {
    out.min.fill(0, 0, columns)
    out.max.fill(0, 0, columns)
    return 0
  }

  const k = pickPeakLevel(pyramid, samplesPerColumn)
  const level = k >= 0 ? pyramid.levels[k] : undefined
  const spb = level ? level.samplesPerBucket : 1
  const srcMin = level ? level.min : samples
  const srcMax = level ? level.max : samples
  const count = level ? level.min.length : pyramid.length

  let reads = 0
  for (let c = 0; c < columns; c++) {
    const s0 = startSample + c * samplesPerColumn
    const s1 = s0 + samplesPerColumn
    const b0 = Math.floor(s0 / spb)
    const b1 = Math.max(b0 + 1, Math.floor(s1 / spb))
    const lo = Math.min(Math.max(b0, 0), count - 1)
    // A column reaching the end also takes the partial last bucket, which floor() would leave out.
    const hi = s1 >= pyramid.length ? count : Math.min(Math.max(b1, lo + 1), count)
    let mn = srcMin[lo]
    let mx = srcMax[lo]
    for (let b = lo + 1; b < hi; b++) {
      if (srcMin[b] < mn) mn = srcMin[b]
      if (srcMax[b] > mx) mx = srcMax[b]
    }
    out.min[c] = mn
    out.max[c] = mx
    reads += hi - lo
  }
  return reads
}
