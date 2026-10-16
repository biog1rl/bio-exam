import { defaultMistakeMetricForTemplate, OPEN_REVIEW_NO_ANSWER_COMMENT } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { insertAttemptFixture } from '../../test-support/attempt-fixture.js'
import {
	insertOpenQuestion,
	insertOpenSession,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import { seedTeacherZoneWorld, type TeacherZoneWorld, type ZoneProfile } from '../../test-support/teacher-zone-world.js'

type Json = Record<string, unknown>

type OpenAnswer = { text?: string | null; photo?: boolean }

type BuiltAttempt = { attemptId: string; testId: string; autoQuestionId: string; openIds: string[]; sessionId: string }

const PASSING_SCORE = 50

let ctx: AuthApp
let zone: TeacherZoneWorld
let jobs: typeof import('../../services/background-jobs/index.js')
let reviews: typeof import('../../services/answer-reviews/index.js')
let counter = 0

function assertPercent(actual: unknown, ratio: number): void {
	assert.equal(typeof actual, 'number')
	assert.ok(Math.abs((actual as number) - ratio * 100) < 1e-4, `${String(actual)} != ${ratio * 100}`)
}

function reviewPath(attemptId: string, questionId: string): string {
	return `/api/tests/admin/attempts/${attemptId}/questions/${questionId}/review`
}

function postReview(cookie: string, attemptId: string, questionId: string, body: unknown): Promise<Reply> {
	return call(ctx, 'POST', reviewPath(attemptId, questionId), { cookies: cookie, body })
}

function fact(questionId: string, template: string, points: number, earnedPoints: number, userAnswer: string | null) {
	return {
		questionId,
		template,
		metric: defaultMistakeMetricForTemplate(template as 'single_choice' | 'open'),
		points,
		earnedPoints,
		isCorrect: earnedPoints === points,
		mistakes: null,
		key: null,
		keyVersion: null,
		verdicts: null,
		userAnswer,
		explanationText: template === 'open' ? 'Эталон: ответ должен упоминать митоз' : null,
	}
}

async function buildAttempt(options: {
	student: ZoneProfile
	topic?: 'X' | 'Y'
	answers: OpenAnswer[]
	uploadClosesAt?: 'past' | 'future' | null
}): Promise<BuiltAttempt> {
	counter += 1
	const test = await zone.freshTest(options.topic ?? 'X')
	const sessionId = await insertOpenSession(
		{ ctx, topicId: '', topicSlug: '', adminId: zone.users.admin.id, adminCookie: '', password: '' },
		test.id,
		zone.users[options.student].id
	)
	await ctx.pgPool.query('UPDATE tests SET passing_score = $2 WHERE id = $1', [test.id, PASSING_SCORE])
	const openIds: string[] = []
	for (const [index] of options.answers.entries())
		openIds.push(await insertOpenQuestion(ctx, test.id, { order: index + 10 }))
	const facts = [
		fact(test.questionId, 'single_choice', 1, 1, 'b'),
		...options.answers.map((answer, index) => fact(openIds[index]!, 'open', 3, 0, answer.text ?? null)),
	]
	const attemptId = await insertAttemptFixture(ctx.pgPool, {
		testId: test.id,
		userId: zone.users[options.student].id,
		sessionId,
		outcomeFacts: facts.map((item) => ({
			questionId: item.questionId,
			template: item.template as 'single_choice' | 'open',
			points: item.points,
			earnedPoints: item.earnedPoints,
		})),
		results: facts,
		passingScore: PASSING_SCORE,
	})
	for (const [index, answer] of options.answers.entries()) {
		if (!answer.photo) continue
		await ctx.pgPool.query(
			'INSERT INTO answer_photos (id, session_id, question_id, attempt_id) VALUES ($1, $2, $3, $4)',
			[crypto.randomUUID(), sessionId, openIds[index], attemptId]
		)
	}
	const closes =
		options.uploadClosesAt === 'future'
			? "now() + interval '1 hour'"
			: options.uploadClosesAt === 'past'
				? "now() - interval '1 minute'"
				: 'NULL'
	await ctx.pgPool.query(`UPDATE test_attempts SET upload_closes_at = ${closes} WHERE id = $1`, [attemptId])
	return { attemptId, testId: test.id, autoQuestionId: test.questionId, openIds, sessionId }
}

async function attemptRow(attemptId: string) {
	const result = await ctx.pgPool.query<{
		review_status: string
		final_earned_points: number | null
		final_score_percentage: number | null
		final_passed: boolean | null
	}>(
		'SELECT review_status, final_earned_points, final_score_percentage, final_passed FROM test_attempts WHERE id = $1',
		[attemptId]
	)
	return result.rows[0]!
}

async function reviewRows(attemptId: string) {
	const result = await ctx.pgPool.query<{
		question_id: string
		score: number
		comment: string | null
		reviewer_id: string | null
	}>(
		'SELECT question_id, score, comment, reviewer_id FROM answer_reviews WHERE attempt_id = $1 ORDER BY created_at, id',
		[attemptId]
	)
	return result.rows
}

async function gradedEvents(attemptId: string) {
	const result = await ctx.pgPool.query<{ recipient_id: string; ref_seq: number; actor_id: string | null }>(
		"SELECT recipient_id, ref_seq, actor_id FROM notification_events WHERE kind = 'attempt.graded' AND subject_id = $1",
		[attemptId]
	)
	return result.rows
}

beforeAll(async () => {
	ctx = await startAuthApp('test_admin_reviews')
	zone = await seedTeacherZoneWorld(ctx, 'rvw')
	jobs = await import('../../services/background-jobs/index.js')
	reviews = await import('../../services/answer-reviews/index.js')
}, 120_000)

afterAll(async () => {
	await ctx.stop()
})

describe('права на оценку', () => {
	test('зона учителя, своя попытка, ученик и администратор', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }] })
		const questionId = attempt.openIds[0]!
		const body = { score: 2 }

		assert.equal((await postReview(zone.users.teacherB.cookie, attempt.attemptId, questionId, body)).status, 403)
		assert.equal((await postReview(zone.users.s2.cookie, attempt.attemptId, questionId, body)).status, 403)
		assert.equal((await postReview(zone.users.s1.cookie, attempt.attemptId, questionId, body)).status, 403)
		assert.equal((await reviewRows(attempt.attemptId)).length, 0)

		const own = await buildAttempt({ student: 'teacherA', answers: [{ text: 'ответ' }] })
		const ownReply = await postReview(zone.users.teacherA.cookie, own.attemptId, own.openIds[0]!, body)
		assert.equal(ownReply.status, 403)
		assert.equal((await reviewRows(own.attemptId)).length, 0)

		const byOwner = await postReview(zone.users.teacherA.cookie, attempt.attemptId, questionId, body)
		assert.equal(byOwner.status, 200)
		const byAdmin = await postReview(zone.users.admin.cookie, attempt.attemptId, questionId, { score: 3 })
		assert.equal(byAdmin.status, 200)
	})

	test('до закрытия окна 409 REVIEW_NOT_READY, после закрытия оценка проходит', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }], uploadClosesAt: 'future' })
		const questionId = attempt.openIds[0]!
		const early = await postReview(zone.users.teacherA.cookie, attempt.attemptId, questionId, { score: 1 })
		assert.equal(early.status, 409)
		assert.equal(early.body.error, 'REVIEW_NOT_READY')
		assert.equal((await reviewRows(attempt.attemptId)).length, 0)

		await ctx.pgPool.query("UPDATE test_attempts SET upload_closes_at = now() - interval '1 second' WHERE id = $1", [
			attempt.attemptId,
		])
		assert.equal(
			(await postReview(zone.users.teacherA.cookie, attempt.attemptId, questionId, { score: 1 })).status,
			200
		)
	})

	test('вопрос должен быть открытым вопросом этой попытки, оценка 0..3', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }] })
		const cookie = zone.users.teacherA.cookie
		assert.equal((await postReview(cookie, attempt.attemptId, attempt.autoQuestionId, { score: 1 })).status, 404)
		assert.equal((await postReview(cookie, attempt.attemptId, crypto.randomUUID(), { score: 1 })).status, 404)
		for (const score of [4, -1, 1.5, '2']) {
			assert.equal(
				(await postReview(cookie, attempt.attemptId, attempt.openIds[0]!, { score })).status,
				400,
				`score ${score}`
			)
		}
		assert.equal(
			(await postReview(cookie, attempt.attemptId, attempt.openIds[0]!, { score: 1, comment: 'я'.repeat(2001) }))
				.status,
			400
		)
		assert.equal((await reviewRows(attempt.attemptId)).length, 0)
	})
})

describe('итог после оценок', () => {
	test('итог считается после последней оценки, повторная оценка перезаписывает', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'первый' }, { text: 'второй' }] })
		const cookie = zone.users.teacherA.cookie
		const [first, second] = attempt.openIds as [string, string]

		const one = await postReview(cookie, attempt.attemptId, first, { score: 3, comment: '  хорошо  ' })
		assert.equal(one.status, 200)
		assert.equal((one.body.review as Json).comment, 'хорошо')
		assert.deepEqual(one.body.attempt, { reviewStatus: 'pending', finalScorePercentage: null, finalPassed: null })
		assert.equal((await attemptRow(attempt.attemptId)).review_status, 'pending')
		assert.equal((await gradedEvents(attempt.attemptId)).length, 0)

		const two = await postReview(cookie, attempt.attemptId, second, { score: 0 })
		assert.equal(two.status, 200)
		assert.equal((two.body.review as Json).comment, null)
		assert.equal((two.body.review as Json).questionId, second)
		assert.equal(typeof (two.body.review as Json).reviewedAt, 'string')
		assert.equal(typeof (two.body.review as Json).reviewerName, 'string')
		assert.equal((two.body.attempt as Json).reviewStatus, 'graded')
		assert.equal((two.body.attempt as Json).finalPassed, true)
		assertPercent((two.body.attempt as Json).finalScorePercentage, 4 / 7)
		const events = await gradedEvents(attempt.attemptId)
		assert.equal(events.length, 1)
		assert.equal(events[0]!.recipient_id, zone.users.s1.id)
		assert.equal(events[0]!.actor_id, zone.users.teacherA.id)

		const redo = await postReview(cookie, attempt.attemptId, second, { score: 1, comment: 'пересмотрено' })
		assertPercent((redo.body.attempt as Json).finalScorePercentage, 5 / 7)
		const row = await attemptRow(attempt.attemptId)
		assert.equal(row.review_status, 'graded')
		assert.equal(Math.fround(row.final_earned_points!), 5)
		assert.equal((await reviewRows(attempt.attemptId)).length, 3)
		assert.equal((await gradedEvents(attempt.attemptId))[0]!.ref_seq, 2)
	})

	test('чтение для проверки отдаёт текст, фото, оценку и эталон; ученик видит оценку только после итога', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'мой ответ', photo: true }, { text: null }] })
		const cookie = zone.users.teacherA.cookie
		const [first, second] = attempt.openIds as [string, string]
		const read = async () => {
			const reply = await call(ctx, 'GET', `/api/tests/admin/attempts/${attempt.attemptId}`, { cookies: cookie })
			assert.equal(reply.status, 200)
			const results = (reply.body.attempt as Json).results as Json[]
			return new Map(results.map((item) => [item.questionId as string, item]))
		}

		let results = await read()
		const open = results.get(first)!.open as Json
		assert.equal(open.text, 'мой ответ')
		assert.equal((open.photos as Json[]).length, 1)
		assert.equal(open.review, null)
		assert.equal(open.referenceText, 'Эталон: ответ должен упоминать митоз')
		assert.equal((results.get(second)!.open as Json).text, '')
		assert.equal(results.get(attempt.autoQuestionId)!.open, undefined)

		await postReview(cookie, attempt.attemptId, first, { score: 2, comment: 'почти' })
		results = await read()
		const reviewed = results.get(first)!
		assert.equal(((reviewed.open as Json).review as Json).score, 2)
		assert.equal(reviewed.status, 'partial')
		assert.equal(results.get(second)!.status, 'pending')

		const { readAttemptView } = await import('../../services/scored-attempt/index.js')
		const { readLatestReviews } = await import('../../services/answer-reviews/index.js')
		const student = { kind: 'student' as const, showCorrectAnswer: true }
		let view = await readAttemptView(attempt.attemptId, student, readLatestReviews)
		let item = view.results.find((entry) => entry.questionId === first)!
		assert.equal(item.review, null)
		assert.equal(item.referenceText, null)
		assert.equal(item.explanationText, null)

		await postReview(cookie, attempt.attemptId, second, { score: 3 })
		view = await readAttemptView(attempt.attemptId, student, readLatestReviews)
		item = view.results.find((entry) => entry.questionId === first)!
		assert.deepEqual(item.review, { score: 2, comment: 'почти' })
		assert.equal(item.referenceText, 'Эталон: ответ должен упоминать митоз')
		assert.equal(item.earnedPoints, 2)
	})
})

describe('оценка «нет ответа»', () => {
	test('пустой ответ без фото после закрытия окна получает 0 без проверяющего, остальные ждут учителя', async () => {
		const empty = await buildAttempt({
			student: 's1',
			answers: [{ text: '  ' }, { text: null }],
			uploadClosesAt: 'past',
		})
		const mixed = await buildAttempt({
			student: 's1',
			answers: [{ text: null }, { text: 'есть ответ' }, { text: null, photo: true }],
			uploadClosesAt: 'past',
		})
		const open = await buildAttempt({ student: 's1', answers: [{ text: null }], uploadClosesAt: 'future' })

		const report = await jobs.noAnswerReviewsJob().runOnce({ signal: new AbortController().signal })
		assert.equal(report.failed, 0)

		const emptyRows = await reviewRows(empty.attemptId)
		assert.equal(emptyRows.length, 2)
		for (const row of emptyRows) {
			assert.equal(row.score, 0)
			assert.equal(row.comment, OPEN_REVIEW_NO_ANSWER_COMMENT)
			assert.equal(row.reviewer_id, null)
		}
		const emptyAttempt = await attemptRow(empty.attemptId)
		assert.equal(emptyAttempt.review_status, 'graded')
		assert.equal(Math.fround(emptyAttempt.final_score_percentage!), Math.fround((1 / 7) * 100))
		assert.equal(emptyAttempt.final_passed, false)
		const events = await gradedEvents(empty.attemptId)
		assert.equal(events.length, 1)
		assert.equal(events[0]!.recipient_id, zone.users.s1.id)
		assert.equal(events[0]!.actor_id, null)

		const mixedRows = await reviewRows(mixed.attemptId)
		assert.deepEqual(
			mixedRows.map((row) => row.question_id),
			[mixed.openIds[0]]
		)
		assert.equal((await attemptRow(mixed.attemptId)).review_status, 'pending')
		assert.equal((await gradedEvents(mixed.attemptId)).length, 0)

		assert.equal((await reviewRows(open.attemptId)).length, 0)
		assert.equal((await attemptRow(open.attemptId)).review_status, 'pending')
	})

	test('повторный запуск ничего не меняет, ручная оценка не затирается', async () => {
		const attempt = await buildAttempt({
			student: 's1',
			answers: [{ text: null }, { text: null }],
			uploadClosesAt: 'past',
		})
		const manual = await postReview(zone.users.teacherA.cookie, attempt.attemptId, attempt.openIds[0]!, {
			score: 3,
			comment: 'устно ответил',
		})
		assert.equal(manual.status, 200)

		const signal = new AbortController().signal
		await jobs.noAnswerReviewsJob().runOnce({ signal })
		const afterFirst = await reviewRows(attempt.attemptId)
		assert.equal(afterFirst.length, 2)
		assert.equal(afterFirst.find((row) => row.question_id === attempt.openIds[0])!.score, 3)
		assert.equal((await attemptRow(attempt.attemptId)).review_status, 'graded')

		const second = await jobs.noAnswerReviewsJob().runOnce({ signal })
		assert.equal(second.reviewed, 0)
		assert.equal((await reviewRows(attempt.attemptId)).length, 2)
		assert.equal((await gradedEvents(attempt.attemptId))[0]!.ref_seq, 1)

		const direct = await reviews.recordNoAnswerReviews(attempt.attemptId, attempt.openIds)
		assert.deepEqual(direct, { written: 0, reviewStatus: null })
	})
})

describe('таблица answer_reviews', () => {
	function insertReview(
		attemptId: string,
		questionId: string,
		score: number,
		reviewerId: string | null,
		comment: string | null = null
	) {
		return ctx.pgPool.query(
			'INSERT INTO answer_reviews (attempt_id, question_id, score, comment, reviewer_id) VALUES ($1, $2, $3, $4, $5)',
			[attemptId, questionId, score, comment, reviewerId]
		)
	}

	test('оценка вне 0..3 и комментарий длиннее 2000 знаков отвергаются проверкой базы', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }] })
		const questionId = attempt.openIds[0]!
		await insertReview(attempt.attemptId, questionId, 3, null, 'я'.repeat(2000))
		await assert.rejects(insertReview(attempt.attemptId, questionId, 4, null), { code: '23514' })
		await assert.rejects(insertReview(attempt.attemptId, questionId, -1, null), { code: '23514' })
		await assert.rejects(insertReview(attempt.attemptId, questionId, 1, null, 'я'.repeat(2001)), { code: '23514' })
	})

	test('удаление проверяющего оставляет оценку без автора, удаление попытки уносит оценки', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }] })
		const questionId = attempt.openIds[0]!
		const reviewer = await zone.freshUser({ role: 'teacher' })
		await insertReview(attempt.attemptId, questionId, 2, reviewer.id)
		await ctx.pgPool.query('DELETE FROM users WHERE id = $1', [reviewer.id])
		const rows = await reviewRows(attempt.attemptId)
		assert.equal(rows.length, 1)
		assert.equal(rows[0]!.reviewer_id, null)

		await ctx.pgPool.query('DELETE FROM test_attempts WHERE id = $1', [attempt.attemptId])
		assert.equal((await reviewRows(attempt.attemptId)).length, 0)
	})

	test('сверка итогов с оценками не находит расхождений у проверенной попытки', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }] })
		await postReview(zone.users.teacherA.cookie, attempt.attemptId, attempt.openIds[0]!, { score: 2 })
		const { reconcileOutcomes } = await import('../../services/scored-attempt/index.js')
		const { loadLatestScores } = await import('../../services/answer-reviews/index.js')
		const result = await reconcileOutcomes({ loadLatestScores })
		assert.equal(result.mismatched.filter((item) => item.attemptId === attempt.attemptId).length, 0)
	})
})

describe('событие «работа ждёт проверки»', () => {
	async function pendingEvents(attemptId: string) {
		const result = await ctx.pgPool.query<{
			id: string
			recipient_id: string
			ref_seq: number
			actor_id: string | null
			params: Json
		}>(
			"SELECT id, recipient_id, ref_seq, actor_id, params FROM notification_events WHERE kind = 'attempt.review_pending' AND subject_id = $1 ORDER BY recipient_id",
			[attemptId]
		)
		return result.rows
	}

	function recipientsOf(rows: Array<{ recipient_id: string }>): string[] {
		return rows.map((row) => row.recipient_id).sort()
	}

	function ids(...profiles: ZoneProfile[]): string[] {
		return profiles.map((profile) => zone.users[profile].id).sort()
	}

	async function runJob() {
		return jobs.noAnswerReviewsJob().runOnce({ signal: new AbortController().signal })
	}

	test('учителю группы с темой в зоне и администраторам, один раз на попытку, не ученику', async () => {
		const attempt = await buildAttempt({ student: 's1', answers: [{ text: 'ответ' }], uploadClosesAt: 'future' })
		await ctx.pgPool.query('UPDATE test_sessions SET attempt_id = $2, submitted_at = now() WHERE id = $1', [
			attempt.sessionId,
			attempt.attemptId,
		])
		await ctx.pgPool.query('INSERT INTO test_assignments (test_id, user_id, assigned_by) VALUES ($1, $2, $3)', [
			attempt.testId,
			zone.users.s1.id,
			zone.users.admin.id,
		])
		await runJob()
		assert.equal((await pendingEvents(attempt.attemptId)).length, 0)

		const done = await call(
			ctx,
			'POST',
			`/api/tests/public/tests/${attempt.testId}/sessions/${attempt.sessionId}/uploads-done`,
			{ cookies: zone.users.s1.cookie }
		)
		assert.equal(done.status, 200, JSON.stringify(done.body))
		const events = await pendingEvents(attempt.attemptId)
		assert.deepEqual(recipientsOf(events), ids('admin', 'readTestsAll', 'teacherA'))
		assert.equal(events[0]!.actor_id, zone.users.s1.id)
		assert.equal(typeof events[0]!.params.studentName, 'string')

		await runJob()
		await reviews.notifyReviewPending(attempt.attemptId)
		const again = await pendingEvents(attempt.attemptId)
		assert.deepEqual(
			again.map((row) => row.ref_seq),
			[1, 1, 1]
		)

		const teacherEvent = events.find((row) => row.recipient_id === zone.users.teacherA.id)!
		const opened = await call(ctx, 'GET', `/api/notifications/${teacherEvent.id}/open`, {
			cookies: zone.users.teacherA.cookie,
		})
		assert.equal(opened.status, 200, JSON.stringify(opened.body))
		assert.equal(opened.body.href, `/admin/attempts/${attempt.attemptId}`)
	})

	test('обычная сдача без окна фото: событие учителю сразу, без ожидания задачи', async () => {
		const test = await zone.freshTest('X')
		await ctx.pgPool.query('UPDATE tests SET photo_upload_window_minutes = 0 WHERE id = $1', [test.id])
		const openId = await insertOpenQuestion(ctx, test.id, { order: 10 })
		await ctx.pgPool.query('INSERT INTO test_assignments (test_id, user_id, assigned_by) VALUES ($1, $2, $3)', [
			test.id,
			zone.users.s1.id,
			zone.users.admin.id,
		])
		const world = { ctx } as AttemptWorld
		const started = await startSession(world, zone.users.s1.cookie, test.id)
		assert.equal(started.status, 200, JSON.stringify(started.body))
		const clientAttemptId = crypto.randomUUID()
		const body = { sessionId: started.body.sessionId, clientAttemptId, answers: { [openId]: 'мой ответ' } }
		const submitted = await submitAttempt(world, zone.users.s1.cookie, test.id, body)
		assert.equal(submitted.status, 200, JSON.stringify(submitted.body))
		const attemptId = String(submitted.body.attemptId)

		const events = await pendingEvents(attemptId)
		assert.deepEqual(recipientsOf(events), ids('admin', 'readTestsAll', 'teacherA'))

		const repeat = await submitAttempt(world, zone.users.s1.cookie, test.id, body)
		assert.equal(repeat.status, 200, JSON.stringify(repeat.body))
		assert.deepEqual(
			(await pendingEvents(attemptId)).map((row) => row.ref_seq),
			[1, 1, 1]
		)
	})

	test('окно истекло само — событие приходит из фоновой задачи; без групп у ученика только администраторы', async () => {
		const attempt = await buildAttempt({ student: 's2', answers: [{ text: 'ответ' }], uploadClosesAt: 'past' })
		const report = await runJob()
		assert.equal(report.failed, 0)
		assert.deepEqual(recipientsOf(await pendingEvents(attempt.attemptId)), ids('admin', 'readTestsAll'))
	})

	test('авто-0 на все открытые вопросы и попытка без открытых — события нет', async () => {
		const empty = await buildAttempt({ student: 's1', answers: [{ text: null }], uploadClosesAt: 'past' })
		const mixed = await buildAttempt({
			student: 's1',
			answers: [{ text: null }, { text: 'есть ответ' }],
			uploadClosesAt: 'past',
		})
		const auto = await buildAttempt({ student: 's1', answers: [], uploadClosesAt: 'past' })
		await runJob()
		assert.equal((await pendingEvents(empty.attemptId)).length, 0)
		assert.equal((await pendingEvents(auto.attemptId)).length, 0)
		assert.deepEqual(recipientsOf(await pendingEvents(mixed.attemptId)), ids('admin', 'readTestsAll', 'teacherA'))
	})
})
