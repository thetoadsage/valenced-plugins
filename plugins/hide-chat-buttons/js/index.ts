import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import { findInReactFiber } from '@valenced/utils/react'
import { cloneElement, isValidElement } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

type MemoModule = {
	default: { type: (props: Record<string, unknown>) => ReactNode }
}
type ActionProps = { children?: ReactNode; sendVoiceMessageEnabled?: boolean }
type ActionsRef = { onDismissActions(): void; onShowActions(): void }
const VoiceButtonPath =
	'modules/voice_messages/native/components/VoiceMessageButton.tsx'
const ExpressionButtonPath =
	'modules/chat_input/native/accessories/ChatInputExpressionButton.tsx'
const EmojiSuggestionPath =
	'modules/chat_input/native/EmojiSuggestionChatButton.tsx'
let storage: JsonStorage<Settings>

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		let running = true
		const frames = new Set<number>()
		const refs = new Map<
			ActionsRef,
			{
				original: ActionsRef['onDismissActions']
				replacement: ActionsRef['onDismissActions']
			}
		>()
		cleanup(() => {
			running = false
			for (const frame of frames) cancelAnimationFrame(frame)
			for (const [current, { original, replacement }] of refs) {
				if (current.onDismissActions === replacement)
					current.onDismissActions = original
			}
			refs.clear()
		})
		for (const [path, setting] of [
			[
				'modules/chat_input/native/action_buttons/ChatInputActions.tsx',
				'hidePlus',
			],
			[VoiceButtonPath, 'hideMic'],
		] as const) {
			cleanup(
				getModuleWithImportedPath<MemoModule>(path, module => {
					if (typeof module?.default?.type !== 'function') return
					cleanup(
						after(module.default, 'type', tree =>
							storage.cache?.[setting] ? null : tree,
						),
					)
				}),
			)
		}
		cleanup(
			getModuleWithImportedPath<MemoModule>(
				'modules/chat_input/native/accessories/ChatInputSendButton.tsx',
				module => {
					if (typeof module?.default?.type !== 'function') return
					cleanup(
						after(module.default, 'type', tree => {
							if (!storage.cache?.hideMic || !isValidElement<ActionProps>(tree))
								return tree
							// Discord 352 reserves a whole slot for the mic, but reuses it to send text.
							if (tree.props.sendVoiceMessageEnabled === true) return null
							const transition = findInReactFiber(
								tree,
								(
									node,
								): node is {
									props: {
										items: Array<{
											sendVoiceMessageEnabled?: boolean
											sendEnabled?: boolean
										}>
									}
								} => Array.isArray(node.props?.items),
							)
							const items = transition?.props.items
							if (
								items?.length &&
								items.every(
									item =>
										item?.sendVoiceMessageEnabled === true &&
										item.sendEnabled === false,
								)
							)
								return null
							const voice =
								lookupModuleWithImportedPath<MemoModule>(VoiceButtonPath)[0]
									?.default
							if (
								voice &&
								isValidElement(tree.props.children) &&
								(tree.props.children.type as unknown) === voice
							)
								return null
							return tree
						}),
					)
				},
			),
		)
		cleanup(
			getModuleWithImportedPath<MemoModule>(
				'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx',
				module => {
					if (typeof module?.default?.type !== 'function') return
					cleanup(
						before(module.default, 'type', args => {
							const ref = args[0]?.ref as
								| { current?: ActionsRef | null }
								| undefined
							if (storage.cache?.keepActionsVisible && ref) {
								const frame = requestAnimationFrame(() => {
									frames.delete(frame)
									const current = ref.current
									if (
										!running ||
										!storage.cache?.keepActionsVisible ||
										!current ||
										typeof current.onDismissActions !== 'function' ||
										typeof current.onShowActions !== 'function'
									)
										return
									if (
										refs.get(current)?.replacement === current.onDismissActions
									)
										return
									const original = current.onDismissActions
									const replacement = () =>
										(storage.cache?.keepActionsVisible
											? current.onShowActions
											: original
										).call(current)
									refs.set(current, { original, replacement })
									current.onDismissActions = replacement
								})
								frames.add(frame)
							}
							if (!storage.cache?.hideGift) return args
							return [{ ...args[0], shouldShowGiftButton: false }]
						}),
					)
					cleanup(
						after(module.default, 'type', tree => {
							if (
								!storage.cache?.hideEmoji ||
								!isValidElement<ActionProps>(tree) ||
								!Array.isArray(tree.props.children)
							)
								return tree
							const children = tree.props.children
							const expression =
								lookupModuleWithImportedPath<MemoModule>(
									ExpressionButtonPath,
								)[0]?.default
							const suggestion = lookupModuleWithImportedPath<{
								EmojiSuggestionChatButton?: unknown
							}>(EmojiSuggestionPath)[0]?.EmojiSuggestionChatButton
							const next = children.map(child =>
								isValidElement(child) &&
								((expression && (child.type as unknown) === expression) ||
									(suggestion && child.type === suggestion))
									? null
									: child,
							)
							if (next.every((child, i) => child === children[i])) return tree
							return cloneElement(
								tree as ReactElement<ActionProps>,
								undefined,
								...next,
							)
						}),
					)
				},
			),
		)
	},
	SettingsComponent,
})
