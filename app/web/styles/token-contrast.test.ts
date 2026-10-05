import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8')
const AA_NORMAL = 4.5

function rootTokens(css: string): Map<string, string> {
	const start = css.indexOf(':root')
	const block = css.slice(start, css.indexOf('}', start))
	const tokens = new Map<string, string>()
	for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens.set(match[1], match[2].trim())
	return tokens
}

function resolve(tokens: Map<string, string>, name: string, depth = 0): string {
	const value = tokens.get(name)
	if (!value) throw new Error(`token --${name} not found`)
	const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value)
	if (reference && depth < 5) return resolve(tokens, reference[1], depth + 1)
	return value
}

function luminance(oklch: string): number {
	const match = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(oklch)
	if (!match) throw new Error(`not an opaque oklch color: ${oklch}`)
	const [lightness, chroma, hue] = match.slice(1).map(Number)
	const h = (hue * Math.PI) / 180
	const a = chroma * Math.cos(h)
	const b = chroma * Math.sin(h)
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	const rgb = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map((channel) => Math.min(1, Math.max(0, channel)))
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function contrast(tokens: Map<string, string>, foreground: string, background: string): number {
	const fg = luminance(resolve(tokens, foreground))
	const bg = luminance(resolve(tokens, background))
	return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
}

const PAIRS: ReadonlyArray<readonly [string, string]> = [
	['foreground', 'background'],
	['card-foreground', 'card'],
	['popover-foreground', 'popover'],
	['muted-foreground', 'background'],
	['muted-foreground', 'card'],
	['muted-foreground', 'secondary'],
	['muted-foreground', 'muted'],
	['secondary-foreground', 'secondary'],
	['accent-foreground', 'accent'],
	['primary-foreground', 'primary'],
	['primary', 'background'],
	['primary', 'card'],
	['destructive', 'background'],
	['destructive', 'card'],
	['sidebar-foreground', 'sidebar'],
	['sidebar-accent-foreground', 'sidebar-accent'],
	['sidebar-primary-foreground', 'sidebar-primary'],
]

describe('контраст токенов светлой темы', () => {
	const tokens = rootTokens(CSS)

	it.each(PAIRS)('%s на %s — не ниже 4,5:1', (foreground, background) => {
		expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(AA_NORMAL)
	})
})
