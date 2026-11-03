export interface Settings {
	logDeletes: boolean
	logEdits: boolean
	logDeletedAttachments: boolean
	inlineEdits: boolean
	ignoreSelf: boolean
	ignoreBots: boolean
	ignoreUsers: string
	ignoreChannels: string
	ignoreGuilds: string
}

export const DefaultSettings: Settings = {
	logDeletes: true,
	logEdits: true,
	logDeletedAttachments: true,
	inlineEdits: true,
	ignoreSelf: false,
	ignoreBots: true,
	ignoreUsers: '',
	ignoreChannels: '',
	ignoreGuilds: '',
}
