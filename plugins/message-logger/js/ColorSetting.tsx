import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { parseHex } from './colors'

interface Props {
	label: string
	value: string
	defaultColor: string
	preview: string
	onChange: (color: string) => Promise<void>
}

export default function ColorSetting({
	label,
	value,
	defaultColor,
	preview,
	onChange,
}: Props) {
	const color = parseHex(value) ?? defaultColor
	const [expanded, setExpanded] = useState(false)
	const [draft, setDraft] = useState(color)
	const [error, setError] = useState('')
	const selected = parseHex(draft)
	const rgb = parseInt((selected ?? color).slice(1), 16)
	const channels = [(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255]
	const adjust = (index: number, value: number) => {
		if (!Number.isFinite(value)) return
		channels[index] = Math.max(0, Math.min(255, Math.round(value)))
		setDraft(
			`#${channels
				.map(c => c.toString(16).padStart(2, '0'))
				.join('')
				.toUpperCase()}`,
		)
		setError('')
	}
	return (
		<Design.Stack spacing={12}>
			<Design.TableRow
				label={label}
				subLabel={color}
				arrow
				trailing={
					<View
						style={{
							width: 24,
							height: 24,
							borderRadius: 12,
							backgroundColor: color,
						}}
						accessible
						accessibilityLabel={`Selected color ${color}`}
					/>
				}
				onPress={() => {
					setDraft(color)
					setError('')
					setExpanded(!expanded)
				}}
			/>
			{expanded && (
				<Design.Stack spacing={12}>
					<Design.Text
						selectable
						variant="text-md/normal"
						style={{ color: selected ?? color }}
					>
						{preview}
					</Design.Text>
					{['Red', 'Green', 'Blue'].map((name, index) => (
						<Design.Stack key={name} spacing={8}>
							<Design.Text variant="text-sm/medium">{`${name}: ${channels[index]}`}</Design.Text>
							<Design.Slider
								minimumValue={0}
								maximumValue={255}
								step={1}
								value={channels[index]}
								onValueChange={value => adjust(index, value)}
							/>
						</Design.Stack>
					))}
					<Design.TextInput
						label={`${label} hex value`}
						placeholder="#RRGGBB"
						value={draft}
						onChange={value => {
							setDraft(value)
							setError('')
						}}
					/>
					{error && <Design.Text variant="text-sm/normal">{error}</Design.Text>}
					<Design.Button
						text={`Apply ${label.toLowerCase()}`}
						variant="primary"
						onPress={async () => {
							if (!selected) {
								setError(
									'Enter a three- or six-digit hex color, such as #ED4245.',
								)
								return
							}
							try {
								await onChange(selected)
								setExpanded(false)
								setError('')
							} catch {
								setError('Could not save this color. Try again.')
							}
						}}
					/>
					<Design.Button
						text={`Reset ${label.toLowerCase()}`}
						variant="secondary"
						onPress={() => {
							setDraft(defaultColor)
							setError('')
						}}
					/>
					<Design.Button
						text={`Cancel ${label.toLowerCase()}`}
						variant="secondary"
						onPress={() => {
							setExpanded(false)
							setError('')
						}}
					/>
				</Design.Stack>
			)}
		</Design.Stack>
	)
}
