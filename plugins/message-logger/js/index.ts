import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { patchChannelActionSheet, patchMessageActionSheet } from './actionsheet'
import { interceptMessages, resetLogs } from './logger'
import { styleRow } from './rows'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { GenerateArgs, RowManager } from './rows'
import type { Settings } from './shared'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage: storage, plugin }) {
		const settings = (): Settings => ({
			...DefaultSettings,
			...(storage.cache as Partial<Settings> | undefined),
		})

		cleanup(
			...interceptMessages(settings),
			() => {
				resetLogs()
			},
			patchMessageActionSheet(e =>
				plugin.reportError(
					`Failed to add message actions: ${getErrorStack(e)}`,
				),
			),
			patchChannelActionSheet(e =>
				plugin.reportError(
					`Failed to add channel actions: ${getErrorStack(e)}`,
				),
			),
			// modules/messages/native/renderer/RowGenerator.tsx
			getModules(
				withName<{ prototype: RowManager }>('RowManager'),
				({ prototype }) => {
					cleanup(
						instead(prototype, 'generate', function (args, original) {
							const row = original.apply(this, args)

							try {
								styleRow(
									row,
									args[0],
									(args: GenerateArgs) => original.call(this, args),
									settings().inlineEdits,
								)
							} catch (e) {
								plugin.reportError(
									`Failed to style logged message: ${getErrorStack(e)}`,
								)
							}

							return row
						}),
					)
				},
			),
		)
	},
	SettingsComponent,
})
