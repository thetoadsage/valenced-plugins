type ItemSize = (section: number, item?: number) => number

interface FastListRef {
	current?: {
		state?: { fastListComputer?: { dirty: boolean } }
		forceUpdate?: () => void
	} | null
}

function isFastListRef(value: unknown): value is FastListRef {
	return typeof value === 'object' && value !== null && 'current' in value
}

export function createServerBarLayout() {
	let listRef: FastListRef | undefined
	let button: symbol | undefined
	let extraHeight = 0
	let stopped = false
	const sizeWrappers = new WeakMap<ItemSize, ItemSize>()

	function setHeight(height: number) {
		if (extraHeight === height) return
		extraHeight = height

		const list = listRef?.current
		const computer = list?.state?.fastListComputer
		if (computer && typeof list?.forceUpdate === 'function') {
			computer.dirty = true
			list.forceUpdate()
		}
	}

	return {
		patch<Args extends [unknown, unknown?, ...unknown[]]>(args: Args): Args {
			const props = args[1]
			if (
				typeof props !== 'object' ||
				props === null ||
				!('nativeID' in props) ||
				props.nativeID !== 'guilds-bar-fast-list' ||
				!('itemSize' in props) ||
				typeof props.itemSize !== 'function' ||
				!('ref' in props) ||
				!isFastListRef(props.ref)
			) {
				return args
			}

			listRef = props.ref
			const original = props.itemSize as ItemSize
			let itemSize = sizeWrappers.get(original)
			if (!itemSize) {
				itemSize = function (this: unknown, section, item) {
					const size = original.call(this, section, item)
					// FastList counts the DMs button as section 0, item 0.
					return section === 0 && (item ?? 0) === 0 ? size + extraHeight : size
				}
				sizeWrappers.set(original, itemSize)
			}
			args[1] = { ...props, itemSize }
			return args
		},
		measure(owner: symbol, height: number) {
			if (stopped || !Number.isFinite(height) || height <= 0) return
			button = owner
			setHeight(height)
		},
		release(owner: symbol) {
			if (button !== owner) return
			button = undefined
			setHeight(0)
		},
		stop() {
			stopped = true
			button = undefined
			setHeight(0)
			listRef = undefined
		},
	}
}
