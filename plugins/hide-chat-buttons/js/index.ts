import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

type MemoModule = { default: { type: (...args: never[]) => ReactNode } }
type ActionProps = { children?: ReactNode }
let storage: JsonStorage<Settings>

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		for (const [path, setting] of [
			[
				'modules/chat_input/native/action_buttons/ChatInputActions.tsx',
				'hidePlus',
			],
			[
				'modules/voice_messages/native/components/VoiceMessageButton.tsx',
				'hideMic',
			],
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
				'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx',
				module => {
					if (typeof module?.default?.type !== 'function') return
					cleanup(
						after(module.default, 'type', tree => {
							if (
								!isValidElement<ActionProps>(tree) ||
								!Array.isArray(tree.props.children)
							)
								return tree
							const children = tree.props.children
							if (children.length < 2) return tree
							const { hideGift, hideEmoji } = {
								...DefaultSettings,
								...storage.cache,
							}
							if (!hideGift && !hideEmoji) return tree
							// Discord 352 renders gift and expression as the final two slots.
							const next = children.slice()
							if (hideGift) next[next.length - 2] = null
							if (hideEmoji) next[next.length - 1] = null
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
