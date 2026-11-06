import { FileModule } from '@valenced/discord/native'

export const storageRoot = 'valenced/messagelogger'

export function documentsPath(relative: string) {
	const root = FileModule.getConstants().DocumentsDirPath.replace(/\/$/, '')
	if (!root.startsWith('/')) throw Error('Documents directory is unavailable')
	return `${root}/${relative}`
}
