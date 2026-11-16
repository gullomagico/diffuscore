import { useCallback, useRef } from 'react'
import type { SourceAnalysis } from '@/audio/analysis'
import {
  columnsInsideSource,
  createMirroredColumns,
  readMirroredColumns,
} from '@/timeline/mirrored-waveform'
import type { MirroredColumns } from '@/timeline/mirrored-waveform'
import type { Viewport } from '@/timeline/viewport'
import { useCanvasLayer } from './use-canvas-layer'
import type { CanvasFrame } from './use-canvas-layer'

const LABEL_FONT_PX = 11
const LABEL_INSET_PX = 6

export function MirroredWaveformLane({
  analysis,
  viewport,
}: {
  analysis: SourceAnalysis
  viewport: Viewport
}) {
  const stereo = analysis.source.channels.length > 1
  // Re-created only when the canvas gains or loses columns.
  const columnsRef = useRef<MirroredColumns | null>(null)

  const draw = useCallback(
    (context: CanvasRenderingContext2D, frame: CanvasFrame) => {
      const { width, height, devicePixelRatio: ratio } = frame
      if (width === 0 || height === 0) return
      if (columnsRef.current?.up.length !== width) columnsRef.current = createMirroredColumns(width)
      const columns = columnsRef.current
      readMirroredColumns(analysis, frame.viewport, ratio, columns)

      const style = getComputedStyle(context.canvas)
      const mid = Math.floor(height / 2)
      const upReach = mid
      const downReach = height - mid

      // Columns starting at or after the end of the Source are left empty.
      const inside = columnsInsideSource(analysis, frame.viewport, ratio, width)

      // Mono is one colour. Stereo gives each Channel its own, so the halves read apart at a glance.
      const upColor = style.getPropertyValue(stereo ? '--waveform-r' : '--waveform')
      const downColor = style.getPropertyValue(stereo ? '--waveform-l' : '--waveform')
      context.fillStyle = upColor
      for (let x = 0; x < inside; x++) {
        const up = Math.round(columns.up[x]! * upReach)
        if (up > 0) context.fillRect(x, mid - up, 1, up)
      }
      context.fillStyle = downColor
      for (let x = 0; x < inside; x++) {
        // At least one device pixel at the zero line: silence is a thin line.
        const down = Math.max(1, Math.round(columns.down[x]! * downReach))
        context.fillRect(x, mid, 1, down)
      }

      // The Channel labels double as the colour legend.
      context.font = `${LABEL_FONT_PX * ratio}px ${style.fontFamily}`
      context.textBaseline = 'top'
      const inset = LABEL_INSET_PX * ratio
      if (stereo) {
        context.fillStyle = upColor
        context.fillText('R', inset, inset)
        // In the far corner of its half, mirroring R: next to the zero line the envelope would cover it.
        context.fillStyle = downColor
        context.textBaseline = 'bottom'
        context.fillText('L', inset, height - inset)
      } else {
        context.fillStyle = style.getPropertyValue('--muted-foreground')
        context.fillText('Mono', inset, inset)
      }
    },
    [analysis, stereo],
  )
  const canvasRef = useCanvasLayer(viewport, draw)
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={stereo ? 'Mirrored waveform: R above, L below' : 'Mirrored waveform: Mono'}
      className="block min-h-0 w-full flex-1"
    />
  )
}
