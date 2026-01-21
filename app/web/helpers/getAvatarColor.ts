/**
 * Генерирует цвет для аватара на основе строки (имени пользователя)
 */
export function getAvatarColor(name: string): string {
	// Простая хеш-функция для генерации числа из строки
	let hash = 0
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash)
	}

	// Генерируем HSL цвет с фиксированной насыщенностью и яркостью
	const hue = Math.abs(hash) % 360
	return `hsl(${hue}, 70%, 50%)`
}

/**
 * Генерирует инициалы из имени и фамилии
 */
export function getInitials(firstName?: string | null, lastName?: string | null): string {
	const first = firstName?.charAt(0)?.toUpperCase() || ''
	const last = lastName?.charAt(0)?.toUpperCase() || ''
	return first + last
}
