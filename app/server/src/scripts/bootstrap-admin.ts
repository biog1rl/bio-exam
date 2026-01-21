import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/index.js'
import { roles, userRoles, users } from '../db/schema.js'

async function main(): Promise<void> {
	const LOGIN = (process.env.ADMIN_BOOTSTRAP_LOGIN ?? '').trim().toLowerCase()
	const PLAIN = process.env.ADMIN_BOOTSTRAP_PASSWORD
	const HASH = process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH

	if (!LOGIN) {
		throw new Error('Set ADMIN_BOOTSTRAP_LOGIN in app/server/.env')
	}
	if (!PLAIN && !HASH) {
		throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD or ADMIN_BOOTSTRAP_PASSWORD_HASH in app/server/.env')
	}

	const passwordHash = HASH ? HASH : await bcrypt.hash(PLAIN ?? '', 12)

	// 1) Убедимся, что есть роль admin
	await db.insert(roles).values({ key: 'admin' }).onConflictDoNothing()

	// 2) Найдём пользователя по login
	const existing = await db.query.users.findFirst({
		where: eq(users.login, LOGIN),
	})

	let userId: string

	if (existing) {
		await db
			.update(users)
			.set({
				login: LOGIN,
				isActive: true,
				passwordHash,
				name: existing.name ?? 'Administrator',
				firstName: existing.firstName ?? 'Admin',
				lastName: existing.lastName ?? null,
			})
			.where(eq(users.id, existing.id))
		userId = existing.id
		console.log(`Updated admin user: ${userId}`)
	} else {
		const [created] = await db
			.insert(users)
			.values({
				login: LOGIN,
				isActive: true,
				passwordHash,
				name: 'Administrator',
				firstName: 'Admin',
				lastName: null,
			})
			.returning({ id: users.id })
		userId = created.id
		console.log(`Created admin user: ${userId}`)
	}

	// 3) Выдать роль admin
	await db
		.insert(userRoles)
		.values({ userId, roleKey: 'admin' })
		.onConflictDoNothing({ target: [userRoles.userId, userRoles.roleKey] })

	console.log('Admin bootstrap done ✓')
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
