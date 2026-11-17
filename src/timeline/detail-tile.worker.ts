// Thin shell around the pure tile builder: no logic beyond messaging. A failure is not caught: it
// surfaces as the Worker's error event.
import { transferListOf } from './detail-tile-messages'
import type { TileResultMessage, TileWorkerInput } from './detail-tile-messages'
import { buildDetailTiles } from './spectrogram-tile'

// The tsconfig has no WebWorker lib: declare the little of the worker scope used here.
const scope = self as unknown as {
  onmessage: ((event: { data: TileWorkerInput }) => void) | null
  postMessage(message: TileResultMessage, transfer?: Transferable[]): void
}

let source: { channels: readonly Float32Array[]; sampleRate: number } | null = null

scope.onmessage = ({ data }) => {
  if (data.type === 'source') {
    source = { channels: data.channels, sampleRate: data.sampleRate }
    return
  }
  if (source === null) throw new Error('Tile request before the Source')
  const { request } = data
  const tiles = buildDetailTiles(
    source.channels,
    source.sampleRate,
    request.level,
    request.index,
    request.kinds,
  )
  // The main thread takes ownership of the tiles: every buffer is transferred.
  scope.postMessage({ request, tiles }, transferListOf(tiles))
}
