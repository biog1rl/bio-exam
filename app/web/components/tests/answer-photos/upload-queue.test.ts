import {
	ANSWER_PHOTO_LIMIT_MESSAGE,
	type AnswerPhoto,
	type AnswerPhotoDeleteResponse,
	type AnswerPhotoUploadResponse,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

import type { RequestFailure, RequestOutcome } from '@/lib/http/request'
import { uploadWindowRefusalText } from '@/lib/tests/upload-window'

import { createPhotoUploadQueue } from './upload-queue'

const START = Date.parse('2026-10-16T10:00:00.000Z')
const CLOSES_AT = new Date(START - 5 * 60_000).toISOString()
const QUESTION_ID = '00000000-0000-4000-8000-000000000001'
const NETWORK_MESSAGE = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'
const BUSY_MESSAGE = 'Сервер занят обработкой фото. Повторите через несколько секунд'

type UploadOutcome = RequestOutcome<AnswerPhotoUploadResponse>
type DeleteOutcome = RequestOutcome<AnswerPhotoDeleteResponse>
type UploadStep = UploadOutcome | ((photoId: string) => UploadOutcome | Promise<UploadOutcome>)
type DeleteStep = DeleteOutcome | Error

function photoOf(photoId: string): AnswerPhoto {
	return { id: photoId, questionId: QUESTION_ID, uploadedAt: new Date(START).toISOString() }
}

function uploaded(photoId: string, count: number): UploadOutcome {
	return { ok: true, status: 201, data: { photo: photoOf(photoId), count } }
}

function failure(kind: RequestFailure['kind'], status?: number, body?: unknown): RequestFailure {
	const result: RequestFailure = { ok: false, kind, message: '' }
	if (status !== undefined) result.status = status
	if (body !== undefined) result.body = body
	return result
}

function fileOf(name: string): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' })
}

function files(n: number): File[] {
	return Array.from({ length: n }, (_, index) => fileOf(`photo-${index + 1}.jpg`))
}

function idOf(seq: number): string {
	return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

const hang = (): Promise<UploadOutcome> => new Promise<UploadOutcome>(() => {})

function setup(uploadSteps: UploadStep[] = [], removeSteps: DeleteStep[] = []) {
	const steps = [...uploadSteps]
	const removals = [...removeSteps]
	let seq = 0
	let uploadedCount = 0
	const randomId = vi.fn(() => {
		seq += 1
		return idOf(seq)
	})
	const upload = vi.fn(async (photoId: string, _blob: Blob, _fileName: string): Promise<UploadOutcome> => {
		const next = steps.shift()
		if (next === undefined) {
			uploadedCount += 1
			return uploaded(photoId, uploadedCount)
		}
		return typeof next === 'function' ? next(photoId) : next
	})
	const remove = vi.fn(async (_photoId: string): Promise<DeleteOutcome> => {
		const next = removals.shift()
		if (next === undefined) return { ok: true, status: 200, data: { count: 0 } }
		if (next instanceof Error) throw next
		return next
	})
	const prepare = vi.fn(async (file: File) => ({ blob: file as Blob, fileName: file.name }))
	const queue = createPhotoUploadQueue({ upload, remove, prepare, randomId })
	const item = (photoId: string) => queue.snapshot().items.find((entry) => entry.photoId === photoId)
	const statuses = () => queue.snapshot().items.map((entry) => entry.status)
	return { queue, upload, remove, prepare, randomId, item, statuses }
}

function repeat<T>(value: T, times: number): T[] {
	return Array.from({ length: times }, () => value)
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

test('один файл проходит preparing → uploading → done, счётчик из ответа сервера', async () => {
	const { queue, upload, randomId } = setup([(photoId) => uploaded(photoId, 1)])
	const seen: string[] = []
	queue.subscribe(() => {
		const status = queue.snapshot().items[0]?.status
		if (status && seen.at(-1) !== status) seen.push(status)
	})
	queue.add([fileOf('a.jpg')])
	await vi.advanceTimersByTimeAsync(0)
	const state = queue.snapshot()
	assert.equal(state.items.length, 1)
	assert.equal(state.items[0]?.status, 'done')
	assert.equal(state.count, 1)
	assert.deepEqual(seen, ['preparing', 'uploading', 'done'])
	assert.equal(upload.mock.calls.length, 1)
	assert.equal(upload.mock.calls[0]?.[0], randomId.mock.results[0]?.value)
	assert.equal(state.items[0]?.photo?.id, randomId.mock.results[0]?.value)
})

test('файлы уходят по одному: следующий начинается после ответа на предыдущий', async () => {
	let release!: (outcome: UploadOutcome) => void
	const { queue, upload, prepare, statuses } = setup([
		() =>
			new Promise<UploadOutcome>((resolve) => {
				release = resolve
			}),
	])
	queue.add(files(2))
	await vi.advanceTimersByTimeAsync(0)
	assert.deepEqual(statuses(), ['uploading', 'preparing'])
	assert.equal(prepare.mock.calls.length, 1)
	release(uploaded(idOf(1), 1))
	await vi.advanceTimersByTimeAsync(0)
	assert.deepEqual(statuses(), ['done', 'done'])
	assert.equal(upload.mock.calls.length, 2)
	assert.equal(queue.snapshot().count, 1)
})

test('сеть падает три раза, четвёртый успех: паузы 1000, 3000, 9000 мс тем же photoId', async () => {
	const { queue, upload, item } = setup([...repeat(failure('network'), 3), (photoId) => uploaded(photoId, 1)])
	queue.add([fileOf('a.jpg')])
	const id = idOf(1)
	const plan = [
		{ wait: 0, calls: 1, status: 'retrying' },
		{ wait: 999, calls: 1, status: 'retrying' },
		{ wait: 1, calls: 2, status: 'retrying' },
		{ wait: 2999, calls: 2, status: 'retrying' },
		{ wait: 1, calls: 3, status: 'retrying' },
		{ wait: 8999, calls: 3, status: 'retrying' },
		{ wait: 1, calls: 4, status: 'done' },
	]
	for (const step of plan) {
		await vi.advanceTimersByTimeAsync(step.wait)
		assert.equal(upload.mock.calls.length, step.calls)
		assert.equal(item(id)?.status, step.status)
	}
	assert.deepEqual(new Set(upload.mock.calls.map((call) => call[0])), new Set([id]))
	assert.equal(queue.snapshot().count, 1)
})

describe('повторяемые отказы: три автоповтора, затем failed и «Повторить»', () => {
	test.each([
		{ name: 'сеть', outcome: failure('network'), message: NETWORK_MESSAGE },
		{
			name: '500',
			outcome: failure('http', 500, { error: 'Внутренняя ошибка' }),
			message: 'Ошибка сервера (код 500).',
		},
		{ name: '503 с текстом сервера', outcome: failure('http', 503, { error: BUSY_MESSAGE }), message: BUSY_MESSAGE },
		{ name: '503 без текста', outcome: failure('http', 503), message: 'Ошибка сервера (код 503).' },
		{
			name: '429',
			outcome: failure('http', 429, { error: 'Слишком много запросов, подождите' }),
			message: 'Слишком много запросов, подождите',
		},
		{ name: 'исключение в upload', outcome: new Error('boom'), message: NETWORK_MESSAGE },
	])('$name', async ({ outcome, message }) => {
		const step: UploadStep =
			outcome instanceof Error
				? () => {
						throw outcome
					}
				: outcome
		const { queue, upload, item } = setup(repeat(step, 4))
		queue.add([fileOf('a.jpg')])
		await vi.advanceTimersByTimeAsync(1000 + 3000 + 9000)
		const id = idOf(1)
		assert.equal(upload.mock.calls.length, 4)
		assert.equal(item(id)?.status, 'failed')
		assert.equal(item(id)?.message, message)
		await vi.advanceTimersByTimeAsync(60_000)
		assert.equal(upload.mock.calls.length, 4)
		queue.retry(id)
		await vi.advanceTimersByTimeAsync(0)
		assert.equal(upload.mock.calls.length, 5)
		assert.equal(upload.mock.calls[4]?.[0], id)
		assert.equal(item(id)?.status, 'done')
		assert.equal(item(id)?.message, null)
	})
})

describe('отказы без повтора', () => {
	test.each([
		{
			name: '413 с текстом сервера',
			outcome: failure('http', 413, { error: 'Файл больше 10 МБ' }),
			status: 'refused',
			message: 'Файл больше 10 МБ',
		},
		{
			name: '415 с текстом сервера',
			outcome: failure('http', 415, { error: 'Формат не поддерживается' }),
			status: 'refused',
			message: 'Формат не поддерживается',
		},
		{
			name: '400 с текстом сервера',
			outcome: failure('http', 400, { error: 'Файл не похож на изображение' }),
			status: 'refused',
			message: 'Файл не похож на изображение',
		},
		{
			name: '422 окно закрыто',
			outcome: failure('http', 422, { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_AT }),
			status: 'refused',
			message: uploadWindowRefusalText({ error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_AT }, START, 'upload'),
		},
		{
			name: '422 окна нет',
			outcome: failure('http', 422, { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null }),
			status: 'refused',
			message: 'К этой попытке фото добавить нельзя.',
		},
		{
			name: '422 с другим телом',
			outcome: failure('http', 422, { error: 'Сессия уже закрыта' }),
			status: 'refused',
			message: 'Сессия уже закрыта',
		},
		{ name: 'auth', outcome: failure('auth'), status: 'failed', message: null },
		{ name: 'aborted', outcome: failure('aborted'), status: 'failed', message: null },
	])('$name', async ({ outcome, status, message }) => {
		const { queue, upload, item } = setup(repeat(outcome, 4))
		queue.add([fileOf('a.jpg')])
		await vi.advanceTimersByTimeAsync(60_000)
		assert.equal(upload.mock.calls.length, 1)
		assert.equal(item(idOf(1))?.status, status)
		assert.equal(item(idOf(1))?.message, message)
	})
})

test('текст отказа окна 422 совпадает с текстом UI-SPEC', async () => {
	const { queue, item } = setup([failure('http', 422, { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_AT })])
	queue.add([fileOf('a.jpg')])
	await vi.advanceTimersByTimeAsync(0)
	assert.match(
		item(idOf(1))?.message ?? '',
		/^Время для добавления фото закончилось в \d\d:\d\d\. Фото не сохранено\.$/
	)
})

describe('лимит пяти фото', () => {
	test('шестое после пяти готовых отклоняется без prepare и upload', async () => {
		const { queue, upload, prepare, statuses } = setup()
		queue.add(files(5))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(statuses(), repeat('done', 5))
		queue.add(files(1))
		await vi.advanceTimersByTimeAsync(0)
		const sixth = queue.snapshot().items[5]
		assert.equal(sixth?.status, 'refused')
		assert.equal(sixth?.message, ANSWER_PHOTO_LIMIT_MESSAGE)
		assert.equal(prepare.mock.calls.length, 5)
		assert.equal(upload.mock.calls.length, 5)
	})

	test('семь файлов разом: пять в очередь, два отклонены', async () => {
		const { queue, upload, statuses } = setup()
		queue.add(files(7))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(statuses(), [...repeat('done', 5), 'refused', 'refused'])
		assert.equal(upload.mock.calls.length, 5)
	})

	test('места занимают готовые, сбойные, идущие и ожидающие; отклонённые не занимают', async () => {
		const { queue, upload, prepare, statuses } = setup([
			failure('http', 415, { error: 'Формат не поддерживается' }),
			...repeat(failure('network'), 4),
			hang,
		])
		queue.seed([photoOf(idOf(101)), photoOf(idOf(102))])
		queue.add(files(1))
		await vi.advanceTimersByTimeAsync(0)
		queue.add(files(1))
		await vi.advanceTimersByTimeAsync(13_000)
		queue.add(files(2))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(statuses(), ['done', 'done', 'refused', 'failed', 'uploading', 'preparing'])
		queue.add(files(1))
		const last = queue.snapshot().items.at(-1)
		assert.equal(last?.status, 'refused')
		assert.equal(last?.message, ANSWER_PHOTO_LIMIT_MESSAGE)
		await vi.advanceTimersByTimeAsync(0)
		assert.equal(prepare.mock.calls.length, 3)
		assert.equal(upload.mock.calls.length, 6)
	})
})

describe('удаление', () => {
	test.each([
		{ name: 'ok', outcome: { ok: true, status: 200, data: { count: 1 } } as DeleteOutcome, kept: false, count: 1 },
		{ name: '404', outcome: failure('http', 404), kept: false, count: 1 },
		{
			name: '422 окно закрыто',
			outcome: failure('http', 422, { error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_AT }),
			kept: true,
			count: 2,
			message: uploadWindowRefusalText({ error: 'UPLOAD_WINDOW_CLOSED', uploadClosesAt: CLOSES_AT }, START, 'remove'),
		},
		{
			name: '422 окна нет',
			outcome: failure('http', 422, { error: 'UPLOAD_WINDOW_NONE', uploadClosesAt: null }),
			kept: true,
			count: 2,
			message: 'Фото этой попытки изменить нельзя.',
		},
		{ name: 'сеть', outcome: failure('network'), kept: true, count: 2, message: NETWORK_MESSAGE },
	])('готовое фото, ответ $name', async ({ outcome, kept, count, message }) => {
		const { queue, remove, item } = setup([], [outcome])
		queue.seed([photoOf(idOf(101)), photoOf(idOf(102))])
		queue.remove(idOf(101))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(remove.mock.calls, [[idOf(101)]])
		assert.equal(item(idOf(101)) !== undefined, kept)
		assert.equal(queue.snapshot().count, count)
		if (kept) {
			assert.equal(item(idOf(101))?.status, 'done')
			assert.equal(item(idOf(101))?.message, message)
		}
	})

	test('у загружаемого и ожидающего удаления нет', async () => {
		const { queue, remove, statuses } = setup([hang])
		queue.add(files(2))
		await vi.advanceTimersByTimeAsync(0)
		queue.remove(idOf(1))
		queue.remove(idOf(2))
		await vi.advanceTimersByTimeAsync(0)
		assert.equal(remove.mock.calls.length, 0)
		assert.deepEqual(statuses(), ['uploading', 'preparing'])
	})

	test('удаление во время паузы повтора снимает таймер, зовёт remove и отпускает очередь', async () => {
		const { queue, upload, remove, statuses } = setup(
			[failure('network'), (photoId) => uploaded(photoId, 1)],
			[failure('http', 404)]
		)
		queue.add(files(2))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(statuses(), ['retrying', 'preparing'])
		queue.remove(idOf(1))
		await vi.advanceTimersByTimeAsync(60_000)
		assert.deepEqual(remove.mock.calls, [[idOf(1)]])
		assert.deepEqual(
			upload.mock.calls.map((call) => call[0]),
			[idOf(1), idOf(2)]
		)
		assert.deepEqual(statuses(), ['done'])
	})

	test('сбойное удаляется запросом: фото могло сохраниться', async () => {
		const { queue, remove, statuses } = setup(repeat(failure('network'), 4))
		queue.add(files(1))
		await vi.advanceTimersByTimeAsync(13_000)
		assert.deepEqual(statuses(), ['failed'])
		queue.remove(idOf(1))
		await vi.advanceTimersByTimeAsync(0)
		assert.deepEqual(remove.mock.calls, [[idOf(1)]])
		assert.deepEqual(statuses(), [])
	})

	test('отклонённое убирается без запроса', async () => {
		const { queue, remove, statuses } = setup([failure('http', 415, { error: 'Формат не поддерживается' })])
		queue.add(files(1))
		await vi.advanceTimersByTimeAsync(0)
		queue.remove(idOf(1))
		assert.equal(remove.mock.calls.length, 0)
		assert.deepEqual(statuses(), [])
	})
})

test('seed создаёт готовые элементы и берёт счётчик из списка', () => {
	const { queue, statuses } = setup()
	queue.seed([photoOf(idOf(101)), photoOf(idOf(102)), photoOf(idOf(103))])
	assert.deepEqual(statuses(), repeat('done', 3))
	assert.equal(queue.snapshot().count, 3)
	assert.deepEqual(
		queue.snapshot().items.map((entry) => entry.photo?.id),
		[idOf(101), idOf(102), idOf(103)]
	)
})

test('снимок — новый объект после каждого перехода и тот же без изменений', async () => {
	const { queue } = setup()
	const first = queue.snapshot()
	assert.equal(queue.snapshot(), first)
	queue.add(files(1))
	const second = queue.snapshot()
	assert.notEqual(second, first)
	await vi.advanceTimersByTimeAsync(0)
	assert.notEqual(queue.snapshot(), second)
})
