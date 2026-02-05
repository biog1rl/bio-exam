export default function simpleDiffWithCursor(
	a: string,
	b: string,
	cursor: number
): { index: number; insert: string; remove: number } {
	const aLength = a.length
	const bLength = b.length
	let left = 0 // количество одинаковых символов, считая слева
	let right = 0 // количество одинаковых символов, считая справа
	// Итерируемся слева направо, пока не найдем измененный символ
	// Первая итерация учитывает текущую позицию курсора
	while (left < aLength && left < bLength && a[left] === b[left] && left < cursor) {
		left++
	}
	// Итерируемся справа налево, пока не найдем измененный символ
	while (right + left < aLength && right + left < bLength && a[aLength - right - 1] === b[bLength - right - 1]) {
		right++
	}
	// Пытаемся итерироваться дальше слева направо, не обращая внимания на текущую позицию курсора
	while (right + left < aLength && right + left < bLength && a[left] === b[left]) {
		left++
	}
	return {
		index: left,
		insert: b.slice(left, bLength - right),
		remove: aLength - left - right,
	}
}
