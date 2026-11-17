import { describe, expect, test } from 'vite-plus/test'
import { planRequests, type QueuePlanInput } from './tile-queue'
import type { SpectrogramKind, TileKey, TileRequest, WantedTile } from './detail-tile'

const wanted = (index: number, visible = true, level: 32 | 64 | 128 = 128): WantedTile => ({
  level,
  index,
  visible,
})
const request = (
  index: number,
  kinds: readonly SpectrogramKind[] = ['L', 'R'],
  level: 32 | 64 | 128 = 128,
): TileRequest => ({ level, index, kinds })

function plan(overrides: Partial<QueuePlanInput> & Pick<QueuePlanInput, 'wanted'>) {
  return planRequests({
    queue: [],
    kinds: ['L', 'R'],
    isCached: () => false,
    inFlight: null,
    ...overrides,
  })
}

describe('planRequests', () => {
  test('sends the highest-priority wanted tile and queues the rest in order, all kinds missing', () => {
    const result = plan({ wanted: [wanted(4), wanted(5), wanted(3)] })
    expect(result.next).toEqual(request(4))
    expect(result.queue).toEqual([request(5), request(3)])
    expect(result.dropped).toEqual([])
  })

  test('visible tiles go before neighbours, in the wanted order', () => {
    const result = plan({ wanted: [wanted(4), wanted(5), wanted(6, false), wanted(3, false)] })
    expect([result.next, ...result.queue].map((r) => r?.index)).toEqual([4, 5, 6, 3])
  })

  test('drops queued requests that left the wanted set before they started', () => {
    const result = plan({
      queue: [request(1), request(2), request(3)],
      wanted: [wanted(3), wanted(4)],
    })
    expect(result.dropped).toEqual([request(1), request(2)])
    expect(result.next).toEqual(request(3))
    expect(result.queue).toEqual([request(4)])
  })

  test('a different level at the same index is a different address', () => {
    const result = plan({
      queue: [request(2, ['L', 'R'], 64)],
      wanted: [wanted(2, true, 128)],
    })
    expect(result.dropped).toEqual([request(2, ['L', 'R'], 64)])
    expect(result.next).toEqual(request(2, ['L', 'R'], 128))
  })

  test('with a request in flight nothing is sent and its address is not queued again', () => {
    const result = plan({
      wanted: [wanted(4), wanted(5)],
      inFlight: request(4),
    })
    expect(result.next).toBeNull()
    expect(result.queue).toEqual([request(5)])
  })

  test('an in-flight request that is no longer wanted is still not re-queued, and not cancelled', () => {
    const result = plan({
      queue: [request(5)],
      wanted: [wanted(5), wanted(4)],
      inFlight: request(4),
    })
    expect(result.next).toBeNull()
    expect(result.queue).toEqual([request(5)])
    expect(result.dropped).toEqual([])

    const gone = plan({ wanted: [wanted(9)], inFlight: request(4) })
    expect(gone.queue).toEqual([request(9)])
    expect(gone.dropped).toEqual([])
  })

  test('only the kinds not in flight at an address are queued', () => {
    const result = plan({
      wanted: [wanted(4)],
      inFlight: request(4, ['L']),
    })
    expect(result.next).toBeNull()
    expect(result.queue).toEqual([request(4, ['R'])])
  })

  test('cached tiles are not requested', () => {
    const cached = new Set(['L:128:4', 'R:128:4'])
    const result = plan({
      wanted: [wanted(4), wanted(5)],
      isCached: (key: TileKey) => cached.has(`${key.kind}:${key.level}:${key.index}`),
    })
    expect(result.next).toEqual(request(5))
    expect(result.queue).toEqual([])
  })

  test('only the missing kinds are requested', () => {
    const result = plan({
      wanted: [wanted(4)],
      isCached: (key) => key.kind === 'L',
    })
    expect(result.next).toEqual(request(4, ['R']))
  })

  test('a queued request whose kinds all became cached is dropped', () => {
    const result = plan({
      queue: [request(4), request(5)],
      wanted: [wanted(4), wanted(5)],
      isCached: (key) => key.index === 4,
    })
    expect(result.dropped).toEqual([request(4)])
    expect(result.next).toEqual(request(5))
  })

  test('a queued request whose kinds partly became cached is narrowed, not dropped', () => {
    const result = plan({
      queue: [request(4)],
      wanted: [wanted(4)],
      isCached: (key) => key.kind === 'L',
    })
    expect(result.dropped).toEqual([])
    expect(result.next).toEqual(request(4, ['R']))
  })

  test('the kinds the Lane needs decide the request', () => {
    expect(plan({ wanted: [wanted(0)], kinds: ['Mono'] }).next).toEqual(request(0, ['Mono']))
    expect(plan({ wanted: [wanted(0)], kinds: ['Total'] }).next).toEqual(request(0, ['Total']))
  })

  test('nothing wanted, or nothing missing, plans nothing', () => {
    expect(plan({ wanted: [] })).toEqual({ queue: [], dropped: [], next: null })
    expect(plan({ wanted: [wanted(0)], isCached: () => true })).toEqual({
      queue: [],
      dropped: [],
      next: null,
    })
  })
})
