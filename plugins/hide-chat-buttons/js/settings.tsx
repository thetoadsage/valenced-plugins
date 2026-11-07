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
				<Design.TableRowGroup
					title="Hide chat buttons"
					description="Reload Discord after changing these settings."
				>
					<Design.TableSwitchRow
						label="Plus (attachments and actions)"
						value={settings.hidePlus}
						onValueChange={hidePlus => storage.set({ hidePlus })}
					/>
					<Design.TableSwitchRow
						label="Gift"
						value={settings.hideGift}
						onValueChange={hideGift => storage.set({ hideGift })}
					/>
					<Design.TableSwitchRow
						label="Emoji"
						value={settings.hideEmoji}
						onValueChange={hideEmoji => storage.set({ hideEmoji })}
					/>
					<Design.TableSwitchRow
						label="Microphone (voice messages)"
						value={settings.hideMic}
						onValueChange={hideMic => storage.set({ hideMic })}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Action buttons">
					<Design.TableSwitchRow
						label="Keep visible while typing"
						value={settings.keepActionsVisible}
						onValueChange={keepActionsVisible =>
							storage.set({ keepActionsVisible })
						}
					/>
				</Design.TableRowGroup>
			</ScrollView>
		</Page>
	)
}
