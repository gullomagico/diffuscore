// Thin shell around the pure engine: no logic beyond messaging.
import type { AnalysisMessage, AnalysisRequest } from './analysis-messages'
import { runAnalysis, transferListOf } from './analysis-run'

// The tsconfig has no WebWorker lib: declare the little of the worker scope used here.
const scope = self as unknown as {
  onmessage: ((event: { data: AnalysisRequest }) => void) | null
  postMessage(message: AnalysisMessage, transfer?: Transferable[]): void
}

scope.onmessage = ({ data }) => {
  const result = runAnalysis(data.channels, data.sampleRate, (fraction) => {
    scope.postMessage({ type: 'progress', fraction })
  })
  // The main thread takes ownership of the result: every buffer is transferred.
  scope.postMessage({ type: 'done', result }, transferListOf(result))
}
