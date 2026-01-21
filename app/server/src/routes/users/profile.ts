import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { sessionRequired } from '../../middleware/auth/session.js'

const router = Router()

// Валидация для обновления профиля
const updateProfileSchema = z.object({
	firstName: z.string().min(1, 'Имя обязательно').max(50, 'Имя слишком длинное').optional(),
	lastName: z.string().min(1, 'Фамилия обязательна').max(50, 'Фамилия слишком длинная').optional(),
	login: z.string().min(3, 'Логин должен содержать минимум 3 символа').max(30, 'Логин слишком длинный').optional(),
	avatar: z.string().url('Некорректный URL аватара').optional().or(z.literal('')).or(z.null()),
	avatarColor: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Некорректный цвет')
		.optional(),
	initials: z.string().min(1, 'Инициалы обязательны').max(5, 'Максимум 5 символов').optional(),
	position: z.string().trim().max(100, 'Должность слишком длинная').optional(),
	birthdate: z
		.string()
		.transform((val) => {
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
	telegram: z.string().trim().max(100, 'Telegram слишком длинный').optional(),
	phone: z.string().trim().max(50, 'Телефон слишком длинный').optional(),
	email: z.string().email('Некорректный email').optional().or(z.literal('')).or(z.null()),
	showInTeam: z.boolean().optional(),
})

// Валидация для смены пароля
const changePasswordSchema = z.object({
	oldPassword: z.string().min(1, 'Старый пароль обязателен'),
	newPassword: z.string().min(5, 'Новый пароль должен содержать минимум 5 символов'),
})

// PATCH /api/users/profile - обновление профиля
router.patch('/', sessionRequired(), async (req, res) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}

		const body = updateProfileSchema.parse(req.body)

		// Проверяем, что логин уникален (если он изменяется)
		if (body.login) {
			const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.login, body.login)).limit(1)

			if (existingUser.length > 0 && existingUser[0].id !== userId) {
				return res.status(409).json({ error: 'Логин уже используется' })
			}
		}

		// Обновляем пользователя
		const updatedUser = await db
			.update(users)
			.set({
				firstName: body.firstName,
				lastName: body.lastName,
				login: body.login,
				avatar: body.avatar === '' ? null : body.avatar,
				avatarColor: body.avatarColor,
				initials: body.initials,
				position: body.position,
				birthdate: body.birthdate,
				telegram: body.telegram,
				phone: body.phone,
				email: body.email === '' ? null : body.email,
				showInTeam: body.showInTeam,
			})
			.where(eq(users.id, userId))
			.returning({
				id: users.id,
				login: users.login,
				firstName: users.firstName,
				lastName: users.lastName,
				avatar: users.avatar,
				avatarColor: users.avatarColor,
				initials: users.initials,
				position: users.position,
				birthdate: users.birthdate,
				telegram: users.telegram,
				phone: users.phone,
				email: users.email,
				showInTeam: users.showInTeam,
			})

		if (updatedUser.length === 0) {
			return res.status(404).json({ error: 'Пользователь не найден' })
		}

		res.json({ user: updatedUser[0] })
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.log('Zod validation error:', error.issues)
			return res.status(400).json({ error: 'Ошибка валидации', details: error.issues, message: 'Validation failed' })
		}
		console.error('Error updating profile:', error)
		res.status(500).json({ error: 'Внутренняя ошибка сервера' })
	}
})

// POST /api/users/profile/password - смена пароля
router.post('/password', sessionRequired(), async (req, res) => {
	try {
		const userId = req.authUser?.id
		if (!userId) {
			return res.status(401).json({ error: 'Не авторизован' })
		}

		const { oldPassword, newPassword } = changePasswordSchema.parse(req.body)

		// Получаем текущий хеш пароля
		const user = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1)

		if (user.length === 0) {
			return res.status(404).json({ error: 'Пользователь не найден' })
		}

		// Проверяем старый пароль
		const isOldPasswordValid = await bcrypt.compare(oldPassword, user[0].passwordHash || '')
		if (!isOldPasswordValid) {
			return res.status(400).json({ error: 'Неверный старый пароль' })
		}

		// Хешируем новый пароль
		const newPasswordHash = await bcrypt.hash(newPassword, 10)

		// Обновляем пароль
		await db.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId))

		res.json({ message: 'Пароль успешно изменен' })
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json({ error: 'Ошибка валидации', details: error.issues })
		}
		console.error('Error changing password:', error)
		res.status(500).json({ error: 'Внутренняя ошибка сервера' })
	}
})

export default router
