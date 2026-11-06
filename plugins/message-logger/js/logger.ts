// Adapted from Palm’s Valenced Message Logger and Vencord MessageLogger. GPL-3.0.
import { Dispatcher } from '@valenced/discord/common/flux'
import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { archive, snapshot } from './archive'
import type { DiscordModules } from '@valenced/discord/types'
import type { Settings } from './shared'

export interface Attachment {
	id: string
	filename?: string
	url?: string
}

export interface MessageRecord {
	id: string
	channel_id: string
	content: string
	state: string
	flags: number
	author: { id: string; bot?: boolean; username?: string; global_name?: string }
	attachments: Attachment[]
	nonce?: string
	timestamp?: string
	edited_timestamp?: string
}

export interface Log {
	channelId: string
	deleted: boolean
	/** Whether deleted text and attachments are styled */
	highlighted: boolean
	/** Previous versions, oldest first */
	edits: MessageRecord[]
	removedAttachments: Set<string>
}

interface DeletePayload {
	id: string
	channelId: string
	guildId?: string
}

interface BulkDeletePayload {
	ids: string[]
	channelId: string
	guildId?: string
}

interface UpdatePayload {
	message?: {
		id: string
		channel_id: string
		content?: string
		attachments?: Attachment[]
	}
}

const EphemeralFlag = 1 << 6

const MessageStore = () =>
	Stores.MessageStore as DiscordModules.Flux.Store<{
		getMessage(channelId: string, messageId: string): MessageRecord | undefined
	}>

const AuthenticationStore = () =>
	Stores.AuthenticationStore as DiscordModules.Flux.Store<{ getId(): string }>

const logs = new Map<string, Log>()

// Messages changed without a change Discord would notice in the record
const changed = new Set<string>()

// Messages whose events the logger lets through, for removing logs
const bypassed = new Set<string>()

export const getLog = (id: string) => logs.get(id)

export const takeChanged = (id: string) => changed.delete(id)

function logOf({ id, channel_id }: MessageRecord) {
	let log = logs.get(id)
	if (!log) {
		log = {
			channelId: channel_id,
			deleted: false,
			highlighted: true,
			edits: [],
			removedAttachments: new Set(),
		}
		logs.set(id, log)
	}

	return log
}

function ignored(list: string, id?: string | null) {
	return !!id && list.split(/[\s,]+/).includes(id)
}

function shouldLog(record: MessageRecord, settings: Settings) {
	if (settings.ignoreBots && record.author.bot) return false
	if (settings.ignoreSelf && record.author.id === AuthenticationStore().getId())
		return false
	const channel = (
		Stores.ChannelStore as DiscordModules.Flux.Store<{
			getChannel(
				id: string,
			): { parent_id?: string; guild_id?: string } | undefined
		}>
	).getChannel(record.channel_id)
	return !(
		ignored(settings.ignoreUsers, record.author.id) ||
		ignored(settings.ignoreChannels, record.channel_id) ||
		ignored(settings.ignoreChannels, channel?.parent_id) ||
		ignored(settings.ignoreGuilds, channel?.guild_id)
	)
}

function keepDeleted(channelId: string, id: string, settings: Settings) {
	const record = MessageStore().getMessage(channelId, id)
	if (!record || bypassed.has(id)) return false
	// Self deletes are dispatched again once the gateway confirms them
	if (logs.get(id)?.deleted) return true
	// Unsent and ephemeral messages are dismissed, not deleted
	if (record.state !== 'SENT' || record.flags & EphemeralFlag) return false
	if (!shouldLog(record, settings)) return false

	logOf(record).deleted = true
	saveRecord(record)
	changed.add(id)
	return true
}

// Regenerates the row, which only reaches native if the message is marked changed
const rerender = (channelId: string, id: string, guildId?: string) => ({
	type: 'MESSAGE_UPDATE',
	guildId,
	message: { id, channel_id: channelId },
})

// Removed attachments stay in the record, so Discord can still open them
function keepRemovedAttachments(
	record: MessageRecord,
	update: NonNullable<UpdatePayload['message']>,
) {
	const ids = new Set(update.attachments!.map(attachment => attachment.id))
	const log = logs.get(record.id)
	for (const id of ids) log?.removedAttachments.delete(id)
	const removed = record.attachments.filter(({ id }) => !ids.has(id))
	if (!removed.length) return

	const entry = logOf(record)
	for (const { id } of removed) entry.removedAttachments.add(id)
	changed.add(record.id)
	update.attachments = [...update.attachments!, ...removed]
}

export function toggleHighlight(record: MessageRecord, guildId?: string) {
	const log = logs.get(record.id)
	if (!log) return

	log.highlighted = !log.highlighted
	changed.add(record.id)
	Dispatcher.dispatch(rerender(record.channel_id, record.id, guildId))
}

/** Forgets the message's log, really deleting it if it was deleted. */
export function removeLog(
	record: MessageRecord,
	guildId?: string,
	preserveArchive = false,
) {
	const log = logs.get(record.id)
	if (!log) return

	logs.delete(record.id)
	if (!preserveArchive) archive?.remove(record.id)
	changed.add(record.id)
	bypassed.add(record.id)

	try {
		if (log.deleted)
			Dispatcher.dispatch({
				type: 'MESSAGE_DELETE',
				id: record.id,
				channelId: record.channel_id,
				guildId,
			})
		else
			Dispatcher.dispatch({
				type: 'MESSAGE_UPDATE',
				guildId,
				message: {
					id: record.id,
					channel_id: record.channel_id,
					attachments: record.attachments.filter(
						({ id }) => !log.removedAttachments.has(id),
					),
				},
			})
	} finally {
		bypassed.delete(record.id)
	}
}

export function hasChannelLogs(channelId: string) {
	for (const log of logs.values()) if (log.channelId === channelId) return true
	return false
}

export function clearChannelLogs(channelId: string, guildId?: string) {
	archive?.clearChannel(channelId)
	for (const [id, log] of logs) {
		if (log.channelId !== channelId) continue

		const record = MessageStore().getMessage(channelId, id)
		if (record) removeLog(record, guildId)
		else logs.delete(id)
	}
}

export function interceptMessages(settings: () => Settings) {
	return [
		...['LOGOUT', 'LOGIN_SUCCESS', 'CONNECTION_OPEN'].map(type =>
			onFluxEventDispatched(type, payload => {
				if (
					type === 'CONNECTION_OPEN' &&
					archive?.view().account === AuthenticationStore().getId()
				)
					return payload
				logs.clear()
				archive?.switchAccount()
				if (type !== 'LOGOUT')
					Promise.resolve().then(() =>
						archive?.switchAccount(AuthenticationStore().getId()),
					)
				changed.clear()
				bypassed.clear()
				return payload
			}),
		),
		onFluxEventDispatched<{ message?: MessageRecord }>(
			'MESSAGE_CREATE',
			payload => {
				const message = payload.message
				if (
					!message?.nonce ||
					message.author.id === AuthenticationStore().getId()
				)
					return payload
				const previous = MessageStore().getMessage(
					message.channel_id,
					message.nonce,
				)
				if (previous?.state === 'SENT' && previous.id !== message.id) {
					const { nonce: _, ...withoutNonce } = message
					return { ...payload, message: withoutNonce }
				}
				return payload
			},
		),
		onFluxEventDispatched<DeletePayload>('MESSAGE_DELETE', payload => {
			const { id, channelId, guildId } = payload
			if (!settings().logDeletes || !keepDeleted(channelId, id, settings()))
				return payload

			return rerender(channelId, id, guildId) as unknown as typeof payload
		}),
		onFluxEventDispatched<BulkDeletePayload>('MESSAGE_DELETE_BULK', payload => {
			const { ids, channelId, guildId } = payload
			if (!settings().logDeletes) return payload

			const kept = new Set(
				ids.filter(id => keepDeleted(channelId, id, settings())),
			)
			if (!kept.size) return payload

			// Can't dispatch in the middle of a dispatch
			Promise.resolve().then(() => {
				for (const id of kept)
					Dispatcher.dispatch(rerender(channelId, id, guildId))
			})

			const rest = ids.filter(id => !kept.has(id))
			if (rest.length) return { ...payload, ids: rest }
		}),
		onFluxEventDispatched<UpdatePayload>('MESSAGE_UPDATE', payload => {
			const update = payload.message
			const record =
				update?.id && MessageStore().getMessage(update.channel_id, update.id)
			if (
				!update ||
				!record ||
				bypassed.has(record.id) ||
				!shouldLog(record, settings())
			)
				return payload

			const { logEdits, logDeletedAttachments } = settings()

			if (
				logEdits &&
				!(record.flags & EphemeralFlag) &&
				update.content !== undefined &&
				update.content !== record.content
			) {
				logOf(record).edits.push(record)
				logOf(record).edits = logOf(record).edits.slice(-50)
				changed.add(record.id)
			}

			if (
				logDeletedAttachments &&
				update.attachments &&
				!(record.flags & EphemeralFlag)
			)
				keepRemovedAttachments(record, update)

			if (
				logs.has(record.id) &&
				(update.content !== undefined || update.attachments !== undefined)
			)
				saveRecord({ ...snapshot(record), ...update, author: record.author })
			return payload
		}),
	]
}

function saveRecord(record: MessageRecord) {
	const log = logs.get(record.id)
	if (!log) return
	const channel = (
		Stores.ChannelStore as DiscordModules.Flux.Store<{
			getChannel(id: string): { name?: string } | undefined
		}>
	).getChannel(record.channel_id)
	archive?.save(record, log, channel?.name ?? record.channel_id)
}

export function resetLogs(preserveArchive = false) {
	if (!preserveArchive) archive?.clear()

	// Restore retained records before unpatching the dispatch interceptors.
	for (const [id, log] of [...logs]) {
		const record = MessageStore().getMessage(log.channelId, id)
		if (record) removeLog(record, undefined, preserveArchive)
	}
	logs.clear()
	changed.clear()
	bypassed.clear()
}

export function getSessionLogs() {
	return [...logs].map(([id, log]) => ({ id, ...log }))
}
