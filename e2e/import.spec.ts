import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
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

test('imports a stereo WAV, then refuses a 3-channel one', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)

  await page.getByLabel('Audio file').setInputFiles(wav('stereo.wav', 2, 2))
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toBeVisible()
  await expect(page.getByText('00:02')).toBeVisible()
  await expect(page.getByText('Stereo', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Timeline' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Time ruler' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mirrored waveform: R above, L below' })).toBeVisible()
  // The fixture is a 440 Hz sine: the Total spectrogram has a bright band.
  const spectrogram = page.getByRole('img', { name: 'Total spectrogram' })
  await expect(spectrogram).toBeVisible()
  await expect.poll(() => spectrogramHasSignal(spectrogram)).toBe(true)

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

/** Device pixels with some ink, in rows more than 3 pixels from the middle and right of the Channel labels. */
function inkAwayFromZeroLine(canvas: Locator) {
  return canvas.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const data = (element as HTMLCanvasElement)
      .getContext('2d')!
      .getImageData(0, 0, width, height).data
    const mid = Math.floor(height / 2)
    let above = 0
    let below = 0
    for (let y = 0; y < height; y++) {
      for (let x = 100; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue
        if (y < mid - 3) above++
        else if (y > mid + 3) below++
      }
    }
    return { above, below }
  })
}

/** Hash of every channel of every pixel: unlike canvasHash, sees colour changes. */
function pixelHash(canvas: Locator) {
  return canvas.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const data = (element as HTMLCanvasElement)
      .getContext('2d')!
      .getImageData(0, 0, width, height).data
    let hash = 0
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]!) | 0
    return hash
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

/** True once the spectrogram has drawn pixels that are neither transparent nor the table's floor colour. */
function spectrogramHasSignal(canvas: Locator) {
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

test('the Timeline draws a ruler and a Mirrored waveform that are not blank', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('loud.wav', 2, 2, { amplitude: 20000 }))
  const waveform = page.getByRole('img', { name: 'Mirrored waveform: R above, L below' })
  await expect(waveform).toBeVisible()
  await expect
    .poll(async () => {
      const { above, below } = await inkAwayFromZeroLine(waveform)
      return above > 0 && below > 0
    })
    .toBe(true)

  // R and L are drawn in different colours.
  const [r, l] = await waveform.evaluate((element) => {
    const { width, height } = element as HTMLCanvasElement
    const context = (element as HTMLCanvasElement).getContext('2d')!
    const x = Math.floor(width / 2)
    const mid = Math.floor(height / 2)
    const pixel = (y: number) => Array.from(context.getImageData(x, y, 1, 1).data).join(',')
    return [pixel(mid - 5), pixel(mid + 5)]
  })
  expect(r).not.toBe(l)

  const ruler = page.getByRole('img', { name: 'Time ruler' })
  await expect
    .poll(() =>
      ruler.evaluate((element) => {
        const { width, height } = element as HTMLCanvasElement
        const data = (element as HTMLCanvasElement)
          .getContext('2d')!
          .getImageData(0, 0, width, height).data
        // Above the baseline row, so the ruler's bottom border alone does not count.
        const ticksAndLabels = data.subarray(0, (height - 1) * width * 4)
        return ticksAndLabels.some((value, i) => i % 4 === 3 && value !== 0)
      }),
    )
    .toBe(true)
})

test('a mono Source gets a Mono Mirrored waveform', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('mono.wav', 1, 1))
  await expect(page.getByRole('img', { name: 'Mirrored waveform: Mono' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mono spectrogram' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Time ruler' })).toBeVisible()
})

test('the Analyzing stage shows progress, and Cancel returns to the empty state', async ({
  page,
}) => {
  // Hold every message of the analysis worker until the test releases them.
  await page.addInitScript(() => {
    const gate = window as unknown as { releaseWorker: () => void }
    const released = new Promise<void>((resolve) => {
      gate.releaseWorker = resolve
    })
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      addEventListener(type: string, listener: EventListenerOrEventListenerObject, ...rest: []) {
        if (type !== 'message') {
          super.addEventListener(type, listener, ...rest)
          return
        }
        super.addEventListener(
          type,
          (event) => {
            void released.then(() => {
              if (typeof listener === 'function') listener(event)
              else listener.handleEvent(event)
            })
          },
          ...rest,
        )
      }
    }
  })

  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('stereo.wav', 2, 1))
  await expect(page.getByRole('status')).toHaveText('Analyzing')
  await expect(page.getByRole('progressbar', { name: 'Analysis progress' })).toBeVisible()
  // The Source is not shown before its peaks are ready.
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Import audio file' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'stereo.wav' })).toHaveCount(0)

  // Release, so the next import is not held, then import again.
  await page.evaluate(() => (window as unknown as { releaseWorker: () => void }).releaseWorker())
  await page.getByLabel('Audio file').setInputFiles(wav('again.wav', 2, 1))
  await expect(page.getByRole('heading', { name: 'again.wav' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mirrored waveform: R above, L below' })).toBeVisible()
})

test('zooming with the keyboard redraws the Mirrored waveform', async ({ page }) => {
  await page.goto('/')
  await page
    .getByLabel('Audio file')
    .setInputFiles(wav('long.wav', 1, 12, { sampleRate: 8000, amplitude: 20000, ramp: true }))
  const waveform = page.getByRole('img', { name: 'Mirrored waveform: Mono' })
  await expect(waveform).toBeVisible()
  await expect.poll(async () => (await inkAwayFromZeroLine(waveform)).above).toBeGreaterThan(0)
  const before = await canvasHash(waveform)

  await page.getByRole('region', { name: 'Timeline' }).locator('[tabindex="0"]').focus()
  await page.keyboard.press('+')
  await expect.poll(() => canvasHash(waveform)).not.toBe(before)

  await page.keyboard.press('-')
  await expect.poll(() => canvasHash(waveform)).toBe(before)
})

test('the View menu toggles the light theme, and the Lane looks the same in both themes', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Audio file').setInputFiles(wav('loud.wav', 2, 2, { amplitude: 20000 }))
  const waveform = page.getByRole('img', { name: 'Mirrored waveform: R above, L below' })
  const spectrogram = page.getByRole('img', { name: 'Total spectrogram' })
  await expect.poll(async () => (await inkAwayFromZeroLine(waveform)).above).toBeGreaterThan(0)
  await expect.poll(() => spectrogramHasSignal(spectrogram)).toBe(true)
  // A detail tile arriving later would change the baseline.
  await expect(spectrogram).toHaveAttribute('data-detail', 'ready')
  const lane = async () => [await pixelHash(waveform), await pixelHash(spectrogram)]
  const dark = await lane()

  await page.getByRole('menuitem', { name: 'View' }).click()
  await page.getByRole('menuitem', { name: 'Toggle Light/Dark Theme' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  // The chrome follows the theme. Let the redraw it triggers settle, then compare.
  await page.waitForTimeout(300)
  expect(await lane()).toEqual(dark)

  await page.getByRole('menuitem', { name: 'View' }).click()
  await page.getByRole('menuitem', { name: 'Toggle Light/Dark Theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.waitForTimeout(300)
  expect(await lane()).toEqual(dark)
})

test('the View menu chooses the waveform style and the Mirrored waveform is redrawn in it', async ({
  page,
}) => {
  // Only the spectrogram renderer calls putImageData: count its frames.
  await page.addInitScript(() => {
    const counter = window as unknown as { spectrogramFrames: number }
    counter.spectrogramFrames = 0
    // oxlint-disable-next-line typescript/unbound-method -- re-bound with apply() below
    const put = CanvasRenderingContext2D.prototype.putImageData
    CanvasRenderingContext2D.prototype.putImageData = function (
      ...args: [ImageData, number, number]
    ) {
      counter.spectrogramFrames++
      return put.apply(this, args as unknown as Parameters<typeof put>)
    }
  })
  const frames = () =>
    page.evaluate(() => (window as unknown as { spectrogramFrames: number }).spectrogramFrames)
  await page.goto('/')
  // A rising level, so the peak envelope and its moving average are not the same picture.
  await page
    .getByLabel('Audio file')
    .setInputFiles(wav('loud.wav', 2, 2, { sampleRate: 8000, amplitude: 20000, ramp: true }))
  const waveform = page.getByRole('img', { name: 'Mirrored waveform: R above, L below' })
  await expect.poll(async () => (await inkAwayFromZeroLine(waveform)).above).toBeGreaterThan(0)

  async function chooseStyle(name: string) {
    await page.getByRole('menuitem', { name: 'View' }).click()
    await page.getByRole('menuitem', { name: 'Waveform' }).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
  }

  // The default is Peak + RMS.
  await page.getByRole('menuitem', { name: 'View' }).click()
  await page.getByRole('menuitem', { name: 'Waveform' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Peak + RMS' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Peak', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const peakRms = await canvasHash(waveform)
  const spectrogram = page.getByRole('img', { name: 'Total spectrogram' })
  await expect.poll(() => spectrogramHasSignal(spectrogram)).toBe(true)
  await expect(spectrogram).toHaveAttribute('data-detail', 'ready')
  const spectrogramBefore = await pixelHash(spectrogram)
  const framesBefore = await frames()
  expect(framesBefore).toBeGreaterThan(0)

  // Each style draws a different picture (the hash covers alpha: faint and solid layers differ).
  let previous = peakRms
  for (const name of ['Peak', 'RMS', 'Smoothed peak']) {
    await chooseStyle(name)
    await expect.poll(() => canvasHash(waveform)).not.toBe(previous)
    previous = await canvasHash(waveform)
  }

  // The spectrogram does not depend on the waveform style.
  expect(await pixelHash(spectrogram)).toBe(spectrogramBefore)
  expect(await frames()).toBe(framesBefore)

  await chooseStyle('Peak + RMS')
  await expect.poll(() => canvasHash(waveform)).toBe(peakRms)
  await page.getByRole('menuitem', { name: 'View' }).click()
  await page.getByRole('menuitem', { name: 'Waveform' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Peak + RMS' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})
