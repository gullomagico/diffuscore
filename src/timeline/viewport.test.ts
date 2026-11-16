import { describe, expect, test } from 'vite-plus/test'
import type { Source } from '@/audio/source'
import {
  MAX_ZOOM_VISIBLE_SECONDS,
  createViewport,
  timeToX,
  visibleTimeRange,
  xToTime,
  type ViewportSnapshot,
} from './viewport'

const RATE = 8000

function sourceOf(duration: number): Source {
  return {
    fileName: 'test.wav',
    channels: [new Float32Array(new SharedArrayBuffer(Math.round(duration * RATE) * 4))],
    sampleRate: RATE,
    duration,
  }
}

function viewportOf(duration: number, width = 1000) {
  const viewport = createViewport(sourceOf(duration).duration)
  viewport.resize(width)
  return viewport
}

describe('Viewport', () => {
  test('starts empty until the first resize', () => {
    const viewport = createViewport(100)
    expect(viewport.getSnapshot()).toEqual({
      startTime: 0,
      pixelsPerSecond: 0,
      width: 0,
      duration: 100,
    })
  })

  test('the first resize fits the whole Source to the width', () => {
    const viewport = viewportOf(100)
    expect(viewport.getSnapshot()).toEqual({
      startTime: 0,
      pixelsPerSecond: 10,
      width: 1000,
      duration: 100,
    })
  })

  test('the maximum zoom shows 5 s across the width', () => {
    expect(MAX_ZOOM_VISIBLE_SECONDS).toBe(5)
    const viewport = viewportOf(100)
    viewport.zoomAt(1000, 0)
    expect(viewport.getSnapshot().pixelsPerSecond).toBe(200)
  })

  test('zooming out is limited to the fit', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(4, 0)
    viewport.zoomAt(0.001, 0)
    expect(viewport.getSnapshot().pixelsPerSecond).toBe(10)
    expect(viewport.getSnapshot().startTime).toBe(0)
  })

  test('zoomAt keeps the time under a non-central anchor fixed', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(2, 250)
    const after = viewport.getSnapshot()
    expect(after.pixelsPerSecond).toBe(20)
    expect(xToTime(after, 250)).toBe(25)
    expect(after.startTime).toBe(12.5)
  })

  test('zoomAt to the maximum keeps the anchored time fixed', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(1000, 250)
    const after = viewport.getSnapshot()
    expect(after.startTime).toBe(23.75)
    expect(xToTime(after, 250)).toBe(25)
  })

  test('scrollBy converts pixels to time with the current zoom', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(100)
    expect(viewport.getSnapshot().startTime).toBe(5)
  })

  test('scrollBy is clamped at both ends', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(1_000_000)
    expect(viewport.getSnapshot().startTime).toBe(50)
    viewport.scrollBy(-1_000_000)
    expect(viewport.getSnapshot().startTime).toBe(0)
  })

  test('zooming out near the end clamps the start so the view stays inside the Source', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(1_000_000)
    viewport.zoomAt(0.8, 500)
    const after = viewport.getSnapshot()
    expect(after.pixelsPerSecond).toBe(16)
    expect(after.startTime).toBe(37.5)
  })

  test('zooming out fully near the end returns to the fit', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(2, 0)
    viewport.scrollBy(1_000_000)
    viewport.zoomAt(0.01, 500)
    expect(viewport.getSnapshot().startTime).toBe(0)
    expect(viewport.getSnapshot().pixelsPerSecond).toBe(10)
  })

  test('fit() returns to the whole Source', () => {
    const viewport = viewportOf(100)
    viewport.zoomAt(4, 100)
    viewport.fit()
    expect(viewport.getSnapshot()).toEqual({
      startTime: 0,
      pixelsPerSecond: 10,
      width: 1000,
      duration: 100,
    })
  })

  describe('resize', () => {
    function zoomedViewport() {
      const viewport = viewportOf(100)
      viewport.zoomAt(2, 0)
      viewport.scrollBy(200)
      return viewport // start 10, 20 px/s
    }

    test('keeps the start and the zoom, so more time comes into view', () => {
      const viewport = zoomedViewport()
      viewport.resize(1500)
      expect(viewport.getSnapshot()).toEqual({
        startTime: 10,
        pixelsPerSecond: 20,
        width: 1500,
        duration: 100,
      })
    })

    test('widening past the fit raises the zoom to the new fit', () => {
      const viewport = zoomedViewport()
      viewport.resize(3000)
      expect(viewport.getSnapshot()).toEqual({
        startTime: 0,
        pixelsPerSecond: 30,
        width: 3000,
        duration: 100,
      })
    })

    test('narrowing past the maximum lowers the zoom to the new maximum', () => {
      const viewport = viewportOf(100)
      viewport.zoomAt(1000, 0)
      viewport.scrollBy(4000) // start 20 at 200 px/s
      viewport.resize(500)
      expect(viewport.getSnapshot()).toEqual({
        startTime: 20,
        pixelsPerSecond: 100,
        width: 500,
        duration: 100,
      })
    })

    test('a fitted view stays fitted across many resizes', () => {
      const viewport = viewportOf(100)
      for (const width of [500, 2000, 777, 1000, 3, 4096]) {
        viewport.resize(width)
        expect(viewport.getSnapshot().startTime).toBe(0)
        expect(viewport.getSnapshot().pixelsPerSecond).toBe(width / 100)
      }
    })

    test('zooming out fully re-enters the fitted state', () => {
      const viewport = viewportOf(100)
      viewport.zoomAt(4, 0)
      viewport.zoomAt(0.001, 0)
      viewport.resize(500)
      expect(viewport.getSnapshot().pixelsPerSecond).toBe(5)
    })

    test('zooming in leaves the fitted state', () => {
      const viewport = viewportOf(100)
      viewport.zoomAt(2, 0)
      viewport.resize(500)
      expect(viewport.getSnapshot().pixelsPerSecond).toBe(20)
    })

    test('a zoom clamped up to the new fit counts as fitted afterwards', () => {
      const viewport = zoomedViewport()
      viewport.resize(3000) // 20 -> fit 30
      viewport.resize(1000)
      expect(viewport.getSnapshot().pixelsPerSecond).toBe(10)
    })

    test('a non-positive or non-finite width is ignored', () => {
      const viewport = viewportOf(100)
      const before = viewport.getSnapshot()
      viewport.resize(0)
      viewport.resize(-5)
      viewport.resize(Number.NaN)
      viewport.resize(Number.POSITIVE_INFINITY)
      expect(viewport.getSnapshot()).toBe(before)
    })
  })

  describe('before the first resize', () => {
    test('zoomAt and scrollBy do nothing and do not notify', () => {
      const viewport = createViewport(100)
      let calls = 0
      viewport.subscribe(() => calls++)
      const before = viewport.getSnapshot()
      viewport.zoomAt(2, 0)
      viewport.scrollBy(50)
      viewport.fit()
      expect(viewport.getSnapshot()).toBe(before)
      expect(calls).toBe(0)
    })
  })

  describe('zoom lock for Sources of 5 s or less', () => {
    test.each([
      [5, 200],
      [3, 1000 / 3],
      [1, 1000],
    ])('a %d s Source stays at the fit', (duration, fitPps) => {
      const viewport = viewportOf(duration)
      const before = viewport.getSnapshot()
      expect(before.pixelsPerSecond).toBeCloseTo(fitPps, 9)
      let calls = 0
      viewport.subscribe(() => calls++)
      viewport.zoomAt(3, 400)
      viewport.zoomAt(0.2, 400)
      viewport.scrollBy(300)
      expect(viewport.getSnapshot()).toBe(before)
      expect(calls).toBe(0)
    })
  })

  describe('degenerate Sources', () => {
    test('a duration of 0 produces no NaN or Infinity', () => {
      const viewport = createViewport(0)
      viewport.resize(1000)
      viewport.zoomAt(2, 100)
      viewport.scrollBy(10)
      viewport.fit()
      const snapshot = viewport.getSnapshot()
      expect(snapshot).toEqual({ startTime: 0, pixelsPerSecond: 0, width: 1000, duration: 0 })
      expect(timeToX(snapshot, 0)).toBe(0)
      expect(xToTime(snapshot, 100)).toBe(0)
    })
  })

  describe('store contract', () => {
    test('getSnapshot returns the same object until something changes', () => {
      const viewport = viewportOf(100)
      const first = viewport.getSnapshot()
      expect(viewport.getSnapshot()).toBe(first)
      viewport.zoomAt(2, 0)
      const second = viewport.getSnapshot()
      expect(second).not.toBe(first)
      expect(viewport.getSnapshot()).toBe(second)
    })

    test('notifies on a real change only', () => {
      const viewport = viewportOf(100)
      let calls = 0
      viewport.subscribe(() => calls++)
      viewport.fit() // already fitted
      viewport.zoomAt(1, 100) // factor 1
      viewport.scrollBy(100) // clamped at 0 when fitted
      viewport.resize(1000) // same width
      expect(calls).toBe(0)
      viewport.zoomAt(2, 0)
      expect(calls).toBe(1)
      viewport.scrollBy(100)
      expect(calls).toBe(2)
      viewport.fit()
      expect(calls).toBe(3)
    })

    test('unsubscribe stops notifications', () => {
      const viewport = viewportOf(100)
      let calls = 0
      const unsubscribe = viewport.subscribe(() => calls++)
      unsubscribe()
      viewport.zoomAt(2, 0)
      expect(calls).toBe(0)
    })
  })

  describe('time and pixel mapping', () => {
    const snapshot: ViewportSnapshot = {
      startTime: 10,
      pixelsPerSecond: 20,
      width: 1000,
      duration: 100,
    }

    test('timeToX', () => {
      expect(timeToX(snapshot, 10)).toBe(0)
      expect(timeToX(snapshot, 12.5)).toBe(50)
      expect(timeToX(snapshot, 60)).toBe(1000)
    })

    test('xToTime', () => {
      expect(xToTime(snapshot, 0)).toBe(10)
      expect(xToTime(snapshot, 50)).toBe(12.5)
      expect(xToTime(snapshot, 1000)).toBe(60)
    })

    test('round trip', () => {
      expect(xToTime(snapshot, timeToX(snapshot, 33.25))).toBe(33.25)
      expect(timeToX(snapshot, xToTime(snapshot, 321))).toBe(321)
    })
  })
})

describe('visibleTimeRange', () => {
  const snapshot: ViewportSnapshot = {
    startTime: 10,
    pixelsPerSecond: 50,
    width: 400,
    duration: 100,
  }

  test('spans the device width at the zoom times the device pixel ratio', () => {
    expect(visibleTimeRange(snapshot, 800, 2)).toEqual({ startTime: 10, endTime: 18 })
    expect(visibleTimeRange(snapshot, 400, 1)).toEqual({ startTime: 10, endTime: 18 })
  })

  test('an unfitted viewport (zoom 0) is an empty range at its start', () => {
    const empty = { ...snapshot, pixelsPerSecond: 0 }
    expect(visibleTimeRange(empty, 800, 2)).toEqual({ startTime: 10, endTime: 10 })
  })
})
