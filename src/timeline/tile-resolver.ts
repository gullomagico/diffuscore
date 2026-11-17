// Decides what each tile-wide stretch of the Viewport draws (ADR-0001). For a stretch whose tile is
// not ready at the current level, the stand-in is the tile of the nearest lower detail level that
// covers it, if cached, else the overview. The substitution is per whole tile; finer cached tiles are
// never stand-ins. So there are never blank gaps inside the Source's duration. Pure: the cache is
// injected as `lookup`.

import { DETAIL_LEVELS, TILE_COLUMNS, columnCount, tileKey, visibleTileRange } from './detail-tile'
import type { DetailLevel, DetailTile, LevelChoice, SpectrogramKind, TileKey } from './detail-tile'

/** What a stretch draws: a tile (at the current level, or a lower-level stand-in) or the overview. */
export type StretchImage =
  | { readonly type: 'tile'; readonly tile: DetailTile }
  | { readonly type: 'overview' }

/** A tile-wide stretch of the Source, in seconds, clipped to the Source's duration. */
export interface ResolvedStretch {
  /** Tile index at the current level; -1 for the overview level's single stretch. */
  readonly index: number
  readonly startTime: number
  readonly endTime: number
  readonly image: StretchImage
}

/** What to draw for a visible range: the stretches, whether detail is ready, and the tiles used. */
export interface ResolvedSpectrogram {
  readonly level: LevelChoice
  /** Columns of the current level (0 for the overview level), for clamping column reads. */
  readonly levelColumns: number
  /** Covering the visible range inside the Source, in time order, consecutive tile indices. */
  readonly stretches: readonly ResolvedStretch[]
  /** 'none': the overview is the chosen level; 'ready': every visible tile at the level is present; else 'pending'. */
  readonly detail: 'none' | 'pending' | 'ready'
  /** Every distinct tile drawn (current level and stand-ins), so the caller can mark them recently used. */
  readonly used: readonly DetailTile[]
}

/** The visible range, level and Source geometry to resolve, plus the cache lookup. */
export interface ResolveInput {
  readonly level: LevelChoice
  readonly startTime: number
  readonly endTime: number
  readonly kind: SpectrogramKind
  readonly sampleCount: number
  readonly sampleRate: number
  /** The cache's get. */
  readonly lookup: (key: TileKey) => DetailTile | undefined
}

/** Resolves the visible range to cached tiles at the level, lower-level stand-ins, or the overview. */
export function resolveSpectrogram(input: ResolveInput): ResolvedSpectrogram {
  const { level, kind, sampleCount, sampleRate, lookup } = input
  const duration = sampleCount / sampleRate
  if (level === 'overview') {
    const stretches: ResolvedStretch[] =
      duration > 0 && input.endTime > 0 && input.startTime < duration
        ? [{ index: -1, startTime: 0, endTime: duration, image: { type: 'overview' } }]
        : []
    return { level, levelColumns: 0, stretches, detail: 'none', used: [] }
  }

  const levelColumns = columnCount(sampleCount, sampleRate, level)
  const range = visibleTileRange(input.startTime, input.endTime, level, levelColumns)
  const stretches: ResolvedStretch[] = []
  const used = new Map<string, DetailTile>()
  let ready = true
  if (range !== null) {
    const lower = DETAIL_LEVELS.filter((l): l is DetailLevel => l < level).reverse()
    for (let index = range.first; index <= range.last; index++) {
      let image: StretchImage = { type: 'overview' }
      const own = lookup({ kind, level, index })
      if (own !== undefined) {
        image = { type: 'tile', tile: own }
      } else {
        ready = false
        for (const l of lower) {
          // Tile boundaries nest: the tile of level l covering this one has index floor(index / ratio).
          const stand = lookup({ kind, level: l, index: Math.floor(index / (level / l)) })
          if (stand !== undefined) {
            image = { type: 'tile', tile: stand }
            break
          }
        }
      }
      if (image.type === 'tile') used.set(tileKey(image.tile), image.tile)
      stretches.push({
        index,
        startTime: (index * TILE_COLUMNS) / level,
        endTime: Math.min(duration, ((index + 1) * TILE_COLUMNS) / level),
        image,
      })
    }
  }
  return {
    level,
    levelColumns,
    stretches,
    detail: ready ? 'ready' : 'pending',
    used: [...used.values()],
  }
}
