import { AnswerValueSchema, QuestionTelemetrySchema, type AnswerValue, type TelemetryMap } from '@bio-exam/exam-core'

import type { ClientAttemptStorage } from '../client-attempt-id'

export type WalRecord = {
	v: 2
	sessionId: string | null
	answers: Record<string, AnswerValue>
	pending: string[]
	position: string | null
	telemetry: TelemetryMap
	telemetryPending: boolean
}

export function emptyWal(sessionId: string | null): WalRecord {
	return { v: 2, sessionId, answers: {}, pending: [], position: null, telemetry: {}, telemetryPending: false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAnswers(value: unknown): Record<string, AnswerValue> {
	const answers: Record<string, AnswerValue> = {}
	if (!isRecord(value)) return answers
	for (const [questionId, raw] of Object.entries(value)) {
		const parsed = AnswerValueSchema.safeParse(raw)
		if (parsed.success) answers[questionId] = parsed.data
	}
	return answers
}

export function parseTelemetry(value: unknown): TelemetryMap {
	const telemetry: TelemetryMap = {}
	if (!isRecord(value)) return telemetry
	for (const [questionId, raw] of Object.entries(value)) {
		const parsed = QuestionTelemetrySchema.safeParse(raw)
		if (parsed.success) telemetry[questionId] = parsed.data
	}
	return telemetry
}

function parseRecord(parsed: Record<string, unknown>, cachedSessionId: string | null): WalRecord {
	if (parsed.v === 2 && isRecord(parsed.answers)) {
		const answers = parseAnswers(parsed.answers)
		const pending = Array.isArray(parsed.pending)
			? parsed.pending.filter(
					(id, index, list): id is string =>
						typeof id === 'string' && answers[id] !== undefined && list.indexOf(id) === index
				)
			: []
		return {
			v: 2,
			sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0 ? parsed.sessionId : null,
			answers,
			pending,
			position: typeof parsed.position === 'string' ? parsed.position : null,
			telemetry: parseTelemetry(parsed.telemetry),
			telemetryPending: parsed.telemetryPending === true,
		}
	}
	const wrapped = isRecord(parsed.answers)
	const answers = parseAnswers(wrapped ? parsed.answers : parsed)
	return {
		v: 2,
		sessionId: cachedSessionId,
		answers,
		pending: Object.keys(answers),
		position: wrapped && typeof parsed.lastQuestionId === 'string' ? parsed.lastQuestionId : null,
		telemetry: wrapped ? parseTelemetry(parsed.telemetry) : {},
		telemetryPending: true,
	}
}

export function readWal(storage: ClientAttemptStorage, key: string, cachedSessionId: string | null): WalRecord | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) return null
		return parseRecord(parsed, cachedSessionId)
	} catch {
		return null
	}
}

export function writeWal(storage: ClientAttemptStorage, key: string, record: WalRecord): boolean {
	try {
		storage.setItem(key, JSON.stringify(record))
		return true
	} catch {
		return false
	}
}

export function updateWal(
	storage: ClientAttemptStorage,
	key: string,
	sessionId: string | null,
	mutate: (record: WalRecord) => WalRecord
): boolean {
	const current = readWal(storage, key, sessionId)
	if (current && current.sessionId !== null && current.sessionId !== sessionId) return false
	const base = current ? { ...current, sessionId: current.sessionId ?? sessionId } : emptyWal(sessionId)
	return writeWal(storage, key, mutate(base))
}

export function recordAnswer(
	storage: ClientAttemptStorage,
	key: string,
	input: { sessionId: string | null; questionId: string; value: AnswerValue; position: string | null }
): boolean {
	return updateWal(storage, key, input.sessionId, (record) => ({
		...record,
		answers: { ...record.answers, [input.questionId]: input.value },
		pending: record.pending.includes(input.questionId) ? record.pending : [...record.pending, input.questionId],
		position: input.position,
	}))
}

export function recordPosition(
	storage: ClientAttemptStorage,
	key: string,
	input: { sessionId: string | null; position: string | null }
): boolean {
	return updateWal(storage, key, input.sessionId, (record) => ({ ...record, position: input.position }))
}

function sameValue(left: unknown, right: unknown): boolean {
	return stableJson(left) === stableJson(right)
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((name) => `${JSON.stringify(name)}:${stableJson(value[name])}`)
			.join(',')}}`
	}
	return JSON.stringify(value) ?? 'undefined'
}

export function confirmAnswer(
	storage: ClientAttemptStorage,
	key: string,
	input: { sessionId: string; questionId: string; value: AnswerValue }
): boolean {
	const current = readWal(storage, key, input.sessionId)
	if (!current || current.sessionId !== input.sessionId) return false
	if (!current.pending.includes(input.questionId)) return true
	if (!sameValue(current.answers[input.questionId], input.value)) return false
	return writeWal(storage, key, {
		...current,
		pending: current.pending.filter((id) => id !== input.questionId),
	})
}

export function confirmTelemetry(
	storage: ClientAttemptStorage,
	key: string,
	input: { sessionId: string; telemetry: TelemetryMap }
): boolean {
	const current = readWal(storage, key, input.sessionId)
	if (!current || current.sessionId !== input.sessionId || !current.telemetryPending) return false
	if (!sameValue(current.telemetry, input.telemetry)) return false
	return writeWal(storage, key, { ...current, telemetryPending: false })
}

export function detachWal(storage: ClientAttemptStorage, key: string, cachedSessionId: string | null): boolean {
	const current = readWal(storage, key, cachedSessionId)
	if (!current) return false
	return writeWal(storage, key, {
		...current,
		sessionId: null,
		pending: Object.keys(current.answers),
		telemetryPending: Object.keys(current.telemetry).length > 0,
	})
}
