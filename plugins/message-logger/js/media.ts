import { FileModule } from '@valenced/discord/native'
import { exists, readFile, writeFile } from '@valenced/modules/native/fs'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { Share } from 'react-native'
import { bounded, utf8Size } from './archive'
import type { ArchivedMessage } from './archive'
import type { Attachment } from './logger'
import type { Settings } from './shared'

interface SavedFile {
	key: string
	filename: string
	data: string
	size: number
	savedAt: number
}
function keyFor(message: string, attachment: string) {
	if (!/^[a-zA-Z0-9_-]+$/.test(message) || !/^[a-zA-Z0-9_-]+$/.test(attachment))
		return undefined
	return `${message}_${attachment}`
}
function allowedURL(url: string) {
	return /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\/[^\s\\#]+$/i.test(
		url,
	)
}
function base64(bytes: Uint8Array) {
	const alphabet =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	const parts: string[] = []
	let chunk = ''
	for (let i = 0; i < bytes.length; i += 3) {
		const n =
			(bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
		chunk +=
			alphabet[n >>> 18] +
			alphabet[(n >>> 12) & 63] +
			(i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') +
			(i + 2 < bytes.length ? alphabet[n & 63] : '=')
		if (chunk.length >= 16384) {
			parts.push(chunk)
			chunk = ''
		}
	}
	parts.push(chunk)
	return parts.join('')
}

export class AttachmentCache {
	private files = new Map<string, SavedFile>()
	private desired = new Map<string, Attachment>()
	private dirty = false
	private loaded = false
	private blocked = false
	private paused = false
	private revision = 0
	private task?: Promise<void>
	private processed = -1
	private request?: XMLHttpRequest
	private statuses = new Map<string, string>()
	error = ''
	constructor(
		private account: string,
		private settings: () => Settings,
		private notify: () => void,
	) {}
	private path() {
		return `${pluginStorageDirFor('thetoadsage.message-logger')}/media-${this.account}.json`
	}
	private async load() {
		if (this.loaded) return
		try {
			if (await exists(this.path())) {
				const raw = await readFile(this.path())
				if (utf8Size(raw) > 70 * 1024 * 1024)
					throw Error('File cache exceeds the read limit')
				const data = JSON.parse(raw)
				if (
					data.version !== 1 ||
					data.account !== this.account ||
					!Array.isArray(data.files)
				)
					throw Error('Invalid file cache')
				for (const f of data.files) {
					if (
						!f ||
						typeof f.key !== 'string' ||
						!/^[a-zA-Z0-9_-]+$/.test(f.key) ||
						typeof f.filename !== 'string' ||
						typeof f.data !== 'string' ||
						/[^A-Za-z0-9+/=]/.test(f.data) ||
						f.data.length % 4 !== 0 ||
						/=/.test(f.data.slice(0, -2)) ||
						(f.data.at(-2) === '=' && f.data.at(-1) !== '=') ||
						!Number.isInteger(f.size) ||
						f.size < 0 ||
						!Number.isFinite(f.savedAt) ||
						f.size !==
							(f.data.length / 4) * 3 -
								(f.data.endsWith('==') ? 2 : f.data.endsWith('=') ? 1 : 0)
					)
						throw Error('Invalid saved file')
				}
				this.files = new Map(data.files.map((f: SavedFile) => [f.key, f]))
			} else this.dirty = true
		} catch {
			this.blocked = true
			this.error =
				'Saved attachment files could not be read. Existing data was preserved; clear saved files to reset it.'
		} finally {
			this.loaded = true
		}
	}
	private async persist() {
		const text = JSON.stringify({
			version: 1,
			account: this.account,
			files: [...this.files.values()],
		})
		await writeFile(this.path(), text)
		this.dirty = false
	}
	private fileBytes(file: SavedFile) {
		return (
			utf8Size(JSON.stringify({ ...file, data: '' })) + file.data.length + 1
		)
	}
	private prune() {
		const before = [...this.files.keys()].join('\0')
		for (const key of this.files.keys())
			if (!this.desired.has(key)) this.files.delete(key)
		const max = bounded(this.settings().maxMediaMiB, 25, 50) * 1024 * 1024
		let bytes = 256
		const sorted = [...this.files.values()].sort(
			(a, b) => b.savedAt - a.savedAt,
		)
		this.files.clear()
		for (const file of sorted) {
			const size = this.fileBytes(file)
			if (bytes + size > max) continue
			bytes += size
			this.files.set(file.key, file)
		}
		if ([...this.files.keys()].join('\0') !== before) this.dirty = true
	}
	private download(url: string, limit: number): Promise<Uint8Array> {
		return new Promise((resolve, reject) => {
			const xhr = (this.request = new XMLHttpRequest())
			xhr.open('GET', url, true)
			xhr.responseType = 'arraybuffer'
			xhr.timeout = 30000
			const fail = (message: string) => reject(Error(message))
			xhr.onreadystatechange = () => {
				if (
					xhr.readyState === 2 &&
					Number(xhr.getResponseHeader('Content-Length')) > limit
				)
					xhr.abort()
			}
			xhr.onprogress = e => {
				if (e.loaded > limit || (e.lengthComputable && e.total > limit))
					xhr.abort()
			}
			xhr.onerror = () => fail('Download failed')
			xhr.ontimeout = () => fail('Download timed out')
			xhr.onabort = () => fail('Download cancelled or file exceeds the limit')
			xhr.onload = () => {
				if (
					xhr.status !== 200 ||
					(xhr.responseURL && !allowedURL(xhr.responseURL))
				)
					return fail(
						'Attachment unavailable or redirected outside Discord CDN',
					)
				if (
					!(xhr.response instanceof ArrayBuffer) ||
					xhr.response.byteLength > limit
				)
					return fail('File exceeds the download limit')
				resolve(new Uint8Array(xhr.response))
			}
			xhr.send()
		})
	}
	sync(entries: ArchivedMessage[]) {
		const previous = this.desired
		this.desired = new Map()
		for (const entry of entries) {
			for (const m of [...entry.edits, entry.message])
				for (const att of m.attachments) {
					if (!entry.deleted && !entry.removedAttachments.includes(att.id))
						continue
					const key = keyFor(entry.id, att.id)
					if (key) {
						if (previous.get(key)?.url !== att.url) this.statuses.delete(key)
						this.desired.set(key, att)
					}
				}
		}
		this.revision++
		if (!this.settings().saveAttachments) this.request?.abort()
		this.start()
	}
	private start() {
		if (this.task || this.paused) return
		this.task = Promise.resolve()
			.then(async () => {
				await this.load()
				if (this.blocked) return
				while (!this.paused && this.processed !== this.revision) {
					this.processed = this.revision
					this.prune()
					if (this.dirty) await this.persist()
					if (!this.settings().saveAttachments) continue
					for (const [key, att] of [...this.desired]) {
						if (this.paused || !this.settings().saveAttachments) break
						if (this.files.has(key) || this.statuses.has(key)) continue
						const limit =
							bounded(this.settings().maxAttachmentMiB, 5, 10) * 1024 * 1024
						if (!att.url || !allowedURL(att.url)) {
							this.statuses.set(key, 'Unsupported attachment URL')
							continue
						}
						if (
							att.size !== undefined &&
							(!Number.isFinite(att.size) || att.size > limit || att.size < 0)
						) {
							this.statuses.set(key, 'File exceeds the download limit')
							continue
						}
						this.statuses.set(key, 'Downloading…')
						this.notify()
						try {
							const bytes = await this.download(att.url, limit)
							if (
								this.paused ||
								!this.settings().saveAttachments ||
								!this.desired.has(key)
							)
								continue
							const file = {
								key,
								filename: (att.filename || att.id).slice(0, 1000),
								data: base64(bytes),
								size: bytes.byteLength,
								savedAt: Date.now(),
							}
							this.files.set(key, file)
							this.dirty = true
							this.prune()
							await this.persist()
							this.statuses.set(
								key,
								this.files.has(key)
									? 'Saved on this iPhone'
									: 'File exceeds the saved-file storage limit',
							)
						} catch (e) {
							this.files.delete(key)
							this.dirty = true
							if (
								this.paused ||
								!this.settings().saveAttachments ||
								!this.desired.has(key)
							)
								this.statuses.delete(key)
							else this.statuses.set(key, String(e))
						} finally {
							this.request = undefined
							this.notify()
						}
					}
					this.error = ''
				}
			})
			.catch(() => {
				this.error =
					'Could not save attachment files. Check available storage and retry.'
			})
			.finally(() => {
				this.task = undefined
				if (
					!this.paused &&
					!this.blocked &&
					!this.error &&
					this.processed !== this.revision
				)
					this.start()
				this.notify()
			})
	}
	retry() {
		this.statuses.clear()
		this.revision++
		this.start()
	}
	status(message: string, attachment: string) {
		const key = keyFor(message, attachment)
		return key && this.files.has(key)
			? 'Saved on this iPhone'
			: key
				? ((this.statuses.get(key) === 'Saved on this iPhone'
						? 'Removed by storage or retention limits'
						: this.statuses.get(key)) ?? 'Not saved')
				: 'Invalid attachment ID'
	}
	has(message: string, attachment: string) {
		const key = keyFor(message, attachment)
		return !!key && this.files.has(key)
	}
	async share(message: string, attachment: string) {
		const key = keyFor(message, attachment)
		const file = key && this.files.get(key)
		if (!file) return
		// Only write a binary export after the user requests the iOS share sheet.
		const safeName =
			file.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment'
		const relative = `valenced-message-logger/${this.account}-${key}-${safeName}`
		try {
			const path = await FileModule.writeFile(
				'cache',
				relative,
				file.data,
				'base64',
			)
			await Share.share({
				url: path.startsWith('file://') ? path : `file://${path}`,
			})
		} finally {
			await FileModule.removeFile('cache', relative)
		}
	}
	async clear() {
		this.pause()
		await this.task
		this.files.clear()
		this.dirty = true
		this.statuses = new Map(
			[...this.desired.keys()].map(key => [
				key,
				'Removed from saved files; retry to download again',
			]),
		)
		this.error = ''
		this.blocked = false
		this.loaded = true
		try {
			await this.persist()
		} catch {
			this.error =
				'Could not clear saved attachment files. Check available storage.'
		}
		// Downloads remain paused until the next archive change or settings apply.
		this.paused = false
		this.notify()
	}
	pause() {
		this.paused = true
		this.request?.abort()
	}
	resume() {
		this.paused = false
	}
	usage() {
		return {
			count: this.files.size,
			bytes:
				256 +
				[...this.files.values()].reduce(
					(total, file) => total + this.fileBytes(file),
					0,
				),
			busy: !!this.task,
		}
	}
	async flush() {
		await this.task
	}
}
