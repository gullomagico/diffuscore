import { describe, expect, test } from 'vite-plus/test'
import {
  FREQUENCY_LABELS,
  SPECTROGRAM_ROWS,
  frequencyToFractionFromBottom,
  rowBandHz,
} from './frequency-axis'

describe('frequencyToFractionFromBottom', () => {
  test('puts 20 Hz at the bottom and 24 kHz at the top', () => {
    expect(frequencyToFractionFromBottom(20)).toBeCloseTo(0, 12)
    expect(frequencyToFractionFromBottom(24000)).toBeCloseTo(1, 12)
  })

  test('is logarithmic', () => {
    expect(frequencyToFractionFromBottom(1000)).toBeCloseTo(Math.log(50) / Math.log(1200), 12)
  })
})

describe('rowBandHz', () => {
  test('rows span 20 Hz to 24 kHz logarithmically', () => {
    expect(rowBandHz(0)[0]).toBeCloseTo(20, 6)
    expect(rowBandHz(SPECTROGRAM_ROWS - 1)[1]).toBeCloseTo(24000, 3)
    expect(rowBandHz(256)[0]).toBeCloseTo(20 * Math.sqrt(1200), 6)
  })

  test('agrees with the label axis: a row starts at its fraction of the Lane height', () => {
    for (const row of [0, 100, 256, 511]) {
      expect(frequencyToFractionFromBottom(rowBandHz(row)[0])).toBeCloseTo(
        row / SPECTROGRAM_ROWS,
        12,
      )
    }
  })
})

describe('FREQUENCY_LABELS', () => {
  test('lists 50, 100, 500, 1k, 5k, 10k, 20k, rising', () => {
    expect(FREQUENCY_LABELS.map((label) => label.text)).toEqual([
      '50',
      '100',
      '500',
      '1k',
      '5k',
      '10k',
      '20k',
    ])
    const fractions = FREQUENCY_LABELS.map((label) => label.fromBottom)
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b))
    for (const f of fractions) expect(f).toBeGreaterThan(0)
    for (const f of fractions) expect(f).toBeLessThan(1)
  })
})
