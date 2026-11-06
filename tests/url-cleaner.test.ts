import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const code = readFileSync(
	new URL('../plugins/url-cleaner/build/js/index.js', import.meta.url),
	'utf8',
)
function harness(settings: any = {}, delayed = false) {
	const copies: any[] = [],
		sends: any[] = [],
		edits: any[] = [],
		cleanups: (() => void)[] = [],
		errors: string[] = []
	const receiver = { marker: true }
	const clipboard = {
		setString(this: any, value: string) {
			copies.push([this, value])
			return receiver
		},
	}
	const messages = {
		sendMessage(this: any, ...args: any[]) {
			sends.push([this, ...args])
			return receiver
		},
		editMessage(this: any, ...args: any[]) {
			edits.push([this, ...args])
			return receiver
		},
	}
	let register: (() => void) | undefined
	let subscribed = true
	const jsx = (type: any, props: any) => ({ type, props })
	const api = {
		externals: { ReactNativeClipboard: { Clipboard: clipboard } },
		modules: {
			finders: {
				filters: { withProps: (...props: string[]) => props },
				getModules: (filter: string[], cb: any) => {
					assert.deepEqual(Array.from(filter), ['sendMessage', 'editMessage'])
					register = () => {
						if (subscribed) {
							cb(messages)
							cb(messages)
						}
					}
					if (!delayed) register()
					return () => {
						subscribed = false
					}
				},
			},
		},
		patcher: {
			instead: (target: any, method: string, cb: any) => {
				const original = target[method]
				target[method] = function (this: any, ...args: any[]) {
					return cb.call(this, args, original)
				}
				return () => {
					target[method] = original
				}
			},
		},
		components: { Page: 'Page' },
		discord: {
			design: { Design: { TableRowGroup: 'Group', TableSwitchRow: 'Switch' } },
		},
		react: {
			ReactNative: { NativeModules: {}, ScrollView: 'Scroll' },
			ReactJSXRuntime: { jsx, jsxs: jsx },
		},
	}
	// Exercise the shipped bundle without browser URL, TextEncoder, atob or fetch.
	const exports = (() => {
		try {
			return runInNewContext(
				code,
				{ valenced: api, plugin: (value: any) => value, Buffer },
				{ timeout: 5000 },
			)
		} catch (error: any) {
			throw new Error(error.message)
		}
	})()
	assert.equal(exports.rulesLoaded, true, 'Every catalog pattern must compile')
	const options = exports.default
	const storage = {
		cache: { ...options.jsonStorage.default, ...settings },
		use() {
			return this.cache
		},
		set(values: any) {
			Object.assign(this.cache, values)
		},
	}
	const originals = [
		clipboard.setString,
		messages.sendMessage,
		messages.editMessage,
	]
	options.start({
		jsonStorage: storage,
		cleanup: (...items: (() => void)[]) => cleanups.push(...items),
		plugin: { reportError: (message: string) => errors.push(message) },
	})
	return {
		...exports,
		storage,
		options,
		copies,
		sends,
		edits,
		clipboard,
		messages,
		receiver,
		originals,
		register: () => register?.(),
		errors,
		stop() {
			for (const cleanup of cleanups.reverse()) cleanup()
		},
	}
}
const engine = harness()
const dirty = 'https://example.com/?utm_source=discord#section'
const clean = 'https://example.com/#section'

test('matches the Swift cleaner reference corpus', () => {
	const corpus = JSON.parse(
		readFileSync(
			new URL('./fixtures/clipboard-cleaner.json', import.meta.url),
			'utf8',
		),
	)
	const differences: any[] = []
	for (const { input, expected } of corpus) {
		const actual = engine.cleanUrl(input, true)
		if (actual !== expected) differences.push({ input, expected, actual })
		assert.equal(
			engine.cleanUrl(actual, true),
			actual,
			'Cleaning must be idempotent',
		)
	}
	assert.deepEqual(differences, [])
})

test('preserves message prose, multiple URLs, punctuation and Markdown', () => {
	for (const [input, expected] of [
		[`See ${dirty} for details.`, `See ${clean} for details.`],
		[`${dirty} and ${dirty}`, `${clean} and ${clean}`],
		[`[read](${dirty})`, `[read](${clean})`],
		[`[read](${dirty} "title")`, `[read](${clean} "title")`],
		[`<${dirty}>`, `<${clean}>`],
		[`(${dirty}).`, `(${clean}).`],
		[`**${dirty}**`, `**${clean}**`],
		[`||${dirty}||`, `||${clean}||`],
		[`https://example.com/a_(b)?utm_source=x`, 'https://example.com/a_(b)'],
		[`link: ${dirty}\nThanks!`, `link: ${clean}\nThanks!`],
		[`\`${dirty}\` ${dirty}`, `\`${dirty}\` ${clean}`],
		[
			`${'```'}js\n${dirty}\n${'```'}\n${dirty}`,
			`${'```'}js\n${dirty}\n${'```'}\n${clean}`,
		],
		[`\\${dirty}`, `\\${dirty}`],
		[`\`${dirty}`, `\`${dirty}`],
		[
			'https://href.li/?https://example.com/?utm_source=x#part',
			'https://example.com/#part',
		],
	])
		assert.equal(engine.cleanText(input), expected, input)
})

test('keeps product shortening optional and preserves credentials and custom ports', () => {
	const input =
		'https://www.amazon.com/Some-Product/dp/B08XYZ1234?tag=tracker&color=blue#reviews'
	assert.equal(
		engine.cleanUrl(input, true),
		'https://www.amazon.com/dp/B08XYZ1234',
	)
	assert.match(engine.cleanUrl(input), /color=blue#reviews$/)
	for (const input of [
		'https://www.amazon.com:8443/dp/B08XYZ1234?color=blue',
		'https://name:secret@www.amazon.com/dp/B08XYZ1234?color=blue',
	]) {
		assert.equal(engine.cleanUrl(input, true), input)
	}
})

test('keeps malformed and oversized input, non-HTTP schemes and host lookalikes', () => {
	for (const input of [
		'not a URL',
		'ftp://example.com/?utm_source=x',
		'file:///tmp/a?utm_source=x',
		'https://instagram.com.example.com/p/a?psln=keep',
		'https://example.com/\\evil?utm_source=x',
		`https://example.com/?utm_source=${'a'.repeat(9000)}`,
	]) {
		assert.equal(engine.cleanUrl(input, true), input)
	}
	const long = `${dirty} ${'a'.repeat(65537)}`
	assert.equal(engine.cleanText(long), long)
})

test('decodes Bing destinations without browser globals', () => {
	const encoded = Buffer.from(dirty).toString('base64url')
	assert.equal(
		engine.cleanUrl(`https://www.bing.com/ck/a?u=a1${encoded}`),
		clean,
	)
})

test('copies, sends and edits string and object payloads while preserving receiver and other arguments', () => {
	const h = harness()
	assert.equal(h.clipboard.setString(dirty), h.receiver)
	assert.equal(h.copies[0][1], clean)
	assert.equal(h.copies[0][0], h.clipboard)
	const payload = { content: dirty, attachments: ['file'], nonce: 'unique' },
		extra = { flags: 123 }
	assert.equal(
		h.messages.sendMessage.call(h.receiver, 'channel', payload, extra),
		h.receiver,
	)
	assert.equal(h.sends[0][0], h.receiver)
	assert.equal(h.sends[0][2].content, clean)
	assert.equal(h.sends[0][2].attachments, payload.attachments)
	assert.equal(h.sends[0][2].nonce, 'unique')
	assert.equal(h.sends[0][3], extra)
	assert.equal(payload.content, dirty)
	h.messages.sendMessage('channel', dirty)
	assert.equal(h.sends[1][2], clean)
	h.messages.editMessage('channel', 'id', payload, extra)
	assert.equal(h.edits[0][3].content, clean)
	assert.equal(h.edits[0][4], extra)
	h.messages.editMessage('channel', 'id', dirty)
	assert.equal(h.edits[1][3], clean)
	assert.deepEqual(h.errors, [])
})

test('independent settings take effect immediately and master switch disables all cleaning', () => {
	const h = harness({ cleanOnCopy: false })
	h.clipboard.setString(dirty)
	h.messages.sendMessage('c', dirty)
	assert.equal(h.copies[0][1], dirty)
	assert.equal(h.sends[0][2], clean)
	h.storage.set({ cleanOnCopy: true, cleanOnSend: false, cleanOnEdit: false })
	h.clipboard.setString(dirty)
	h.messages.sendMessage('c', dirty)
	h.messages.editMessage('c', 'm', dirty)
	assert.equal(h.copies[1][1], clean)
	assert.equal(h.sends[1][2], dirty)
	assert.equal(h.edits[0][3], dirty)
	h.storage.set({ enabled: false, cleanOnSend: true, cleanOnEdit: true })
	h.clipboard.setString(dirty)
	h.messages.sendMessage('c', dirty)
	h.messages.editMessage('c', 'm', dirty)
	assert.equal(h.copies[2][1], dirty)
	assert.equal(h.sends[2][2], dirty)
	assert.equal(h.edits[1][3], dirty)
})

test('unload restores hooks and cancels pending module callbacks', () => {
	const h = harness()
	h.stop()
	assert.equal(h.clipboard.setString, h.originals[0])
	assert.equal(h.messages.sendMessage, h.originals[1])
	assert.equal(h.messages.editMessage, h.originals[2])
	const late = harness({}, true)
	late.stop()
	late.register()
	assert.equal(late.messages.sendMessage, late.originals[1])
})

test('unrecognized payloads and attachment-only messages pass through', () => {
	const h = harness(),
		payload = { attachments: ['x'] }
	h.messages.sendMessage('c', payload)
	assert.equal(h.sends[0][2], payload)
	h.messages.sendMessage('c', null)
	assert.equal(h.sends[1][2], null)
})

test('settings page displays five working switches with their current values', () => {
	const h = harness(),
		tree = h.options.SettingsComponent({ api: { jsonStorage: h.storage } })
	const rows = tree.props.children.props.children.props.children
	assert.equal(rows.length, 5)
	for (const row of rows) {
		assert.equal(typeof row.props.label, 'string')
		assert.equal(typeof row.props.value, 'boolean')
		assert.equal(typeof row.props.onValueChange, 'function')
	}
	rows[0].props.onValueChange(false)
	assert.equal(h.storage.cache.enabled, false)
	rows[4].props.onValueChange(true)
	assert.equal(h.storage.cache.shortenProducts, true)
})
