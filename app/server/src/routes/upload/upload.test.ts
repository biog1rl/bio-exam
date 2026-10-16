import {
	ANSWER_PHOTO_FORBIDDEN_MESSAGE,
	AnswerPhotoListResponseSchema,
	SUBMIT_ERROR_CODES,
	UPLOAD_LINK_INVALID_MESSAGE,
	UPLOAD_TOKEN_HEADER,
	UPLOAD_WINDOW_ERROR_CODES,
	UploadLinkContextSchema,
	UploadLinkIssueResponseSchema,
} from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, test, vi } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	insertOpenQuestion,
	putAnswerPhoto,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	shiftStartedAt,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, nextIp, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'

type Student = { id: string; cookie: string }
type Answer = { testId: string; sessionId: string; questionId: string; shortId: string }
type TestOptions = { timeLimitMinutes?: number | null; windowMinutes?: number }

const ANSWER_PHOTO_NOT_FOUND = 'Фото не найдено'
const ANSWER_PHOTO_CONFLICT = 'Это фото уже прикреплено к другому ответу'
const INVALID_BODY = { error: UPLOAD_LINK_INVALID_MESSAGE }
const VOLATILE_HEADERS = new Set(['date', 'x-request-id'])

let ctx: AuthApp
let world: AttemptWorld
let jpeg: Buffer
let app: unknown
let inventoryText: (app: unknown) => string
let counter = 0

beforeAll(async () => {
	ctx = await startAuthApp('test_upload_links', { env: { PG_POOL_MAX: '12' } })
	await memoryStorage()
	app = (await import('../../app.js')).default
	inventoryText = (await import('../../lib/route-inventory.js')).inventoryText
	world = await seedAttemptWorld(ctx, 'ulink')
	jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 90, b: 160 } } })
		.jpeg()
		.toBuffer()
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

function nextName(kind: string): string {
	counter += 1
	return `ulink_${kind}_${counter}`
}

function newStudent(roles?: string[]): Promise<Student> {
	return seedStudent(world, nextName('user'), roles ? { roles } : {})
}

async function prepareTest(options: TestOptions = {}) {
	const testId = await createAttemptTest(world, {
		slug: `ulink-${crypto.randomUUID().slice(0, 8)}`,
		timeLimitMinutes: options.timeLimitMinutes ?? null,
	})
	if (options.windowMinutes !== undefined) {
		await ctx.pgPool.query('UPDATE tests SET photo_upload_window_minutes = $2 WHERE id = $1', [
			testId,
			options.windowMinutes,
		])
	}
	const shortId = await addQuestion(world, testId, 'short_answer')
	const questionId = await insertOpenQuestion(ctx, testId, { order: 1 })
	return { testId, shortId, questionId }
}

async function openAnswer(owner: Student, options: TestOptions & { assign?: boolean } = {}): Promise<Answer> {
	const prepared = await prepareTest(options)
	if (options.assign ?? true) await assignTest(world, prepared.testId, owner.id)
	const reply = await startSession(world, owner.cookie, prepared.testId)
	assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return { ...prepared, sessionId: reply.body.sessionId as string }
}

function issue(owner: Student, answer: Answer, ip?: string): Promise<Reply> {
	return call(
		ctx,
		'POST',
		`/api/tests/public/tests/${answer.testId}/sessions/${answer.sessionId}/questions/${answer.questionId}/upload-link`,
		{ cookies: owner.cookie, ip }
	)
}

async function tokenFor(owner: Student, answer: Answer): Promise<string> {
	const reply = await issue(owner, answer)
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return UploadLinkIssueResponseSchema.parse(reply.body).token
}

function viaLink(
	method: string,
	path: string,
	token: string,
	options: { cookies?: string; ip?: string; form?: FormData } = {}
): Promise<Reply> {
	return call(ctx, method, `/api/upload${path}`, { ...options, headers: { [UPLOAD_TOKEN_HEADER]: token } })
}

function putViaLink(token: string, photoId: string, bytes: Buffer = jpeg): Promise<Reply> {
	const form = new FormData()
	form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'photo.jpg')
	return viaLink('PUT', `/photos/${photoId}`, token, { form })
}

function randomToken(): string {
	return crypto.randomBytes(32).toString('base64url')
}

async function linkRow(token: string): Promise<{ id: string; last_used_at: Date | null; revoked_at: Date | null }> {
	const hash = crypto.createHash('sha256').update(token).digest('hex')
	const result = await ctx.pgPool.query(
		'SELECT id, last_used_at, revoked_at FROM answer_upload_links WHERE token_hash = $1',
		[hash]
	)
	const row = result.rows[0]
	assert.ok(row, 'ссылка не найдена')
	return row
}

async function activeLinks(answer: Answer): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>(
		'SELECT count(*) FROM answer_upload_links WHERE session_id = $1 AND question_id = $2 AND revoked_at IS NULL',
		[answer.sessionId, answer.questionId]
	)
	return Number(result.rows[0]?.count ?? 0)
}

async function allLinks(): Promise<number> {
	const result = await ctx.pgPool.query<{ count: string }>('SELECT count(*) FROM answer_upload_links')
	return Number(result.rows[0]?.count ?? 0)
}

async function photoRows(sessionId: string): Promise<Array<{ id: string; uploaded_via: string }>> {
	const result = await ctx.pgPool.query('SELECT id, uploaded_via FROM answer_photos WHERE session_id = $1', [sessionId])
	return result.rows
}

function stableHeaders(reply: Reply): Array<[string, string]> {
	return [...reply.headers.entries()]
		.filter(([name]) => !VOLATILE_HEADERS.has(name))
		.sort(([a], [b]) => a.localeCompare(b))
}

async function teacherInZone(): Promise<Student> {
	const teacher = await newStudent(['teacher'])
	await ctx.db.insert(ctx.schema.teacherTopics).values({ teacherId: teacher.id, topicId: world.topicId })
	return teacher
}

describe('выдача ссылки и контекст', () => {
	test('выданная по cookie ссылка открывает контекст своего вопроса', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		await ctx.pgPool.query('UPDATE questions SET max_photos = 4 WHERE id = $1', [answer.questionId])
		const reply = await issue(owner, answer)
		assert.equal(reply.status, 201, JSON.stringify(reply.body))
		assert.equal(reply.headers.get('cache-control'), 'no-store')
		const issued = UploadLinkIssueResponseSchema.parse(reply.body)
		assert.equal(issued.uploadClosesAt, null)
		const order = await ctx.pgPool.query<{ id: string }>(
			'SELECT id FROM questions WHERE test_id = $1 ORDER BY "order"',
			[answer.testId]
		)
		const expectedNumber = order.rows.findIndex((row) => row.id === answer.questionId) + 1

		const context = await viaLink('GET', '/context', issued.token)
		assert.equal(context.status, 200, JSON.stringify(context.body))
		const parsed = UploadLinkContextSchema.parse(context.body)
		assert.equal(parsed.questionNumber, expectedNumber)
		assert.equal(parsed.maxPhotos, 4)
		assert.equal(parsed.allowPhotos, true)
		assert.match(parsed.testTitle, /^Тест ulink-/)
		assert.equal(parsed.uploadClosesAt, null)
	})

	test('токен без cookie и токен с cookie другого пользователя дают тот же слот', async () => {
		const owner = await newStudent()
		const stranger = await newStudent()
		const answer = await openAnswer(owner)
		const token = await tokenFor(owner, answer)
		const photoId = crypto.randomUUID()
		assert.equal((await putViaLink(token, photoId)).status, 201)
		const alone = await viaLink('GET', '/photos', token)
		const withCookie = await viaLink('GET', '/photos', token, { cookies: stranger.cookie })
		assert.equal(alone.status, 200)
		assert.equal(withCookie.status, 200)
		assert.deepEqual(
			AnswerPhotoListResponseSchema.parse(alone.body),
			AnswerPhotoListResponseSchema.parse(withCookie.body)
		)
		assert.deepEqual(
			AnswerPhotoListResponseSchema.parse(alone.body).photos.map((photo) => photo.id),
			[photoId]
		)
	})

	test('allow_photos = false до выдачи: 409, ссылка не создаётся', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		await ctx.pgPool.query('UPDATE questions SET allow_photos = false WHERE id = $1', [answer.questionId])
		const reply = await issue(owner, answer)
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ANSWER_PHOTO_FORBIDDEN_MESSAGE })
		assert.equal(await activeLinks(answer), 0)
	})

	test('четвёртая выдача гасит самую старую ссылку, строки остаются', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const tokens: string[] = []
		for (let index = 0; index < 4; index++) tokens.push(await tokenFor(owner, answer))
		assert.equal(await activeLinks(answer), 3)
		assert.ok((await linkRow(tokens[0]!)).revoked_at)
		assert.equal((await viaLink('GET', '/context', tokens[0]!)).status, 404)
		for (const token of tokens.slice(1)) assert.equal((await viaLink('GET', '/context', token)).status, 200)
	})

	test('пять параллельных выдач оставляют не больше трёх активных ссылок', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const replies = await Promise.all(Array.from({ length: 5 }, () => issue(owner, answer)))
		assert.deepEqual(
			replies.map((reply) => reply.status),
			[201, 201, 201, 201, 201]
		)
		assert.equal(await activeLinks(answer), 3)
	})

	test('11-я выдача за минуту одному пользователю отвечает 429', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		for (let index = 0; index < 10; index++) assert.equal((await issue(owner, answer)).status, 201)
		const limited = await issue(owner, answer)
		assert.equal(limited.status, 429)
	})
})

const INVALID_CASES: Array<[string, () => Promise<string>]> = [
	['неизвестный токен', async () => randomToken()],
	[
		'ссылка отозвана четвёртой выдачей',
		async () => {
			const owner = await newStudent()
			const answer = await openAnswer(owner)
			const first = await tokenFor(owner, answer)
			for (let index = 0; index < 3; index++) await tokenFor(owner, answer)
			return first
		},
	],
	[
		'ученик заблокирован',
		async () => {
			const owner = await newStudent()
			const token = await tokenFor(owner, await openAnswer(owner))
			await ctx.pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id])
			return token
		},
	],
	[
		'назначение снято',
		async () => {
			const owner = await newStudent()
			const answer = await openAnswer(owner)
			const token = await tokenFor(owner, answer)
			await ctx.pgPool.query('DELETE FROM test_assignments WHERE test_id = $1 AND user_id = $2', [
				answer.testId,
				owner.id,
			])
			return token
		},
	],
	[
		'сессия закрыта без сдачи',
		async () => {
			const owner = await newStudent()
			const answer = await openAnswer(owner)
			const token = await tokenFor(owner, answer)
			await ctx.pgPool.query("UPDATE test_sessions SET closed_at = now(), close_reason = 'expired' WHERE id = $1", [
				answer.sessionId,
			])
			return token
		},
	],
]

describe('единый отказ 404', () => {
	test.each(INVALID_CASES)('%s: тот же статус, тело и заголовки, что у неизвестного токена', async (_name, arrange) => {
		const token = await arrange()
		const reference = await viaLink('GET', '/context', randomToken())
		const reply = await viaLink('GET', '/context', token)
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, INVALID_BODY)
		assert.deepEqual(stableHeaders(reply), stableHeaders(reference))
		assert.equal(reply.headers.get('x-ratelimit-remaining'), null)
	})

	test('ссылка старше 24 часов отвечает как неизвестная', async () => {
		const owner = await newStudent()
		const token = await tokenFor(owner, await openAnswer(owner))
		const { id } = await linkRow(token)
		await ctx.pgPool.query("UPDATE answer_upload_links SET created_at = now() - interval '25 hours' WHERE id = $1", [
			id,
		])
		const reply = await viaLink('GET', '/context', token)
		assert.equal(reply.status, 404)
		assert.deepEqual(reply.body, INVALID_BODY)
	})

	test('ссылка, выданная до сдачи, после сдачи мертва; новая в открытом окне работает, «Готово» её гасит', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner, { timeLimitMinutes: 10 })
		const before = await tokenFor(owner, answer)
		const saved = await saveDraft(world, owner.cookie, answer.testId, answer.sessionId, {
			questionId: answer.shortId,
			value: 'ответ',
		})
		assert.equal(saved.status, 200)
		await shiftStartedAt(ctx, answer.sessionId, '12 minutes')
		await ctx.pgPool.query("UPDATE answer_upload_links SET created_at = now() - interval '11 minutes' WHERE id = $1", [
			(await linkRow(before)).id,
		])
		const fate = await call(ctx, 'GET', `/api/tests/public/tests/${answer.testId}/sessions/${answer.sessionId}`, {
			cookies: owner.cookie,
		})
		assert.equal(fate.body.state, 'submitted', JSON.stringify(fate.body))
		assert.equal((await viaLink('GET', '/context', before)).status, 404)

		const issued = await issue(owner, answer)
		assert.equal(issued.status, 201, JSON.stringify(issued.body))
		const after = UploadLinkIssueResponseSchema.parse(issued.body)
		assert.ok(after.uploadClosesAt)
		assert.equal((await putViaLink(after.token, crypto.randomUUID())).status, 201)

		const done = await call(
			ctx,
			'POST',
			`/api/tests/public/tests/${answer.testId}/sessions/${answer.sessionId}/uploads-done`,
			{
				cookies: owner.cookie,
			}
		)
		assert.equal(done.status, 200, JSON.stringify(done.body))
		const closed = await viaLink('GET', '/context', after.token)
		assert.equal(closed.status, 422)
		assert.equal(closed.body.error, UPLOAD_WINDOW_ERROR_CODES.closed)
		assert.equal(typeof closed.body.uploadClosesAt, 'string')
	})

	test('окно закрылось по времени: 422 UPLOAD_WINDOW_CLOSED со временем закрытия', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner, { timeLimitMinutes: 10 })
		const token = await tokenFor(owner, answer)
		await shiftStartedAt(ctx, answer.sessionId, '40 minutes')
		const reply = await viaLink('GET', '/photos', token)
		assert.equal(reply.status, 422)
		assert.equal(reply.body.error, UPLOAD_WINDOW_ERROR_CODES.closed)
		assert.equal(typeof reply.body.uploadClosesAt, 'string')
	})

	test('живая ссылка у сданной сессии без окна: 422 UPLOAD_WINDOW_NONE', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner, { windowMinutes: 0 })
		const token = await tokenFor(owner, answer)
		const sent = await submitAttempt(world, owner.cookie, answer.testId, {
			sessionId: answer.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [answer.shortId]: 'ответ', [answer.questionId]: 'текст' },
		})
		assert.equal(sent.status, 200, JSON.stringify(sent.body))
		const { id } = await linkRow(token)
		await ctx.pgPool.query('UPDATE answer_upload_links SET created_at = now() WHERE id = $1', [id])
		const reply = await viaLink('GET', '/context', token)
		assert.equal(reply.status, 422)
		assert.deepEqual(reply.body, { error: UPLOAD_WINDOW_ERROR_CODES.none, uploadClosesAt: null })
	})
})

describe('фото по ссылке', () => {
	test('загрузка пишет uploaded_via = link, повтор того же photoId — 200 без дубля', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const token = await tokenFor(owner, answer)
		const photoId = crypto.randomUUID()
		const first = await putViaLink(token, photoId)
		assert.equal(first.status, 201, JSON.stringify(first.body))
		const repeat = await putViaLink(token, photoId)
		assert.equal(repeat.status, 200, JSON.stringify(repeat.body))
		assert.deepEqual(await photoRows(answer.sessionId), [{ id: photoId, uploaded_via: 'link' }])
	})

	test('учитель без назначения получает ссылку и загружает фото', async () => {
		const teacher = await teacherInZone()
		const answer = await openAnswer(teacher, { assign: false })
		const token = await tokenFor(teacher, answer)
		assert.equal((await viaLink('GET', '/context', token)).status, 200)
		assert.equal((await putViaLink(token, crypto.randomUUID())).status, 201)
	})

	test('allow_photos = false после выдачи: PUT отвечает 409 с текстом запрета', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const token = await tokenFor(owner, answer)
		await ctx.pgPool.query('UPDATE questions SET allow_photos = false WHERE id = $1', [answer.questionId])
		const reply = await putViaLink(token, crypto.randomUUID())
		assert.equal(reply.status, 409)
		assert.deepEqual(reply.body, { error: ANSWER_PHOTO_FORBIDDEN_MESSAGE })
		assert.deepEqual(await photoRows(answer.sessionId), [])
	})

	test('телефон удаляет фото своего вопроса, повторное удаление — 200 с текущим числом', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner)
		const token = await tokenFor(owner, answer)
		const fromDesk = crypto.randomUUID()
		const desk = await putAnswerPhoto(world, owner.cookie, { ...answer, photoId: fromDesk, bytes: jpeg })
		assert.equal(desk.status, 201)
		const thumb = await viaLink('GET', `/photos/${fromDesk}/thumb`, token)
		assert.equal(thumb.status, 200)
		assert.equal(thumb.headers.get('content-type'), 'image/webp')
		assert.equal(thumb.headers.get('cache-control'), 'private, no-store')
		const removed = await viaLink('DELETE', `/photos/${fromDesk}`, token)
		assert.equal(removed.status, 200)
		assert.deepEqual(removed.body, { count: 0 })
		const again = await viaLink('DELETE', `/photos/${fromDesk}`, token)
		assert.equal(again.status, 200)
		assert.deepEqual(again.body, { count: 0 })
	})

	test('токен слота А не видит, не удаляет и не читает миниатюру фото слота Б', async () => {
		const ownerA = await newStudent()
		const ownerB = await newStudent()
		const answerA = await openAnswer(ownerA)
		const answerB = await openAnswer(ownerB)
		const tokenA = await tokenFor(ownerA, answerA)
		const photoB = crypto.randomUUID()
		assert.equal((await putAnswerPhoto(world, ownerB.cookie, { ...answerB, photoId: photoB, bytes: jpeg })).status, 201)

		const list = await viaLink('GET', '/photos', tokenA)
		assert.deepEqual(AnswerPhotoListResponseSchema.parse(list.body).photos, [])
		const removed = await viaLink('DELETE', `/photos/${photoB}`, tokenA)
		assert.equal(removed.status, 200)
		assert.deepEqual(removed.body, { count: 0 })
		assert.equal((await photoRows(answerB.sessionId)).length, 1)
		const thumb = await viaLink('GET', `/photos/${photoB}/thumb`, tokenA)
		assert.equal(thumb.status, 404)
		assert.deepEqual(thumb.body, { error: ANSWER_PHOTO_NOT_FOUND })
		const stolen = await putViaLink(tokenA, photoB)
		assert.equal(stolen.status, 409)
		assert.deepEqual(stolen.body, { error: ANSWER_PHOTO_CONFLICT })
	})

	test('фото по ссылке снимает OPEN_ANSWER_EMPTY при сдаче без окна', async () => {
		const owner = await newStudent()
		const answer = await openAnswer(owner, { windowMinutes: 0 })
		const token = await tokenFor(owner, answer)
		const submit = () =>
			submitAttempt(world, owner.cookie, answer.testId, {
				sessionId: answer.sessionId,
				clientAttemptId: crypto.randomUUID(),
				answers: { [answer.shortId]: 'ответ', [answer.questionId]: '' },
			})
		const empty = await submit()
		assert.equal(empty.status, 422)
		assert.equal(empty.body.error, SUBMIT_ERROR_CODES.openAnswerEmpty)
		assert.equal((await putViaLink(token, crypto.randomUUID())).status, 201)
		const sent = await submit()
		assert.equal(sent.status, 200, JSON.stringify(sent.body))
	})
})

describe('лимиты запросов', () => {
	test('121-й запрос по ссылке за минуту — 429, другая ссылка с того же IP не задета', async () => {
		const ip = nextIp()
		const owner = await newStudent()
		const other = await newStudent()
		const token = await tokenFor(owner, await openAnswer(owner))
		const otherToken = await tokenFor(other, await openAnswer(other))
		for (let index = 0; index < 120; index++) {
			const reply = await viaLink('GET', '/photos', token, { ip })
			assert.equal(reply.status, 200, `запрос ${index + 1}: ${JSON.stringify(reply.body)}`)
		}
		assert.equal((await viaLink('GET', '/photos', token, { ip })).status, 429)
		assert.equal((await viaLink('GET', '/photos', otherToken, { ip })).status, 200)
	})

	test('неизвестный токен 601-й раз за минуту с одного IP — 429', async () => {
		const ip = nextIp()
		for (let index = 0; index < 600; index++) {
			assert.equal((await viaLink('GET', '/context', randomToken(), { ip })).status, 404)
		}
		assert.equal((await viaLink('GET', '/context', randomToken(), { ip })).status, 429)
	})
})

describe('last_used_at', () => {
	test('отказ 404 не пишет last_used_at; GET пишет его, ссылок не создаёт и не гасит', async () => {
		const owner = await newStudent()
		const blocked = await newStudent()
		const answer = await openAnswer(owner)
		const token = await tokenFor(owner, answer)
		const blockedToken = await tokenFor(blocked, await openAnswer(blocked))
		await ctx.pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [blocked.id])
		assert.equal((await viaLink('GET', '/context', blockedToken)).status, 404)
		assert.equal((await linkRow(blockedToken)).last_used_at, null)

		assert.equal((await linkRow(token)).last_used_at, null)
		const links = await allLinks()
		assert.equal((await viaLink('GET', '/context', token)).status, 200)
		await vi.waitFor(async () => assert.ok((await linkRow(token)).last_used_at), { timeout: 2_000 })
		assert.equal(await allLinks(), links)
		assert.equal(await activeLinks(answer), 1)
	})

	test('сбой записи last_used_at не роняет процесс и не меняет ответ', async () => {
		const owner = await newStudent()
		const token = await tokenFor(owner, await openAnswer(owner))
		const spy = vi.spyOn(ctx.db, 'update').mockImplementationOnce(() => {
			throw new Error('touch failed')
		})
		try {
			const reply = await viaLink('GET', '/context', token)
			assert.equal(reply.status, 200)
			await vi.waitFor(() => assert.ok(spy.mock.calls.length >= 1), { timeout: 2_000 })
		} finally {
			spy.mockRestore()
		}
		assert.equal((await linkRow(token)).last_used_at, null)
		assert.equal((await viaLink('GET', '/context', token)).status, 200)
	})
})

describe('охрана маршрутов ссылки', () => {
	test('строки /api/upload/ идут через uploadTokenRequired без sessionRequired, вне них uploadTokenRequired нет', () => {
		const lines = inventoryText(app).split('\n')
		const upload = lines.filter((line) => / \/api\/upload\//.test(line))
		assert.equal(upload.length, 5)
		for (const line of upload) {
			assert.ok(line.includes('uploadTokenRequired'), line)
			assert.ok(!line.includes('sessionRequired'), line)
		}
		for (const line of lines.filter((item) => !upload.includes(item))) {
			assert.ok(!line.includes('uploadTokenRequired'), line)
		}
	})

	test('каждый маршрут под sessionRequired отвечает 401 на один заголовок токена живой ссылки', async () => {
		const owner = await newStudent()
		const token = await tokenFor(owner, await openAnswer(owner))
		const routes = inventoryText(app)
			.split('\n')
			.filter((line) => line.includes('sessionRequired'))
			.map((line) => {
				const [method = '', path = ''] = line.split(' ')
				return { method, path }
			})
		assert.ok(routes.some((route) => route.path === '/api/answer-photos/:photoId/:variant'))
		assert.ok(routes.some((route) => route.path.endsWith('/photos/:photoId')))
		const failures: string[] = []
		for (const route of routes) {
			const path = route.path.replace(/:([A-Za-z]+)\??/g, (_match, name: string) =>
				name === 'variant' ? 'full' : crypto.randomUUID()
			)
			const reply = await call(ctx, route.method, path, { headers: { [UPLOAD_TOKEN_HEADER]: token } })
			if (reply.status !== 401) failures.push(`${route.method} ${route.path}: ${reply.status}`)
		}
		assert.deepEqual(failures, [])
	})
})
