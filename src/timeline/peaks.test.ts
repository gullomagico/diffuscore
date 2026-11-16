import { describe, expect, test } from 'vite-plus/test'
import type { Source } from '@/audio/source'
import { PEAK_FULL_SCALE, buildPeakPyramid, pickPeakLevel, readColumns } from './peaks'
import type { ColumnEnvelope, PeakPyramid } from './peaks'

const RATE = 8000

/** A mono Source at a low sample rate, built directly: nothing may assume the working rate. */
function sourceOf(samples: Float32Array): Source {
  const channel = new Float32Array(new SharedArrayBuffer(samples.length * 4))
  channel.set(samples)
  return {
    fileName: 'test.wav',
    channels: [channel],
    sampleRate: RATE,
    duration: samples.length / RATE,
  }
}

function pyramidOf(samples: Float32Array): PeakPyramid {
  const source = sourceOf(samples)
  return buildPeakPyramid(source.channels[0]!, source.sampleRate)
}

function envelope(columns: number): ColumnEnvelope {
  return {
    min: new Float32Array(columns),
    max: new Float32Array(columns),
    rms: new Float32Array(columns),
  }
}

/** A stored 16-bit value as a float in -1..1. */
function unit(stored: number): number {
  return stored / PEAK_FULL_SCALE
}

function ramp(length: number, scale: number): Float32Array {
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) samples[i] = i * scale
  return samples
}

describe('buildPeakPyramid', () => {
  test('a sine with a 16-sample period gives -1/1 per 16 samples and half-ranges per 8', () => {
    const samples = new Float32Array(64)
    for (let i = 0; i < 64; i++) samples[i] = Math.sin((2 * Math.PI * i) / 16)
    const { levels } = pyramidOf(samples)
    // 8-sample buckets alternate between [0, 1] and [-1, 0]
    expect(unit(levels[0].min[0])).toBeCloseTo(0, 4)
    expect(unit(levels[0].max[0])).toBeCloseTo(1, 4)
    expect(unit(levels[0].min[1])).toBeCloseTo(-1, 4)
    expect(unit(levels[0].max[1])).toBeCloseTo(0, 4)
    // 16-sample buckets cover a whole period
    expect(levels[1].samplesPerBucket).toBe(16)
    for (let b = 0; b < 4; b++) {
      expect(unit(levels[1].min[b])).toBeCloseTo(-1, 4)
      expect(unit(levels[1].max[b])).toBeCloseTo(1, 4)
    }
  })

  test('a slow ramp has literal per-bucket ranges', () => {
    // 80 samples = 10 buckets of 8, value = i / 80
    const { levels } = pyramidOf(ramp(80, 1 / 80))
    expect(levels[0].min).toHaveLength(10)
    expect(unit(levels[0].min[3])).toBeCloseTo(0.3, 4)
    expect(unit(levels[0].max[3])).toBeCloseTo(31 / 80, 4)
    expect(unit(levels[1].min[0])).toBeCloseTo(0, 4)
    expect(unit(levels[1].max[0])).toBeCloseTo(15 / 80, 4)
    // odd count: 10 -> 5 -> 3, last coarse bucket is the last fine bucket
    expect(levels[2].min).toHaveLength(3)
    expect(unit(levels[2].min[2])).toBeCloseTo(0.8, 4)
    expect(unit(levels[2].max[2])).toBeCloseTo(79 / 80, 4)
  })

  test('a single-sample click only shows in the bucket containing it, at every level', () => {
    const samples = new Float32Array(1000)
    samples[517] = 0.8
    const { levels } = pyramidOf(samples)
    // 517 is in finest bucket 64 (8 samples each)
    expect(unit(levels[0].max[64])).toBeCloseTo(0.8, 4)
    expect(levels[0].max[63]).toBe(0)
    expect(levels[0].max[65]).toBe(0)
    expect(levels[0].min[64]).toBe(0)
    expect(unit(levels[1].max[32])).toBeCloseTo(0.8, 4)
    expect(levels[1].max[31]).toBe(0)
    expect(unit(levels[3].max[8])).toBeCloseTo(0.8, 4)
    expect(levels[3].max[7]).toBe(0)
    expect(unit(levels[levels.length - 1].max[0])).toBeCloseTo(0.8, 4)
  })

  test('DC gives min = max = the DC value everywhere', () => {
    const { levels } = pyramidOf(new Float32Array(100).fill(0.25))
    expect(levels[0].min).toHaveLength(13)
    for (const level of levels) {
      // 0.25 is 8191.75 units: min rounds down, max up
      expect(Array.from(level.min).every((v) => v === 8191)).toBe(true)
      expect(Array.from(level.max).every((v) => v === 8192)).toBe(true)
    }
  })

  test('a length that is not a multiple of the bucket size has a partial last bucket', () => {
    // 21 samples -> buckets of 8, 8 and 5; value = (i + 1) / 100
    const samples = ramp(21, 0.01).map((v) => v + 0.01)
    const { levels } = pyramidOf(samples)
    expect(levels[0].min).toHaveLength(3)
    expect(unit(levels[0].min[2])).toBeCloseTo(0.17, 4)
    expect(unit(levels[0].max[2])).toBeCloseTo(0.21, 4)
    expect(levels[1].min).toHaveLength(2)
    expect(unit(levels[1].max[1])).toBeCloseTo(0.21, 4)
  })

  test('each level is the 2x reduction of the one below, including an odd bucket count', () => {
    let seed = 12345
    const samples = new Float32Array(8 * 13 + 3) // 14 buckets
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] = (seed / 0xffffffff) * 2 - 1
    }
    const { levels } = pyramidOf(samples)
    expect(levels.map((l) => l.min.length)).toEqual([14, 7, 4, 2, 1])
    for (let k = 1; k < levels.length; k++) {
      const fine = levels[k - 1]
      const coarse = levels[k]
      expect(coarse.samplesPerBucket).toBe(fine.samplesPerBucket * 2)
      for (let j = 0; j < coarse.min.length; j++) {
        const a = 2 * j
        const b = Math.min(a + 1, fine.min.length - 1)
        expect(coarse.min[j]).toBe(Math.min(fine.min[a], fine.min[b]))
        expect(coarse.max[j]).toBe(Math.max(fine.max[a], fine.max[b]))
      }
    }
  })

  test('the finest bucket is derived from the sample rate', () => {
    const at = (rate: number) => buildPeakPyramid(new Float32Array(1000), rate).levels[0]
    expect(at(8000).samplesPerBucket).toBe(8)
    expect(at(16000).samplesPerBucket).toBe(16)
    expect(at(44100).samplesPerBucket).toBe(44)
    expect(at(100).samplesPerBucket).toBe(1)
  })

  test('the coarsest level has exactly one bucket and reports the length', () => {
    const pyramid = pyramidOf(new Float32Array(1000))
    expect(pyramid.levels.at(-1)?.min).toHaveLength(1)
    expect(pyramid.length).toBe(1000)
    expect(pyramidOf(new Float32Array(5)).levels).toHaveLength(1)
  })

  test('an empty Channel gives no levels and does not throw', () => {
    expect(pyramidOf(new Float32Array(0)).levels).toEqual([])
  })

  test('works on a view of a SharedArrayBuffer', () => {
    const samples = new Float32Array(new SharedArrayBuffer(4 * 16))
    samples[9] = -0.5
    const { levels } = pyramidOf(samples)
    expect(unit(levels[0].min[1])).toBeCloseTo(-0.5, 4)
  })

  test('progress is monotonic, within 0..1, bounded and ends at 1', () => {
    const calls: number[] = []
    buildPeakPyramid(new Float32Array(8 * 5000), RATE, (f) => calls.push(f))
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.length).toBeLessThanOrEqual(105)
    expect(calls.at(-1)).toBe(1)
    for (let i = 0; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(0)
      expect(calls[i]).toBeLessThanOrEqual(1)
      if (i > 0) expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1])
    }
  })
})

describe('RMS and 16-bit storage', () => {
  /** A stored rms as a float in 0..1. */
  const rmsAt = (level: { rms: Uint16Array }, i: number) => level.rms[i]! / PEAK_FULL_SCALE

  test('every level is stored as 16-bit integers', () => {
    const { levels } = pyramidOf(new Float32Array(100))
    for (const level of levels) {
      expect(level.min).toBeInstanceOf(Int16Array)
      expect(level.max).toBeInstanceOf(Int16Array)
      expect(level.rms).toBeInstanceOf(Uint16Array)
      expect(level.rms).toHaveLength(level.min.length)
    }
    expect(PEAK_FULL_SCALE).toBe(32767)
  })

  test('the RMS of DC 0.25 is 0.25 at every level', () => {
    const { levels } = pyramidOf(new Float32Array(100).fill(0.25))
    for (const level of levels) {
      for (let i = 0; i < level.rms.length; i++) expect(rmsAt(level, i)).toBeCloseTo(0.25, 4)
    }
  })

  test('the RMS of a full-scale sine over whole periods is about 0.7071 at every level', () => {
    const samples = new Float32Array(1024)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * i) / 16)
    for (const level of pyramidOf(samples).levels) {
      for (let i = 0; i < level.rms.length; i++) {
        expect(Math.abs(rmsAt(level, i) - 0.7071)).toBeLessThan(1e-3)
      }
    }
  })

  test('a single-sample click of 0.8 in an 8-sample bucket has RMS 0.8 / sqrt(8)', () => {
    const samples = new Float32Array(1000)
    samples[517] = 0.8
    const { levels } = pyramidOf(samples)
    expect(rmsAt(levels[0], 64)).toBeCloseTo(0.2828, 3)
    expect(rmsAt(levels[0], 63)).toBe(0)
    // the 16-sample bucket holding it: sqrt(0.64 / 16)
    expect(rmsAt(levels[1], 32)).toBeCloseTo(0.2, 3)
  })

  test('a coarser RMS weights its buckets by sample count, so a partial last bucket counts less', () => {
    // 12 samples: bucket 0 = eight samples of 0.5, bucket 1 = four samples of 1.0
    const samples = new Float32Array(12)
    samples.fill(0.5, 0, 8)
    samples.fill(1, 8, 12)
    const { levels } = pyramidOf(samples)
    expect(rmsAt(levels[0], 0)).toBeCloseTo(0.5, 4)
    expect(rmsAt(levels[0], 1)).toBeCloseTo(1, 4)
    // sqrt((8 * 0.25 + 4 * 1) / 12) = 0.7071, not the unweighted sqrt((0.25 + 1) / 2) = 0.7906
    expect(rmsAt(levels[1], 0)).toBeCloseTo(0.7071, 3)
  })

  test('a lone last bucket keeps its own RMS at the next level', () => {
    // 20 samples: buckets of 8, 8 and 4 (0.5, 0.5, 1.0). Level 1 bucket 1 is bucket 2 alone.
    const samples = new Float32Array(20).fill(0.5)
    samples.fill(1, 16, 20)
    const { levels } = pyramidOf(samples)
    expect(rmsAt(levels[1], 1)).toBeCloseTo(1, 4)
    // level 2 = all 20 samples: sqrt((16 * 0.25 + 4 * 1) / 20) = sqrt(0.4)
    expect(rmsAt(levels[2], 0)).toBeCloseTo(0.6325, 3)
  })

  test('min is rounded down and max up, so the envelope never under-reports', () => {
    const positive = new Float32Array(8)
    positive[3] = 0.00001
    const up = pyramidOf(positive).levels[0]
    expect(up.max[0]).toBe(1)
    expect(up.min[0]).toBe(0)
    const negative = new Float32Array(8)
    negative[3] = -0.00001
    const down = pyramidOf(negative).levels[0]
    expect(down.min[0]).toBe(-1)
    expect(down.max[0]).toBe(0)
  })

  test('samples beyond full scale are clamped when stored', () => {
    const samples = new Float32Array(8)
    samples[1] = 1.5
    samples[2] = -3
    const level = pyramidOf(samples).levels[0]
    expect(level.max[0]).toBe(PEAK_FULL_SCALE)
    expect(level.min[0]).toBe(-PEAK_FULL_SCALE)
    // sqrt((1 + 1) / 8) = 0.5, from the clamped values
    expect(rmsAt(level, 0)).toBeCloseTo(0.5, 4)
  })

  test('the RMS never exceeds the larger absolute extreme by more than one unit', () => {
    let seed = 777
    const samples = new Float32Array(8 * 37 + 5)
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] = (seed / 0xffffffff) * 2 - 1
    }
    for (const level of pyramidOf(samples).levels) {
      for (let i = 0; i < level.rms.length; i++) {
        const extreme = Math.max(Math.abs(level.min[i]!), Math.abs(level.max[i]!))
        expect(level.rms[i]!).toBeLessThanOrEqual(extreme + 1)
      }
    }
  })

  test('the whole pyramid takes 6 bytes per bucket', () => {
    // The finest level has one bucket per millisecond and the coarser levels add up to about the
    // same again. So a 30 minute stereo Source (the working rate does not matter) has about
    // 1800 s * 1000 buckets/s * 2 levels' worth * 2 Channels = 7.2 million buckets: 6 bytes each
    // is about 43 MB, under the 64 MB budget. Three Float32 arrays (12 bytes) would be 86 MB.
    const sampleRate = 44100 // any rate: the bytes per bucket do not depend on it
    const samples = new Float32Array(sampleRate * 20)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 7)
    const { levels } = buildPeakPyramid(samples, sampleRate)
    const buckets = levels.reduce((sum, level) => sum + level.min.length, 0)
    const bytes = levels.reduce(
      (sum, level) => sum + level.min.byteLength + level.max.byteLength + level.rms.byteLength,
      0,
    )
    expect(bytes).toBe(6 * buckets)
  })
})

describe('pickPeakLevel', () => {
  const pyramid = pyramidOf(new Float32Array(512)) // buckets 8, 16, ... 512

  test('picks the coarsest level not wider than the column, compared in samples', () => {
    expect(pickPeakLevel(pyramid, 12)).toBe(0) // 1.5 ms -> 1 ms level
    expect(pickPeakLevel(pyramid, 16)).toBe(1) // 2 ms -> 2 ms level
    expect(pickPeakLevel(pyramid, 8)).toBe(0)
  })

  test('returns -1 for a column narrower than the finest bucket', () => {
    expect(pickPeakLevel(pyramid, 7.9)).toBe(-1)
    expect(pickPeakLevel(pyramid, 0.25)).toBe(-1)
  })

  test('a column wider than the coarsest level picks the coarsest level', () => {
    expect(pickPeakLevel(pyramid, 100000)).toBe(6)
  })
})

describe('readColumns', () => {
  test('level path: columns tile the signal without gaps', () => {
    const samples = ramp(512, 1 / 512)
    const pyramid = pyramidOf(samples)
    const out = envelope(4)
    // 12 samples per column -> 8-sample level; [0,12) reads buckets 0..0, [12,24) reads 1..2
    const reads = readColumns(pyramid, samples, 0, 12, 4, out)
    expect(out.min[0]).toBeCloseTo(0, 4)
    expect(out.max[0]).toBeCloseTo(7 / 512, 4)
    expect(out.min[1]).toBeCloseTo(8 / 512, 4)
    expect(out.max[1]).toBeCloseTo(23 / 512, 4)
    expect(out.min[2]).toBeCloseTo(24 / 512, 4)
    expect(out.max[2]).toBeCloseTo(31 / 512, 4)
    expect(reads).toBe(1 + 2 + 1 + 2)
  })

  test('raw path reads the samples array, not the pyramid', () => {
    const pyramid = pyramidOf(new Float32Array(512)) // all zeros
    const samples = ramp(512, 1)
    const out = envelope(2)
    const reads = readColumns(pyramid, samples, 10, 4, 2, out) // [10,14) and [14,18)
    expect(Array.from(out.min)).toEqual([10, 14])
    expect(Array.from(out.max)).toEqual([13, 17])
    expect(reads).toBe(8)
  })

  test('raw path: columns narrower than one sample repeat the sample they fall in, never NaN', () => {
    const pyramid = pyramidOf(new Float32Array(512))
    const samples = ramp(512, 1)
    const out = envelope(5)
    readColumns(pyramid, samples, 10, 0.25, 5, out) // starts 10, 10.25, 10.5, 10.75, 11
    expect(Array.from(out.min)).toEqual([10, 10, 10, 10, 11])
    expect(Array.from(out.max)).toEqual([10, 10, 10, 10, 11])
  })

  test('clamps at the end: a partial column reads what exists, later columns repeat the last bucket', () => {
    const samples = ramp(512, 1 / 512)
    const pyramid = pyramidOf(samples)
    const out = envelope(3)
    readColumns(pyramid, samples, 504, 8, 3, out) // bucket 63, then past the end twice
    for (let i = 0; i < 3; i++) {
      expect(out.min[i]).toBeCloseTo(504 / 512, 4)
      expect(out.max[i]).toBeCloseTo(511 / 512, 4)
    }
    const wide = envelope(1)
    readColumns(pyramid, samples, 504, 16, 1, wide) // [504, 520) -> bucket 31 of the 16-sample level
    expect(wide.min[0]).toBeCloseTo(496 / 512, 4)
    expect(wide.max[0]).toBeCloseTo(511 / 512, 4)
  })

  test('a column reaching the end includes the partial last bucket', () => {
    // 20 samples -> buckets of 8, 8 and 4; the click is in the partial one
    const samples = new Float32Array(20)
    samples[19] = 0.75
    const pyramid = pyramidOf(samples)
    const out = envelope(2)
    readColumns(pyramid, samples, 0, 10, 2, out) // fit: [0,10) and [10,20)
    expect(out.max[0]).toBe(0)
    expect(out.max[1]).toBeCloseTo(0.75, 4)
  })

  test('clamps at the end on the raw path and before the start', () => {
    const samples = ramp(512, 1)
    const pyramid = pyramidOf(samples)
    const out = envelope(3)
    readColumns(pyramid, samples, 510, 1, 3, out) // 510, 511, past the end
    expect(Array.from(out.min)).toEqual([510, 511, 511])
    const before = envelope(2)
    readColumns(pyramid, samples, -2, 1, 2, before)
    expect(Array.from(before.max)).toEqual([0, 0])
    // the level path, on samples within full scale: [-16, -8) clamps to the first bucket
    const small = ramp(512, 1 / 512)
    const levelBefore = envelope(1)
    readColumns(pyramidOf(small), small, -16, 8, 1, levelBefore)
    expect(levelBefore.min[0]).toBe(0)
    expect(levelBefore.max[0]).toBeCloseTo(7 / 512, 4)
  })

  test('level path: the column RMS is the sample-count-weighted mean of the buckets it reads', () => {
    // 24 samples in buckets of 8: 0.5, 1.0, 0.5
    const samples = new Float32Array(24).fill(0.5)
    samples.fill(1, 8, 16)
    const out = envelope(2)
    readColumns(pyramidOf(samples), samples, 0, 12, 2, out) // [0,12) reads bucket 0, [12,24) buckets 1..2
    expect(out.rms[0]).toBeCloseTo(0.5, 4)
    // sqrt((8 * 1 + 8 * 0.25) / 16) = 0.7906
    expect(out.rms[1]).toBeCloseTo(0.7906, 3)
  })

  test('level path: a column reaching the end weights the partial last bucket by its samples', () => {
    const samples = new Float32Array(12)
    samples.fill(0.5, 0, 8)
    samples.fill(1, 8, 12)
    const out = envelope(1)
    readColumns(pyramidOf(samples), samples, 0, 12, 1, out)
    expect(out.rms[0]).toBeCloseTo(0.7071, 3)
  })

  test('raw path: the column RMS is computed from the raw samples', () => {
    const pyramid = pyramidOf(new Float32Array(512))
    const samples = ramp(512, 1)
    const out = envelope(2)
    readColumns(pyramid, samples, 10, 4, 2, out) // [10,14) and [14,18)
    // sqrt((100 + 121 + 144 + 169) / 4) and sqrt((196 + 225 + 256 + 289) / 4)
    expect(out.rms[0]).toBeCloseTo(11.554, 3)
    expect(out.rms[1]).toBeCloseTo(15.54, 3)
  })

  test('raw path: a column narrower than one sample has the absolute value of that sample as RMS', () => {
    const samples = new Float32Array(512)
    samples[10] = -0.5
    const out = envelope(3)
    readColumns(pyramidOf(samples), samples, 10, 0.25, 3, out)
    expect(Array.from(out.rms)).toEqual([0.5, 0.5, 0.5])
  })

  test('envelope values are floats in -1..1 whatever the storage', () => {
    const samples = new Float32Array(64).fill(1)
    const out = envelope(1)
    readColumns(pyramidOf(samples), samples, 0, 16, 1, out)
    expect(out.max[0]).toBe(1)
    expect(out.min[0]).toBe(1)
    expect(out.rms[0]).toBe(1)
  })

  test('an empty Channel writes 0/0', () => {
    const samples = new Float32Array(0)
    const pyramid = pyramidOf(samples)
    const out = envelope(2)
    out.min.fill(9)
    out.max.fill(9)
    out.rms.fill(9)
    expect(readColumns(pyramid, samples, 0, 3, 2, out)).toBe(0)
    expect(Array.from(out.rms)).toEqual([0, 0])
    expect(Array.from(out.min)).toEqual([0, 0])
    expect(Array.from(out.max)).toEqual([0, 0])
  })
})

describe('bounded work per frame', () => {
  const COLUMNS = 2000
  const FINEST = 8

  function channel(seconds: number): { samples: Float32Array; pyramid: PeakPyramid } {
    const samples = new Float32Array(seconds * RATE)
    samples[1000] = 0.5
    samples[samples.length >> 1] = -0.5
    samples[samples.length - 10000] = 0.25
    return { samples, pyramid: pyramidOf(samples) }
  }

  for (const seconds of [180, 1800]) {
    test(`${seconds} s Channel: reads are bounded by the canvas width at every zoom`, () => {
      const { samples, pyramid } = channel(seconds)
      const out = envelope(COLUMNS)
      // fit, a middle zoom, 5 s across the canvas (20 samples per column)
      for (const spc of [samples.length / COLUMNS, 100, 20]) {
        const start = samples.length / 3
        expect(readColumns(pyramid, samples, start, spc, COLUMNS, out)).toBeLessThanOrEqual(
          2 * COLUMNS,
        )
      }
      // narrower than the finest bucket: raw samples
      expect(readColumns(pyramid, samples, 5000, 4, COLUMNS, out)).toBeLessThanOrEqual(
        COLUMNS * FINEST,
      )
    })
  }

  test('fit shows the click values of a 30 minute Channel', () => {
    const { samples, pyramid } = channel(1800)
    const out = envelope(COLUMNS)
    readColumns(pyramid, samples, 0, samples.length / COLUMNS, COLUMNS, out)
    expect(out.max[0]).toBeCloseTo(0.5, 4)
    expect(out.min[1000]).toBeCloseTo(-0.5, 4)
    expect(out.max[COLUMNS - 1]).toBeCloseTo(0.25, 4)
  })
})
