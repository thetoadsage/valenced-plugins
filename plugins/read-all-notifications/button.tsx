import { Design } from '@valenced/discord/design'
import { StyleSheet, View } from 'react-native'
import { markAllAsRead } from './unread'
import type { ComponentType } from 'react'

const { ImageButton } = Design

const Checkmark = {
	uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAACR0lEQVR4nO2aPW7CQBBG5wI0dHRIUSR6Gk5AwwlocgIaitQ0nIDGJ6DhBDScAIp0aRBFbkCRgmqzY9aY/Nhee8fYm/2eNBKyQOw87SwfBiIAAAAAAAAAAAAA4Amvug66LqYO5lrwPNFVhsqog3lOkHR1velSvV5PRVGkjsdjXPyYr1EqKUh2ulS/34+l/ISv3UkKbtw2ulSn01H7/f6XnATeSRTgLorInDHb7TZTTrKLzHMvzS75cSzJyFmv17lyQhQ0JyNntVoVygltxF7IyFksFlZyTqdTMIf0hIyc2WxmJed8PqvhcBjE7hnp+tSlptOplRxmPB4ncj50PTfaQY1wY9xg3LAtLJKucljsqNEOauSWknlUeGRs4BGk9GvGpNEOauaWkvmwtYEPb0rlvDS7/HqxSsn38Mc+pXLmj1zso28jWKfkBA6MlMpZ1ri2bzRxG6FUSmZY4t2aIuH15BLLKbiN8E5ykkqnZB4/HkPzuo3QOqzgEYpFZN1GGAwGkpIqpWQ+wM3rdo7vX5p49/BuyUJQkmtK5ijQlWi6DHwY/7l7hCV5m5KtBDlK8jolF46YoyTvU3LuIS0g6V+k5HgXcdPCkrxKyXlwc9ykpCRvUrItkpK8SsllkJLkTUqugoQkb1JyVZwk+ZSSXagsyZY2pGRXKkmyoS0pWQJxSW1KyVKISWpjSpbCWVJbU7IklSW1PSVLUlqSLylZEmtJvqVkSQol8TUfU7IkN0kFv4h4l5IlwV9zLcGfuwEAAAAAAAAAAACa5QsWf2b39Pg+FgAAAABJRU5ErkJggg==',
	width: 24,
	height: 24,
}

const EntryComponentName = 'GuildsBarAnimatedItemWrapper'
const DirectMessagesLabel = 'Direct Messages'

type EntryProps = Record<string, unknown>
type EntryComponent = ComponentType<EntryProps>

interface ComponentLike {
	displayName?: unknown
	name?: unknown
	type?: unknown
	render?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isComponent(value: unknown): value is EntryComponent {
	return typeof value === 'function' || isRecord(value)
}

function getComponentName(type: unknown): string | undefined {
	if (!isComponent(type)) return undefined

	const { displayName, name, type: inner, render } = type as ComponentLike
	if (typeof displayName === 'string' && displayName) return displayName
	if (typeof name === 'string' && name) return name

	return getComponentName(inner) ?? getComponentName(render)
}

function ReadAllButton() {
	return (
		<View style={styles.container}>
			<ImageButton
				accessibilityLabel="Mark all as read"
				accessibilityRole="button"
				variant="secondary"
				size="md"
				image={Checkmark}
				onPress={markAllAsRead}
			/>
		</View>
	)
}

export function createDirectMessagesEntryPatcher() {
	const wrappers = new WeakMap<object, EntryComponent>()
	const wrapperTypes = new WeakSet<object>()
	let renderingWrapper = false

	function wrap(Original: EntryComponent): EntryComponent {
		const existing = wrappers.get(Original)
		if (existing) return existing

		function ReadAllDmWrapper(props: EntryProps) {
			renderingWrapper = true
			try {
				return (
					<>
						<Original {...props} />
						<ReadAllButton />
					</>
				)
			} finally {
				renderingWrapper = false
			}
		}

		wrappers.set(Original, ReadAllDmWrapper)
		wrapperTypes.add(ReadAllDmWrapper)
		return ReadAllDmWrapper
	}

	function isDirectMessagesEntry(
		type: unknown,
		props: unknown,
	): type is EntryComponent {
		return (
			!renderingWrapper &&
			isComponent(type) &&
			!wrapperTypes.has(type) &&
			isRecord(props) &&
			props.label === DirectMessagesLabel &&
			getComponentName(type) === EntryComponentName
		)
	}

	return function patchEntry<Args extends [unknown, unknown?, ...unknown[]]>(
		args: Args,
	): Args {
		const [type, props] = args
		if (isDirectMessagesEntry(type, props)) args[0] = wrap(type)
		return args
	}
}

const styles = StyleSheet.create({
	container: {
		alignItems: 'center',
		marginBottom: 2,
		marginTop: 6,
	},
})
