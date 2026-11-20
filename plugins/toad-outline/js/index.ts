declare module '@valenced/plugins/types' {
	interface PreInitPluginApi {
		themes: {
			registerGroup(id: string, group: { name: string }): void
			registerIconPack(
				group: string,
				id: string,
				pack: {
					name: string
					description: string
					icons: Record<string, string>
				},
			): void
		}
	}
}

const iconNames = [
	'HomeIcon',
	'ChatIcon',
	'MagnifyingGlassIcon',
	'InboxIcon',
	'FriendsIcon',
	'SettingsIcon',
	'BellIcon',
	'ArrowSmallLeftIcon',
	'MoreVerticalIcon',
	'PlusLargeIcon',
	'SendMessageIcon',
	'XLargeIcon',
]

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('toad', { name: 'Toad' })
		themes.registerIconPack('toad', 'outline', {
			name: 'Toad Outline',
			description: 'Rounded outlines for navigation and chat actions.',
			icons: Object.fromEntries(
				iconNames.map(name => [name, `assets/icons/${name}.png`]),
			),
		})
	},
})
