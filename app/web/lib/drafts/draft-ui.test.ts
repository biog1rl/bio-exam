import assert from 'node:assert/strict'
import { test } from 'vitest'

import { autosaveStatusView, leaveDialogDescription } from './draft-ui'
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

const SAVED = { icon: 'check', text: 'Сохранено', tone: 'muted', canRetry: false } as const

test.each(
	(
		[
			{ name: 'saved → Сохранено без Повторить', cases: [[{}, SAVED]] },
			{
				name: 'display saving → Сохранение… одним символом многоточия',
				cases: [
					[
						{ status: 'saving', display: 'saving', hasUnsavedWrite: true },
						{ icon: 'loader', text: 'Сохранение…', tone: 'muted', canRetry: false },
					],
				],
			},
			{
				name: 'в окне порога pending показывает прежнее состояние',
				cases: [[{ status: 'pending', display: 'saved', hasUnsavedWrite: true }, SAVED]],
			},
			{
				name: 'failed и conflict → Не сохранено с Повторить',
				cases: (['failed', 'conflict'] as const).map((error) => [
					{ status: 'error', error, display: 'error', hasUnsavedWrite: true },
					{ icon: 'alert', text: 'Не сохранено', tone: 'error', canRetry: true },
				]),
			},
			{
				name: 'forbidden и gone без Повторить',
				cases: [
					[
						{ status: 'error', error: 'forbidden', display: 'error' },
						{ icon: 'alert', text: 'Не сохранено: нет прав на черновик', tone: 'error', canRetry: false },
					],
					[
						{ status: 'error', error: 'gone', display: 'error' },
						{ icon: 'alert', text: 'Не сохранено: черновик удалён', tone: 'error', canRetry: false },
					],
				],
			},
			{ name: 'closed → null', cases: [[{ status: 'closed', display: 'hidden' }, null]] },
		] as {
			name: string
			cases: [Partial<QuestionDraftAutosaveSnapshot>, ReturnType<typeof autosaveStatusView>][]
		}[]
	).map(
		(
			row
		): [
			string,
			{
				name: string
				cases: [Partial<QuestionDraftAutosaveSnapshot>, ReturnType<typeof autosaveStatusView>][]
			},
		] => [row.name, row]
	)
)('autosaveStatusView: %s', (_name, { cases }) => {
	for (const [patch, expected] of cases) assert.deepEqual(autosaveStatusView(snapshot(patch)), expected)
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
