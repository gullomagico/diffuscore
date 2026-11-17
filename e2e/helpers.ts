// Helpers shared by the e2e specs. Playwright only runs *.spec.ts files, so this is not a spec.
import type { Locator } from '@playwright/test'
import { makeWav } from '../src/audio/testing/fixtures.ts'

/** A WAV file as a setInputFiles payload. */
export function wav(
  name: string,
  channels: number,
  seconds: number,
  options: { sampleRate?: number; amplitude?: number; ramp?: boolean } = {},
) {
  const bytes = makeWav({ channels, sampleRate: 44100, seconds, ...options })
  return { name, mimeType: 'audio/wav', buffer: Buffer.from(bytes) }
}

/** Hash of the alpha channel of every pixel. */
export function canvasHash(canvas: Locator) {
  return canvas.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const data = (element as HTMLCanvasElement)
      .getContext('2d')!
      .getImageData(0, 0, width, height).data
    let hash = 0
    for (let i = 3; i < data.length; i += 4) hash = (hash * 31 + data[i]!) | 0
    return hash
  })
}

/** True once the spectrogram has drawn pixels that are neither transparent nor the table's floor colour. */
export function spectrogramHasSignal(canvas: Locator) {
  return canvas.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const data = (element as HTMLCanvasElement)
      .getContext('2d')!
      .getImageData(0, 0, width, height).data
    // The floor of the colour table is #000004: its brightest channel is 4.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0 && Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 40) return true
    }
    return false
  })
}
