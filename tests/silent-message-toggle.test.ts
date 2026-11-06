import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL(
		'../plugins/silent-message-toggle/build/js/index.js',
		import.meta.url,
	),
	'utf8',
)

function harness(settings: Record<string, boolean> = {}) {
	let channel = 'one'
	let channelHook: (payload: any) => any = value => value
	let renderHook: (tree: any) => any = tree => tree
	const messages = {
		sendMessage: (_channel: unknown, message: unknown) => message,
		editMessage() {},
	}
	const actions = { type: () => null }
	const jsx = (type: any, props: any, key?: string) => ({ type, props, key })
	const api = {
		discord: {
			flux: {
				Stores: { SelectedChannelStore: { getChannelId: () => channel } },
				onFluxEventDispatched: (_type: string, hook: typeof channelHook) => {
					channelHook = hook
					return () => {
						channelHook = value => value
					}
				},
			},
			design: { Design: {} },
			utils: {
				modules: {
					finders: {
						getModuleWithImportedPath: (
							_path: string,
							cb: (value: unknown) => void,
						) => {
							cb({ default: actions })
							return () => {}
						},
						lookupModuleWithImportedPath: () => [{ default: () => null }],
					},
				},
			},
		},
		modules: {
			finders: {
				filters: { withProps: () => null },
				getModules: (_filter: unknown, cb: (value: unknown) => void) => {
					cb(messages)
					return () => {}
				},
			},
		},
		patcher: {
			instead: (obj: any, key: string, hook: any) => {
				const original = obj[key]
				obj[key] = function (...args: unknown[]) {
					return hook.call(this, args, original)
				}
				return () => {
					obj[key] = original
				}
			},
			after: (_obj: unknown, _key: string, hook: typeof renderHook) => {
				renderHook = hook
				return () => {
					renderHook = tree => tree
				}
			},
		},
		utils: {
			react: { findInReactFiber: (tree: unknown) => tree },
			discord: { lookupGeneratedIconComponent: () => () => null },
		},
		components: {},
		react: {
			ReactNative: {},
			ReactJSXRuntime: { jsx, jsxs: jsx },
			React: {
				useState: (initial: any) => [
					typeof initial === 'function' ? initial() : initial,
					() => {},
				],
				useEffect: () => {},
			},
		},
	}
	const exports = runInNewContext(code, {
		valenced: api,
		plugin: (value: any) => value,
	})
	const storage = {
		cache: { ...exports.default.jsonStorage.default, ...settings },
	}
	const cleanup: (() => void)[] = []
	exports.default.start({
		jsonStorage: storage,
		cleanup: (...fns: (() => void)[]) => cleanup.push(...fns),
	})
	const tree = { props: { children: [] as any[] } }
	renderHook(tree)
	const toggle = () => tree.props.children[0].type().props.onPress()
	return {
		messages,
		storage,
		tree,
		render: () => renderHook(tree),
		toggle,
		select: (id: string) => {
			channelHook({ type: 'CHANNEL_SELECT', channelId: id })
			channel = id
		},
		stop: () => {
			for (const fn of cleanup.reverse()) fn()
		},
	}
}

test('button prefixes only the next message in the selected channel and cleans up', () => {
	const h = harness()
	h.render()
	assert.equal(h.tree.props.children.length, 1)
	h.toggle()
	assert.equal(
		(h.messages.sendMessage('other', { content: 'background' }) as any).content,
		'background',
	)
	assert.equal(
		(h.messages.sendMessage('one', { content: 'hello' }) as any).content,
		'@silent hello',
	)
	assert.equal(
		(h.messages.sendMessage('one', { content: 'again' }) as any).content,
		'again',
	)
	h.toggle()
	assert.equal(
		(h.messages.sendMessage('one', { content: '@silent already' }) as any)
			.content,
		'@silent already',
	)
	h.toggle()
	h.stop()
	assert.equal(
		(h.messages.sendMessage('one', { content: 'stopped' }) as any).content,
		'stopped',
	)
})

test('channel and automatic reset options follow the toggle settings', () => {
	const h = harness({ autoDisable: false })
	h.toggle()
	assert.equal(
		(h.messages.sendMessage('one', { content: 'first' }) as any).content,
		'@silent first',
	)
	assert.equal(
		(h.messages.sendMessage('one', { content: 'second' }) as any).content,
		'@silent second',
	)
	h.select('two')
	assert.equal(
		(h.messages.sendMessage('two', { content: 'normal' }) as any).content,
		'normal',
	)
	h.storage.cache.persistState = true
	h.toggle()
	h.select('three')
	assert.equal(
		(h.messages.sendMessage('three', { content: 'quiet' }) as any).content,
		'@silent quiet',
	)
	h.stop()
})
