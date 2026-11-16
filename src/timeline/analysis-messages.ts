import type { SourcePeaks } from './peaks'

/** Main thread -> analysis worker. The channels are shared memory: nothing is copied. */
export interface AnalysisRequest {
  readonly channels: readonly Float32Array<SharedArrayBuffer>[]
  readonly sampleRate: number
}

/** Analysis worker -> main thread. */
export type AnalysisMessage =
  | { readonly type: 'progress'; readonly fraction: number }
  | { readonly type: 'done'; readonly peaks: SourcePeaks }
