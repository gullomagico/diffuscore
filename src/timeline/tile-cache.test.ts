import { describe, expect, test } from 'vite-plus/test'
import { createTileCache } from './tile-cache'
import type { DetailTile, SpectrogramKind, TileKey } from './detail-tile'

/** A tile of `bytes` bytes of data (columns is irrelevant to the cache, which counts bytes). */
function tile(
  index: number,
  bytes = 10,
  kind: SpectrogramKind = 'L',
  level: 32 | 64 | 128 = 128,
): DetailTile {
  return { kind, level, index, columns: bytes, data: new Uint8Array(bytes) }
}
const key = (index: number, kind: SpectrogramKind = 'L', level: 32 | 64 | 128 = 128): TileKey => ({
  kind,
  level,
  index,
})

describe('createTileCache', () => {
  test('holds what is inserted, by kind, level and index', () => {
    const cache = createTileCache(1000)
    const t = tile(3)
    cache.insert(t)
    expect(cache.get(key(3))).toBe(t)
    expect(cache.has(key(3))).toBe(true)
    expect(cache.has(key(3, 'R'))).toBe(false)
    expect(cache.has(key(3, 'L', 64))).toBe(false)
    expect(cache.has(key(4))).toBe(false)
    expect(cache.get(key(4))).toBeUndefined()
    expect(cache.size).toBe(1)
    expect(cache.bytes).toBe(10)
  })

  test('evicts the least recently inserted tile when over budget', () => {
    const cache = createTileCache(30)
    for (const i of [0, 1, 2, 3]) cache.insert(tile(i))
    expect(cache.has(key(0))).toBe(false)
    expect([1, 2, 3].every((i) => cache.has(key(i)))).toBe(true)
    expect(cache.bytes).toBe(30)
    expect(cache.size).toBe(3)
  })

  test('touch makes a tile most recently used', () => {
    const cache = createTileCache(30)
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    cache.touch(key(0))
    cache.insert(tile(3))
    expect(cache.has(key(0))).toBe(true)
    expect(cache.has(key(1))).toBe(false)
    expect(cache.has(key(2))).toBe(true)
  })

  test('get does not change recency', () => {
    const cache = createTileCache(30)
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    cache.get(key(0))
    cache.insert(tile(3))
    expect(cache.has(key(0))).toBe(false)
  })

  test('touching an absent tile does nothing', () => {
    const cache = createTileCache(30)
    cache.insert(tile(0))
    cache.touch(key(9))
    expect(cache.size).toBe(1)
    expect(cache.has(key(9))).toBe(false)
  })

  test('a partial tile counts at its real size', () => {
    const cache = createTileCache(30)
    cache.insert(tile(0, 10))
    cache.insert(tile(1, 4)) // partial
    expect(cache.bytes).toBe(14)
    cache.insert(tile(2, 10))
    cache.insert(tile(3, 4))
    expect(cache.bytes).toBe(28)
    expect(cache.size).toBe(4)
    cache.insert(tile(4, 4)) // 32 > 30: evict tile 0
    expect(cache.has(key(0))).toBe(false)
    expect(cache.bytes).toBe(22)
  })

  test('inserting an existing key replaces it, adjusts bytes and counts as used', () => {
    const cache = createTileCache(30)
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    const replacement = tile(0, 5)
    cache.insert(replacement)
    expect(cache.get(key(0))).toBe(replacement)
    expect(cache.size).toBe(3)
    expect(cache.bytes).toBe(25)
    cache.insert(tile(3)) // 35: evict tile 1, the least recently used
    expect(cache.has(key(1))).toBe(false)
    expect(cache.has(key(0))).toBe(true)
  })

  test('pinned tiles are never evicted', () => {
    const cache = createTileCache(30)
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    cache.pin([key(0)])
    cache.insert(tile(3))
    expect(cache.has(key(0))).toBe(true)
    expect(cache.has(key(1))).toBe(false)
    cache.insert(tile(4))
    expect(cache.has(key(0))).toBe(true)
    expect(cache.has(key(2))).toBe(false)
  })

  test('stays over budget rather than evicting pinned tiles', () => {
    const cache = createTileCache(30)
    cache.pin([1, 2, 3, 4].map((i) => key(i)))
    for (const i of [0, 1, 2, 3, 4]) cache.insert(tile(i, 10))
    expect(cache.has(key(0))).toBe(false)
    expect([1, 2, 3, 4].every((i) => cache.has(key(i)))).toBe(true)
    expect(cache.bytes).toBe(40)
  })

  test('pinning evicts when the pinned set shrinks and the cache is over budget', () => {
    const cache = createTileCache(20)
    cache.pin([key(0), key(1), key(2)])
    for (const i of [0, 1, 2]) cache.insert(tile(i)) // 30 > 20, all pinned: stays
    expect(cache.size).toBe(3)
    cache.pin([key(2)])
    expect(cache.has(key(0))).toBe(false)
    expect(cache.has(key(1))).toBe(true)
    expect(cache.has(key(2))).toBe(true)
    expect(cache.bytes).toBe(20)
  })

  test('a key pinned before it is inserted is protected once inserted', () => {
    const cache = createTileCache(20)
    cache.pin([key(0)])
    cache.insert(tile(0))
    cache.insert(tile(1))
    cache.insert(tile(2))
    expect(cache.has(key(0))).toBe(true)
    expect(cache.has(key(1))).toBe(false)
    expect(cache.has(key(2))).toBe(true)
  })

  test('pin replaces the previous pinned set', () => {
    const cache = createTileCache(20)
    cache.pin([key(0)])
    cache.pin([key(1)])
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    expect(cache.has(key(0))).toBe(false)
    expect(cache.has(key(1))).toBe(true)
  })

  test('clear empties the cache and the pinned set', () => {
    const cache = createTileCache(20)
    cache.pin([key(0)])
    cache.insert(tile(0))
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
    expect(cache.has(key(0))).toBe(false)
    for (const i of [0, 1, 2]) cache.insert(tile(i))
    expect(cache.has(key(0))).toBe(false)
  })

  test('the default budget holds 64 MiB of tiles', () => {
    const cache = createTileCache()
    const mib = 1024 * 1024
    for (let i = 0; i < 65; i++) cache.insert(tile(i, mib))
    expect(cache.size).toBe(64)
    expect(cache.has(key(0))).toBe(false)
    expect(cache.has(key(64))).toBe(true)
  })
})
