import { useCallback, useSyncExternalStore } from 'react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { appMenus, type MenuDefinition, type MenuEntry } from './menus'

function RadioEntry({ entry }: { entry: Extract<MenuEntry, { type: 'radio' }> }) {
  const { store } = entry
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store])
  const value = useSyncExternalStore(subscribe, () => store.getSnapshot())
  return (
    <>
      <MenubarLabel inset>{entry.label}</MenubarLabel>
      <MenubarRadioGroup value={value} onValueChange={(next) => store.set(next)}>
        {entry.options.map((option) => (
          <MenubarRadioItem key={option.value} value={option.value}>
            {option.label}
          </MenubarRadioItem>
        ))}
      </MenubarRadioGroup>
    </>
  )
}

function MenuEntries({ entries }: { entries: MenuEntry[] }) {
  return entries.map((entry, index) => {
    switch (entry.type) {
      case 'separator':
        return <MenubarSeparator key={`separator-${index}`} />
      case 'submenu':
        return (
          <MenubarSub key={entry.label}>
            <MenubarSubTrigger>{entry.label}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenuEntries entries={entry.items} />
            </MenubarSubContent>
          </MenubarSub>
        )
      case 'radio':
        return <RadioEntry key={entry.label} entry={entry} />
      case 'item':
        return (
          <MenubarItem
            key={entry.label}
            disabled={entry.disabled}
            variant={entry.variant}
            onSelect={entry.onSelect}
          >
            {entry.label}
            {entry.shortcut && <MenubarShortcut>{entry.shortcut}</MenubarShortcut>}
          </MenubarItem>
        )
    }
  })
}

export function AppMenubar({ menus = appMenus }: { menus?: MenuDefinition[] }) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b bg-background px-2">
      <span className="flex items-center gap-1.5 px-2 text-sm font-semibold select-none">
        <span className="text-primary" aria-hidden>
          ◐
        </span>
        DiffuScore
      </span>
      <Menubar className="h-auto rounded-none border-none bg-transparent p-0 shadow-none">
        {menus.map((menu) => (
          <MenubarMenu key={menu.id}>
            <MenubarTrigger>{menu.label}</MenubarTrigger>
            <MenubarContent>
              <MenuEntries entries={menu.items} />
            </MenubarContent>
          </MenubarMenu>
        ))}
      </Menubar>
    </header>
  )
}
