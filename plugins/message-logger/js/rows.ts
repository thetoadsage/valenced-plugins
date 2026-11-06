import { processColor } from 'react-native'
import { logColors } from './colors'
import { getLog, takeChanged } from './logger'
import type { MessageRecord } from './logger'
import type { Settings } from './shared'

export interface GenerateArgs {
	message: MessageRecord
}
export interface MessageRow {
	type?: number
	changeType?: number
	message?: {
		id: string
		content?: ContentNode[]
		textColor?: number
		timestampColor?: number
	}
}
interface ContentNode {
	type?: string
	content?: unknown
}
export interface RowManager {
	generate(args: GenerateArgs): MessageRow
}
const text = (content: string): ContentNode => ({ type: 'text', content })

export function styleRow(
	row: MessageRow,
	args: GenerateArgs,
	generate: (args: GenerateArgs) => MessageRow,
	settings: Settings,
) {
	if (row?.type !== 1 || !row.message) return
	const message = row.message
	if (takeChanged(message.id)) row.changeType = 2
	const log = getLog(message.id)
	if (!log) return
	const prefix: ContentNode[] = []
	if (log.ghostPing) prefix.push(text('[Ghost ping] '))
	if (log.restored) prefix.push(text('[Saved deletion] '))
	else if (log.deleted && log.highlighted) prefix.push(text('[Deleted] '))
	if (log.restored && log.archivedAttachmentCount)
		prefix.push(
			text(
				`[${log.archivedAttachmentCount} archived attachment(s); view message history]\n`,
			),
		)
	if (!log.restored && log.removedAttachments.size && log.highlighted)
		prefix.push(
			text(`[${log.removedAttachments.size} removed attachment(s) retained]\n`),
		)
	if (settings.inlineEdits && !log.restored && log.edits.length) {
		log.edits.forEach((edit, index) => {
			const time = log.editTimes[index]
			const date =
				Number.isFinite(time) && time > 0 && time <= 8640000000000000
					? new Date(time).toLocaleString()
					: undefined
			prefix.push(
				text(`[Previous version ${index + 1}${date ? ` · ${date}` : ''}]\n`),
			)
			// Quote only a display copy. Inheriting the record keeps its native getters/methods intact.
			const quoted = Object.create(edit) as MessageRecord
			Object.defineProperty(quoted, 'content', {
				value: edit.content
					.split('\n')
					.map(line => `> ${line}`)
					.join('\n'),
				enumerable: true,
			})
			prefix.push(
				...(generate({ ...args, message: quoted }).message?.content ?? []),
			)
			prefix.push(text('\n\n'))
		})
		prefix.push(
			text(`[${log.deleted ? 'Deleted version' : 'Current version'}]\n`),
		)
	}

	message.content = [...prefix, ...(message.content ?? [])]
	const colors = logColors(settings)
	const selected = log.deleted
		? log.highlighted
			? colors.deleted
			: undefined
		: log.edits.length
			? colors.edited
			: undefined
	if (selected) {
		const color = processColor(selected)
		if (typeof color === 'number') {
			message.textColor = color
			if (log.deleted) message.timestampColor = color
		}
	}
}
