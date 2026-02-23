/**
 * Zod-схемы для эндпоинтов пользователей
 */

import { z } from 'zod'

export const PatchUserSchema = z.object({
	firstName: z.string().trim().max(100).optional(),
	lastName: z.string().trim().max(100).optional(),
	login: z
		.string()
		.trim()
		.regex(/^[a-z0-9._-]{3,32}$/)
		.optional(),
	isActive: z.boolean().optional(),
	roles: z.array(z.string()).optional(),
	birthdate: z
		.string()
		.transform((val: string) => {
			if (!val) return null
			// Если формат дд/мм/гггг - конвертируем в YYYY-MM-DD
			if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
				const [day, month, year] = val.split('/')
				return `${year}-${month}-${day}`
			}
			// Если уже в формате YYYY-MM-DD - оставляем как есть
			if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
				return val
			}
			return null
		})
		.optional()
		.or(z.null()),
	telegram: z.string().trim().max(100).optional(),
	phone: z.string().trim().max(50).optional(),
	email: z.string().email().optional().or(z.literal('')).or(z.null()),
})

// Экспорт типов
export type PatchUser = z.infer<typeof PatchUserSchema>
