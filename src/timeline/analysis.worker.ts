// Thin shell around the pure engine: no logic beyond messaging.
import type { AnalysisMessage, AnalysisRequest } from './analysis-messages'
import { buildPeakPyramid } from './peaks'

// The tsconfig has no WebWorker lib: declare the little of the worker scope used here.
const scope = self as unknown as {
  onmessage: ((event: { data: AnalysisRequest }) => void) | null
  postMessage(message: AnalysisMessage, transfer?: Transferable[]): void
}

scope.onmessage = ({ data }) => {
  const { channels, sampleRate } = data
  const pyramids = channels.map((samples, index) =>
    buildPeakPyramid(samples, sampleRate, (fraction) => {
      scope.postMessage({ type: 'progress', fraction: (index + fraction) / channels.length })
    }),
  )
  // The main thread takes ownership of the pyramid: every level's buffers are transferred.
  const transfer: Transferable[] = pyramids.flatMap((pyramid) =>
    pyramid.levels.flatMap((level) => [
      level.min.buffer as ArrayBuffer,
      level.max.buffer as ArrayBuffer,
      level.rms.buffer as ArrayBuffer,
    ]),
  )
  scope.postMessage({ type: 'done', peaks: { pyramids } }, transfer)
}
