import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function renderText(node: any): string {
	if (node == null || typeof node === 'boolean') return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(renderText).join('')
	if (typeof node.type === 'function') return renderText(node.type(node.props))
	return renderText(node.props?.children)
}

const code = readFileSync(
	new URL('../plugins/message-logger/build/js/index.js', import.meta.url),
	'utf8',
)

function message(id = 'm1', content = 'Original text', extra: any = {}) {
	return {
		id,
		channel_id: 'c1',
		content,
		state: 'SENT',
		flags: 0,
		author: { id: 'other' },
		attachments: [],
		...extra,
	}
}

function harness(t: any, settings: any = {}, config: any = {}) {
	const disk: Map<string, string> = config.disk ?? new Map()
	let account = config.account ?? 'self'
	class MockXHR {
		readyState = 0
		status = 0
		response: any
		responseURL = ''
		responseType = ''
		timeout = 0
		url = ''
		done = false
		onload?: () => void
		onerror?: () => void
		onabort?: () => void
		onprogress?: (value: any) => void
		onreadystatechange?: () => void
		open(_method: string, url: string) {
			this.url = url
			this.responseURL = url
		}
		getResponseHeader() {
			return String(config.network?.[this.url]?.declaredLength ?? 0)
		}
		send() {
			config.requests?.push(this)
			if (!config.deferDownloads) Promise.resolve().then(() => this.complete())
		}
		complete() {
			if (this.done) return
			const reply = config.network?.[this.url]
			this.readyState = 2
			this.onreadystatechange?.()
			if (this.done) return
			if (!reply) {
				this.done = true
				this.onerror?.()
				return
			}
			const bytes = Uint8Array.from(reply.bytes ?? [])
			this.onprogress?.({
				loaded: bytes.length,
				total: bytes.length,
				lengthComputable: true,
			})
			if (this.done) return
			this.responseURL = reply.redirect ?? this.url
			this.response = bytes.buffer
			this.status = reply.status ?? 200
			this.done = true
			this.onload?.()
		}
		abort() {
			if (this.done) return
			this.done = true
			this.onabort?.()
		}
	}
	const hookState: any[] = []
	let hookIndex = 0
	let failWrites = false
	const fs = {
		exists: async (path: string) => disk.has(path),
		readFile: async (path: string) => {
			if (!disk.has(path)) throw Error('Missing')
			return disk.get(path)!
		},
		writeFile: async (path: string, value: string) => {
			if (failWrites || (config.failIndex && path.endsWith('/index.json')))
				throw Error('Disk full')
			disk.set(path, value)
			config.writes?.push(path)
		},
	}

	const records = new Map<string, any>()
	const listeners = new Map<string, Set<any>>()
	const cleanups: any[] = []
	const pending: any[] = []
	const errors: string[] = []
	const alerts: any[] = []
	const channels = new Map([
		['c1', { id: 'c1', parent_id: 'category', guild_id: 'server' }],
	])
	const component = (props: any) => props?.children ?? null
	const jsx = (type: any, props: any) => ({ type, props })
	const Design: any = new Proxy(
		{},
		{
			get: (_, key) =>
				key === 'ActionSheetRow'
					? Object.assign(component, { Group: component })
					: component,
		},
	)
	class RowManager {
		generate({ message: record }: any) {
			return {
				type: 1,
				changeType: 0,
				message: {
					id: record.id,
					content: record.content.startsWith('> ')
						? [
								{
									type: 'blockQuote',
									content: [
										{
											type: 'text',
											content: record.content
												.split('\n')
												.map((line: string) => line.replace(/^> /, ''))
												.join('\n'),
										},
									],
								},
							]
						: [{ type: 'text', content: record.content }],
				},
			}
		}
	}
	const sheet = {
		default: (_: any) => ({
			type: Design.ActionSheet,
			props: { children: [] },
		}),
	}
	const events: any[] = []
	const converted: any[] = []
	const factory = {
		createMessageRecord: (raw: any) => {
			converted.push(raw)
			if (config.failFactory && raw.author?.username === 'Saved user')
				throw Error('Unsupported native record')
			return {
				...raw,
				author: { ...raw.author },
				timestamp: new Date(raw.timestamp ?? '2026-11-06T00:00:00Z'),
				nativeRecord: true,
			}
		},
		updateMessageRecord() {},
	}
	const collections = new Map<string, NativeCollection>()
	class NativeCollection {
		static getOrCreate(channel: string): NativeCollection {
			if (!collections.has(channel))
				collections.set(channel, new NativeCollection(channel))
			return collections.get(channel)!
		}
		static commit(value: NativeCollection) {
			collections.set(value.channelId, value)
			for (const [id, m] of records)
				if (m.channel_id === value.channelId) records.delete(id)
			for (const m of value.toArray()) records.set(m.id, m)
		}
		ready = false
		cached = false
		hasMoreBefore = true
		hasMoreAfter = true
		array: any[] = []
		channelId: string
		constructor(channelId: string) {
			this.channelId = channelId
		}
		toArray() {
			return this.array
		}
		reset(messages: any[]) {
			const copy = Object.assign(new NativeCollection(this.channelId), this)
			copy.array = messages
			assert.ok(
				messages.every(m => m.nativeRecord),
				'Chat collections need native records',
			)
			return copy
		}
		loadComplete(options: any) {
			const incoming = options.newMessages.map((m: any) =>
				factory.createMessageRecord(m),
			)
			const merge = options.isBefore || options.isAfter
			const map = new Map((merge ? this.array : []).map(m => [m.id, m]))
			for (const m of incoming) map.set(m.id, m)
			const next = this.reset(
				[...map.values()].sort(
					(a, b) =>
						a.id.length - b.id.length ||
						(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
				),
			)
			next.ready = true
			next.cached = options.cached ?? false
			if (!options.isAfter) next.hasMoreBefore = options.hasMoreBefore ?? false
			if (!options.isBefore) next.hasMoreAfter = options.hasMoreAfter ?? false
			return next
		}
		addCachedMessages(messages: any[], _stale?: boolean) {
			const map = new Map(this.array.map(m => [m.id, m]))
			for (const m of messages) map.set(m.id, factory.createMessageRecord(m))
			const next = this.reset(
				[...map.values()].sort(
					(a, b) =>
						a.id.length - b.id.length ||
						(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
				),
			)
			next.cached = true
			return next
		}
	}
	const subscriptionSet = new Set<() => void>()
	let emitted = 0

	const dispatch = (input: any) => {
		events.push(input)
		let payload = input
		for (const listener of listeners.get(input.type) ?? []) {
			payload = listener(payload)
			if (!payload) return
		}
		const data = payload.message
		switch (payload.type) {
			case 'LOAD_MESSAGES_SUCCESS':
				NativeCollection.commit(
					NativeCollection.getOrCreate(payload.channelId).loadComplete({
						...payload,
						newMessages: payload.messages,
					}),
				)
				break
			case 'LOCAL_MESSAGES_LOADED':
				NativeCollection.commit(
					NativeCollection.getOrCreate(payload.channelId).addCachedMessages(
						payload.messages,
						payload.stale,
					),
				)
				break
			case 'MESSAGE_CREATE':
				if (data.nonce) records.delete(data.nonce)
				records.set(data.id, data)
				break
			case 'MESSAGE_UPDATE':
				if (records.has(data.id))
					records.set(data.id, { ...records.get(data.id), ...data })
				break
			case 'MESSAGE_DELETE':
				records.delete(payload.id)
				for (const col of collections.values())
					col.array = col.array.filter(m => m.id !== payload.id)
				break
			case 'MESSAGE_DELETE_BULK':
				for (const id of payload.ids) records.delete(id)
				break
		}
	}
	const api: any = {
		discord: {
			native: {
				FileModule: {
					getConstants: () => ({ DocumentsDirPath: '/documents' }),
					writeFile: async (
						dir: string,
						path: string,
						data: string,
						encoding: string,
					) => {
						if (failWrites) throw Error('Disk full')
						config.exports?.push({ path, data, encoding })
						const absolute = `/${dir}/${path}`
						disk.set(
							absolute,
							encoding === 'base64'
								? Buffer.from(data, 'base64').toString('latin1')
								: data,
						)
						config.writes?.push(absolute)
						return absolute
					},
					removeFile: async (dir: string, path: string) => {
						if (config.failRemovals) throw Error('Delete failed')
						disk.delete(`/${dir}/${path}`)
						return true
					},
					clearFolder: async (dir: string, path: string) => {
						if (config.failRemovals) throw Error('Delete failed')
						for (const key of disk.keys())
							if (key.startsWith(`/${dir}/${path}/`)) disk.delete(key)
						return true
					},
				},
			},
			common: {
				flux: { Dispatcher: { dispatch } },
				tokens: {
					Tokens: {
						default: {
							colors: { TEXT_FEEDBACK_CRITICAL: 'critical' },
							internal: { resolveSemanticColor: () => '#ed4245' },
						},
					},
				},
			},
			flux: {
				Stores: {
					MessageStore: {
						getMessage: (_: string, id: string) => records.get(id),
						emitChange: () => {
							emitted++
						},
					},
					AuthenticationStore: { getId: () => account },
					SelectedChannelStore: { getChannelId: () => config.selectedChannel },
					ChannelStore: { getChannel: (id: string) => channels.get(id) },
					ThemeStore: { theme: 'dark' },
				},
				onFluxEventDispatched: (type: string, cb: any) => {
					const set = listeners.get(type) ?? new Set()
					set.add(cb)
					listeners.set(type, set)
					return () => set.delete(cb)
				},
			},
			design: { Design },
			actions: {
				ActionSheetActionCreators: { hideActionSheet() {} },
				AlertActionCreators: {
					openAlert: (_: string, alert: any) => alerts.push(alert),
				},
			},
		},
		plugins: { constants: { pluginStorageDirFor: () => '/plugin-data' } },
		modules: {
			native: { fs },
			finders: {
				filters: {
					withName: (name: string) => ({ name }),
					withProps: (...props: string[]) => ({ props }),
				},
				getModules: (filter: any, cb: any, options: any = {}) => {
					let active = true
					if (filter.props?.includes('flatMapChannelMessages'))
						pending.push(
							() =>
								active &&
								cb({ default: NativeCollection, flatMapChannelMessages() {} }),
						)
					if (filter.props?.includes('createMessageRecord'))
						pending.push(() => active && cb(factory))
					if (filter.name === 'RowManager')
						pending.push(() => {
							if (!active) return
							cb(RowManager)
							if (options.max !== 1) cb(RowManager)
						})
					if (filter.name === 'LongPressMessageActionSheet')
						pending.push(() => active && cb(sheet))
					return () => {
						active = false
					}
				},
			},
		},
		patcher: {
			instead: (target: any, key: string, cb: any) => {
				const original = target[key]
				target[key] = function (...args: any[]) {
					return cb.call(this, args, original)
				}
				return () => {
					target[key] = original
				}
			},
		},
		utils: {
			error: { getErrorStack: (e: any) => String(e) },
			discord: { lookupGeneratedIconComponent: () => component },
		},
		components: { Page: component, TableRowAssetIcon: component },
		react: {
			React: {
				createElement: jsx,
				useState: (value: any) => {
					const index = hookIndex++
					if (!(index in hookState)) hookState[index] = value
					return [
						hookState[index],
						(next: any) => {
							hookState[index] =
								typeof next === 'function' ? next(hookState[index]) : next
						},
					]
				},
				useEffect: () => {},
			},
			ReactJSXRuntime: { jsx, jsxs: jsx },
			ReactNative: {
				ScrollView: component,
				Share: {
					share: async (value: any) => {
						config.shares?.push(value)
					},
				},
				AppState: { addEventListener: () => ({ remove() {} }) },
				processColor: (color: string) =>
					/^#[0-9a-f]{6}$/i.test(color)
						? 0xff000000 + parseInt(color.slice(1), 16)
						: null,
			},
		},
	}

	const options = new Function(
		'valenced',
		'plugin',
		'XMLHttpRequest',
		`return ${code}`,
	)(api, (options: any) => options, MockXHR).default
	const storage = {
		cache: { ...options.jsonStorage.default, ...settings },
		use() {
			return this.cache
		},
		async set(values: any) {
			Object.assign(this.cache, values)
			for (const fn of subscriptionSet) fn()
		},
		subscribe(fn: () => void) {
			subscriptionSet.add(fn)
			return () => subscriptionSet.delete(fn)
		},
	}
	options.start({
		cleanup: (...items: any[]) => cleanups.push(...items),
		jsonStorage: storage,
		plugin: { reportError: (e: string) => errors.push(e) },
	})
	for (const cb of pending) cb()
	let stopped = false
	const stop = () => {
		if (stopped) return
		stopped = true
		for (const cleanup of [...cleanups].reverse()) cleanup()
	}
	t.after(() => {
		stop()
		if (!config.allowErrors) assert.deepEqual(errors, [])
	})
	const row = (id = 'm1') =>
		new RowManager().generate({ message: records.get(id) })
	const contentText = (value: any): string =>
		typeof value === 'string'
			? value
			: Array.isArray(value)
				? value.map(contentText).join('')
				: value && typeof value === 'object'
					? contentText(value.content)
					: ''
	const text = (id = 'm1') => contentText(row(id).message.content)

	const menu = (id = 'm1') => {
		const tree = sheet.default({
			message: records.get(id),
			channel: channels.get('c1'),
		})
		const actions: any[] = []
		// Evaluate the plugin's inserted MessageActions component while preserving host rows.
		for (const child of tree.props.children as any[]) {
			const group = child.type(child.props)
			const collect = (node: any) => {
				if (!node) return
				if (Array.isArray(node)) return node.forEach(collect)
				if (node.props?.label) actions.push(node.props)
				collect(node.props?.children)
			}
			collect(group)
		}
		return actions
	}
	const settle = async () => {
		for (let i = 0; i < 80; i++) await Promise.resolve()
	}
	const saved = (id = account) =>
		JSON.parse(
			disk.get(
				`/documents/valenced/messagelogger/messages/${id}/archive.json`,
			) ?? '{"entries":[]}',
		).entries
	const ui = () => {
		hookIndex = 0
		const tree = options.SettingsComponent({ api: { jsonStorage: storage } })
		const nodes: any[] = []
		const walk = (node: any) => {
			if (!node) return
			if (Array.isArray(node)) return node.forEach(walk)
			nodes.push(node)
			if (
				typeof node.type === 'function' &&
				typeof node.props?.defaultColor === 'string' &&
				typeof node.props?.preview === 'string'
			)
				walk(node.type(node.props))
			else walk(node.props?.children)
		}
		walk(tree)
		return nodes
	}
	return {
		events,
		converted,
		collections,
		NativeCollection,
		emitted: () => emitted,
		disk,
		saved,
		settle,
		ui,
		errors,
		setAccount: (value: string) => {
			account = value
		},
		failWrites: (value: boolean) => {
			failWrites = value
		},
		records,
		channels,
		dispatch,
		row,
		text,
		stop,
		menu,
		storage,
		alerts,
		options,
	}
}

test('retains a deleted message and labels it', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	assert.equal(h.text(), '[Deleted] Original text')
	assert.equal(h.row().message.textColor, 0xffed4245)
})

test('bulk deletion retains eligible messages and removes ignored bot messages', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.records.set(
		'bot',
		message('bot', 'Bot', { author: { id: 'bot', bot: true } }),
	)
	h.dispatch({
		type: 'MESSAGE_DELETE_BULK',
		ids: ['m1', 'bot'],
		channelId: 'c1',
	})
	await Promise.resolve()
	assert.ok(h.records.has('m1'))
	assert.ok(!h.records.has('bot'))
	assert.match(h.text(), /Deleted/)
})

test('retains empty earlier text and multiple distinct edits inline', t => {
	const h = harness(t)
	h.records.set('m1', message('m1', ''))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Second' },
	})
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Third' },
	})
	assert.equal(
		h.text().replace(/ · [^\]]+/g, ''),
		'[Previous version 1]\n\n\n[Previous version 2]\nSecond\n\n[Current version]\nThird',
	)
})

test('duplicate and metadata-only updates do not add edit history', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Original text' },
	})
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1' },
	})
	assert.equal(h.text(), 'Original text')
})

test('retains removed attachments independently of deleted-message logging', t => {
	const h = harness(t, { logDeletes: false })
	h.records.set(
		'm1',
		message('m1', 'File', {
			attachments: [{ id: 'file', url: 'https://cdn.example/file' }],
		}),
	)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', attachments: [] },
	})
	assert.equal(h.records.get('m1').attachments[0].id, 'file')
	assert.match(h.text(), /removed attachment/)
})

test('a re-added attachment is no longer marked removed', t => {
	const h = harness(t)
	h.records.set('m1', message('m1', 'File', { attachments: [{ id: 'file' }] }))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', attachments: [] },
	})
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', attachments: [{ id: 'file' }] },
	})
	assert.equal(h.text(), 'File')
})

for (const [name, settings, extra] of [
	['self', { ignoreSelf: true }, { author: { id: 'self' } }],
	['bot', {}, { author: { id: 'bot', bot: true } }],
	['user ID', { ignoreUsers: 'something, other' }, {}],
	['channel ID', { ignoreChannels: 'c1' }, {}],
	['category ID', { ignoreChannels: 'category' }, {}],
	['server ID', { ignoreGuilds: 'server' }, {}],
	['ephemeral', {}, { flags: 64 }],
	['unsent', {}, { state: 'SENDING' }],
] as const) {
	test(`respects ${name} exclusion when deleting`, t => {
		const h = harness(t, settings)
		h.records.set('m1', message('m1', 'Text', extra))
		h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
		assert.equal(h.records.has('m1'), false)
	})
}

test('ignored IDs use complete tokens rather than substring matches', t => {
	const h = harness(t, { ignoreUsers: 'other-longer' })
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	assert.ok(h.records.has('m1'))
})

test('ephemeral edits and attachments are not logged', t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'Secret', { flags: 64, attachments: [{ id: 'file' }] }),
	)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: {
			id: 'm1',
			channel_id: 'c1',
			content: 'Updated',
			attachments: [],
		},
	})
	assert.equal(h.text(), 'Updated')
	assert.equal(h.records.get('m1').attachments.length, 0)
})

test('normal edit content remains current when inline history is disabled', t => {
	const h = harness(t, { inlineEdits: false })
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Updated' },
	})
	assert.equal(h.text(), 'Updated')
})

test('another author cannot replace a cached message using its nonce', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_CREATE',
		message: message('new', 'Replacement', { nonce: 'm1' }),
	})
	assert.ok(h.records.has('m1'))
	assert.ok(h.records.has('new'))
})

test('disabling restores retained messages and attachments and stops intercepting', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.records.set('file', message('file', 'File', { attachments: [{ id: 'a' }] }))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'file', channel_id: 'c1', attachments: [] },
	})
	h.stop()
	assert.ok(!h.records.has('m1'))
	assert.equal(h.records.get('file').attachments.length, 0)
	h.records.set('m2', message('m2'))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm2', channelId: 'c1' })
	assert.ok(!h.records.has('m2'))
})

test('message history opens from the mobile long-press sheet', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Updated' },
	})
	const action = h.menu().find(item => item.label === 'View message history')
	assert.ok(action)
	action.onPress()
	assert.match(renderText(h.alerts[0].props.content), /Original text/)
	assert.match(renderText(h.alerts[0].props.content), /Updated/)
})

test('removing history really removes a retained deleted message locally', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	h.menu()
		.find(item => item.label === 'Remove History')
		.onPress()
	assert.ok(!h.records.has('m1'))
})

test('highlight can be toggled without affecting retained content', t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	h.menu()
		.find(item => item.label === 'Toggle Deleted Highlight')
		.onPress()
	assert.equal(h.text(), 'Original text')
})

test('logging options allow ordinary deletion and attachment removal when disabled', t => {
	const h = harness(t, {
		logDeletes: false,
		logEdits: false,
		logDeletedAttachments: false,
	})
	h.records.set('m1', message('m1', 'Old', { attachments: [{ id: 'a' }] }))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'New', attachments: [] },
	})
	assert.equal(h.text(), 'New')
	assert.equal(h.records.get('m1').attachments.length, 0)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	assert.ok(!h.records.has('m1'))
})

for (const type of ['LOGOUT', 'LOGIN_SUCCESS']) {
	test(`clears earlier account history on ${type}`, t => {
		const h = harness(t)
		h.records.set('m1', message())
		h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
		h.dispatch({ type })
		h.records.set('m1', message('m1', 'New account'))
		assert.equal(h.text(), 'New account')
	})
}

test('archive survives stop/restart and opens history without Discord cache', async t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'Original', { author: { id: 'other', username: 'Alice' } }),
	)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Updated' },
	})
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	h.stop()
	await h.settle()
	const reopened = harness(t, {}, { disk: h.disk })
	await reopened.settle()
	assert.equal(reopened.records.size, 0)
	const entry = reopened.saved()[0]
	assert.equal(entry.message.content, 'Updated')
	assert.equal(entry.edits[0].content, 'Original')
	assert.equal(entry.deleted, true)
	reopened
		.ui()
		.find(n => n.props?.label === 'Deleted · Alice')
		.props.onPress()
	assert.match(renderText(reopened.alerts[0].props.content), /Original/)
	assert.match(renderText(reopened.alerts[0].props.content), /Updated/)
})

test('queues events received during startup, and merges later-session edits', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Second' },
	})
	await h.settle()
	h.stop()
	const next = harness(t, {}, { disk: h.disk })
	next.records.set('m1', message('m1', 'Second'))
	next.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Third' },
	})
	await next.settle()
	assert.deepEqual(
		next.saved()[0].edits.map((e: any) => e.content),
		['Original text', 'Second'],
	)
})

test('isolates account archives and preserves them on logout and rapid switches', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	h.dispatch({ type: 'LOGOUT' })
	h.setAccount('second')
	h.dispatch({ type: 'LOGIN_SUCCESS' })
	await h.settle()
	assert.equal(h.saved('self').length, 1)
	assert.equal(h.saved().length, 0)
	assert.ok(!h.ui().some(n => n.props?.label?.startsWith('Deleted ·')))
	h.dispatch({ type: 'LOGOUT' })
	h.setAccount('self')
	h.dispatch({ type: 'LOGIN_SUCCESS' })
	await h.settle()
	assert.equal(h.saved().length, 1)
})

test('count retention and explicit clear remove durable history and recovery copy', async t => {
	const h = harness(t, { maxMessages: 2 })
	for (const id of ['a', 'b', 'c']) {
		h.records.set(id, message(id))
		h.dispatch({ type: 'MESSAGE_DELETE', id, channelId: 'c1' })
	}
	await h.settle()
	assert.equal(h.saved().length, 2)
	h.ui()
		.find(n => n.props?.text === 'Clear saved history for this account')
		.props.onPress()
	const alert = h.alerts.at(-1)
	alert.props.actions.props.children
		.find((n: any) => n.props.text === 'Clear history')
		.props.onPress()
	await h.settle()
	assert.equal(h.saved().length, 0)
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/messages/self/archive.json.bak',
			)!,
		).entries.length,
		0,
	)
})

test('retention prunes old entries on reopen and enforces UTF-8 storage bound', async t => {
	const h = harness(t, { maxStorageMiB: 1 })
	for (let i = 0; i < 20; i++) {
		const id = String(i)
		h.records.set(id, message(id, '😀'.repeat(16000)))
		h.dispatch({ type: 'MESSAGE_DELETE', id, channelId: 'c1' })
	}
	await h.settle()
	assert.ok(
		Buffer.byteLength(
			h.disk.get(
				'/documents/valenced/messagelogger/messages/self/archive.json',
			)!,
		) <=
			1024 * 1024,
	)
	assert.ok(h.saved().length < 20)
	const data = JSON.parse(
		h.disk.get('/documents/valenced/messagelogger/messages/self/archive.json')!,
	)
	data.entries[0].savedAt = Date.now() - 40 * 86400000
	h.disk.set(
		'/documents/valenced/messagelogger/messages/self/archive.json',
		JSON.stringify(data),
	)
	h.stop()
	const next = harness(t, {}, { disk: h.disk })
	await next.settle()
	assert.ok(
		next.saved().every((e: any) => Date.now() - e.savedAt < 30 * 86400000),
	)
})

test('recovers damaged primary from backup and preserves unreadable files', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	h.stop()
	h.disk.set(
		'/documents/valenced/messagelogger/messages/self/archive.json',
		'broken',
	)
	const next = harness(t, {}, { disk: h.disk })
	await next.settle()
	assert.equal(next.saved().length, 1)
	next.stop()
	h.disk.set(
		'/documents/valenced/messagelogger/messages/self/archive.json',
		'broken',
	)
	h.disk.set(
		'/documents/valenced/messagelogger/messages/self/archive.json.bak',
		'also broken',
	)
	const damaged = harness(t, {}, { disk: h.disk, allowErrors: true })
	await damaged.settle()
	assert.match(damaged.errors[0], /preserved/)
	assert.equal(
		h.disk.get('/documents/valenced/messagelogger/messages/self/archive.json'),
		'broken',
	)
})

test('reports failed writes and retries without dropping earlier edits', async t => {
	const h = harness(t, {}, { allowErrors: true })
	await h.settle()
	h.failWrites(true)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Second' },
	})
	await h.settle()
	assert.match(h.errors.at(-1)!, /Disk full/)
	h.failWrites(false)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Third' },
	})
	await h.settle()
	assert.equal(h.saved()[0].message.content, 'Third')
	assert.equal(h.saved()[0].edits.length, 2)
})

test('history search covers old versions, author, channel, date and status', async t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'Unique original', {
			author: { id: 'other', username: 'Alice' },
		}),
	)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Changed' },
	})
	h.records.set(
		'm2',
		message('m2', 'Deleted content', {
			author: { id: 'bob', username: 'Bob' },
		}),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm2', channelId: 'c1' })
	await h.settle()
	const search = (text: string) =>
		h
			.ui()
			.find(n => n.props?.label === 'Search saved history')
			.props.onChange(text)
	const rows = () =>
		h.ui().filter(n => /^(Deleted|Edited) ·/.test(n.props?.label ?? ''))
	search('unique Alice c1')
	assert.equal(rows().length, 1)
	search('not present')
	assert.equal(rows().length, 0)
	search(new Date().toISOString().slice(0, 10))
	assert.equal(rows().length, 2)
	search('')
	h.ui()
		.find(n => n.props?.text === 'Show: All')
		.props.onPress()
	assert.equal(rows().length, 1)
	assert.match(rows()[0].props.label, /Bob/)
})

test('retention drafts allow typing, validate ranges and apply only on request', async t => {
	const h = harness(t)
	await h.settle()
	const field = () =>
		h.ui().find(n => n.props?.label === 'Maximum saved messages (1–50000)')
	field().props.onChange('')
	assert.equal(field().props.value, '')
	assert.equal(h.storage.cache.maxMessages, 1000)
	await h
		.ui()
		.find(n => n.props?.text === 'Apply retention limits now')
		.props.onPress()
	assert.ok(
		h
			.ui()
			.some(
				n => n.props?.label === 'Enter whole numbers within the ranges shown.',
			),
	)
	field().props.onChange('25')
	await h
		.ui()
		.find(n => n.props?.text === 'Apply retention limits now')
		.props.onPress()
	assert.equal(h.storage.cache.maxMessages, 25)
})

test('archives only allowlisted fields and preserves attachment metadata', async t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'File', {
			nonce: 'secret',
			token: 'do not store',
			renderState: {},
			author: { id: 'other', username: 'Alice', email: 'private' },
			attachments: [
				{
					id: 'a',
					filename: 'file.png',
					url: 'https://cdn.discordapp.com/a',
					unknown: 'secret',
				},
			],
		}),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const raw = h.disk.get(
		'/documents/valenced/messagelogger/messages/self/archive.json',
	)!
	assert.ok(!/secret|private|renderState/.test(raw))
	assert.equal(h.saved()[0].message.attachments[0].filename, 'file.png')
})

test('wrong-account archive is rejected and can be explicitly cleared', async t => {
	const disk = new Map([
		[
			'/documents/valenced/messagelogger/messages/self/archive.json',
			JSON.stringify({ version: 1, account: 'someone-else', entries: [] }),
		],
	])
	const h = harness(t, {}, { disk, allowErrors: true })
	await h.settle()
	assert.match(h.errors[0], /preserved/)
	h.ui()
		.find(n => n.props?.text === 'Clear saved history for this account')
		.props.onPress()
	h.alerts[0].props.actions.props.children
		.find((n: any) => n.props.text === 'Clear history')
		.props.onPress()
	await h.settle()
	assert.equal(
		JSON.parse(
			disk.get('/documents/valenced/messagelogger/messages/self/archive.json')!,
		).account,
		'self',
	)
})

const attachmentURL =
	'https://cdn.discordapp.com/attachments/123/456/file.png?ex=abc&hm=def'
function attachmentMessage(id = 'm1', extra: any = {}) {
	return message(id, 'File', {
		attachments: [
			{ id: 'a', filename: 'file.png', url: attachmentURL, size: 4, ...extra },
		],
	})
}
function openSaved(h: any, id = 'm1') {
	const index = h.saved().findIndex((entry: any) => entry.id === id)
	const row = h
		.ui()
		.filter((n: any) =>
			/^(Deleted|Edited|Ghost ping) ·/.test(n.props?.label ?? ''),
		)[index]

	assert.ok(row)
	row.props.onPress()
	return renderText(h.alerts.at(-1).props.content)
}

test('edit history shows source timestamps, capture timestamps and marked word differences', async t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'Hello old world', { timestamp: '2026-11-06T10:00:00Z' }),
	)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: {
			id: 'm1',
			channel_id: 'c1',
			content: 'Hello new world',
			edited_timestamp: '2026-11-06T10:05:00Z',
		},
	})
	await h.settle()
	const e = h.saved()[0]
	assert.ok(e.edits[0].capturedAt > 0)
	assert.ok(e.message.capturedAt > 0)
	const text = openSaved(h)
	assert.match(text, /Version time:/)
	assert.match(text, /Captured:/)
	assert.match(text, /\[− old\]/)
	assert.match(text, /\[\+ new\]/)
})

test('direct ghost pings survive restart and filter separately from ordinary deletions', async t => {
	const h = harness(t)
	h.records.set(
		'm1',
		message('m1', 'Hi <@self>', { mentions: [{ id: 'self' }] }),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	h.records.set('m2', message('m2', '@everyone', { mentions: [] }))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm2', channelId: 'c1' })
	h.records.set(
		'm3',
		message('m3', '<@self>', {
			author: { id: 'self' },
			mentions: [{ id: 'self' }],
		}),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm3', channelId: 'c1' })
	await h.settle()
	assert.equal(h.saved().find((e: any) => e.id === 'm1').ghostPing, true)
	assert.ok(!h.saved().find((e: any) => e.id === 'm2').ghostPing)
	assert.ok(!h.saved().find((e: any) => e.id === 'm3').ghostPing)
	assert.match(h.text(), /Ghost ping/)
	h.stop()
	const next = harness(t, {}, { disk: h.disk })
	await next.settle()
	assert.match(openSaved(next), /directly mentioned you/)
	for (const label of ['All', 'Deleted', 'Edited'])
		next
			.ui()
			.find((n: any) => n.props?.text === `Show: ${label}`)
			.props.onPress()
	assert.ok(
		next.ui().some((n: any) => n.props?.title === '1 matching messages'),
	)
})

test('attachment saving is opt-in and binary files survive restart and export exactly', async t => {
	const requests: any[] = [],
		exports: any[] = [],
		shares: any[] = []
	const off = harness(t, {}, { requests })
	off.records.set('m1', attachmentMessage())
	off.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await off.settle()
	assert.equal(requests.length, 0)
	off.stop()
	const on = harness(
		t,
		{ saveAttachments: true },
		{
			disk: off.disk,
			requests,
			exports,
			shares,
			network: { [attachmentURL]: { bytes: [0, 1, 128, 255] } },
		},
	)
	await on.settle()
	assert.equal(requests.length, 1)
	const media = JSON.parse(
		on.disk.get(
			'/documents/valenced/messagelogger/attachments/self/index.json',
		)!,
	)
	assert.equal(media.files[0].data, undefined)
	assert.equal(media.files[0].data, undefined)
	assert.deepEqual(
		[
			...Buffer.from(
				on.disk.get(
					'/documents/valenced/messagelogger/attachments/self/m1_a-file.png',
				)!,
				'latin1',
			),
		],
		[0, 1, 128, 255],
	)
	on.stop()
	const next = harness(t, {}, { disk: on.disk, exports, shares })
	await next.settle()
	next
		.ui()
		.find((n: any) => n.props?.label === 'Deleted · other')
		.props.onPress()
	const content = next.alerts.at(-1).props.content
	function nodes(node: any): any[] {
		if (!node || typeof node !== 'object') return []
		if (Array.isArray(node)) return node.flatMap(nodes)
		return [
			node,
			...nodes(
				typeof node.type === 'function'
					? node.type(node.props)
					: node.props?.children,
			),
		]
	}
	const button = nodes(content).find(
		n => n.props?.text === 'Open saved file: file.png',
	)
	assert.ok(button)
	await button.props.onPress()
	assert.equal(exports[0].encoding, 'base64')
	assert.deepEqual(
		[...Buffer.from(exports[0].data, 'base64')],
		[0, 1, 128, 255],
	)
	assert.equal(
		shares[0].url,
		'file:///documents/valenced/messagelogger/attachments/self/m1_a-file.png',
	)
})

test('downloads enforce metadata and streamed size limits and reject non-CDN URLs', async t => {
	const requests: any[] = []
	const h = harness(
		t,
		{ saveAttachments: true, maxAttachmentMiB: 1 },
		{
			requests,
			network: { [attachmentURL]: { bytes: new Uint8Array(1024 * 1024 + 1) } },
		},
	)
	h.records.set('large', attachmentMessage('large', { size: 2 * 1024 * 1024 }))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'large', channelId: 'c1' })
	await h.settle()
	assert.equal(requests.length, 0)
	h.records.set(
		'bad',
		attachmentMessage('bad', { url: 'https://example.com/file', size: 0 }),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'bad', channelId: 'c1' })
	await h.settle()
	assert.equal(requests.length, 0)
	h.records.set('stream', attachmentMessage('stream', { size: 0 }))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'stream', channelId: 'c1' })
	await h.settle()
	assert.equal(requests.length, 1)
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		0,
	)
	assert.match(openSaved(h, 'stream'), /limit/)
})

test('removing message history deletes cached files and disabling aborts downloads', async t => {
	const requests: any[] = []
	const h = harness(
		t,
		{ saveAttachments: true },
		{ requests, network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } } },
	)
	h.records.set('m1', attachmentMessage())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		1,
	)
	h.menu()
		.find((n: any) => n.label === 'Remove History')
		.onPress()
	await h.settle()
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		0,
	)
	const pending: any[] = []
	const next = harness(
		t,
		{ saveAttachments: true },
		{ requests: pending, deferDownloads: true },
	)
	next.records.set('m1', attachmentMessage())
	next.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await next.settle()
	assert.equal(pending.length, 1)
	next.stop()
	await next.settle()
	assert.equal(pending[0].done, true)
	assert.equal(
		JSON.parse(
			next.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		0,
	)
})

test('saved-file cache has a separate binary byte budget and clear action', async t => {
	const requests: any[] = []
	const bytes = new Uint8Array(450000)
	const h = harness(
		t,
		{ saveAttachments: true, maxMediaMiB: 1 },
		{ requests, network: { [attachmentURL]: { bytes } } },
	)
	for (const id of ['a', 'b', 'c']) {
		h.records.set(id, attachmentMessage(id, { size: bytes.length }))
		h.dispatch({ type: 'MESSAGE_DELETE', id, channelId: 'c1' })
	}
	await h.settle()
	const raw = h.disk.get(
		'/documents/valenced/messagelogger/attachments/self/index.json',
	)!
	assert.ok(Buffer.byteLength(raw) <= 1024 * 1024)
	assert.equal(JSON.parse(raw).files.length, 2)
	assert.equal(h.saved().length, 3)
	h.ui()
		.find((n: any) => n.props?.text === 'Clear saved attachment files')
		.props.onPress()
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Clear files',
		)
		.props.onPress()
	await h.settle()
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		0,
	)
	assert.equal(h.saved().length, 3)
})

test('cached files stay account-isolated and ordinary text edits do not rewrite file blobs', async t => {
	const writes: string[] = []
	const requests: any[] = []
	const h = harness(
		t,
		{ saveAttachments: true },
		{ writes, requests, network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } } },
	)
	h.records.set('m1', attachmentMessage())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const count = writes.filter(p =>
		p.endsWith('attachments/self/index.json'),
	).length
	h.records.set('m2', message('m2', 'before'))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm2', channel_id: 'c1', content: 'after' },
	})
	await h.settle()
	assert.equal(
		writes.filter(p => p.endsWith('attachments/self/index.json')).length,
		count,
	)
	h.dispatch({ type: 'LOGOUT' })
	h.setAccount('second')
	h.dispatch({ type: 'LOGIN_SUCCESS' })
	await h.settle()
	assert.ok(h.ui().some((n: any) => n.props?.label === '0 saved files'))
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		1,
	)
})

test('corrupt attachment cache does not block text history and is preserved until cleared', async t => {
	const disk = new Map([
		[
			'/documents/valenced/messagelogger/attachments/self/index.json',
			'corrupted saved files',
		],
	])
	const h = harness(t, { saveAttachments: true }, { disk })
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	assert.equal(h.saved().length, 1)
	assert.equal(
		disk.get('/documents/valenced/messagelogger/attachments/self/index.json'),
		'corrupted saved files',
	)
	assert.ok(
		h.ui().some((n: any) => n.props?.subLabel?.includes('could not be read')),
	)
	h.ui()
		.find((n: any) => n.props?.text === 'Clear saved attachment files')
		.props.onPress()
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Clear files',
		)
		.props.onPress()
	await h.settle()
	assert.equal(
		JSON.parse(
			disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		0,
	)
})

test('removed attachments are downloaded and failed URLs retry only on request or refresh', async t => {
	const requests: any[] = []
	const network: any = {}
	const h = harness(t, { saveAttachments: true }, { requests, network })
	h.records.set('m1', attachmentMessage())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', attachments: [] },
	})
	await h.settle()
	assert.equal(requests.length, 1)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'edit' },
	})
	await h.settle()
	assert.equal(requests.length, 1)
	network[attachmentURL] = { bytes: [1, 2, 3, 4] }
	h.ui()
		.find((n: any) => n.props?.text === 'Retry attachment downloads')
		.props.onPress()
	await h.settle()
	assert.equal(requests.length, 2)
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		1,
	)
})

const restoredId = (offset: number) =>
	String(1460000000000000000n + BigInt(offset))
function restoreRecord(
	offset: number,
	content = `Server ${offset}`,
	extra: any = {},
) {
	return message(restoredId(offset), content, {
		author: { id: '2000000000000000001' },
		...extra,
	})
}
function restoreFixture(offset: number, extra: any = {}) {
	const m = restoreRecord(offset, `Saved ${offset}`)
	return {
		id: m.id,
		channelId: 'c1',
		channelName: 'general',
		savedAt: Date.now(),
		deleted: true,
		message: m,
		edits: [],
		removedAttachments: [],
		...extra,
	}
}
function restoreDisk(entries: any[]) {
	return new Map([
		[
			'/documents/valenced/messagelogger/messages/self/archive.json',
			JSON.stringify({ version: 1, account: 'self', entries }),
		],
	])
}
function loadChannel(h: any, offsets: number[], extra: any = {}) {
	const payload = {
		type: 'LOAD_MESSAGES_SUCCESS',
		channelId: 'c1',
		messages: offsets.map(n => restoreRecord(n)),
		hasMoreBefore: true,
		hasMoreAfter: true,
		...extra,
	}
	h.dispatch(payload)
	return payload
}
const collectionIds = (h: any) =>
	h.collections
		.get('c1')
		?.toArray()
		.map((m: any) => m.id)

test('restoration is opt-in and does not alter original load event payloads', async t => {
	const h = harness(t, {}, { disk: restoreDisk([restoreFixture(3)]) })
	await h.settle()
	const payload = loadChannel(h, [5, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [restoredId(1), restoredId(5)])
	assert.deepEqual(
		payload.messages.map(m => m.id),
		[restoredId(5), restoredId(1)],
	)
	assert.deepEqual(
		h.events.map(e => e.type),
		['LOAD_MESSAGES_SUCCESS'],
	)
})

test('startup race restores exact snowflake positions with native records and a permanent saved label', async t => {
	const entry = restoreFixture(3, { ghostPing: true })
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([entry, restoreFixture(0), restoreFixture(7)]) },
	)
	const payload = loadChannel(h, [5, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [
		restoredId(1),
		restoredId(3),
		restoredId(5),
	])
	assert.match(
		h.text(restoredId(3)),
		/^\[Ghost ping\] \[Saved deletion\] Saved 3$/,
	)
	assert.ok(h.records.get(restoredId(3)).nativeRecord)
	assert.equal(
		h.records.get(restoredId(3)).timestamp.toISOString(),
		new Date(Number(BigInt(entry.id) >> 22n) + 1420070400000).toISOString(),
	)
	assert.equal(
		h.saved().find((e: any) => e.id === entry.id).savedAt,
		entry.savedAt,
	)
	assert.deepEqual(
		payload.messages.map(m => m.id),
		[restoredId(5), restoredId(1)],
	)
	assert.deepEqual(
		h.events.map(e => e.type),
		['LOAD_MESSAGES_SUCCESS'],
	)
	const count = h.emitted()
	await h.settle()
	assert.equal(
		h.emitted(),
		count,
		'Stable collections must not enter an emit/reconcile loop',
	)
})

test('pagination preserves boundaries, order and deduplication across repeated loads', async t => {
	const entries = [0, 2, 4, 6, 8].map(n => restoreFixture(n))
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk(entries) },
	)
	await h.settle()
	loadChannel(h, [7, 5], { hasMoreAfter: false })
	await h.settle()
	assert.deepEqual(collectionIds(h), [5, 6, 7, 8].map(restoredId))
	loadChannel(h, [5, 3, 1], {
		isBefore: true,
		hasMoreBefore: true,
		hasMoreAfter: true,
	})
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 2, 3, 4, 5, 6, 7, 8].map(restoredId))
	loadChannel(h, [5, 3, 1], {
		isBefore: true,
		hasMoreBefore: true,
		hasMoreAfter: true,
	})
	await h.settle()
	assert.equal(new Set(collectionIds(h)).size, collectionIds(h).length)
	loadChannel(h, [1], { isBefore: true, hasMoreBefore: false })
	await h.settle()
	assert.deepEqual(
		collectionIds(h),
		[0, 1, 2, 3, 4, 5, 6, 7, 8].map(restoredId),
	)
	assert.equal(h.collections.get('c1').hasMoreBefore, false)
	assert.equal(h.collections.get('c1').hasMoreAfter, false)
})

test('cached history is restored conservatively before a network page is available', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([0, 3, 7].map(n => restoreFixture(n))) },
	)
	h.dispatch({
		type: 'LOCAL_MESSAGES_LOADED',
		channelId: 'c1',
		messages: [restoreRecord(5), restoreRecord(1)],
	})
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 3, 5].map(restoredId))
	assert.equal(h.collections.get('c1').ready, false)
	assert.equal(h.collections.get('c1').cached, true)
})

test('toggle hides only restored rows, retains archives and restores cached channels without reloading', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	const original = h.records.get(restoredId(1))
	await h.storage.set({ restoreDeletions: false })
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 5].map(restoredId))
	assert.strictEqual(h.records.get(restoredId(1)), original)
	assert.equal(h.saved().length, 1)
	await h.storage.set({ restoreDeletions: true })
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 3, 5].map(restoredId))
	h.stop()
	assert.deepEqual(collectionIds(h), [1, 5].map(restoredId))
	assert.equal(h.saved().length, 1)
})

test('authoritative server messages win over archive collisions without a false deletion label', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	loadChannel(h, [5, 3, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 3, 5].map(restoredId))
	assert.equal(h.text(restoredId(3)), 'Server 3')
	assert.equal(h.saved()[0].message.content, 'Saved 3')
})

test('restored rows use archive history for attachments and edits; removing archive entry hides the row', async t => {
	const entry = restoreFixture(3)
	entry.message.attachments = [
		{ id: 'a', filename: 'image.png', url: attachmentURL },
	]
	entry.edits = [restoreRecord(3, 'Earlier version')]
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([entry]) },
	)
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	assert.deepEqual(h.records.get(restoredId(3)).attachments, [])
	assert.match(h.text(restoredId(3)), /archived attachment/)
	assert.match(h.text(restoredId(3)), /Previous version 1/)
	assert.match(h.text(restoredId(3)), /Earlier version/)
	h.menu(restoredId(3))
		.find((n: any) => n.label === 'View message history')
		.onPress()
	assert.match(renderText(h.alerts.at(-1).props.content), /Earlier version/)
	assert.match(renderText(h.alerts.at(-1).props.content), /image.png/)
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Remove saved entry',
		)
		.props.onPress()
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 5].map(restoredId))
	assert.equal(h.saved().length, 0)
})

test('restoration respects updated ignores, channel separation, expiration and malformed IDs', async t => {
	const entries = [
		restoreFixture(3),
		restoreFixture(2, {
			channelId: 'c2',
			message: restoreRecord(2, 'Elsewhere', { channel_id: 'c2' }),
		}),
		restoreFixture(4, { savedAt: Date.now() - 40 * 86400000 }),
		restoreFixture(6, { id: 'invalid', message: message('invalid') }),
	]
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk(entries) },
	)
	await h.settle()
	loadChannel(h, [7, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 3, 7].map(restoredId))
	await h.storage.set({ ignoreChannels: 'category' })
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 7].map(restoredId))
	assert.ok(h.saved().some((e: any) => e.id === restoredId(3)))
})

test('unknown empty pages restore nothing; a completely loaded empty channel can show saved deletions', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	await h.settle()
	loadChannel(h, [])
	await h.settle()
	assert.deepEqual(collectionIds(h), [])
	loadChannel(h, [], { hasMoreBefore: false, hasMoreAfter: false })
	await h.settle()
	assert.deepEqual(collectionIds(h), [restoredId(3)])
})

test('unsupported record conversion leaves native history untouched and reports the problem', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{
			disk: restoreDisk([restoreFixture(3)]),
			failFactory: true,
			allowErrors: true,
		},
	)
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 5].map(restoredId))
	assert.match(h.errors[0], /Unsupported native record/)
})

test('restored rich-message metadata is displayed as safe text and account archives stay separate', async t => {
	const entry = restoreFixture(3)
	entry.message.flags = 8192
	const disk = restoreDisk([entry])
	disk.set(
		'/documents/valenced/messagelogger/messages/second/archive.json',
		JSON.stringify({
			version: 1,
			account: 'second',
			entries: [restoreFixture(4)],
		}),
	)
	const h = harness(t, { restoreDeletions: true }, { disk })
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	assert.equal(h.records.get(restoredId(3)).flags, 0)
	h.dispatch({ type: 'LOGOUT' })
	// Discord clears its own message caches on logout, independently of the plugin.
	h.collections.clear()
	h.records.clear()
	h.setAccount('second')
	h.dispatch({ type: 'LOGIN_SUCCESS' })
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 4, 5].map(restoredId))
	assert.equal(h.saved('self')[0].id, restoredId(3))
})

test('reopening a ready cached channel hydrates it after archive load without another fetch', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	const col = new h.NativeCollection('c1')
	// A cached collection can predate plugin discovery or a settings change.
	h.NativeCollection.commit(
		col.loadComplete({
			newMessages: [restoreRecord(5), restoreRecord(1)],
			hasMoreBefore: true,
			hasMoreAfter: true,
		}),
	)
	h.NativeCollection.getOrCreate('c1')
	await h.settle()
	assert.deepEqual(collectionIds(h), [1, 3, 5].map(restoredId))
	assert.deepEqual(h.events, [])
})

test('startup cache copies of saved deletions get labeled until a fresh server batch supersedes them', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	h.dispatch({
		type: 'LOCAL_MESSAGES_LOADED',
		channelId: 'c1',
		messages: [restoreRecord(3, 'Stale cache content')],
	})
	await h.settle()
	assert.deepEqual(collectionIds(h), [restoredId(3)])
	assert.match(h.text(restoredId(3)), /^\[Saved deletion\] Saved 3$/)
	loadChannel(h, [3], { hasMoreBefore: false, hasMoreAfter: false })
	await h.settle()
	assert.equal(h.text(restoredId(3)), 'Server 3')
})

test('saved edits reappear inline on live messages after startup and remain editable', async t => {
	const entry = restoreFixture(3, { deleted: false })
	entry.message.content = 'Second'
	entry.edits = [restoreRecord(3, 'Original')]
	const h = harness(t, {}, { disk: restoreDisk([entry]) })
	loadChannel(h, [5, 3, 1])
	await h.settle()
	assert.match(h.text(restoredId(3)), /Previous version 1/)
	assert.match(h.text(restoredId(3)), /Original/)
	assert.match(h.text(restoredId(3)), /Second/)
	assert.match(h.text(restoredId(3)), /Server 3/)
	assert.ok(h.events.some((event: any) => event.type === 'MESSAGE_UPDATE'))
	const beforeToggle = h.events.length
	await h.storage.set({ inlineEdits: false })
	await h.settle()
	assert.doesNotMatch(h.text(restoredId(3)), /Original/)
	assert.ok(h.events.length > beforeToggle)
	await h.storage.set({ inlineEdits: true })
	await h.settle()
	assert.match(h.text(restoredId(3)), /Original/)
	h.menu(restoredId(3))
		.find((item: any) => item.label === 'View message history')
		.onPress()
	assert.match(renderText(h.alerts.at(-1).props.content), /Original/)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: restoredId(3), channel_id: 'c1', content: 'New edit' },
	})
	await h.settle()
	assert.deepEqual(
		h.saved()[0].edits.map((edit: any) => edit.content),
		['Original', 'Second', 'Server 3'],
	)
	assert.match(h.text(restoredId(3)), /Original/)
	assert.match(h.text(restoredId(3)), /Server 3/)
	assert.match(h.text(restoredId(3)), /New edit/)
})

test('saved inline edits respect ignores and disappear when history is removed', async t => {
	const entry = restoreFixture(3, { deleted: false })
	entry.edits = [restoreRecord(3, 'Original')]
	const h = harness(t, {}, { disk: restoreDisk([entry]) })
	await h.settle()
	loadChannel(h, [5, 3, 1])
	await h.settle()
	assert.match(h.text(restoredId(3)), /Original/)
	await h.storage.set({ ignoreChannels: 'c1' })
	await h.settle()
	assert.doesNotMatch(h.text(restoredId(3)), /Original/)
	await h.storage.set({ ignoreChannels: '' })
	await h.settle()
	h.menu(restoredId(3))
		.find((item: any) => item.label === 'Remove History')
		.onPress()
	await h.settle()
	assert.equal(h.saved().length, 0)
	assert.doesNotMatch(h.text(restoredId(3)), /Original/)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: restoredId(3), channel_id: 'c1', content: 'Later' },
	})
	await h.settle()
	assert.deepEqual(
		h.saved()[0].edits.map((edit: any) => edit.content),
		['Server 3'],
	)
})

test('deleted rows default red, edited rows orange, and unlogged rows retain native colors', t => {
	const h = harness(t)
	h.records.set('edited', message('edited', 'Before'))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'edited', channel_id: 'c1', content: 'After' },
	})
	assert.equal(h.row('edited').message.textColor, 0xfffaa61a)
	assert.equal(h.row('edited').message.timestampColor, undefined)
	h.records.set('normal', message('normal'))
	assert.equal(h.row('normal').message.textColor, undefined)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'edited', channelId: 'c1' })
	assert.equal(h.row('edited').message.textColor, 0xffed4245)
	h.menu('edited')
		.find((a: any) => a.label === 'Toggle Deleted Highlight')
		.onPress()
	assert.equal(h.row('edited').message.textColor, undefined)
})

test('color changes persist in settings and regenerate rows without changing saved history', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'After' },
	})
	await h.settle()
	const before = JSON.stringify(h.saved())
	await h.storage.set({ editedColor: '#123456', deletedColor: '#aBc' })
	await h.settle()
	assert.equal(h.row().message.textColor, 0xff123456)
	assert.ok(
		h.events.some(
			(e: any) =>
				e.type === 'MESSAGE_UPDATE' && e.message.content === undefined,
		),
	)
	assert.equal(JSON.stringify(h.saved()), before)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	assert.equal(h.row().message.textColor, 0xffaabbcc)
})

test('invalid saved color values fall back to opaque defaults', t => {
	const h = harness(t, {
		deletedColor: 'transparent',
		editedColor: '#12345600',
	})
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'After' },
	})
	assert.equal(h.row().message.textColor, 0xfffaa61a)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	assert.equal(h.row().message.textColor, 0xffed4245)
})

test('color pickers support RGB, hex validation, cancel, reset and explicit apply', async t => {
	const h = harness(t)
	const find = (label: string) =>
		h
			.ui()
			.find(
				(n: any) =>
					n.props?.label === label &&
					(typeof n.props.onPress === 'function' ||
						(label.endsWith('hex value') &&
							typeof n.props.onChange === 'function')),
			)
	const button = (text: string) =>
		h.ui().find((n: any) => n.props?.text === text)
	find('Edited text color').props.onPress()
	assert.equal(
		h.ui().filter((n: any) => n.props?.maximumValue === 255).length,
		3,
	)
	find('Edited text color hex value').props.onChange('#0f8')
	await button('Apply edited text color').props.onPress()
	assert.equal(h.storage.cache.editedColor, '#00FF88')
	find('Edited text color').props.onPress()
	find('Edited text color hex value').props.onChange('not a color')
	await button('Apply edited text color').props.onPress()
	assert.equal(h.storage.cache.editedColor, '#00FF88')
	assert.ok(
		h
			.ui()
			.some(
				(n: any) =>
					n.props?.children ===
					'Enter a three- or six-digit hex color, such as #ED4245.',
			),
	)
	button('Cancel edited text color').props.onPress()
	assert.equal(h.storage.cache.editedColor, '#00FF88')
	find('Edited text color').props.onPress()
	button('Reset edited text color').props.onPress()
	await button('Apply edited text color').props.onPress()
	assert.equal(h.storage.cache.editedColor, '#FAA61A')
	find('Deleted text color').props.onPress()
	h.ui()
		.find((n: any) => n.props?.maximumValue === 255)
		.props.onValueChange(0)
	await button('Apply deleted text color').props.onPress()
	assert.equal(h.storage.cache.deletedColor, '#004245')
})

test('restored saved deletions use the chosen deleted color and retain their saved label', async t => {
	const h = harness(
		t,
		{ restoreDeletions: true, deletedColor: '#112233' },
		{ disk: restoreDisk([restoreFixture(3)]) },
	)
	await h.settle()
	loadChannel(h, [5, 1])
	await h.settle()
	assert.equal(h.row(restoredId(3)).message.textColor, 0xff112233)
	assert.match(h.text(restoredId(3)), /^\[Saved deletion\]/)
})

test('previous versions form numbered quote blocks while current content and archive stay unchanged', async t => {
	const h = harness(t)
	const original = message('m1', 'First line\nSecond line')
	h.records.set('m1', original)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Current text' },
	})
	await h.settle()
	const row = h.row()
	assert.equal(
		row.message.content.filter((n: any) => n.type === 'blockQuote').length,
		1,
	)
	assert.match(h.text(), /Previous version 1 · /)
	assert.match(h.text(), /\[Current version\]\nCurrent text$/)
	assert.equal(original.content, 'First line\nSecond line')
	assert.equal(h.records.get('m1').content, 'Current text')
	assert.equal(h.saved()[0].edits[0].content, 'First line\nSecond line')
	assert.equal(h.saved()[0].message.content, 'Current text')
})

test('turning off inline history leaves current content without quote blocks or version labels', t => {
	const h = harness(t, { inlineEdits: false })
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Current' },
	})
	assert.equal(
		h.row().message.content.some((n: any) => n.type === 'blockQuote'),
		false,
	)
	assert.equal(h.text(), 'Current')
	assert.equal(h.row().message.textColor, 0xfffaa61a)
})

test('history uses configured colors for previous/deleted versions and diff additions/removals', async t => {
	const h = harness(t, { editedColor: '#123456', deletedColor: '#654321' })
	h.records.set('m1', message('m1', 'Before'))
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'After' },
	})
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	h.menu()
		.find((n: any) => n.label === 'View message history')
		.onPress()
	const nodes: any[] = []
	const walk = (node: any) => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach(walk)
			return
		}
		nodes.push(node)
		walk(
			typeof node.type === 'function'
				? node.type(node.props)
				: node.props?.children,
		)
	}
	walk(h.alerts.at(-1).props.content)
	assert.ok(
		nodes.some(
			n =>
				n.props?.children === 'Before' && n.props?.style?.color === '#123456',
		),
	)
	assert.ok(
		nodes.some(
			n => n.props?.children === 'After' && n.props?.style?.color === '#654321',
		),
	)
	assert.ok(
		nodes.some(
			n =>
				n.props?.children === '[− Before]' &&
				n.props?.style?.color === '#654321',
		),
	)
	assert.ok(
		nodes.some(
			n =>
				n.props?.children === '[+ After]' &&
				n.props?.style?.color === '#123456',
		),
	)
})

test('expanded retention settings accept maxima and reject values above them', async t => {
	const h = harness(t)
	await h.settle()
	const fields = [
		['Maximum saved messages (1–50000)', 'maxMessages', 50000],
		['Maximum archive size in MiB (1–50)', 'maxStorageMiB', 50],
		['Maximum download size per file in MiB (1–25)', 'maxAttachmentMiB', 25],
		['Maximum saved-file storage in MiB (1–100)', 'maxMediaMiB', 100],
	] as const
	const apply = () =>
		h
			.ui()
			.find(n => n.props?.text === 'Apply retention limits now')
			.props.onPress()
	for (const [label, , max] of fields)
		h.ui()
			.find(n => n.props?.label === label)
			.props.onChange(String(max))
	await apply()
	for (const [, key, max] of fields) assert.equal(h.storage.cache[key], max)
	for (const [label, key, max] of fields) {
		h.ui()
			.find(n => n.props?.label === label)
			.props.onChange(String(max + 1))
		await apply()
		assert.equal(h.storage.cache[key], max)
		assert.ok(
			h
				.ui()
				.some(
					n =>
						n.props?.label === 'Enter whole numbers within the ranges shown.',
				),
		)
		h.ui()
			.find(n => n.props?.label === label)
			.props.onChange(String(max))
	}
})

test('archives above the old count and read-size limits survive reopening', async t => {
	const entries = Array.from({ length: 10001 }, (_, i) => ({
		id: String(i),
		channelId: 'c1',
		channelName: 'c1',
		savedAt: Date.now(),
		deleted: true,
		message: message(String(i), 'x'.repeat(2800)),
		edits: [],
		removedAttachments: [],
	}))
	const raw = JSON.stringify({ version: 1, account: 'self', entries })
	assert.ok(Buffer.byteLength(raw) > 25 * 1024 * 1024)
	const disk = new Map([
		['/documents/valenced/messagelogger/messages/self/archive.json', raw],
	])
	const settings = { maxMessages: 50000, maxStorageMiB: 50 }
	const h = harness(t, settings, { disk })
	await h.settle()
	assert.equal(h.saved().length, entries.length)
	h.stop()
	const next = harness(t, settings, { disk })
	await next.settle()
	assert.equal(next.saved().length, entries.length)
})

test('expanded attachment limits download files above the old per-file cap', async t => {
	const bytes = new Uint8Array(11 * 1024 * 1024)
	const h = harness(
		t,
		{ saveAttachments: true, maxAttachmentMiB: 25, maxMediaMiB: 100 },
		{
			network: { [attachmentURL]: { bytes } },
		},
	)
	h.records.set('m1', attachmentMessage('m1', { size: bytes.length }))
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const media = JSON.parse(
		h.disk.get(
			'/documents/valenced/messagelogger/attachments/self/index.json',
		)!,
	)
	assert.equal(media.files[0].size, bytes.length)
	assert.equal(
		h.disk.get(
			'/documents/valenced/messagelogger/attachments/self/m1_a-file.png',
		)!.length,
		bytes.length,
	)
})

test('Documents storage starts fresh and leaves old plugin data untouched', async t => {
	const disk = new Map([
		['/plugin-data/archive-self.json', 'legacy history'],
		['/plugin-data/media-self.json', 'legacy attachments'],
	])
	const h = harness(t, {}, { disk })
	await h.settle()
	assert.equal(h.saved().length, 0)
	assert.equal(disk.get('/plugin-data/archive-self.json'), 'legacy history')
	assert.equal(disk.get('/plugin-data/media-self.json'), 'legacy attachments')
	h.records.set('m1', message())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	assert.equal(h.saved().length, 1)
	assert.ok(
		disk.has(
			'/documents/valenced/messagelogger/messages/self/archive.json.bak',
		),
	)
})

test('files deleted in Files stop being advertised and can be downloaded again', async t => {
	const requests: any[] = []
	const h = harness(
		t,
		{ saveAttachments: true },
		{
			requests,
			network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } },
		},
	)
	h.records.set('m1', attachmentMessage())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const path =
		'/documents/valenced/messagelogger/attachments/self/m1_a-file.png'
	assert.ok(h.disk.has(path))
	h.disk.delete(path)
	h.ui()
		.find(n => n.props?.text === 'Apply retention limits now')
		.props.onPress()
	await h.settle()
	assert.match(openSaved(h), /File missing/)
	assert.equal(requests.length, 1)
	h.ui()
		.find(n => n.props?.text === 'Retry attachment downloads')
		.props.onPress()
	await h.settle()
	assert.equal(requests.length, 2)
	assert.ok(h.disk.has(path))
})

test('attachment filenames stay within the account folder and clear removes binary files', async t => {
	const h = harness(
		t,
		{ saveAttachments: true },
		{
			network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } },
		},
	)
	h.records.set(
		'm1',
		attachmentMessage('m1', { filename: '../../other/account.png' }),
	)
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const path =
		'/documents/valenced/messagelogger/attachments/self/m1_a-.._.._other_account.png'
	assert.ok(h.disk.has(path))
	h.disk.set(
		'/documents/valenced/messagelogger/attachments/second/keep.png',
		'keep',
	)
	h.ui()
		.find(n => n.props?.text === 'Clear saved attachment files')
		.props.onPress()
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Clear files',
		)
		.props.onPress()
	await h.settle()
	assert.ok(!h.disk.has(path))
	assert.equal(
		h.disk.get('/documents/valenced/messagelogger/attachments/second/keep.png'),
		'keep',
	)
})

test('failed attachment deletion is reported and retried without losing file tracking', async t => {
	const config = {
		failRemovals: false,
		network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } },
	}
	const h = harness(t, { saveAttachments: true }, config)
	h.records.set('m1', attachmentMessage())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	const path =
		'/documents/valenced/messagelogger/attachments/self/m1_a-file.png'
	config.failRemovals = true
	h.menu()
		.find((n: any) => n.label === 'Remove History')
		.onPress()
	await h.settle()
	assert.ok(h.disk.has(path))
	assert.ok(
		h
			.ui()
			.some(n =>
				n.props?.subLabel?.includes('Could not save attachment files'),
			),
	)
	config.failRemovals = false
	h.ui()
		.find(n => n.props?.text === 'Retry attachment downloads')
		.props.onPress()
	await h.settle()
	assert.ok(!h.disk.has(path))
})

test('removing a saved entry clears its live edit history before later edits', async t => {
	const h = harness(t)
	h.records.set('m1', message())
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Second' },
	})
	await h.settle()
	openSaved(h)
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Remove saved entry',
		)
		.props.onPress()
	await h.settle()
	assert.equal(h.saved().length, 0)
	h.dispatch({
		type: 'MESSAGE_UPDATE',
		message: { id: 'm1', channel_id: 'c1', content: 'Third' },
	})
	await h.settle()
	assert.deepEqual(
		h.saved()[0].edits.map((e: any) => e.content),
		['Second'],
	)
})

test('clearing history removes unindexed files even with a corrupt attachment index', async t => {
	const folder = '/documents/valenced/messagelogger/attachments/self/'
	const disk = new Map([
		[`${folder}index.json`, 'corrupt'],
		[`${folder}orphan.png`, 'private file'],
		['/documents/valenced/messagelogger/attachments/second/keep.png', 'keep'],
	])
	const h = harness(t, {}, { disk })
	await h.settle()
	h.ui()
		.find(n => n.props?.text === 'Clear saved history for this account')
		.props.onPress()
	h.alerts
		.at(-1)
		.props.actions.props.children.find(
			(n: any) => n.props.text === 'Clear history',
		)
		.props.onPress()
	await h.settle()
	assert.ok(!disk.has(`${folder}orphan.png`))
	assert.equal(JSON.parse(disk.get(`${folder}index.json`)!).files.length, 0)
	assert.equal(
		disk.get('/documents/valenced/messagelogger/attachments/second/keep.png'),
		'keep',
	)
})

test('clearing history reports attachment cleanup failure and allows retry', async t => {
	const config = { failRemovals: true }
	const h = harness(t, {}, config)
	await h.settle()
	const path = '/documents/valenced/messagelogger/attachments/self/orphan.png'
	h.disk.set(path, 'private file')
	const clearHistory = () => {
		h.ui()
			.find(n => n.props?.text === 'Clear saved history for this account')
			.props.onPress()
		h.alerts
			.at(-1)
			.props.actions.props.children.find(
				(n: any) => n.props.text === 'Clear history',
			)
			.props.onPress()
	}
	clearHistory()
	await h.settle()
	assert.ok(h.disk.has(path))
	assert.ok(
		h.ui().some(n => n.props?.subLabel?.includes('Could not clear saved')),
	)
	config.failRemovals = false
	clearHistory()
	await h.settle()
	assert.ok(!h.disk.has(path))
})

test('an attachment is not advertised as saved until its index is written', async t => {
	const requests: any[] = []
	const config = {
		failIndex: false,
		requests,
		network: { [attachmentURL]: { bytes: [1, 2, 3, 4] } },
	}
	const h = harness(t, { saveAttachments: true }, config)
	await h.settle()
	config.failIndex = true
	h.records.set('m1', attachmentMessage())
	h.dispatch({ type: 'MESSAGE_DELETE', id: 'm1', channelId: 'c1' })
	await h.settle()
	assert.match(openSaved(h), /Disk full/)
	assert.doesNotMatch(openSaved(h), /Saved on this iPhone/)
	assert.ok(h.ui().some(n => n.props?.label === '0 saved files'))
	config.failIndex = false
	h.ui()
		.find(n => n.props?.text === 'Retry attachment downloads')
		.props.onPress()
	await h.settle()
	assert.match(openSaved(h), /Saved on this iPhone/)
	assert.ok(h.ui().some(n => n.props?.label === '1 saved files'))
	assert.equal(requests.length, 1)
	assert.equal(
		JSON.parse(
			h.disk.get(
				'/documents/valenced/messagelogger/attachments/self/index.json',
			)!,
		).files.length,
		1,
	)
})
