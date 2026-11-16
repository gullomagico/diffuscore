import { describe, expect, test } from 'vite-plus/test'
import { buildPeakPyramid, pickPeakLevel, readColumns } from './peaks'
import type { ColumnEnvelope, PeakPyramid } from './peaks'

const RATE = 8000

function envelope(columns: number): ColumnEnvelope {
  return { min: new Float32Array(columns), max: new Float32Array(columns) }
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
    const { levels } = buildPeakPyramid(samples, RATE)
    // 8-sample buckets alternate between [0, 1] and [-1, 0]
    expect(levels[0].min[0]).toBeCloseTo(0, 5)
    expect(levels[0].max[0]).toBeCloseTo(1, 5)
    expect(levels[0].min[1]).toBeCloseTo(-1, 5)
    expect(levels[0].max[1]).toBeCloseTo(0, 5)
    // 16-sample buckets cover a whole period
    expect(levels[1].samplesPerBucket).toBe(16)
    for (let b = 0; b < 4; b++) {
      expect(levels[1].min[b]).toBeCloseTo(-1, 5)
      expect(levels[1].max[b]).toBeCloseTo(1, 5)
    }
  })

  test('a slow ramp has literal per-bucket ranges', () => {
    // 80 samples = 10 buckets of 8, value = i / 80
    const { levels } = buildPeakPyramid(ramp(80, 1 / 80), RATE)
    expect(levels[0].min).toHaveLength(10)
    expect(levels[0].min[3]).toBeCloseTo(0.3, 6)
    expect(levels[0].max[3]).toBeCloseTo(31 / 80, 6)
    expect(levels[1].min[0]).toBeCloseTo(0, 6)
    expect(levels[1].max[0]).toBeCloseTo(15 / 80, 6)
    // odd count: 10 -> 5 -> 3, last coarse bucket is the last fine bucket
    expect(levels[2].min).toHaveLength(3)
    expect(levels[2].min[2]).toBeCloseTo(0.8, 6)
    expect(levels[2].max[2]).toBeCloseTo(79 / 80, 6)
  })

  test('a single-sample click only shows in the bucket containing it, at every level', () => {
    const samples = new Float32Array(1000)
    samples[517] = 0.8
    const { levels } = buildPeakPyramid(samples, RATE)
    // 517 is in finest bucket 64 (8 samples each)
    expect(levels[0].max[64]).toBeCloseTo(0.8, 6)
    expect(levels[0].max[63]).toBe(0)
    expect(levels[0].max[65]).toBe(0)
    expect(levels[0].min[64]).toBe(0)
    expect(levels[1].max[32]).toBeCloseTo(0.8, 6)
    expect(levels[1].max[31]).toBe(0)
    expect(levels[3].max[8]).toBeCloseTo(0.8, 6)
    expect(levels[3].max[7]).toBe(0)
    expect(levels[levels.length - 1].max[0]).toBeCloseTo(0.8, 6)
  })

  test('DC gives min = max = the DC value everywhere', () => {
    const { levels } = buildPeakPyramid(new Float32Array(100).fill(0.25), RATE)
    expect(levels[0].min).toHaveLength(13)
    for (const level of levels) {
      expect(Array.from(level.min).every((v) => v === 0.25)).toBe(true)
      expect(Array.from(level.max).every((v) => v === 0.25)).toBe(true)
    }
  })

  test('a length that is not a multiple of the bucket size has a partial last bucket', () => {
    // 21 samples -> buckets of 8, 8 and 5; value = (i + 1) / 100
    const samples = ramp(21, 0.01).map((v) => v + 0.01)
    const { levels } = buildPeakPyramid(samples, RATE)
    expect(levels[0].min).toHaveLength(3)
    expect(levels[0].min[2]).toBeCloseTo(0.17, 6)
    expect(levels[0].max[2]).toBeCloseTo(0.21, 6)
    expect(levels[1].min).toHaveLength(2)
    expect(levels[1].max[1]).toBeCloseTo(0.21, 6)
  })

  test('each level is the 2x reduction of the one below, including an odd bucket count', () => {
    let seed = 12345
    const samples = new Float32Array(8 * 13 + 3) // 14 buckets
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      samples[i] = (seed / 0xffffffff) * 2 - 1
    }
    const { levels } = buildPeakPyramid(samples, RATE)
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
    const pyramid = buildPeakPyramid(new Float32Array(1000), RATE)
    expect(pyramid.levels.at(-1)?.min).toHaveLength(1)
    expect(pyramid.length).toBe(1000)
    expect(buildPeakPyramid(new Float32Array(5), RATE).levels).toHaveLength(1)
  })

  test('an empty Channel gives no levels and does not throw', () => {
    expect(buildPeakPyramid(new Float32Array(0), RATE).levels).toEqual([])
  })

  test('works on a view of a SharedArrayBuffer', () => {
    const samples = new Float32Array(new SharedArrayBuffer(4 * 16))
    samples[9] = -0.5
    const { levels } = buildPeakPyramid(samples, RATE)
    expect(levels[0].min[1]).toBe(-0.5)
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

describe('pickPeakLevel', () => {
  const pyramid = buildPeakPyramid(new Float32Array(512), RATE) // buckets 8, 16, ... 512

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
    const pyramid = buildPeakPyramid(samples, RATE)
    const out = envelope(4)
    // 12 samples per column -> 8-sample level; [0,12) reads buckets 0..0, [12,24) reads 1..2
    const reads = readColumns(pyramid, samples, 0, 12, 4, out)
    expect(out.min[0]).toBeCloseTo(0, 6)
    expect(out.max[0]).toBeCloseTo(7 / 512, 6)
    expect(out.min[1]).toBeCloseTo(8 / 512, 6)
    expect(out.max[1]).toBeCloseTo(23 / 512, 6)
    expect(out.min[2]).toBeCloseTo(24 / 512, 6)
    expect(out.max[2]).toBeCloseTo(31 / 512, 6)
    expect(reads).toBe(1 + 2 + 1 + 2)
  })

  test('raw path reads the samples array, not the pyramid', () => {
    const pyramid = buildPeakPyramid(new Float32Array(512), RATE) // all zeros
    const samples = ramp(512, 1)
    const out = envelope(2)
    const reads = readColumns(pyramid, samples, 10, 4, 2, out) // [10,14) and [14,18)
    expect(Array.from(out.min)).toEqual([10, 14])
    expect(Array.from(out.max)).toEqual([13, 17])
    expect(reads).toBe(8)
  })

  test('raw path: columns narrower than one sample repeat the sample they fall in, never NaN', () => {
    const pyramid = buildPeakPyramid(new Float32Array(512), RATE)
    const samples = ramp(512, 1)
    const out = envelope(5)
    readColumns(pyramid, samples, 10, 0.25, 5, out) // starts 10, 10.25, 10.5, 10.75, 11
    expect(Array.from(out.min)).toEqual([10, 10, 10, 10, 11])
    expect(Array.from(out.max)).toEqual([10, 10, 10, 10, 11])
  })

  test('clamps at the end: a partial column reads what exists, later columns repeat the last bucket', () => {
    const samples = ramp(512, 1 / 512)
    const pyramid = buildPeakPyramid(samples, RATE)
    const out = envelope(3)
    readColumns(pyramid, samples, 504, 8, 3, out) // bucket 63, then past the end twice
    for (let i = 0; i < 3; i++) {
      expect(out.min[i]).toBeCloseTo(504 / 512, 6)
      expect(out.max[i]).toBeCloseTo(511 / 512, 6)
    }
    const wide = envelope(1)
    readColumns(pyramid, samples, 504, 16, 1, wide) // [504, 520) -> bucket 31 of the 16-sample level
    expect(wide.min[0]).toBeCloseTo(496 / 512, 6)
    expect(wide.max[0]).toBeCloseTo(511 / 512, 6)
  })

  test('a column reaching the end includes the partial last bucket', () => {
    // 20 samples -> buckets of 8, 8 and 4; the click is in the partial one
    const samples = new Float32Array(20)
    samples[19] = 0.75
    const pyramid = buildPeakPyramid(samples, RATE)
    const out = envelope(2)
    readColumns(pyramid, samples, 0, 10, 2, out) // fit: [0,10) and [10,20)
    expect(Array.from(out.max)).toEqual([0, 0.75])
  })

  test('clamps at the end on the raw path and before the start', () => {
    const samples = ramp(512, 1)
    const pyramid = buildPeakPyramid(samples, RATE)
    const out = envelope(3)
    readColumns(pyramid, samples, 510, 1, 3, out) // 510, 511, past the end
    expect(Array.from(out.min)).toEqual([510, 511, 511])
    const before = envelope(2)
    readColumns(pyramid, samples, -2, 1, 2, before)
    expect(Array.from(before.max)).toEqual([0, 0])
    const levelBefore = envelope(1)
    readColumns(pyramid, samples, -16, 8, 1, levelBefore)
    expect(levelBefore.min[0]).toBe(0)
    expect(levelBefore.max[0]).toBe(7)
  })

  test('an empty Channel writes 0/0', () => {
    const samples = new Float32Array(0)
    const pyramid = buildPeakPyramid(samples, RATE)
    const out = envelope(2)
    out.min.fill(9)
    out.max.fill(9)
    expect(readColumns(pyramid, samples, 0, 3, 2, out)).toBe(0)
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
    return { samples, pyramid: buildPeakPyramid(samples, RATE) }
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
    expect(out.max[0]).toBeCloseTo(0.5, 6)
    expect(out.min[1000]).toBeCloseTo(-0.5, 6)
    expect(out.max[COLUMNS - 1]).toBeCloseTo(0.25, 6)
  })
})
