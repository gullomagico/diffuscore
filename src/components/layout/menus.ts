/**
 * Declarative menu definitions for the application menubar.
 *
 * Add, remove, or reorder menus here; `AppMenubar` renders whatever this
 * module exports. Wire behaviour through `onSelect` as features land.
 */

export type MenuEntry =
  | {
      type: 'item'
      label: string
      shortcut?: string
      disabled?: boolean
      variant?: 'default' | 'destructive'
      onSelect?: () => void
    }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; items: MenuEntry[] }

export interface MenuDefinition {
  id: string
  label: string
  items: MenuEntry[]
}

export const appMenus: MenuDefinition[] = [
  {
    id: 'file',
    label: 'File',
    items: [{ type: 'item', label: 'Import Audio…', shortcut: 'Ctrl+I' }],
  },
  {
    id: 'help',
    label: 'Help',
    items: [{ type: 'item', label: 'About DiffuScore' }],
  },
]
