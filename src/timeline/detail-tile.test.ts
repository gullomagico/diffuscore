import { describe, expect, test } from 'vite-plus/test'
import { columnCount, tileCount, tileColumns, visibleTileRange } from './detail-tile'

// 150 s at 8 kHz = 1_200_000 samples; at 48 kHz = 7_200_000. Level 128 -> 19200 columns = 37.5 tiles.
describe('columnCount', () => {
  test('is ceil(duration x R) at 8 kHz', () => {
    expect(columnCount(150 * 8000, 8000, 128)).toBe(19200)
    expect(columnCount(150 * 8000, 8000, 32)).toBe(4800)
    expect(columnCount(12000, 8000, 128)).toBe(192) // 1.5 s
  })

  test('is ceil(duration x R) at 48 kHz', () => {
    expect(columnCount(150 * 48000, 48000, 64)).toBe(9600)
    expect(columnCount(72000, 48000, 128)).toBe(192) // 1.5 s
  })

  test('rounds a fractional column up', () => {
    expect(columnCount(48001, 48000, 32)).toBe(33)
    expect(columnCount(8001, 8000, 128)).toBe(129)
  })
})

describe('tileCount and tileColumns', () => {
  test('a level of 19200 columns has 38 tiles, the last holding 256 columns', () => {
    expect(tileCount(19200)).toBe(38)
    expect(tileColumns(19200, 0)).toBe(512)
    expect(tileColumns(19200, 36)).toBe(512)
    expect(tileColumns(19200, 37)).toBe(256)
  })

  test('a level that is an exact multiple has no partial tile', () => {
    expect(tileCount(1024)).toBe(2)
    expect(tileColumns(1024, 1)).toBe(512)
  })

  test('a 1.5 s Source at 128 columns per second is one partial tile of 192 columns', () => {
    expect(tileCount(192)).toBe(1)
    expect(tileColumns(192, 0)).toBe(192)
  })

  test('a tile outside the level holds no columns', () => {
    expect(tileColumns(19200, 38)).toBe(0)
    expect(tileColumns(19200, -1)).toBe(0)
    expect(tileColumns(19200, 1.5)).toBe(0)
  })
})

describe('visibleTileRange', () => {
  // Level 128: a tile is 4 s.
  const columns = 19200

  test('covers the tiles a time range touches', () => {
    expect(visibleTileRange(3, 5, 128, columns)).toEqual({ first: 0, last: 1 })
    expect(visibleTileRange(9, 10, 128, columns)).toEqual({ first: 2, last: 2 })
  })

  test('a range ending exactly on a tile boundary does not touch the next tile', () => {
    expect(visibleTileRange(4, 8, 128, columns)).toEqual({ first: 1, last: 1 })
  })

  test('the first and last tile of a level', () => {
    expect(visibleTileRange(0, 0.01, 128, columns)).toEqual({ first: 0, last: 0 })
    expect(visibleTileRange(149.9, 150, 128, columns)).toEqual({ first: 37, last: 37 })
  })

  test('a range beyond the end is clipped to the last tile', () => {
    expect(visibleTileRange(140, 200, 128, columns)).toEqual({ first: 35, last: 37 })
  })

  test('a range entirely beyond the end has no tiles', () => {
    expect(visibleTileRange(200, 300, 128, columns)).toBeNull()
  })

  test('a range starting before 0 is clipped to tile 0', () => {
    expect(visibleTileRange(-5, 1, 128, columns)).toEqual({ first: 0, last: 0 })
    expect(visibleTileRange(-5, -1, 128, columns)).toBeNull()
  })

  test('a 1.5 s Source is a single tile at any level', () => {
    expect(visibleTileRange(0, 10, 128, 192)).toEqual({ first: 0, last: 0 })
    expect(visibleTileRange(0, 10, 32, 48)).toEqual({ first: 0, last: 0 })
  })

  test('an empty or reversed range has no tiles', () => {
    expect(visibleTileRange(5, 5, 128, columns)).toBeNull()
    expect(visibleTileRange(6, 5, 128, columns)).toBeNull()
    expect(visibleTileRange(0, 1, 128, 0)).toBeNull()
  })
})
