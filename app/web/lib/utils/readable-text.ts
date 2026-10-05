export const DEFAULT_AVATAR_COLOR = '#2563EB'

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#182610'
const AA_NORMAL = 4.5

function channel(value: number): number {
	const c = value / 255
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number | null {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
	if (!match) return null
	const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number | null {
	const la = luminance(a)
	const lb = luminance(b)
	if (la === null || lb === null) return null
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function readableTextOn(background: string): string {
	const light = contrastRatio(LIGHT_TEXT, background)
	const dark = contrastRatio(DARK_TEXT, background)
	if (light === null || dark === null) return LIGHT_TEXT
	if (light >= AA_NORMAL) return LIGHT_TEXT
	return dark > light ? DARK_TEXT : LIGHT_TEXT
}
