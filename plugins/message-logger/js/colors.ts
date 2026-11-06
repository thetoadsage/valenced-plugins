import { DefaultSettings } from './shared'
import type { Settings } from './shared'

export function parseHex(value: unknown): string | undefined {
	if (typeof value !== 'string') return
	const hex = value.trim().replace(/^#/, '')
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${[...hex]
			.map(c => c + c)
			.join('')
			.toUpperCase()}`
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
}
export function logColors(settings: Partial<Settings>) {
	return {
		deleted: parseHex(settings.deletedColor) ?? DefaultSettings.deletedColor,
		edited: parseHex(settings.editedColor) ?? DefaultSettings.editedColor,
	}
}
let current = logColors(DefaultSettings)
const listeners = new Set<() => void>()
export const getLogColors = () => current
export function updateLogColors(settings: Partial<Settings>) {
	const next = logColors(settings)
	if (next.deleted === current.deleted && next.edited === current.edited)
		return false
	current = next
	for (const listener of listeners) listener()
	return true
}
export function subscribeLogColors(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
