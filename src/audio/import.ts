import { readHeaderChannelCount } from '@/audio/headers'
import type { HeaderChannelCount } from '@/audio/headers'
import { SOURCE_SAMPLE_RATE } from '@/audio/source'
import type { DecodedAudio, SourceStore } from '@/audio/source'

export const MAX_FILE_BYTES = 1024 ** 3 // 1 GB, provisional
export const MAX_DURATION_SECONDS = 30 * 60 // 30 min, provisional
export const MAX_CHANNELS = 2

/** How much of the file is read to find the channel count in its header. */
const HEADER_PREFIX_BYTES = 1024 * 1024

export type ImportErrorKind =
  | 'unsupported-format'
  | 'too-many-channels'
  | 'file-too-large'
  | 'too-long'
  | 'decode-failed'
  | 'multiple-files'

export interface ImportError {
  readonly kind: ImportErrorKind
  readonly message: string
}

export type ImportStage = 'reading' | 'decoding'

export type ImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly stage: ImportStage; readonly fileName: string }
  | { readonly status: 'error'; readonly error: ImportError }

export interface ImportDeps {
  /** Resolves with the <audio> element's duration in seconds (may be NaN/Infinity). Rejects when the element fails to load the file. */
  probeDuration(file: File): Promise<number>
  /** Decodes the encoded bytes at the given sample rate (OfflineAudioContext in the browser). Rejects on decode failure. */
  decode(encoded: ArrayBuffer, sampleRate: number): Promise<DecodedAudio>
  /** Asks the user to confirm discarding the current Source. */
  confirmReplace(): boolean | Promise<boolean>
  source: SourceStore
}

export interface Importer {
  getSnapshot(): ImportState
  subscribe(listener: () => void): () => void
  importFiles(files: readonly File[]): Promise<void>
  cancel(): void
  dismissError(): void
}

const IDLE: ImportState = { status: 'idle' }

function failure(kind: ImportErrorKind, message: string): ImportError {
  return { kind, message }
}

function tooManyChannels(count: number): ImportError {
  return failure(
    'too-many-channels',
    `This Source has ${count} Channels. Only mono and stereo are supported (up to ${MAX_CHANNELS} Channels).`,
  )
}

function tooLong(): ImportError {
  return failure(
    'too-long',
    `This Source is longer than ${MAX_DURATION_SECONDS / 60} minutes, which is the maximum.`,
  )
}

export function createImporter(deps: ImportDeps): Importer {
  let state: ImportState = IDLE
  /** Bumped by every new import and by cancel(), so results of a stale import are discarded. */
  let generation = 0
  const listeners = new Set<() => void>()

  function setState(next: ImportState): void {
    if (next === state) return
    state = next
    for (const listener of [...listeners]) listener()
  }

  /** Resolves with an error to report, or null when the Source was loaded or the import was cancelled/declined. */
  async function run(file: File, isCurrent: () => boolean): Promise<ImportError | null> {
    // 1. Size, before reading any bytes.
    if (file.size > MAX_FILE_BYTES) {
      return failure(
        'file-too-large',
        `This file is larger than ${MAX_FILE_BYTES / 1024 ** 3} GB, which is the maximum.`,
      )
    }

    // 2. Duration from the <audio> element.
    let probed: number
    try {
      probed = await deps.probeDuration(file)
    } catch {
      return failure('unsupported-format', 'This audio format is not supported by your browser.')
    }
    if (!isCurrent()) return null
    if (typeof probed !== 'number' || !Number.isFinite(probed)) {
      return failure(
        'unsupported-format',
        'The duration of this audio file could not be determined, so it cannot be imported.',
      )
    }
    if (probed > MAX_DURATION_SECONDS) return tooLong()

    // 3. Channel count from the header. An unreadable or unknown header never refuses the file.
    let headerChannels: HeaderChannelCount = 'unknown'
    try {
      const prefix = await file.slice(0, HEADER_PREFIX_BYTES).arrayBuffer()
      headerChannels = readHeaderChannelCount(new Uint8Array(prefix))
    } catch {
      // Fall through to the post-decode check.
    }
    if (!isCurrent()) return null
    if (headerChannels !== 'unknown' && headerChannels > MAX_CHANNELS) {
      return tooManyChannels(headerChannels)
    }

    // 4. Replace confirmation, then release the old Source before decoding.
    if (deps.source.getSnapshot() !== null) {
      let confirmed: boolean
      try {
        confirmed = await deps.confirmReplace()
      } catch {
        confirmed = false
      }
      if (!isCurrent() || !confirmed) return null
      deps.source.release()
    }

    // 5. Read the whole file, then decode.
    let decoded: DecodedAudio
    try {
      let encoded: ArrayBuffer | null = await file.arrayBuffer()
      if (!isCurrent()) return null
      setState({ status: 'loading', stage: 'decoding', fileName: file.name })
      const pending = deps.decode(encoded, SOURCE_SAMPLE_RATE)
      encoded = null
      decoded = await pending
    } catch {
      return failure('decode-failed', 'This file could not be decoded. It may be corrupt.')
    }
    if (!isCurrent()) return null

    // 6. Post-decode checks (covers compressed formats and VBR duration estimates).
    if (decoded.numberOfChannels > MAX_CHANNELS) return tooManyChannels(decoded.numberOfChannels)
    if (decoded.duration > MAX_DURATION_SECONDS) return tooLong()

    // 7. Hand over to the Source store.
    deps.source.load(file.name, decoded)
    return null
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async importFiles(files) {
      if (state.status === 'loading') return
      if (files.length === 0) return
      if (files.length !== 1) {
        setState({
          status: 'error',
          error: failure('multiple-files', 'Drop a single audio file'),
        })
        return
      }
      const file = files[0]!
      const token = ++generation
      const isCurrent = () => token === generation
      setState({ status: 'loading', stage: 'reading', fileName: file.name })
      let error: ImportError | null
      try {
        error = await run(file, isCurrent)
      } catch {
        error = failure('decode-failed', 'This file could not be imported.')
      }
      if (!isCurrent()) return
      setState(error ? { status: 'error', error } : IDLE)
    },
    cancel() {
      if (state.status !== 'loading') return
      generation++
      setState(IDLE)
    },
    dismissError() {
      if (state.status === 'error') setState(IDLE)
    },
  }
}
