import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { findInReactFiber } from '@valenced/utils/react'
import { useEffect, useState } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'
import type { Settings } from './shared'

const RightActionsPath =
	'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx'
const ButtonPath =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'
type ButtonModule = {
	default: FC<{
		accessibilityLabel: string
		accessibilityState: { checked: boolean }
		IconComponent: NonNullable<ReturnType<typeof lookupGeneratedIconComponent>>
		onPress(): void
	}>
}
type MessagesModule = {
	sendMessage: (...args: unknown[]) => unknown
	editMessage: (...args: unknown[]) => unknown
}

let storage: JsonStorage<Settings>
let enabled = false
let running = false
let enabledChannel: string | undefined
const listeners = new Set<() => void>()
const settings = () => ({ ...DefaultSettings, ...storage.cache })
const currentChannel = () =>
	(
		Stores.SelectedChannelStore as unknown as {
			getChannelId?: () => string | null
		}
	)?.getChannelId?.() ?? undefined
function setEnabled(value: boolean) {
	enabled = value
	enabledChannel = value ? currentChannel() : undefined
	for (const listener of listeners) listener()
}

const button = <SilentButton key="silent-message-toggle" />

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage }) {
		storage = jsonStorage
		running = true
		setEnabled(false)
		const patched = new WeakSet<object>()
		cleanup(
			onFluxEventDispatched<{ channelId?: string | null }>(
				'CHANNEL_SELECT',
				payload => {
					if (enabled && payload.channelId !== enabledChannel) {
						if (settings().persistState)
							enabledChannel = payload.channelId ?? undefined
						else setEnabled(false)
					}
					return payload
				},
			),
			getModules(
				withProps<MessagesModule>('sendMessage', 'editMessage'),
				messages => {
					if (patched.has(messages)) return
					patched.add(messages)
					cleanup(
						instead(messages, 'sendMessage', function (args, original) {
							const [channelId, message] = args
							if (
								enabled &&
								typeof channelId === 'string' &&
								channelId === currentChannel() &&
								message &&
								typeof message === 'object' &&
								'content' in message &&
								typeof message.content === 'string'
							) {
								if (!message.content.startsWith('@silent '))
									args[1] = {
										...message,
										content: `@silent ${message.content}`,
									}
								if (settings().autoDisable) setEnabled(false)
							}
							return original.apply(this, args)
						}),
					)
				},
			),
			getModuleWithImportedPath<{ default: MemoExoticComponent<FC> }>(
				RightActionsPath,
				({ default: actions }) =>
					cleanup(
						after(actions, 'type', tree => {
							const node = findInReactFiber(
								tree as ReactElement,
								(node): node is { props: { children: ReactNode[] } } =>
									Array.isArray(node.props?.children),
							)
							if (node) {
								const children = node.props.children
								const index = children.indexOf(button)
								if (index !== -1) children.splice(index, 1)
								children.unshift(button)
							}
							return tree
						}),
					),
			),
			() => {
				running = false
				setEnabled(false)
			},
		)
	},
	SettingsComponent,
})

function SilentButton() {
	const [active, setActive] = useState(enabled)
	const [visible, setVisible] = useState(running)
	const [Button, setButton] = useState(
		() => lookupModuleWithImportedPath<ButtonModule>(ButtonPath)[0]?.default,
	)
	useEffect(() => {
		const update = () => {
			setActive(enabled)
			setVisible(running)
		}
		listeners.add(update)
		update()
		return () => {
			listeners.delete(update)
		}
	}, [])
	useEffect(() => {
		if (Button) return
		return getModuleWithImportedPath<ButtonModule>(
			ButtonPath,
			({ default: component }) => setButton(() => component),
		)
	}, [Button])
	const Icon = lookupGeneratedIconComponent(
		active ? 'BellZIcon' : 'BellSlashIcon',
	)
	if (!visible || !Button || !Icon) return null
	return (
		<Button
			accessibilityLabel={
				active ? 'Disable silent message' : 'Enable silent message'
			}
			accessibilityState={{ checked: active }}
			IconComponent={Icon}
			onPress={() => setEnabled(!enabled)}
		/>
	)
}
