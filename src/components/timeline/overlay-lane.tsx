import type { SourceAnalysis } from '@/audio/analysis'
import { FREQUENCY_LABELS } from '@/timeline/frequency-axis'
import {
  FREQUENCY_LABEL_BACKING,
  FREQUENCY_LABEL_FONT_PX,
  FREQUENCY_LABEL_INSET_PX,
  LANE_BACKGROUND,
  LANE_TEXT_COLOR,
} from '@/timeline/lane-look'
import type { Viewport } from '@/timeline/viewport'
import { MirroredWaveformLayer } from './mirrored-waveform-layer'
import { SpectrogramLayer } from './spectrogram-layer'

/**
 * The Timeline's single Lane: the spectrogram as background, the Mirrored waveform on top, and the
 * frequency axis labels on its right edge. The labels are an HTML overlay rather than canvas text:
 * they sit at fixed percentages of the Lane's height, never change with the Viewport, so they need
 * no redraw, stay crisp at any devicePixelRatio, and are not touched by the waveform style.
 */
export function OverlayLane({
  analysis,
  viewport,
}: {
  analysis: SourceAnalysis
  viewport: Viewport
}) {
  return (
    <div className="relative min-h-0 flex-1" style={{ backgroundColor: LANE_BACKGROUND }}>
      <SpectrogramLayer analysis={analysis} viewport={viewport} />
      <MirroredWaveformLayer analysis={analysis} viewport={viewport} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {FREQUENCY_LABELS.map((label) => (
          <span
            key={label.text}
            className="absolute translate-y-1/2 rounded-sm px-1 leading-none"
            style={{
              bottom: `${label.fromBottom * 100}%`,
              right: FREQUENCY_LABEL_INSET_PX,
              fontSize: FREQUENCY_LABEL_FONT_PX,
              color: LANE_TEXT_COLOR,
              backgroundColor: FREQUENCY_LABEL_BACKING,
            }}
          >
            {label.text}
          </span>
        ))}
      </div>
    </div>
  )
}
