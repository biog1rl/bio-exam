import type { PermissionKey } from '@bio-exam/rbac'

import type { Request } from 'express'

export type PermissionCheck = (req: Request, key: PermissionKey) => Promise<boolean>

export type TestScope = { all: true } | { all: false; topicIds: string[] }

export type AccessScope = {
	canReadTest(req: Request, testId: string): Promise<boolean>
	canWriteTest(req: Request, testId: string): Promise<boolean>
	canWriteTopic(req: Request, topicId: string): Promise<boolean>
	canReadUser(req: Request, userId: string): Promise<boolean>
	canReviewAttempt(req: Request, attemptId: string): Promise<boolean>
	testScope(req: Request): Promise<TestScope>
}

export function createAccessScope(check: PermissionCheck): AccessScope {
	return {
		canReadTest: (req, _testId) => check(req, 'tests.read'),
		canWriteTest: (req, _testId) => check(req, 'tests.write'),
		canWriteTopic: (req, _topicId) => check(req, 'tests.write'),
		canReadUser: (req, _userId) => check(req, 'users.read'),
		canReviewAttempt: (req, _attemptId) => check(req, 'tests.read'),
		testScope: async (req) => ((await check(req, 'tests.read')) ? { all: true } : { all: false, topicIds: [] }),
	}
}
