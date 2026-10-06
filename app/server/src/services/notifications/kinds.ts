import { z } from 'zod'

import { checkAttemptAccess } from '../attempt-sessions/index.js'
import { TEST_ASSIGNED_KIND } from './producers/test-assigned.js'

export const UNKNOWN_KIND_TEXT = 'Новое уведомление'

export type OpenContext = {
	userId: string
	subjectType: string
	subjectId: string
	canReadTest: (testId: string) => Promise<boolean>
}

type OpenHandler = (ctx: OpenContext) => Promise<string | null>

type KindEntry = { text: (params: unknown) => string; open?: OpenHandler }

const TestAssignedParamsSchema = z.object({ testTitle: z.string() })

const TEST_ASSIGNED_FALLBACK_TEXT = 'Вам назначен тест'

const KINDS: ReadonlyMap<string, KindEntry> = new Map<string, KindEntry>([
	[
		TEST_ASSIGNED_KIND,
		{
			text: (params) => {
				const parsed = TestAssignedParamsSchema.safeParse(params)
				if (!parsed.success || parsed.data.testTitle.trim() === '') return TEST_ASSIGNED_FALLBACK_TEXT
				return `${TEST_ASSIGNED_FALLBACK_TEXT} «${parsed.data.testTitle}»`
			},
			open: async (ctx) => {
				if (ctx.subjectType !== 'test') return null
				const access = await checkAttemptAccess({
					testId: ctx.subjectId,
					userId: ctx.userId,
					canReadTest: () => ctx.canReadTest(ctx.subjectId),
				})
				if (!access.ok) return null
				return `/tests/${encodeURIComponent(access.test.topicSlug)}/${encodeURIComponent(access.test.slug)}`
			},
		},
	],
])

export function notificationText(kind: string, params: unknown): string {
	return KINDS.get(kind)?.text(params) ?? UNKNOWN_KIND_TEXT
}

export function kindOpenHandler(kind: string): OpenHandler | null {
	return KINDS.get(kind)?.open ?? null
}
