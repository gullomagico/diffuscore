// What the Overlay Lane draws behind the waveform. FFT-free: types only from spectrogram.ts.
import type { SourceSpectrograms, SpectrogramOverview } from './spectrogram'

/** The Total spectrogram (stereo) or the Mono Channel's; null when there is none. */
export function backgroundOverview(spectrograms: SourceSpectrograms): SpectrogramOverview | null {
  return spectrograms.total ?? spectrograms.channels[0] ?? null
}
