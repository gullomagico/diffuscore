import { expect, test } from 'vite-plus/test'
import { channelLabel, formatDuration } from './format'

test('formats seconds as mm:ss, flooring', () => {
  expect(formatDuration(0)).toBe('00:00')
  expect(formatDuration(65.4)).toBe('01:05')
  expect(formatDuration(1800)).toBe('30:00')
  expect(formatDuration(59.99)).toBe('00:59')
})

test('labels Channels', () => {
  expect(channelLabel(1)).toBe('Mono')
  expect(channelLabel(2)).toBe('Stereo')
})
