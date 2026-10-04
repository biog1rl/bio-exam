import type { QuestionDraftAutosaveSnapshot } from './question-draft-autosave'

export type LeaveFlushResult = { ok: true } | { ok: false; reason: 'failed' | 'forbidden' | 'gone' }

export const UNSAVED_CHANGES_TEXT: { title: string; description: string; stay: string; leave: string } = {
	title: 'Есть несохранённые изменения',
	description: 'Уйти без сохранения?',
	stay: 'Остаться',
	leave: 'Выйти',
}

const LEAVE_FAILURE_TEXT: Record<'failed' | 'forbidden' | 'gone', string> = {
	failed:
		'Последние правки не дошли до сервера. Они сохранены на этом устройстве и вернутся, когда вы снова откроете черновик.',
	forbidden: 'Нет прав на сохранение черновика. Последние правки не попали на сервер.',
	gone: 'Черновик удалён. Последние правки не сохранятся.',
}

export function leaveDialogDescription(result: LeaveFlushResult | null): string {
	if (!result || result.ok) return UNSAVED_CHANGES_TEXT.description
	return LEAVE_FAILURE_TEXT[result.reason]
}

export type AutosaveStatusView = {
	icon: 'check' | 'loader' | 'alert'
	text: string
	tone: 'muted' | 'error'
	canRetry: boolean
}

export const RETRY_SAVE_LABEL = 'Повторить сохранение' as const

const SAVED_VIEW: AutosaveStatusView = { icon: 'check', text: 'Сохранено', tone: 'muted', canRetry: false }
const SAVING_VIEW: AutosaveStatusView = { icon: 'loader', text: 'Сохранение…', tone: 'muted', canRetry: false }
const FAILED_VIEW: AutosaveStatusView = { icon: 'alert', text: 'Не сохранено', tone: 'error', canRetry: true }
const FORBIDDEN_VIEW: AutosaveStatusView = {
	icon: 'alert',
	text: 'Не сохранено: нет прав на черновик',
	tone: 'error',
	canRetry: false,
}
const GONE_VIEW: AutosaveStatusView = {
	icon: 'alert',
	text: 'Не сохранено: черновик удалён',
	tone: 'error',
	canRetry: false,
}

export function autosaveStatusView(snapshot: QuestionDraftAutosaveSnapshot): AutosaveStatusView | null {
	if (snapshot.display === 'hidden') return null
	if (snapshot.display === 'saved') return SAVED_VIEW
	if (snapshot.display === 'saving') return SAVING_VIEW
	if (snapshot.error === 'forbidden') return FORBIDDEN_VIEW
	if (snapshot.error === 'gone') return GONE_VIEW
	return FAILED_VIEW
}

export const DRAFT_TOAST: {
	conflictResolved: string
	conflictRepeated: string
	restored: string
	diverged: string
	restoreCopyAction: string
	forbidden: string
	gone: string
} = {
	conflictResolved: 'Черновик был изменён в другой вкладке. Сохранена версия из этой вкладки.',
	conflictRepeated:
		'Черновик снова изменён в другой вкладке. Закройте другие вкладки с этим черновиком и нажмите «Повторить сохранение».',
	restored: 'Восстановлены правки, которые не успели сохраниться на сервере.',
	diverged: 'Черновик изменён в другом месте. Открыта версия с сервера, правки с этого устройства не применены.',
	restoreCopyAction: 'Восстановить правки с этого устройства',
	forbidden: 'Нет прав на сохранение черновика. Обратитесь к администратору.',
	gone: 'Черновик удалён. Скопируйте текст, если он ещё нужен, и создайте новый вопрос.',
}

export const DRAFT_TOAST_ID = {
	forbidden: 'question-draft-forbidden',
	gone: 'question-draft-gone',
	restored: 'question-draft-restored',
	diverged: 'question-draft-diverged',
} as const
