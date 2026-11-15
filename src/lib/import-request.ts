let handler: (() => void) | null = null

/** The workspace registers its file picker here; the menubar and shortcut call requestImport(). */
export function registerImportRequest(fn: () => void): () => void {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

export function requestImport(): void {
  handler?.()
}
