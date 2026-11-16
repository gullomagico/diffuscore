import { describe, expect, test } from 'vite-plus/test'
import type { SourceAnalysis } from '@/audio/analysis'
import type { Source } from '@/audio/source'
import { createMirroredColumns, readMirroredColumns } from './mirrored-waveform'
import { buildPeakPyramid } from './peaks'
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
  return { source, peaks: { pyramids: channels.map((c) => buildPeakPyramid(c, RATE)) } }
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
    expect(Array.from(out.down)).toEqual(new Array<number>(100).fill(0.25))
    expect(Array.from(out.up)).toEqual(new Array<number>(100).fill(0.5))
  })

  test('mono: both halves show the single Channel', () => {
    const analysis = analysisOf(1, 1, (data) => data.fill(-0.25))
    const { out } = read(analysis)
    expect(Array.from(out.up)).toEqual(new Array<number>(100).fill(0.25))
    expect(Array.from(out.down)).toEqual(new Array<number>(100).fill(0.25))
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
    expect(out.up[50]).toBe(0.5)
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
    expect(Array.from(out.up.subarray(0, 50))).toEqual(new Array<number>(50).fill(0.5))
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
