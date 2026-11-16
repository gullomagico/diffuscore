import { describe, expect, test } from 'vite-plus/test'
import { createFrameScheduler } from './frame'

/** A hand-cranked requestAnimationFrame. */
function fakeFrames() {
  const pending = new Map<number, () => void>()
  let next = 1
  return {
    raf: (callback: () => void) => {
      pending.set(next, callback)
      return next++
    },
    caf: (handle: number) => {
      pending.delete(handle)
    },
    run: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback()
    },
    count: () => pending.size,
  }
}

describe('createFrameScheduler', () => {
  test('nothing is drawn until something is invalidated', () => {
    const frames = fakeFrames()
    let draws = 0
    createFrameScheduler(() => draws++, frames.raf, frames.caf)
    frames.run()
    expect(draws).toBe(0)
  })

  test('many invalidations before a frame share one draw', () => {
    const frames = fakeFrames()
    let draws = 0
    const scheduler = createFrameScheduler(() => draws++, frames.raf, frames.caf)
    scheduler.invalidate()
    scheduler.invalidate()
    scheduler.invalidate()
    expect(frames.count()).toBe(1)
    frames.run()
    expect(draws).toBe(1)
  })

  test('an invalidation after a frame draws again', () => {
    const frames = fakeFrames()
    let draws = 0
    const scheduler = createFrameScheduler(() => draws++, frames.raf, frames.caf)
    scheduler.invalidate()
    frames.run()
    scheduler.invalidate()
    frames.run()
    expect(draws).toBe(2)
  })

  test('dispose cancels the pending frame and later invalidations', () => {
    const frames = fakeFrames()
    let draws = 0
    const scheduler = createFrameScheduler(() => draws++, frames.raf, frames.caf)
    scheduler.invalidate()
    scheduler.dispose()
    scheduler.invalidate()
    frames.run()
    expect(draws).toBe(0)
    expect(frames.count()).toBe(0)
  })
})
