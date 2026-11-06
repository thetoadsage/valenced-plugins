import data from './tracking-rules.json'

function pattern(source: string, flags = 'i') {
	// Catalog patterns are JavaScript-compatible; require true end of input.
	return new RegExp(source.replace(/\$$/, '(?![\\s\\S])'), flags)
}
const exact = (source: string, flags = 'i') => pattern(`^(?:${source})$`, flags)
const compileNames = (names: string[]) => names.map(name => exact(name))
export const matchesHost = (host: string, domain: string) =>
	host === domain || host.endsWith(`.${domain}`)

function compileCatalog() {
	const domains = Object.entries(data.domains).map(([domain, names]) => ({
		domain,
		names: compileNames(names),
	}))
	const providers = data.providers.map(provider => ({
		url: pattern(provider.urlPattern),
		exceptions: provider.exceptions.map(source => pattern(source)),
		names: compileNames(provider.rules),
	}))
	const overrides = data.parameterRules.map(rule => ({
		url: pattern(rule.urlPattern),
		exceptions: rule.exceptions.map(source => pattern(source)),
		name: exact(rule.namePattern),
		value:
			'valuePattern' in rule ? exact(rule.valuePattern as string, '') : null,
		action: rule.action,
	}))
	const global = compileNames([...data.global, ...data.localGlobalAdditions])
	return (host: string, matchingURL: string) => {
		const names = [...global]
		for (const entry of domains)
			if (matchesHost(host, entry.domain)) names.push(...entry.names)
		for (const entry of providers)
			if (
				entry.url.test(matchingURL) &&
				!entry.exceptions.some(exception => exception.test(matchingURL))
			)
				names.push(...entry.names)
		const scoped = overrides.filter(
			entry =>
				entry.url.test(matchingURL) &&
				!entry.exceptions.some(exception => exception.test(matchingURL)),
		)
		return (name: string, value: string | undefined) => {
			if (name.length > 512) return false
			const matching = scoped.filter(rule => rule.name.test(name))
			const valueMatches = (rule: (typeof matching)[number]) =>
				!rule.value || rule.value.test(value ?? '')
			if (
				matching.some(rule => rule.action === 'preserve' && valueMatches(rule))
			)
				return false
			const removals = matching.filter(rule => rule.action === 'remove')
			return removals.length
				? removals.some(valueMatches)
				: names.some(regex => regex.test(name))
		}
	}
}

// A broken bundled rule must not crash Discord or bypass preservation rules.
export const catalog = (() => {
	try {
		return compileCatalog()
	} catch {
		return null
	}
})()
