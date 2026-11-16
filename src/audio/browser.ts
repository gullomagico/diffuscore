import { createImporter } from '@/audio/import'
import type { ImportDeps } from '@/audio/import'
import { analysisStore } from '@/audio/analysis'
import { sourceStore } from '@/audio/source'
import { analyzeInWorker } from '@/timeline/analyze'

function probeDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    const cleanup = () => {
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = audio.duration
      cleanup()
      resolve(duration)
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('audio element failed to load the file'))
    }
    audio.src = url
  })
}

function decode(encoded: ArrayBuffer, sampleRate: number) {
  return new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(encoded)
}

function confirmReplace(): boolean {
  return window.confirm('Importing this file will discard the current Source. Continue?')
}

const deps: ImportDeps = {
  probeDuration,
  decode,
  confirmReplace,
  source: sourceStore,
  analyze: analyzeInWorker,
  analysis: analysisStore,
}

export const importer = createImporter(deps)
