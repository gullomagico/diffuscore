import { describe, expect, it } from 'vitest'
import { FREQUENCY_LABELS, frequencyToFractionFromBottom } from './frequency-axis'

describe('frequencyToFractionFromBottom', () => {
  it('puts 20 Hz at the bottom and 24 kHz at the top', () => {
    expect(frequencyToFractionFromBottom(20)).toBeCloseTo(0, 12)
    expect(frequencyToFractionFromBottom(24000)).toBeCloseTo(1, 12)
  })

  it('is logarithmic', () => {
    expect(frequencyToFractionFromBottom(1000)).toBeCloseTo(Math.log(50) / Math.log(1200), 12)
  })
})

describe('FREQUENCY_LABELS', () => {
  it('lists 50, 100, 500, 1k, 5k, 10k, 20k, rising', () => {
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
