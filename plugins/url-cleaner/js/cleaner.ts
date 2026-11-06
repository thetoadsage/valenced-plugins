import { URL } from 'react-native-url-polyfill/js/URL'
import { catalog, matchesHost } from './catalog'

const maxURLLength = 8192
const googleDomains = [
	'google.com',
	'google.ca',
	'google.co.uk',
	'google.com.au',
	'google.co.nz',
	'google.co.in',
	'google.co.jp',
	'google.de',
	'google.fr',
	'google.es',
	'google.it',
	'google.nl',
	'google.pl',
	'google.com.br',
	'google.com.mx',
]
const amazonDomains = [
	'amazon.com',
	'amazon.ca',
	'amazon.com.mx',
	'amazon.com.br',
	'amazon.co.uk',
	'amazon.de',
	'amazon.fr',
	'amazon.it',
	'amazon.es',
	'amazon.nl',
	'amazon.se',
	'amazon.pl',
	'amazon.com.be',
	'amazon.co.jp',
	'amazon.in',
	'amazon.com.au',
	'amazon.sg',
	'amazon.ae',
	'amazon.sa',
	'amazon.eg',
	'amazon.com.tr',
	'amazon.cn',
	'amazon.ie',
	'amazon.co.za',
]
const ownedHost = (host: string, domains: string[]) =>
	domains.some(domain => matchesHost(host, domain))
const byteLength = (text: string) => {
	let length = 0
	for (const char of text) {
		const point = char.codePointAt(0)!
		length += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4
		if (length > maxURLLength) break
	}
	return length
}
function decode(value: string) {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}
// biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls instead of silently normalizing attacker-controlled URLs.
const invalidCharacters = /[\s\u0000-\u001f\u007f\\]/
function parse(input: string) {
	if (
		!/^https?:\/\//i.test(input) ||
		invalidCharacters.test(input) ||
		byteLength(input) > maxURLLength
	)
		return null
	try {
		const url = new URL(input)
		return url.hostname ? url : null
	} catch {
		return null
	}
}
function query(input: string) {
	const hash = input.indexOf('#')
	const end = hash < 0 ? input.length : hash
	const question = input.slice(0, end).indexOf('?')
	if (question < 0) return null
	return {
		prefix: input.slice(0, question),
		fragment: input.slice(end),
		items: input
			.slice(question + 1, end)
			.split('&')
			.map(raw => {
				const equals = raw.indexOf('=')
				return {
					raw,
					name: decode(equals < 0 ? raw : raw.slice(0, equals)),
					value: equals < 0 ? undefined : decode(raw.slice(equals + 1)),
				}
			}),
	}
}
function bingDestination(value: string) {
	if (!/^a1[A-Za-z0-9_+/-]+={0,2}$/.test(value)) return null
	// Valenced exposes Buffer on both platforms; no browser atob is required.
	try {
		const result = Buffer.from(
			value.slice(2).replace(/-/g, '+').replace(/_/g, '/'),
			'base64',
		).toString('utf8')
		return parse(result) ? result : null
	} catch {
		return null
	}
}
function unwrap(input: string, url: URL): string | null {
	const host = url.hostname.toLowerCase(),
		path = url.pathname
	if (host === 'click.redditmail.com') {
		const match =
			/^\/CL0\/(https?%3[aA]%2[fF]%2[fF][^/]+)\/[0-9]\/[a-f0-9-]+\/$/.exec(path)
		if (match) {
			const destination = decode(match[1])
			return parse(destination) ? destination : null
		}
	}
	if (host === 'href.li' && path === '/') {
		const question = input.indexOf('?')
		if (question < 0) return null
		const raw = input.slice(question + 1)
		for (const destination of [raw, decode(raw)])
			if (parse(destination)) return destination
		return null
	}
	let names: string[] = []
	if (host === 'l.facebook.com' && path === '/l.php') names = ['u']
	else if (ownedHost(host, googleDomains) && path === '/url')
		names = ['url', 'q']
	else if (host === 'cts.businesswire.com') names = ['url']
	else if (host === 'duckduckgo.com' && path === '/l/') names = ['uddg']
	else if (
		['linkedin.com', 'www.linkedin.com'].includes(host) &&
		path === '/redir/redirect'
	)
		names = ['url']
	else if (
		['l.threads.net', 'l.threads.com', 'l.instagram.com'].includes(host) &&
		path === '/'
	)
		names = ['u']
	else if (
		['go.skimresources.com', 'go.redirectingat.com'].includes(host) &&
		path === '/'
	)
		names = ['url']
	else if (
		host === 'click.linksynergy.com' &&
		['/deeplink', '/link'].includes(path)
	)
		names = ['murl']
	else if (['bing.com', 'www.bing.com'].includes(host) && path === '/ck/a')
		names = ['u']
	for (const name of names) {
		// Match Foundation's single percent decode; '+' is not a space here.
		const values = query(input)?.items.filter(item => item.name === name) ?? []
		if (values.length > 1) return null
		const value = values[0]?.value
		if (!value) continue
		const destination =
			name === 'u' && ['bing.com', 'www.bing.com'].includes(host)
				? bingDestination(value)
				: value
		if (destination && parse(destination)) return destination
	}
	return null
}
function canonical(url: URL) {
	const host = url.hostname.toLowerCase(),
		path = decode(url.pathname)
	let result: string | undefined
	if (ownedHost(host, ['aliexpress.com', 'aliexpress.us', 'aliexpress.ru'])) {
		const match = /^\/item\/(\d+)\.html$/.exec(path)
		if (match) result = `/item/${match[1]}.html`
	} else if (ownedHost(host, amazonDomains)) {
		const match = /\/(?:dp|gp\/product|d)\/([A-Z0-9]{10})(?:\/|$)/.exec(path)
		if (match) result = `/dp/${match[1]}`
	} else if (matchesHost(host, 'bestbuy.com')) {
		const match = /^\/site\/(?:.+\/)?(\d+)\.p$/.exec(path)
		if (match) result = `/site/${match[1]}.p`
	} else if (matchesHost(host, 'walmart.com')) {
		const match = /^\/ip\/(?:.+\/)?(\d+)$/.exec(path)
		if (match) result = `/ip/${match[1]}`
	} else if (matchesHost(host, 'makerworld.com')) {
		const match =
			/^(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?models\/\d+(?:-[^/]*)?)\/?$/.exec(path)
		if (match) result = match[1]
	}
	// Keep custom ports and credentials rather than changing the destination.
	return result && !url.port && !url.username && !url.password
		? `${url.protocol}//${url.hostname}${result}`
		: null
}

export function cleanUrl(input: string, shortenProducts = false): string {
	if (!catalog || byteLength(input) > maxURLLength) return input
	let candidate = input
	let url = parse(candidate)
	if (!url) return input
	for (let depth = 0; depth < 3; depth++) {
		const next = unwrap(candidate, url)
		if (!next) break
		candidate = next
		url = parse(candidate)!
	}
	if (shortenProducts) {
		const result = canonical(url)
		if (result) return result
	}
	const raw = query(candidate)
	if (!raw) return candidate
	// Normalize only the matching authority, preserving query spelling in output.
	const matchingURL = `${url.protocol}//${url.hostname}${url.pathname}${url.search}${url.hash}`
	const removes = catalog(url.hostname.toLowerCase(), matchingURL)
	const items = raw.items
	const youtube = matchesHost(url.hostname.toLowerCase(), 'youtube.com')
	const shorts = youtube && /^\/shorts\/[^/]+\/?$/.test(url.pathname)
	const watch =
		youtube &&
		url.pathname === '/watch' &&
		items.some(item => item.name === 'v' && item.value)
	const radio =
		watch &&
		items.some(item => item.name === 'list' && item.value?.startsWith('RD')) &&
		items.some(item => item.name === 'start_radio' && item.value === '1')
	const favorites =
		watch &&
		items.some(
			item =>
				item.name === 'list' &&
				item.value?.startsWith('FL') &&
				item.value.length > 2,
		)
	const kept = items.filter(
		item =>
			!removes(item.name, item.value) &&
			!(shorts && item.name.toLowerCase() === 'is') &&
			!(radio && ['list', 'start_radio'].includes(item.name)) &&
			!(favorites && ['list', 'index'].includes(item.name)),
	)
	return kept.length === items.length
		? candidate
		: raw.prefix +
				(kept.length ? `?${kept.map(item => item.raw).join('&')}` : '') +
				raw.fragment
}

export function cleanText(input: string, shortenProducts = false): string {
	if (input.length > 65536) return input
	// Consume complete code spans/fences first, so their contents never reach URL matching.
	return input.replace(
		/(`+)(?:[\s\S]*?\1|[\s\S]*$)|https?:\/\/[^\s<>`"\\]+/gi,
		(match: string, code: string | undefined, offset: number) => {
			if (code) return match
			const before = input[offset - 1]
			if (before && /[\w/\\]/.test(before)) return match
			// Quoted/angle-bracket destinations have explicit boundaries.
			let end = match.length
			if (before !== '<' && before !== '"') {
				while (end && /[.,!;:*_~|?]/.test(match[end - 1])) end--
				for (const [open, close] of [
					['(', ')'],
					['[', ']'],
					['{', '}'],
				]) {
					while (
						match[end - 1] === close &&
						match.slice(0, end).split(close).length >
							match.slice(0, end).split(open).length
					)
						end--
				}
			}
			const value = match.slice(0, end)
			try {
				return cleanUrl(value, shortenProducts) + match.slice(end)
			} catch {
				return match
			}
		},
	)
}
