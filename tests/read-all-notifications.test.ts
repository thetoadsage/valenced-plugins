import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL(
		'../plugins/read-all-notifications/build/js/index.js',
		import.meta.url,
	),
	'utf8',
)

function harness(startedLate = false) {
	type Element = { type: unknown; props: Record<string, unknown> }
	type Hook = (
		args: [unknown, Record<string, unknown>],
	) => [unknown, Record<string, unknown>]
	const hooks = new Map<string, Hook>()
	const cleanup: (() => void)[] = []
	const unmount: (() => void)[] = []
	let reloads = 0
	const plugin = { startedLate, requireReload: () => reloads++ }

	function jsxFor(name: string) {
		return (type: unknown, props: Record<string, unknown>): Element => {
			const [nextType, nextProps] = hooks.get(name)?.([type, props]) ?? [
				type,
				props,
			]
			return { type: nextType, props: nextProps }
		}
	}

	const jsx = jsxFor('jsx')
	const jsxs = jsxFor('jsxs')
	const { default: entry } = runInNewContext(code, {
		plugin: (value: unknown) => value,
		valenced: {
			discord: { design: { Design: { ImageButton: 'ImageButton' } } },
			patcher: {
				before: (_runtime: unknown, name: string, hook: Hook) => {
					hooks.set(name, hook)
					return () => hooks.delete(name)
				},
			},
			react: {
				ReactJSXRuntime: { jsx, jsxs, Fragment: 'Fragment' },
				React: {
					useState: (initial: () => unknown) => [initial()],
					useEffect: (effect: () => () => void) => unmount.push(effect()),
				},
				ReactNative: {
					View: 'View',
					StyleSheet: { create: (v: unknown) => v },
				},
			},
		},
	})

	entry.start({
		plugin,
		cleanup: (...callbacks: (() => void)[]) => cleanup.push(...callbacks),
	})
	return {
		jsx,
		jsxs,
		unmount: () => unmount.splice(0).forEach(callback => callback()),
		stop: () => {
			cleanup.splice(0).forEach(callback => callback())
			entry.stop({ plugin })
		},
		get reloads() {
			return reloads
		},
	}
}

test('uses the measured button height to restore server gesture targeting', () => {
	const h = harness()
	const itemSize = () => 52
	const computer = { dirty: false }
	let dmSize = 52
	let refreshes = 0
	const ref = {
		current: {
			state: { fastListComputer: computer },
			forceUpdate() {
				assert.equal(computer.dirty, true)
				dmSize = size(0, 0)
				computer.dirty = false
				refreshes++
			},
		},
	}
	const props = { nativeID: 'guilds-bar-fast-list', itemSize, ref }
	const size = h.jsx('FastList', props).props.itemSize as (
		section: number,
		item: number,
	) => number
	assert.equal(h.jsxs('FastList', props).props.itemSize, size)
	assert.equal(
		h.jsx('FastList', { ...props, nativeID: 'other' }).props.itemSize,
		itemSize,
	)

	const original = () => null
	original.displayName = 'GuildsBarAnimatedItemWrapper'
	const dm = h.jsx(original, { label: 'Direct Messages' })
	const wrapper = (dm.type as (props: unknown) => ReturnType<typeof h.jsx>)(
		dm.props,
	)
	const [dmButton, readAll] = wrapper.props.children as (typeof dm)[]
	assert.equal(dmButton.type, original)
	const button = (readAll.type as (props: unknown) => typeof dm)(readAll.props)
	const imageButton = button.props.children as typeof dm
	assert.equal(imageButton.type, 'ImageButton')
	assert.match(
		(imageButton.props.image as { uri: string }).uri,
		/^data:image\/png;base64,/,
	)

	const holdServer = (y: number) => Math.floor((y - dmSize) / size(1, 0))
	const onLayout = button.props.onLayout as (event: unknown) => void
	const measure = (height: number) =>
		onLayout({ nativeEvent: { layout: { height } } })
	const firstServerCenter = 52 + 48 + 26
	assert.equal(holdServer(firstServerCenter), 1)
	measure(40)
	assert.equal(holdServer(firstServerCenter), 0)
	assert.equal(size(0, 1), 52)
	assert.equal(size(1, 0), 52)
	measure(40)
	assert.equal(refreshes, 1)
	measure(36)
	assert.equal(dmSize, 96)
	h.unmount()
	assert.equal(dmSize, 52)
	measure(40)
	h.stop()
	measure(40)
	assert.equal(dmSize, 52)
	assert.equal(h.jsx('FastList', props).props.itemSize, itemSize)
	assert.equal(h.reloads, 1)
})

test('defers changing the mounted server bar until Discord restarts', () => {
	const h = harness(true)
	assert.equal(h.reloads, 1)
	const original = () => null
	original.displayName = 'GuildsBarAnimatedItemWrapper'
	assert.equal(h.jsx(original, { label: 'Direct Messages' }).type, original)
})
