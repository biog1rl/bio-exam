import { describe, expect, test } from 'vitest'

import type { SaveQueueState } from '@/lib/drafts/save-queue'

import { SAVE_INDICATOR_THRESHOLD_MS, saveIndicatorKind, saveIndicatorView } from './save-indicator'
import { Q1 } from './testing'

const NOW = 100_000

function queueState(state: Partial<SaveQueueState> = {}): SaveQueueState {
	return { pending: [], rejected: [], inFlight: null, failure: null, oldestPendingSince: null, ...state }
}

describe('saveIndicatorKind', () => {
	test('порог «Сохранение…» — 1500 мс', () => {
		expect(SAVE_INDICATOR_THRESHOLD_MS).toBe(1500)
	})

	test.each(['awaitingStart', 'starting', 'submitting', 'autoSubmitting', 'submitted', 'blocked'] as const)(
		'вне фазы active (%s) индикатора нет',
		(phase) => {
			expect(
				saveIndicatorKind({
					phase,
					queue: queueState({ failure: { kind: 'retrying', attempt: 1 } }),
					now: NOW,
					hasSession: true,
					walPendingCount: 3,
				})
			).toBeNull()
		}
	)

	test('пустая очередь — saved', () => {
		expect(
			saveIndicatorKind({ phase: 'active', queue: queueState(), now: NOW, hasSession: true, walPendingCount: 0 })
		).toBe('saved')
	})

	test('неподтверждённое младше порога — saved, с порога — saving', () => {
		const input = { phase: 'active' as const, now: NOW, hasSession: true, walPendingCount: 1 }
		expect(
			saveIndicatorKind({
				...input,
				queue: queueState({ pending: [Q1], oldestPendingSince: NOW - SAVE_INDICATOR_THRESHOLD_MS + 1 }),
			})
		).toBe('saved')
		expect(
			saveIndicatorKind({
				...input,
				queue: queueState({ pending: [Q1], oldestPendingSince: NOW - SAVE_INDICATOR_THRESHOLD_MS }),
			})
		).toBe('saving')
	})

	test('повторы после сбоя — offline без порога', () => {
		expect(
			saveIndicatorKind({
				phase: 'active',
				queue: queueState({ pending: [Q1], oldestPendingSince: NOW, failure: { kind: 'retrying', attempt: 1 } }),
				now: NOW,
				hasSession: true,
				walPendingCount: 1,
			})
		).toBe('offline')
	})

	test('остановка после 403 или 404 — device-only', () => {
		expect(
			saveIndicatorKind({
				phase: 'active',
				queue: queueState({
					pending: [Q1],
					oldestPendingSince: NOW - 60_000,
					failure: { kind: 'stopped', status: 403 },
				}),
				now: NOW,
				hasSession: true,
				walPendingCount: 1,
			})
		).toBe('device-only')
	})

	test('отклонённые 400 не держат saving', () => {
		expect(
			saveIndicatorKind({
				phase: 'active',
				queue: queueState({ rejected: [Q1] }),
				now: NOW,
				hasSession: true,
				walPendingCount: 1,
			})
		).toBe('saved')
	})

	test('ревью C-04: без сессии с неподтверждёнными в WAL — offline, без них — saved', () => {
		expect(
			saveIndicatorKind({ phase: 'active', queue: queueState(), now: NOW, hasSession: false, walPendingCount: 1 })
		).toBe('offline')
		expect(
			saveIndicatorKind({ phase: 'active', queue: queueState(), now: NOW, hasSession: false, walPendingCount: 0 })
		).toBe('saved')
	})
})

describe('saveIndicatorView', () => {
	test('тексты и тон по UI-SPEC', () => {
		expect(saveIndicatorView('saved')).toEqual({ text: 'Ответы сохранены', tone: 'muted' })
		expect(saveIndicatorView('saving')).toEqual({ text: 'Сохранение…', tone: 'muted' })
		expect(saveIndicatorView('offline')).toEqual({
			text: 'Нет связи с сервером. Ответы сохранены на этом устройстве',
			tone: 'warning',
		})
		expect(saveIndicatorView('device-only')).toEqual({ text: 'Ответы сохранены на этом устройстве', tone: 'muted' })
	})

	test('в «Сохранение…» один символ многоточия', () => {
		const { text } = saveIndicatorView('saving')
		expect(text.endsWith('…')).toBe(true)
		expect(text.includes('...')).toBe(false)
	})
})
