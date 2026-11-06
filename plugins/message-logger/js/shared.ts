export interface Settings {
	deletedColor: string
	editedColor: string
	restoreDeletions: boolean
	saveAttachments: boolean
	maxAttachmentMiB: number
	maxMediaMiB: number
	retentionDays: number
	maxMessages: number
	maxStorageMiB: number
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
	deletedColor: '#ED4245',
	editedColor: '#FAA61A',
	restoreDeletions: false,
	saveAttachments: false,
	maxAttachmentMiB: 5,
	maxMediaMiB: 25,
	retentionDays: 30,
	maxMessages: 1000,
	maxStorageMiB: 5,
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
