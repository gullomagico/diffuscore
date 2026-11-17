import type { Analyze, SourceAnalysisResult } from '@/audio/analysis'
import type { AnalysisMessage, AnalysisRequest } from './analysis-messages'

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The analysis was aborted', 'AbortError')
}

/** Builds the peaks and spectrograms in a worker. The worker is terminated whatever the outcome. */
export const analyzeInWorker: Analyze = (source, options) =>
  new Promise<SourceAnalysisResult>((resolve, reject) => {
    const { signal } = options
    if (signal.aborted) {
      reject(abortReason(signal))
      return
    }
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })

    function settle(finish: () => void): void {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.removeEventListener('messageerror', onMessageError)
      signal.removeEventListener('abort', onAbort)
      worker.terminate()
      finish()
    }
    function onMessage(event: MessageEvent<AnalysisMessage>): void {
      const message = event.data
      if (message.type === 'progress') options.onProgress(message.fraction)
      else settle(() => resolve(message.result))
    }
    function onError(event: ErrorEvent): void {
      settle(() => reject(new Error(event.message || 'The analysis worker failed')))
    }
    function onMessageError(): void {
      settle(() => reject(new Error('The analysis worker sent an unreadable message')))
    }
    function onAbort(): void {
      settle(() => reject(abortReason(signal)))
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.addEventListener('messageerror', onMessageError)
    signal.addEventListener('abort', onAbort)
    const request: AnalysisRequest = { channels: source.channels, sampleRate: source.sampleRate }
    worker.postMessage(request)
  })
