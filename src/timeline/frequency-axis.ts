// The Lane's frequency axis: where each label sits on the log scale of the spectrogram rows.

import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ } from './spectrogram'

/** Position of a frequency in the Lane: 0 at the bottom (20 Hz), 1 at the top (24 kHz). */
export function frequencyToFractionFromBottom(hz: number): number {
  return Math.log(hz / MIN_FREQUENCY_HZ) / Math.log(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ)
}

export interface FrequencyLabel {
  readonly text: string
  readonly fromBottom: number
}

const LABELLED_FREQUENCIES: readonly [number, string][] = [
  [50, '50'],
  [100, '100'],
  [500, '500'],
  [1000, '1k'],
  [5000, '5k'],
  [10000, '10k'],
  [20000, '20k'],
]

export const FREQUENCY_LABELS: readonly FrequencyLabel[] = LABELLED_FREQUENCIES.map(
  ([hz, text]) => ({ text, fromBottom: frequencyToFractionFromBottom(hz) }),
)
