declare module '@valenced/plugins/types' {
	interface PreInitPluginApi {
		themes: {
			registerGroup(id: string, group: { name: string }): void
			registerFontPack(
				group: string,
				id: string,
				pack: { name: string; families: Record<string, 'system-ui'> },
			): void
		}
	}
}

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('apple', { name: 'Apple' })
		themes.registerFontPack('apple', 'sf-pro', {
			name: 'SF Pro (toad)',
			families: {
				'ggsans-Normal': 'system-ui',
				'ggsans-Medium': 'system-ui',
				'ggsans-Semibold': 'system-ui',
				'ggsans-Bold': 'system-ui',
				'ggsans-ExtraBold': 'system-ui',
				'ggsans-NormalItalic': 'system-ui',
				'ggsans-MediumItalic': 'system-ui',
				'ggsans-SemiboldItalic': 'system-ui',
				'ggsans-BoldItalic': 'system-ui',
				'ggsans-ExtraBoldItalic': 'system-ui',
			},
		})
	},
})
