import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { canvasHash, spectrogramHasSignal, wav } from './helpers.ts'

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
