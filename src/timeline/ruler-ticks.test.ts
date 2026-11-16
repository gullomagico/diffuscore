import { describe, expect, test } from 'vite-plus/test'
import { MIN_LABEL_SPACING_PX, rulerTicks } from './ruler-ticks'
import type { ViewportSnapshot } from './viewport'

function labelled(viewport: ViewportSnapshot) {
  return rulerTicks(viewport).filter((tick) => tick.label !== null)
}

describe('rulerTicks', () => {
  test('labels are at least 64 px apart', () => {
    expect(MIN_LABEL_SPACING_PX).toBe(64)
  })

  test('fit of a 30-minute Source at 1000 px labels every 120 s', () => {
    // 1000 / 1800 = 0.5556 px/s: 60 s is 33 px, 120 s is 67 px (first step >= 64 px).
    const ticks = labelled({
      startTime: 0,
      pixelsPerSecond: 1000 / 1800,
      width: 1000,
      duration: 1800,
    })
    expect(ticks.slice(0, 4).map((t) => [t.time, t.label])).toEqual([
      [0, '00:00'],
      [120, '02:00'],
      [240, '04:00'],
      [360, '06:00'],
    ])
    expect(ticks.at(-1)).toEqual({ time: 1800, label: '30:00' })
  })

  test('at the maximum zoom, labels every 1 s with unlabelled sub-second ticks', () => {
    const ticks = rulerTicks({ startTime: 0, pixelsPerSecond: 200, width: 1000, duration: 100 })
    expect(ticks.filter((t) => t.label !== null).map((t) => t.label)).toEqual([
      '00:00',
      '00:01',
      '00:02',
      '00:03',
      '00:04',
      '00:05',
    ])
    expect(ticks.slice(0, 3)).toEqual([
      { time: 0, label: '00:00' },
      { time: 0.1, label: null },
      { time: 0.2, label: null },
    ])
  })

  test('sub-second tick times carry no floating-point drift', () => {
    const ticks = rulerTicks({ startTime: 0, pixelsPerSecond: 200, width: 1000, duration: 100 })
    expect(ticks[3]!.time).toBe(0.3)
    expect(ticks[7]!.time).toBe(0.7)
  })

  test('a scrolled Viewport starts at the first tick inside it', () => {
    const ticks = rulerTicks({ startTime: 12.34, pixelsPerSecond: 200, width: 1000, duration: 100 })
    expect(ticks[0]).toEqual({ time: 12.4, label: null })
    expect(ticks.find((t) => t.label !== null)).toEqual({ time: 13, label: '00:13' })
    expect(ticks.at(-1)!.time).toBe(17.3)
  })

  test('minutes may exceed 59', () => {
    const ticks = labelled({ startTime: 3600, pixelsPerSecond: 200, width: 1000, duration: 7200 })
    expect(ticks[0]).toEqual({ time: 3600, label: '60:00' })
  })

  test('never returns ticks beyond the Source', () => {
    const ticks = rulerTicks({ startTime: 0, pixelsPerSecond: 200, width: 1000, duration: 3 })
    expect(ticks.at(-1)).toEqual({ time: 3, label: '00:03' })
  })

  test('a 1 s Source shows the 00:00 label', () => {
    const ticks = rulerTicks({ startTime: 0, pixelsPerSecond: 1000, width: 1000, duration: 1 })
    expect(ticks[0]).toEqual({ time: 0, label: '00:00' })
    expect(ticks.filter((t) => t.label !== null).map((t) => t.label)).toEqual(['00:00', '00:01'])
  })

  test('empty when the Viewport has no width or zoom', () => {
    expect(rulerTicks({ startTime: 0, pixelsPerSecond: 0, width: 0, duration: 100 })).toEqual([])
    expect(rulerTicks({ startTime: 0, pixelsPerSecond: 0, width: 800, duration: 0 })).toEqual([])
  })

  describe('over a sweep of zooms', () => {
    const duration = 7200
    const width = 1000
    const snapshots: ViewportSnapshot[] = []
    for (let pps = width / duration; pps <= width / 5 + 1e-9; pps *= 1.07) {
      for (const frac of [0, 0.37, 1]) {
        const span = width / pps
        snapshots.push({
          startTime: (duration - span) * frac,
          pixelsPerSecond: pps,
          width,
          duration,
        })
      }
    }

    test('labels never come closer than the minimum spacing', () => {
      for (const viewport of snapshots) {
        const labels = labelled(viewport)
        for (let i = 1; i < labels.length; i++) {
          const gap = (labels[i]!.time - labels[i - 1]!.time) * viewport.pixelsPerSecond
          expect(gap).toBeGreaterThanOrEqual(MIN_LABEL_SPACING_PX - 1e-9)
        }
      }
    })

    test('at least two labels are always visible', () => {
      for (const viewport of snapshots) {
        expect(labelled(viewport).length).toBeGreaterThanOrEqual(2)
      }
    })

    test('the tick count is bounded by the width and ascending', () => {
      for (const viewport of snapshots) {
        const ticks = rulerTicks(viewport)
        expect(ticks.length).toBeLessThanOrEqual(width / 6 + 2)
        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i]!.time).toBeGreaterThan(ticks[i - 1]!.time)
        }
      }
    })
  })
})
