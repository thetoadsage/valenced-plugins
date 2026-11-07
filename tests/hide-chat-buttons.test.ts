import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL('../plugins/hide-chat-buttons/build/js/index.js', import.meta.url),
	'utf8',
)

function harness() {
	let frameId = 0
	const frames = new Map<number, () => void>()
	const expression = { type: () => null }
	const suggestion = () => null
	const gift = { type: 'gift', props: {} }
	const emoji = { type: expression, props: {} }
	const silent = { type: 'silent', props: {} }
	const extra = { type: 'other-plugin', props: {} }
	const props = { shouldShowGiftButton: true }
	const plus = { type: () => 'plus' as any }
	const mic = { type: () => 'mic' as any }
	const right = {
		type: (options: typeof props) => ({
			type: 'view',
			props: {
				children: [
					silent,
					options.shouldShowGiftButton ? gift : null,
					emoji,
					extra,
				],
			},
		}),
	}
	const send = { type: (tree: any) => tree }
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
		'modules/chat_input/native/accessories/ChatInputSendButton.tsx': {
			default: send,
		},
		'modules/chat_input/native/accessories/ChatInputExpressionButton.tsx': {
			default: expression,
		},
		'modules/chat_input/native/EmojiSuggestionChatButton.tsx': {
			EmojiSuggestionChatButton: suggestion,
		},
	}
	const api = {
		discord: {
			design: { Design: {} },
			utils: {
				modules: {
					finders: {
						lookupModuleWithImportedPath: (path: string) => [modules[path]],
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
			before: (obj: any, key: string, hook: (args: any[]) => any[]) => {
				const previous = obj[key]
				obj[key] = (...args: any[]) => previous(...hook(args))
				return () => {
					obj[key] = previous
				}
			},
			after: (obj: any, key: string, hook: (tree: any) => any) => {
				const previous = obj[key]
				obj[key] = (...args: any[]) => hook(previous(...args))
				return () => {
					obj[key] = previous
				}
			},
		},
		components: {},
		utils: {
			react: {
				findInReactFiber: (tree: any, predicate: (x: any) => boolean): any => {
					if (!tree || typeof tree !== 'object') return undefined
					if (predicate(tree)) return tree
					for (const value of Array.isArray(tree)
						? tree
						: [tree.props, tree.children]) {
						const found = api.utils.react.findInReactFiber(value, predicate)
						if (found) return found
					}
				},
			},
		},
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
		requestAnimationFrame: (callback: () => void) => {
			const id = ++frameId
			frames.set(id, callback)
			return id
		},
		cancelAnimationFrame: (id: number) => frames.delete(id),
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
		send,
		right,
		props,
		gift,
		emoji,
		silent,
		extra,
		modules,
		suggestion,
		flushFrames: () => {
			for (const [id, callback] of frames) {
				frames.delete(id)
				callback()
			}
		},
		frames,
		storage,
		stop: () => cleanup.reverse().forEach(fn => fn()),
	}
}

test('each setting hides only its selected button and disabling restores the originals', () => {
	const h = harness()
	assert.equal(h.plus.type(), 'plus')
	assert.equal(h.mic.type(), 'mic')
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		h.gift,
		h.emoji,
		h.extra,
	])
	h.storage.cache.hidePlus = true
	h.storage.cache.hideMic = true
	assert.equal(h.plus.type(), null)
	assert.equal(h.mic.type(), null)
	h.storage.cache.hideGift = true
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		null,
		h.emoji,
		h.extra,
	])
	assert.equal(h.props.shouldShowGiftButton, true)
	h.storage.cache.hideGift = false
	h.storage.cache.hideEmoji = true
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		h.gift,
		null,
		h.extra,
	])
	h.storage.cache.hideGift = true
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		null,
		null,
		h.extra,
	])
	assert.equal(
		h.right.type({ shouldShowGiftButton: false }).props.children[1],
		null,
	)
	h.stop()
	assert.equal(h.plus.type(), 'plus')
	assert.equal(h.mic.type(), 'mic')
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		h.gift,
		h.emoji,
		h.extra,
	])
})

test('optional action visibility restores original behavior and cancels pending callbacks', () => {
	const h = harness()
	let shown = 0
	let dismissed = 0
	const ref = {
		current: {
			onDismissActions() {
				dismissed++
			},
			onShowActions() {
				shown++
			},
		},
	}
	const original = ref.current.onDismissActions
	const props = { ...h.props, ref }
	h.right.type(props)
	assert.equal(h.frames.size, 0)
	h.storage.cache.keepActionsVisible = true
	h.right.type(props)
	h.flushFrames()
	ref.current.onDismissActions()
	assert.equal(shown, 1)
	assert.equal(dismissed, 0)
	const replacement = ref.current.onDismissActions
	h.right.type(props)
	h.flushFrames()
	assert.equal(ref.current.onDismissActions, replacement)
	h.storage.cache.keepActionsVisible = false
	ref.current.onDismissActions()
	assert.equal(dismissed, 1)
	h.storage.cache.keepActionsVisible = true
	h.right.type(props)
	assert.equal(h.frames.size, 1)
	h.stop()
	assert.equal(h.frames.size, 0)
	assert.equal(ref.current.onDismissActions, original)
	ref.current.onDismissActions()
	assert.equal(dismissed, 2)
})

test('removes the microphone slot while retaining the send button', () => {
	const h = harness()
	const voiceSlot = { props: { sendVoiceMessageEnabled: true } }
	const sendSlot = { props: { sendVoiceMessageEnabled: false } }
	const otherSlot = { props: {} }
	const oldVoiceSlot = { props: { children: { type: h.mic, props: {} } } }
	assert.equal(h.send.type(voiceSlot), voiceSlot)
	h.storage.cache.hideMic = true
	assert.equal(h.send.type(voiceSlot), null)
	assert.equal(h.send.type(oldVoiceSlot), null)
	assert.equal(h.send.type(sendSlot), sendSlot)
	assert.equal(h.send.type(otherSlot), otherSlot)
	const item = (voice: boolean, send: boolean) => ({
		sendVoiceMessageEnabled: voice,
		sendEnabled: send,
	})
	const transition = (items: unknown[]) => ({
		props: { children: { props: { items } } },
	})
	const voiceTransition = transition([item(true, false)])
	const sendTransition = transition([item(true, false), item(false, true)])
	const emptyTransition = transition([])
	assert.equal(h.send.type(voiceTransition), null)
	assert.equal(h.send.type(sendTransition), sendTransition)
	assert.equal(h.send.type(emptyTransition), emptyTransition)
	h.stop()
	assert.equal(h.send.type(voiceSlot), voiceSlot)
})

test('hides suggested emoji and leaves unknown components alone', () => {
	const h = harness()
	h.storage.cache.hideEmoji = true
	const oldEmoji = h.emoji.type
	h.emoji.type = h.suggestion as any
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		h.gift,
		null,
		h.extra,
	])
	h.emoji.type = oldEmoji
	h.modules[
		'modules/chat_input/native/accessories/ChatInputExpressionButton.tsx'
	] = undefined
	assert.deepEqual(Array.from(h.right.type(h.props).props.children), [
		h.silent,
		h.gift,
		h.emoji,
		h.extra,
	])
	h.stop()
})
