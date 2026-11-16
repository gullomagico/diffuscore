// requestAnimationFrame scheduler: many invalidations, one draw per frame.

export interface FrameScheduler {
  /** Requests a draw on the next frame. Calls made before that frame share it. */
  invalidate: () => void
  /** Cancels any pending frame. invalidate() does nothing afterwards. */
  dispose: () => void
}

export function createFrameScheduler(
  draw: () => void,
  raf: (callback: () => void) => number = (callback) => requestAnimationFrame(callback),
  caf: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): FrameScheduler {
  let pending: number | null = null
  let disposed = false
  return {
    invalidate() {
      if (disposed || pending !== null) return
      pending = raf(() => {
        pending = null
        draw()
      })
    },
    dispose() {
      disposed = true
      if (pending !== null) caf(pending)
      pending = null
    },
  }
}
