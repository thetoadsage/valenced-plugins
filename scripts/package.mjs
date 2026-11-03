import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { zipSync } from 'fflate'

const root = 'plugins/message-logger'
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'))
if (
	manifest.dist.android ||
	manifest.dist.ios ||
	manifest.dist.script !== 'index.js'
)
	throw new Error('Expected a JavaScript-only plugin')
const files = {
	'manifest.json': readFileSync(`${root}/manifest.json`),
	'index.js': readFileSync(`${root}/build/js/index.js`),
	LICENSE: readFileSync('LICENSE'),
	NOTICE: readFileSync('NOTICE'),
}
const entries = Object.fromEntries(
	Object.entries(files).map(([name, bytes]) => [
		name,
		[bytes, { mtime: new Date(2000, 0, 1) }],
	]),
)
const zip = zipSync(entries, { level: 9 })
const name = `${manifest.id}@${manifest.version}.zip`
mkdirSync('build/dist', { recursive: true })
writeFileSync(`build/dist/${name}`, zip)
writeFileSync(
	'build/SHA256SUMS',
	`${createHash('sha256').update(zip).digest('hex')}  ${name}\n`,
)
console.log(`Packaged build/dist/${name}`)
