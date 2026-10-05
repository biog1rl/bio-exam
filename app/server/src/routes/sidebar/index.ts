import { canOpenPath } from '@bio-exam/rbac'

import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { sidebarItems } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { requestAccess } from '../../services/access-policy/index.js'
import { SidebarItemCreateSchema, SidebarItemUpdateSchema, SidebarReorderSchema, badRequestBody } from './schema.js'

const router = Router()

// GET /api/sidebar - получить все активные пункты меню
router.get('/', sessionRequired(), async (req, res) => {
	try {
		const access = await requestAccess(req)
		const rows = await db.select().from(sidebarItems).where(eq(sidebarItems.isActive, true)).orderBy(sidebarItems.order)
		const items = rows.filter((row) => canOpenPath(access.permissions, row.url))

		res.json({ items })
	} catch (error) {
		console.error('Error fetching sidebar items:', error)
		res.status(500).json({ error: 'Failed to fetch sidebar items' })
	}
})

// GET /api/sidebar/all - получить все пункты (включая неактивные) - только для админов
router.get('/all', sessionRequired(), requirePerm('settings', 'manage'), async (_req, res) => {
	try {
		const items = await db.select().from(sidebarItems).orderBy(sidebarItems.order)

		res.json({ items })
	} catch (error) {
		console.error('Error fetching all sidebar items:', error)
		res.status(500).json({ error: 'Failed to fetch sidebar items' })
	}
})

// POST /api/sidebar - создать новый пункт меню
router.post('/', sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const parsed = SidebarItemCreateSchema.safeParse(req.body)
		if (!parsed.success) return res.status(400).json(badRequestBody(parsed.error))

		const [newItem] = await db.insert(sidebarItems).values(parsed.data).returning()

		res.json({ item: newItem })
	} catch (error) {
		console.error('Error creating sidebar item:', error)
		res.status(500).json({ error: 'Failed to create sidebar item' })
	}
})

// PUT /api/sidebar/:id - обновить пункт меню
router.put('/:id', validateUUID('id'), sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const id = req.params.id as string
		const parsed = SidebarItemUpdateSchema.safeParse(req.body)
		if (!parsed.success) return res.status(400).json(badRequestBody(parsed.error))

		const [updatedItem] = await db
			.update(sidebarItems)
			.set({ ...parsed.data, updatedAt: new Date() })
			.where(eq(sidebarItems.id, id))
			.returning()

		if (!updatedItem) {
			return res.status(404).json({ error: 'Sidebar item not found' })
		}

		res.json({ item: updatedItem })
	} catch (error) {
		console.error('Error updating sidebar item:', error)
		res.status(500).json({ error: 'Failed to update sidebar item' })
	}
})

// PATCH /api/sidebar/reorder - изменить порядок всех пунктов
router.patch('/reorder', sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const parsed = SidebarReorderSchema.safeParse(req.body)
		if (!parsed.success) return res.status(400).json(badRequestBody(parsed.error))

		// Обновляем order для каждого элемента
		await Promise.all(
			parsed.data.items.map((item) =>
				db.update(sidebarItems).set({ order: item.order, updatedAt: new Date() }).where(eq(sidebarItems.id, item.id))
			)
		)

		const updatedItems = await db.select().from(sidebarItems).orderBy(sidebarItems.order)

		res.json({ items: updatedItems })
	} catch (error) {
		console.error('Error reordering sidebar items:', error)
		res.status(500).json({ error: 'Failed to reorder sidebar items' })
	}
})

// DELETE /api/sidebar/:id - удалить пункт меню
router.delete('/:id', validateUUID('id'), sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const id = req.params.id as string

		const [deleted] = await db.delete(sidebarItems).where(eq(sidebarItems.id, id)).returning()

		if (!deleted) {
			return res.status(404).json({ error: 'Sidebar item not found' })
		}

		res.json({ success: true })
	} catch (error) {
		console.error('Error deleting sidebar item:', error)
		res.status(500).json({ error: 'Failed to delete sidebar item' })
	}
})

export default router
