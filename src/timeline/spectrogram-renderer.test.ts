import { describe, expect, test } from 'vite-plus/test'
import { SPECTROGRAM_ROWS } from './frequency-axis'
import { buildColumnMaxLevels, buildSourceSpectrograms } from './spectrogram'
import type { SpectrogramOverview } from './spectrogram'
import {
  createCanvas2DSpectrogramRenderer,
  createColorTable,
  renderSpectrogramPixels,
} from './spectrogram-renderer'

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
    renderer.draw(overview, table, { startTime: 0, endTime: 0.2 }, 0.2, rect)
    renderer.draw(overview, table, { startTime: 0, endTime: 0.2 }, 0.2, rect)
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
