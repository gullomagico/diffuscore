export type Theme = 'dark' | 'light'

const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Canvases read their colours from CSS when they draw, so they subscribe to redraw. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Switches between the dark and light themes. Not persisted: a reload returns to dark. */
export function toggleTheme(): void {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', next === 'dark')
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next)
  for (const listener of [...listeners]) listener()
}
