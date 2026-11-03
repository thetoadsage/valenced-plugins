import {
	ActionSheetActionCreators,
	AlertActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { createElement } from 'react'
import {
	clearChannelLogs,
	getLog,
	hasChannelLogs,
	removeLog,
	toggleHighlight,
} from './logger'
import type { FC, ReactElement, ReactNode } from 'react'
import type { MessageRecord } from './logger'

const { ActionSheet, ActionSheetRow } = Design

interface Channel {
	id: string
	guild_id?: string | null
}

type LongPressMessageActionSheet = FC<{
	message: MessageRecord
	channel: Channel
}>

interface ChannelActionSheetProps {
	channel: Channel
	onClose?: () => void
}

type ChannelActionSheet = FC<ChannelActionSheetProps>

type Element = ReactElement<{ children?: ReactNode; label?: unknown }>

interface Intl {
	intl: { string(message: unknown): string }
	t: Record<string, unknown>
	getAvailableLocales(): unknown
}

// Both are "Delete Message"
const DeleteMessageKeys = ['xwMqD7', 'MWMcg7']

export function patchMessageActionSheet(onError: (e: unknown) => void) {
	const unpatches: Array<() => void> = []
	let intl: Intl | undefined

	const unsubscribeIntl = getModules(
		// intl/index.native.tsx
		withProps<Intl>('intl', 't', 'getAvailableLocales'),
		exports => {
			intl = exports
		},
	)

	const unsubscribe = getModules(
		// modules/messages/native/long_press/LongPressMessageActionSheet.tsx
		withName<LongPressMessageActionSheet>('LongPressMessageActionSheet'),
		mod => {
			const module = mod as { default: LongPressMessageActionSheet }
			unpatches.push(
				instead(module, 'default', (args, Sheet) => {
					const tree = Reflect.apply(Sheet, undefined, args) as Element

					try {
						const [{ message, channel }] = args
						const log = getLog(message.id)

						// It can't be deleted again
						if (log?.deleted && intl)
							removeFromActionSheet(
								tree,
								new Set(
									DeleteMessageKeys.map(key => intl!.intl.string(intl!.t[key])),
								),
							)

						if (log)
							addToActionSheet(
								tree,
								<MessageActions
									message={message}
									guildId={channel?.guild_id ?? undefined}
								/>,
							)
					} catch (e) {
						onError(e)
					}

					return tree
				}),
			)
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribeIntl()
		unsubscribe()
		for (const unpatch of unpatches.reverse()) unpatch()
	}
}

export function patchChannelActionSheet(onError: (e: unknown) => void) {
	const unpatches: Array<() => void> = []
	const wrappers = new WeakMap<ChannelActionSheet, ChannelActionSheet>()

	// Runs the inner sheet as part of the wrapper's render, so its hooks still work
	const wrap = (Inner: ChannelActionSheet) => {
		let Wrapper = wrappers.get(Inner)
		if (!Wrapper) {
			Wrapper = props => {
				const tree = Inner(props) as Element

				try {
					const { channel, onClose } = props
					if (hasChannelLogs(channel.id))
						addToActionSheet(
							tree,
							<ChannelActions channel={channel} onClose={onClose} />,
							true,
						)
				} catch (e) {
					onError(e)
				}

				return tree
			}
			wrappers.set(Inner, Wrapper)
		}

		return Wrapper
	}

	const unsubscribe = getModules(
		// modules/channel/native/ChannelLongPressActionSheet.tsx
		withName<ChannelActionSheet>('ChannelLongPressActionSheet'),
		mod => {
			const module = mod as { default: ChannelActionSheet }
			unpatches.push(
				instead(module, 'default', (args, Sheet) => {
					const tree = Reflect.apply(
						Sheet,
						undefined,
						args,
					) as ReactElement<ChannelActionSheetProps> | null

					// The action sheet is rendered by an inner component
					const Inner = tree?.type
					if (
						typeof Inner !== 'function' ||
						Inner.name !== 'ChannelLongPressActionSheetConnected'
					)
						return tree

					return createElement(wrap(Inner as ChannelActionSheet), {
						...tree!.props,
						key: tree!.key,
					})
				}),
			)
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribe()
		for (const unpatch of unpatches.reverse()) unpatch()
	}
}

function addToActionSheet(tree: unknown, group: ReactNode, beforeLast = false) {
	const sheet = findActionSheet(tree)
	if (!sheet) return

	const children = [sheet.props.children].flat().filter(Boolean)
	children.splice(
		beforeLast ? Math.max(children.length - 1, 0) : children.length,
		0,
		group,
	)
	sheet.props.children = children
}

// Removes rows with these labels, and groups left empty
function removeFromActionSheet(tree: unknown, labels: Set<string>) {
	const sheet = findActionSheet(tree)
	if (!sheet) return

	sheet.props.children = [sheet.props.children]
		.flat()
		.filter(Boolean)
		.flatMap(child => {
			const group = child as Element
			const rows = [group.props?.children].flat().filter(Boolean) as Element[]
			const kept = rows.filter(row => !labels.has(row.props?.label as string))

			if (kept.length === rows.length) return [group]
			if (!kept.length) return []
			group.props.children = kept
			return [group]
		})
}

function findActionSheet(element: unknown): Element | undefined {
	if (!element || typeof element !== 'object') return
	if (Array.isArray(element)) {
		for (const child of element) {
			const found = findActionSheet(child)
			if (found) return found
		}
		return
	}

	const { type, props } = element as Element
	if (type === ActionSheet) return element as Element
	return findActionSheet(props?.children)
}

const closeAndRun = (action: () => void, onClose?: () => void) => () => {
	if (onClose) onClose()
	else ActionSheetActionCreators.hideActionSheet()
	action()
}

function ChannelActions({ channel, onClose }: ChannelActionSheetProps) {
	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label="Clear Message Log"
				variant="danger"
				icon={
					<ActionSheetRow.Icon
						IconComponent={lookupGeneratedIconComponent('TrashIcon')}
					/>
				}
				onPress={closeAndRun(
					() => clearChannelLogs(channel.id, channel.guild_id ?? undefined),
					onClose,
				)}
			/>
		</ActionSheetRow.Group>
	)
}

function MessageActions({
	message,
	guildId,
}: {
	message: MessageRecord
	guildId?: string
}) {
	const log = getLog(message.id)
	if (!log) return null

	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label="View message history"
				onPress={closeAndRun(() => openMessageHistory(message))}
			/>
			{(log.deleted || log.removedAttachments.size > 0) && (
				<ActionSheetRow
					label="Toggle Deleted Highlight"
					icon={
						<ActionSheetRow.Icon
							IconComponent={lookupGeneratedIconComponent('EyeIcon')}
						/>
					}
					onPress={closeAndRun(() => toggleHighlight(message, guildId))}
				/>
			)}
			<ActionSheetRow
				label="Remove History"
				variant="danger"
				icon={
					<ActionSheetRow.Icon
						IconComponent={lookupGeneratedIconComponent('TrashIcon')}
					/>
				}
				onPress={closeAndRun(() => removeLog(message, guildId))}
			/>
		</ActionSheetRow.Group>
	)
}

export function openMessageHistory(message: MessageRecord) {
	const log = getLog(message.id)
	if (!log) return
	const versions = log.edits.map(
		(edit, index) => `Previous version ${index + 1}\n${edit.content}`,
	)
	versions.push(
		`${log.deleted ? 'Deleted message' : 'Current version'}\n${message.content}`,
	)
	if (log.removedAttachments.size)
		versions.push(
			`${log.removedAttachments.size} removed attachment(s) retained in chat.`,
		)
	AlertActionCreators.openAlert(
		'thetoadsage-message-history',
		<Design.AlertModal
			title="Message history"
			content={versions.join('\n\n')}
			actions={<Design.AlertActionButton variant="primary" text="Done" />}
		/>,
	)
}
