import { describe, expect, test } from 'vite-plus/test'
import type { SourceAnalysis } from '@/audio/analysis'
import type { Source } from '@/audio/source'
import {
  SMOOTHING_RADIUS_CSS_PIXELS,
  createMirroredColumns,
  readMirroredColumns,
  readSmoothedMirroredColumns,
  smoothingRadiusColumns,
} from './mirrored-waveform'
import { buildPeakPyramid } from './peaks'
import { buildSourceSpectrograms } from './spectrogram'
import { createViewport } from './viewport'

const RATE = 8000

function analysisOf(
  seconds: number,
  channelCount: number,
  fill: (channel: Float32Array<SharedArrayBuffer>, index: number) => void = () => {},
): SourceAnalysis {
  const length = Math.round(seconds * RATE)
  const channels = Array.from({ length: channelCount }, (_, index) => {
    const data = new Float32Array(new SharedArrayBuffer(length * 4))
    fill(data, index)
    return data
  })
  const source: Source = { fileName: 'test.wav', channels, sampleRate: RATE, duration: seconds }
  return {
    source,
    peaks: { pyramids: channels.map((c) => buildPeakPyramid(c, RATE)) },
    spectrograms: buildSourceSpectrograms(channels, RATE),
  }
}

function viewportOf(duration: number, width: number) {
  const viewport = createViewport(duration)
  viewport.resize(width)
  return viewport
}

function read(analysis: SourceAnalysis, viewport = viewportOf(1, 100), dpr = 1) {
  const columns = Math.round(viewport.getSnapshot().width * dpr)
  const out = createMirroredColumns(columns)
  const reads = readMirroredColumns(analysis, viewport.getSnapshot(), dpr, out)
  return { out, reads }
}

describe('readMirroredColumns', () => {
  test('stereo: R reaches up, L reaches down, by absolute value', () => {
    const analysis = analysisOf(1, 2, (data, index) => data.fill(index === 0 ? 0.25 : -0.5))
    const { out } = read(analysis)
    // the 16-bit storage rounds a peak up by less than one unit
    for (let x = 0; x < 100; x++) {
      expect(out.down[x]).toBeCloseTo(0.25, 4)
      expect(out.up[x]).toBeCloseTo(0.5, 4)
    }
  })

  test('mono: both halves show the single Channel', () => {
    const analysis = analysisOf(1, 1, (data) => data.fill(-0.25))
    const { out } = read(analysis)
    for (let x = 0; x < 100; x++) {
      expect(out.up[x]).toBeCloseTo(0.25, 4)
      expect(out.down[x]).toBeCloseTo(0.25, 4)
    }
  })

  test('a click lands in exactly one column of a scrolled, zoomed Viewport', () => {
    // 10 s, 100 px wide: fit is 10 px/s. Zoom x2 -> 20 px/s (5 s across), then scroll to 5 s.
    const analysis = analysisOf(10, 2, (data, index) => {
      if (index === 1) data[60000] = 0.5 // t = 7.5 s on R
    })
    const viewport = viewportOf(10, 100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(100)
    expect(viewport.getSnapshot().startTime).toBe(5)
    const { out } = read(analysis, viewport)
    const hits = Array.from(out.up).flatMap((v, i) => (v > 0 ? [i] : []))
    expect(hits).toEqual([50]) // (7.5 - 5) s * 20 px/s
    expect(out.up[50]).toBeCloseTo(0.5, 4)
    expect(Array.from(out.down).every((v) => v === 0)).toBe(true)
  })

  test('values above full scale clamp to 1', () => {
    const analysis = analysisOf(1, 2, (data, index) => data.fill(index === 0 ? 1.5 : -3))
    const { out } = read(analysis)
    expect(out.down[10]).toBe(1)
    expect(out.up[10]).toBe(1)
  })

  test('devicePixelRatio 2 doubles the column resolution', () => {
    // Click at sample 4000 (t = 0.5 s) of a 1 s Source: 100 CSS px -> 200 device columns.
    const analysis = analysisOf(1, 1, (data) => {
      data[4000] = 0.5
    })
    const { out } = read(analysis, viewportOf(1, 100), 2)
    expect(out.up.length).toBe(200)
    const hits = Array.from(out.up).flatMap((v, i) => (v > 0 ? [i] : []))
    expect(hits).toEqual([100])
  })

  test('columns past the end of the Source are 0', () => {
    // 1 s Source of DC 0.5, but the Viewport is sized for 2 s (width 100 at 50 px/s => 100 columns over 2 s).
    const analysis = analysisOf(1, 1, (data) => data.fill(0.5))
    const viewport = viewportOf(2, 100)
    const { out } = read(analysis, viewport)
    for (let x = 0; x < 50; x++) expect(out.up[x]).toBeCloseTo(0.5, 4)
    expect(Array.from(out.up.subarray(50))).toEqual(new Array<number>(50).fill(0))
  })

  test('nothing is read when there is no zoom or no column', () => {
    const analysis = analysisOf(1, 2, (data) => data.fill(0.5))
    const unsized = createViewport(1) // pixelsPerSecond 0
    const out = createMirroredColumns(10)
    out.up.fill(0.9)
    expect(readMirroredColumns(analysis, unsized.getSnapshot(), 1, out)).toBe(0)
    expect(Array.from(out.up)).toEqual(new Array<number>(10).fill(0))
    expect(
      readMirroredColumns(analysis, viewportOf(1, 100).getSnapshot(), 1, createMirroredColumns(0)),
    ).toBe(0)
  })

  test('RMS follows the same mapping: R up, L down, Mono both', () => {
    const stereo = analysisOf(1, 2, (data, index) => data.fill(index === 0 ? 0.25 : -0.5))
    const { out } = read(stereo)
    for (let x = 0; x < 100; x++) {
      expect(out.downRms[x]).toBeCloseTo(0.25, 4)
      expect(out.upRms[x]).toBeCloseTo(0.5, 4)
    }
    const mono = read(analysisOf(1, 1, (data) => data.fill(-0.25))).out
    expect(mono.upRms[3]).toBeCloseTo(0.25, 4)
    expect(mono.downRms[3]).toBeCloseTo(0.25, 4)
  })

  test('a click shows its RMS only in its own column, below its peak', () => {
    // Same Viewport as the click test above: 20 px/s from 5 s, level of 256-sample buckets.
    const analysis = analysisOf(10, 2, (data, index) => {
      if (index === 1) data[60000] = 0.5
    })
    const viewport = viewportOf(10, 100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(100)
    const { out } = read(analysis, viewport)
    const hits = Array.from(out.upRms).flatMap((v, i) => (v > 0 ? [i] : []))
    expect(hits).toEqual([50])
    // 0.5 / sqrt(256)
    expect(out.upRms[50]).toBeCloseTo(0.03125, 4)
    expect(out.up[50]).toBeCloseTo(0.5, 4)
    expect(Array.from(out.downRms).every((v) => v === 0)).toBe(true)
  })

  test('columns past the end of the Source have RMS 0', () => {
    const analysis = analysisOf(1, 1, (data) => data.fill(0.5))
    const { out } = read(analysis, viewportOf(2, 100))
    expect(out.upRms[10]).toBeCloseTo(0.5, 4)
    expect(Array.from(out.upRms.subarray(50))).toEqual(new Array<number>(50).fill(0))
  })

  describe('the work of one frame is bounded by the canvas width', () => {
    const CHANNELS = 2
    const FINEST_BUCKET = 8 // samples, at 8000 Hz
    for (const seconds of [180, 1800]) {
      const analysis = analysisOf(seconds, CHANNELS, (data, index) => {
        data[Math.floor(data.length / 2)] = index === 0 ? 0.5 : -0.5
      })
      test(`${seconds} s Source: fit, middle zoom and maximum zoom, 1000 CSS px at dpr 2`, () => {
        const viewport = viewportOf(seconds, 1000)
        for (const zoom of ['fit', 'middle', 'max']) {
          if (zoom === 'middle') viewport.zoomAt(Math.sqrt(seconds / 5), 500)
          if (zoom === 'max') viewport.zoomAt(1e6, 500)
          const { reads } = read(analysis, viewport, 2)
          // 2 Channels * (2 buckets * 2000 columns + the partial last bucket)
          expect(reads).toBeLessThanOrEqual(8002)
        }
        expect(viewport.getSnapshot().pixelsPerSecond).toBe(200) // 1000 px over 5 s
      })
      test(`${seconds} s Source: raw samples at the finest zoom of a 3000 CSS px canvas`, () => {
        const viewport = viewportOf(seconds, 3000)
        viewport.zoomAt(1e6, 1500)
        const { reads } = read(analysis, viewport, 2)
        expect(reads).toBeLessThanOrEqual(2 * 6000 * FINEST_BUCKET)
      })
    }
  })
})

describe('smoothingRadiusColumns', () => {
  test('is 4 CSS pixels times the devicePixelRatio, rounded', () => {
    expect(SMOOTHING_RADIUS_CSS_PIXELS).toBe(4)
    expect(smoothingRadiusColumns(1)).toBe(4)
    expect(smoothingRadiusColumns(2)).toBe(8)
    expect(smoothingRadiusColumns(1.25)).toBe(5)
    expect(smoothingRadiusColumns(1.5)).toBe(6)
    expect(smoothingRadiusColumns(1.1)).toBe(4)
  })
})

describe('readSmoothedMirroredColumns', () => {
  function readSmoothed(
    analysis: SourceAnalysis,
    radius: number,
    viewport = viewportOf(1, 100),
    dpr = 1,
  ) {
    const columns = Math.round(viewport.getSnapshot().width * dpr)
    const out = createMirroredColumns(columns)
    const reads = readSmoothedMirroredColumns(analysis, viewport.getSnapshot(), dpr, out, radius)
    return { out, reads }
  }

  test('DC stays DC, edges of the Source included', () => {
    const analysis = analysisOf(1, 2, (data, index) => data.fill(index === 0 ? 0.25 : -0.5))
    const { out } = readSmoothed(analysis, 3)
    for (let x = 0; x < 100; x++) {
      expect(out.down[x]).toBeCloseTo(0.25, 4)
      expect(out.up[x]).toBeCloseTo(0.5, 4)
    }
  })

  test('a radius of 0 is the plain peak', () => {
    const analysis = analysisOf(1, 1, (data) => {
      data[4000] = 0.5
    })
    const { out } = readSmoothed(analysis, 0)
    const plain = read(analysis).out
    expect(Array.from(out.up)).toEqual(Array.from(plain.up))
  })

  test('a full-scale click spreads to exactly 2 * radius + 1 columns of 1 / (2 * radius + 1)', () => {
    // 1 s over 100 columns: 80 samples per column, so the click at sample 4000 is in column 50 only.
    const analysis = analysisOf(1, 1, (data) => {
      data[4000] = 1
    })
    const { out } = readSmoothed(analysis, 2)
    for (let x = 0; x < 100; x++) {
      const expected = x >= 48 && x <= 52 ? 0.2 : 0
      expect(out.up[x]).toBeCloseTo(expected, 4)
      expect(out.down[x]).toBeCloseTo(expected, 4)
    }
  })

  test('stereo: R is up and L is down', () => {
    const analysis = analysisOf(1, 2, (data, index) => {
      if (index === 1) data[4000] = 1
    })
    const { out } = readSmoothed(analysis, 1)
    expect(out.up[50]).toBeCloseTo(1 / 3, 4)
    expect(Array.from(out.down).every((v) => v === 0)).toBe(true)
  })

  test('scrolling by whole columns shifts the values by exactly that many, at the edges too', () => {
    // 10 s, 100 px, zoom x2 = 20 px/s: a column is 400 samples. Every column gets its own level.
    const analysis = analysisOf(10, 1, (data) => {
      for (let i = 0; i < data.length; i++) {
        data[i] = ((Math.floor(i / 400) * 37) % 11) / 11
      }
    })
    const at = (pixels: number) => {
      const viewport = viewportOf(10, 100)
      viewport.zoomAt(2, 0)
      viewport.scrollBy(pixels)
      return readSmoothed(analysis, 4, viewport).out
    }
    const before = at(20) // starts at 1 s
    const after = at(23) // 3 columns later
    // The first columns are the ones a truncated window would get wrong.
    for (let x = 0; x < 20; x++) expect(after.up[x]).toBeCloseTo(before.up[x + 3]!, 5)
    expect(before.up[0]).not.toBeCloseTo(before.up[5]!, 3)
  })

  test('the start and end of the Source do not average in phantom columns', () => {
    // 1 s of DC 0.5 in a Viewport sized for 2 s: 50 columns inside the Source.
    const analysis = analysisOf(1, 1, (data) => data.fill(0.5))
    const { out } = readSmoothed(analysis, 3, viewportOf(2, 100))
    expect(out.up[0]).toBeCloseTo(0.5, 4)
    expect(out.up[49]).toBeCloseTo(0.5, 4)
    expect(Array.from(out.up.subarray(50))).toEqual(new Array<number>(50).fill(0))
  })

  test('a click just before the end of the Source is not diluted by columns past the end', () => {
    const analysis = analysisOf(1, 1, (data) => {
      data[7999] = 1
    })
    const { out } = readSmoothed(analysis, 2, viewportOf(2, 100))
    // column 49 is the last: its window holds columns 47..49 (3 of them), the click is in 49
    expect(out.up[49]).toBeCloseTo(1 / 3, 4)
    expect(out.up[47]).toBeCloseTo(1 / 5, 4)
    expect(out.up[50]).toBe(0)
  })

  test('nothing is read when there is no zoom or no column', () => {
    const analysis = analysisOf(1, 2, (data) => data.fill(0.5))
    const out = createMirroredColumns(10)
    out.up.fill(0.9)
    expect(readSmoothedMirroredColumns(analysis, createViewport(1).getSnapshot(), 1, out, 3)).toBe(
      0,
    )
    expect(Array.from(out.up)).toEqual(new Array<number>(10).fill(0))
  })

  test('the work of one frame is bounded by the canvas width plus the margins', () => {
    const analysis = analysisOf(1800, 2, (data) => {
      data[Math.floor(data.length / 2)] = 0.5
    })
    const viewport = viewportOf(1800, 1000)
    const { reads } = readSmoothed(analysis, 8, viewport, 2)
    // 2 Channels * 2 buckets per column * (2000 columns + 2 margins of 8) + the partial last bucket
    expect(reads).toBeLessThanOrEqual(2 * (2 * (2000 + 16) + 1))
  })
})
