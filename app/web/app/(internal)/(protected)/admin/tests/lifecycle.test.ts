import assert from 'node:assert/strict'
import { test } from 'vitest'

import { resolveInitialCreateModePersistence } from './lifecycle'

test('resolveInitialCreateModePersistence: обычное сохранение черновика не меняет состояние', () => {
	const regularDraftSave = resolveInitialCreateModePersistence({
		questionCount: 0,
		requestedPublicationState: false,
	})
	assert.deepEqual(regularDraftSave, {
		shouldForceDraft: false,
		persistedPublicationState: false,
	})
})

test('resolveInitialCreateModePersistence: публикация без вопросов принудительно становится черновиком', () => {
	const publishedWithoutQuestions = resolveInitialCreateModePersistence({
		questionCount: 0,
		requestedPublicationState: true,
	})
	assert.deepEqual(publishedWithoutQuestions, {
		shouldForceDraft: true,
		persistedPublicationState: false,
	})
})

test('resolveInitialCreateModePersistence: публикация с вопросами сохраняется как опубликованная', () => {
	const publishedWithQuestions = resolveInitialCreateModePersistence({
		questionCount: 2,
		requestedPublicationState: true,
	})
	assert.deepEqual(publishedWithQuestions, {
		shouldForceDraft: false,
		persistedPublicationState: true,
	})
})
