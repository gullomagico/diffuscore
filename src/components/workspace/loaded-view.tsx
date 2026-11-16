import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Source } from '@/audio/source'
import { channelLabel, formatDuration } from '@/lib/format'

export function LoadedView({
  source,
  errorMessage,
  onChoose,
  onDismissError,
}: {
  source: Source
  errorMessage?: string
  onChoose: () => void
  onDismissError: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          <p className="min-w-0 flex-1">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={onChoose}>
            Choose another file
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismissError}>
            <X />
          </Button>
        </div>
      )}
      <header className="flex items-baseline gap-6 border-b px-4 py-2 text-sm">
        <h1 className="min-w-0 truncate font-medium">{source.fileName}</h1>
        <dl className="flex gap-6 text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Duration</dt>
            <dd className="font-mono text-foreground">{formatDuration(source.duration)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Channels</dt>
            <dd className="text-foreground">{channelLabel(source.channels.length)}</dd>
          </div>
        </dl>
      </header>
      <section aria-label="Timeline" className="min-h-0 flex-1" />
    </div>
  )
}
