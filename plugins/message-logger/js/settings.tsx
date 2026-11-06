import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { confirmClearHistory, openArchiveHistory } from './actionsheet'
import { archive } from './archive'
import { resetLogs } from './logger'
import { DefaultSettings } from './shared'
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
	const [query, setQuery] = useState('')
	const [limit, setLimit] = useState(50)
	const [status, setStatus] = useState<
		'All' | 'Deleted' | 'Edited' | 'Ghost pings'
	>('All')
	useEffect(() => {
		archive?.applyRetention()
		return archive?.subscribe(() => update(value => value + 1))
	}, [])
	const view = archive?.view()
	const logs = (view?.entries ?? []).filter(entry => {
		if (status === 'Ghost pings' && !entry.ghostPing) return false
		if (
			status !== 'All' &&
			status !== 'Ghost pings' &&
			entry.deleted !== (status === 'Deleted')
		)
			return false
		const text = [
			entry.id,
			entry.channelId,
			entry.channelName,
			entry.message.author.id,
			entry.message.author.username,
			entry.message.author.global_name,
			entry.message.content,
			...entry.edits.map(e => e.content),
			new Date(entry.savedAt).toLocaleDateString(),
			new Date(entry.savedAt).toISOString().slice(0, 10),
		]
			.join(' ')
			.toLowerCase()
		return query
			.trim()
			.toLowerCase()
			.split(/\s+/)
			.every(word => text.includes(word))
	})
	const retentionDays = setting('retentionDays')
	const maxMessages = setting('maxMessages')
	const maxStorageMiB = setting('maxStorageMiB')
	const saveAttachments = setting('saveAttachments')
	const maxAttachmentMiB = setting('maxAttachmentMiB')
	const maxMediaMiB = setting('maxMediaMiB')
	const [draft, setDraft] = useState({
		retentionDays: String(retentionDays),
		maxMessages: String(maxMessages),
		maxStorageMiB: String(maxStorageMiB),
		maxAttachmentMiB: String(maxAttachmentMiB),
		maxMediaMiB: String(maxMediaMiB),
	})
	const [retentionError, setRetentionError] = useState('')
	const retention = (key: keyof typeof draft, value: string) =>
		setDraft({ ...draft, [key]: value })
	const applyRetention = async () => {
		const values = {
			retentionDays: Number(draft.retentionDays),
			maxMessages: Number(draft.maxMessages),
			maxStorageMiB: Number(draft.maxStorageMiB),
			maxAttachmentMiB: Number(draft.maxAttachmentMiB),
			maxMediaMiB: Number(draft.maxMediaMiB),
		}
		if (
			Object.values(values).some(n => !Number.isInteger(n) || n < 1) ||
			values.retentionDays > 3650 ||
			values.maxMessages > 10000 ||
			values.maxStorageMiB > 20 ||
			values.maxAttachmentMiB > 10 ||
			values.maxMediaMiB > 50
		) {
			setRetentionError('Enter whole numbers within the ranges shown.')
			return
		}
		await storage.set(values)
		setRetentionError('')
		archive?.applyRetention()
	}

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
					<TableRowGroup title="Saved history">
						<TableRow
							label={
								view?.loading
									? 'Loading history…'
									: `${view?.entries.length ?? 0} saved messages`
							}
							subLabel={
								view?.error ||
								(!view?.account
									? 'Sign in to view this account’s history.'
									: view.saving
										? 'Saving history…'
										: 'Stored on this iPhone for this account. Saved files have a separate storage limit.')
							}
							disabled
						/>
					</TableRowGroup>
					<TextInput
						label="Search saved history"
						placeholder="Text, author, channel, or YYYY-MM-DD"
						value={query}
						onChange={value => {
							setQuery(value)
							setLimit(50)
						}}
					/>
					<Button
						text={`Show: ${status}`}
						variant="secondary"
						onPress={() => {
							setStatus(
								status === 'All'
									? 'Deleted'
									: status === 'Deleted'
										? 'Edited'
										: status === 'Edited'
											? 'Ghost pings'
											: 'All',
							)
							setLimit(50)
						}}
					/>
					<TableRowGroup title={`${logs.length} matching messages`}>
						{!logs.length && !view?.loading && (
							<TableRow
								label={
									query || status !== 'All'
										? 'No matching messages'
										: 'No saved history yet'
								}
								subLabel="Edits and deletions received while the plugin runs will appear here."
								disabled
							/>
						)}
						{logs.slice(0, limit).map(entry => (
							<TableRow
								key={entry.id}
								label={`${entry.ghostPing ? 'Ghost ping' : entry.deleted ? 'Deleted' : 'Edited'} · ${entry.message.author.global_name || entry.message.author.username || entry.message.author.id}`}
								subLabel={`${entry.channelName} · ${new Date(entry.savedAt).toLocaleString()}\n${entry.message.content.slice(0, 160) || '(Attachment or empty message)'}`}
								onPress={() => openArchiveHistory(entry)}
							/>
						))}
					</TableRowGroup>
					{logs.length > limit && (
						<Button
							text="Show more messages"
							variant="secondary"
							onPress={() => setLimit(limit + 50)}
						/>
					)}
					<TableRowGroup title="Retention">
						<TableRow
							label="Oldest history is removed automatically"
							subLabel="Limits apply to this account’s saved archive. At most 50 previous versions are kept per message. Tap Apply retention limits now to save changes and remove history beyond the limits."
							disabled
						/>
					</TableRowGroup>
					<TextInput
						label="Keep history for days (1–3650)"
						value={draft.retentionDays}
						onChange={value => retention('retentionDays', value)}
					/>
					<TextInput
						label="Maximum saved messages (1–10000)"
						value={draft.maxMessages}
						onChange={value => retention('maxMessages', value)}
					/>
					<TextInput
						label="Maximum archive size in MiB (1–20)"
						value={draft.maxStorageMiB}
						onChange={value => retention('maxStorageMiB', value)}
					/>
					<TableRowGroup title="Saved attachment files">
						<TableSwitchRow
							label="Download deleted attachments"
							value={saveAttachments}
							subLabel="Off by default. Saves files from deleted messages and removed attachments while Discord runs. Downloads use your network connection. Turning this off keeps existing saved files."
							onValueChange={async value => {
								await storage.set({ saveAttachments: value })
								archive?.applyRetention()
							}}
						/>
						<TableRow
							label={`${archive?.media()?.usage().count ?? 0} saved files`}
							subLabel={`${((archive?.media()?.usage().bytes ?? 0) / 1024 / 1024).toFixed(1)} MiB used. Files are stored locally; the cache limit includes encoding overhead. Oldest files are removed when full, and files follow message retention.`}
							disabled
						/>
					</TableRowGroup>
					<TextInput
						label="Maximum download size per file in MiB (1–10)"
						value={draft.maxAttachmentMiB}
						onChange={value => retention('maxAttachmentMiB', value)}
					/>
					<TextInput
						label="Maximum saved-file storage in MiB (1–50)"
						value={draft.maxMediaMiB}
						onChange={value => retention('maxMediaMiB', value)}
					/>
					<Button
						text="Retry attachment downloads"
						variant="secondary"
						onPress={() => archive?.media()?.retry()}
					/>
					<Button
						text="Clear saved attachment files"
						variant="destructive"
						onPress={() =>
							confirmClearHistory(() => {
								void archive?.media()?.clear()
							}, true)
						}
					/>

					{retentionError && <TableRow label={retentionError} disabled />}
					<Button
						text="Apply retention limits now"
						variant="secondary"
						onPress={applyRetention}
					/>
					<Button
						text="Clear saved history for this account"
						variant="destructive"
						onPress={() =>
							confirmClearHistory(() => {
								resetLogs()
								update(value => value + 1)
							})
						}
					/>
				</Stack>
			</ScrollView>
		</Page>
	)
}
