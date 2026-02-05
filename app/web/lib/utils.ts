import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Утилита для объединения имен классов с Tailwind
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// Утилита для форматирования числа в валюту
export function formatCurrency(amount: number, currency = 'USD', options?: Intl.NumberFormatOptions) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		...options,
	}).format(amount)
}

// Утилита для генерации уникального ID
export function generateUniqueId(prefix = 'id') {
	return `${prefix}-${Math.random().toString(36).substring(2, 9)}`
}

// Утилита для обрезки текста
export function truncateText(text: string, maxLength: number) {
	if (text.length <= maxLength) return text
	return text.substring(0, maxLength) + '...'
}

// Утилита для форматирования даты
export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		...options,
	}).format(date)
}

// Утилита для дебаунса вызовов функций
export function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
	let timeout: NodeJS.Timeout | null = null
	return function (...args: Parameters<T>) {
		const later = () => {
			timeout = null
			func(...args)
		}
		if (timeout !== null) {
			clearTimeout(timeout)
		}
		timeout = setTimeout(later, wait)
	}
}

// Утилита для троттлинга вызовов функций
export function throttle<T extends (...args: any[]) => void>(func: T, limit: number) {
	let inThrottle = false
	return function (...args: Parameters<T>) {
		if (!inThrottle) {
			func(...args)
			inThrottle = true
			setTimeout(() => {
				inThrottle = false
			}, limit)
		}
	}
}
