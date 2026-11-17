/** Maximum zoom: this many seconds across the visible width. */
export const MAX_ZOOM_VISIBLE_SECONDS = 5

export interface ViewportSnapshot {
  /** Seconds: the time at the left edge. */
  readonly startTime: number
  /** CSS pixels per second (Lanes apply the device pixel ratio themselves). */
  readonly pixelsPerSecond: number
  /** CSS pixels. 0 until the first resize. */
  readonly width: number
  /** Seconds: the Source's duration. */
  readonly duration: number
}

export interface Viewport {
  getSnapshot(): ViewportSnapshot
  subscribe(listener: () => void): () => void
  /** Fits the whole Source to the width. */
  fit(): void
  /** Multiplies the zoom by factor, keeping the time under anchorX (CSS pixels from the left edge) under anchorX. */
  zoomAt(factor: number, anchorX: number): void
  /** Scrolls by a distance in CSS pixels (positive = later). */
  scrollBy(deltaPixels: number): void
  resize(width: number): void
}

/** The time<->pixel mapping every Lane and the ruler share. */
export function timeToX(viewport: ViewportSnapshot, time: number): number {
  return (time - viewport.startTime) * viewport.pixelsPerSecond
}

export function xToTime(viewport: ViewportSnapshot, x: number): number {
  if (viewport.pixelsPerSecond <= 0) return 0
  return viewport.startTime + x / viewport.pixelsPerSecond
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createViewport(duration: number): Viewport {
  let snapshot: ViewportSnapshot = { startTime: 0, pixelsPerSecond: 0, width: 0, duration }
  // Explicit state rather than a float comparison of derived values.
  let fitted = true
  const listeners = new Set<() => void>()

  function fitZoom(width: number): number {
    return duration > 0 ? width / duration : 0
  }

  /** Short Sources have a fit beyond the maximum zoom: the zoom is then locked at the fit. */
  function maxZoom(width: number): number {
    return Math.max(fitZoom(width), width / MAX_ZOOM_VISIBLE_SECONDS)
  }

  function clampStart(startTime: number, pixelsPerSecond: number, width: number): number {
    if (pixelsPerSecond <= 0) return 0
    return clamp(startTime, 0, Math.max(0, duration - width / pixelsPerSecond))
  }

  function commit(startTime: number, pixelsPerSecond: number, width: number): void {
    if (
      startTime === snapshot.startTime &&
      pixelsPerSecond === snapshot.pixelsPerSecond &&
      width === snapshot.width
    ) {
      return
    }
    snapshot = { startTime, pixelsPerSecond, width, duration }
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    fit() {
      fitted = true
      commit(0, fitZoom(snapshot.width), snapshot.width)
    },
    zoomAt(factor, anchorX) {
      const { startTime, pixelsPerSecond, width } = snapshot
      if (width <= 0 || pixelsPerSecond <= 0) return
      if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchorX)) return
      const fit = fitZoom(width)
      const next = clamp(pixelsPerSecond * factor, fit, maxZoom(width))
      const anchoredTime = startTime + anchorX / pixelsPerSecond
      fitted = next <= fit
      commit(clampStart(anchoredTime - anchorX / next, next, width), next, width)
    },
    scrollBy(deltaPixels) {
      const { startTime, pixelsPerSecond, width } = snapshot
      if (width <= 0 || pixelsPerSecond <= 0 || !Number.isFinite(deltaPixels)) return
      commit(
        clampStart(startTime + deltaPixels / pixelsPerSecond, pixelsPerSecond, width),
        pixelsPerSecond,
        width,
      )
    },
    resize(width) {
      if (!Number.isFinite(width) || width <= 0) return
      const fit = fitZoom(width)
      if (fitted) {
        commit(0, fit, width)
        return
      }
      const next = clamp(snapshot.pixelsPerSecond, fit, maxZoom(width))
      fitted = next <= fit
      commit(clampStart(snapshot.startTime, next, width), next, width)
    },
  }
}

/** The time range a canvas of deviceWidth device pixels shows: from the left edge, at the current zoom. */
export function visibleTimeRange(
  viewport: ViewportSnapshot,
  deviceWidth: number,
  devicePixelRatio: number,
): { startTime: number; endTime: number } {
  const devicePixelsPerSecond = viewport.pixelsPerSecond * devicePixelRatio
  const seconds = devicePixelsPerSecond > 0 ? deviceWidth / devicePixelsPerSecond : 0
  return { startTime: viewport.startTime, endTime: viewport.startTime + seconds }
}
