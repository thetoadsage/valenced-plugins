import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { archive } from './archive'
import { getLogColors, subscribeLogColors } from './colors'
import { wordDiff } from './diff'
import type { ArchivedMessage } from './archive'
import type { MessageRecord } from './logger'

export function versionTime(message: MessageRecord) {
	const source = message.edited_timestamp || message.timestamp
	const date = source ? new Date(source) : undefined
	const parts: string[] = []
	if (date && Number.isFinite(date.getTime()))
		parts.push(`Version time: ${date.toLocaleString()}`)
	if (message.capturedAt)
		parts.push(`Captured: ${new Date(message.capturedAt).toLocaleString()}`)
	return parts.join(' · ') || 'Timestamp unavailable for this older record'
}
export function HistoryContent({ entry }: { entry: ArchivedMessage }) {
	const [, refreshColors] = useState(0)
	useEffect(() => subscribeLogColors(() => refreshColors(n => n + 1)), [])
	const colors = getLogColors()
	const versions = [...entry.edits, entry.message]
	return (
		<ScrollView style={{ maxHeight: 400 }}>
			<Design.Stack spacing={16}>
				<Design.Text selectable variant="text-md/normal">
					{[
						`Author: ${entry.message.author.global_name || entry.message.author.username || entry.message.author.id} (${entry.message.author.id})`,
						`Channel: ${entry.channelName} (${entry.channelId})`,
						`Saved: ${new Date(entry.savedAt).toLocaleString()}`,
						entry.ghostPing
							? 'Ghost ping: this deleted message directly mentioned you.'
							: '',
					]
						.filter(Boolean)
						.join('\n')}
				</Design.Text>
				{versions.map((message, index) => (
					<Design.Stack spacing={8} key={index}>
						<Design.Text variant="text-md/bold">
							{index < entry.edits.length
								? `Previous version ${index + 1}`
								: entry.deleted
									? 'Deleted message'
									: 'Latest captured version'}
						</Design.Text>
						<Design.Text variant="text-sm/normal">
							{versionTime(message)}
						</Design.Text>
						<Design.Text
							selectable
							variant="text-md/normal"
							style={
								index < entry.edits.length
									? { color: colors.edited }
									: entry.deleted
										? { color: colors.deleted }
										: undefined
							}
						>
							{message.content || '(Empty message)'}
						</Design.Text>
						{index > 0 && versions[index - 1].content !== message.content && (
							<>
								<Design.Text variant="text-sm/bold">
									Changes from previous version (− removed, + added)
								</Design.Text>
								<Design.Text selectable variant="text-md/normal">
									{wordDiff(versions[index - 1].content, message.content).map(
										(part, i) => (
											<Design.Text
												key={i}
												style={
													part.kind === 'removed'
														? {
																textDecorationLine: 'line-through',
																color: colors.deleted,
															}
														: part.kind === 'added'
															? {
																	fontWeight: 'bold',
																	color: colors.edited,
																	textDecorationLine: 'underline',
																}
															: undefined
												}
											>
												{part.kind === 'same'
													? part.text
													: part.kind === 'removed'
														? `[− ${part.text}]`
														: `[+ ${part.text}]`}
											</Design.Text>
										),
									)}
								</Design.Text>
							</>
						)}
					</Design.Stack>
				))}
				<AttachmentActions entry={entry} />
			</Design.Stack>
		</ScrollView>
	)
}
function AttachmentActions({ entry }: { entry: ArchivedMessage }) {
	const account = archive?.view().account
	const [, update] = useState(0)
	const [error, setError] = useState('')
	useEffect(() => archive?.subscribe(() => update(n => n + 1)), [])
	const attachments = new Map(
		[...entry.edits, entry.message]
			.flatMap(m => m.attachments)
			.map(a => [a.id, a]),
	)
	const media = archive?.media()
	return (
		<Design.Stack spacing={8}>
			{attachments.size > 0 && (
				<Design.Text variant="text-md/bold">Attachments</Design.Text>
			)}
			{[...attachments.values()].map(a => (
				<Design.Stack key={a.id} spacing={8}>
					<Design.Text
						selectable
						variant="text-md/normal"
					>{`${a.filename || a.id}\n${media?.status(entry.id, a.id) ?? 'Not saved'}${a.url ? `\n${a.url}` : ''}`}</Design.Text>
					{media?.has(entry.id, a.id) && (
						<Design.Button
							text={`Open saved file: ${a.filename || a.id}`}
							variant="secondary"
							onPress={async () => {
								if (!account || archive?.view().account !== account) return
								try {
									await media.share(entry.id, a.id)
									setError('')
								} catch {
									setError(
										'Could not open the saved file. Try again after reopening Discord.',
									)
								}
							}}
						/>
					)}
				</Design.Stack>
			))}
			{error && <Design.Text variant="text-sm/normal">{error}</Design.Text>}
		</Design.Stack>
	)
}
