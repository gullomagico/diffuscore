import { useState, useSyncExternalStore } from 'react'
import type { DragEvent } from 'react'
import { importer } from '@/audio/browser'
import { analysisStore } from '@/audio/analysis'
import { workspaceGate } from '@/audio/isolation'
import { sourceStore } from '@/audio/source'
import { EmptyState } from '@/components/workspace/empty-state'
import { LoadedView } from '@/components/workspace/loaded-view'
import { LoadingOverlay } from '@/components/workspace/loading-overlay'
import { Misconfigured } from '@/components/workspace/misconfigured'
import { useImportPicker } from '@/components/workspace/use-import-picker'

const ACCEPT = 'audio/*,.wav,.flac,.mp3,.ogg,.m4a,.aif,.aiff'

const subscribeImporter = (listener: () => void) => importer.subscribe(listener)
const getImportState = () => importer.getSnapshot()
const subscribeSource = (listener: () => void) => sourceStore.subscribe(listener)
const getSource = () => sourceStore.getSnapshot()
const subscribeAnalysis = (listener: () => void) => analysisStore.subscribe(listener)
const getAnalysis = () => analysisStore.getSnapshot()

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function WorkspacePage() {
  const gate = workspaceGate(globalThis.crossOriginIsolated)
  if (gate === 'misconfigured') return <Misconfigured />
  return <Workspace />
}

function Workspace() {
  const importState = useSyncExternalStore(subscribeImporter, getImportState)
  const source = useSyncExternalStore(subscribeSource, getSource)
  const analysis = useSyncExternalStore(subscribeAnalysis, getAnalysis)
  const { inputRef, openPicker, onInputChange } = useImportPicker()
  const [dragDepth, setDragDepth] = useState(0)

  const errorMessage = importState.status === 'error' ? importState.error.message : undefined

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDragDepth((d) => d + 1)
  }
  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
  }
  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return
    setDragDepth((d) => Math.max(0, d - 1))
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragDepth(0)
    void importer.importFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div
      className="relative h-full"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Audio file"
        onChange={onInputChange}
      />
      {/* A Source is shown only once its analysis is ready: until then the overlay covers the empty state. */}
      {source && analysis?.source === source ? (
        <LoadedView
          analysis={analysis}
          errorMessage={errorMessage}
          onChoose={openPicker}
          onDismissError={() => importer.dismissError()}
        />
      ) : (
        <EmptyState errorMessage={errorMessage} onChoose={openPicker} />
      )}
      {importState.status === 'loading' && (
        <LoadingOverlay
          stage={importState.stage}
          fileName={importState.fileName}
          progress={importState.progress}
          onCancel={() => importer.cancel()}
        />
      )}
      {dragDepth > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium"
        >
          Drop an audio file to import
        </div>
      )}
    </div>
  )
}
