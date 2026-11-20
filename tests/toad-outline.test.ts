import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

test('Toad Outline registers an asset path for every bundled PNG', () => {
	const root = new URL('../plugins/toad-outline/', import.meta.url)
	const script = readFileSync(new URL('build/js/index.js', root), 'utf8')
	const { default: entry } = runInNewContext(script, {
		plugin: (value: unknown) => value,
	})
	const groups: string[] = []
	const packs: string[] = []
	entry.preInit({
		themes: {
			registerGroup(id: string) {
				groups.push(id)
			},
			registerIconPack(
				group: string,
				id: string,
				pack: { icons: Record<string, string> },
			) {
				assert.deepEqual(groups, [group])
				packs.push(id)
				const files = readdirSync(new URL('assets/icons/', root)).sort()
				assert.equal(files.length, 12)
				assert.deepEqual(
					{ ...pack.icons },
					Object.fromEntries(
						files.map(file => [file.slice(0, -4), `assets/icons/${file}`]),
					),
				)
				for (const path of Object.values(pack.icons)) {
					const png = readFileSync(new URL(path, root))
					assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
					assert.equal(png.readUInt32BE(16), 72)
					assert.equal(png.readUInt32BE(20), 72)
					assert.equal(png[25], 6)
				}
			},
		},
	})
	assert.deepEqual(packs, ['outline'])
})
