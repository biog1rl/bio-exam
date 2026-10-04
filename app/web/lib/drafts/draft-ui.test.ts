import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
	autosaveStatusView,
	DRAFT_TOAST,
	DRAFT_TOAST_ID,
	leaveDialogDescription,
	RETRY_SAVE_LABEL,
	UNSAVED_CHANGES_TEXT,
} from './draft-ui'
import type { QuestionDraftAutosaveSnapshot } from './question-draft-autosave'

function snapshot(patch: Partial<QuestionDraftAutosaveSnapshot>): QuestionDraftAutosaveSnapshot {
	return {
		status: 'saved',
		error: null,
		display: 'saved',
		hasUnsavedWrite: false,
		leaving: false,
		canRestoreCopy: false,
		...patch,
	}
}

test('autosaveStatusView: saved → Сохранено без Повторить', () => {
	assert.deepEqual(autosaveStatusView(snapshot({})), {
		icon: 'check',
		text: 'Сохранено',
		tone: 'muted',
		canRetry: false,
	})
})

test('autosaveStatusView: display saving → Сохранение… одним символом многоточия', () => {
	const view = autosaveStatusView(snapshot({ status: 'saving', display: 'saving', hasUnsavedWrite: true }))
	assert.deepEqual(view, { icon: 'loader', text: 'Сохранение…', tone: 'muted', canRetry: false })
})

test('autosaveStatusView: в окне порога pending показывает прежнее состояние', () => {
	const view = autosaveStatusView(snapshot({ status: 'pending', display: 'saved', hasUnsavedWrite: true }))
	assert.equal(view?.text, 'Сохранено')
})

test('autosaveStatusView: failed и conflict → Не сохранено с Повторить', () => {
	for (const error of ['failed', 'conflict'] as const) {
		assert.deepEqual(
			autosaveStatusView(snapshot({ status: 'error', error, display: 'error', hasUnsavedWrite: true })),
			{ icon: 'alert', text: 'Не сохранено', tone: 'error', canRetry: true }
		)
	}
})

test('autosaveStatusView: forbidden и gone без Повторить', () => {
	assert.deepEqual(autosaveStatusView(snapshot({ status: 'error', error: 'forbidden', display: 'error' })), {
		icon: 'alert',
		text: 'Не сохранено: нет прав на черновик',
		tone: 'error',
		canRetry: false,
	})
	assert.deepEqual(autosaveStatusView(snapshot({ status: 'error', error: 'gone', display: 'error' })), {
		icon: 'alert',
		text: 'Не сохранено: черновик удалён',
		tone: 'error',
		canRetry: false,
	})
})

test('autosaveStatusView: closed → null', () => {
	assert.equal(autosaveStatusView(snapshot({ status: 'closed', display: 'hidden' })), null)
})

test('leaveDialogDescription: тексты UI-SPEC Поверхность 3', () => {
	assert.equal(leaveDialogDescription(null), 'Уйти без сохранения?')
	assert.equal(leaveDialogDescription({ ok: true }), 'Уйти без сохранения?')
	assert.equal(
		leaveDialogDescription({ ok: false, reason: 'failed' }),
		'Последние правки не дошли до сервера. Они сохранены на этом устройстве и вернутся, когда вы снова откроете черновик.'
	)
	assert.equal(
		leaveDialogDescription({ ok: false, reason: 'forbidden' }),
		'Нет прав на сохранение черновика. Последние правки не попали на сервер.'
	)
	assert.equal(
		leaveDialogDescription({ ok: false, reason: 'gone' }),
		'Черновик удалён. Последние правки не сохранятся.'
	)
})

test('UNSAVED_CHANGES_TEXT и RETRY_SAVE_LABEL', () => {
	assert.deepEqual(UNSAVED_CHANGES_TEXT, {
		title: 'Есть несохранённые изменения',
		description: 'Уйти без сохранения?',
		stay: 'Остаться',
		leave: 'Выйти',
	})
	assert.equal(RETRY_SAVE_LABEL, 'Повторить сохранение')
})

test('DRAFT_TOAST и DRAFT_TOAST_ID дословно по UI-SPEC Поверхность 5', () => {
	assert.deepEqual(DRAFT_TOAST, {
		conflictResolved: 'Черновик был изменён в другой вкладке. Сохранена версия из этой вкладки.',
		conflictRepeated:
			'Черновик снова изменён в другой вкладке. Закройте другие вкладки с этим черновиком и нажмите «Повторить сохранение».',
		restored: 'Восстановлены правки, которые не успели сохраниться на сервере.',
		diverged: 'Черновик изменён в другом месте. Открыта версия с сервера, правки с этого устройства не применены.',
		restoreCopyAction: 'Восстановить правки с этого устройства',
		forbidden: 'Нет прав на сохранение черновика. Обратитесь к администратору.',
		gone: 'Черновик удалён. Скопируйте текст, если он ещё нужен, и создайте новый вопрос.',
	})
	assert.deepEqual(DRAFT_TOAST_ID, {
		forbidden: 'question-draft-forbidden',
		gone: 'question-draft-gone',
		restored: 'question-draft-restored',
		diverged: 'question-draft-diverged',
	})
})
