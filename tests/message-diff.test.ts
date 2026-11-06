import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordDiff } from '../plugins/message-logger/js/diff.ts'

for (const [before, after] of [
	['Hello old world', 'Hello new world'],
	['', 'Added'],
	['Removed', ''],
	['same', 'same'],
	['line one\n  two', 'line one\nthree  two'],
	['😀 hello', '😀 goodbye'],
	['a '.repeat(500), 'b '.repeat(500)],
])
	test(`word diff preserves both inputs: ${before.slice(0, 20)}`, () => {
		const parts = wordDiff(before, after)
		assert.equal(
			parts
				.filter(p => p.kind !== 'added')
				.map(p => p.text)
				.join(''),
			before,
		)
		assert.equal(
			parts
				.filter(p => p.kind !== 'removed')
				.map(p => p.text)
				.join(''),
			after,
		)
	})
