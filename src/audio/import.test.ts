import { describe, expect, test } from 'vite-plus/test'
import { makeFlacHeader, makeWav } from '@/audio/testing/fixtures'
import { createAnalysisStore } from './analysis'
import type { Analyze, AnalyzeOptions, SourceAnalysisResult } from './analysis'
import { createImporter, MAX_FILE_BYTES } from './import'
import type { ImportDeps, ImportState } from './import'
import { createSourceStore } from './source'
import type { DecodedAudio, Source, SourceStore } from './source'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function audio(channelData: number[][], duration: number): DecodedAudio {
  return {
    numberOfChannels: channelData.length,
    length: channelData[0]?.length ?? 0,
    duration,
    getChannelData: (ch) => Float32Array.from(channelData[ch]!),
  }
}

const stereo = (duration = 10) =>
  audio(
    [
      [0.5, -0.5],
      [0.25, -0.25],
    ],
    duration,
  )

function fileOf(bytes: Uint8Array, name = 'piece.wav'): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name)
}

const wavFile = (channels = 2, name = 'piece.wav') =>
  fileOf(makeWav({ channels, sampleRate: 44100, seconds: 0.01 }), name)

/** A File-like object reporting any size without allocating it. */
function fakeFile(size: number, calls: string[]): File {
  return {
    name: 'huge.wav',
    size,
    slice: () => {
      calls.push('read-prefix')
      return { arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }
    },
    arrayBuffer: () => {
      calls.push('read-all')
      return Promise.resolve(new ArrayBuffer(0))
    },
  } as unknown as File
}

const noPeaks: SourceAnalysisResult = {
  peaks: { pyramids: [] },
  spectrograms: { channels: [], total: null },
}

/** The analysis deps for importers built by hand: analysis resolves immediately. */
function analysisDeps(source: SourceStore) {
  return {
    analyze: (() => Promise.resolve(noPeaks)) as Analyze,
    analysis: createAnalysisStore(source),
  }
}

function setup(
  options: {
    duration?: number
    decoded?: DecodedAudio
    confirm?: boolean
    /** Analysis stays pending until the test settles it through `t.analyze`. */
    manualAnalysis?: boolean
  } = {},
) {
  const calls: string[] = []
  const source = createSourceStore()
  const realRelease = source.release.bind(source)
  const realLoad = source.load.bind(source)
  source.release = () => {
    calls.push('release')
    realRelease()
  }
  source.load = (name, decoded) => {
    calls.push('load')
    return realLoad(name, decoded)
  }
  const probe = deferred<number>()
  const decodes: Deferred<DecodedAudio>[] = []
  const analyses: {
    source: Source
    options: AnalyzeOptions
    result: Deferred<SourceAnalysisResult>
  }[] = []
  const analysis = createAnalysisStore(source)
  const deps: ImportDeps = {
    analyze: (src, analyzeOptions) => {
      if (!options.manualAnalysis) return Promise.resolve(noPeaks)
      const result = deferred<SourceAnalysisResult>()
      analyses.push({ source: src, options: analyzeOptions, result })
      return result.promise
    },
    analysis,
    probeDuration: () => {
      calls.push('probe')
      if (options.duration !== undefined) return Promise.resolve(options.duration)
      return probe.promise
    },
    decode: (_encoded, sampleRate) => {
      calls.push(`decode@${sampleRate}`)
      if (options.decoded) return Promise.resolve(options.decoded)
      const pending = deferred<DecodedAudio>()
      decodes.push(pending)
      return pending.promise
    },
    confirmReplace: () => {
      calls.push('confirm')
      return options.confirm ?? true
    },
    source,
  }
  const importer = createImporter(deps)
  const decode = {
    resolve: (value: DecodedAudio) => decodes.at(-1)!.resolve(value),
    reject: (reason?: unknown) => decodes.at(-1)!.reject(reason),
  }
  const analyze = {
    last: () => analyses.at(-1)!,
    resolve: (result: SourceAnalysisResult) => analyses.at(-1)!.result.resolve(result),
    reject: (reason?: unknown) => analyses.at(-1)!.result.reject(reason),
  }
  return { calls, source, analysis, importer, probe, decode, analyze }
}

function errorOf(state: ImportState) {
  if (state.status !== 'error') throw new Error(`expected error, got ${state.status}`)
  return state.error
}

describe('import validation', () => {
  test('refuses a file over the size limit before reading or probing it', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    const calls = t.calls
    await t.importer.importFiles([fakeFile(MAX_FILE_BYTES + 1, calls)])

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('file-too-large')
    expect(errorOf(t.importer.getSnapshot()).message).toContain('1 GB')
    expect(calls).toEqual([])
  })

  test('accepts a file exactly at the size limit', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([fakeFile(MAX_FILE_BYTES, t.calls)])
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).not.toBeNull()
  })

  test('refuses a file the audio element cannot load as an unsupported format', async () => {
    const t = setup()
    const done = t.importer.importFiles([wavFile()])
    t.probe.reject(new Error('MEDIA_ERR_SRC_NOT_SUPPORTED'))
    await done

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('unsupported-format')
    expect(t.calls).toEqual(['probe'])
  })

  test.each([NaN, Infinity, -Infinity])(
    'refuses a file whose duration is %s, saying the duration could not be determined',
    async (duration) => {
      const t = setup({ duration, decoded: stereo() })
      await t.importer.importFiles([wavFile()])

      const error = errorOf(t.importer.getSnapshot())
      expect(error.kind).toBe('unsupported-format')
      expect(error.message).toContain('duration')
      expect(error.message).toContain('could not be determined')
      expect(t.calls).toEqual(['probe'])
    },
  )

  test('refuses a file longer than 30 minutes before decoding', async () => {
    const t = setup({ duration: 1801, decoded: stereo() })
    await t.importer.importFiles([wavFile()])

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-long')
    expect(t.calls).toEqual(['probe'])
  })

  test('accepts a file of exactly 30 minutes', async () => {
    const t = setup({ duration: 1800, decoded: stereo(1800) })
    await t.importer.importFiles([wavFile()])
    expect(t.source.getSnapshot()?.duration).toBe(1800)
  })

  test('refuses a 3-Channel WAV from its header before decoding', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([wavFile(3)])

    const error = errorOf(t.importer.getSnapshot())
    expect(error.kind).toBe('too-many-channels')
    expect(error.message).toContain('3')
    expect(t.calls).toEqual(['probe'])
  })

  test('refuses a FLAC with more than 2 Channels from its STREAMINFO', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([
      fileOf(makeFlacHeader({ channels: 6, sampleRate: 44100 }), 'a.flac'),
    ])
    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-many-channels')
  })

  test('reads only a prefix of the file to find the header channel count', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    let sliced: [number | undefined, number | undefined] | undefined
    const file = wavFile()
    const slice = file.slice.bind(file)
    file.slice = (start, end, type) => {
      sliced = [start, end]
      return slice(start, end, type)
    }
    await t.importer.importFiles([file])
    expect(sliced?.[0]).toBe(0)
    expect(sliced?.[1]).toBeGreaterThan(0)
    expect(sliced?.[1]).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  test('skips the header check when the header is unknown and decodes anyway', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([fileOf(new TextEncoder().encode('ID3 an mp3, say'), 'a.mp3')])
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.calls).toEqual(['probe', 'decode@48000', 'load'])
  })

  test('a corrupt WAV header falls through to the post-decode Channel check', async () => {
    const bytes = makeWav({ channels: 3, sampleRate: 44100, seconds: 0.01 })
    bytes.set(new TextEncoder().encode('xxxx'), 12) // corrupt the fmt chunk id
    const t = setup({ duration: 10, decoded: audio([[0], [0], [0]], 10) })
    await t.importer.importFiles([fileOf(bytes)])

    expect(t.calls).toEqual(['probe', 'decode@48000'])
    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-many-channels')
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('reports a decode failure', async () => {
    const t = setup({ duration: 10 })
    const done = t.importer.importFiles([wavFile()])
    await Promise.resolve()
    await new Promise((r) => setTimeout(r))
    t.decode.reject(new Error('EncodingError'))
    await done

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('decode-failed')
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('refuses a decoded Source of more than 2 Channels', async () => {
    const t = setup({ duration: 10, decoded: audio([[0], [0], [0]], 10) })
    await t.importer.importFiles([fileOf(new TextEncoder().encode('OggS....'), 'a.ogg')])

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-many-channels')
    expect(t.calls).toEqual(['probe', 'decode@48000'])
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('refuses a decoded Source longer than 30 minutes even if the audio element said otherwise', async () => {
    const t = setup({ duration: 100, decoded: stereo(1900) })
    await t.importer.importFiles([wavFile()])

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-long')
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('refuses several files at once and calls nothing', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([wavFile(), wavFile()])

    expect(errorOf(t.importer.getSnapshot())).toEqual({
      kind: 'multiple-files',
      message: 'Drop a single audio file',
    })
    expect(t.calls).toEqual([])
  })

  test('does nothing when no file is given', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    await t.importer.importFiles([])
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.calls).toEqual([])
  })

  test('dismissing an error returns to idle', async () => {
    const t = setup()
    await t.importer.importFiles([wavFile(), wavFile()])
    t.importer.dismissError()
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })
})

describe('import success', () => {
  test('stores each Channel on its own SharedArrayBuffer at 48000 Hz and ends idle', async () => {
    const t = setup({
      duration: 10,
      decoded: audio(
        [
          [0.5, -0.25],
          [1, 0],
        ],
        2,
      ),
    })
    await t.importer.importFiles([wavFile(2, 'diffusion.wav')])

    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.calls).toEqual(['probe', 'decode@48000', 'load'])
    const source = t.source.getSnapshot()!
    expect(source.fileName).toBe('diffusion.wav')
    expect(source.sampleRate).toBe(48000)
    expect(source.duration).toBe(2)
    expect(source.channels).toHaveLength(2)
    for (const channel of source.channels) {
      expect(channel).toBeInstanceOf(Float32Array)
      expect(channel.buffer).toBeInstanceOf(SharedArrayBuffer)
    }
    expect(source.channels[0]!.buffer).not.toBe(source.channels[1]!.buffer)
    expect(Array.from(source.channels[0]!)).toEqual([0.5, -0.25])
    expect(Array.from(source.channels[1]!)).toEqual([1, 0])
  })

  test('a mono file gives a Source with one Channel', async () => {
    const t = setup({ duration: 10, decoded: audio([[0.5]], 1) })
    await t.importer.importFiles([wavFile(1)])
    expect(t.source.getSnapshot()?.channels).toHaveLength(1)
  })

  test('the stage goes reading, decoding, analyzing, then idle', async () => {
    const t = setup({ duration: 10, decoded: stereo() })
    const seen: ImportState[] = []
    t.importer.subscribe(() => seen.push(t.importer.getSnapshot()))
    await t.importer.importFiles([wavFile(2, 'a.wav')])

    expect(seen).toEqual([
      { status: 'loading', stage: 'reading', fileName: 'a.wav', progress: null },
      { status: 'loading', stage: 'decoding', fileName: 'a.wav', progress: null },
      { status: 'loading', stage: 'analyzing', fileName: 'a.wav', progress: 0 },
      { status: 'idle' },
    ])
  })

  test('the snapshot is referentially stable between changes', async () => {
    const t = setup()
    expect(t.importer.getSnapshot()).toBe(t.importer.getSnapshot())
    await t.importer.importFiles([wavFile(), wavFile()])
    expect(t.importer.getSnapshot()).toBe(t.importer.getSnapshot())
  })

  test('ignores a new import while one is loading', async () => {
    const t = setup()
    const first = t.importer.importFiles([wavFile(2, 'first.wav')])
    await t.importer.importFiles([wavFile(2, 'second.wav')])

    expect(t.importer.getSnapshot()).toEqual({
      status: 'loading',
      stage: 'reading',
      fileName: 'first.wav',
      progress: null,
    })
    expect(t.calls).toEqual(['probe'])
    t.importer.cancel()
    t.probe.resolve(10)
    await first
  })
})

describe('replacing a loaded Source', () => {
  async function loaded(options: Parameters<typeof setup>[0] = {}) {
    const t = setup({ ...options, duration: 10, decoded: undefined })
    const done = t.importer.importFiles([wavFile(2, 'old.wav')])
    await tick()
    t.decode.resolve(stereo())
    await done
    t.calls.length = 0
    return t
  }
  const tick = () => new Promise((r) => setTimeout(r))

  test('runs cheap checks, then confirmation, then releases the old Source, then decodes', async () => {
    const t = await loaded()
    const done = t.importer.importFiles([wavFile(2, 'new.wav')])
    await tick()
    expect(t.calls).toEqual(['probe', 'confirm', 'release', 'decode@48000'])
    expect(t.source.getSnapshot()).toBeNull()
    t.importer.cancel()
    t.decode.resolve(stereo())
    await done
  })

  test('a declined confirmation keeps the current Source and returns to idle', async () => {
    const t = await loaded({ confirm: false })
    const old = t.source.getSnapshot()
    await t.importer.importFiles([wavFile(2, 'new.wav')])

    expect(t.calls).toEqual(['probe', 'confirm'])
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBe(old)
    expect(old?.fileName).toBe('old.wav')
  })

  test('a cheap-check failure keeps the current Source without asking for confirmation', async () => {
    const t = await loaded()
    const old = t.source.getSnapshot()
    await t.importer.importFiles([wavFile(3, 'new.wav')])

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('too-many-channels')
    expect(t.calls).toEqual(['probe'])
    expect(t.source.getSnapshot()).toBe(old)
  })

  test('a file that is too large keeps the current Source', async () => {
    const t = await loaded()
    const old = t.source.getSnapshot()
    await t.importer.importFiles([fakeFile(MAX_FILE_BYTES + 1, t.calls)])
    expect(errorOf(t.importer.getSnapshot()).kind).toBe('file-too-large')
    expect(t.source.getSnapshot()).toBe(old)
  })

  test('a failed replacement ends with no Source and the error shown', async () => {
    const t = await loaded()
    const done = t.importer.importFiles([wavFile(2, 'new.wav')])
    await tick()
    t.decode.reject(new Error('EncodingError'))
    await done

    expect(errorOf(t.importer.getSnapshot()).kind).toBe('decode-failed')
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('a cancelled replacement ends with no Source and idle', async () => {
    const t = await loaded()
    const done = t.importer.importFiles([wavFile(2, 'new.wav')])
    await tick()
    t.importer.cancel()
    t.decode.resolve(stereo())
    await done

    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBeNull()
  })

  test('a successful replacement loads the new Source', async () => {
    const t = await loaded()
    const done = t.importer.importFiles([wavFile(2, 'new.wav')])
    await tick()
    t.decode.resolve(audio([[1]], 3))
    await done
    expect(t.source.getSnapshot()?.fileName).toBe('new.wav')
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('cancelling while waiting for confirmation keeps the current Source', async () => {
    const t = await loaded()
    const old = t.source.getSnapshot()
    const answer = deferred<boolean>()
    const calls = t.calls
    const importer = createImporter({
      probeDuration: () => Promise.resolve(10),
      decode: () => Promise.reject(new Error('must not decode')),
      confirmReplace: () => {
        calls.push('confirm')
        return answer.promise
      },
      source: t.source,
      ...analysisDeps(t.source),
    })
    const done = importer.importFiles([wavFile()])
    await tick()
    importer.cancel()
    answer.resolve(true)
    await done

    expect(importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBe(old)
  })
})

describe('cancel', () => {
  const tick = () => new Promise((r) => setTimeout(r))

  test('during decoding goes back to the empty state and discards the late result', async () => {
    const t = setup({ duration: 10 })
    const done = t.importer.importFiles([wavFile()])
    await tick()
    expect(t.importer.getSnapshot()).toMatchObject({ status: 'loading', stage: 'decoding' })

    t.importer.cancel()
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })

    t.decode.resolve(stereo())
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBeNull()
    expect(t.calls).not.toContain('load')
  })

  test('a late decode failure after cancel sets no error', async () => {
    const t = setup({ duration: 10 })
    const done = t.importer.importFiles([wavFile()])
    await tick()
    t.importer.cancel()
    t.decode.reject(new Error('late'))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('while probing discards the late probe result', async () => {
    const t = setup()
    const done = t.importer.importFiles([wavFile()])
    t.importer.cancel()
    t.probe.resolve(10)
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.calls).toEqual(['probe'])
  })

  test('a new import after a cancel is not affected by the stale one', async () => {
    const calls: string[] = []
    const source = createSourceStore()
    const decodes: Deferred<DecodedAudio>[] = []
    const importer = createImporter({
      probeDuration: () => Promise.resolve(10),
      decode: () => {
        const d = deferred<DecodedAudio>()
        decodes.push(d)
        calls.push('decode')
        return d.promise
      },
      confirmReplace: () => true,
      source,
      ...analysisDeps(source),
    })
    const stale = importer.importFiles([wavFile(2, 'stale.wav')])
    await tick()
    importer.cancel()
    const fresh = importer.importFiles([wavFile(2, 'fresh.wav')])
    await tick()

    decodes[0]!.resolve(stereo())
    await stale
    expect(source.getSnapshot()).toBeNull()
    expect(importer.getSnapshot()).toMatchObject({ status: 'loading', fileName: 'fresh.wav' })

    decodes[1]!.resolve(stereo())
    await fresh
    expect(source.getSnapshot()?.fileName).toBe('fresh.wav')
    expect(importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('does nothing when not loading', () => {
    const t = setup()
    t.importer.cancel()
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })
})

describe('analyzing', () => {
  const tick = () => new Promise((r) => setTimeout(r))
  const peaksOf = (length: number): SourceAnalysisResult => ({
    peaks: { pyramids: [{ length, levels: [] }] },
    spectrograms: { channels: [{ levels: [] }], total: null },
  })

  /** Runs an import up to the point where analysis is pending. */
  async function analyzing(fileName = 'a.wav') {
    const t = setup({ duration: 10, manualAnalysis: true })
    const done = t.importer.importFiles([wavFile(2, fileName)])
    await tick()
    t.decode.resolve(stereo())
    await tick()
    return { t, done }
  }

  test('hands the loaded Source to analyze', async () => {
    const { t, done } = await analyzing()
    expect(t.importer.getSnapshot()).toMatchObject({ status: 'loading', stage: 'analyzing' })
    expect(t.analyze.last().source).toBe(t.source.getSnapshot())
    t.analyze.resolve(peaksOf(1))
    await done
  })

  test('reports progress in the state, null in the earlier stages', async () => {
    const t = setup({ duration: 10, manualAnalysis: true })
    const seen: (number | null)[] = []
    t.importer.subscribe(() => {
      const state = t.importer.getSnapshot()
      if (state.status === 'loading') seen.push(state.progress)
    })
    const done = t.importer.importFiles([wavFile()])
    await tick()
    t.decode.resolve(stereo())
    await tick()
    t.analyze.last().options.onProgress(0.25)
    t.analyze.last().options.onProgress(0.5)
    expect(seen).toEqual([null, null, 0, 0.25, 0.5])
    t.analyze.resolve(peaksOf(1))
    await done
  })

  test('progress is clamped to 0..1 and never goes backwards', async () => {
    const { t, done } = await analyzing()
    const progress = () => (t.importer.getSnapshot() as { progress: number | null }).progress
    t.analyze.last().options.onProgress(0.5)
    t.analyze.last().options.onProgress(0.3)
    expect(progress()).toBe(0.5)
    t.analyze.last().options.onProgress(7)
    expect(progress()).toBe(1)
    t.analyze.last().options.onProgress(-2)
    expect(progress()).toBe(1)
    t.analyze.resolve(peaksOf(1))
    await done
  })

  test('a new state object is published for each progress change only', async () => {
    const { t, done } = await analyzing()
    let calls = 0
    t.importer.subscribe(() => calls++)
    t.analyze.last().options.onProgress(0.5)
    t.analyze.last().options.onProgress(0.4)
    expect(calls).toBe(1)
    t.analyze.resolve(peaksOf(1))
    await done
  })

  test('publishes the analysis of the Source and goes idle', async () => {
    const { t, done } = await analyzing()
    const p = peaksOf(3)
    t.analyze.resolve(p)
    await done

    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.analysis.getSnapshot()?.source).toBe(t.source.getSnapshot())
    expect(t.analysis.getSnapshot()?.peaks).toBe(p.peaks)
    expect(t.analysis.getSnapshot()?.spectrograms).toBe(p.spectrograms)
  })

  test('the analysis is already published when the state becomes idle', async () => {
    const { t, done } = await analyzing()
    let atIdle: unknown = 'never idle'
    t.importer.subscribe(() => {
      if (t.importer.getSnapshot().status === 'idle') atIdle = t.analysis.getSnapshot()
    })
    t.analyze.resolve(peaksOf(3))
    await done
    expect(atIdle).not.toBeNull()
    expect(atIdle).not.toBe('never idle')
  })

  test('cancel aborts the analysis, leaves no Source and no analysis, and goes idle', async () => {
    const { t, done } = await analyzing()
    expect(t.analyze.last().options.signal.aborted).toBe(false)
    t.importer.cancel()

    expect(t.analyze.last().options.signal.aborted).toBe(true)
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBeNull()

    t.analyze.reject(new DOMException('Aborted', 'AbortError'))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('a late result after cancel publishes nothing', async () => {
    const { t, done } = await analyzing()
    t.importer.cancel()
    t.analyze.resolve(peaksOf(3))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('progress after cancel is ignored', async () => {
    const { t, done } = await analyzing()
    t.importer.cancel()
    t.analyze.last().options.onProgress(0.9)
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    t.analyze.resolve(peaksOf(3))
    await done
  })

  test('progress across the peaks and spectrogram phases is monotonic and ends at 1', async () => {
    const t = setup({ duration: 10, manualAnalysis: true })
    const seen: number[] = []
    t.importer.subscribe(() => {
      const state = t.importer.getSnapshot()
      if (state.status === 'loading' && state.progress !== null) seen.push(state.progress)
    })
    const done = t.importer.importFiles([wavFile()])
    await tick()
    t.decode.resolve(stereo())
    await tick()
    for (const fraction of [0.05, 0.1, 0.4, 0.95, 1]) t.analyze.last().options.onProgress(fraction)
    expect(seen).toEqual([0, 0.05, 0.1, 0.4, 0.95, 1])
    t.analyze.resolve(peaksOf(1))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('cancel during the spectrogram phase aborts and leaves no Source and no analysis', async () => {
    const { t, done } = await analyzing()
    t.analyze.last().options.onProgress(0.1)
    t.analyze.last().options.onProgress(0.6)
    t.importer.cancel()

    expect(t.analyze.last().options.signal.aborted).toBe(true)
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBeNull()

    t.analyze.reject(new DOMException('Aborted', 'AbortError'))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
    expect(t.source.getSnapshot()).toBeNull()
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('a failure during the spectrogram phase reports an error and leaves no Source', async () => {
    const { t, done } = await analyzing()
    t.analyze.last().options.onProgress(0.6)
    t.analyze.reject(new Error('spectrogram failed'))
    await done

    expect(errorOf(t.importer.getSnapshot())).toEqual({
      kind: 'analysis-failed',
      message: 'This Source could not be analyzed.',
    })
    expect(t.source.getSnapshot()).toBeNull()
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('a failed analysis reports an error and leaves no Source', async () => {
    const { t, done } = await analyzing()
    t.analyze.reject(new Error('worker crashed'))
    await done

    expect(errorOf(t.importer.getSnapshot())).toEqual({
      kind: 'analysis-failed',
      message: 'This Source could not be analyzed.',
    })
    expect(t.source.getSnapshot()).toBeNull()
    expect(t.analysis.getSnapshot()).toBeNull()
  })

  test('a Source released by someone else during analysis does not crash and is not published', async () => {
    const { t, done } = await analyzing()
    t.source.release()
    t.analyze.resolve(peaksOf(3))
    await done
    expect(t.analysis.getSnapshot()).toBeNull()
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('a Source released by someone else during analysis aborts it without an error', async () => {
    const { t, done } = await analyzing()
    t.source.release()
    expect(t.analyze.last().options.signal.aborted).toBe(true)
    t.analyze.reject(new DOMException('aborted', 'AbortError'))
    await done
    expect(t.importer.getSnapshot()).toEqual({ status: 'idle' })
  })

  test('cancelling while reading a replacement keeps the old Source and its analysis', async () => {
    const t = setup({ duration: 10 })
    const first = t.importer.importFiles([wavFile(2, 'old.wav')])
    await tick()
    t.decode.resolve(stereo())
    await first
    const old = t.source.getSnapshot()
    const oldAnalysis = t.analysis.getSnapshot()
    expect(oldAnalysis?.source).toBe(old)

    const second = t.importer.importFiles([wavFile(2, 'new.wav')])
    t.importer.cancel()
    await second

    expect(t.source.getSnapshot()).toBe(old)
    expect(t.analysis.getSnapshot()).toBe(oldAnalysis)
  })

  test('a replacement import releases the previous analysis with the previous Source', async () => {
    const t = setup({ duration: 10 })
    const first = t.importer.importFiles([wavFile(2, 'old.wav')])
    await tick()
    t.decode.resolve(stereo())
    await first
    expect(t.analysis.getSnapshot()).not.toBeNull()

    const second = t.importer.importFiles([wavFile(2, 'new.wav')])
    await tick()
    expect(t.source.getSnapshot()).toBeNull()
    expect(t.analysis.getSnapshot()).toBeNull()
    t.importer.cancel()
    t.decode.resolve(stereo())
    await second
  })
})

test('a header that cannot be read skips the Channel check instead of refusing the file', async () => {
  const bytes = makeWav({ channels: 2, sampleRate: 44100, seconds: 0.01 })
  const file = new File([bytes as Uint8Array<ArrayBuffer>], 'piece.wav')
  file.slice = () => {
    throw new Error('NotReadableError')
  }
  const source = createSourceStore()
  const importer = createImporter({
    probeDuration: () => Promise.resolve(10),
    decode: () => Promise.resolve(stereo()),
    confirmReplace: () => true,
    source,
    ...analysisDeps(source),
  })

  await importer.importFiles([file])

  expect(importer.getSnapshot()).toEqual({ status: 'idle' })
  expect(source.getSnapshot()?.fileName).toBe('piece.wav')
})
