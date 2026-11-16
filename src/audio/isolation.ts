export type WorkspaceGate = 'workspace' | 'misconfigured'

/** No fallback exists without isolation (ADR-0002): the import UI is replaced by a blocking message. */
export function workspaceGate(crossOriginIsolated: boolean): WorkspaceGate {
  return crossOriginIsolated ? 'workspace' : 'misconfigured'
}
