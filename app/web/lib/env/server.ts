import 'server-only'
import { z } from 'zod'

const serverSchema = z.object({
	// База/Prisma
	DATABASE_URL: z.string(),

	// Legacy NextAuth (optional, kept for backwards compatibility)
	NEXTAUTH_SECRET: z.string().optional(),
	NEXTAUTH_LOGIN: z.string().optional(),
	NEXTAUTH_PASSWORD: z.string().optional(),
	NEXTAUTH_URL: z.string().optional(),
	NEXTAUTH_URL_IP: z.string().optional(),

	// App origin
	APP_ORIGIN: z.string().optional(),

	// GitLab
	GITLAB_TOKEN: z.string(),
	GITLAB_REPO: z.string(),
	GITLAB_BRANCH_MASTER: z.string(),
	GITLAB_BRANCH_FALLBACK: z.string(),
})

const parsed = serverSchema.safeParse(process.env)
if (!parsed.success) {
	console.error('❌ Invalid server env:', parsed.error.flatten().fieldErrors)
	throw new Error('Invalid server env')
}
export const env = parsed.data
