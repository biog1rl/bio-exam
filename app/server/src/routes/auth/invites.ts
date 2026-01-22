import { randomBytes, createHash } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Router, type Request } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { invites, users, userRoles } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'

const router = Router()

// ---------- helpers

function sha256Hex(s: string): string {
	return createHash('sha256').update(s).digest('hex')
}

function buildInviteLink(token: string, req: Request): string {
	// Используем Origin из заголовков запроса (если есть)
	if (req.headers.origin) {
		const base = req.headers.origin.replace(/\/$/, '')
		return `${base}/invite/${token}`
	}

	// Иначе строим из protocol и host
	const protocol = req.protocol || (req.get('host')?.includes('localhost') ? 'http' : 'https')
	const host = req.get('host') || req.headers.host || 'localhost:3000'
	const base = `${protocol}://${host}`.replace(/\/$/, '')
	return `${base}/invite/${token}`
}

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/

const normalizeLogin = (raw: unknown): string =>
	String(raw ?? '')
		.trim()
		.toLowerCase()

// Zod-схемы с нормализацией (preprocess)
const CreateInviteSchema = z.object({
	userId: z.string().uuid().optional(),
	login: z.preprocess(normalizeLogin, z.string()).optional(), // нормализуем тут
	firstName: z.string().trim().optional(),
	lastName: z.string().trim().optional(),
	position: z.string().trim().optional(),
	roleKey: z.string().trim().min(1, 'Role is required').optional(), // опционально, если перегенерируем для существующего пользователя
	showInTeam: z.boolean().optional(),
})

const AcceptSchema = z.object({
	token: z.string().min(8, 'Invalid token'),
	login: z.preprocess(normalizeLogin, z.string().regex(LOGIN_RE, 'Login must be 3–32 chars (a–z, 0–9, . _ -)')),
	firstName: z.string().trim().optional(),
	lastName: z.string().trim().optional(),
	password: z.string().min(6, 'Password must be at least 6 chars'),
})

// ---------- create / recreate invite (protected)

router.post('/', sessionRequired(), requirePerm('users', 'invite'), async (req, res, next) => {
	try {
		const parsed = CreateInviteSchema.safeParse(req.body)
		if (!parsed.success) {
			console.error('INVITES/CREATE bad body:', parsed.error.flatten())
			return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		}
		const body = parsed.data
	
		let userId: string | undefined
	
		if (!body.userId) {
			const login = body.login || null
			if (login && !LOGIN_RE.test(login)) {
				return res.status(400).json({ error: 'Login is invalid' })
			}
	
			await db.transaction(async (tx) => {
				const [u] = await tx
					.insert(users)
					.values({
						login,
						firstName: body.firstName ?? null,
						lastName: body.lastName ?? null,
						position: body.position ?? null,
						isActive: false,
						createdBy: req.authUser?.id ?? null,
						showInTeam: body.showInTeam ?? false,
					})
					.returning({ id: users.id })
				userId = u.id
	
				// Назначаем роль пользователю
				if (body.roleKey) {
					await tx
						.insert(userRoles)
						.values({
							userId: u.id,
							roleKey: body.roleKey,
						})
						.onConflictDoNothing()
				}
			})
		} else {
			userId = body.userId
			if (!userId) {
				return res.status(400).json({ error: 'User ID is required' })
			}
			const u = await db.query.users.findFirst({ where: eq(users.id, userId) })
			if (!u) return res.status(404).json({ error: 'User not found' })

			// Если перегенерируем ссылку для существующего пользователя и roleKey не указан,
			// получаем первую роль пользователя из БД
			if (!body.roleKey) {
				const userRole = await db.query.userRoles.findFirst({
					where: eq(userRoles.userId, userId),
				})
				if (userRole) {
					body.roleKey = userRole.roleKey
				}
			}
		}
	
		if (!userId) {
			return res.status(500).json({ error: 'Failed to create or find user' })
		}

		// Проверяем, что roleKey есть (обязателен для назначения роли новому пользователю)
		if (!body.roleKey) {
			return res.status(400).json({ error: 'Role is required' })
		}
	
		await db.delete(invites).where(eq(invites.userId, userId))
	
		const token = randomBytes(24).toString('hex')
		const tokenHash = sha256Hex(token)
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
	
		await db.insert(invites).values({
			userId,
			tokenHash,
			expiresAt,
			consumedAt: null,
			createdBy: req.authUser?.id ?? null,
		})
	
		return res.json({ inviteLink: buildInviteLink(token, req), userId })
	} catch (e) {
		next(e)
	}
})

// ---------- validate token (public)

router.get('/validate/:token', async (req, res, next) => {
	try {
		const token = req.params.token
		if (!token || token.length < 8) {
			return res.status(404).json({ error: 'Invalid token' })
		}

		const tokenHash = sha256Hex(token)
		const inv = await db.query.invites.findFirst({ where: eq(invites.tokenHash, tokenHash) })
		if (!inv || inv.consumedAt || inv.expiresAt < new Date()) {
			return res.status(404).json({ error: 'Invalid token' })
		}

		const u = await db.query.users.findFirst({ where: eq(users.id, inv.userId) })
		if (!u) return res.status(404).json({ error: 'User not found' })

		return res.json({
			firstName: u.firstName ?? '',
			lastName: u.lastName ?? '',
			login: u.login ?? '',
		})
	} catch (e) {
		next(e)
	}
})

// ---------- accept (public)

router.post('/accept', async (req, res, next) => {
	try {
		const parsed = AcceptSchema.safeParse(req.body)
		if (!parsed.success) {
			console.error('INVITES/ACCEPT bad body:', parsed.error.flatten())
			return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		}

		const { token, login, firstName, lastName, password } = parsed.data

		const tokenHash = sha256Hex(token)
		const inv = await db.query.invites.findFirst({ where: eq(invites.tokenHash, tokenHash) })
		if (!inv || inv.consumedAt || inv.expiresAt < new Date()) {
			return res.status(404).json({ error: 'Invalid token' })
		}

		// логин не должен быть занят другим пользователем
		const existingLogin = await db.query.users.findFirst({ where: eq(users.login, login) })
		if (existingLogin && existingLogin.id !== inv.userId) {
			return res.status(409).json({ error: 'Login already taken' })
		}

		const { default: bcrypt } = await import('bcryptjs')
		const passwordHash = await bcrypt.hash(password, 12)

		await db.transaction(async (tx) => {
			await tx
				.update(users)
				.set({
					login,
					firstName: firstName ?? null,
					lastName: lastName ?? null,
					passwordHash,
					isActive: true,
					activatedAt: new Date(),
				})
				.where(eq(users.id, inv.userId))

			await tx.update(invites).set({ consumedAt: new Date() }).where(eq(invites.id, inv.id))
		})

		return res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router
