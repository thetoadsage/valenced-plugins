type ThemeBase = 'light' | 'dark' | 'darker' | 'midnight'
type ThemeColors = { semantic: Record<ThemeBase, Record<string, string>> }

declare module '@valenced/plugins/types' {
	interface PreInitPluginApi {
		themes: {
			registerGroup(id: string, group: { name: string }): void
			registerTheme(
				group: string,
				id: string,
				theme: {
					name: string
					description: string
					getColors(discord: { raw: Record<string, string> }): ThemeColors
				},
			): void
		}
	}
}

type Ink = {
	text: string
	secondary: string
	muted: string
	link: string
	selection: string
	border: string
}
type Surfaces = { rail: string; panel: string; chat: string; raised: string }
type Palette = {
	id: string
	name: string
	description: string
	brand: string
	pressed: string
	light: Ink
	dark: Ink
	surfaces: Record<ThemeBase, Surfaces>
}

function colors(ink: Ink, surfaces: Surfaces, { brand, pressed }: Palette) {
	const { text, secondary, muted, link, selection, border } = ink
	const { rail, panel, chat, raised } = surfaces

	return {
		BACKGROUND_BASE_LOWEST: rail,
		BACKGROUND_BASE_LOWER: chat,
		BACKGROUND_BASE_LOW: panel,
		BACKGROUND_SURFACE_HIGH: raised,
		BACKGROUND_SURFACE_HIGHER: raised,
		BACKGROUND_SURFACE_HIGHEST: raised,
		CHANNEL_BACKGROUND_DEFAULT: panel,
		PANEL_BG: panel,
		MOBILE_FLOATINGBAR_BACKGROUND: raised,
		MOBILE_FLOATINGBAR_BACKGROUND_HIGHER: raised,
		BACKGROUND_MODIFIER_SELECTED: selection,
		BACKGROUND_MODIFIER_ACCENT: border,
		BORDER_SUBTLE: border,
		TEXT_DEFAULT: text,
		TEXT_NORMAL: text,
		TEXT_STRONG: text,
		TEXT_SUBTLE: secondary,
		TEXT_MUTED: muted,
		TEXT_PLACEHOLDER: muted,
		HEADER_PRIMARY: text,
		HEADER_SECONDARY: secondary,
		CHANNELS_ACTIVE: text,
		CHANNELS_DEFAULT: secondary,
		CHANNEL_ICON: secondary,
		ICON_DEFAULT: secondary,
		ICON_STRONG: text,
		TEXT_LINK: link,
		TEXT_BRAND: link,
		ICON_BRAND: link,
		MENTION_FOREGROUND: link,
		MENTION_BACKGROUND: selection,
		BACKGROUND_BRAND: brand,
		BUTTON_FILLED_BRAND_BACKGROUND: brand,
		BUTTON_FILLED_BRAND_TEXT: '#FFFFFF',
		CONTROL_PRIMARY_BACKGROUND_DEFAULT: brand,
		CONTROL_PRIMARY_BACKGROUND_HOVER: pressed,
		CONTROL_PRIMARY_BACKGROUND_ACTIVE: pressed,
		CONTROL_PRIMARY_TEXT_DEFAULT: '#FFFFFF',
		CONTROL_PRIMARY_TEXT_HOVER: '#FFFFFF',
		CONTROL_PRIMARY_TEXT_ACTIVE: '#FFFFFF',
		REDESIGN_BUTTON_PRIMARY_BACKGROUND: brand,
		REDESIGN_BUTTON_PRIMARY_PRESSED_BACKGROUND: pressed,
		REDESIGN_BUTTON_PRIMARY_TEXT: '#FFFFFF',
	}
}

const palettes: Palette[] = [
	{
		id: 'fern',
		name: 'Fern',
		description: 'Fern green, warm ivory, and woodland shadows.',
		brand: '#34754C',
		pressed: '#28623D',
		light: {
			text: '#203229',
			secondary: '#4A6152',
			muted: '#53695A',
			link: '#22633E',
			selection: '#DCE9D9',
			border: '#C9D5C7',
		},
		dark: {
			text: '#EEF4EA',
			secondary: '#C0D0BE',
			muted: '#A6BBA7',
			link: '#9CDDAD',
			selection: '#304A39',
			border: '#3A5142',
		},
		surfaces: {
			light: {
				rail: '#E4EBDF',
				panel: '#EDF1E7',
				chat: '#F8F7EF',
				raised: '#FFFDF5',
			},
			dark: {
				rail: '#19241E',
				panel: '#202D25',
				chat: '#26362D',
				raised: '#2D3D33',
			},
			darker: {
				rail: '#101913',
				panel: '#17221B',
				chat: '#1C2A22',
				raised: '#24332A',
			},
			midnight: {
				rail: '#000000',
				panel: '#0B130E',
				chat: '#050906',
				raised: '#16231A',
			},
		},
	},
	{
		id: 'fjord',
		name: 'Fjord',
		description: 'Glacier blue with pale mist and deep navy.',
		brand: '#1B648D',
		pressed: '#154D70',
		light: {
			text: '#152E40',
			secondary: '#3D566B',
			muted: '#456076',
			link: '#155D84',
			selection: '#D5E8F3',
			border: '#BDD4E4',
		},
		dark: {
			text: '#EEF6FC',
			secondary: '#BCCFE2',
			muted: '#A3BCD2',
			link: '#8CD6FB',
			selection: '#27475F',
			border: '#3C536A',
		},
		surfaces: {
			light: {
				rail: '#DFE9F2',
				panel: '#E9F1F7',
				chat: '#F4F8FB',
				raised: '#FCFEFF',
			},
			dark: {
				rail: '#182636',
				panel: '#1F3044',
				chat: '#25374D',
				raised: '#2E425A',
			},
			darker: {
				rail: '#0D1929',
				panel: '#152233',
				chat: '#1A2A3D',
				raised: '#23354B',
			},
			midnight: {
				rail: '#000000',
				panel: '#080F1B',
				chat: '#04070D',
				raised: '#142239',
			},
		},
	},
	{
		id: 'cinder',
		name: 'Cinder',
		description: 'Copper accents, parchment, and charcoal brown.',
		brand: '#9C492A',
		pressed: '#803921',
		light: {
			text: '#382820',
			secondary: '#65483A',
			muted: '#705043',
			link: '#8B3D21',
			selection: '#F0DED1',
			border: '#DCC6B8',
		},
		dark: {
			text: '#FFF2E7',
			secondary: '#E4CBBA',
			muted: '#C9AE9E',
			link: '#FFB68E',
			selection: '#593D30',
			border: '#614D43',
		},
		surfaces: {
			light: {
				rail: '#EEE3D8',
				panel: '#F5EBDF',
				chat: '#FBF4EB',
				raised: '#FFFBF4',
			},
			dark: {
				rail: '#2D241F',
				panel: '#372B25',
				chat: '#40322B',
				raised: '#493B33',
			},
			darker: {
				rail: '#1A1411',
				panel: '#241C17',
				chat: '#2D221D',
				raised: '#3A2E27',
			},
			midnight: {
				rail: '#000000',
				panel: '#130D0A',
				chat: '#090604',
				raised: '#281B15',
			},
		},
	},
	{
		id: 'wisteria',
		name: 'Wisteria',
		description: 'Lavender accents with lilac whites and dusky plum.',
		brand: '#7051A4',
		pressed: '#594084',
		light: {
			text: '#30233F',
			secondary: '#563F6A',
			muted: '#644C76',
			link: '#63418F',
			selection: '#E9DDF5',
			border: '#D6C5E2',
		},
		dark: {
			text: '#F8EFFF',
			secondary: '#DFCFEB',
			muted: '#C4AFD4',
			link: '#DBB9FF',
			selection: '#4B375E',
			border: '#5A466C',
		},
		surfaces: {
			light: {
				rail: '#EDE3F3',
				panel: '#F3EAF8',
				chat: '#FAF4FD',
				raised: '#FFFCFF',
			},
			dark: {
				rail: '#2C2336',
				panel: '#362A42',
				chat: '#3D304B',
				raised: '#483855',
			},
			darker: {
				rail: '#1A1323',
				panel: '#231A2D',
				chat: '#2C2138',
				raised: '#392B48',
			},
			midnight: {
				rail: '#000000',
				panel: '#100B19',
				chat: '#08050C',
				raised: '#24182F',
			},
		},
	},
]

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('toad', { name: 'Toad' })
		for (const palette of palettes) {
			const { id, name, description, light, dark, surfaces } = palette
			themes.registerTheme('toad', id, {
				name,
				description,
				getColors: () => ({
					semantic: {
						light: colors(light, surfaces.light, palette),
						dark: colors(dark, surfaces.dark, palette),
						darker: colors(dark, surfaces.darker, palette),
						midnight: colors(dark, surfaces.midnight, palette),
					},
				}),
			})
		}
	},
})
