import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { catalog } from './catalog'
import { cleanText } from './cleaner'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { Settings } from './shared'

export { cleanText, cleanUrl } from './cleaner'
export const rulesLoaded = catalog !== null
interface MessagesModule {
	sendMessage: (...args: unknown[]) => unknown
	editMessage: (...args: unknown[]) => unknown
}
export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage: storage, plugin }) {
		if (!rulesLoaded)
			plugin.reportError(
				'URL cleaning rules could not be loaded. Disable and reinstall Toad URL Cleaner.',
			)
		const settings = () => ({ ...DefaultSettings, ...storage.cache })
		function clean(value: unknown): unknown {
			const current = settings()
			if (!current.enabled) return value
			try {
				if (typeof value === 'string')
					return cleanText(value, current.shortenProducts)
				if (
					value &&
					typeof value === 'object' &&
					'content' in value &&
					typeof value.content === 'string'
				) {
					const content = cleanText(value.content, current.shortenProducts)
					return content === value.content ? value : { ...value, content }
				}
			} catch {
				// Cleaning failure must never prevent copying or sending the original.
			}
			return value
		}
		cleanup(
			instead(
				Clipboard,
				'setString',
				function (
					this: unknown,
					args: [string],
					original: (value: string) => void,
				) {
					if (settings().cleanOnCopy && typeof args[0] === 'string')
						args[0] = clean(args[0]) as string
					return original.apply(this, args)
				},
			),
		)
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withProps<MessagesModule>('sendMessage', 'editMessage'),
				messages => {
					if (patched.has(messages)) return
					patched.add(messages)
					for (const [method, index, option] of [
						['sendMessage', 1, 'cleanOnSend'],
						['editMessage', 2, 'cleanOnEdit'],
					] as const) {
						if (typeof messages[method] !== 'function') continue
						cleanup(
							instead(messages, method, function (args, original) {
								if (settings()[option]) args[index] = clean(args[index])
								return original.apply(this, args)
							}),
						)
					}
				},
			),
		)
	},
	SettingsComponent,
})
