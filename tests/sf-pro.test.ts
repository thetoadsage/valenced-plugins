import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

test('the built SF Pro pack registers only Discord sans styles as system fonts', () => {
	const script = readFileSync(
		new URL('../plugins/sf-pro/build/js/index.js', import.meta.url),
		'utf8',
	)
	const { default: entry } = runInNewContext(script, {
		plugin: (value: unknown) => value,
	})

	const groups: string[] = []
	const packs: Array<{
		group: string
		id: string
		families: Record<string, string>
	}> = []
	entry.preInit({
		themes: {
			registerGroup(id: string) {
				groups.push(id)
			},
			registerFontPack(
				group: string,
				id: string,
				{ families }: { families: Record<string, string> },
			) {
				packs.push({ group, id, families: { ...families } })
			},
		},
	})
	assert.deepEqual(groups, ['apple'])
	assert.deepEqual(packs, [
		{
			group: 'apple',
			id: 'sf-pro',
			families: Object.fromEntries(
				['Normal', 'Medium', 'Semibold', 'Bold', 'ExtraBold'].flatMap(style =>
					['', 'Italic'].map(suffix => [
						`ggsans-${style}${suffix}`,
						'system-ui',
					]),
				),
			),
		},
	])
})
