import { describe, expect, test } from 'vite-plus/test'
import {
  CEILING_DB,
  FLOOR_DB,
  MAX_FREQUENCY_HZ,
  MIN_FREQUENCY_HZ,
  OVERVIEW_COLUMNS_PER_SECOND,
  SPECTROGRAM_ROWS,
  buildColumnMaxLevels,
  buildSourceSpectrograms,
  createRowMap,
  mapPowerToRows,
  quantizeDb,
  stftParameters,
} from './spectrogram'
import { rowBandHz } from './frequency-axis'
import type { SpectrogramLevel, SpectrogramOverview } from './spectrogram'

const RATES = [48000, 8000]

function sine(
  length: number,
  rate: number,
  hz: number,
  amplitude = 1,
  phase = 0,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate + phase)
  return out
}

function negate(samples: Float32Array): Float32Array<ArrayBuffer> {
  return Float32Array.from(samples, (v) => -v)
}

function shared(samples: Float32Array): Float32Array {
  const out = new Float32Array(new SharedArrayBuffer(samples.length * 4))
  out.set(samples)
  return out
}

function column(level: SpectrogramLevel, c: number): Uint8Array {
  return level.data.subarray(c * SPECTROGRAM_ROWS, (c + 1) * SPECTROGRAM_ROWS)
}

function argmax(values: Uint8Array): number {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i
  return best
}

function expectedRow(hz: number): number {
  return Math.floor(
    (SPECTROGRAM_ROWS * Math.log(hz / MIN_FREQUENCY_HZ)) /
      Math.log(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ),
  )
}

function rowCentreHz(row: number): number {
  const [lo, hi] = rowBandHz(row)
  return Math.sqrt(lo * hi)
}

/** The step of one quantisation unit, in dB. */
const DB_PER_STEP = (CEILING_DB - FLOOR_DB) / 255

describe('stftParameters', () => {
  test('48 kHz: 4096 / 2048', () => {
    expect(stftParameters(48000)).toEqual({ size: 4096, hop: 2048 })
  })
  test('8 kHz: 1024 / 512', () => {
    expect(stftParameters(8000)).toEqual({ size: 1024, hop: 512 })
  })
})

describe('quantizeDb', () => {
  test('silence and sub-floor power give 0', () => {
    expect(quantizeDb(0)).toBe(0)
    expect(quantizeDb(1e-12)).toBe(0)
    expect(quantizeDb(1e-10)).toBe(0) // exactly -100 dB
  })
  test('full scale and above give 255', () => {
    expect(quantizeDb(1)).toBe(255)
    expect(quantizeDb(4)).toBe(255)
  })
  test('is linear in dB between the bounds', () => {
    expect(quantizeDb(1e-5)).toBe(128) // -50 dB: 127.5 rounds up
    expect(quantizeDb(10 ** -0.1)).toBe(Math.round((99 / 100) * 255)) // -1 dB
  })
  test('NaN is the floor', () => {
    expect(quantizeDb(NaN)).toBe(0)
  })
})

describe('mapPowerToRows', () => {
  test('a row containing bin centres takes the maximum of them', () => {
    const rate = 48000
    const { size } = stftParameters(rate)
    const map = createRowMap(rate, size)
    const power = new Float32Array(size / 2 + 1)
    const row = expectedRow(10000)
    const [lo, hi] = rowBandHz(row)
    const binHz = rate / size
    const inside = Math.ceil(lo / binHz)
    expect(inside * binHz).toBeLessThan(hi)
    power[inside] = 0.5
    const out = new Float32Array(SPECTROGRAM_ROWS)
    mapPowerToRows(map, power, out)
    expect(out[row]).toBe(0.5)
  })

  test('a row narrower than a bin interpolates linearly at its geometric centre', () => {
    const rate = 48000
    const { size } = stftParameters(rate)
    const map = createRowMap(rate, size)
    const binHz = rate / size
    // Find a narrow row (no bin centre inside) and put power on its two neighbours
    const row = expectedRow(100)
    const centre = rowCentreHz(row)
    const k = Math.floor(centre / binHz)
    const power = new Float32Array(size / 2 + 1)
    power[k] = 1
    power[k + 1] = 3
    const out = new Float32Array(SPECTROGRAM_ROWS)
    mapPowerToRows(map, power, out)
    const t = centre / binHz - k
    expect(out[row]).toBeCloseTo(1 + 2 * t, 5)
  })

  test('rows above Nyquist stay at the floor even with power everywhere', () => {
    const rate = 8000
    const { size } = stftParameters(rate)
    const map = createRowMap(rate, size)
    const out = new Float32Array(SPECTROGRAM_ROWS).fill(7)
    mapPowerToRows(map, new Float32Array(size / 2 + 1).fill(1), out)
    for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
      if (rowBandHz(r)[0] > 4000) expect(out[r]).toBe(0)
    }
    expect(out[expectedRow(3000)]).toBe(1)
  })
})

describe.each(RATES)('buildSourceSpectrograms at %i Hz', (rate) => {
  const seconds = 3
  const length = seconds * rate
  const crossover = rate === 48000 ? 840 : 560
  const above = rate === 48000 ? [1000, 10000] : [1000, 3000]
  const below = rate === 48000 ? [100, 300] : [100, 250]

  function overviewOf(samples: Float32Array): SpectrogramOverview {
    return buildSourceSpectrograms([samples], rate).channels[0]!
  }

  test.each(above)('a %i Hz sine peaks in the expected row (+-1)', (hz) => {
    const level = overviewOf(sine(length, rate, hz)).levels[0]!
    const peak = argmax(column(level, 15))
    expect(Math.abs(peak - expectedRow(hz))).toBeLessThanOrEqual(1)
  })

  test.each(below)('a %i Hz sine (below the crossover %i) peaks within half a bin', (hz) => {
    expect(hz).toBeLessThan(crossover)
    const level = overviewOf(sine(length, rate, hz)).levels[0]!
    const peak = argmax(column(level, 15))
    const { size } = stftParameters(rate)
    expect(Math.abs(rowCentreHz(peak) - hz)).toBeLessThanOrEqual(rate / size / 2)
  })

  test('every row whose band starts above 4 kHz is the floor (8 kHz only)', () => {
    if (rate !== 8000) return
    const noise = new Float32Array(length)
    let seed = 1
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      noise[i] = (seed / 2 ** 32) * 2 - 1
    }
    const level = overviewOf(noise).levels[0]!
    let checked = 0
    for (let c = 0; c < level.columns; c++) {
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
        if (rowBandHz(r)[0] > 4000) {
          expect(column(level, c)[r]).toBe(0)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  test('a full-scale sine reads within 1.5 dB of 0 dBFS', () => {
    const level = overviewOf(sine(length, rate, 1234)).levels[0]!
    const value = column(level, 15)[argmax(column(level, 15))]!
    expect(Math.abs(FLOOR_DB + value * DB_PER_STEP)).toBeLessThanOrEqual(1.5)
  })

  test('column count is ceil(duration * 10), column rate 10 per second', () => {
    const level = overviewOf(new Float32Array(Math.round(2.34 * rate))).levels[0]!
    expect(level.columns).toBe(24)
    expect(level.columnsPerSecond).toBe(OVERVIEW_COLUMNS_PER_SECOND)
    expect(level.data.length).toBe(24 * SPECTROGRAM_ROWS)
  })

  test('a Source shorter than one window still yields non-floor columns', () => {
    const { size } = stftParameters(rate)
    const level = overviewOf(sine(size / 4, rate, 1000)).levels[0]!
    expect(level.columns).toBe(Math.ceil(((size / 4) * 10) / rate))
    for (let c = 0; c < level.columns; c++) expect(Math.max(...column(level, c))).toBeGreaterThan(0)
  })

  test('a single click in a long silent signal stays clearly above the floor in its column', () => {
    const long = new Float32Array(60 * rate)
    const at = Math.round(30.03 * rate)
    long[at] = 1
    long[at + 1] = -1
    const level = overviewOf(long).levels[0]!
    expect(level.columns).toBe(600)
    expect(Math.max(...column(level, 300))).toBeGreaterThan(80)
    expect(Math.max(...column(level, 290))).toBe(0)
  })

  test('Total: L = -R gives the level of a single Channel', () => {
    const left = sine(length, rate, 1234)
    const { channels, total } = buildSourceSpectrograms([left, negate(left)], rate)
    const a = column(channels[0]!.levels[0]!, 15)
    const t = column(total!.levels[0]!, 15)
    expect(Math.abs(Math.max(...t) - Math.max(...a))).toBeLessThanOrEqual(1)
  })

  test('Total: L = R gives the level of a single Channel', () => {
    const left = sine(length, rate, 1234)
    const { channels, total } = buildSourceSpectrograms([left, left], rate)
    const a = column(channels[0]!.levels[0]!, 15)
    const t = column(total!.levels[0]!, 15)
    expect(Math.abs(Math.max(...t) - Math.max(...a))).toBeLessThanOrEqual(1)
  })

  test('Total: a tone in L only is about -3 dB', () => {
    const left = sine(length, rate, 1234)
    const { channels, total } = buildSourceSpectrograms([left, new Float32Array(length)], rate)
    const l = Math.max(...column(channels[0]!.levels[0]!, 15))
    const t = Math.max(...column(total!.levels[0]!, 15))
    expect(Math.abs((l - t) * DB_PER_STEP - 3.01)).toBeLessThanOrEqual(0.5)
    expect(Math.max(...column(channels[1]!.levels[0]!, 15))).toBe(0)
  })

  test('Mono gives one overview and no Total', () => {
    const result = buildSourceSpectrograms([sine(length, rate, 1000)], rate)
    expect(result.channels).toHaveLength(1)
    expect(result.total).toBeNull()
  })

  test('accepts SharedArrayBuffer-backed channels with the same result', () => {
    const samples = sine(length, rate, 1000)
    const a = overviewOf(samples).levels[0]!.data
    const b = overviewOf(shared(samples)).levels[0]!.data
    expect(b).toEqual(a)
  })

  test('empty Channels do not throw and give no columns', () => {
    const result = buildSourceSpectrograms([new Float32Array(0), new Float32Array(0)], rate)
    expect(result.channels[0]!.levels[0]!.columns).toBe(0)
    expect(result.total!.levels[0]!.columns).toBe(0)
  })

  test('progress is monotonic, throttled and ends at exactly 1', () => {
    const calls: number[] = []
    buildSourceSpectrograms([sine(20 * rate, rate, 440), sine(20 * rate, rate, 880)], rate, (f) =>
      calls.push(f),
    )
    expect(calls.length).toBeGreaterThan(1)
    expect(calls.length).toBeLessThanOrEqual(110)
    for (let i = 1; i < calls.length; i++) expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]!)
    expect(calls.at(-1)).toBe(1)
    expect(calls.filter((f) => f === 1)).toHaveLength(1)
  })
})

describe('buildColumnMaxLevels', () => {
  function levelOf(values: number[]): SpectrogramLevel {
    const data = new Uint8Array(values.length * SPECTROGRAM_ROWS)
    values.forEach((v, c) => {
      data[c * SPECTROGRAM_ROWS] = v
      data[c * SPECTROGRAM_ROWS + 7] = 255 - v
    })
    return { columns: values.length, columnsPerSecond: 10, data }
  }

  test('each level is the 2x column maximum of the previous, down to 1 column', () => {
    const levels = buildColumnMaxLevels(levelOf([1, 5, 3, 2, 9]))
    expect(levels.map((l) => l.columns)).toEqual([5, 3, 2, 1])
    expect(levels.map((l) => l.columnsPerSecond)).toEqual([10, 5, 2.5, 1.25])
    expect(Array.from({ length: 3 }, (_, c) => levels[1]!.data[c * SPECTROGRAM_ROWS])).toEqual([
      5, 3, 9,
    ])
    // other rows are pooled independently: row 7 holds 255 - v
    expect(Array.from({ length: 3 }, (_, c) => levels[1]!.data[c * SPECTROGRAM_ROWS + 7])).toEqual([
      254, 253, 246,
    ])
    expect(levels[3]!.data[0]).toBe(9)
    expect(levels[3]!.data[7]).toBe(254)
  })

  test('level 0 is the input itself; a single column gives one level', () => {
    const one = levelOf([4])
    expect(buildColumnMaxLevels(one)).toEqual([one])
    const lv = levelOf([1, 2])
    expect(buildColumnMaxLevels(lv)[0]).toBe(lv)
  })

  test('buildSourceSpectrograms returns the levels, finishing at 1 column', () => {
    const rate = 8000
    const { channels } = buildSourceSpectrograms([new Float32Array(rate * 2).fill(0.1)], rate)
    const levels = channels[0]!.levels
    expect(levels[0]!.columns).toBe(20)
    expect(levels.at(-1)!.columns).toBe(1)
  })
})
