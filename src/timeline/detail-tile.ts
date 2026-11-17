// Detail tiles of the spectrograms (ADR-0001): the constants, types and column arithmetic shared by
// the main thread and the tile worker. FFT-free, so main-thread modules can import values from here
// without pulling fft.js into the main bundle.

/** Columns per second of the overview spectrograms. Up to this many device pixels per second, the overview is drawn. */
export const OVERVIEW_COLUMNS_PER_SECOND = 10

/** The detail levels in columns per second, coarsest first. Each is also the level-choice threshold above the previous one. */
export const DETAIL_LEVELS = [32, 64, 128] as const
export type DetailLevel = (typeof DETAIL_LEVELS)[number]

/** What a spectrogram draws at a given zoom: the overview, or one detail level. */
export type LevelChoice = 'overview' | DetailLevel

/** Columns in one tile. The last tile of a level is partial. */
export const TILE_COLUMNS = 512

/** Budget of the detail tile cache: bytes of detail tile data, all kinds and levels together. */
export const TILE_CACHE_BUDGET_BYTES = 64 * 1024 * 1024

/** One spectrogram of a Source: L, R or Total for a stereo Source; Mono for a Mono Source's single Channel. */
export type SpectrogramKind = 'L' | 'R' | 'Total' | 'Mono'

/**
 * Columns of a spectrogram at `columnsPerSecond` over `sampleCount` samples. Column c covers
 * [c / R, (c + 1) / R) seconds. Both threads count columns with this function, so the partial
 * last tile has the same size everywhere.
 */
export function columnCount(
  sampleCount: number,
  sampleRate: number,
  columnsPerSecond: number,
): number {
  return Math.ceil((sampleCount * columnsPerSecond) / sampleRate)
}

/** Tiles of a level of `levelColumns` columns. */
export function tileCount(levelColumns: number): number {
  return Math.ceil(levelColumns / TILE_COLUMNS)
}

/** Columns held by tile `index`: TILE_COLUMNS, fewer for a partial last tile, 0 outside the level. */
export function tileColumns(levelColumns: number, index: number): number {
  if (!Number.isInteger(index) || index < 0) return 0
  return Math.max(0, Math.min(TILE_COLUMNS, levelColumns - index * TILE_COLUMNS))
}

/** The tiles intersecting [startTime, endTime) at `level`, clipped to the level; null when none. */
export function visibleTileRange(
  startTime: number,
  endTime: number,
  level: DetailLevel,
  levelColumns: number,
): { first: number; last: number } | null {
  if (!(endTime > startTime) || levelColumns <= 0) return null
  const c0 = Math.max(0, Math.floor(startTime * level))
  const c1 = Math.min(levelColumns - 1, Math.ceil(endTime * level) - 1)
  if (c0 > c1) return null
  return { first: Math.floor(c0 / TILE_COLUMNS), last: Math.floor(c1 / TILE_COLUMNS) }
}

/** One tile position: a level and a tile index, whatever the kind. */
export interface TileAddress {
  readonly level: DetailLevel
  readonly index: number
}

/** One tile of one spectrogram kind: the cache key. */
export interface TileKey extends TileAddress {
  readonly kind: SpectrogramKind
}

/** The string form of a TileKey, for Maps and Sets. */
export function tileKey(key: TileKey): string {
  return `${key.kind}:${key.level}:${key.index}`
}

/** A computed detail tile. */
export interface DetailTile extends TileKey {
  /** tileColumns(level's columns, index). */
  readonly columns: number
  /** columns × SPECTROGRAM_ROWS quantised dB, in the overview's layout: cell (c, r) is data[c * SPECTROGRAM_ROWS + r], c relative to the tile's first column. */
  readonly data: Uint8Array
}

/** A tile position the Lane wants, for every kind it needs. Wanted sets are listed in priority order. */
export interface WantedTile extends TileAddress {
  /** True when the tile intersects the Viewport; false for a neighbour computed ahead. */
  readonly visible: boolean
}

/** What the main thread asks the tile worker for: one tile position and the kinds still missing there. */
export interface TileRequest extends TileAddress {
  readonly kinds: readonly SpectrogramKind[]
}
