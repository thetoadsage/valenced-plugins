import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow, TextInput } = Design
type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }
	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Reply mentions">
						<TableSwitchRow
							label="Only mention listed users and roles"
							subLabel="On: only listed users or roles are mentioned by default. Off: everyone except those listed is mentioned by default."
							value={settings.pingListed}
							onValueChange={pingListed => storage.set({ pingListed })}
						/>
					</TableRowGroup>
					<TextInput
						label="User IDs"
						placeholder="Comma- or space-separated IDs"
						value={settings.userList}
						onChange={userList => storage.set({ userList })}
					/>
					<TextInput
						label="Role IDs"
						placeholder="Comma- or space-separated IDs"
						value={settings.roleList}
						onChange={roleList => storage.set({ roleList })}
					/>
				</Stack>
			</ScrollView>
		</Page>
	)
}
