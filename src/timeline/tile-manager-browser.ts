// The browser adapter of the detail tile manager: the real tile Worker and the app-wide instance.
import { sourceStore } from '@/audio/source'
import { createDetailTiles } from './tile-manager'
import type { TileWorkerLike } from './tile-manager'

function createTileWorker(): TileWorkerLike {
  return new Worker(new URL('./detail-tile.worker.ts', import.meta.url), { type: 'module' })
}

/** The app-wide detail tile manager, backed by the real tile Worker. */
export const detailTiles = createDetailTiles({
  sources: sourceStore,
  createWorker: createTileWorker,
})
