import { hasPermission } from './index.js'
import { createAccessScope } from './scope-rules.js'

export { createAccessScope, type AccessScope, type PermissionCheck, type TestScope } from './scope-rules.js'

const scope = createAccessScope((req, key) => hasPermission(req, key))

export const canReadTest = scope.canReadTest
export const canWriteTest = scope.canWriteTest
export const canWriteTopic = scope.canWriteTopic
export const canReadUser = scope.canReadUser
export const canReviewAttempt = scope.canReviewAttempt
export const testScope = scope.testScope
