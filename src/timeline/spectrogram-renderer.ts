// Draws a SpectrogramOverview into device pixels. The pure maths (renderSpectrogramPixels) is the
// whole renderer; the Canvas2D adapter only moves its pixels to a canvas. A WebGL renderer can
// replace the adapter through the SpectrogramRenderer interface.
//
// Level choice: with pixel interval dt seconds, a pixel reads the coarsest level whose columns are
// at most dt wide (w <= dt). An interval no longer than a column touches at most 2 columns; the
// float-rounding margin makes the bound 3. So a pixel column reads <= 3 overview columns x 512
// rows, whatever the Source's duration and the zoom: work per frame <= 3 x width x 512.

import { SPECTROGRAM_COLOR_STOPS, SPECTROGRAM_STRETCH } from './lane-look'
import { SPECTROGRAM_ROWS } from './frequency-axis'
import { TILE_COLUMNS } from './detail-tile'
import type { ResolvedSpectrogram } from './tile-resolver'
import type { SpectrogramOverview } from './spectrogram'

/** 256 RGBA entries (1024 bytes): index = quantised dB 0..255. */
export type ColorTable = Uint8ClampedArray

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Linear interpolation of evenly spaced colour stops, dark to bright, all opaque. */
export function createColorTable(stops: readonly string[] = SPECTROGRAM_COLOR_STOPS): ColorTable {
  const rgb = stops.map(parseHex)
  const table = new Uint8ClampedArray(256 * 4)
  for (let q = 0; q < 256; q++) {
    const position = (q / 255) * (rgb.length - 1)
    const i = Math.min(rgb.length - 2, Math.floor(position))
    const t = rgb.length === 1 ? 0 : position - i
    const a = rgb[i]!
    const b = rgb[Math.min(i + 1, rgb.length - 1)]!
    for (let k = 0; k < 3; k++) table[q * 4 + k] = Math.round(a[k]! + (b[k]! - a[k]!) * t)
    table[q * 4 + 3] = 255
  }
  return table
}

/** The visible time range, in seconds. */
export interface TimeRange {
  readonly startTime: number
  readonly endTime: number
}

/** A rectangle in device pixels. */
export interface DeviceRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Reusable working memory of renderSpectrogramPixels; sized by the canvas height, grown on demand. */
export interface SpectrogramScratch {
  /** Max over the overview columns of one pixel column, per overview row. */
  readonly columnMax: Uint8Array
  /** Per pixel row (top first): the first and last overview row it reads. */
  rowFirst: Int32Array
  rowLast: Int32Array
}

export function createSpectrogramScratch(height = 0): SpectrogramScratch {
  return {
    columnMax: new Uint8Array(SPECTROGRAM_ROWS),
    rowFirst: new Int32Array(height),
    rowLast: new Int32Array(height),
  }
}

function prepareRows(scratch: SpectrogramScratch, height: number): void {
  if (scratch.rowFirst.length < height) {
    scratch.rowFirst = new Int32Array(height)
    scratch.rowLast = new Int32Array(height)
  }
  for (let y = 0; y < height; y++) {
    // Pixel row y spans [lo, hi) in overview rows; row 0 of the overview is at the bottom.
    const lo = ((height - 1 - y) * SPECTROGRAM_ROWS) / height
    const hi = ((height - y) * SPECTROGRAM_ROWS) / height
    let first: number
    let last: number
    if (height < SPECTROGRAM_ROWS) {
      first = Math.floor(lo)
      last = Math.max(first, Math.ceil(hi) - 1)
    } else {
      // Nearest neighbour: the overview row containing the pixel row's centre.
      first = last = Math.min(SPECTROGRAM_ROWS - 1, Math.floor((lo + hi) / 2))
    }
    scratch.rowFirst[y] = first
    scratch.rowLast[y] = Math.min(SPECTROGRAM_ROWS - 1, last)
  }
}

/** Maps a pixel column's per-row maxima (scratch.columnMax) onto the pixel rows and colours them. */
function paintColumn(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  scratch: SpectrogramScratch,
  table: ColorTable,
): void {
  const { columnMax, rowFirst, rowLast } = scratch
  for (let y = 0; y < height; y++) {
    let m = columnMax[rowFirst[y]!]!
    for (let r = rowFirst[y]! + 1, end = rowLast[y]!; r <= end; r++) {
      if (columnMax[r]! > m) m = columnMax[r]!
    }
    const o = (y * width + x) * 4
    const t = m * 4
    out[o] = table[t]!
    out[o + 1] = table[t + 1]!
    out[o + 2] = table[t + 2]!
    out[o + 3] = table[t + 3]!
  }
}

/**
 * Pure: fills `out` (width x height x 4 RGBA, row-major, top pixel row = highest frequency) with the
 * overview over `range` and returns the number of overview cells read (the work of the frame).
 * Pixel columns starting at or after `sourceDuration` (or before 0) are left fully transparent.
 * Horizontal shrink: each pixel column is the max of every overview column its time interval
 * touches, read from the coarsest level at least as fine as the pixel. Stretch (see
 * SPECTROGRAM_STRETCH): nearest neighbour.
 */
export function renderSpectrogramPixels(
  overview: SpectrogramOverview,
  table: ColorTable,
  range: TimeRange,
  sourceDuration: number,
  width: number,
  height: number,
  out: Uint8ClampedArray,
  scratch: SpectrogramScratch = createSpectrogramScratch(height),
): number {
  out.fill(0, 0, width * height * 4)
  const levels = overview.levels
  if (!(width > 0) || !(height > 0) || levels.length === 0) return 0
  const pixelSeconds = (range.endTime - range.startTime) / width
  if (!(pixelSeconds > 0)) return 0
  prepareRows(scratch, height)

  const stretch: typeof SPECTROGRAM_STRETCH = SPECTROGRAM_STRETCH
  // Coarsest level whose columns are at most one pixel wide (level 0 if none is).
  let k = 0
  while (k + 1 < levels.length && levels[k + 1]!.columnsPerSecond * pixelSeconds >= 1 - 1e-9) k++
  const level = levels[k]!
  const columnSeconds = 1 / level.columnsPerSecond
  const { columnMax } = scratch
  let reads = 0

  for (let x = 0; x < width; x++) {
    const a = range.startTime + x * pixelSeconds
    const b = a + pixelSeconds
    if (a < 0 || a >= sourceDuration || level.columns === 0) continue

    let c0: number
    let c1: number
    if (stretch === 'nearest' && pixelSeconds < columnSeconds) {
      c0 = c1 = Math.floor((a + b) / 2 / columnSeconds)
    } else {
      c0 = Math.floor(a / columnSeconds)
      c1 = Math.max(c0, Math.ceil(b / columnSeconds) - 1)
    }
    c0 = Math.min(level.columns - 1, Math.max(0, c0))
    c1 = Math.min(level.columns - 1, Math.max(c0, c1))

    columnMax.set(level.data.subarray(c0 * SPECTROGRAM_ROWS, (c0 + 1) * SPECTROGRAM_ROWS))
    for (let c = c0 + 1; c <= c1; c++) {
      const base = c * SPECTROGRAM_ROWS
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
        const v = level.data[base + r]!
        if (v > columnMax[r]!) columnMax[r] = v
      }
    }
    reads += (c1 - c0 + 1) * SPECTROGRAM_ROWS

    paintColumn(out, width, height, x, scratch, table)
  }
  return reads
}

/** The most columns one pixel column reads: a pixel of up to 3.2 columns touches at most 5. */
export const MAX_COLUMNS_PER_PIXEL = 5

/**
 * The columns [first, last] of a level of `columnsPerSecond` that a pixel over [a, b) reads: the
 * one under the pixel's centre when stretched (see SPECTROGRAM_STRETCH), else every column it
 * touches, capped to MAX_COLUMNS_PER_PIXEL around the centre column. Clamped to [lo, hi].
 */
function pixelColumns(
  a: number,
  b: number,
  columnsPerSecond: number,
  lo: number,
  hi: number,
): [number, number] {
  const centre = Math.min(hi, Math.max(lo, Math.floor(((a + b) / 2) * columnsPerSecond)))
  if (SPECTROGRAM_STRETCH === 'nearest' && b - a < 1 / columnsPerSecond) return [centre, centre]
  let first = Math.floor(a * columnsPerSecond)
  let last = Math.max(first, Math.ceil(b * columnsPerSecond) - 1)
  first = Math.min(centre, Math.max(lo, first, centre - (MAX_COLUMNS_PER_PIXEL - 1)))
  last = Math.max(centre, Math.min(hi, last, first + MAX_COLUMNS_PER_PIXEL - 1))
  return [first, last]
}

/**
 * Pure: like renderSpectrogramPixels, but draws what the tile resolver chose: per pixel column the
 * stretch under its centre gives the image. Level 'overview' is exactly renderSpectrogramPixels.
 * - A tile at the current level: the max of the current-level columns the pixel covers, each read
 *   from the ready current-level tile that holds it (a pixel straddling a tile boundary sees the
 *   next tile's columns); columns of tiles not ready are skipped (the centre column always is).
 * - A lower-level stand-in tile: the same, from that level's columns, clamped to the tile.
 * - The overview: overview level 0 (a pixel there is narrower than its columns).
 * Every pixel column starting inside [0, sourceDuration) is drawn, the others stay transparent.
 * Returns the cells read: at most MAX_COLUMNS_PER_PIXEL x SPECTROGRAM_ROWS per pixel column.
 */
export function renderResolvedPixels(
  resolved: ResolvedSpectrogram,
  overview: SpectrogramOverview,
  table: ColorTable,
  range: TimeRange,
  sourceDuration: number,
  width: number,
  height: number,
  out: Uint8ClampedArray,
  scratch: SpectrogramScratch = createSpectrogramScratch(height),
): number {
  if (resolved.level === 'overview') {
    return renderSpectrogramPixels(
      overview,
      table,
      range,
      sourceDuration,
      width,
      height,
      out,
      scratch,
    )
  }
  out.fill(0, 0, width * height * 4)
  const { stretches, level } = resolved
  const base = overview.levels[0]
  if (!(width > 0) || !(height > 0) || stretches.length === 0 || base === undefined) return 0
  const pixelSeconds = (range.endTime - range.startTime) / width
  if (!(pixelSeconds > 0)) return 0
  prepareRows(scratch, height)

  const { columnMax } = scratch
  const firstIndex = stretches[0]!.index
  let reads = 0
  let filled = false
  const take = (data: Uint8Array, offset: number) => {
    reads += SPECTROGRAM_ROWS
    if (!filled) {
      columnMax.set(data.subarray(offset, offset + SPECTROGRAM_ROWS))
      filled = true
      return
    }
    for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
      const v = data[offset + r]!
      if (v > columnMax[r]!) columnMax[r] = v
    }
  }

  let s = 0
  for (let x = 0; x < width; x++) {
    const a = range.startTime + x * pixelSeconds
    const b = a + pixelSeconds
    if (a < 0 || a >= sourceDuration) continue
    const centre = (a + b) / 2
    while (s < stretches.length - 1 && centre >= stretches[s]!.endTime) s++
    const image = stretches[s]!.image
    filled = false

    if (image.type === 'overview') {
      if (base.columns === 0) continue
      const [c0, c1] = pixelColumns(a, b, base.columnsPerSecond, 0, base.columns - 1)
      for (let c = c0; c <= c1; c++) take(base.data, c * SPECTROGRAM_ROWS)
    } else if (image.tile.level !== level) {
      const tile = image.tile
      if (tile.columns === 0) continue
      const first = tile.index * TILE_COLUMNS
      const [c0, c1] = pixelColumns(a, b, tile.level, first, first + tile.columns - 1)
      for (let c = c0; c <= c1; c++) take(tile.data, (c - first) * SPECTROGRAM_ROWS)
    } else {
      const [c0, c1] = pixelColumns(a, b, level, 0, resolved.levelColumns - 1)
      for (let c = c0; c <= c1; c++) {
        const index = Math.floor(c / TILE_COLUMNS)
        const held = stretches[index - firstIndex]?.image
        if (held === undefined || held.type !== 'tile' || held.tile.level !== level) continue
        const relative = c - index * TILE_COLUMNS
        if (relative < held.tile.columns) take(held.tile.data, relative * SPECTROGRAM_ROWS)
      }
    }
    if (!filled) continue
    paintColumn(out, width, height, x, scratch, table)
  }
  return reads
}

/** The renderer interface the Lane draws through. A WebGL implementation must be able to replace it. */
export interface SpectrogramRenderer {
  /** Draws what the resolver chose over `range` into `rect` (device pixels), in one pass. Pixels past the Source's end are left transparent. */
  draw(
    resolved: ResolvedSpectrogram,
    overview: SpectrogramOverview,
    table: ColorTable,
    range: TimeRange,
    sourceDuration: number,
    rect: DeviceRect,
  ): void
}

/**
 * Canvas2D implementation: renders into a reused ImageData and putImageData()s it at rect. Note
 * that putImageData replaces the pixels (transparent ones included) instead of blending: paint any
 * background afterwards with globalCompositeOperation 'destination-over'.
 */
export function createCanvas2DSpectrogramRenderer(
  context: CanvasRenderingContext2D,
): SpectrogramRenderer {
  let image: ImageData | null = null
  const scratch = createSpectrogramScratch()
  return {
    draw(resolved, overview, table, range, sourceDuration, rect) {
      if (!(rect.width > 0) || !(rect.height > 0)) return
      if (image === null || image.width !== rect.width || image.height !== rect.height) {
        image = context.createImageData(rect.width, rect.height)
      }
      renderResolvedPixels(
        resolved,
        overview,
        table,
        range,
        sourceDuration,
        rect.width,
        rect.height,
        image.data,
        scratch,
      )
      context.putImageData(image, rect.x, rect.y)
    },
  }
}
