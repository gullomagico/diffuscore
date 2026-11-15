export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function channelLabel(count: number): string {
  return count === 1 ? 'Mono' : count === 2 ? 'Stereo' : `${count} Channels`
}
