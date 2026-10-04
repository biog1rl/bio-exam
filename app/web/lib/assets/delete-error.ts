const DEFAULT_DELETE_ERROR = 'Не удалось удалить изображение'

export function deleteErrorMessage(_status: number, body: unknown): string {
	if (typeof body === 'object' && body !== null && 'error' in body) {
		const { error } = body as { error: unknown }
		if (typeof error === 'string' && error.trim()) return error
	}
	return DEFAULT_DELETE_ERROR
}
