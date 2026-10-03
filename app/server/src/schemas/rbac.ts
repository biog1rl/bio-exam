/**
 * Zod-схемы для RBAC эндпоинтов (управление правами доступа)
 */

import { z } from 'zod'

export const GrantSchema = z.object({
	roleKey: z.string(),
	domain: z.string(),
	action: z.string(),
	allow: z.boolean(),
})

export const DeleteGrantSchema = GrantSchema.omit({ allow: true })

export const UserGrantSchema = z.object({
	userId: z.string().uuid(),
	domain: z.string(),
	action: z.string(),
	allow: z.boolean(),
})

export const DeleteUserGrantSchema = UserGrantSchema.omit({ allow: true })

export const PageRuleSchema = z.object({
	id: z.string().uuid().optional(),
	pattern: z.string().min(1),
	domain: z.string(),
	action: z.string(),
	exact: z.boolean().optional().default(false),
	enabled: z.boolean().optional().default(true),
})

export const PatchPageRuleSchema = PageRuleSchema.partial({
	pattern: true,
	domain: true,
	action: true,
})

// Экспорт типов
export type Grant = z.infer<typeof GrantSchema>
export type DeleteGrant = z.infer<typeof DeleteGrantSchema>
export type UserGrant = z.infer<typeof UserGrantSchema>
export type DeleteUserGrant = z.infer<typeof DeleteUserGrantSchema>
export type PageRule = z.infer<typeof PageRuleSchema>
export type PatchPageRule = z.infer<typeof PatchPageRuleSchema>
