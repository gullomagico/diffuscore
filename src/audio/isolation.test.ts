import { describe, expect, test } from 'vite-plus/test'
import { workspaceGate } from './isolation'

describe('workspaceGate', () => {
  test('shows the workspace when the page is cross-origin isolated', () => {
    expect(workspaceGate(true)).toBe('workspace')
  })

  test('shows the deployment misconfigured message when it is not', () => {
    expect(workspaceGate(false)).toBe('misconfigured')
  })
})
