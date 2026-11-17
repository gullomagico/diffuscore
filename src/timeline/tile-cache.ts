// The main-thread LRU cache of detail tiles, accounted in bytes of tile data. Pure: no timers,
// no DOM. Tiles in the pinned set (the wanted set) are never evicted; if only pinned tiles remain
// the cache stays over budget rather than lose a tile the Lane needs now.

import { TILE_CACHE_BUDGET_BYTES, tileKey, type DetailTile, type TileKey } from './detail-tile'

/** An LRU cache of DetailTiles keyed by (kind, level, index). */
export interface TileCache {
  /** The tile at `key`, or undefined. Does not change recency. */
  get(key: TileKey): DetailTile | undefined
  has(key: TileKey): boolean
  /** Stores `tile` as most recently used, replacing any tile at its key, then evicts. */
  insert(tile: DetailTile): void
  /** Marks the tile as drawn in a frame: most recently used. No-op when absent. */
  touch(key: TileKey): void
  /** Replaces the pinned set, then evicts. A key not in the cache applies once it is inserted. */
  pin(keys: Iterable<TileKey>): void
  /** Empties the cache and the pinned set. */
  clear(): void
  /** Bytes of tile data held. */
  readonly bytes: number
  /** Tiles held. */
  readonly size: number
}

/** Creates an empty cache that evicts least recently used, unpinned tiles beyond `budgetBytes`. */
export function createTileCache(budgetBytes: number = TILE_CACHE_BUDGET_BYTES): TileCache {
  // A Map iterates in insertion order, so re-inserting a key moves it to the most recent end.
  const tiles = new Map<string, DetailTile>()
  let pinned = new Set<string>()
  let bytes = 0

  function evict(): void {
    for (const [k, tile] of tiles) {
      if (bytes <= budgetBytes) return
      if (pinned.has(k)) continue
      tiles.delete(k)
      bytes -= tile.data.byteLength
    }
  }

  return {
    get: (key) => tiles.get(tileKey(key)),
    has: (key) => tiles.has(tileKey(key)),
    insert(tile) {
      const k = tileKey(tile)
      const old = tiles.get(k)
      if (old) {
        bytes -= old.data.byteLength
        tiles.delete(k)
      }
      tiles.set(k, tile)
      bytes += tile.data.byteLength
      evict()
    },
    touch(key) {
      const k = tileKey(key)
      const tile = tiles.get(k)
      if (!tile) return
      tiles.delete(k)
      tiles.set(k, tile)
    },
    pin(keys) {
      pinned = new Set([...keys].map(tileKey))
      evict()
    },
    clear() {
      tiles.clear()
      pinned = new Set()
      bytes = 0
    },
    get bytes() {
      return bytes
    },
    get size() {
      return tiles.size
    },
  }
}
