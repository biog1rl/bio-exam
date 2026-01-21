'use client'

import { useState } from 'react'
import { HexColorPicker, RgbColorPicker, HslColorPicker } from 'react-colorful'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type ColorFormat = 'hex' | 'rgb' | 'hsl'

type Props = {
	value: string
	onChange: (value: string) => void
}

export function ColorPickerField({ value, onChange }: Props) {
	const [format, setFormat] = useState<ColorFormat>('hex')

	return (
		<div className="space-y-2">
			<Tabs value={format} onValueChange={(val) => setFormat(val as ColorFormat)}>
				<TabsList>
					<TabsTrigger value="hex">HEX</TabsTrigger>
					<TabsTrigger value="rgb">RGB</TabsTrigger>
					<TabsTrigger value="hsl">HSL</TabsTrigger>
				</TabsList>

				<TabsContent value="hex">
					<HexColorPicker color={value} onChange={onChange} />
				</TabsContent>

				<TabsContent value="rgb">
					<RgbColorPicker color={parseRgb(value)} onChange={(rgb) => onChange(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)} />
				</TabsContent>

				<TabsContent value="hsl">
					<HslColorPicker color={parseHsl(value)} onChange={(hsl) => onChange(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)} />
				</TabsContent>
			</Tabs>
		</div>
	)
}

// простые парсеры (для примера, можно доработать под oklch)
function parseRgb(input: string) {
	const match = input.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
	return match ? { r: +match[1], g: +match[2], b: +match[3] } : { r: 0, g: 0, b: 0 }
}

function parseHsl(input: string) {
	const match = input.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/)
	return match ? { h: +match[1], s: +match[2], l: +match[3] } : { h: 0, s: 0, l: 0 }
}
