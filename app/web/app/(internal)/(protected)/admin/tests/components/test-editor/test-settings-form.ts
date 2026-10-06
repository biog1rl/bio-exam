import { PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES } from '@bio-exam/exam-core'

import type { Question, Test, TestFormData, TestScoringRules } from '../../types'
import { normalizeQuestionForSave } from '../../types'
import { hasOpenQuestion, PHOTO_WINDOW_SAVE_TOAST, photoWindowSaveError } from './photo-window'

export type TestSettings = {
	topicId: string
	title: string
	slug: string
	description: string
	isPublished: boolean
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null
	redThresholdMinutes: number | null
	warningThresholdMinutes: number | null
	passingScore: number | null
	photoUploadWindowMinutes: number | null
}

export type SavedTest = Pick<Test, keyof TestSettings | 'order'>

export type UpdateTestSettingsBody = TestSettings & { order: number; scoringRules?: TestScoringRules }

export type CreateTestBody = UpdateTestSettingsBody & { questions: Question[] }

export type SettingsSaveError = { message: string; field: 'photoUploadWindowMinutes' | null }

export type SettingsSaveContext = { mode: 'create' | 'edit'; questionCount: number }

const SLUG_PATTERN = /^[a-z0-9-]+$/

type SettingField<K extends keyof TestSettings> = {
	initial: TestSettings[K]
	fromSaved: (saved: SavedTest) => TestSettings[K]
}

const FIELDS: { [K in keyof TestSettings]: SettingField<K> } = {
	topicId: { initial: '', fromSaved: (saved) => saved.topicId },
	title: { initial: '', fromSaved: (saved) => saved.title },
	slug: { initial: '', fromSaved: (saved) => saved.slug },
	description: { initial: '', fromSaved: (saved) => saved.description || '' },
	isPublished: { initial: false, fromSaved: (saved) => saved.isPublished },
	showCorrectAnswer: { initial: true, fromSaved: (saved) => saved.showCorrectAnswer ?? true },
	timeLimitMinutes: { initial: null, fromSaved: (saved) => saved.timeLimitMinutes },
	redThresholdMinutes: { initial: null, fromSaved: (saved) => saved.redThresholdMinutes ?? null },
	warningThresholdMinutes: { initial: null, fromSaved: (saved) => saved.warningThresholdMinutes ?? null },
	passingScore: { initial: null, fromSaved: (saved) => saved.passingScore },
	photoUploadWindowMinutes: {
		initial: PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES,
		fromSaved: (saved) => saved.photoUploadWindowMinutes ?? PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES,
	},
}

const SETTING_KEYS = Object.keys(FIELDS) as (keyof TestSettings)[]

function settingsFrom(pick: (key: keyof TestSettings) => TestSettings[keyof TestSettings]): TestSettings {
	return Object.fromEntries(SETTING_KEYS.map((key) => [key, pick(key)])) as TestSettings
}

export function initialTestForm(): TestFormData {
	return { ...settingsFrom((key) => FIELDS[key].initial), order: 0, questions: [] }
}

export function withSavedSettings(form: TestFormData, saved: SavedTest): TestFormData {
	return { ...form, ...settingsFrom((key) => FIELDS[key].fromSaved(saved)), order: saved.order }
}

export function settingsChanged(form: TestFormData, saved: SavedTest | null): boolean {
	if (!saved) return false
	return SETTING_KEYS.some((key) => form[key] !== FIELDS[key].fromSaved(saved))
}

export function updateSettingsBody(form: TestFormData): UpdateTestSettingsBody {
	return {
		...settingsFrom((key) => form[key]),
		order: form.order,
		...(form.scoringRules === undefined ? {} : { scoringRules: form.scoringRules }),
	}
}

export function createTestBody(form: TestFormData): CreateTestBody {
	return {
		...updateSettingsBody(form),
		questions: form.questions.map((question) => normalizeQuestionForSave(question)),
	}
}

function baseError(form: TestFormData): string | null {
	if (!form.topicId) return 'Выберите тему'
	if (!form.title) return 'Введите название теста'
	if (!form.slug) return 'Введите slug'
	if (form.slug.length < 2 || form.slug.length > 100 || !SLUG_PATTERN.test(form.slug)) {
		return 'Slug: только латинские буквы, цифры и дефисы (2-100 символов)'
	}
	return null
}

export function settingsSaveError(form: TestFormData, context: SettingsSaveContext): SettingsSaveError | null {
	const base = baseError(form)
	if (base) return { message: base, field: null }
	if (context.mode === 'edit' && form.isPublished && context.questionCount === 0) {
		return { message: 'Для публикации добавьте хотя бы один вопрос', field: null }
	}
	if (photoWindowSaveError(form.photoUploadWindowMinutes, hasOpenQuestion(form.questions))) {
		return { message: PHOTO_WINDOW_SAVE_TOAST, field: 'photoUploadWindowMinutes' }
	}
	return null
}

export function photoWindowField(
	form: TestFormData,
	serverError: string | null
): { visible: boolean; error: string | null } {
	const visible = hasOpenQuestion(form.questions)
	return { visible, error: photoWindowSaveError(form.photoUploadWindowMinutes, visible) ?? serverError }
}
