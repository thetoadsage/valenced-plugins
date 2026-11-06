import { exists, readFile, writeFile } from '@valenced/modules/native/fs'
import { AttachmentCache } from './media'
import { documentsPath, storageRoot } from './paths'
import { MaximumSettings } from './shared'
import type { Log, MessageRecord } from './logger'
import type { Settings } from './shared'

export interface ArchivedMessage {
	id: string
	channelId: string
	channelName: string
	savedAt: number
	deleted: boolean
	ghostPing?: boolean
	message: MessageRecord
	edits: MessageRecord[]
	removedAttachments: string[]
}
interface Context {
	media: AttachmentCache
	account: string
	entries: Map<string, ArchivedMessage>
	pending: Array<() => void>
	task?: Promise<void>
	loaded: boolean
	blocked: boolean
	error: string
}

export function utf8Size(text: string) {
	let size = 0
	for (const char of text) {
		const n = char.codePointAt(0)!
		size += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4
	}
	return size
}
export function bounded(value: number, fallback: number, max: number) {
	return Number.isFinite(value) && value >= 1
		? Math.min(Math.floor(value), max)
		: fallback
}

// Only serializable message data belongs on disk; never store Discord records or render state.
export function snapshot(message: MessageRecord): MessageRecord {
	const date = (value: unknown): string | undefined => {
		if (typeof value === 'string') return value.slice(0, 100)
		if (value instanceof Date && Number.isFinite(value.getTime()))
			return value.toISOString()
	}
	return {
		id: message.id,
		channel_id: message.channel_id,
		content: message.content.slice(0, 65536),
		state: 'SENT',
		flags: message.flags,
		author: {
			id: message.author.id,
			bot: !!message.author.bot,
			username: message.author.username?.slice(0, 200),
			global_name: message.author.global_name?.slice(0, 200),
		},
		attachments: message.attachments.slice(0, 100).map(a => ({
			id: a.id,
			filename: a.filename?.slice(0, 1000),
			url: a.url?.slice(0, 4096),
			size: Number.isFinite(a.size) && a.size! >= 0 ? a.size : undefined,
			content_type: a.content_type?.slice(0, 200),
		})),
		mentions: message.mentions
			?.slice(0, 100)
			.map(m => (typeof m === 'string' ? m : m.id)),
		capturedAt: Number.isFinite(message.capturedAt)
			? message.capturedAt
			: undefined,
		timestamp: date(message.timestamp),
		edited_timestamp: date(message.edited_timestamp),
	}
}

function validMessage(m: MessageRecord) {
	return (
		!!m &&
		typeof m.id === 'string' &&
		typeof m.channel_id === 'string' &&
		typeof m.content === 'string' &&
		(m.capturedAt === undefined ||
			(Number.isFinite(m.capturedAt) &&
				m.capturedAt >= 0 &&
				m.capturedAt <= 8640000000000000)) &&
		(m.mentions === undefined ||
			(Array.isArray(m.mentions) &&
				m.mentions.every(x => typeof x === 'string'))) &&
		typeof m.flags === 'number' &&
		!!m.author &&
		typeof m.author.id === 'string' &&
		[m.author.username, m.author.global_name].every(
			x => x === undefined || typeof x === 'string',
		) &&
		Array.isArray(m.attachments) &&
		m.attachments.every(
			a =>
				a &&
				typeof a.id === 'string' &&
				[a.filename, a.url, a.content_type].every(
					x => x === undefined || typeof x === 'string',
				),
		)
	)
}
function decode(text: string, account: string) {
	if (utf8Size(text) > (MaximumSettings.maxStorageMiB + 5) * 1024 * 1024)
		throw Error('Archive exceeds the read limit')
	const data = JSON.parse(text)
	if (
		data.version !== 1 ||
		data.account !== account ||
		!Array.isArray(data.entries) ||
		data.entries.length > MaximumSettings.maxMessages
	)
		throw Error('Unsupported or invalid archive')
	for (const e of data.entries) {
		if (
			!e ||
			typeof e.id !== 'string' ||
			typeof e.channelId !== 'string' ||
			typeof e.channelName !== 'string' ||
			!Number.isFinite(e.savedAt) ||
			e.savedAt < 0 ||
			e.savedAt > 8640000000000000 ||
			typeof e.deleted !== 'boolean' ||
			(e.ghostPing !== undefined && typeof e.ghostPing !== 'boolean') ||
			!validMessage(e.message) ||
			e.id !== e.message.id ||
			e.channelId !== e.message.channel_id ||
			!Array.isArray(e.edits) ||
			e.edits.length > 50 ||
			!e.edits.every(
				(m: MessageRecord) =>
					validMessage(m) && m.id === e.id && m.channel_id === e.channelId,
			) ||
			!Array.isArray(e.removedAttachments) ||
			!e.removedAttachments.every((x: unknown) => typeof x === 'string')
		)
			throw Error('Invalid message in archive')
	}
	return data.entries as ArchivedMessage[]
}

export class MessageArchive {
	private current?: Context
	private contexts = new Map<string, Context>()
	private listeners = new Set<() => void>()
	constructor(
		private settings: () => Settings,
		private report: (error: string) => void,
	) {}
	subscribe = (listener: () => void) => {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}
	private notify() {
		for (const listener of this.listeners) listener()
	}
	switchAccount(account?: string) {
		if (this.current?.account === account) return
		this.current?.media.pause()
		this.current = undefined
		if (account && /^[a-zA-Z0-9_-]+$/.test(account)) {
			let ctx = this.contexts.get(account)
			if (!ctx) {
				ctx = {
					account,
					media: new AttachmentCache(account, this.settings, () =>
						this.notify(),
					),
					entries: new Map(),
					pending: [],
					loaded: false,
					blocked: false,
					error: '',
				}
				this.contexts.set(account, ctx)
			}
			this.current = ctx
		}
		if (this.current) {
			this.current.media.resume()
			this.schedule(this.current)
		}
		this.notify()
	}
	private path(ctx: Context) {
		return documentsPath(`${storageRoot}/messages/${ctx.account}/archive.json`)
	}
	private prune(ctx: Context) {
		const s = this.settings()
		const cutoff =
			Date.now() -
			bounded(s.retentionDays, 30, MaximumSettings.retentionDays) * 86400000
		const maxBytes =
			bounded(s.maxStorageMiB, 5, MaximumSettings.maxStorageMiB) * 1024 * 1024
		const entries = [...ctx.entries.values()]
			.filter(e => e.savedAt >= cutoff)
			.sort((a, b) => b.savedAt - a.savedAt)
		ctx.entries.clear()
		let bytes = 256
		for (const entry of entries.slice(
			0,
			bounded(s.maxMessages, 1000, MaximumSettings.maxMessages),
		)) {
			const size = utf8Size(JSON.stringify(entry)) + 1
			if (bytes + size > maxBytes) continue
			bytes += size
			ctx.entries.set(entry.id, entry)
		}
	}
	private schedule(ctx: Context) {
		if (ctx.task) return
		ctx.task = Promise.resolve()
			.then(async () => {
				if (!ctx.loaded) {
					const path = this.path(ctx)
					try {
						const source = (await exists(path))
							? path
							: (await exists(`${path}.bak`))
								? `${path}.bak`
								: undefined
						if (source) {
							const entries = decode(await readFile(source), ctx.account)
							ctx.entries = new Map(entries.map(e => [e.id, e]))
						}
					} catch {
						try {
							const entries = decode(await readFile(`${path}.bak`), ctx.account)
							ctx.entries = new Map(entries.map(e => [e.id, e]))
							ctx.error = 'Recovered the previous archive after a read failure.'
						} catch {
							ctx.blocked = true
							throw Error(
								'Cannot read this account’s archive. Existing files were preserved. Clear saved history to start a new archive.',
							)
						}
					} finally {
						ctx.loaded = true
					}
					// Enforce retention on load, even when no new messages arrive.
					ctx.pending.push(() => {})
				}
				if (ctx.blocked) return
				while (ctx.pending.length) {
					for (const operation of ctx.pending.splice(0)) operation()
					this.prune(ctx)
					const contents = JSON.stringify({
						version: 1,
						account: ctx.account,
						entries: [...ctx.entries.values()],
					})
					await writeFile(this.path(ctx), contents)
					await writeFile(`${this.path(ctx)}.bak`, contents)
					ctx.error = ''
					ctx.media.sync([...ctx.entries.values()])
					this.notify()
				}
			})
			.catch(error => {
				ctx.error = `History storage failed: ${String(error)}`
				this.report(ctx.error)
			})
			.finally(() => {
				ctx.task = undefined
				if (ctx.pending.length && !ctx.blocked && !ctx.error) this.schedule(ctx)
				this.notify()
			})
	}
	private mutate(operation: (ctx: Context) => void) {
		const ctx = this.current
		if (!ctx) return
		ctx.pending.push(() => operation(ctx))
		this.schedule(ctx)
	}
	save(message: MessageRecord, log: Log, channelName: string) {
		const entry: ArchivedMessage = {
			id: message.id,
			channelId: message.channel_id,
			channelName: channelName.slice(0, 200),
			savedAt: Date.now(),
			deleted: log.deleted,
			ghostPing: !!log.ghostPing,
			message: { ...snapshot(message), capturedAt: log.capturedAt },
			edits: log.edits.slice(-50).map((edit, index) => ({
				...snapshot(edit),
				capturedAt: log.editTimes[index],
			})),
			removedAttachments: [...log.removedAttachments],
		}
		this.mutate(ctx => {
			const previous = ctx.entries.get(entry.id)
			if (previous) {
				const old = previous.edits
				const incoming = entry.edits
				let overlap = Math.min(old.length, incoming.length)
				while (
					overlap > 0 &&
					!old
						.slice(-overlap)
						.every(
							(m, i) =>
								JSON.stringify({ ...m, capturedAt: undefined }) ===
								JSON.stringify({ ...incoming[i], capturedAt: undefined }),
						)
				)
					overlap--
				entry.edits = [...old, ...incoming.slice(overlap)].slice(-50)
				entry.ghostPing = entry.ghostPing || previous.ghostPing
			}
			ctx.entries.set(entry.id, entry)
		})
	}
	remove(id: string) {
		this.mutate(ctx => {
			ctx.entries.delete(id)
		})
	}
	clearChannel(channelId: string) {
		this.mutate(ctx => {
			for (const [id, e] of ctx.entries)
				if (e.channelId === channelId) ctx.entries.delete(id)
		})
	}
	clear() {
		const ctx = this.current
		if (!ctx) return
		ctx.blocked = false
		ctx.pending = [
			() => {
				ctx.entries.clear()
			},
		]
		this.schedule(ctx)
	}
	applyRetention() {
		this.mutate(() => {})
	}
	async flush() {
		for (const ctx of this.contexts.values()) {
			if (ctx.error && !ctx.blocked) {
				ctx.pending.push(() => {})
				this.schedule(ctx)
			}
		}
		await Promise.all([...this.contexts.values()].map(ctx => ctx.task))
	}
	accountId() {
		return this.current?.account
	}
	channelEntries(channel: string) {
		const ctx = this.current
		return ctx?.loaded && !ctx.blocked
			? [...ctx.entries.values()].filter(e => e.channelId === channel)
			: []
	}
	stopDownloads() {
		for (const ctx of this.contexts.values()) ctx.media.pause()
	}
	media() {
		return this.current?.media
	}
	view() {
		const ctx = this.current
		return {
			entries: ctx
				? [...ctx.entries.values()].sort((a, b) => b.savedAt - a.savedAt)
				: [],
			loading: !!ctx && !ctx.loaded,
			saving: !!ctx?.task,
			error: ctx?.error || ctx?.media.error || '',
			account: ctx?.account,
		}
	}
}

export let archive: MessageArchive | undefined
export function setArchive(value?: MessageArchive) {
	archive = value
}
