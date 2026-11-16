import { describe, expect, test } from 'vite-plus/test'
import {
  PEAKS_PROGRESS_WEIGHT,
  SPECTROGRAMS_PROGRESS_WEIGHT,
  runAnalysis,
  transferListOf,
} from './analysis-run'

const RATE = 8000

function sine(seconds: number, frequency: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.5 * Math.sin((2 * Math.PI * frequency * i) / RATE)
  }
  return samples
}

function run(channels: Float32Array[]) {
  const progress: number[] = []
  const result = runAnalysis(channels, RATE, (fraction) => progress.push(fraction))
  return { result, progress }
}

describe('runAnalysis', () => {
  test('a Mono Source gets one pyramid and one overview, no Total', () => {
    const { result } = run([sine(2, 440)])
    expect(result.peaks.pyramids).toHaveLength(1)
    expect(result.spectrograms.channels).toHaveLength(1)
    expect(result.spectrograms.total).toBeNull()
  })

  test('a stereo Source gets a pyramid and an overview per Channel, and a Total', () => {
    const { result } = run([sine(2, 440), sine(2, 880)])
    expect(result.peaks.pyramids).toHaveLength(2)
    expect(result.spectrograms.channels).toHaveLength(2)
    expect(result.spectrograms.total).not.toBeNull()
  })

  test('the weights add up to 1, the spectrograms being the larger share', () => {
    expect(PEAKS_PROGRESS_WEIGHT + SPECTROGRAMS_PROGRESS_WEIGHT).toBeCloseTo(1, 12)
    expect(SPECTROGRAMS_PROGRESS_WEIGHT).toBeGreaterThan(PEAKS_PROGRESS_WEIGHT)
  })

  test('progress is monotonic, within 0..1 and ends at exactly 1', () => {
    const { progress } = run([sine(2, 440), sine(2, 880)])
    expect(progress.length).toBeGreaterThan(2)
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!)
    }
    expect(Math.min(...progress)).toBeGreaterThanOrEqual(0)
    expect(progress.at(-1)).toBe(1)
  })

  test('progress goes past the peaks share only once the peaks are done', () => {
    const { progress } = run([sine(2, 440), sine(2, 880)])
    expect(progress).toContain(PEAKS_PROGRESS_WEIGHT)
    const boundary = progress.indexOf(PEAKS_PROGRESS_WEIGHT)
    for (const fraction of progress.slice(0, boundary)) {
      expect(fraction).toBeLessThanOrEqual(PEAKS_PROGRESS_WEIGHT)
    }
    expect(progress.slice(boundary + 1).some((f) => f > PEAKS_PROGRESS_WEIGHT)).toBe(true)
  })
})

describe('transferListOf', () => {
  test.each([
    ['Mono', [sine(2, 440)]],
    ['stereo', [sine(2, 440), sine(2, 880)]],
  ])('lists every buffer of a %s result exactly once', (_name, channels) => {
    const { result } = run(channels)
    const expected = new Set<ArrayBuffer>()
    for (const pyramid of result.peaks.pyramids) {
      for (const level of pyramid.levels) {
        expected.add(level.min.buffer as ArrayBuffer)
        expected.add(level.max.buffer as ArrayBuffer)
        expected.add(level.rms.buffer as ArrayBuffer)
      }
    }
    const overviews = [...result.spectrograms.channels, result.spectrograms.total].filter(
      (overview) => overview !== null,
    )
    for (const overview of overviews) {
      for (const level of overview.levels) expected.add(level.data.buffer as ArrayBuffer)
    }

    const list = transferListOf(result)
    expect(list).toHaveLength(expected.size)
    expect(new Set(list)).toEqual(expected)
  })
})
