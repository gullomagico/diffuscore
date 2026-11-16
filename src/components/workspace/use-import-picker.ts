import { useCallback, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { importer } from '@/audio/browser'
import { registerImportRequest } from '@/lib/import-request'
import { isImportShortcut } from '@/lib/import-shortcut'
import { isMac } from '@/lib/platform'

/** Only mounted when the workspace gate is open, so a misconfigured deployment registers nothing. Owns the hidden file input and registers the menu and keyboard entry points. */
export function useImportPicker() {
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  useEffect(() => {
    const unregister = registerImportRequest(openPicker)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isImportShortcut(event, isMac)) return
      event.preventDefault()
      openPicker()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      unregister()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openPicker])

  const onInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    // Reset so the same file can be picked again.
    input.value = ''
    void importer.importFiles(files)
  }, [])

  return { inputRef, openPicker, onInputChange }
}
