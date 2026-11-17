// The detail tile manager: ties the wanted set, the request queue, the LRU cache and the tile worker
// together for the current Source. Plain TypeScript, no React. Its lifecycle follows the SourceStore
// like the AnalysisStore does: the worker, queue and cache live and die with their Source. The
// Worker is injected as a factory; the real one lives in detail-tiles-browser.ts.
import type { Source, SourceStore } from '@/audio/source'
import { createTileCache } from './tile-cache'
import { planRequests } from './tile-queue'
import type { DetailTile, SpectrogramKind, TileKey, TileRequest, WantedTile } from './detail-tile'
import type { TileResultMessage, TileWorkerInput } from './detail-tile-messages'

/** The part of a Worker the manager uses, so tests can fake it. */
export interface TileWorkerLike {
  postMessage(message: TileWorkerInput): void
  terminate(): void
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: TileResultMessage }) => void,
  ): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
}

export interface DetailTilesSnapshot {
  /** Changes whenever a tile is accepted or the worker fails. */
  readonly version: number
  /** The worker of the current Source failed: no more detail requests for it. */
  readonly failed: boolean
}

export interface DetailTiles {
  /**
   * Sets the wanted set (priority order) and the kinds needed. Idempotent. Ignored unless `source`
   * is the current Source. Pins the wanted tiles, drops queued requests no longer wanted, and
   * starts the worker on the first request.
   */
  want(source: Source, wanted: readonly WantedTile[], kinds: readonly SpectrogramKind[]): void
  /** The cached tile at `key`, for the resolver. */
  readonly lookup: (key: TileKey) => DetailTile | undefined
  /** Marks a tile as drawn in a frame. */
  readonly touch: (key: TileKey) => void
  getSnapshot(): DetailTilesSnapshot
  readonly subscribe: (listener: () => void) => () => void
}

export interface DetailTilesOptions {
  readonly sources: SourceStore
  readonly createWorker: () => TileWorkerLike
  readonly budgetBytes?: number
  /** Receives the one error logged when the worker fails. Default console.error. */
  readonly logError?: (...args: unknown[]) => void
}

export function createDetailTiles(options: DetailTilesOptions): DetailTiles {
  const { sources, createWorker } = options
  const logError = options.logError ?? ((...args: unknown[]) => console.error(...args))
  const cache = createTileCache(options.budgetBytes)
  const listeners = new Set<() => void>()

  let known: Source | null = sources.getSnapshot()
  let worker: TileWorkerLike | null = null
  let inFlight: TileRequest | null = null
  let queue: TileRequest[] = []
  let wanted: readonly WantedTile[] = []
  let kinds: readonly SpectrogramKind[] = []
  let failed = false
  let snapshot: DetailTilesSnapshot = { version: 0, failed: false }

  function publish(): void {
    snapshot = { version: snapshot.version + 1, failed }
    for (const listener of [...listeners]) listener()
  }

  function reset(): void {
    worker?.terminate()
    worker = null
    inFlight = null
    queue = []
    wanted = []
    kinds = []
    failed = false
    cache.clear()
  }

  // The tiles live and die with their Source, whoever releases or replaces it.
  sources.subscribe(() => {
    const current = sources.getSnapshot()
    if (current === known) return
    known = current
    reset()
    snapshot = { version: snapshot.version + 1, failed: false }
  })

  function startWorker(source: Source): TileWorkerLike {
    const created = createWorker()
    created.addEventListener('message', (event) => {
      if (worker !== created) return
      for (const tile of event.data.tiles) cache.insert(tile)
      inFlight = null
      pump()
      publish()
    })
    const onFailure = () => {
      if (worker !== created) return
      logError('The detail tile worker failed')
      created.terminate()
      worker = null
      inFlight = null
      queue = []
      failed = true
      publish()
    }
    created.addEventListener('error', onFailure)
    created.addEventListener('messageerror', onFailure)
    worker = created
    created.postMessage({
      type: 'source',
      channels: source.channels,
      sampleRate: source.sampleRate,
    })
    return created
  }

  /** Re-plans against the wanted set and sends the next request if the worker is idle. */
  function pump(): void {
    if (failed || known === null) return
    const plan = planRequests({
      queue,
      wanted,
      kinds,
      isCached: (key) => cache.has(key),
      inFlight,
    })
    queue = plan.queue
    if (plan.next === null) return
    const target = worker ?? startWorker(known)
    inFlight = plan.next
    target.postMessage({ type: 'request', request: plan.next })
  }

  return {
    want(source, nextWanted, nextKinds) {
      if (sources.getSnapshot() !== source || failed) return
      wanted = nextWanted
      kinds = nextKinds
      cache.pin(nextWanted.flatMap((w) => nextKinds.map((kind) => ({ kind, ...pick(w) }))))
      pump()
    },
    lookup: (key) => cache.get(key),
    touch: (key) => cache.touch(key),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function pick(w: WantedTile): { level: WantedTile['level']; index: number } {
  return { level: w.level, index: w.index }
}
