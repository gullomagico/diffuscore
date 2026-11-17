import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { makeWav } from '../src/audio/testing/fixtures.ts'

function wav(
  name: string,
  channels: number,
  seconds: number,
  options: { sampleRate?: number; amplitude?: number; ramp?: boolean } = {},
) {
  const bytes = makeWav({ channels, sampleRate: 44100, seconds, ...options })
  return { name, mimeType: 'audio/wav', buffer: Buffer.from(bytes) }
}

/** True once the spectrogram has drawn pixels that are neither transparent nor the table's floor colour. */
function spectrogramHasSignal(canvas: Locator) {
  return canvas.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const data = (element as HTMLCanvasElement)
      .getContext('2d')!
      .getImageData(0, 0, width, height).data
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0 && Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 40) return true
    }
    return false
  })
}

function canvasHash(canvas: Locator) {
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

/** Lets the frame scheduled by a keypress run, so `data-detail` is no longer the previous frame's. */
function settleFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', (error) => errors.push(error))
  return errors
}

test('a short Source reaches ready detail with a single partial tile', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('short.wav', 2, 1.5, { amplitude: 20000 }))
  const spectrogram = page.getByRole('img', { name: 'Total spectrogram' })
  await expect(spectrogram).toHaveAttribute('data-detail', 'ready')
  expect(await spectrogramHasSignal(spectrogram)).toBe(true)
  expect(errors).toEqual([])
})

test('a long Source shows the overview at fit, then detail when zoomed in and scrolled', async ({
  page,
}) => {
  const errors = collectPageErrors(page)
  await page.goto('/')
  await page
    .getByLabel('Audio file')
    .setInputFiles(wav('long.wav', 1, 150, { sampleRate: 8000, amplitude: 20000, ramp: true }))
  const spectrogram = page.getByRole('img', { name: 'Mono spectrogram' })
  const waveform = page.getByRole('img', { name: 'Mirrored waveform: Mono' })
  await expect(waveform).toBeVisible()
  await expect.poll(() => spectrogramHasSignal(spectrogram)).toBe(true)
  await expect(spectrogram).toHaveAttribute('data-detail', 'none')

  await page.getByRole('region', { name: 'Timeline' }).locator('[tabindex="0"]').focus()
  // Zoom in until the zoom stops changing.
  let previous = await canvasHash(waveform)
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('+')
    await settleFrames(page)
    const hash = await canvasHash(waveform)
    if (hash === previous) break
    previous = hash
  }
  await settleFrames(page)
  await expect(spectrogram).toHaveAttribute('data-detail', 'ready')
  expect(await spectrogramHasSignal(spectrogram)).toBe(true)

  // More than one 4 s tile at 128 columns per second: 12 steps of 10% of 5 s.
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await settleFrames(page)
  await expect(spectrogram).toHaveAttribute('data-detail', 'ready')
  expect(await spectrogramHasSignal(spectrogram)).toBe(true)
  expect(errors).toEqual([])
})
