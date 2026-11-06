import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }
	return (
		<Page>
			<ScrollView>
				<Design.TableRowGroup title="Silent messages">
					<Design.TableSwitchRow
						label="Keep toggle on when changing channels"
						value={settings.persistState}
						onValueChange={persistState => storage.set({ persistState })}
					/>
					<Design.TableSwitchRow
						label="Turn off after sending"
						value={settings.autoDisable}
						onValueChange={autoDisable => storage.set({ autoDisable })}
					/>
				</Design.TableRowGroup>
			</ScrollView>
		</Page>
	)
}
