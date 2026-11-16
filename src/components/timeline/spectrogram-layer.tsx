import { useCallback, useRef } from 'react'
import type { SourceAnalysis } from '@/audio/analysis'
import {
  createCanvas2DSpectrogramRenderer,
  createColorTable,
} from '@/timeline/spectrogram-renderer'
import type { SpectrogramRenderer } from '@/timeline/spectrogram-renderer'
import { useCanvasLayer } from './use-canvas-layer'
import type { CanvasFrame } from './use-canvas-layer'
import type { Viewport } from '@/timeline/viewport'

const COLOR_TABLE = createColorTable()

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
  const overview = stereo
    ? analysis.spectrograms.total
    : (analysis.spectrograms.channels[0] ?? null)
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
      const { startTime, pixelsPerSecond } = frame.viewport
      rendererRef.current.renderer.draw(
        overview,
        COLOR_TABLE,
        { startTime, endTime: startTime + width / (pixelsPerSecond * ratio) },
        analysis.source.duration,
        { x: 0, y: 0, width, height },
      )
    },
    [analysis, overview],
  )
  const canvasRef = useCanvasLayer(viewport, draw)
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={stereo ? 'Total spectrogram' : 'Mono spectrogram'}
      className="absolute inset-0 block h-full w-full"
    />
  )
}
