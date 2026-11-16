import { describe, expect, test } from 'vite-plus/test'
import { backgroundOverview } from './overlay'
import type { SpectrogramOverview } from './spectrogram'

const overview = (columns: number): SpectrogramOverview => ({
  levels: [{ columns, columnsPerSecond: 10, data: new Uint8Array(0) }],
})

describe('backgroundOverview', () => {
  test('a stereo Source shows the Total', () => {
    const total = overview(3)
    expect(backgroundOverview({ channels: [overview(1), overview(2)], total })).toBe(total)
  })

  test('a Mono Source shows its Channel', () => {
    const mono = overview(1)
    expect(backgroundOverview({ channels: [mono], total: null })).toBe(mono)
  })

  test('a Source without overviews shows none', () => {
    expect(backgroundOverview({ channels: [], total: null })).toBeNull()
  })
})
