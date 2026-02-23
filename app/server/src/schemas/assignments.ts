import { z } from 'zod'

/** Body for assigning a user to a test (from test side) */
export const AssignUserSchema = z.object({
	userId: z.string().uuid(),
})

/** Body for assigning a test to a user (from user side) */
export const AssignTestSchema = z.object({
	testId: z.string().uuid(),
})
