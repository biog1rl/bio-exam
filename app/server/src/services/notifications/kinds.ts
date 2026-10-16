import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'
import { checkAttemptAccess } from '../attempt-sessions/index.js'
import { ATTEMPT_GRADED_KIND } from './producers/attempt-graded.js'
import { ATTEMPT_REVIEW_PENDING_KIND } from './producers/attempt-review-pending.js'
import { TEST_ASSIGNED_KIND } from './producers/test-assigned.js'

export const UNKNOWN_KIND_TEXT = 'Новое уведомление'

export type OpenContext = {
	userId: string
	subjectType: string
	subjectId: string
	canReadTest: (testId: string) => Promise<boolean>
	canReviewAttempt: (attemptId: string) => Promise<boolean>
}

type OpenHandler = (ctx: OpenContext) => Promise<string | null>

type KindEntry = { text: (params: unknown) => string; open?: OpenHandler }

const TestTitleParamsSchema = z.object({ testTitle: z.string() })

const ReviewPendingParamsSchema = z.object({ studentName: z.string(), testTitle: z.string() })

const TEST_ASSIGNED_FALLBACK_TEXT = 'Вам назначен тест'

const ATTEMPT_GRADED_FALLBACK_TEXT = 'Работа проверена'

const ATTEMPT_REVIEW_PENDING_FALLBACK_TEXT = 'Работа ждёт проверки'

async function openTestHref(ctx: OpenContext, testId: string): Promise<string | null> {
	const access = await checkAttemptAccess({
		testId,
		userId: ctx.userId,
		canReadTest: () => ctx.canReadTest(testId),
	})
	if (!access.ok) return null
	return `/tests/${encodeURIComponent(access.test.topicSlug)}/${encodeURIComponent(access.test.slug)}`
}

const KINDS: ReadonlyMap<string, KindEntry> = new Map<string, KindEntry>([
	[
		TEST_ASSIGNED_KIND,
		{
			text: (params) => {
				const parsed = TestTitleParamsSchema.safeParse(params)
				if (!parsed.success || parsed.data.testTitle.trim() === '') return TEST_ASSIGNED_FALLBACK_TEXT
				return `${TEST_ASSIGNED_FALLBACK_TEXT} «${parsed.data.testTitle}»`
			},
			open: async (ctx) => {
				if (ctx.subjectType !== 'test') return null
				return openTestHref(ctx, ctx.subjectId)
			},
		},
	],
	[
		ATTEMPT_GRADED_KIND,
		{
			text: (params) => {
				const parsed = TestTitleParamsSchema.safeParse(params)
				if (!parsed.success || parsed.data.testTitle.trim() === '') return ATTEMPT_GRADED_FALLBACK_TEXT
				return `${ATTEMPT_GRADED_FALLBACK_TEXT} «${parsed.data.testTitle}»`
			},
			open: async (ctx) => {
				if (ctx.subjectType !== 'attempt') return null
				const [attempt] = await db
					.select({ testId: testAttempts.testId })
					.from(testAttempts)
					.where(and(eq(testAttempts.id, ctx.subjectId), eq(testAttempts.userId, ctx.userId)))
					.limit(1)
				if (!attempt) return null
				const testHref = await openTestHref(ctx, attempt.testId)
				return testHref ? `${testHref}/attempts/${encodeURIComponent(ctx.subjectId)}` : null
			},
		},
	],
	[
		ATTEMPT_REVIEW_PENDING_KIND,
		{
			text: (params) => {
				const parsed = ReviewPendingParamsSchema.safeParse(params)
				if (!parsed.success || parsed.data.testTitle.trim() === '') return ATTEMPT_REVIEW_PENDING_FALLBACK_TEXT
				return `${parsed.data.studentName} сдал(а) «${parsed.data.testTitle}» — ждёт проверки`
			},
			open: async (ctx) => {
				if (ctx.subjectType !== 'attempt') return null
				if (!(await ctx.canReviewAttempt(ctx.subjectId))) return null
				return `/admin/attempts/${encodeURIComponent(ctx.subjectId)}`
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
