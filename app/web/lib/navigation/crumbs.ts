import { HOME_PATH, normalize, parentPagePath } from './paths'
import { sectionByHref } from './sections'

type LabelPattern = { pattern: RegExp; label: string | ((segment: string) => string) }

const MAX_DEPTH = 12

const LABEL_PATTERNS: readonly LabelPattern[] = [
	{ pattern: /^\/tests\/[^/]+\/[^/]+\/start$/, label: 'Прохождение' },
	{ pattern: /^\/admin\/attempts\/[^/]+$/, label: 'Разбор попытки' },
	{ pattern: /^\/admin\/users\/[^/]+$/, label: 'Пользователь' },
	{ pattern: /^\/invite\/[^/]+$/, label: 'Приглашение' },
	{ pattern: /^\/notifications\/[^/]+$/, label: 'Уведомление' },
	{ pattern: /^\/profile\/[^/]+$/, label: (segment) => segment },
]

function lastSegment(href: string): string {
	const segment = href.split('/').filter(Boolean).at(-1) ?? ''
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

export function crumbTrail(pathname: string): string[] {
	const trail: string[] = []
	let current = normalize(pathname)
	while (current !== '/' && current !== HOME_PATH && trail.length < MAX_DEPTH) {
		trail.unshift(current)
		current = parentPagePath(current)
	}
	return trail
}

export function staticCrumbLabel(href: string): string | null {
	const section = sectionByHref(href)
	if (section) return section.title
	const match = LABEL_PATTERNS.find(({ pattern }) => pattern.test(href))
	if (!match) return null
	return typeof match.label === 'string' ? match.label : match.label(lastSegment(href))
}

export function fallbackCrumbLabel(href: string): string {
	const text = lastSegment(href).replace(/[-_]+/g, ' ').trim()
	return text.charAt(0).toUpperCase() + text.slice(1)
}
