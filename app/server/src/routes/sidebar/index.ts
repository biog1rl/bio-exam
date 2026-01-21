import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { sidebarItems } from '../../db/schema.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'

const router = Router()

// GET /api/sidebar - получить все активные пункты меню
router.get('/', async (_req, res) => {
	try {
		const items = await db
			.select()
			.from(sidebarItems)
			.where(eq(sidebarItems.isActive, true))
			.orderBy(sidebarItems.order)

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
		const { title, url, icon, target = '_self', order = 0 } = req.body

		if (!title || !url || !icon) {
			return res.status(400).json({ error: 'title, url and icon are required' })
		}

		const [newItem] = await db
			.insert(sidebarItems)
			.values({
				title,
				url,
				icon,
				target: target as '_self' | '_blank',
				order,
			})
			.returning()

		res.json({ item: newItem })
	} catch (error) {
		console.error('Error creating sidebar item:', error)
		res.status(500).json({ error: 'Failed to create sidebar item' })
	}
})

// PUT /api/sidebar/:id - обновить пункт меню
router.put('/:id', sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const { id } = req.params
		const { title, url, icon, target, order, isActive } = req.body

		const updateData: any = { updatedAt: new Date() }
		if (title !== undefined) updateData.title = title
		if (url !== undefined) updateData.url = url
		if (icon !== undefined) updateData.icon = icon
		if (target !== undefined) updateData.target = target
		if (order !== undefined) updateData.order = order
		if (isActive !== undefined) updateData.isActive = isActive

		const [updatedItem] = await db.update(sidebarItems).set(updateData).where(eq(sidebarItems.id, id)).returning()

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
		const { items } = req.body

		if (!Array.isArray(items)) {
			return res.status(400).json({ error: 'items must be an array' })
		}

		// Обновляем order для каждого элемента
		await Promise.all(
			items.map((item: { id: string; order: number }) =>
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
router.delete('/:id', sessionRequired(), requirePerm('settings', 'manage'), async (req, res) => {
	try {
		const { id } = req.params

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
