import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

function luminance(hex: string) {
	const channels = [1, 3, 5].map(offset => {
		const srgb = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
		return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

test('Toad Color Themes registers four distinct palettes', () => {
	const script = readFileSync(
		new URL('../plugins/fern/build/js/index.js', import.meta.url),
		'utf8',
	)
	const { default: entry } = runInNewContext(script, {
		plugin: (value: unknown) => value,
	})

	let groupId: string | undefined
	const palettes = new Map<string, Record<string, Record<string, string>>>()
	entry.preInit({
		themes: {
			registerGroup(id: string) {
				groupId = id
			},
			registerTheme(
				group: string,
				id: string,
				theme: {
					getColors(discord: { raw: Record<string, string> }): {
						semantic: Record<string, Record<string, string>>
					}
				},
			) {
				assert.equal(groupId, 'toad')
				assert.equal(group, groupId)
				assert.ok(!palettes.has(id), `duplicate theme: ${id}`)
				palettes.set(id, theme.getColors({ raw: {} }).semantic)
			},
		},
	})

	assert.deepEqual(
		[...palettes.keys()],
		['fern', 'fjord', 'cinder', 'wisteria'],
	)
	for (const base of ['light', 'dark', 'darker', 'midnight']) {
		for (const token of ['BACKGROUND_BASE_LOWER', 'BACKGROUND_BRAND']) {
			assert.equal(
				new Set([...palettes.values()].map(palette => palette[base]?.[token]))
					.size,
				palettes.size,
			)
		}
	}
	for (const [id, palette] of palettes) checkContrast(id, palette)
})

function checkContrast(
	id: string,
	palette: Record<string, Record<string, string>>,
) {
	assert.deepEqual(Object.keys(palette).sort(), [
		'dark',
		'darker',
		'light',
		'midnight',
	])
	for (const [base, colors] of Object.entries(palette)) {
		for (const hex of Object.values(colors)) assert.match(hex, /^#[A-F\d]{6}$/)

		const pairs = [
			...[
				'BACKGROUND_BASE_LOWEST',
				'BACKGROUND_BASE_LOWER',
				'BACKGROUND_BASE_LOW',
				'BACKGROUND_SURFACE_HIGHEST',
				'BACKGROUND_MODIFIER_SELECTED',
			].flatMap(surface =>
				['TEXT_DEFAULT', 'TEXT_SUBTLE', 'TEXT_MUTED', 'TEXT_LINK'].map(ink => [
					ink,
					surface,
				]),
			),
			['MENTION_FOREGROUND', 'MENTION_BACKGROUND'],
			['CONTROL_PRIMARY_TEXT_DEFAULT', 'CONTROL_PRIMARY_BACKGROUND_DEFAULT'],
			['CONTROL_PRIMARY_TEXT_ACTIVE', 'CONTROL_PRIMARY_BACKGROUND_ACTIVE'],
		]
		for (const [foreground, background] of pairs) {
			const fg = luminance(colors[foreground!]!)
			const bg = luminance(colors[background!]!)
			const contrast = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
			assert.ok(
				contrast >= 4.5,
				`${id}/${base}: ${foreground} on ${background} is ${contrast.toFixed(2)}:1`,
			)
		}
	}
}
