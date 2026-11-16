/**
 * Declarative menu definitions for the application menubar.
 *
 * Add, remove, or reorder menus here; `AppMenubar` renders whatever this
 * module exports. Wire behaviour through `onSelect` as features land.
 */

import { importShortcutLabel } from '@/lib/import-shortcut'
import { requestImport } from '@/lib/import-request'
import { isMac } from '@/lib/platform'
import { toggleTheme } from '@/lib/theme'

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
    items: [
      {
        type: 'item',
        label: 'Import Audio…',
        shortcut: importShortcutLabel(isMac),
        onSelect: requestImport,
      },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [{ type: 'item', label: 'Toggle Light/Dark Theme', onSelect: toggleTheme }],
  },
  {
    id: 'help',
    label: 'Help',
    items: [{ type: 'item', label: 'About DiffuScore' }],
  },
]
