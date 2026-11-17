// The Lane's frequency axis: the log scale shared by the spectrogram rows and the axis labels.
// FFT-free on purpose: the main-thread renderer and Lane components import it, and must not pull
// the worker's FFT library into their bundle.

/** Rows of a spectrogram, on a logarithmic frequency axis. */
export const SPECTROGRAM_ROWS = 512
/** The axis is fixed at every sample rate: row 0 starts here. */
export const MIN_FREQUENCY_HZ = 20
/** The last row ends here, whatever the Source's Nyquist frequency. */
export const MAX_FREQUENCY_HZ = 24000

/** Position of a frequency on the log axis: 0 at MIN_FREQUENCY_HZ, 1 at MAX_FREQUENCY_HZ. */
function logFraction(hz: number): number {
  return Math.log(hz / MIN_FREQUENCY_HZ) / Math.log(MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ)
}

/** Inverse of logFraction. */
function fractionToHz(fraction: number): number {
  return MIN_FREQUENCY_HZ * (MAX_FREQUENCY_HZ / MIN_FREQUENCY_HZ) ** fraction
}

/** The frequency band [low, high) of a row, in Hz. */
export function rowBandHz(row: number): [number, number] {
  return [fractionToHz(row / SPECTROGRAM_ROWS), fractionToHz((row + 1) / SPECTROGRAM_ROWS)]
}

/** Position of a frequency in the Lane: 0 at the bottom (20 Hz), 1 at the top (24 kHz). */
export function frequencyToFractionFromBottom(hz: number): number {
  return logFraction(hz)
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
