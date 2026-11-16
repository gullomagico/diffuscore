export interface Source {
  readonly fileName: string
  /** One SharedArrayBuffer per Channel. */
  readonly channels: readonly Float32Array<SharedArrayBuffer>[]
  readonly sampleRate: number
  /** Seconds. */
  readonly duration: number
}

/** The application's working sample rate. The only place this literal is written. */
export const SOURCE_SAMPLE_RATE = 48000

/** Structural subset of AudioBuffer, so a real AudioBuffer is assignable. */
export interface DecodedAudio {
  readonly numberOfChannels: number
  /** Sample frames. */
  readonly length: number
  /** Seconds. */
  readonly duration: number
  getChannelData(channel: number): Float32Array
}

export interface SourceStore {
  getSnapshot(): Source | null
  subscribe(listener: () => void): () => void
  load(fileName: string, decoded: DecodedAudio): Source
  release(): void
}

export function createSourceStore(): SourceStore {
  let current: Source | null = null
  const listeners = new Set<() => void>()

  function set(next: Source | null): void {
    current = next
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load(fileName, decoded) {
      const channels: Float32Array<SharedArrayBuffer>[] = []
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch)
        // set() rather than copyFromChannel: the latter may reject shared views.
        const shared = new Float32Array(
          new SharedArrayBuffer(data.length * Float32Array.BYTES_PER_ELEMENT),
        )
        shared.set(data)
        channels.push(shared)
      }
      const source: Source = {
        fileName,
        channels,
        sampleRate: SOURCE_SAMPLE_RATE,
        duration: decoded.duration,
      }
      set(source)
      return source
    },
    release() {
      set(null)
    },
  }
}

export const sourceStore: SourceStore = createSourceStore()
