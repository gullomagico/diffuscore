import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { SourceAnalysis } from '@/audio/analysis'
import { createViewport } from '@/timeline/viewport'
import { MirroredWaveformLane } from './mirrored-waveform-lane'
import { TimeRuler } from './time-ruler'

/** Zoom step of the + and - keys. */
const KEY_ZOOM_FACTOR = 1.5
/** Scroll step of the arrow keys, as a fraction of the Timeline's width. */
const KEY_SCROLL_FRACTION = 0.1
/** Zoom per pixel of wheel delta (Ctrl or Meta + wheel). */
const WHEEL_ZOOM_PER_PIXEL = 0.002
const PIXELS_PER_LINE = 16

export function Timeline({ analysis }: { analysis: SourceAnalysis }) {
  // One Viewport per Source.
  const viewport = useMemo(() => createViewport(analysis.source.duration), [analysis.source])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) viewport.resize(entry.contentRect.width)
    })
    observer.observe(element)
    viewport.resize(element.clientWidth)

    // Native and non-passive: React's onWheel cannot reliably preventDefault.
    const onWheel = (event: WheelEvent) => {
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? PIXELS_PER_LINE
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.getSnapshot().width
            : 1
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const x = event.clientX - element.getBoundingClientRect().left
        viewport.zoomAt(Math.exp(-event.deltaY * unit * WHEEL_ZOOM_PER_PIXEL), x)
        return
      }
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      viewport.scrollBy(delta * unit)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [viewport])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const { width } = viewport.getSnapshot()
    switch (event.key) {
      case '+':
      case '=':
        viewport.zoomAt(KEY_ZOOM_FACTOR, width / 2)
        break
      case '-':
      case '_':
        viewport.zoomAt(1 / KEY_ZOOM_FACTOR, width / 2)
        break
      case 'ArrowRight':
        viewport.scrollBy(width * KEY_SCROLL_FRACTION)
        break
      case 'ArrowLeft':
        viewport.scrollBy(-width * KEY_SCROLL_FRACTION)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex h-full flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <TimeRuler viewport={viewport} />
      <MirroredWaveformLane analysis={analysis} viewport={viewport} />
    </div>
  )
}
