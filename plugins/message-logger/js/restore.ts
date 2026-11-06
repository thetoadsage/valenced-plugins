import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { archive, bounded } from './archive'
import { forgetRestoredLog, hydrateRestoredLog, shouldLog } from './logger'
import type { ArchivedMessage } from './archive'
import type { MessageRecord } from './logger'
import type { Settings } from './shared'

export const compareIds = (a: string, b: string) =>
	a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
const validId = (id: unknown): id is string =>
	typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id)
interface Bounds {
	hasMoreBefore?: boolean
	hasMoreAfter?: boolean
}
interface Collection extends Bounds {
	channelId: string
	ready: boolean
	cached?: boolean
	toArray(): MessageRecord[]
	reset(messages: MessageRecord[]): Collection
	loadComplete(options: { newMessages: MessageRecord[] } & Bounds): Collection
	addCachedMessages(messages: MessageRecord[], stale?: boolean): Collection
}
interface ChannelManager {
	prototype: Collection
	getOrCreate(channelId: string): Collection
	commit(collection: Collection): void
}
interface RecordFactory {
	createMessageRecord(raw: object): MessageRecord
	updateMessageRecord: unknown
}

export function eligibleDeletions(
	entries: ArchivedMessage[],
	live: MessageRecord[],
	channel: string,
	bounds: Bounds,
	settings: Settings,
	range: MessageRecord[] = live,
) {
	if (!live.every(m => validId(m.id) && m.channel_id === channel)) return []
	const ids = new Set(live.map(m => m.id))
	if (!range.every(m => validId(m.id) && m.channel_id === channel)) return []
	const sorted = range.map(m => m.id).sort(compareIds)
	const low = sorted[0],
		high = sorted.at(-1)
	// An empty page alone carries no cursor. Only a fully loaded empty channel has a known range.
	if (
		!sorted.length &&
		!(bounds.hasMoreBefore === false && bounds.hasMoreAfter === false)
	)
		return []
	const cutoff =
		Date.now() - bounded(settings.retentionDays, 30, 3650) * 86400000
	return entries
		.filter(
			e =>
				e.deleted &&
				e.channelId === channel &&
				e.savedAt >= cutoff &&
				validId(e.id) &&
				validId(e.message.author.id) &&
				!(e.message.flags & 64) &&
				!ids.has(e.id) &&
				(bounds.hasMoreBefore === false ||
					(low && compareIds(e.id, low) >= 0)) &&
				(bounds.hasMoreAfter === false ||
					(high && compareIds(e.id, high) <= 0)),
		)
		.sort((a, b) => compareIds(a.id, b.id))
}
function snowflakeDate(id: string) {
	// Divide decimal strings exactly; converting a full snowflake to Number loses precision.
	let remainder = 0,
		quotient = ''
	for (const digit of id) {
		remainder = remainder * 10 + Number(digit)
		quotient += Math.floor(remainder / 4194304)
		remainder %= 4194304
	}
	return new Date(Number(quotient) + 1420070400000).toISOString()
}
export function rawSavedMessage(entry: ArchivedMessage) {
	const m = entry.message
	const timestamp =
		m.timestamp && Number.isFinite(Date.parse(m.timestamp))
			? m.timestamp
			: snowflakeDate(m.id)
	return {
		id: m.id,
		channel_id: m.channel_id,
		type: 0,
		content: m.content,
		timestamp,
		edited_timestamp:
			m.edited_timestamp && Number.isFinite(Date.parse(m.edited_timestamp))
				? m.edited_timestamp
				: null,
		state: 'SENT',
		flags: 0,
		author: {
			...m.author,
			username: m.author.username || m.author.global_name || 'Saved user',
			discriminator: '0',
			avatar: null,
			public_flags: 0,
		},
		// Archived metadata lacks native attachment dimensions and reply/embed records. Open history for files.
		attachments: [],
		embeds: [],
		components: [],
		reactions: [],
		mention_roles: [],
		mention_channels: [],
		mentions: [],
		mention_everyone: false,
		pinned: false,
		tts: false,
	}
}

export function restoreSavedDeletions(
	settings: () => Settings,
	report: (error: string) => void,
) {
	let manager: ChannelManager | undefined
	let factory: RecordFactory | undefined
	let active = true,
		queued = false,
		reconciling = false
	const channels = new Map<string, string>()
	const inserted = new Map<string, Set<string>>()
	const hydrated = new Map<string, ArchivedMessage>()
	const unpatches: Array<() => void> = []
	const patched = new WeakSet<object>()
	const self = () =>
		(Stores.AuthenticationStore as unknown as { getId(): string }).getId()
	let lastAccount = self()
	const emit = () => {
		const store = Stores.MessageStore as unknown as { emitChange?: () => void }
		store.emitChange?.()
	}
	const apply = (collection: Collection, forceOff = false): Collection => {
		const owner = archive?.accountId()
		if (
			!manager ||
			!owner ||
			!(collection?.ready || collection?.cached) ||
			!Array.isArray(collection.toArray?.())
		)
			return collection
		if (owner !== self()) return collection
		const current = collection.toArray()
		const previous = new Set(inserted.get(collection.channelId) ?? [])
		const archived = archive?.channelEntries(collection.channelId) ?? []
		// Native startup caches can contain a message received before its deletion. The archive can label it,
		// but only a fresh server batch is authoritative enough to supersede the saved deletion.
		if (
			!forceOff &&
			settings().restoreDeletions &&
			collection.cached &&
			!collection.ready
		) {
			const cachedIds = new Set(current.map(m => m.id))
			for (const e of archived)
				if (e.deleted && cachedIds.has(e.id)) previous.add(e.id)
		}
		const live = current.filter(m => !previous.has(m.id))
		const channel = (
			Stores.ChannelStore as unknown as { getChannel(id: string): unknown }
		).getChannel(collection.channelId)
		const entries =
			!forceOff && settings().restoreDeletions && factory && channel
				? eligibleDeletions(
						archived,
						live,
						collection.channelId,
						collection.ready ? collection : {},
						settings(),
						collection.cached && !collection.ready ? current : live,
					).filter(e => shouldLog(e.message, settings()))
				: []
		const ids = new Set(entries.map(e => e.id))
		if (
			previous.size === ids.size &&
			[...previous].every(id => ids.has(id)) &&
			entries.every(e => hydrated.get(e.id) === e) &&
			current.filter(m => previous.has(m.id)).length === ids.size
		)
			return collection
		const records = entries.map(entry => ({
			entry,
			record: factory!.createMessageRecord(rawSavedMessage(entry)),
		}))
		if (
			records.some(
				({ entry, record }) =>
					record?.id !== entry.id || record.channel_id !== entry.channelId,
			)
		)
			throw Error('Unsupported message record factory')
		// Build before changing logger state, so an unsupported record factory leaves the collection intact.
		const merged = records.length
			? [...live, ...records.map(x => x.record)].sort((a, b) =>
					compareIds(a.id, b.id),
				)
			: live
		if (!previous.size && !records.length) return collection
		const next = collection.reset(merged)
		for (const id of previous) {
			forgetRestoredLog(id)
			hydrated.delete(id)
		}
		for (const { entry } of records) {
			hydrateRestoredLog(entry)
			hydrated.set(entry.id, entry)
		}
		if (ids.size) inserted.set(collection.channelId, ids)
		else inserted.delete(collection.channelId)
		return next
	}
	const reconcile = (forceOff = false) => {
		if (!active || !manager || reconciling) return
		reconciling = true
		let changed = false
		try {
			const account = self()
			if (account !== lastAccount) {
				for (const ids of inserted.values())
					for (const id of ids) forgetRestoredLog(id)
				inserted.clear()
				hydrated.clear()
				channels.clear()
				lastAccount = account
			}
			if (!forceOff && !settings().restoreDeletions && !inserted.size) return
			for (const [channel, owner] of channels) {
				if (owner !== account) continue
				const before = manager.getOrCreate(channel)
				const next = apply(before, forceOff)
				if (next !== before) {
					manager.commit(next)
					changed = true
				}
			}
			if (changed) emit()
		} catch (error) {
			report(`Could not restore saved deletions: ${String(error)}`)
		} finally {
			reconciling = false
		}
	}
	const refresh = () => {
		if (queued || !active) return
		queued = true
		Promise.resolve().then(() => {
			queued = false
			reconcile()
		})
	}
	const observe = (collection: Collection) => {
		if (
			collection &&
			typeof collection.channelId === 'string' &&
			(collection.ready || collection.cached)
		)
			channels.set(collection.channelId, self())
	}
	const releaseLive = (channel: string, messages: MessageRecord[]) => {
		const ids = inserted.get(channel)
		for (const message of messages)
			if (ids?.delete(message.id)) {
				forgetRestoredLog(message.id)
				hydrated.delete(message.id)
			}
	}
	unpatches.push(
		getModules(
			withProps<RecordFactory>('createMessageRecord', 'updateMessageRecord'),
			exports => {
				factory = exports
				refresh()
			},
			{ max: 1 },
		),
		getModules(
			withProps<{ default: ChannelManager; flatMapChannelMessages: unknown }>(
				'flatMapChannelMessages',
			),
			exports => {
				const value = exports.default
				const proto = value?.prototype
				if (
					!proto ||
					typeof proto.loadComplete !== 'function' ||
					typeof proto.addCachedMessages !== 'function' ||
					typeof proto.reset !== 'function' ||
					typeof proto.toArray !== 'function' ||
					typeof value.getOrCreate !== 'function' ||
					typeof value.commit !== 'function' ||
					patched.has(proto)
				)
					return
				patched.add(proto)
				manager = value
				unpatches.push(
					instead(value, 'getOrCreate', function (args, original) {
						const result = original.apply(this, args)
						if (!reconciling) {
							observe(result)
							if (settings().restoreDeletions || inserted.size) refresh()
						}
						return result
					}),
					...(['loadComplete', 'addCachedMessages'] as const).map(method =>
						instead(proto, method, function (args, original) {
							const input =
								method === 'loadComplete'
									? (args[0] as { newMessages?: MessageRecord[] })?.newMessages
									: args[0]
							const result = Reflect.apply(original, this, args) as Collection
							try {
								if (
									method === 'loadComplete' &&
									!(args[0] as { cached?: boolean })?.cached &&
									Array.isArray(input)
								)
									releaseLive((this as Collection).channelId, input)
								observe(result)
								return apply(result)
							} catch (error) {
								report(`Could not restore saved deletions: ${String(error)}`)
								return result
							}
						}),
					),
				)
				const selected = (
					Stores.SelectedChannelStore as unknown as {
						getChannelId?: () => string | undefined
					}
				)?.getChannelId?.()
				if (selected) observe(value.getOrCreate(selected))
				refresh()
			},
		),
	)
	const unsubscribe = archive?.subscribe(refresh)
	return {
		refresh,
		stop() {
			reconcile(true)
			active = false
			unsubscribe?.()
			for (const unpatch of unpatches.reverse()) unpatch()
		},
	}
}
