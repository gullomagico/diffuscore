export interface KeyPress {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** Ctrl+I on Windows/Linux, Cmd+I on macOS, with no other modifier. */
export function isImportShortcut(event: KeyPress, isMac: boolean): boolean {
  // Some synthetic keydown events (e.g. browser autofill) carry no key.
  if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'i') return false
  if (event.altKey || event.shiftKey) return false
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

export function importShortcutLabel(isMac: boolean): string {
  return isMac ? '⌘I' : 'Ctrl+I'
}
