import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { AppState } from 'react-native'
import { patchChannelActionSheet, patchMessageActionSheet } from './actionsheet'
import { MessageArchive, setArchive } from './archive'
import { updateLogColors } from './colors'
import { interceptMessages, refreshLogColors, resetLogs } from './logger'
import { restoreSavedDeletions } from './restore'
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

		updateLogColors(settings())
		let active = true
		cleanup(
			() => {
				active = false
			},
			storage.subscribe(() => {
				if (updateLogColors(settings()))
					Promise.resolve().then(() => {
						if (active) refreshLogColors()
					})
			}),
		)

		const history = new MessageArchive(settings, error =>
			plugin.reportError(error),
		)
		setArchive(history)
		const accountId = () =>
			(Stores.AuthenticationStore as unknown as { getId(): string }).getId()
		history.switchAccount(accountId())

		const appState = AppState.addEventListener('change', state => {
			if (state !== 'active') void history.flush()
		})
		cleanup(() => {
			appState.remove()
			history.stopDownloads()
			setArchive(undefined)
		})
		cleanup(
			...interceptMessages(settings),
			() => {
				resetLogs(true)
				return history.flush()
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
									settings(),
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
				{ max: 1 },
			),
		)
		const restoration = restoreSavedDeletions(settings, error =>
			plugin.reportError(error),
		)
		cleanup(restoration.stop, storage.subscribe(restoration.refresh))
	},
	SettingsComponent,
})
