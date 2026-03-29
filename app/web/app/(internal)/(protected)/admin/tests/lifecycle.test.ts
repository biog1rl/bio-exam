import assert from 'node:assert/strict'

import { resolveInitialCreateModePersistence } from './lifecycle'

const regularDraftSave = resolveInitialCreateModePersistence({
	questionCount: 0,
	requestedPublicationState: false,
})
assert.deepEqual(regularDraftSave, {
	shouldForceDraft: false,
	persistedPublicationState: false,
})

const publishedWithoutQuestions = resolveInitialCreateModePersistence({
	questionCount: 0,
	requestedPublicationState: true,
})
assert.deepEqual(publishedWithoutQuestions, {
	shouldForceDraft: true,
	persistedPublicationState: false,
})

const publishedWithQuestions = resolveInitialCreateModePersistence({
	questionCount: 2,
	requestedPublicationState: true,
})
assert.deepEqual(publishedWithQuestions, {
	shouldForceDraft: false,
	persistedPublicationState: true,
})
