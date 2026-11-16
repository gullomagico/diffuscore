// Min/max peak pyramid (ADR-0001): our own implementation, pure and worker-free.
// Everything here is plain data (typed arrays and numbers) so it crosses the worker boundary.

/** Full scale (1.0) in the pyramid's 16-bit storage. */
export const PEAK_FULL_SCALE = 32767

/** One level of a peak pyramid: the signed minimum, maximum and RMS of each bucket, in 16 bits. */
export interface PeakLevel {
  /** Bucket size in whole samples. The last bucket of a level may cover fewer samples. */
  readonly samplesPerBucket: number
  /** Signed minimum per bucket, in 1/PEAK_FULL_SCALE units, rounded down so the envelope never under-reports. */
  readonly min: Int16Array
  /** Signed maximum per bucket, rounded up. */
  readonly max: Int16Array
  /** Root mean square per bucket, 0..PEAK_FULL_SCALE (rounded to nearest). */
  readonly rms: Uint16Array
}

/** The peak pyramid of one Channel. */
export interface PeakPyramid {
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
    return { length, levels: [] }
  }

  const finest = Math.max(1, Math.round(FINEST_BUCKET_SECONDS * sampleRate))
  const count = Math.ceil(length / finest)
  const min = new Int16Array(count)
  const max = new Int16Array(count)
  const rms = new Uint16Array(count)
  const levels: PeakLevel[] = [{ samplesPerBucket: finest, min, max, rms }]

  // The finest level is the only one that touches every sample: process it in chunks.
  const chunk = Math.max(1, Math.ceil(count / PROGRESS_STEPS))
  for (let first = 0; first < count; first += chunk) {
    const end = Math.min(count, first + chunk)
    for (let b = first; b < end; b++) {
      const from = b * finest
      const to = Math.min(length, from + finest)
      let lo = 1
      let hi = -1
      let sumOfSquares = 0 // a double: a Float32 sum would lose the small terms
      for (let i = from; i < to; i++) {
        const v = samples[i]!
        const clamped = v > 1 ? 1 : v < -1 ? -1 : v
        if (clamped < lo) lo = clamped
        if (clamped > hi) hi = clamped
        sumOfSquares += clamped * clamped
      }
      min[b] = Math.floor(lo * PEAK_FULL_SCALE)
      max[b] = Math.ceil(hi * PEAK_FULL_SCALE)
      rms[b] = Math.round(Math.sqrt(sumOfSquares / (to - from)) * PEAK_FULL_SCALE)
    }
    // Coarser levels are about as cheap as one more finest pass at most: keep the last 1 for the end.
    onProgress?.((end / count) * 0.99)
  }

  let previous = levels[0]!
  while (previous.min.length > 1) {
    const fine = previous
    const n = Math.ceil(fine.min.length / 2)
    const coarseMin = new Int16Array(n)
    const coarseMax = new Int16Array(n)
    const coarseRms = new Uint16Array(n)
    for (let j = 0; j < n; j++) {
      const a = 2 * j
      const b = a + 1
      if (b < fine.min.length) {
        coarseMin[j] = fine.min[a]! < fine.min[b]! ? fine.min[a]! : fine.min[b]!
        coarseMax[j] = fine.max[a]! > fine.max[b]! ? fine.max[a]! : fine.max[b]!
        // Weighted by the samples each bucket covers: only the last bucket can be partial.
        const countA = fine.samplesPerBucket
        const countB = Math.min(fine.samplesPerBucket, length - b * fine.samplesPerBucket)
        const ra = fine.rms[a]!
        const rb = fine.rms[b]!
        coarseRms[j] = Math.round(
          Math.sqrt((countA * ra * ra + countB * rb * rb) / (countA + countB)),
        )
      } else {
        coarseMin[j] = fine.min[a]!
        coarseMax[j] = fine.max[a]!
        coarseRms[j] = fine.rms[a]!
      }
    }
    previous = {
      samplesPerBucket: fine.samplesPerBucket * 2,
      min: coarseMin,
      max: coarseMax,
      rms: coarseRms,
    }
    levels.push(previous)
  }

  onProgress?.(1)
  return { length, levels }
}

/** Index into pyramid.levels of the level to draw with, or -1 when a column is narrower than one finest bucket and raw samples must be read. */
export function pickPeakLevel(pyramid: PeakPyramid, samplesPerColumn: number): number {
  for (let k = pyramid.levels.length - 1; k >= 0; k--) {
    if (pyramid.levels[k].samplesPerBucket <= samplesPerColumn) return k
  }
  return -1
}

export interface ColumnEnvelope {
  /** Signed minimum per column, as a float in -1..1. */
  readonly min: Float32Array
  /** Signed maximum per column, as a float in -1..1. */
  readonly max: Float32Array
  /** Root mean square per column, as a float in 0..1. */
  readonly rms: Float32Array
}

/**
 * Fills out.min[i] / out.max[i] / out.rms[i] (floats: the 16-bit storage is not visible here) for
 * `columns` consecutive pixel columns. Column i covers the samples
 * [startSample + i * samplesPerColumn, startSample + (i + 1) * samplesPerColumn).
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
    out.rms.fill(0, 0, columns)
    return 0
  }

  const k = pickPeakLevel(pyramid, samplesPerColumn)
  const level = k >= 0 ? pyramid.levels[k] : undefined
  const spb = level ? level.samplesPerBucket : 1
  const srcMin = level ? level.min : samples
  const srcMax = level ? level.max : samples
  const scale = level ? 1 / PEAK_FULL_SCALE : 1
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
    let mn = srcMin[lo]!
    let mx = srcMax[lo]!
    // Sum of squares of the samples read: from the buckets' RMS (weighted by their samples) or raw.
    let squares = 0
    let covered = 0
    for (let b = lo; b < hi; b++) {
      if (srcMin[b]! < mn) mn = srcMin[b]!
      if (srcMax[b]! > mx) mx = srcMax[b]!
      if (level) {
        const n = Math.min(spb, pyramid.length - b * spb)
        const r = level.rms[b]! / PEAK_FULL_SCALE
        squares += n * r * r
        covered += n
      } else {
        const v = samples[b]!
        squares += v * v
        covered++
      }
    }
    out.min[c] = mn * scale
    out.max[c] = mx * scale
    out.rms[c] = Math.sqrt(squares / covered)
    reads += hi - lo
  }
  return reads
}
