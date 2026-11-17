// The browser adapter of the detail tile manager: the real tile Worker and the app-wide instance.
import { sourceStore } from '@/audio/source'
import { createDetailTiles } from './detail-tiles'
import type { TileWorkerLike } from './detail-tiles'

function createTileWorker(): TileWorkerLike {
  return new Worker(new URL('./detail-tile.worker.ts', import.meta.url), { type: 'module' })
}

export const detailTiles = createDetailTiles({
  sources: sourceStore,
  createWorker: createTileWorker,
})
