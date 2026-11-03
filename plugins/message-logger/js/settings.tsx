import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { openMessageHistory } from './actionsheet'
import { getSessionLogs, resetLogs } from './logger'
import { DefaultSettings } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Button, Stack, TableRow, TableRowGroup, TableSwitchRow, TextInput } =
	Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const setting = <K extends keyof Settings>(key: K): Settings[K] =>
		storage.use(x => key in x)?.[key] ?? DefaultSettings[key]

	const [, update] = useState(0)
	const logDeletes = setting('logDeletes')
	const logEdits = setting('logEdits')
	const ignoreSelf = setting('ignoreSelf')
	const ignoreBots = setting('ignoreBots')
	const inlineEdits = setting('inlineEdits')
	const logDeletedAttachments = setting('logDeletedAttachments')
	const ignoredUsers = setting('ignoreUsers')
	const ignoredChannels = setting('ignoreChannels')
	const ignoredGuilds = setting('ignoreGuilds')
	const logs = getSessionLogs()

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Log">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="TrashIcon" />}
							label="Deleted messages"
							subLabel="Keep deleted messages and attachments in chat, and removed attachments of edited messages."
							value={logDeletes}
							onValueChange={logDeletes => storage.set({ logDeletes })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="PencilIcon" />}
							label="Edits"
							subLabel="Show previous versions of edited messages."
							value={logEdits}
							onValueChange={logEdits => storage.set({ logEdits })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Display">
						<TableSwitchRow
							label="Retain removed attachments"
							value={logDeletedAttachments}
							onValueChange={logDeletedAttachments =>
								storage.set({ logDeletedAttachments })
							}
						/>
						<TableSwitchRow
							label="Show earlier versions in chat"
							value={inlineEdits}
							onValueChange={inlineEdits => storage.set({ inlineEdits })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Ignore">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="UserIcon" />}
							label="Your messages"
							value={ignoreSelf}
							onValueChange={ignoreSelf => storage.set({ ignoreSelf })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="RobotIcon" />}
							label="Bots"
							value={ignoreBots}
							onValueChange={ignoreBots => storage.set({ ignoreBots })}
						/>
					</TableRowGroup>
					<TextInput
						label="Ignore user IDs"
						placeholder="Comma-separated user IDs"
						value={ignoredUsers}
						onChange={ignoreUsers => storage.set({ ignoreUsers })}
					/>
					<TextInput
						label="Ignore channel or category IDs"
						placeholder="Comma-separated channel IDs"
						value={ignoredChannels}
						onChange={ignoreChannels => storage.set({ ignoreChannels })}
					/>
					<TextInput
						label="Ignore server IDs"
						placeholder="Comma-separated server IDs"
						value={ignoredGuilds}
						onChange={ignoreGuilds => storage.set({ ignoreGuilds })}
					/>
					<TableRowGroup title="This session">
						<TableRow
							label={`${logs.length} logged message(s)`}
							subLabel="Logs remain in memory until Discord reloads. Only messages already received while this plugin runs can be logged."
							disabled
						/>
						{logs.map(log => (
							<TableRow
								key={log.id}
								label={log.deleted ? 'Deleted message' : 'Edited message'}
								subLabel={`Message ${log.id}`}
								onPress={() => {
									const store =
										Stores.MessageStore as DiscordModules.Flux.Store<{
											getMessage(
												channel: string,
												id: string,
											): import('./logger').MessageRecord | undefined
										}>
									const record = store.getMessage(log.channelId, log.id)
									if (record) openMessageHistory(record)
								}}
							/>
						))}
					</TableRowGroup>
					<Button
						text="Refresh log list"
						variant="secondary"
						onPress={() => update(value => value + 1)}
					/>
					<Button
						text="Clear session history"
						variant="destructive"
						onPress={() => {
							resetLogs()
							update(value => value + 1)
						}}
					/>
				</Stack>
			</ScrollView>
		</Page>
	)
}
