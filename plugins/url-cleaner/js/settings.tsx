import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { TableRowGroup, TableSwitchRow } = Design
type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>
const controls: [keyof Settings, string, string][] = [
	[
		'enabled',
		'Enable URL cleaning',
		'Remove tracking and unwrap supported redirect links locally.',
	],
	['cleanOnCopy', 'Clean copied links', 'Clean links copied inside Discord.'],
	[
		'cleanOnSend',
		'Clean links when sending',
		'Clean links in your outgoing messages.',
	],
	[
		'cleanOnEdit',
		'Clean links when editing',
		'Clean links when you save a message edit.',
	],
	[
		'shortenProducts',
		'Shorten product and model links',
		'Keep the main product or model page on Amazon, AliExpress, Best Buy, Walmart, and MakerWorld. Removes query options and fragments, including selected model profiles.',
	],
]
export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }
	return (
		<Page>
			<ScrollView>
				<TableRowGroup title="URL cleaning">
					{controls.map(([key, label, subLabel]) => (
						<TableSwitchRow
							key={key}
							label={label}
							subLabel={subLabel}
							value={settings[key]}
							onValueChange={value => storage.set({ [key]: value })}
						/>
					))}
				</TableRowGroup>
			</ScrollView>
		</Page>
	)
}
