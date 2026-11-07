import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { createDirectMessagesEntryPatcher } from './button'

export default plugin({
	start({ cleanup }) {
		const patchEntry = createDirectMessagesEntryPatcher()

		cleanup(
			before(ReactJSXRuntime, 'jsx', patchEntry),
			before(ReactJSXRuntime, 'jsxs', patchEntry),
		)
	},
})
