import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { subscribeTheme } from '@/lib/theme'
import { createFrameScheduler } from '@/timeline/frame'
import type { Viewport, ViewportSnapshot } from '@/timeline/viewport'

export interface CanvasFrame {
  /** Canvas size in device pixels. */
  readonly width: number
  readonly height: number
  readonly devicePixelRatio: number
  readonly viewport: ViewportSnapshot
}

/**
 * Draws a canvas outside React's render cycle: one requestAnimationFrame after the Viewport, the
 * size, the devicePixelRatio or `draw` changed. `draw` is given a cleared canvas in device pixels.
 */
export function useCanvasLayer(
  viewport: Viewport,
  draw: (context: CanvasRenderingContext2D, frame: CanvasFrame) => void,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  const invalidateRef = useRef<() => void>(() => {})

  useEffect(() => {
    drawRef.current = draw
    invalidateRef.current()
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const scheduler = createFrameScheduler(() => {
      const devicePixelRatio = window.devicePixelRatio || 1
      const width = Math.round(canvas.clientWidth * devicePixelRatio)
      const height = Math.round(canvas.clientHeight * devicePixelRatio)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      context.clearRect(0, 0, width, height)
      drawRef.current(context, {
        width,
        height,
        devicePixelRatio,
        viewport: viewport.getSnapshot(),
      })
    })
    invalidateRef.current = scheduler.invalidate

    const unsubscribe = viewport.subscribe(scheduler.invalidate)
    const unsubscribeTheme = subscribeTheme(scheduler.invalidate)
    const resizeObserver = new ResizeObserver(scheduler.invalidate)
    resizeObserver.observe(canvas)

    // A change of devicePixelRatio (zoomed page, another screen) fires no resize.
    let ratioQuery: MediaQueryList | null = null
    const watchRatio = () => {
      ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      ratioQuery.addEventListener('change', onRatioChange, { once: true })
    }
    function onRatioChange() {
      scheduler.invalidate()
      watchRatio()
    }
    watchRatio()

    scheduler.invalidate()
    return () => {
      ratioQuery?.removeEventListener('change', onRatioChange)
      resizeObserver.disconnect()
      unsubscribe()
      unsubscribeTheme()
      scheduler.dispose()
      invalidateRef.current = () => {}
    }
  }, [viewport])

  return canvasRef
}
