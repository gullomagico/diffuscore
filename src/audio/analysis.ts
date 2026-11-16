import { sourceStore } from '@/audio/source'
import type { Source, SourceStore } from '@/audio/source'
import type { SourcePeaks } from '@/timeline/peaks'

/** The analysis of a Source, ready to draw. Later slices add spectrograms here. */
export interface SourceAnalysis {
  readonly source: Source
  readonly peaks: SourcePeaks
}

export interface AnalyzeOptions {
  /** 0..1 over all the analysis work. */
  onProgress(fraction: number): void
  signal: AbortSignal
}

/** The injected analysis step: builds the peak data of a Source. Rejects when aborted or when the analysis fails. */
export type Analyze = (source: Source, options: AnalyzeOptions) => Promise<SourcePeaks>

export interface AnalysisStore {
  getSnapshot(): SourceAnalysis | null
  subscribe(listener: () => void): () => void
  /** Publishes the analysis of the current Source. Ignored if `source` is not the Source currently in the SourceStore. */
  publish(source: Source, peaks: SourcePeaks): void
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
    publish(source, peaks) {
      if (sources.getSnapshot() !== source) return
      set({ source, peaks })
    },
    release() {
      if (current !== null) set(null)
    },
  }
}

export const analysisStore: AnalysisStore = createAnalysisStore(sourceStore)
