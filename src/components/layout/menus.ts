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
import { WAVEFORM_STYLES, waveformStyleStore } from '@/timeline/waveform-style'

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
  /** A labelled group of mutually exclusive choices, backed by an external store. */
  | {
      type: 'radio'
      label: string
      options: readonly { value: string; label: string }[]
      store: {
        getSnapshot(): string
        subscribe(listener: () => void): () => void
        set(value: string): void
      }
    }

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
    items: [
      {
        type: 'submenu',
        label: 'Waveform',
        items: [
          {
            type: 'radio',
            label: 'Waveform style',
            options: WAVEFORM_STYLES,
            store: waveformStyleStore,
          },
        ],
      },
      { type: 'separator' },
      { type: 'item', label: 'Toggle Light/Dark Theme', onSelect: toggleTheme },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [{ type: 'item', label: 'About DiffuScore' }],
  },
]
