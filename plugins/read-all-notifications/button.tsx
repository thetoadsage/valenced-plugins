import { Design } from '@valenced/discord/design'
import { StyleSheet, View } from 'react-native'
import { markAllAsRead } from './unread'
import type { ComponentType } from 'react'

const { ImageButton } = Design

const Checkmark = {
	uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAAXNSR0IArs4c6QAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAASKADAAQAAAABAAAASAAAAACz+WTVAAADIklEQVR4Ae2YO24UQRCGvWBjXwAJESA5ICBDnIAciYgbEBA4ROIGEJGYHIkAicAS7zcpnICEgAhBSEyG+Qq2rV5rqqbWO+uZWf6SfvW4a7q76pvu2hmvrclEQAREQAREQAREQAREQAREQAREQAREQAREQAREQAREQAQGQWAyiCjmDGJ/f3+dIdfRZfQD3ZtMJt9oZcDZQI9RbT/5Y/u/pwMEg/O0JlNd7y4DkG3VURggThHoHrrqBHzW6Z/pZp7VO54GBz1Hke3MkGj4g8GrdzxJyuC8iMjgs5oUngb8TXDKtEs5ng3PqNsuot9EL0sWTms1aSNa2fzoiTPeuu3ojssI2uC8tugDe4YvA8cr7GXq1uM5KHpEbXDelOid1mqSFW7X8Ee/emXa1uPpLtCHg6i30NsSvdNaTeoKTrgD+2DgrknS9sTfOVBKt9WkNjhW2O34RWY7ZzxwjBoB34oywmc1adMl/G+OzCtBN3AIZhvtoj20g8Kf0ijwjI/5PyDPrCYNCs45ArJvnNq6Ie/QYqGH9WLVtdWkDJzM+1I3x4qA7lYB1pdLg8Qil9CvejGurSZtOUz/duPPvkx2A8dWZdFHyLO5IDHJNfQJfUZ3kJswPoNkO+k9spoUJoU/8zI5V7zRwzjwsfANFFlqUSa40jBJ6644CCS4YN5+4FhMLL6ODEJkrZAY7P1sLwSJeQ3Oqyg4fK3xBfzbXSxg7yULQWL8R+TZkSAxmcFp+wxZLpyCj0AWgsT4myiyuSAx0XDgdAGJhDJHNQVpCqftG+14dk6BU1qCO/JOSo4NIQ0aTt+QgJP5gO1n5xQ4pU3uhsZgk2NndtKo4Bw3pCkcAxZZ48MosfbWEvFx1KRxwilPJQnpfrm/bpNjx7dz6iTtOpHob+45fXhccqwHaJjHqinJZKLnFxh7GNK44JTEg530Bd+Jcl9TG4xdDTgl6WmiD2jtWJl9RReLP2q5r63oj3PnNCVNsmfQBXSyye/1BZBWB46XfLYfSPbtZv9U+z7VbevLjtd9IiACIiACIiACIiACIiACIiACIiACIiACIiACItAfgT+IwMxg5Fl33AAAAABJRU5ErkJggg==',
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
