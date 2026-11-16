import { sourceStore } from '@/audio/source'
import type { Source, SourceStore } from '@/audio/source'
import type { SourcePeaks } from '@/timeline/peaks'
import type { SourceSpectrograms } from '@/timeline/spectrogram'

/** What analyzing a Source produces: its peak pyramids and its overview spectrograms. */
export interface SourceAnalysisResult {
  readonly peaks: SourcePeaks
  readonly spectrograms: SourceSpectrograms
}

/** The analysis of a Source, ready to draw: the Source and everything derived from it. */
export interface SourceAnalysis extends SourceAnalysisResult {
  readonly source: Source
}

export interface AnalyzeOptions {
  /** 0..1 over all the analysis work. */
  onProgress(fraction: number): void
  signal: AbortSignal
}

/** The injected analysis step: builds the peaks and overview spectrograms of a Source. Rejects when aborted or when the analysis fails. */
export type Analyze = (source: Source, options: AnalyzeOptions) => Promise<SourceAnalysisResult>

export interface AnalysisStore {
  getSnapshot(): SourceAnalysis | null
  subscribe(listener: () => void): () => void
  /** Publishes the analysis of the current Source. Ignored if `source` is not the Source currently in the SourceStore. */
  publish(source: Source, result: SourceAnalysisResult): void
  release(): void
}

export function createAnalysisStore(sources: SourceStore): AnalysisStore {
  let current: SourceAnalysis | null = null
  const listeners = new Set<() => void>()

  function set(next: SourceAnalysis | null): void {
    current = next
    for (const listener of [...listeners]) listener()
  }

  // The analysis lives and dies with its Source, whoever releases or replaces it.
  sources.subscribe(() => {
    if (current !== null && sources.getSnapshot() !== current.source) set(null)
  })

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(source, result) {
      if (sources.getSnapshot() !== source) return
      set({ source, peaks: result.peaks, spectrograms: result.spectrograms })
    },
    release() {
      if (current !== null) set(null)
    },
  }
}

export const analysisStore: AnalysisStore = createAnalysisStore(sourceStore)
