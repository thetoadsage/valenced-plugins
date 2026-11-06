import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { Settings } from './shared'

type Message = { author?: { id?: string } }
type Reply = {
	type: string
	channel?: { id?: string; guild_id?: string }
	message?: Message
	messageId?: string
	shouldMention?: boolean
	showMentionToggle?: boolean
}
const contains = (list: string, id: string) => list.split(/[\s,]+/).includes(id)

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage: storage }) {
		const patch = (reply: Reply) => {
			if (reply.showMentionToggle === false || reply.shouldMention === false)
				return reply
			try {
				const settings = { ...DefaultSettings, ...storage.cache }
				const channel = reply.channel
				const messages = Stores.MessageStore as unknown as
					| {
							getMessage(channelId: string, messageId: string): Message | null
					  }
					| undefined
				const members = Stores.GuildMemberStore as unknown as
					| {
							getMember(
								guildId: string,
								userId: string,
							): { roles?: string[] } | null
					  }
					| undefined
				const message =
					reply.message ??
					(channel?.id && reply.messageId
						? messages?.getMessage(channel.id, reply.messageId)
						: null)
				const userId = message?.author?.id
				const roles =
					userId && channel?.guild_id
						? members?.getMember(channel.guild_id, userId)?.roles
						: undefined
				const listed = !!(
					userId &&
					(contains(settings.userList, userId) ||
						roles?.some(role => contains(settings.roleList, role)))
				)
				reply.shouldMention = settings.pingListed ? listed : !listed
			} catch {
				// Keep replies usable if Discord's private stores change.
				reply.shouldMention = false
			}
			return reply
		}
		cleanup(
			onFluxEventDispatched<Reply>('CREATE_PENDING_REPLY', patch),
			onFluxEventDispatched<Reply>('CREATE_SHALLOW_PENDING_REPLY', patch),
		)
	},
	SettingsComponent,
})
