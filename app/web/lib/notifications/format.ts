const BADGE_LIMIT = 9
const TITLE_PREFIX = /^\(\d+\+?\) /

const INTERNAL_HREF = /^\/(?![/\\])[^\u0000-\u001F\u007F]*$/

const pluralRules = new Intl.PluralRules('ru')

export function badgeLabel(count: number): string {
	return count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count)
}

export function titlePrefix(count: number): string {
	return count > 0 ? `(${badgeLabel(count)}) ` : ''
}

export function withTitlePrefix(title: string, prefix: string): string {
	return prefix + title.replace(TITLE_PREFIX, '')
}

export function bellAccessibleName(count: number): string {
	if (count <= 0) return 'Уведомления'
	return pluralRules.select(count) === 'one'
		? `Уведомления, ${count} непрочитанное`
		: `Уведомления, ${count} непрочитанных`
}

export function isInternalHref(href: string): boolean {
	return INTERNAL_HREF.test(href)
}
