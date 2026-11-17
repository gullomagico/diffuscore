import { describe, expect, test } from 'vite-plus/test'
import { chooseLevel, devicePixelsPerSecond, wantedTiles } from './detail-level'

describe('chooseLevel', () => {
  test('the overview up to 10 device pixels per second', () => {
    expect(chooseLevel(0.5)).toBe('overview')
    expect(chooseLevel(10)).toBe('overview')
  })

  test('32 columns per second above 10 and up to 32', () => {
    expect(chooseLevel(10.01)).toBe(32)
    expect(chooseLevel(32)).toBe(32)
  })

  test('64 columns per second above 32 and up to 64', () => {
    expect(chooseLevel(32.01)).toBe(64)
    expect(chooseLevel(64)).toBe(64)
  })

  test('128 columns per second above 64, however far', () => {
    expect(chooseLevel(64.01)).toBe(128)
    expect(chooseLevel(128)).toBe(128)
    expect(chooseLevel(5000)).toBe(128)
  })

  test('the overview for input that is not a usable zoom', () => {
    expect(chooseLevel(0)).toBe('overview')
    expect(chooseLevel(-20)).toBe('overview')
    expect(chooseLevel(Number.NaN)).toBe('overview')
    expect(chooseLevel(Number.POSITIVE_INFINITY)).toBe('overview')
  })

  test('a device pixel ratio of 2 doubles the device pixels per second', () => {
    expect(devicePixelsPerSecond(20, 2)).toBe(40)
    expect(chooseLevel(devicePixelsPerSecond(20, 2))).toBe(64)
    expect(chooseLevel(devicePixelsPerSecond(20, 1))).toBe(32)
  })
})

// 150 s at 128 columns per second: 19200 columns, 38 tiles of 4 s, the last of 2 s.
describe('wantedTiles', () => {
  const columns = 19200
  const indexes = (tiles: { index: number }[]) => tiles.map((t) => t.index)

  test('nothing for the overview', () => {
    expect(wantedTiles(0, 10, 'overview', columns)).toEqual([])
  })

  test('the visible tiles, then a neighbour on each side', () => {
    const wanted = wantedTiles(13, 27, 128, columns)
    expect(
      wanted
        .filter((t) => t.visible)
        .map((t) => t.index)
        .sort((a, b) => a - b),
    ).toEqual([3, 4, 5, 6])
    expect(
      wanted
        .filter((t) => !t.visible)
        .map((t) => t.index)
        .sort((a, b) => a - b),
    ).toEqual([2, 7])
    expect(wanted.every((t) => t.level === 128)).toBe(true)
  })

  test('visible tiles are ordered nearest the range centre first, ties to the earlier tile', () => {
    // Centre 20 s; tile centres 14, 18, 22, 26 s.
    const wanted = wantedTiles(13, 27, 128, columns)
    expect(indexes(wanted.slice(0, 4))).toEqual([4, 5, 3, 6])
  })

  test('neighbours follow the visible tiles, nearest the centre first', () => {
    // Range [13, 24), centre 18.5 s: tiles 3..5; neighbours 2 (centre 10 s) and 6 (centre 26 s).
    const wanted = wantedTiles(13, 24, 128, columns)
    expect(wanted.map((t) => [t.index, t.visible])).toEqual([
      [4, true],
      [5, true],
      [3, true],
      [6, false],
      [2, false],
    ])
  })

  test('no neighbour before tile 0', () => {
    const wanted = wantedTiles(0, 3, 128, columns)
    expect(wanted.map((t) => [t.index, t.visible])).toEqual([
      [0, true],
      [1, false],
    ])
  })

  test('no neighbour after the last tile', () => {
    const wanted = wantedTiles(148, 150, 128, columns)
    expect(wanted.map((t) => [t.index, t.visible])).toEqual([
      [37, true],
      [36, false],
    ])
  })

  test('a range extending past either end is clipped', () => {
    const wanted = wantedTiles(-10, 400, 128, columns)
    expect(wanted).toHaveLength(38)
    expect(wanted.every((t) => t.visible)).toBe(true)
  })

  test('a range beyond the Source wants nothing', () => {
    expect(wantedTiles(200, 300, 128, columns)).toEqual([])
  })

  test('a 1.5 s Source at 128 is a single partial tile with no neighbours', () => {
    expect(wantedTiles(0, 5, 128, 192)).toEqual([{ level: 128, index: 0, visible: true }])
  })

  test('uses the level it is given', () => {
    // 32 columns per second: a tile is 16 s.
    const wanted = wantedTiles(20, 30, 32, 4800)
    expect(wanted.map((t) => [t.level, t.index, t.visible])).toEqual([
      [32, 1, true],
      [32, 2, false],
      [32, 0, false],
    ])
  })
})
