import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL('../plugins/no-reply-mention/build/js/index.js', import.meta.url),
	'utf8',
)
function harness(settings: Record<string, unknown> = {}) {
	const hooks = new Map<string, (event: any) => any>()
	const api = {
		discord: {
			flux: {
				Stores: {
					GuildMemberStore: {
						getMember: (_guild: string, user: string) =>
							user === 'role-user' ? { roles: ['55'] } : null,
					},
					MessageStore: {
						getMessage: (_channel: string, id: string) =>
							id === 'cached' ? { author: { id: '123' } } : null,
					},
				},
				onFluxEventDispatched: (type: string, cb: (event: any) => any) => {
					hooks.set(type, cb)
					return () => hooks.delete(type)
				},
			},
			design: { Design: {} },
		},
		components: {},
		react: { ReactNative: {}, ReactJSXRuntime: {} },
	}
	const exports = runInNewContext(code, {
		valenced: api,
		plugin: (value: any) => value,
	})
	const cleanup: (() => void)[] = []
	const storage = {
		cache: { ...exports.default.jsonStorage.default, ...settings },
	}
	exports.default.start({
		jsonStorage: storage,
		cleanup: (...callbacks: (() => void)[]) => cleanup.push(...callbacks),
	})
	return { hooks, storage, stop: () => cleanup.forEach(fn => fn()) }
}

test('defaults replies to no mention while preserving manual toggle events and cleanup', () => {
	const h = harness()
	const event = {
		type: 'CREATE_PENDING_REPLY',
		channel: { id: 'c' },
		message: { author: { id: '123' } },
		shouldMention: true,
		showMentionToggle: true,
	}
	assert.equal(h.hooks.get(event.type)?.(event), event)
	assert.equal(event.shouldMention, false)
	assert.equal(h.hooks.has('SET_PENDING_REPLY_SHOULD_MENTION'), false)
	const hidden = { ...event, shouldMention: true, showMentionToggle: false }
	h.hooks.get(hidden.type)?.(hidden)
	assert.equal(hidden.shouldMention, true)
	h.stop()
	assert.equal(h.hooks.size, 0)
})

test('matches exact user and cached role IDs and supports both exception modes', () => {
	const h = harness({ userList: '1234, 123', roleList: '55' })
	const send = (id: string, shouldMention = true) =>
		h.hooks.get('CREATE_PENDING_REPLY')?.({
			type: 'CREATE_PENDING_REPLY',
			channel: { id: 'c', guild_id: 'g' },
			message: { author: { id } },
			shouldMention,
		}).shouldMention
	assert.equal(send('123'), true)
	assert.equal(send('12'), false)
	assert.equal(send('role-user'), true)
	assert.equal(send('123', false), false)
	h.storage.cache.pingListed = false
	assert.equal(send('role-user'), false)
	assert.equal(send('other'), true)
})

test('shallow replies consult the cached message and leave explicit no-mention intact', () => {
	const h = harness({ userList: '123' })
	const create = h.hooks.get('CREATE_SHALLOW_PENDING_REPLY')!
	assert.equal(
		create({
			type: 'CREATE_SHALLOW_PENDING_REPLY',
			channel: { id: 'c' },
			messageId: 'cached',
		}).shouldMention,
		true,
	)
	assert.equal(
		create({
			type: 'CREATE_SHALLOW_PENDING_REPLY',
			channel: { id: 'c' },
			messageId: 'missing',
		}).shouldMention,
		false,
	)
	assert.equal(
		create({
			type: 'CREATE_SHALLOW_PENDING_REPLY',
			channel: { id: 'c' },
			messageId: 'cached',
			shouldMention: false,
		}).shouldMention,
		false,
	)
})
