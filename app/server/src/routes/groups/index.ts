import { eq, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { studentGroups, userGroups, users } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { CreateGroupSchema, PatchGroupSchema } from '../../schemas/groups.js'

export const groupsRouter = Router()

// GET /api/groups/my — студенческий эндпоинт (ДОЛЖЕН стоять ПЕРЕД /:groupId)
groupsRouter.get(
  '/my',
  sessionRequired(),
  async (req, res, next) => {
    try {
      const userId = req.authUser!.id
      const rows = await db
        .select({ id: studentGroups.id, name: studentGroups.name })
        .from(userGroups)
        .innerJoin(studentGroups, eq(studentGroups.id, userGroups.groupId))
        .where(eq(userGroups.userId, userId))
        .limit(1)
      res.json({ group: rows[0] ?? null })
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/groups — список всех групп с количеством участников
groupsRouter.get(
  '/',
  sessionRequired(),
  requirePerm('groups', 'manage_groups'),
  async (req, res, next) => {
    try {
      const rows = await db
        .select({
          id: studentGroups.id,
          name: studentGroups.name,
          createdAt: studentGroups.createdAt,
          memberCount: sql<number>`count(${userGroups.userId})::int`.as('memberCount'),
        })
        .from(studentGroups)
        .leftJoin(userGroups, eq(userGroups.groupId, studentGroups.id))
        .groupBy(studentGroups.id, studentGroups.name, studentGroups.createdAt)
        .orderBy(studentGroups.name)
      res.json({ groups: rows })
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/groups/:groupId — детальная информация о группе с участниками
groupsRouter.get(
  '/:groupId',
  validateUUID('groupId'),
  sessionRequired(),
  requirePerm('groups', 'manage_groups'),
  async (req, res, next) => {
    try {
      const { groupId } = req.params as { groupId: string }
      const groupRows = await db
        .select({ id: studentGroups.id, name: studentGroups.name, createdAt: studentGroups.createdAt })
        .from(studentGroups)
        .where(eq(studentGroups.id, groupId))
      if (groupRows.length === 0) {
        res.status(404).json({ error: 'Group not found' })
        return
      }
      const members = await db
        .select({ id: users.id, name: users.name, login: users.login })
        .from(userGroups)
        .innerJoin(users, eq(users.id, userGroups.userId))
        .where(eq(userGroups.groupId, groupId))
      res.json({ group: { ...groupRows[0], members } })
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/groups — создание группы
groupsRouter.post(
  '/',
  sessionRequired(),
  requirePerm('groups', 'manage_groups'),
  async (req, res, next) => {
    try {
      const parsed = CreateGroupSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
        return
      }
      const { name, memberIds } = parsed.data
      const adminId = req.authUser!.id
      let createdGroup: typeof studentGroups.$inferSelect | undefined
      await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(studentGroups)
          .values({ name, createdBy: adminId })
          .returning()
        createdGroup = group
        if (memberIds.length > 0) {
          await tx
            .insert(userGroups)
            .values(memberIds.map((userId) => ({ groupId: group.id, userId })))
            .onConflictDoNothing()
        }
      })
      res.status(201).json({ group: createdGroup })
    } catch (err) {
      next(err)
    }
  }
)

// PATCH /api/groups/:groupId — переименование и/или обновление состава
groupsRouter.patch(
  '/:groupId',
  validateUUID('groupId'),
  sessionRequired(),
  requirePerm('groups', 'manage_groups'),
  async (req, res, next) => {
    try {
      const { groupId } = req.params as { groupId: string }
      const parsed = PatchGroupSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
        return
      }
      const { name, memberIds } = parsed.data
      await db.transaction(async (tx) => {
        if (name !== undefined) {
          await tx
            .update(studentGroups)
            .set({ name, updatedAt: new Date() })
            .where(eq(studentGroups.id, groupId))
        }
        if (memberIds !== undefined) {
          await tx.delete(userGroups).where(eq(userGroups.groupId, groupId))
          if (memberIds.length > 0) {
            await tx
              .insert(userGroups)
              .values(memberIds.map((userId) => ({ groupId, userId })))
          }
        }
      })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/groups/:groupId — удаление группы (user_groups каскадно удаляются)
groupsRouter.delete(
  '/:groupId',
  validateUUID('groupId'),
  sessionRequired(),
  requirePerm('groups', 'manage_groups'),
  async (req, res, next) => {
    try {
      const { groupId } = req.params as { groupId: string }
      await db.delete(studentGroups).where(eq(studentGroups.id, groupId))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }
)

export default groupsRouter
