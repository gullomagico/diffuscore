import { describe, expect, test } from 'vite-plus/test'
import { createSourceStore } from '@/audio/source'
import type { Source, SourceStore } from '@/audio/source'
import { createDetailTiles } from './detail-tiles'
import type { TileWorkerLike } from './detail-tiles'
import type { DetailTile, SpectrogramKind, TileRequest, WantedTile } from './detail-tile'
import type { TileResultMessage, TileWorkerInput } from './detail-tile-messages'

class FakeWorker implements TileWorkerLike {
  readonly posted: TileWorkerInput[] = []
  terminated = false
  private readonly listeners = {
    message: [] as ((event: { readonly data: TileResultMessage }) => void)[],
    error: [] as (() => void)[],
    messageerror: [] as (() => void)[],
  }
  postMessage(message: TileWorkerInput): void {
    this.posted.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: TileResultMessage }) => void,
  ): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: never): void {
    ;(this.listeners[type] as unknown[]).push(listener)
  }
  /** The requests posted so far, in order. */
  get requests(): TileRequest[] {
    return this.posted.flatMap((m) => (m.type === 'request' ? [m.request] : []))
  }
  /** Delivers the tiles of the last posted request. */
  reply(request: TileRequest = this.requests[this.requests.length - 1]!): void {
    const tiles = request.kinds.map((kind) => tile(kind, request.index, request.level))
    for (const l of this.listeners.message) l({ data: { request, tiles } })
  }
  fail(type: 'error' | 'messageerror' = 'error'): void {
    for (const l of this.listeners[type]) l()
  }
}

function tile(kind: SpectrogramKind, index: number, level: 32 | 64 | 128 = 128): DetailTile {
  return { kind, level, index, columns: 512, data: new Uint8Array(16) }
}

const visible = (index: number): WantedTile => ({ level: 128, index, visible: true })
const ahead = (index: number): WantedTile => ({ level: 128, index, visible: false })
const TOTAL: SpectrogramKind[] = ['Total']

function setup() {
  const sources: SourceStore = createSourceStore()
  const workers: FakeWorker[] = []
  const errors: unknown[] = []
  const tiles = createDetailTiles({
    sources,
    createWorker: () => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    },
    logError: (...args) => errors.push(args),
  })
  const load = (): Source =>
    sources.load('a.wav', {
      numberOfChannels: 2,
      length: 4,
      duration: 4 / 48000,
      getChannelData: () => new Float32Array(4),
    })
  return { sources, workers, errors, tiles, load }
}

describe('detail tiles', () => {
  test('no worker is created until a tile is requested', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [], TOTAL)
    expect(workers).toHaveLength(0)
    tiles.want(source, [visible(0)], TOTAL)
    expect(workers).toHaveLength(1)
  })

  test('the worker gets the Source first, then one request at a time', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    const w = workers[0]!
    expect(w.posted[0]).toEqual({
      type: 'source',
      channels: source.channels,
      sampleRate: source.sampleRate,
    })
    expect(w.requests).toEqual([{ level: 128, index: 0, kinds: ['Total'] }])
    w.reply()
    expect(w.requests.map((r) => r.index)).toEqual([0, 1])
  })

  test('want is idempotent while a request is in flight', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    expect(workers[0]!.requests).toHaveLength(1)
  })

  test('visible tiles are requested before neighbours, in the order given', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(5), visible(6), ahead(4), ahead(7)], TOTAL)
    const w = workers[0]!
    for (let i = 0; i < 4; i++) w.reply()
    expect(w.requests.map((r) => r.index)).toEqual([5, 6, 4, 7])
  })

  test('requests that leave the wanted set before they start are never posted', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    tiles.want(source, [visible(8)], TOTAL)
    const w = workers[0]!
    w.reply()
    expect(w.requests.map((r) => r.index)).toEqual([0, 8])
  })

  test('the in-flight request is kept and its result cached even when no longer wanted', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(0)], TOTAL)
    tiles.want(source, [visible(8)], TOTAL)
    const w = workers[0]!
    w.reply(w.requests[0])
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 0 })).toBeDefined()
    expect(w.requests.map((r) => r.index)).toEqual([0, 8])
  })

  test('cached tiles are not requested again', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    tiles.want(source, [visible(0)], TOTAL)
    workers[0]!.reply()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    expect(workers[0]!.requests.map((r) => r.index)).toEqual([0, 1])
  })

  test('listeners are notified on each accepted tile, and the snapshot changes', () => {
    const { tiles, workers, load } = setup()
    const source = load()
    let calls = 0
    const stop = tiles.subscribe(() => calls++)
    const before = tiles.getSnapshot()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    workers[0]!.reply()
    workers[0]!.reply()
    expect(calls).toBe(2)
    expect(tiles.getSnapshot()).not.toBe(before)
    expect(tiles.getSnapshot().failed).toBe(false)
    stop()
    tiles.want(source, [visible(2)], TOTAL)
    workers[0]!.reply()
    expect(calls).toBe(2)
  })

  test('want ignores a Source that is not the current one', () => {
    const { tiles, workers, load } = setup()
    const old = load()
    load()
    tiles.want(old, [visible(0)], TOTAL)
    expect(workers).toHaveLength(0)
  })

  test('replacing the Source terminates the worker, clears the cache and discards a late result', () => {
    const { tiles, workers, load } = setup()
    const first = load()
    tiles.want(first, [visible(0), visible(1)], TOTAL)
    workers[0]!.reply()
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 0 })).toBeDefined()
    const request = workers[0]!.requests[1]!
    const second = load()
    expect(workers[0]!.terminated).toBe(true)
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 0 })).toBeUndefined()
    let calls = 0
    tiles.subscribe(() => calls++)
    workers[0]!.reply(request)
    expect(calls).toBe(0)
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 1 })).toBeUndefined()
    // The queue was emptied: the new Source gets a new worker and only what it wants.
    tiles.want(second, [visible(3)], TOTAL)
    expect(workers).toHaveLength(2)
    expect(workers[1]!.requests.map((r) => r.index)).toEqual([3])
  })

  test('releasing the Source terminates the worker and clears the cache', () => {
    const { tiles, workers, sources, load } = setup()
    const source = load()
    tiles.want(source, [visible(0), visible(1)], TOTAL)
    workers[0]!.reply()
    sources.release()
    expect(workers[0]!.terminated).toBe(true)
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 0 })).toBeUndefined()
    workers[0]!.reply(workers[0]!.requests[1])
    expect(tiles.lookup({ kind: 'Total', level: 128, index: 1 })).toBeUndefined()
  })

  test.each(['error', 'messageerror'] as const)(
    'a worker %s logs once, stops requests and marks failed; the next Source starts fresh',
    (type) => {
      const { tiles, workers, errors, load } = setup()
      const source = load()
      let calls = 0
      tiles.subscribe(() => calls++)
      tiles.want(source, [visible(0), visible(1)], TOTAL)
      workers[0]!.fail(type)
      workers[0]!.fail(type)
      expect(errors).toHaveLength(1)
      expect(workers[0]!.terminated).toBe(true)
      expect(tiles.getSnapshot().failed).toBe(true)
      expect(calls).toBe(1)
      tiles.want(source, [visible(2)], TOTAL)
      expect(workers).toHaveLength(1)
      expect(workers[0]!.requests).toHaveLength(1)

      const next = load()
      expect(tiles.getSnapshot().failed).toBe(false)
      tiles.want(next, [visible(0)], TOTAL)
      expect(workers).toHaveLength(2)
      expect(workers[1]!.requests).toHaveLength(1)
    },
  )

  test('tiles in the wanted set survive a small cache budget; touched tiles outlive untouched ones', () => {
    const sources = createSourceStore()
    const workers: FakeWorker[] = []
    const tiles = createDetailTiles({
      sources,
      budgetBytes: 32,
      createWorker: () => {
        const w = new FakeWorker()
        workers.push(w)
        return w
      },
    })
    const source = sources.load('a.wav', {
      numberOfChannels: 1,
      length: 4,
      duration: 4 / 48000,
      getChannelData: () => new Float32Array(4),
    })
    tiles.want(source, [visible(0), visible(1), visible(2)], ['Mono'])
    for (let i = 0; i < 3; i++) workers[0]!.reply()
    // 48 bytes held, 32 budget, all pinned: nothing is lost.
    for (const i of [0, 1, 2]) {
      expect(tiles.lookup({ kind: 'Mono', level: 128, index: i })).toBeDefined()
    }
    tiles.touch({ kind: 'Mono', level: 128, index: 0 })
    tiles.want(source, [visible(9)], ['Mono'])
    // Unpinned now: the least recently used (1) goes first.
    expect(tiles.lookup({ kind: 'Mono', level: 128, index: 1 })).toBeUndefined()
    expect(tiles.lookup({ kind: 'Mono', level: 128, index: 0 })).toBeDefined()
  })
})
