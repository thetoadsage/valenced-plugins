import { ToastActionCreators } from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'

interface ChannelRef {
	id: string
}

type ChannelEntry = ChannelRef | { channel: ChannelRef }

type ChannelGroups = Partial<Record<'SELECTABLE' | 'VOCAL', ChannelEntry[]>>

interface GuildStoreApi {
	getGuilds(): Record<string, ChannelRef>
}

interface GuildChannelStoreApi {
	getChannels(guildId: string): ChannelGroups | undefined
}

interface ReadStateStoreApi {
	hasUnread(channelId: string): boolean
	lastMessageId(channelId: string): string
}

interface ThreadStoreApi {
	getActiveJoinedThreadsForGuild(
		guildId: string,
	): Record<string, Record<string, ChannelEntry>> | undefined
}

interface AckTarget {
	channelId: string
	messageId: string
	readStateType: number
}

const ChannelReadState = 0

function toChannel(entry: ChannelEntry): ChannelRef {
	return 'channel' in entry ? entry.channel : entry
}

function requireStores() {
	const guilds = Stores.GuildStore as unknown as GuildStoreApi | undefined
	const channels = Stores.GuildChannelStore as unknown as
		| GuildChannelStoreApi
		| undefined
	const readState = Stores.ReadStateStore as unknown as
		| ReadStateStoreApi
		| undefined
	const threads = Stores.ActiveJoinedThreadsStore as unknown as
		| ThreadStoreApi
		| undefined

	if (!guilds || !channels || !readState) {
		throw new Error(
			"Discord's channel stores are not available in this version.",
		)
	}

	return { guilds, channels, readState, threads }
}

function collectUnreadTargets(): AckTarget[] {
	const { guilds, channels, readState, threads } = requireStores()
	const seen = new Set<string>()
	const targets: AckTarget[] = []

	const consider = (entry: ChannelEntry) => {
		const { id } = toChannel(entry)
		if (!id || seen.has(id)) return
		seen.add(id)
		if (!readState.hasUnread(id)) return

		targets.push({
			channelId: id,
			messageId: readState.lastMessageId(id),
			readStateType: ChannelReadState,
		})
	}

	for (const { id: guildId } of Object.values(guilds.getGuilds())) {
		const groups = channels.getChannels(guildId) ?? {}
		const entries = [...(groups.SELECTABLE ?? []), ...(groups.VOCAL ?? [])]
		for (const entry of entries) consider(entry)

		const joined = threads?.getActiveJoinedThreadsForGuild(guildId) ?? {}
		for (const byParent of Object.values(joined)) {
			for (const entry of Object.values(byParent)) consider(entry)
		}
	}

	return targets
}

function notify(key: string, text: string, variant?: 'critical') {
	ToastActionCreators.open(key, { text, variant })
}

export function markAllAsRead() {
	try {
		const targets = collectUnreadTargets()

		if (!targets.length) {
			notify('READ_ALL_NOTHING', 'You have no unread channels')
			return
		}

		Dispatcher.dispatch({
			type: 'BULK_ACK',
			context: 'APP',
			channels: targets,
		})

		const noun = targets.length === 1 ? 'channel' : 'channels'
		notify('READ_ALL_DONE', `Marked ${targets.length} ${noun} as read`)
	} catch (error) {
		notify(
			'READ_ALL_ERROR',
			error instanceof Error ? error.message : String(error),
			'critical',
		)
	}
}
