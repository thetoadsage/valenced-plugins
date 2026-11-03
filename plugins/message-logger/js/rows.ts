import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { processColor } from 'react-native'
import { getLog, takeChanged } from './logger'
import type { DiscordModules } from '@valenced/discord/types'
import type { MessageRecord } from './logger'

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
type ThemeStore = DiscordModules.Flux.Store<{ theme: string }>
const text = (content: string): ContentNode => ({ type: 'text', content })

export function styleRow(
	row: MessageRow,
	args: GenerateArgs,
	generate: (args: GenerateArgs) => MessageRow,
	inlineEdits: boolean,
) {
	if (row?.type !== 1 || !row.message) return
	const message = row.message
	if (takeChanged(message.id)) row.changeType = 2
	const log = getLog(message.id)
	if (!log) return
	const prefix: ContentNode[] = []
	if (log.deleted && log.highlighted) prefix.push(text('[Deleted] '))
	if (log.removedAttachments.size && log.highlighted)
		prefix.push(
			text(`[${log.removedAttachments.size} removed attachment(s) retained]\n`),
		)
	if (inlineEdits)
		for (const edit of log.edits) {
			prefix.push(text('[Previous version] '))
			prefix.push(
				...(generate({ ...args, message: edit }).message?.content ?? []),
			)
			prefix.push(text('\n'))
		}
	message.content = [...prefix, ...(message.content ?? [])]
	if (log.deleted && log.highlighted) {
		const theme = (Stores.ThemeStore as ThemeStore).theme
		const { colors, internal } = Tokens.default
		const color = processColor(
			internal.resolveSemanticColor(theme, colors.TEXT_FEEDBACK_CRITICAL),
		)
		if (typeof color === 'number') {
			message.textColor = color
			message.timestampColor = color
		}
	}
}
