import { useCallback, useRef } from 'react'
import type { SourceAnalysis } from '@/audio/analysis'
import {
  columnsInsideSource,
  createMirroredColumns,
  readMirroredColumns,
  readSmoothedMirroredColumns,
  smoothingRadiusColumns,
} from '@/timeline/mirrored-waveform'
import type { MirroredColumns } from '@/timeline/mirrored-waveform'
import type { Viewport } from '@/timeline/viewport'
import { waveformStyleStore } from '@/timeline/waveform-style'
import { useCanvasLayer } from './use-canvas-layer'
import type { CanvasFrame } from './use-canvas-layer'

const LABEL_FONT_PX = 11
const LABEL_INSET_PX = 6
/** The peak envelope behind the RMS in the Peak + RMS style. */
const FAINT_PEAK_ALPHA = 0.35
/** The Lane is redrawn when the waveform style changes. */
const STYLE_SUBSCRIPTIONS = [(listener: () => void) => waveformStyleStore.subscribe(listener)]

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
      const waveformStyle = waveformStyleStore.getSnapshot()
      if (waveformStyle === 'smoothed-peak') {
        readSmoothedMirroredColumns(
          analysis,
          frame.viewport,
          ratio,
          columns,
          smoothingRadiusColumns(ratio),
        )
      } else {
        readMirroredColumns(analysis, frame.viewport, ratio, columns)
      }

      const style = getComputedStyle(context.canvas)
      const mid = Math.floor(height / 2)
      const upReach = mid
      const downReach = height - mid

      // Columns starting at or after the end of the Source are left empty.
      const inside = columnsInsideSource(analysis, frame.viewport, ratio, width)

      // Mono is one colour. Stereo gives each Channel its own, so the halves read apart at a glance.
      const upColor = style.getPropertyValue(stereo ? '--waveform-r' : '--waveform')
      const downColor = style.getPropertyValue(stereo ? '--waveform-l' : '--waveform')
      /** One layer of the envelope. Only the solid layer keeps a thin line at the zero line. */
      const drawLayer = (ups: Float32Array, downs: Float32Array, alpha: number) => {
        context.globalAlpha = alpha
        context.fillStyle = upColor
        for (let x = 0; x < inside; x++) {
          const up = Math.round(ups[x]! * upReach)
          if (up > 0) context.fillRect(x, mid - up, 1, up)
        }
        context.fillStyle = downColor
        for (let x = 0; x < inside; x++) {
          const down = Math.round(downs[x]! * downReach)
          // At least one device pixel at the zero line: silence is a thin line.
          const reach = alpha === 1 ? Math.max(1, down) : down
          if (reach > 0) context.fillRect(x, mid, 1, reach)
        }
        context.globalAlpha = 1
      }
      if (waveformStyle === 'peak-rms') {
        drawLayer(columns.up, columns.down, FAINT_PEAK_ALPHA)
        drawLayer(columns.upRms, columns.downRms, 1)
      } else if (waveformStyle === 'rms') {
        drawLayer(columns.upRms, columns.downRms, 1)
      } else {
        drawLayer(columns.up, columns.down, 1)
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
  const canvasRef = useCanvasLayer(viewport, draw, STYLE_SUBSCRIPTIONS)
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={stereo ? 'Mirrored waveform: R above, L below' : 'Mirrored waveform: Mono'}
      className="block min-h-0 w-full flex-1"
    />
  )
}
