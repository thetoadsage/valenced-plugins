import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL('../plugins/hide-chat-buttons/build/js/index.js', import.meta.url),
	'utf8',
)

function harness() {
	const original = { type: 'view', props: { children: ['gift', 'emoji'] } }
	const plus = { type: () => 'plus' as any }
	const mic = { type: () => 'mic' as any }
	const right = { type: () => original as any }
	const modules: Record<string, any> = {
		'modules/chat_input/native/action_buttons/ChatInputActions.tsx': {
			default: plus,
		},
		'modules/voice_messages/native/components/VoiceMessageButton.tsx': {
			default: mic,
		},
		'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx': {
			default: right,
		},
	}
	const api = {
		discord: {
			design: { Design: {} },
			utils: {
				modules: {
					finders: {
						getModuleWithImportedPath: (
							path: string,
							callback: (module: any) => void,
						) => {
							callback(modules[path])
							return () => {}
						},
					},
				},
			},
		},
		patcher: {
			after: (obj: any, key: string, hook: (tree: any) => any) => {
				const previous = obj[key]
				obj[key] = (...args: any[]) => hook(previous(...args))
				return () => {
					obj[key] = previous
				}
			},
		},
		components: {},
		react: {
			ReactNative: {},
			ReactJSXRuntime: {},
			React: {
				isValidElement: (value: any) => !!value?.props,
				cloneElement: (element: any, _props: any, ...children: any[]) => ({
					...element,
					props: { ...element.props, children },
				}),
			},
		},
	}
	const exports = runInNewContext(code, {
		valenced: api,
		plugin: (value: any) => value,
	})
	const storage = { cache: { ...exports.default.jsonStorage.default } }
	const cleanup: (() => void)[] = []
	exports.default.start({
		jsonStorage: storage,
		cleanup: (...fns: (() => void)[]) => cleanup.push(...fns),
	})
	return {
		plus,
		mic,
		right,
		original,
		storage,
		stop: () => cleanup.reverse().forEach(fn => fn()),
	}
}

test('each setting hides only its selected button and disabling restores the originals', () => {
	const h = harness()
	assert.equal(h.plus.type(), 'plus')
	assert.equal(h.mic.type(), 'mic')
	assert.equal(h.right.type(), h.original)
	h.storage.cache.hidePlus = true
	h.storage.cache.hideMic = true
	assert.equal(h.plus.type(), null)
	assert.equal(h.mic.type(), null)
	h.storage.cache.hideGift = true
	assert.deepEqual(Array.from(h.right.type().props.children), [null, 'emoji'])
	h.storage.cache.hideGift = false
	h.storage.cache.hideEmoji = true
	assert.deepEqual(Array.from(h.right.type().props.children), ['gift', null])
	h.storage.cache.hideGift = true
	assert.deepEqual(Array.from(h.right.type().props.children), [null, null])
	assert.deepEqual(h.original.props.children, ['gift', 'emoji'])
	h.stop()
	assert.equal(h.plus.type(), 'plus')
	assert.equal(h.mic.type(), 'mic')
	assert.equal(h.right.type(), h.original)
})

test('preserves a preceding silent-message button and leaves unexpected trees alone', () => {
	const h = harness()
	h.original.props.children.unshift('silent')
	h.storage.cache.hideGift = true
	h.storage.cache.hideEmoji = true
	assert.deepEqual(Array.from(h.right.type().props.children), [
		'silent',
		null,
		null,
	])
	h.original.props.children = ['unexpected']
	assert.equal(h.right.type(), h.original)
	h.stop()
})
