import { describe, expect, test } from 'vite-plus/test'
import { DETAIL_LEVELS, TILE_COLUMNS, columnCount, tileColumns } from './detail-tile'
import type { DetailTile, SpectrogramKind } from './detail-tile'
import { buildDetailTiles } from './spectrogram-tile'
import { SPECTROGRAM_ROWS, buildSourceSpectrograms } from './spectrogram'

const RATES = [48000, 8000]

function sine(length: number, rate: number, hz: number, amplitude = 1): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate)
  return out
}

function negate(samples: Float32Array): Float32Array {
  return Float32Array.from(samples, (v) => -v)
}

function tileOf(tiles: DetailTile[], kind: SpectrogramKind): DetailTile {
  const tile = tiles.find((t) => t.kind === kind)
  if (!tile) throw new Error(`no ${kind} tile`)
  return tile
}

function column(tile: DetailTile, c: number): Uint8Array {
  return tile.data.subarray(c * SPECTROGRAM_ROWS, (c + 1) * SPECTROGRAM_ROWS)
}

function argmax(values: Uint8Array): number {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i
  return best
}

/** The dB a quantised value stands for (0 = -100 dB, 255 = 0 dB, linear in between). */
function dbOf(value: number): number {
  return (value / 255) * 100 - 100
}

/** A Channel that records which sample indices are read, through the public Float32Array interface. */
function spied(samples: Float32Array) {
  const reads = { count: 0, min: Infinity, max: -Infinity }
  const proxy = new Proxy(samples, {
    get(target, prop) {
      if (typeof prop === 'string' && /^-?\d+$/.test(prop)) {
        const i = Number(prop)
        reads.count++
        reads.min = Math.min(reads.min, i)
        reads.max = Math.max(reads.max, i)
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { channel: proxy, reads }
}

function click(length: number, atSample: number): Float32Array {
  const out = new Float32Array(length)
  out.fill(1, atSample, atSample + 16)
  return out
}

describe.each(RATES)('buildDetailTiles at %i Hz', (rate) => {
  test.each(DETAIL_LEVELS)('a sine lands in the overview row at level %i', (level) => {
    const hz = 1000
    const samples = sine(rate * 3, rate, hz)
    const overview = buildSourceSpectrograms([samples], rate).channels[0]!.levels[0]!
    const overviewRow = argmax(overview.data.subarray(10 * SPECTROGRAM_ROWS, 11 * SPECTROGRAM_ROWS))

    const [tile] = buildDetailTiles([samples], rate, level, 0, ['Mono'])

    // Time 1.0 s to 1.1 s: overview column 10, detail columns level .. level + 2.
    expect(argmax(column(tile!, level + 1))).toBe(overviewRow)
  })

  test.each(DETAIL_LEVELS)('a full-scale sine reads 0 dBFS within 1.5 dB at level %i', (level) => {
    const [tile] = buildDetailTiles([sine(rate * 3, rate, 1000)], rate, level, 0, ['Mono'])
    const peak = Math.max(...column(tile!, level + 1))
    expect(dbOf(peak)).toBeGreaterThan(-1.5)
    expect(dbOf(peak)).toBeLessThanOrEqual(0.5)
  })

  test.each(DETAIL_LEVELS)(
    'a click appears in its column, in tile 0 and a later tile, at level %i',
    (level) => {
      const seconds = 17
      for (const time of [0.3, 16.5]) {
        const samples = click(rate * seconds, Math.round(time * rate))
        const col = Math.floor(time * level)
        const index = Math.floor(col / TILE_COLUMNS)
        const [tile] = buildDetailTiles([samples], rate, level, index, ['Mono'])
        const inTile = col - index * TILE_COLUMNS
        expect(Math.max(...column(tile!, inTile))).toBeGreaterThan(100)
      }
      // The later click is in a later tile at every level but the click at 0.3 s is tile 0.
      expect(Math.floor(16.5 * level)).toBeGreaterThanOrEqual(TILE_COLUMNS)
    },
  )

  test('Total of L = -R keeps the full energy of the single Channel', () => {
    const left = sine(rate * 2, rate, 1000)
    const tiles = buildDetailTiles([left, negate(left)], rate, 32, 0, ['L', 'Total'])
    const peakL = Math.max(...column(tileOf(tiles, 'L'), 32))
    const peakTotal = Math.max(...column(tileOf(tiles, 'Total'), 32))
    expect(dbOf(peakTotal)).toBeGreaterThan(-1.5)
    expect(Math.abs(dbOf(peakTotal) - dbOf(peakL))).toBeLessThan(0.5)
  })

  test('R reads the second Channel', () => {
    const tiles = buildDetailTiles(
      [sine(rate * 2, rate, 500), sine(rate * 2, rate, 2000)],
      rate,
      32,
      0,
      ['L', 'R'],
    )
    expect(argmax(column(tileOf(tiles, 'R'), 32))).toBeGreaterThan(
      argmax(column(tileOf(tiles, 'L'), 32)),
    )
  })

  test('a request returns only the requested kinds, in request order', () => {
    const stereo = [sine(rate, rate, 1000), sine(rate, rate, 1000)]
    expect(buildDetailTiles(stereo, rate, 32, 0, ['R']).map((t) => t.kind)).toEqual(['R'])
    expect(buildDetailTiles(stereo, rate, 32, 0, ['Total', 'L']).map((t) => t.kind)).toEqual([
      'Total',
      'L',
    ])
    expect(buildDetailTiles([stereo[0]!], rate, 32, 0, ['Mono']).map((t) => t.kind)).toEqual([
      'Mono',
    ])
  })

  test('only the Channels a kind needs are read', () => {
    const left = spied(sine(rate, rate, 1000))
    const right = spied(sine(rate, rate, 1000))
    buildDetailTiles([left.channel, right.channel], rate, 32, 0, ['L'])
    expect(left.reads.count).toBeGreaterThan(0)
    expect(right.reads.count).toBe(0)

    const left2 = spied(sine(rate, rate, 1000))
    const right2 = spied(sine(rate, rate, 1000))
    buildDetailTiles([left2.channel, right2.channel], rate, 32, 0, ['R'])
    expect(left2.reads.count).toBe(0)
    expect(right2.reads.count).toBeGreaterThan(0)

    const left3 = spied(sine(rate, rate, 1000))
    const right3 = spied(sine(rate, rate, 1000))
    buildDetailTiles([left3.channel, right3.channel], rate, 32, 0, ['Total'])
    expect(left3.reads.count).toBeGreaterThan(0)
    expect(right3.reads.count).toBeGreaterThan(0)
  })

  test('the partial last tile holds tileColumns columns', () => {
    // 1.5 s at 128: 192 columns, one partial tile.
    const [only] = buildDetailTiles([sine(rate * 1.5, rate, 1000)], rate, 128, 0, ['Mono'])
    expect(only!.columns).toBe(192)
    expect(only!.data.length).toBe(192 * SPECTROGRAM_ROWS)

    // 5 s at 128: 640 columns, a full tile then a partial one.
    const samples = sine(rate * 5, rate, 1000)
    const levelColumns = columnCount(samples.length, rate, 128)
    const [first] = buildDetailTiles([samples], rate, 128, 0, ['Mono'])
    const [last] = buildDetailTiles([samples], rate, 128, 1, ['Mono'])
    expect(first!.columns).toBe(TILE_COLUMNS)
    expect(last!.columns).toBe(tileColumns(levelColumns, 1))
    expect(last!.columns).toBe(128)
    expect(last!.data.length).toBe(128 * SPECTROGRAM_ROWS)
    expect(last).toMatchObject({ kind: 'Mono', level: 128, index: 1 })
  })

  test('the Source is zero padded beyond both ends, never read outside', () => {
    // The first column's window starts before the Source; the last column's ends after it.
    const spy = spied(sine(Math.round(rate * 1.5), rate, 1000))
    const [tile] = buildDetailTiles([spy.channel], rate, 128, 0, ['Mono'])
    expect(spy.reads.min).toBeGreaterThanOrEqual(0)
    expect(spy.reads.max).toBeLessThan(Math.round(rate * 1.5))
    expect(Math.max(...column(tile!, 0))).toBeGreaterThan(100)
    expect(Math.max(...column(tile!, 191))).toBeGreaterThan(100)
  })

  test('a Source shorter than one window still gives a tile', () => {
    const [tile] = buildDetailTiles([sine(100, rate, 1000)], rate, 128, 0, ['Mono'])
    expect(tile!.columns).toBe(columnCount(100, rate, 128))
    expect(Math.max(...tile!.data)).toBeGreaterThan(0)
  })

  test('invalid requests throw', () => {
    const mono = [sine(rate, rate, 1000)]
    const stereo = [mono[0]!, mono[0]!]
    expect(() => buildDetailTiles(mono, rate, 32, 0, ['R'])).toThrow()
    expect(() => buildDetailTiles(mono, rate, 32, 0, ['Total'])).toThrow()
    expect(() => buildDetailTiles(stereo, rate, 32, 0, ['Mono'])).toThrow()
    expect(() => buildDetailTiles(mono, rate, 32, 1, ['Mono'])).toThrow()
    expect(() => buildDetailTiles(mono, rate, 32, -1, ['Mono'])).toThrow()
  })
})
