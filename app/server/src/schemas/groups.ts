import { z } from 'zod'

/** Body для POST /api/groups — создание группы */
export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(200),
  memberIds: z.array(z.string().uuid()).default([]),
})

/** Body для PATCH /api/groups/:groupId — частичное обновление */
export const PatchGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  memberIds: z.array(z.string().uuid()).optional(),
})
