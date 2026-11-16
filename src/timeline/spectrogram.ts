// Overview spectrograms (ADR-0001): STFT, log-frequency rows, quantisation and column-max
// pooling. Pure and worker-free; everything here is plain data (typed arrays and numbers) so it
// crosses the worker boundary. Nothing assumes a sample rate: every parameter derives from it.
import FFT from 'fft.js'
import { SPECTROGRAM_ROWS, rowBandHz } from './frequency-axis'

export { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, SPECTROGRAM_ROWS } from './frequency-axis'

/** Quantised 0 means this level or less. */
export const FLOOR_DB = -100
/** Quantised 255 means this level or more. */
export const CEILING_DB = 0
export const OVERVIEW_COLUMNS_PER_SECOND = 10

/** One level of a spectrogram: quantised dB, column-major, row 0 = the lowest frequency (20 Hz). */
export interface SpectrogramLevel {
  readonly columns: number
  /** Level 0: OVERVIEW_COLUMNS_PER_SECOND. Each next level halves it. */
  readonly columnsPerSecond: number
  /** columns × SPECTROGRAM_ROWS bytes; cell (c, r) is data[c * SPECTROGRAM_ROWS + r]. 0 = FLOOR_DB or less, 255 = CEILING_DB or more. */
  readonly data: Uint8Array
}

/** A max-pooled overview spectrogram plus its column-max mip levels. */
export interface SpectrogramOverview {
  /** levels[0] is the overview itself (ceil(duration × 10) columns). Each next level is the 2× column-max reduction of the previous one (an odd last column is carried alone), down to a level of 1 column. */
  readonly levels: readonly SpectrogramLevel[]
}

/** The overview spectrograms of a Source. */
export interface SourceSpectrograms {
  /** One overview per Channel, in Channel order (L, R; or the single Mono Channel). */
  readonly channels: readonly SpectrogramOverview[]
  /** Stereo only: the Total spectrogram. null for a Mono Source. */
  readonly total: SpectrogramOverview | null
}

/** Window length target: N is the smallest power of two covering this many seconds. */
const WINDOW_SECONDS = 0.085

const PROGRESS_STEPS = 100

/** Window size N (a power of two) and hop (N / 2) in samples. */
export function stftParameters(sampleRate: number): { size: number; hop: number } {
  let size = 2
  while (size < WINDOW_SECONDS * sampleRate) size *= 2
  return { size, hop: size / 2 }
}

const ROW_FLOOR = 0 // a row above the Source's Nyquist frequency
const ROW_MAX = 1
const ROW_INTERPOLATE = 2

/** How each row reads a power spectrum (bins 0..size/2). Built once per sample rate. */
export interface RowMap {
  readonly size: number
  readonly mode: Uint8Array
  /** ROW_MAX: first bin of the row. */
  readonly first: Int32Array
  /** ROW_MAX: last bin of the row (inclusive). */
  readonly last: Int32Array
  /** ROW_INTERPOLATE: the lower neighbour bin (the upper one is lower + 1). */
  readonly lower: Int32Array
  /** ROW_INTERPOLATE: weight of the upper neighbour. */
  readonly weight: Float64Array
}

export function createRowMap(sampleRate: number, size: number): RowMap {
  const binHz = sampleRate / size
  const nyquistBin = size / 2
  const mode = new Uint8Array(SPECTROGRAM_ROWS)
  const first = new Int32Array(SPECTROGRAM_ROWS)
  const last = new Int32Array(SPECTROGRAM_ROWS)
  const lower = new Int32Array(SPECTROGRAM_ROWS)
  const weight = new Float64Array(SPECTROGRAM_ROWS)
  for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
    const [low, high] = rowBandHz(r)
    const k0 = Math.ceil(low / binHz) // first bin centre at or above the band's start
    const k1 = Math.min(nyquistBin, Math.ceil(high / binHz) - 1) // last bin centre below its end
    if (k0 <= k1) {
      mode[r] = ROW_MAX
      first[r] = k0
      last[r] = k1
      continue
    }
    const position = Math.sqrt(low * high) / binHz
    const k = Math.floor(position)
    if (k + 1 > nyquistBin) {
      mode[r] = ROW_FLOOR // above the Source's Nyquist frequency
      continue
    }
    mode[r] = ROW_INTERPOLATE
    lower[r] = k
    weight[r] = position - k
  }
  return { size, mode, first, last, lower, weight }
}

/** Maps one power spectrum (bins 0..size/2) to out[0..SPECTROGRAM_ROWS). */
export function mapPowerToRows(
  map: RowMap,
  power: ArrayLike<number>,
  out: Float32Array | Float64Array,
): void {
  for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
    const mode = map.mode[r]
    if (mode === ROW_MAX) {
      let max = power[map.first[r]!]!
      for (let k = map.first[r]! + 1, end = map.last[r]!; k <= end; k++) {
        if (power[k]! > max) max = power[k]!
      }
      out[r] = max
    } else if (mode === ROW_INTERPOLATE) {
      const k = map.lower[r]!
      out[r] = power[k]! + (power[k + 1]! - power[k]!) * map.weight[r]!
    } else {
      // ROW_FLOOR: stays at the floor
      out[r] = 0
    }
  }
}

/** Power (magnitude², full scale sine = 1) to 0..255: dB clamped to FLOOR_DB..CEILING_DB, mapped linearly. */
export function quantizeDb(power: number): number {
  if (!(power > 0)) return 0
  const db = 10 * Math.log10(power)
  if (db <= FLOOR_DB) return 0
  if (db >= CEILING_DB) return 255
  return Math.round(((db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)) * 255)
}

/** Level 0 and its column-max mip levels, down to a level of 1 column. Returns level 0 itself first. */
export function buildColumnMaxLevels(level0: SpectrogramLevel): SpectrogramLevel[] {
  const levels = [level0]
  let previous = level0
  while (previous.columns > 1) {
    const fine = previous
    const columns = Math.ceil(fine.columns / 2)
    const data = new Uint8Array(columns * SPECTROGRAM_ROWS)
    for (let c = 0; c < columns; c++) {
      const a = 2 * c * SPECTROGRAM_ROWS
      const out = c * SPECTROGRAM_ROWS
      if (2 * c + 1 < fine.columns) {
        const b = a + SPECTROGRAM_ROWS
        for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
          const va = fine.data[a + r]!
          const vb = fine.data[b + r]!
          data[out + r] = va > vb ? va : vb
        }
      } else {
        data.set(fine.data.subarray(a, a + SPECTROGRAM_ROWS), out)
      }
    }
    previous = { columns, columnsPerSecond: fine.columnsPerSecond / 2, data }
    levels.push(previous)
  }
  return levels
}

/**
 * Builds the overview spectrograms of a Source's Channels (and the Total for two Channels) in one
 * pass over the frames: no full-resolution spectrogram is ever held. onProgress receives a 0..1
 * fraction, throttled (about 100 calls at most), ending with exactly 1.
 */
export function buildSourceSpectrograms(
  channels: readonly Float32Array[],
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): SourceSpectrograms {
  const length = channels[0]?.length ?? 0
  const stereo = channels.length === 2
  const { size, hop } = stftParameters(sampleRate)
  const bins = size / 2 + 1
  const map = createRowMap(sampleRate, size)

  // Periodic Hann, and the 2 / Σw scaling that makes a full-scale sine read 1 in its peak bin.
  const window = new Float64Array(size)
  let windowSum = 0
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
    windowSum += window[i]!
  }
  const powerScale = (2 / windowSum) ** 2

  const columns = Math.ceil((length * OVERVIEW_COLUMNS_PER_SECOND) / sampleRate)
  const frames = length === 0 ? 0 : Math.floor((length - 1) / hop) + 1

  // One output per Channel, plus the Total for stereo.
  const outputs = stereo ? channels.length + 1 : channels.length
  const data = Array.from({ length: outputs }, () => new Uint8Array(columns * SPECTROGRAM_ROWS))
  const pooled = Array.from({ length: outputs }, () => new Float32Array(SPECTROGRAM_ROWS))
  const rows = new Float64Array(SPECTROGRAM_ROWS)
  const powers = channels.map(() => new Float64Array(bins))
  const totalPower = new Float64Array(bins)
  const input = new Float64Array(size)
  const spectrum = new Float64Array(2 * size)
  const fft = new FFT(size)

  const finishColumn = (c: number) => {
    for (let o = 0; o < outputs; o++) {
      const out = data[o]!
      const source = pooled[o]!
      const base = c * SPECTROGRAM_ROWS
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) out[base + r] = quantizeDb(source[r]!)
      source.fill(0)
    }
  }

  let currentColumn = 0
  let reportedStep = 0
  for (let j = 0; j < frames; j++) {
    // Frame j is centred on sample j × hop; a frame belongs to the column containing its centre time.
    const column = Math.min(
      columns - 1,
      Math.floor((j * hop * OVERVIEW_COLUMNS_PER_SECOND) / sampleRate),
    )
    while (currentColumn < column) finishColumn(currentColumn++)

    const start = j * hop - size / 2
    const from = Math.max(0, -start)
    const to = Math.min(size, length - start)
    for (let ch = 0; ch < channels.length; ch++) {
      const samples = channels[ch]!
      input.fill(0)
      for (let i = from; i < to; i++) input[i] = samples[start + i]! * window[i]!
      fft.realTransform(spectrum, input)
      const power = powers[ch]!
      for (let k = 0; k < bins; k++) {
        const re = spectrum[2 * k]!
        const im = spectrum[2 * k + 1]!
        power[k] = (re * re + im * im) * powerScale
      }
    }
    if (stereo) {
      // Computed before row mapping: out-of-phase content never cancels.
      for (let k = 0; k < bins; k++) totalPower[k] = (powers[0]![k]! + powers[1]![k]!) / 2
    }
    for (let o = 0; o < outputs; o++) {
      mapPowerToRows(map, o < channels.length ? powers[o]! : totalPower, rows)
      const target = pooled[o]!
      for (let r = 0; r < SPECTROGRAM_ROWS; r++) if (rows[r]! > target[r]!) target[r] = rows[r]!
    }

    const step = Math.floor(((j + 1) / frames) * PROGRESS_STEPS * 0.99)
    if (step > reportedStep) {
      reportedStep = step
      onProgress?.(step / PROGRESS_STEPS)
    }
  }
  if (columns > 0) finishColumn(currentColumn)

  const overviews = data.map((d) => ({
    levels: buildColumnMaxLevels({
      columns,
      columnsPerSecond: OVERVIEW_COLUMNS_PER_SECOND,
      data: d,
    }),
  }))
  onProgress?.(1)
  return stereo
    ? { channels: overviews.slice(0, 2), total: overviews[2]! }
    : { channels: overviews, total: null }
}
