const SUPPORTED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'sms:', 'tel:'])

export function sanitizeUrl(url: string): string {
	try {
		const parsedUrl = new URL(url)
		if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
			return 'about:blank'
		}
	} catch {
		return url
	}
	return url
}

// Источник: https://stackoverflow.com/a/8234912/2013580
const urlRegExp = new RegExp(
	/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[\w]*))?)/
)
export function validateUrl(url: string): boolean {
	// TODO Исправить UI для вставки ссылок; он никогда не должен по умолчанию предлагать невалидный URL, например https://.
	// Возможно, стоит показать диалог, где пользователь сможет ввести URL перед вставкой.
	return url === 'https://' || urlRegExp.test(url)
}
