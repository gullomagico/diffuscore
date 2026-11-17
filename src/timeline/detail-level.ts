// Which spectrogram level a Viewport zoom wants, and which detail tiles it wants at that level.
// Pure arithmetic over the shared contract in detail-tile.ts.

import {
  DETAIL_LEVELS,
  OVERVIEW_COLUMNS_PER_SECOND,
  TILE_COLUMNS,
  tileCount,
  visibleTileRange,
  type LevelChoice,
  type WantedTile,
} from './detail-tile'

/** Device pixels per second from CSS pixels per second and the device pixel ratio. */
export function devicePixelsPerSecond(
  cssPixelsPerSecond: number,
  devicePixelRatio: number,
): number {
  return cssPixelsPerSecond * devicePixelRatio
}

/**
 * The lowest level with at least one column per device pixel: the overview up to its own column
 * rate, then the first detail level that reaches `devicePixelsPerSecond`, the finest beyond all.
 * Input that is not a positive finite number draws the overview.
 */
export function chooseLevel(devicePixelsPerSecond: number): LevelChoice {
  if (
    !Number.isFinite(devicePixelsPerSecond) ||
    devicePixelsPerSecond <= OVERVIEW_COLUMNS_PER_SECOND
  ) {
    return 'overview'
  }
  return (
    DETAIL_LEVELS.find((level) => level >= devicePixelsPerSecond) ??
    DETAIL_LEVELS[DETAIL_LEVELS.length - 1]
  )
}

/**
 * The tiles to have at `level` for [startTime, endTime): every tile intersecting the range
 * (visible), plus one tile ahead on each side when it exists. Priority order: visible tiles first,
 * then the neighbours, each group nearest the range's centre first (tile centre to range centre),
 * ties to the earlier tile. The overview wants no tiles.
 */
export function wantedTiles(
  startTime: number,
  endTime: number,
  level: LevelChoice,
  levelColumns: number,
): WantedTile[] {
  if (level === 'overview') return []
  const range = visibleTileRange(startTime, endTime, level, levelColumns)
  if (!range) return []

  const rangeCentre = (startTime + endTime) / 2
  const distance = (index: number) => Math.abs(((index + 0.5) * TILE_COLUMNS) / level - rangeCentre)
  const ordered = (indexes: number[]) => indexes.sort((a, b) => distance(a) - distance(b) || a - b)

  const visible: number[] = []
  for (let i = range.first; i <= range.last; i++) visible.push(i)
  const neighbours: number[] = []
  if (range.first > 0) neighbours.push(range.first - 1)
  if (range.last < tileCount(levelColumns) - 1) neighbours.push(range.last + 1)

  return [
    ...ordered(visible).map((index) => ({ level, index, visible: true })),
    ...ordered(neighbours).map((index) => ({ level, index, visible: false })),
  ]
}
