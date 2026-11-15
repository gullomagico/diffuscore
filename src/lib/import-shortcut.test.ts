import { expect, test } from 'vite-plus/test'
import { importShortcutLabel, isImportShortcut } from './import-shortcut'

const press = (over: Partial<Parameters<typeof isImportShortcut>[0]> = {}) => ({
  key: 'i',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
})

test('Ctrl+I matches on Windows and Linux', () => {
  expect(isImportShortcut(press({ ctrlKey: true }), false)).toBe(true)
  expect(isImportShortcut(press({ ctrlKey: true, key: 'I' }), false)).toBe(true)
})

test('Cmd+I matches on macOS', () => {
  expect(isImportShortcut(press({ metaKey: true }), true)).toBe(true)
})

test('Ctrl+I does not match on macOS and Cmd+I does not match elsewhere', () => {
  expect(isImportShortcut(press({ ctrlKey: true }), true)).toBe(false)
  expect(isImportShortcut(press({ metaKey: true }), false)).toBe(false)
})

test('other keys and extra modifiers do not match', () => {
  expect(isImportShortcut(press({ ctrlKey: true, key: 'o' }), false)).toBe(false)
  expect(isImportShortcut(press({ ctrlKey: true, altKey: true }), false)).toBe(false)
  expect(isImportShortcut(press({ ctrlKey: true, shiftKey: true }), false)).toBe(false)
  expect(isImportShortcut(press(), false)).toBe(false)
})

test('shortcut label follows the platform', () => {
  expect(importShortcutLabel(false)).toBe('Ctrl+I')
  expect(importShortcutLabel(true)).toBe('⌘I')
})
