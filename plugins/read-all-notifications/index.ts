import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { createDirectMessagesEntryPatcher } from './button'
import { createServerBarLayout } from './layout'

export default plugin({
	start({ cleanup, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const layout = createServerBarLayout()
		const patchEntry = createDirectMessagesEntryPatcher(layout)
		const patch = <Args extends [unknown, unknown?, ...unknown[]]>(
			args: Args,
		): Args => layout.patch(patchEntry(args))

		cleanup(
			before(ReactJSXRuntime, 'jsx', patch),
			before(ReactJSXRuntime, 'jsxs', patch),
			layout.stop,
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
})
