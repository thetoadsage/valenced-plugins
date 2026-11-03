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

function harness(t: any, settings: any = {}) {
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
					AuthenticationStore: { getId: () => 'self' },
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
		modules: {
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
				useState: (value: any) => [value, () => {}],
			},
			ReactJSXRuntime: { jsx, jsxs: jsx },
			ReactNative: { ScrollView: component, processColor: () => 0xffed4245 },
		},
	}
	Object.defineProperty(api.modules, 'native', {
		get() {
			throw new Error('Native API must not be used')
		},
	})
	const options = new Function('valenced', 'plugin', `return ${code}`)(
		api,
		(options: any) => options,
	).default
	const storage = {
		cache: { ...options.jsonStorage.default, ...settings },
		use() {
			return this.cache
		},
		set(values: any) {
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
		for (const cleanup of cleanups) cleanup()
	}
	t.after(() => {
		stop()
		assert.deepEqual(errors, [])
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
	return {
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

test('retains a deleted message and labels it without native methods', t => {
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
