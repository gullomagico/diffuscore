// Messages between the main thread and the long-lived detail tile worker. Types and one helper only:
// no FFT, so the main thread can import values from here.
import type { DetailTile, TileRequest } from './detail-tile'

/** Main thread -> tile worker, once per worker: the Source. The Channels are shared memory: nothing is copied. */
export interface TileSourceMessage {
  readonly type: 'source'
  readonly channels: readonly Float32Array<SharedArrayBuffer>[]
  readonly sampleRate: number
}

/** Main thread -> tile worker: one request at a time. */
export interface TileRequestMessage {
  readonly type: 'request'
  readonly request: TileRequest
}

export type TileWorkerInput = TileSourceMessage | TileRequestMessage

/** Tile worker -> main thread: the request echoed, and the tiles of its kinds, in request order. */
export interface TileResultMessage {
  readonly request: TileRequest
  readonly tiles: readonly DetailTile[]
}

/** Every data buffer of the tiles, each once: what the worker transfers to the main thread. */
export function transferListOf(tiles: readonly DetailTile[]): ArrayBuffer[] {
  return [...new Set(tiles.map((tile) => tile.data.buffer as ArrayBuffer))]
}
