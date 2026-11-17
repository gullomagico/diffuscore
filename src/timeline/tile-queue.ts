// The request queue of detail tiles. The queue lives on the main thread and the tile worker gets
// one request at a time; the in-flight request is never cancelled. `planRequests` is the pure
// step: given the previous queue, the wanted set and what is cached or in flight, it returns the
// new queue, what to drop, and what to send now.

import {
  type SpectrogramKind,
  type TileKey,
  type TileRequest,
  type WantedTile,
} from './detail-tile'

export interface QueuePlanInput {
  /** The previous queue: pending, not yet sent. */
  readonly queue: readonly TileRequest[]
  /** The wanted set, in priority order (from wantedTiles). */
  readonly wanted: readonly WantedTile[]
  /** The kinds the Lane needs. */
  readonly kinds: readonly SpectrogramKind[]
  readonly isCached: (key: TileKey) => boolean
  /** The request the worker is computing, if any. */
  readonly inFlight: TileRequest | null
}

export interface QueuePlan {
  /** The new queue in priority order, excluding `next`. */
  readonly queue: TileRequest[]
  /** Previous queue entries no longer wanted, or no longer needed (every kind cached or in flight). */
  readonly dropped: TileRequest[]
  /** The request to send now; null when one is in flight or nothing is missing. */
  readonly next: TileRequest | null
}

const addressKey = (a: { level: number; index: number }) => `${a.level}:${a.index}`

/**
 * Plans the tile requests. A request's kinds are the needed kinds that are not cached and not
 * already in flight at that address; addresses with no such kind are not queued. The queue follows
 * the wanted order, so visible tiles precede neighbours. While a request is in flight nothing is
 * sent and it is left alone, even when it is no longer wanted.
 */
export function planRequests(input: QueuePlanInput): QueuePlan {
  const { inFlight } = input
  const inFlightKey = inFlight ? addressKey(inFlight) : null

  const requests: TileRequest[] = []
  for (const tile of input.wanted) {
    const missing = input.kinds.filter(
      (kind) =>
        !input.isCached({ kind, level: tile.level, index: tile.index }) &&
        !(addressKey(tile) === inFlightKey && inFlight?.kinds.includes(kind)),
    )
    if (missing.length > 0) requests.push({ level: tile.level, index: tile.index, kinds: missing })
  }

  const stillQueued = new Set(requests.map(addressKey))
  const dropped = input.queue.filter((r) => !stillQueued.has(addressKey(r)))

  if (inFlight) return { queue: requests, dropped, next: null }
  const [next = null, ...queue] = requests
  return { queue, dropped, next }
}
