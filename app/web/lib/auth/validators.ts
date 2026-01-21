/** JS-валидатор (для кода): латиница/цифры/._- (3–32 символа) */
export const LOGIN_RE = /^[a-z0-9._-]{3,32}$/

/**
 * HTML pattern-строка для <input pattern="...">.
 * ВАЖНО: дефис в классе символов экранируем и даём двойной бэкслеш,
 * чтобы в итоговой строке оказался \- (а не просто -).
 */
export const LOGIN_PATTERN = '^[a-z0-9._\\-]{3,32}$'

export const LOGIN_HINT = 'Латиница/цифры/._- (3–32 символа)'

export function normalizeLogin(s: string): string {
	return s.trim().toLowerCase()
}

export function validateLogin(s: string): string | null {
	const v = normalizeLogin(s)
	if (!v) return 'Укажите логин'
	if (!LOGIN_RE.test(v)) return 'Логин: 3–32 символа, латиница/цифры/._-'
	return null
}
