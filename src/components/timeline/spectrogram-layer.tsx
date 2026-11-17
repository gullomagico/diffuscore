import { useCallback, useRef } from 'react'
import type { SourceAnalysis } from '@/audio/analysis'
import { backgroundOverview } from '@/timeline/overlay'
import { columnCount } from '@/timeline/detail-tile'
import { chooseLevel, devicePixelsPerSecond, wantedTiles } from '@/timeline/detail-level'
import { detailTiles } from '@/timeline/tile-manager-browser'
import { resolveSpectrogram } from '@/timeline/tile-resolver'
import {
  createCanvas2DSpectrogramRenderer,
  createColorTable,
} from '@/timeline/spectrogram-renderer'
import type { SpectrogramRenderer } from '@/timeline/spectrogram-renderer'
import { useCanvasLayer } from './use-canvas-layer'
import type { CanvasFrame } from './use-canvas-layer'
import { visibleTimeRange } from '@/timeline/viewport'
import type { Viewport } from '@/timeline/viewport'

const COLOR_TABLE = createColorTable()
// A tile arriving redraws this canvas only. Stable between renders, as useCanvasLayer requires.
const TILE_SUBSCRIPTIONS = [detailTiles.subscribe]

/**
 * The bottom canvas of the Overlay Lane: the Total spectrogram (Mono: the Mono Channel's). It does
 * not subscribe to the waveform style, so changing that style never redraws it. Pixels past the
 * Source's end stay transparent: the Lane's background shows through.
 */
export function SpectrogramLayer({
  analysis,
  viewport,
}: {
  analysis: SourceAnalysis
  viewport: Viewport
}) {
  const stereo = analysis.source.channels.length > 1
  const overview = backgroundOverview(analysis.spectrograms)
  // One renderer per context: it keeps its working memory between frames.
  const rendererRef = useRef<{
    context: CanvasRenderingContext2D
    renderer: SpectrogramRenderer
  } | null>(null)

  const draw = useCallback(
    (context: CanvasRenderingContext2D, frame: CanvasFrame) => {
      const { width, height, devicePixelRatio: ratio } = frame
      if (width === 0 || height === 0 || overview === null) return
      if (rendererRef.current?.context !== context) {
        rendererRef.current = { context, renderer: createCanvas2DSpectrogramRenderer(context) }
      }
      const range = visibleTimeRange(frame.viewport, width, ratio)
      const kind = stereo ? 'Total' : 'Mono'
      const sampleCount = analysis.source.channels[0]?.length ?? 0
      const sampleRate = analysis.source.sampleRate
      const level = chooseLevel(devicePixelsPerSecond(frame.viewport.pixelsPerSecond, ratio))
      // The overview has no detail columns, and wantedTiles wants no tiles for it.
      const levelColumns = level === 'overview' ? 0 : columnCount(sampleCount, sampleRate, level)
      const wanted = wantedTiles(range.startTime, range.endTime, level, levelColumns)
      detailTiles.want(analysis.source, wanted, [kind])
      const resolved = resolveSpectrogram({
        level,
        startTime: range.startTime,
        endTime: range.endTime,
        kind,
        sampleCount,
        sampleRate,
        lookup: detailTiles.lookup,
      })
      rendererRef.current.renderer.draw(
        resolved,
        overview,
        COLOR_TABLE,
        range,
        analysis.source.duration,
        { x: 0, y: 0, width, height },
      )
      for (const tile of resolved.used) detailTiles.touch(tile)
      context.canvas.dataset.detail = detailTiles.getSnapshot().failed ? 'failed' : resolved.detail
    },
    [analysis, overview, stereo],
  )
  const canvasRef = useCanvasLayer(viewport, draw, TILE_SUBSCRIPTIONS)
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={stereo ? 'Total spectrogram' : 'Mono spectrogram'}
      className="absolute inset-0 block h-full w-full"
    />
  )
}
