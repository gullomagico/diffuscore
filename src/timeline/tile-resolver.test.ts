import { describe, expect, test } from 'vite-plus/test'
import { SPECTROGRAM_ROWS } from './frequency-axis'
import { columnCount, tileColumns, tileKey } from './detail-tile'
import type { DetailLevel, DetailTile, SpectrogramKind, TileKey } from './detail-tile'
import { resolveSpectrogram } from './tile-resolver'

/** A tile held by a hand-made cache. Data is blank: the resolver never reads it. */
function tileAt(
  kind: SpectrogramKind,
  level: DetailLevel,
  index: number,
  sampleCount: number,
  sampleRate: number,
): DetailTile {
  const columns = tileColumns(columnCount(sampleCount, sampleRate, level), index)
  return { kind, level, index, columns, data: new Uint8Array(columns * SPECTROGRAM_ROWS) }
}

function cacheOf(tiles: readonly DetailTile[]) {
  const map = new Map(tiles.map((t) => [tileKey(t), t]))
  return (key: TileKey) => map.get(tileKey(key))
}

// 60 s at 48 kHz: 128-level tiles are 4 s long (15 tiles), 64: 8 s (8 tiles, last 4 s), 32: 16 s (4 tiles).
const RATE = 48000
const SAMPLES = 60 * RATE

function resolve(
  level: 'overview' | DetailLevel,
  start: number,
  end: number,
  tiles: readonly DetailTile[] = [],
  sampleCount = SAMPLES,
  sampleRate = RATE,
) {
  return resolveSpectrogram({
    level,
    startTime: start,
    endTime: end,
    kind: 'Total',
    sampleCount,
    sampleRate,
    lookup: cacheOf(tiles),
  })
}

describe('resolveSpectrogram', () => {
  test('the overview level is one overview stretch over the Source and needs no detail', () => {
    const r = resolve('overview', -5, 100)
    expect(r.detail).toBe('none')
    expect(r.stretches).toEqual([
      { index: -1, startTime: 0, endTime: 60, image: { type: 'overview' } },
    ])
    expect(r.used).toEqual([])
  })

  test('with an empty cache every visible tile is an overview stretch and detail is pending', () => {
    const r = resolve(128, 5, 13)
    expect(r.detail).toBe('pending')
    expect(r.stretches.map((s) => [s.index, s.startTime, s.endTime, s.image.type])).toEqual([
      [1, 4, 8, 'overview'],
      [2, 8, 12, 'overview'],
      [3, 12, 16, 'overview'],
    ])
    expect(r.used).toEqual([])
  })

  test('cached tiles at the level are used where present, the overview elsewhere', () => {
    const t2 = tileAt('Total', 128, 2, SAMPLES, RATE)
    const r = resolve(128, 5, 13, [t2])
    expect(r.stretches.map((s) => s.image)).toEqual([
      { type: 'overview' },
      { type: 'tile', tile: t2 },
      { type: 'overview' },
    ])
    expect(r.detail).toBe('pending')
    expect(r.used).toEqual([t2])
  })

  test('all visible tiles cached means ready', () => {
    const tiles = [1, 2, 3].map((i) => tileAt('Total', 128, i, SAMPLES, RATE))
    const r = resolve(128, 5, 13, tiles)
    expect(r.detail).toBe('ready')
    expect(r.used).toEqual(tiles)
  })

  test('a tile of another kind is not a hit', () => {
    const other = tileAt('L', 128, 1, SAMPLES, RATE)
    expect(resolve(128, 5, 6, [other]).stretches[0]!.image).toEqual({ type: 'overview' })
  })

  test('the nearest lower level stands in, 64 before 32, for a whole tile', () => {
    const t64 = tileAt('Total', 64, 0, SAMPLES, RATE) // 0..8 s covers 128 tiles 0 and 1
    const t32 = tileAt('Total', 32, 0, SAMPLES, RATE) // 0..16 s
    const r = resolve(128, 2, 10, [t64, t32])
    expect(r.stretches.map((s) => s.image)).toEqual([
      { type: 'tile', tile: t64 }, // 128 tile 0 (0..4)
      { type: 'tile', tile: t64 }, // 128 tile 1 (4..8)
      { type: 'tile', tile: t32 }, // 128 tile 2 (8..12): 64 tile 1 is missing
    ])
    expect(r.detail).toBe('pending')
    expect(r.used).toEqual([t64, t32])
  })

  test('a ready tile beats stand-ins, which fill the rest', () => {
    const own = tileAt('Total', 128, 1, SAMPLES, RATE)
    const t64 = tileAt('Total', 64, 0, SAMPLES, RATE)
    const r = resolve(128, 2, 6, [own, t64])
    expect(r.stretches.map((s) => s.image)).toEqual([
      { type: 'tile', tile: t64 },
      { type: 'tile', tile: own },
    ])
  })

  test('a finer cached tile is never a stand-in', () => {
    const t128 = tileAt('Total', 128, 0, SAMPLES, RATE)
    const r = resolve(64, 0, 8, [t128])
    expect(r.stretches.map((s) => s.image)).toEqual([{ type: 'overview' }])
    expect(r.used).toEqual([])
  })

  test('the partial last tile ends at the Source duration; no stretch lies outside it', () => {
    // 60 s at 32: 1920 columns, tiles of 16 s: the last one is 48..60 s.
    const r = resolve(32, 40, 100)
    expect(r.stretches.map((s) => [s.index, s.startTime, s.endTime])).toEqual([
      [2, 32, 48],
      [3, 48, 60],
    ])
    expect(resolve(32, -10, 0).stretches).toEqual([])
    expect(resolve(32, 70, 80).stretches).toEqual([])
    expect(resolve(32, 70, 80).detail).toBe('ready')
  })

  test('uses the column count of the sample count, not duration x rate (8 kHz Source)', () => {
    // 8 kHz, 600001 samples = 75.000125 s. At 128 columns/s: 9600.016 -> 9601 columns, 19 tiles; the last (72 s on) has 385.
    const samples = 600001
    const last = tileAt('Total', 128, 18, samples, 8000)
    expect(last.columns).toBe(385)
    const r = resolve(128, 74, 80, [last], samples, 8000)
    expect(r.stretches.map((s) => [s.index, s.image.type])).toEqual([[18, 'tile']])
    expect(r.stretches[0]!.startTime).toBe(72)
    expect(r.stretches[0]!.endTime).toBeCloseTo(75.000125, 9)
    expect(r.detail).toBe('ready')
  })
})
