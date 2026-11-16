import { useCallback } from 'react'
import { rulerTicks } from '@/timeline/ruler-ticks'
import { timeToX } from '@/timeline/viewport'
import type { Viewport } from '@/timeline/viewport'
import { useCanvasLayer } from './use-canvas-layer'
import type { CanvasFrame } from './use-canvas-layer'

export const RULER_HEIGHT_PX = 24
const LABELLED_TICK_PX = 12
const MINOR_TICK_PX = 5
const LABEL_FONT_PX = 11

export function TimeRuler({ viewport }: { viewport: Viewport }) {
  const draw = useCallback((context: CanvasRenderingContext2D, frame: CanvasFrame) => {
    const { width, height, devicePixelRatio: ratio } = frame
    const style = getComputedStyle(context.canvas)
    const tickColor = style.getPropertyValue('--muted-foreground')
    const lineColor = style.getPropertyValue('--border')
    context.fillStyle = lineColor
    context.fillRect(0, height - 1, width, 1)
    context.fillStyle = tickColor
    context.font = `${LABEL_FONT_PX * ratio}px ${style.fontFamily}`
    context.textBaseline = 'top'
    const tickWidth = Math.max(1, Math.round(ratio))
    for (const tick of rulerTicks(frame.viewport)) {
      const x = Math.round(timeToX(frame.viewport, tick.time) * ratio)
      const tall = tick.label !== null
      const tickHeight = Math.round((tall ? LABELLED_TICK_PX : MINOR_TICK_PX) * ratio)
      context.fillRect(x, height - tickHeight, tickWidth, tickHeight)
      if (tick.label !== null) context.fillText(tick.label, x + 4 * ratio, 2 * ratio)
    }
  }, [])
  const canvasRef = useCanvasLayer(viewport, draw)
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Time ruler"
      className="block w-full shrink-0 text-muted-foreground"
      style={{ height: RULER_HEIGHT_PX }}
    />
  )
}
