import { describe, expect, test } from 'vite-plus/test'
import { columnCount, tileColumns, tileKey, tileCount } from './detail-tile'
import type { DetailLevel, DetailTile, TileKey } from './detail-tile'
import { SPECTROGRAM_ROWS } from './frequency-axis'
import { buildColumnMaxLevels, buildSourceSpectrograms } from './spectrogram'
import type { SpectrogramOverview } from './spectrogram'
import {
  createCanvas2DSpectrogramRenderer,
  createColorTable,
  renderResolvedPixels,
  renderSpectrogramPixels,
} from './spectrogram-renderer'
import { resolveSpectrogram } from './tile-resolver'

/** An overview of `columns` columns whose cell (c, r) is cell(c, r). */
function overviewOf(
  columns: number,
  cell: (column: number, row: number) => number,
): SpectrogramOverview {
  const data = new Uint8Array(columns * SPECTROGRAM_ROWS)
  for (let c = 0; c < columns; c++)
    for (let r = 0; r < SPECTROGRAM_ROWS; r++) data[c * SPECTROGRAM_ROWS + r] = cell(c, r)
  return { levels: buildColumnMaxLevels({ columns, columnsPerSecond: 10, data }) }
}

const table = createColorTable()

function render(
  overview: SpectrogramOverview,
  start: number,
  end: number,
  duration: number,
  width: number,
  height: number,
) {
  const out = new Uint8ClampedArray(width * height * 4)
  const reads = renderSpectrogramPixels(
    overview,
    table,
    { startTime: start, endTime: end },
    duration,
    width,
    height,
    out,
  )
  return { out, reads }
}

function pixel(out: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4
  return [out[i]!, out[i + 1]!, out[i + 2]!, out[i + 3]!]
}

function color(value: number): number[] {
  return Array.from(table.subarray(value * 4, value * 4 + 4))
}

describe('createColorTable', () => {
  test('has 256 opaque entries, the floor colour first, brightening to the end', () => {
    expect(table.length).toBe(1024)
    const luminance = (i: number) =>
      0.2126 * table[i * 4]! + 0.7152 * table[i * 4 + 1]! + 0.0722 * table[i * 4 + 2]!
    for (let i = 0; i < 256; i++) expect(table[i * 4 + 3]).toBe(255)
    expect(color(0)).toEqual([0, 0, 4, 255])
    for (let i = 1; i < 256; i++) expect(luminance(i)).toBeGreaterThanOrEqual(luminance(i - 1))
    expect(luminance(255)).toBeGreaterThan(200)
  })

  test('interpolates between custom stops', () => {
    const custom = createColorTable(['#000000', '#ffffff'])
    expect(Array.from(custom.subarray(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(custom.subarray(255 * 4, 256 * 4))).toEqual([255, 255, 255, 255])
    expect(custom[128 * 4]).toBe(128)
  })
})

describe('renderSpectrogramPixels', () => {
  test('stretches finer than the overview as blocky nearest neighbour', () => {
    const overview = overviewOf(2, (c) => (c === 0 ? 50 : 200))
    const { out } = render(overview, 0, 0.2, 0.2, 100, 4)
    for (let x = 0; x < 100; x++) {
      expect(pixel(out, 100, x, 1)).toEqual(color(x < 50 ? 50 : 200))
    }
  })

  test('takes the max of the rows a pixel row covers when shorter than 512', () => {
    const overview = overviewOf(1, (_c, r) => (r === 10 ? 100 : 0))
    const { out } = render(overview, 0, 0.1, 0.1, 1, 256)
    // Rows 10 and 11 share pixel row 255 - 5 = 250; the top pixel row is the highest frequency.
    expect(pixel(out, 1, 0, 250)).toEqual(color(100))
    expect(pixel(out, 1, 0, 249)).toEqual(color(0))
    expect(pixel(out, 1, 0, 251)).toEqual(color(0))
  })

  test('repeats rows as nearest neighbour when taller than 512', () => {
    const overview = overviewOf(1, (_c, r) => (r === 10 ? 100 : 0))
    const { out } = render(overview, 0, 0.1, 0.1, 1, 1024)
    expect(pixel(out, 1, 0, 1003)).toEqual(color(100))
    expect(pixel(out, 1, 0, 1002)).toEqual(color(100))
    expect(pixel(out, 1, 0, 1004)).toEqual(color(0))
    expect(pixel(out, 1, 0, 1001)).toEqual(color(0))
  })

  test('puts the highest frequency on the top pixel row', () => {
    const overview = overviewOf(1, (_c, r) => (r === SPECTROGRAM_ROWS - 1 ? 255 : 0))
    const { out } = render(overview, 0, 0.1, 0.1, 1, 512)
    expect(pixel(out, 1, 0, 0)).toEqual(color(255))
    expect(pixel(out, 1, 0, 1)).toEqual(color(0))
  })

  test('leaves pixel columns before 0 and from the Source end transparent', () => {
    const overview = overviewOf(10, () => 255)
    const { out } = render(overview, -1, 2, 1, 30, 2)
    for (let x = 0; x < 30; x++) {
      const inside = x >= 10 && x < 20
      expect(pixel(out, 30, x, 0)[3]).toBe(inside ? 255 : 0)
      expect(pixel(out, 30, x, 1)[3]).toBe(inside ? 255 : 0)
    }
  })

  test('overwrites a reused output, clearing stale pixels', () => {
    const overview = overviewOf(10, () => 255)
    const out = new Uint8ClampedArray(10 * 4).fill(9)
    renderSpectrogramPixels(overview, table, { startTime: 5, endTime: 6 }, 1, 10, 1, out)
    expect(Array.from(out).every((v) => v === 0)).toBe(true)
  })
})

describe('shrink to fit a 30-minute Source', () => {
  const DURATION = 1800
  const COLUMNS = DURATION * 10
  const click = 9001 // overview column covering 900.1 s to 900.2 s
  const clicked = overviewOf(COLUMNS, (c) => (c === click ? 255 : 0))

  test('keeps a single loud column visible, at its pixel column, with its full value', () => {
    const width = 1600
    const { out } = render(clicked, 0, DURATION, DURATION, width, 8)
    const x = Math.floor((900.1 / DURATION) * width) // 800
    expect(pixel(out, width, x, 3)).toEqual(color(255))
    expect(pixel(out, width, x - 2, 3)).toEqual(color(0))
    expect(pixel(out, width, x + 2, 3)).toEqual(color(0))
    let lit = 0
    for (let i = 0; i < width; i++) if (pixel(out, width, i, 3)[0] !== 0) lit++
    expect(lit).toBe(1)
  })

  test('never drops a click, wherever it falls', () => {
    const width = 1000
    for (const c of [0, 1, 7, 5000, 12345, COLUMNS - 1]) {
      const overview = overviewOf(COLUMNS, (column) => (column === c ? 255 : 0))
      const { out } = render(overview, 0, DURATION, DURATION, width, 2)
      let max = 0
      for (let x = 0; x < width; x++) max = Math.max(max, pixel(out, width, x, 0)[0]!)
      expect(max).toBe(color(255)[0])
    }
  })

  test('reads a bounded number of cells per frame, whatever the duration or zoom', () => {
    const width = 1600
    const height = 300
    const bound = 3 * width * SPECTROGRAM_ROWS
    const short = overviewOf(300, (c, r) => (c + r) % 256)
    const long = overviewOf(COLUMNS, (c, r) => (c + r) % 256)
    const fit = render(long, 0, DURATION, DURATION, width, height).reads
    const middle = render(long, 600, 600 + 60, DURATION, width, height).reads
    const maximum = render(long, 600, 605, DURATION, width, height).reads
    const shortFit = render(short, 0, 30, 30, width, height).reads
    for (const reads of [fit, middle, maximum, shortFit]) {
      expect(reads).toBeGreaterThan(0)
      expect(reads).toBeLessThanOrEqual(bound)
    }
    expect(fit).toBeLessThanOrEqual(shortFit * 3)
  })
})

describe('a real click through the whole pipeline', () => {
  test('is clearly above the floor at overview resolution and survives the fit-to-width shrink of a 30-minute Source', () => {
    // 10 s of silence at 8 kHz with a one-sample click centred in an STFT frame (sample 80 x hop 512).
    const rate = 8000
    const samples = new Float32Array(10 * rate)
    samples[40960] = 1
    const real = buildSourceSpectrograms([samples], rate).channels[0]!.levels[0]!
    const clickColumn = Math.floor((40960 / rate) * real.columnsPerSecond) // 51
    const cells = real.data.subarray(
      clickColumn * SPECTROGRAM_ROWS,
      (clickColumn + 1) * SPECTROGRAM_ROWS,
    )
    const peak = Math.max(...cells)
    expect(peak).toBeGreaterThan(100) // clearly above the floor (0) at overview resolution

    // Splice that column into a 30-minute floor overview, and render it fit to 1600 device pixels.
    const DURATION = 1800
    const COLUMNS = DURATION * 10
    const position = 9001
    const data = new Uint8Array(COLUMNS * SPECTROGRAM_ROWS)
    data.set(cells, position * SPECTROGRAM_ROWS)
    const overview = {
      levels: buildColumnMaxLevels({ columns: COLUMNS, columnsPerSecond: 10, data }),
    }
    const width = 1600
    const { out } = render(overview, 0, DURATION, DURATION, width, 8)
    const x = Math.floor((position / 10 / DURATION) * width) // 800

    let brightest = 0
    for (let y = 0; y < 8; y++) brightest = Math.max(brightest, pixel(out, width, x, y)[0]!)
    expect(brightest).toBe(color(peak)[0])
    expect(brightest).toBeGreaterThan(color(0)[0]! + 40)
    for (let y = 0; y < 8; y++) {
      expect(pixel(out, width, x - 3, y)).toEqual(color(0))
      expect(pixel(out, width, x + 3, y)).toEqual(color(0))
    }
  })
})

describe('createCanvas2DSpectrogramRenderer', () => {
  test('puts the rendered pixels at the rectangle, reusing its ImageData', () => {
    const created: { data: Uint8ClampedArray; width: number; height: number }[] = []
    const puts: { image: unknown; x: number; y: number }[] = []
    const context = {
      createImageData(width: number, height: number) {
        const image = { data: new Uint8ClampedArray(width * height * 4), width, height }
        created.push(image)
        return image
      },
      putImageData(image: unknown, x: number, y: number) {
        puts.push({ image, x, y })
      },
    } as unknown as CanvasRenderingContext2D
    const renderer = createCanvas2DSpectrogramRenderer(context)
    const overview = overviewOf(2, (c) => (c === 0 ? 50 : 200))
    const rect = { x: 7, y: 3, width: 20, height: 4 }
    const resolved = resolveSpectrogram({
      level: 'overview',
      startTime: 0,
      endTime: 0.2,
      kind: 'Total',
      sampleCount: 9600,
      sampleRate: 48000,
      lookup: () => undefined,
    })
    renderer.draw(resolved, overview, table, { startTime: 0, endTime: 0.2 }, 0.2, rect)
    renderer.draw(resolved, overview, table, { startTime: 0, endTime: 0.2 }, 0.2, rect)
    expect(created.length).toBe(1)
    expect(puts.map((p) => [p.x, p.y])).toEqual([
      [7, 3],
      [7, 3],
    ])
    const data = created[0]!.data
    expect(Array.from(data.subarray(0, 4))).toEqual(color(50))
    expect(Array.from(data.subarray(19 * 4, 20 * 4))).toEqual(color(200))
  })
})

// ---- Resolved rendering: tiles at the level, stand-ins, the overview ----

const RATE = 48000

/** A tile of `level` whose cell (column, row) is cell(absolute column, row). */
function makeTile(
  level: DetailLevel,
  index: number,
  sampleCount: number,
  cell: (column: number, row: number) => number,
): DetailTile {
  const columns = tileColumns(columnCount(sampleCount, RATE, level), index)
  const data = new Uint8Array(columns * SPECTROGRAM_ROWS)
  for (let c = 0; c < columns; c++)
    for (let r = 0; r < SPECTROGRAM_ROWS; r++)
      data[c * SPECTROGRAM_ROWS + r] = cell(index * 512 + c, r)
  return { kind: 'Total', level, index, columns, data }
}

function lookupOf(tiles: readonly DetailTile[]) {
  const map = new Map(tiles.map((t) => [tileKey(t), t]))
  return (key: TileKey) => map.get(tileKey(key))
}

function renderTiles(
  level: 'overview' | DetailLevel,
  tiles: readonly DetailTile[],
  overview: SpectrogramOverview,
  seconds: number,
  start: number,
  end: number,
  width: number,
  height = 4,
) {
  const resolved = resolveSpectrogram({
    level,
    startTime: start,
    endTime: end,
    kind: 'Total',
    sampleCount: Math.round(seconds * RATE),
    sampleRate: RATE,
    lookup: lookupOf(tiles),
  })
  const out = new Uint8ClampedArray(width * height * 4)
  const reads = renderResolvedPixels(
    resolved,
    overview,
    table,
    { startTime: start, endTime: end },
    seconds,
    width,
    height,
    out,
  )
  return { out, reads }
}

describe('renderResolvedPixels', () => {
  const SECONDS = 60
  const samples = SECONDS * RATE
  const flat = overviewOf(SECONDS * 10, () => 30)

  function expectNoGaps(out: Uint8ClampedArray, width: number, start: number, end: number) {
    const pixelSeconds = (end - start) / width
    for (let x = 0; x < width; x++) {
      const a = start + x * pixelSeconds
      const inside = a >= 0 && a < SECONDS
      for (let y = 0; y < 4; y++) expect(pixel(out, width, x, y)[3]).toBe(inside ? 255 : 0)
    }
  }

  test('with an empty cache every pixel column inside the Source is drawn, from the overview', () => {
    const { out } = renderTiles(128, [], flat, SECONDS, -5, 65, 700)
    expectNoGaps(out, 700, -5, 65)
    expect(pixel(out, 700, 100, 0)).toEqual(color(30))
  })

  test('with a partly filled cache there are no gaps and ready tiles show their own data', () => {
    const t1 = makeTile(128, 1, samples, () => 90)
    const { out } = renderTiles(128, [t1], flat, SECONDS, -5, 65, 700)
    expectNoGaps(out, 700, -5, 65)
    expect(pixel(out, 700, 89, 1)).toEqual(color(30)) // 3.9 s: tile 0 missing, overview
    expect(pixel(out, 700, 100, 1)).toEqual(color(90)) // 5.0 s: tile 1 (4 to 8 s)
  })

  test('lower-level tiles stand in for whole tiles, with no gaps', () => {
    const t64 = makeTile(64, 0, samples, () => 120) // 0 to 8 s
    const t32 = makeTile(32, 1, samples, () => 160) // 16 to 32 s
    const { out } = renderTiles(128, [t64, t32], flat, SECONDS, -5, 65, 700)
    expectNoGaps(out, 700, -5, 65)
    expect(pixel(out, 700, 80, 0)).toEqual(color(120)) // 3 s
    expect(pixel(out, 700, 125, 0)).toEqual(color(120)) // 7.5 s
    expect(pixel(out, 700, 135, 0)).toEqual(color(30)) // 8.5 s: no tile covers it, overview
  })

  test('at the 32 level a pixel shows the maximum of the columns it covers', () => {
    // Column 40 spans 1.25 to 1.28125 s. 100 pixels over 10 s: a pixel is 0.1 s (3.2 columns).
    const t0 = makeTile(32, 0, samples, (c) => (c === 40 ? 200 : 10))
    const { out } = renderTiles(32, [t0], flat, SECONDS, 0, 10, 100)
    expect(pixel(out, 100, 12, 2)).toEqual(color(200)) // 1.2 to 1.3 s
    expect(pixel(out, 100, 11, 2)).toEqual(color(10))
    expect(pixel(out, 100, 13, 2)).toEqual(color(10))
  })

  test('stretched above the 128 level, a pixel is the column under its centre', () => {
    const t0 = makeTile(128, 0, samples, (c) => (c % 2 === 0 ? 50 : 200))
    // 400 pixels over 1 s: a column (1/128 s) is 3.125 pixels wide.
    const { out } = renderTiles(128, [t0], flat, SECONDS, 0, 1, 400)
    // Centres of pixels 0, 2, 3, 5, 6, 9 are at columns 0, 0, 1, 1, 2, 2...
    expect(pixel(out, 400, 0, 1)).toEqual(color(50))
    expect(pixel(out, 400, 2, 1)).toEqual(color(50)) // 0.8
    expect(pixel(out, 400, 3, 1)).toEqual(color(200)) // 1.12
    expect(pixel(out, 400, 5, 1)).toEqual(color(200)) // 1.76
    expect(pixel(out, 400, 6, 1)).toEqual(color(50)) // 2.08
  })

  test('a bright first column of a tile shows when the pixel centre is in the previous tile', () => {
    const t0 = makeTile(128, 0, samples, () => 10)
    const t1 = makeTile(128, 1, samples, (c) => (c === 512 ? 220 : 10))
    // One pixel over 3.985 to 4.005 s: centre 3.995 s (tile 0), touching columns 510 to 512.
    const both = renderTiles(128, [t0, t1], flat, SECONDS, 3.985, 4.005, 1, 2)
    expect(pixel(both.out, 1, 0, 0)).toEqual(color(220))
    // Next tile not ready: that column is skipped, the pixel is still drawn.
    const only0 = renderTiles(128, [t0], flat, SECONDS, 3.985, 4.005, 1, 2)
    expect(pixel(only0.out, 1, 0, 0)).toEqual(color(10))
  })

  test('the partial last tile and the Source end: the last pixel column is drawn', () => {
    const seconds = 75.000125
    const count = 600001
    const rate = 8000
    const last = {
      ...makeTile(128, 18, 1, () => 77),
      columns: tileColumns(columnCount(count, rate, 128), 18),
    }
    const data = new Uint8Array(last.columns * SPECTROGRAM_ROWS).fill(77)
    const resolved = resolveSpectrogram({
      level: 128,
      startTime: 74,
      endTime: 76,
      kind: 'Total',
      sampleCount: count,
      sampleRate: rate,
      lookup: lookupOf([{ ...last, data }]),
    })
    const out = new Uint8ClampedArray(20 * 2 * 4)
    renderResolvedPixels(
      resolved,
      overviewOf(751, () => 5),
      table,
      { startTime: 74, endTime: 76 },
      seconds,
      20,
      2,
      out,
    )
    for (let x = 0; x < 20; x++) {
      const inside = 74 + x * 0.1 < seconds
      expect(pixel(out, 20, x, 0)[3]).toBe(inside ? 255 : 0)
    }
    expect(pixel(out, 20, 9, 0)).toEqual(color(77)) // 74.9 s, the last pixel starting inside
  })

  describe('work per frame', () => {
    const WIDTH = 3000
    const HEIGHT = 8

    /** Every tile of every level exists (blank data), made on demand. */
    function allTiles(sampleCount: number, levels: readonly DetailLevel[]) {
      const made = new Map<string, DetailTile>()
      return (key: TileKey) => {
        if (!levels.includes(key.level)) return undefined
        const n = tileCount(columnCount(sampleCount, RATE, key.level))
        if (key.index >= n) return undefined
        const id = tileKey(key)
        let tile = made.get(id)
        if (tile === undefined) {
          tile = makeTile(key.level, key.index, sampleCount, (c, r) => (c * 7 + r) & 255)
          made.set(id, tile)
        }
        return tile
      }
    }

    function reads(
      seconds: number,
      level: 'overview' | DetailLevel,
      pixelSeconds: number,
      levels: readonly DetailLevel[],
      start = 20,
    ): number {
      const sampleCount = Math.round(seconds * RATE)
      const end = start + pixelSeconds * WIDTH
      const resolved = resolveSpectrogram({
        level,
        startTime: start,
        endTime: end,
        kind: 'Total',
        sampleCount,
        sampleRate: RATE,
        lookup: allTiles(sampleCount, levels),
      })
      const out = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
      return renderResolvedPixels(
        resolved,
        overviewOf(Math.ceil(seconds * 10), (c, r) => (c + r) & 255),
        table,
        { startTime: start, endTime: end },
        seconds,
        WIDTH,
        HEIGHT,
        out,
      )
    }

    const BOUND = 5 * WIDTH * SPECTROGRAM_ROWS
    // Pixel intervals just above each level's threshold (levels switch at 10, 32, 64 px/s) and at max zoom.
    const cases: [DetailLevel, number][] = [
      [32, 0.099],
      [64, 0.031],
      [128, 0.0155],
      [128, 0.0005],
    ]

    for (const [level, pixelSeconds] of cases) {
      test(`level ${level} at ${pixelSeconds} s per pixel: within 5 columns per pixel column, whatever the duration`, () => {
        const lower = [32, 64, 128].filter((l) => l <= level) as DetailLevel[]
        const cached = reads(1800, level, pixelSeconds, lower)
        const standIns = reads(
          1800,
          level,
          pixelSeconds,
          lower.filter((l) => l < level),
        )
        const short = reads(400, level, pixelSeconds, lower)
        for (const n of [cached, standIns]) {
          expect(n).toBeGreaterThan(0)
          expect(n).toBeLessThanOrEqual(BOUND)
        }
        expect(short).toBe(cached)
      })
    }

    test('the overview level is bounded the same way', () => {
      expect(reads(1800, 'overview', 0.6, [])).toBeLessThanOrEqual(3 * WIDTH * SPECTROGRAM_ROWS)
      expect(reads(60, 'overview', 0.6, [])).toBeLessThanOrEqual(3 * WIDTH * SPECTROGRAM_ROWS)
    })
  })
})
