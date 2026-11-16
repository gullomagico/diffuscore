import { expect, test } from '@playwright/test'
import { makeWav } from '../src/audio/testing/fixtures.ts'

function wav(name: string, channels: number, seconds: number) {
  const bytes = makeWav({ channels, sampleRate: 44100, seconds })
  return { name, mimeType: 'audio/wav', buffer: Buffer.from(bytes) }
}

test('imports a stereo WAV, then refuses a 3-channel one', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)

  await page.getByLabel('Audio file').setInputFiles(wav('stereo.wav', 2, 2))
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toBeVisible()
  await expect(page.getByText('00:02')).toBeVisible()
  await expect(page.getByText('Stereo', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible()

  // Reload so the error shows in the empty state, not as a banner over a loaded Source.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Import audio file' })).toBeVisible()
  await page.getByLabel('Audio file').setInputFiles(wav('three.wav', 3, 1))
  await expect(page.getByRole('alert')).toContainText('3 Channels')
  await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible()
})

test('the menu entry and the keyboard shortcut both open the file picker', async ({ page }) => {
  await page.goto('/')

  const fromMenu = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: /Import Audio/ }).click()
  await fromMenu

  const fromShortcut = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+i')
  await fromShortcut
})

test('dropping more than one file is refused', async ({ page }) => {
  await page.goto('/')
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['a'], 'a.wav', { type: 'audio/wav' }))
    transfer.items.add(new File(['b'], 'b.wav', { type: 'audio/wav' }))
    return transfer
  })
  await page.getByRole('button', { name: 'Import audio file' }).dispatchEvent('drop', {
    dataTransfer,
  })
  await expect(page.getByRole('alert')).toHaveText('Drop a single audio file')
})

test('a refused replacement keeps the current Source', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('stereo.wav', 2, 1))
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toBeVisible()

  await page.getByLabel('Audio file').setInputFiles(wav('three.wav', 3, 1))
  await expect(page.getByRole('alert')).toContainText('3 Channels')
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toBeVisible()
})

test('a confirmed replacement loads the new Source', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('first.wav', 2, 1))
  await expect(page.getByRole('heading', { name: 'first.wav' })).toBeVisible()

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('discard the current Source')
    void dialog.accept()
  })
  await page.getByLabel('Audio file').setInputFiles(wav('second.wav', 1, 1))
  await expect(page.getByRole('heading', { name: 'second.wav' })).toBeVisible()
  await expect(page.getByText('Mono', { exact: true })).toBeVisible()
})

test('the loading overlay shows Reading, then Decoding, and Cancel discards the late result', async ({
  page,
}) => {
  // Hold the file read and the decode until the test releases them, so each stage can be seen.
  // decodeAudioData cannot be interrupted: Cancel has to discard its late result.
  await page.addInitScript(() => {
    const gates = window as unknown as { releaseRead: () => void; releaseDecode: () => void }
    const readGate = new Promise<void>((resolve) => {
      gates.releaseRead = resolve
    })
    const decodeGate = new Promise<void>((resolve) => {
      gates.releaseDecode = resolve
    })
    // oxlint-disable-next-line typescript/unbound-method -- re-bound with call() below
    const read = Blob.prototype.arrayBuffer
    Blob.prototype.arrayBuffer = async function () {
      await readGate
      return read.call(this)
    }
    // oxlint-disable-next-line typescript/unbound-method -- re-bound with call() below
    const decode = OfflineAudioContext.prototype.decodeAudioData
    OfflineAudioContext.prototype.decodeAudioData = async function (encoded: ArrayBuffer) {
      const decoded = await decode.call(this, encoded)
      await decodeGate
      return decoded
    }
  })
  const release = (gate: 'releaseRead' | 'releaseDecode') =>
    page.evaluate((name) => (window as unknown as Record<string, () => void>)[name]!(), gate)

  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('stereo.wav', 2, 1))

  await expect(page.getByRole('status')).toHaveText('Reading')
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await release('releaseRead')
  await expect(page.getByRole('status')).toHaveText('Decoding')

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Import audio file' })).toBeVisible()
  await release('releaseDecode')
  await expect(page.getByRole('button', { name: 'Import audio file' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toHaveCount(0)
})
