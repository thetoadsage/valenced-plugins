export interface DiffPart {
	kind: 'same' | 'removed' | 'added'
	text: string
}

export function wordDiff(before: string, after: string): DiffPart[] {
	if (before === after) return [{ kind: 'same', text: before }]
	const a = before.match(/\s+|[^\s]+/g) ?? []
	const b = after.match(/\s+|[^\s]+/g) ?? []
	// Bound work for long messages; whole-version replacement still preserves every character.
	if (a.length > 400 || b.length > 400)
		return [
			{ kind: 'removed', text: before },
			{ kind: 'added', text: after },
		]
	const width = b.length + 1
	const table = new Uint16Array((a.length + 1) * width)
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			table[i * width + j] =
				a[i] === b[j]
					? table[(i + 1) * width + j + 1] + 1
					: Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
	const parts: DiffPart[] = []
	const append = (kind: DiffPart['kind'], text: string) => {
		const last = parts.at(-1)
		if (last?.kind === kind) last.text += text
		else parts.push({ kind, text })
	}
	let i = 0,
		j = 0
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			append('same', a[i++])
			j++
		} else if (
			i < a.length &&
			(j === b.length || table[(i + 1) * width + j] >= table[i * width + j + 1])
		)
			append('removed', a[i++])
		else append('added', b[j++])
	}
	return parts
}
