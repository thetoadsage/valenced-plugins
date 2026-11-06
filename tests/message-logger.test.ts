import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

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
			if (failWrites) throw Error('Disk full')
			disk.set(path, value)
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
	const component = () => null
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
					content: [{ type: 'text', content: record.content }],
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
	const dispatch = (input: any) => {
		let payload = input
		for (const listener of listeners.get(input.type) ?? []) {
			payload = listener(payload)
			if (!payload) return
		}
		const data = payload.message
		switch (payload.type) {
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
				break
			case 'MESSAGE_DELETE_BULK':
				for (const id of payload.ids) records.delete(id)
				break
		}
	}
	const api: any = {
		discord: {
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
					},
					AuthenticationStore: { getId: () => account },
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
				AppState: { addEventListener: () => ({ remove() {} }) },
				processColor: () => 0xffed4245,
			},
		},
	}

	const options = new Function('valenced', 'plugin', `return ${code}`)(
		api,
		(options: any) => options,
	).default
	const storage = {
		cache: { ...options.jsonStorage.default, ...settings },
		use() {
			return this.cache
		},
		async set(values: any) {
			Object.assign(this.cache, values)
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
	const text = (id = 'm1') =>
		row(id)
			.message.content.map((n: any) => n.content)
			.join('')
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
		JSON.parse(disk.get(`/plugin-data/archive-${id}.json`) ?? '{"entries":[]}')
			.entries
	const ui = () => {
		hookIndex = 0
		const tree = options.SettingsComponent({ api: { jsonStorage: storage } })
		const nodes: any[] = []
		const walk = (node: any) => {
			if (!node) return
			if (Array.isArray(node)) return node.forEach(walk)
			nodes.push(node)
			walk(node.props?.children)
		}
		walk(tree)
		return nodes
	}
	return {
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
		h.text(),
		'[Previous version] \n[Previous version] Second\nThird',
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
	assert.match(h.alerts[0].props.content, /Original text/)
	assert.match(h.alerts[0].props.content, /Updated/)
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
	assert.match(
		reopened.alerts[0].props.content.props.children.props.children,
		/Original/,
	)
	assert.match(
		reopened.alerts[0].props.content.props.children.props.children,
		/Updated/,
	)
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
		JSON.parse(h.disk.get('/plugin-data/archive-self.json.bak')!).entries
			.length,
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
		Buffer.byteLength(h.disk.get('/plugin-data/archive-self.json')!) <=
			1024 * 1024,
	)
	assert.ok(h.saved().length < 20)
	const data = JSON.parse(h.disk.get('/plugin-data/archive-self.json')!)
	data.entries[0].savedAt = Date.now() - 40 * 86400000
	h.disk.set('/plugin-data/archive-self.json', JSON.stringify(data))
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
	h.disk.set('/plugin-data/archive-self.json', 'broken')
	const next = harness(t, {}, { disk: h.disk })
	await next.settle()
	assert.equal(next.saved().length, 1)
	next.stop()
	h.disk.set('/plugin-data/archive-self.json', 'broken')
	h.disk.set('/plugin-data/archive-self.json.bak', 'also broken')
	const damaged = harness(t, {}, { disk: h.disk, allowErrors: true })
	await damaged.settle()
	assert.match(damaged.errors[0], /preserved/)
	assert.equal(h.disk.get('/plugin-data/archive-self.json'), 'broken')
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
		h.ui().find(n => n.props?.label === 'Maximum saved messages (1–10000)')
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
	const raw = h.disk.get('/plugin-data/archive-self.json')!
	assert.ok(!/secret|private|renderState/.test(raw))
	assert.equal(h.saved()[0].message.attachments[0].filename, 'file.png')
})

test('wrong-account archive is rejected and can be explicitly cleared', async t => {
	const disk = new Map([
		[
			'/plugin-data/archive-self.json',
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
		JSON.parse(disk.get('/plugin-data/archive-self.json')!).account,
		'self',
	)
})
