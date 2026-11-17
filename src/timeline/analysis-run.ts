// The whole analysis of a Source, pure and worker-free: the worker is a thin shell around this.
import type { SourceAnalysisResult } from '@/audio/analysis'
import { buildPeakPyramid } from './peaks'
import { buildSourceSpectrograms } from './spectrogram'

// Shares of the single Analyzing progress bar, proportional to the estimated cost of each phase.
export const PEAKS_PROGRESS_WEIGHT = 0.1
export const SPECTROGRAMS_PROGRESS_WEIGHT = 0.9

/**
 * Builds the peak pyramids (one per Channel), then the overview spectrograms (one pass for all
 * Channels). onProgress receives a monotonic 0..1 fraction over both phases, ending with exactly 1.
 */
export function runAnalysis(
  channels: readonly Float32Array[],
  sampleRate: number,
  onProgress: (fraction: number) => void,
): SourceAnalysisResult {
  let last = 0
  const report = (fraction: number) => {
    last = Math.max(last, Math.min(1, fraction))
    onProgress(last)
  }

  const pyramids = channels.map((samples, index) =>
    buildPeakPyramid(samples, sampleRate, (fraction) => {
      report(((index + fraction) / channels.length) * PEAKS_PROGRESS_WEIGHT)
    }),
  )
  report(PEAKS_PROGRESS_WEIGHT)

  const spectrograms = buildSourceSpectrograms(channels, sampleRate, (fraction) => {
    report(PEAKS_PROGRESS_WEIGHT + fraction * SPECTROGRAMS_PROGRESS_WEIGHT)
  })
  report(1)
  return { peaks: { pyramids }, spectrograms }
}

/** Every buffer of a result, each once: what the worker transfers to the main thread. */
export function transferListOf(result: SourceAnalysisResult): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const pyramid of result.peaks.pyramids) {
    for (const level of pyramid.levels) {
      buffers.add(level.min.buffer as ArrayBuffer)
      buffers.add(level.max.buffer as ArrayBuffer)
      buffers.add(level.rms.buffer as ArrayBuffer)
    }
  }
  const { channels, total } = result.spectrograms
  for (const overview of total === null ? channels : [...channels, total]) {
    for (const level of overview.levels) buffers.add(level.data.buffer as ArrayBuffer)
  }
  return [...buffers]
}
