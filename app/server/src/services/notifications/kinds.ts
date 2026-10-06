import { z } from 'zod'

import { TEST_ASSIGNED_KIND } from './producers/test-assigned.js'

export const UNKNOWN_KIND_TEXT = 'Новое уведомление'

type KindEntry = { text: (params: unknown) => string }

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
		},
	],
])

export function notificationText(kind: string, params: unknown): string {
	return KINDS.get(kind)?.text(params) ?? UNKNOWN_KIND_TEXT
}
