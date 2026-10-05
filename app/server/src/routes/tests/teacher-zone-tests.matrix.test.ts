import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { ATTEMPT_QUESTIONS } from '../../test-support/attempt-world.js'
import { call, nextIp, startAuthApp, type AuthApp, type Reply } from '../../test-support/auth-app.js'
import {
	seedTeacherZoneWorld,
	type FreshTest,
	type TeacherZoneWorld,
	type ZoneAttemptKey,
	type ZoneProfile,
	type ZoneTestKey,
	type ZoneTopicKey,
} from '../../test-support/teacher-zone-world.js'
import { readZipEntries } from '../../test-support/zip.js'

const KNOWN_DEFECTS = new Set<string>([])

function check(id: string, title: string, fn: () => Promise<void>): void {
	const run = KNOWN_DEFECTS.has(id) ? test.fails : test
	run(`${id}: ${title}`, fn)
}

type Row = { profile: ZoneProfile; route: string; title: string; run: (profile: ZoneProfile) => Promise<void> }

const DELETE_WITH_ATTEMPTS_ERROR = 'У теста есть попытки учеников. Снимите публикацию или обратитесь к администратору'

let ctx: AuthApp
let w: TeacherZoneWorld

function send(profile: ZoneProfile, method: string, path: string, body?: unknown): Promise<Reply> {
	return call(ctx, method, `/api/tests${path}`, { cookies: w.users[profile].cookie, body })
}

async function download(profile: ZoneProfile, path: string): Promise<{ status: number; entries: string[] }> {
	const response = await fetch(`${ctx.baseUrl}/api/tests${path}`, {
		headers: { cookie: w.users[profile].cookie, 'x-forwarded-for': nextIp() },
	})
	const buffer = Buffer.from(await response.arrayBuffer())
	if (response.status !== 200) return { status: response.status, entries: [] }
	return { status: response.status, entries: [...readZipEntries(buffer).keys()] }
}

function expectStatus(reply: { status: number; body?: unknown }, status: number): void {
	assert.equal(reply.status, status, `ожидался ${status}, пришёл ${reply.status}: ${JSON.stringify(reply.body)}`)
}

function rowsOf(list: unknown, name: string): Array<Record<string, unknown>> {
	assert.ok(Array.isArray(list), `нет списка ${name}`)
	return list as Array<Record<string, unknown>>
}

function topicKeys(list: unknown): ZoneTopicKey[] {
	const bySlug = new Map(Object.entries(w.topics).map(([key, topic]) => [topic.slug, key as ZoneTopicKey]))
	return rowsOf(list, 'разделов')
		.map((row) => bySlug.get(String(row.slug)))
		.filter((key): key is ZoneTopicKey => key !== undefined)
		.sort()
}

function testKeys(list: unknown): ZoneTestKey[] {
	const byId = new Map(Object.entries(w.tests).map(([key, item]) => [item.id, key as ZoneTestKey]))
	return rowsOf(list, 'тестов')
		.map((row) => byId.get(String(row.id)))
		.filter((key): key is ZoneTestKey => key !== undefined)
		.sort()
}

function attemptKeys(list: unknown): ZoneAttemptKey[] {
	const byId = new Map(Object.entries(w.attempts).map(([key, id]) => [id, key as ZoneAttemptKey]))
	return rowsOf(list, 'попыток')
		.map((row) => byId.get(String(row.attemptId)))
		.filter((key): key is ZoneAttemptKey => key !== undefined)
		.sort()
}

function studentIds(list: unknown): string[] {
	return rowsOf(list, 'попыток').map((row) => String(row.studentId))
}

function uniqueSlug(kind: string): string {
	return `${w.prefix}-${kind}-${crypto.randomUUID().slice(0, 8)}`
}

function uniqueKey(): string {
	return `${w.prefix}_type_${crypto.randomUUID().slice(0, 8)}`
}

async function testExists(testId: string): Promise<boolean> {
	const result = await ctx.pgPool.query('SELECT 1 FROM tests WHERE id = $1', [testId])
	return (result.rowCount ?? 0) > 0
}

async function removeTest(testId: string): Promise<void> {
	if (await testExists(testId)) expectStatus(await send('admin', 'DELETE', `/${testId}`), 200)
}

function settingsBody(fresh: FreshTest, topicId: string): Record<string, unknown> {
	return { topicId, title: `Тест ${fresh.slug}`, slug: fresh.slug, isPublished: true }
}

async function freshQuestionType(): Promise<string> {
	const radio = await send('admin', 'GET', '/question-types/radio')
	expectStatus(radio, 200)
	const definition = radio.body.questionType as Record<string, unknown>
	const key = uniqueKey()
	const created = await send('admin', 'POST', '/question-types', {
		key,
		title: `Тип ${key}`,
		uiTemplate: definition.uiTemplate,
		validationSchema: definition.validationSchema,
		scoringRule: definition.scoringRule,
	})
	expectStatus(created, 201)
	return key
}

async function questionTypeBody(): Promise<Record<string, unknown>> {
	const radio = await send('admin', 'GET', '/question-types/radio')
	expectStatus(radio, 200)
	const definition = radio.body.questionType as Record<string, unknown>
	const key = uniqueKey()
	return {
		key,
		title: `Тип ${key}`,
		uiTemplate: definition.uiTemplate,
		validationSchema: definition.validationSchema,
		scoringRule: definition.scoringRule,
	}
}

async function freshDraft(testId: string): Promise<string> {
	const created = await send('teacherA', 'POST', `/${testId}/question-drafts`)
	expectStatus(created, 201)
	const draft = created.body.draft as { id: string }
	return draft.id
}

const ROWS: Row[] = []

function row(profiles: ZoneProfile[], route: string, title: string, run: (profile: ZoneProfile) => Promise<void>) {
	for (const profile of profiles) ROWS.push({ profile, route, title, run })
}

function status(
	cases: Array<[ZoneProfile, number]>,
	route: string,
	request: (profile: ZoneProfile) => Promise<{ status: number; body?: unknown }>
): void {
	for (const [profile, expected] of cases) {
		ROWS.push({
			profile,
			route,
			title: String(expected),
			run: async () => expectStatus(await request(profile), expected),
		})
	}
}

row(['admin'], 'GET /topics', '200 X Y Z и у X поле teachers с teacherA', async (p) => {
	const reply = await send(p, 'GET', '/topics')
	expectStatus(reply, 200)
	assert.deepEqual(topicKeys(reply.body.topics), ['X', 'Y', 'Z'])
	const rowX = rowsOf(reply.body.topics, 'разделов').find((item) => item.slug === w.topics.X.slug)
	assert.ok(rowX && Array.isArray(rowX.teachers), 'у раздела X нет поля teachers')
	const ids = (rowX.teachers as unknown[]).map((item) =>
		typeof item === 'string' ? item : (item as { id?: unknown }).id
	)
	assert.ok(ids.includes(w.users.teacherA.id), 'teacherA не в teachers раздела X')
})
row(['teacherA'], 'GET /topics', '200 только X и без поля teachers', async (p) => {
	const reply = await send(p, 'GET', '/topics')
	expectStatus(reply, 200)
	assert.deepEqual(topicKeys(reply.body.topics), ['X'])
	for (const item of rowsOf(reply.body.topics, 'разделов')) assert.ok(!('teachers' in item), 'поле teachers у учителя')
})
row(['teacherB'], 'GET /topics', '200 и только раздел Y', async (p) => {
	const reply = await send(p, 'GET', '/topics')
	expectStatus(reply, 200)
	assert.deepEqual(topicKeys(reply.body.topics), ['Y'])
})
status([['s1', 403]], 'GET /topics', (p) => send(p, 'GET', '/topics'))
for (const [profile, expected] of [
	['readTests', []],
	['readTestsAll', ['X', 'Y', 'Z']],
	['adminNoZone', []],
] as Array<[ZoneProfile, ZoneTopicKey[]]>) {
	row([profile], 'GET /topics', `200 ${expected.join(' ') || 'пусто'}`, async (p) => {
		const reply = await send(p, 'GET', '/topics')
		expectStatus(reply, 200)
		assert.deepEqual(topicKeys(reply.body.topics), expected)
	})
}

row(['admin'], 'GET /topics/teacher-options', '200 активные учителя без teacherOff и s1', async (p) => {
	const reply = await send(p, 'GET', '/topics/teacher-options')
	expectStatus(reply, 200)
	const ids = rowsOf(reply.body.teachers, 'учителей').map((item) => item.id)
	assert.ok(ids.includes(w.users.teacherA.id), 'нет teacherA')
	assert.ok(ids.includes(w.users.teacherB.id), 'нет teacherB')
	assert.ok(!ids.includes(w.users.teacherOff.id), 'есть teacherOff')
	assert.ok(!ids.includes(w.users.s1.id), 'есть s1')
})
status(
	[
		['teacherA', 403],
		['adminNoZone', 403],
	],
	'GET /topics/teacher-options',
	(p) => send(p, 'GET', '/topics/teacher-options')
)

status(
	[
		['admin', 201],
		['teacherA', 403],
		['readTestsAll', 403],
		['adminNoZone', 403],
	],
	'POST /topics',
	(p) => {
		const slug = uniqueSlug('topic')
		return send(p, 'POST', '/topics', { slug, title: `Раздел ${slug}` })
	}
)
status(
	[
		['admin', 200],
		['teacherA', 403],
		['adminNoZone', 403],
	],
	'PATCH /topics/:fresh',
	async (p) => {
		const topic = await w.freshTopic({ teacher: 'teacherA' })
		return send(p, 'PATCH', `/topics/${topic.id}`, { title: `Новое имя ${topic.slug}` })
	}
)
status(
	[
		['admin', 200],
		['teacherA', 403],
	],
	'DELETE /topics/:fresh',
	async (p) => {
		const topic = await w.freshTopic({ teacher: 'teacherA' })
		return send(p, 'DELETE', `/topics/${topic.id}`)
	}
)
for (const [profile, target, expected, suffix] of [
	['admin', 'teacherA', 200, ''],
	['admin', 's1', 400, ' s1'],
	['admin', 'teacherOff', 400, ' teacherOff'],
	['teacherA', 'teacherA', 403, ''],
] as Array<[ZoneProfile, ZoneProfile, number, string]>) {
	status([[profile, expected]], `PUT /topics/:fresh/teachers${suffix}`, async (p) => {
		const topic = await w.freshTopic()
		return send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: [w.users[target].id] })
	})
}
row(
	['admin'],
	'PUT /topics/:fresh/teachers teacherA teacherB',
	'200 два учителя, teacherB видит раздел, после возврата к teacherA не видит',
	async (p) => {
		const topic = await w.freshTopic({ teacher: 'teacherA' })
		const both = await send(p, 'PUT', `/topics/${topic.id}/teachers`, {
			teacherIds: [w.users.teacherA.id, w.users.teacherB.id],
		})
		expectStatus(both, 200)
		assert.deepEqual(
			rowsOf(both.body.teachers, 'учителей')
				.map((item) => String(item.id))
				.sort(),
			[w.users.teacherA.id, w.users.teacherB.id].sort()
		)
		const shared = await send('teacherB', 'GET', '/topics')
		expectStatus(shared, 200)
		const sharedSlugs = rowsOf(shared.body.topics, 'разделов').map((item) => item.slug)
		assert.ok(sharedSlugs.includes(topic.slug), 'teacherB не видит закреплённый раздел')
		assert.ok(sharedSlugs.includes(w.topics.Y.slug), 'teacherB не видит раздел Y')
		const single = await send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: [w.users.teacherA.id] })
		expectStatus(single, 200)
		assert.deepEqual(
			rowsOf(single.body.teachers, 'учителей').map((item) => item.id),
			[w.users.teacherA.id]
		)
		const own = await send('teacherB', 'GET', '/topics')
		expectStatus(own, 200)
		const ownSlugs = rowsOf(own.body.topics, 'разделов').map((item) => item.slug)
		assert.ok(!ownSlugs.includes(topic.slug), 'teacherB видит снятый раздел')
		assert.deepEqual(topicKeys(own.body.topics), ['Y'])
	}
)
row(
	['admin'],
	'PUT /topics/:fresh/teachers stale',
	'200 с прежним набором при неактивном закреплённом учителе, 400 при добавлении неактивного',
	async (p) => {
		const stale = await w.freshUser({ role: 'teacher' })
		const topic = await w.freshTopic()
		expectStatus(await send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: [stale.id] }), 200)
		await ctx.pgPool.query('UPDATE users SET is_active = false WHERE id = $1', [stale.id])
		const same = await send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: [stale.id] })
		expectStatus(same, 200)
		assert.deepEqual(
			rowsOf(same.body.teachers, 'учителей').map((item) => item.id),
			[stale.id]
		)
		const inactive = await w.freshUser({ role: 'teacher', isActive: false, activated: true })
		const added = await send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: [stale.id, inactive.id] })
		expectStatus(added, 400)
		assert.deepEqual(added.body, { error: 'Учитель не найден или не активен' })
		const kept = await ctx.pgPool.query('SELECT teacher_id FROM teacher_topics WHERE topic_id = $1', [topic.id])
		assert.deepEqual(
			kept.rows.map((item: { teacher_id: string }) => item.teacher_id),
			[stale.id]
		)
	}
)
status([['admin', 404]], 'PUT /topics/:missing/teachers', (p) =>
	send(p, 'PUT', `/topics/${crypto.randomUUID()}/teachers`, { teacherIds: [w.users.teacherA.id] })
)
for (const [suffix, teacherIds] of [
	[' duplicates', () => [w.users.teacherA.id, w.users.teacherA.id]],
	[' not uuid', () => ['teacherA']],
	[' over 50', () => Array.from({ length: 51 }, () => crypto.randomUUID())],
] as Array<[string, () => string[]]>) {
	status([['admin', 400]], `PUT /topics/:fresh/teachers${suffix}`, async (p) => {
		const topic = await w.freshTopic()
		return send(p, 'PUT', `/topics/${topic.id}/teachers`, { teacherIds: teacherIds() })
	})
}

for (const [profile, expected] of [
	['admin', ['tX', 'tX2', 'tY', 'tZ']],
	['teacherA', ['tX', 'tX2']],
	['teacherB', ['tY']],
	['readTests', []],
	['readTestsAll', ['tX', 'tX2', 'tY', 'tZ']],
	['adminNoZone', []],
] as Array<[ZoneProfile, ZoneTestKey[]]>) {
	row([profile], 'GET /api/tests', `200 ${expected.join(' ') || 'пусто'}`, async (p) => {
		const reply = await send(p, 'GET', '/')
		expectStatus(reply, 200)
		assert.deepEqual(testKeys(reply.body.tests), expected)
	})
}
status([['s1', 403]], 'GET /api/tests', (p) => send(p, 'GET', '/'))
row(['teacherA'], 'GET /api/tests?topicId=Y', '200 без тестов раздела Y', async (p) => {
	const reply = await send(p, 'GET', `/?topicId=${w.topics.Y.id}`)
	expectStatus(reply, 200)
	const leaked = rowsOf(reply.body.tests, 'тестов').filter((item) => item.topicId === w.topics.Y.id)
	assert.deepEqual(leaked, [])
})

const READ_CASES: Array<[ZoneProfile, number]> = [
	['admin', 200],
	['teacherA', 200],
	['teacherB', 403],
	['s1', 403],
	['readTests', 403],
	['readTestsAll', 200],
	['adminNoZone', 403],
]
status(READ_CASES, 'GET /api/tests/:tX', (p) => send(p, 'GET', `/${w.tests.tX.id}`))
status(READ_CASES, 'GET /api/tests/by-slug/X/tX', (p) =>
	send(p, 'GET', `/by-slug/${w.topics.X.slug}/${w.tests.tX.slug}`)
)
status(
	[
		['admin', 404],
		['teacherA', 403],
	],
	'GET /api/tests/:missing',
	(p) => send(p, 'GET', `/${crypto.randomUUID()}`)
)
status(
	[
		['admin', 404],
		['teacherA', 404],
		['readTests', 403],
		['adminNoZone', 403],
	],
	'GET /api/tests/by-slug/X/missing',
	(p) => send(p, 'GET', `/by-slug/${w.topics.X.slug}/${uniqueSlug('missing')}`)
)

for (const [profile, topicKey, expected] of [
	['admin', 'X', 201],
	['teacherA', 'X', 201],
	['teacherB', 'X', 403],
	['readTestsAll', 'X', 403],
	['teacherA', 'Y', 403],
] as Array<[ZoneProfile, ZoneTopicKey, number]>) {
	status([[profile, expected]], `POST /api/tests/save ${topicKey}`, (p) => {
		const slug = uniqueSlug('saved')
		return send(p, 'POST', '/save', {
			topicId: w.topics[topicKey].id,
			title: `Тест ${slug}`,
			slug,
			isPublished: false,
			questions: [],
		})
	})
}

status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PATCH /api/tests/:freshX/settings',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'PATCH', `/${fresh.id}/settings`, settingsBody(fresh, w.topics.X.id))
	}
)
status([['teacherA', 403]], 'PATCH /api/tests/:freshX/settings topicId=Y', async (p) => {
	const fresh = await w.freshTest('X')
	return send(p, 'PATCH', `/${fresh.id}/settings`, settingsBody(fresh, w.topics.Y.id))
})

status(
	[
		['teacherA', 201],
		['teacherB', 403],
	],
	'POST /api/tests/:freshX/questions',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'POST', `/${fresh.id}/questions`, ATTEMPT_QUESTIONS.radio)
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PATCH /api/tests/:freshX/questions/:id',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'PATCH', `/${fresh.id}/questions/${fresh.questionId}`, {
			...ATTEMPT_QUESTIONS.radio,
			promptText: 'Изменённый вопрос',
		})
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'DELETE /api/tests/:freshX/questions/:id',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'DELETE', `/${fresh.id}/questions/${fresh.questionId}`)
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PUT /api/tests/:freshX/questions/reorder',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'PUT', `/${fresh.id}/questions/reorder`, { questionIds: [fresh.questionId] })
	}
)
status(
	[
		['teacherA', 403],
		['admin', 200],
	],
	'POST /api/tests/:freshX/questions/:id/move targetTestId=freshY',
	async (p) => {
		const source = await w.freshTest('X')
		const target = await w.freshTest('Y')
		return send(p, 'POST', `/${source.id}/questions/${source.questionId}/move`, { targetTestId: target.id })
	}
)
status([['teacherA', 403]], 'POST /api/tests/:freshX/questions/:id/move targetTopicId=Y', async (p) => {
	const source = await w.freshTest('X')
	return send(p, 'POST', `/${source.id}/questions/${source.questionId}/move`, { targetTopicId: w.topics.Y.id })
})

status([['teacherA', 200]], 'DELETE /api/tests/:freshX', async (p) => {
	const fresh = await w.freshTest('X')
	return send(p, 'DELETE', `/${fresh.id}`)
})
row(['teacherA'], 'DELETE /api/tests/:freshX preview', '200 при попытке-предпросмотре учителя', async (p) => {
	const fresh = await w.freshTest('X', { withAttemptBy: 'teacherA' })
	try {
		expectStatus(await send(p, 'DELETE', `/${fresh.id}`), 200)
		assert.equal(await testExists(fresh.id), false, 'тест остался')
	} finally {
		await removeTest(fresh.id)
	}
})
row(
	['teacherA'],
	'DELETE /api/tests/:freshX attempt s1',
	'409 с текстом D-25 и тест на месте; admin 200',
	async (p) => {
		const fresh = await w.freshTest('X', { withAttemptBy: 's1' })
		try {
			const reply = await send(p, 'DELETE', `/${fresh.id}`)
			expectStatus(reply, 409)
			assert.deepEqual(reply.body, { error: DELETE_WITH_ATTEMPTS_ERROR })
			assert.equal(await testExists(fresh.id), true, 'тест удалён')
			expectStatus(await send('admin', 'DELETE', `/${fresh.id}`), 200)
		} finally {
			await removeTest(fresh.id)
		}
	}
)
status([['teacherB', 403]], 'DELETE /api/tests/:freshX', async (p) => {
	const fresh = await w.freshTest('X')
	return send(p, 'DELETE', `/${fresh.id}`)
})

status(
	[
		['teacherA', 400],
		['teacherB', 403],
	],
	'POST /api/tests/:tX/assets',
	(p) => send(p, 'POST', `/${w.tests.tX.id}/assets`)
)

row(['teacherA'], 'GET /api/tests/:tX/export?withAnswers=true', '200 с answer_keys.json', async (p) => {
	const reply = await download(p, `/${w.tests.tX.id}/export?withAnswers=true`)
	expectStatus(reply, 200)
	assert.ok(
		reply.entries.some((name) => name.endsWith('answer_keys.json')),
		'нет answer_keys.json'
	)
})
status([['teacherB', 403]], 'GET /api/tests/:tX/export', (p) => download(p, `/${w.tests.tX.id}/export`))
row(['readTestsAll'], 'GET /api/tests/:tX/export?withAnswers=true', '200 без answer_keys.json', async (p) => {
	const reply = await download(p, `/${w.tests.tX.id}/export?withAnswers=true`)
	expectStatus(reply, 200)
	assert.deepEqual(
		reply.entries.filter((name) => name.endsWith('answer_keys.json')),
		[]
	)
})
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'GET /topics/X/export',
	(p) => download(p, `/topics/${w.topics.X.slug}/export`)
)
row(['readTestsAll'], 'GET /topics/X/export?withAnswers=true', '200 без answer_keys.json', async (p) => {
	const reply = await download(p, `/topics/${w.topics.X.slug}/export?withAnswers=true`)
	expectStatus(reply, 200)
	assert.deepEqual(
		reply.entries.filter((name) => name.endsWith('answer_keys.json')),
		[]
	)
})

status(
	[
		['teacherA', 200],
		['s1', 403],
	],
	'GET /question-types',
	(p) => send(p, 'GET', '/question-types')
)
status([['teacherA', 403]], 'GET /question-types?testId=tY', (p) =>
	send(p, 'GET', `/question-types?testId=${w.tests.tY.id}`)
)
status([['teacherA', 200]], 'GET /question-types?testId=tX', (p) =>
	send(p, 'GET', `/question-types?testId=${w.tests.tX.id}`)
)
status(
	[
		['admin', 201],
		['teacherA', 403],
		['adminNoZone', 403],
	],
	'POST /question-types',
	async (p) => send(p, 'POST', '/question-types', await questionTypeBody())
)
status(
	[
		['teacherA', 403],
		['admin', 200],
	],
	'PATCH /question-types/:fresh',
	async (p) => {
		const key = await freshQuestionType()
		return send(p, 'PATCH', `/question-types/${key}`, { title: `Новое имя ${key}` })
	}
)
status(
	[
		['teacherA', 403],
		['admin', 200],
	],
	'DELETE /question-types/:fresh',
	async (p) => {
		const key = await freshQuestionType()
		return send(p, 'DELETE', `/question-types/${key}`)
	}
)

status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'GET /question-types/tests/:tX/overrides',
	(p) => send(p, 'GET', `/question-types/tests/${w.tests.tX.id}/overrides`)
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PUT /question-types/tests/:freshX/overrides/radio',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'PUT', `/question-types/tests/${fresh.id}/overrides/radio`, { titleOverride: 'Свой выбор' })
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'DELETE /question-types/tests/:freshX/overrides/radio',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'DELETE', `/question-types/tests/${fresh.id}/overrides/radio`)
	}
)

status(
	[
		['teacherA', 200],
		['s1', 403],
	],
	'GET /scoring-rules/global',
	(p) => send(p, 'GET', '/scoring-rules/global')
)
status(
	[
		['admin', 200],
		['teacherA', 403],
		['adminNoZone', 403],
	],
	'PUT /scoring-rules/global',
	async (p) => {
		const current = await send('admin', 'GET', '/scoring-rules/global')
		expectStatus(current, 200)
		return send(p, 'PUT', '/scoring-rules/global', { rules: current.body.rules })
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'GET /scoring-rules/tests/:tX',
	(p) => send(p, 'GET', `/scoring-rules/tests/${w.tests.tX.id}`)
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PUT /scoring-rules/tests/:freshX',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'PUT', `/scoring-rules/tests/${fresh.id}`, { useGlobal: true })
	}
)

status(
	[
		['teacherA', 201],
		['teacherB', 403],
	],
	'POST /api/tests/:freshX/question-drafts',
	async (p) => {
		const fresh = await w.freshTest('X')
		return send(p, 'POST', `/${fresh.id}/question-drafts`)
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'GET /api/tests/:freshX/question-drafts',
	async (p) => {
		const fresh = await w.freshTest('X')
		await freshDraft(fresh.id)
		return send(p, 'GET', `/${fresh.id}/question-drafts`)
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'GET /api/tests/:freshX/question-drafts/:draft',
	async (p) => {
		const fresh = await w.freshTest('X')
		const draftId = await freshDraft(fresh.id)
		return send(p, 'GET', `/${fresh.id}/question-drafts/${draftId}`)
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'PATCH /api/tests/:freshX/question-drafts/:draft',
	async (p) => {
		const fresh = await w.freshTest('X')
		const draftId = await freshDraft(fresh.id)
		return send(p, 'PATCH', `/${fresh.id}/question-drafts/${draftId}`, { payload: { question: { type: 'radio' } } })
	}
)
status(
	[
		['teacherA', 200],
		['teacherB', 403],
	],
	'DELETE /api/tests/:freshX/question-drafts/:draft',
	async (p) => {
		const fresh = await w.freshTest('X')
		const draftId = await freshDraft(fresh.id)
		return send(p, 'DELETE', `/${fresh.id}/question-drafts/${draftId}`)
	}
)

row(['admin'], 'GET /admin/dashboard', '200 без попытки teacherA и с попытками s1 s2 s3', async (p) => {
	const reply = await send(p, 'GET', '/admin/dashboard')
	expectStatus(reply, 200)
	const latest = reply.body.latestAttempts
	assert.ok(!studentIds(latest).includes(w.users.teacherA.id), 'попытка teacherA в статистике')
	assert.deepEqual(attemptKeys(latest), ['s1X', 's2X', 's2Y', 's3Y'])
})
row(['teacherA'], 'GET /admin/dashboard', '200 без попыток раздела Y и без своей', async (p) => {
	const reply = await send(p, 'GET', '/admin/dashboard')
	expectStatus(reply, 200)
	const latest = reply.body.latestAttempts
	assert.ok(!studentIds(latest).includes(w.users.teacherA.id), 'своя попытка teacherA в статистике')
	const keys = attemptKeys(latest)
	assert.ok(!keys.includes('s2Y') && !keys.includes('s3Y'), `попытки раздела Y: ${keys.join(' ')}`)
})
status([['s1', 403]], 'GET /admin/dashboard', (p) => send(p, 'GET', '/admin/dashboard'))
row(['adminNoZone'], 'GET /admin/dashboard', '200 и totalAttempts 0', async (p) => {
	const reply = await send(p, 'GET', '/admin/dashboard')
	expectStatus(reply, 200)
	assert.equal((reply.body.summary as { totalAttempts: number }).totalAttempts, 0)
})

row(['admin'], 'GET /admin/attempts', '200 без попыток teacherA и total по строкам', async (p) => {
	const reply = await send(p, 'GET', '/admin/attempts?limit=100')
	expectStatus(reply, 200)
	const rows = rowsOf(reply.body.rows, 'попыток')
	assert.ok(!studentIds(rows).includes(w.users.teacherA.id), 'попытка teacherA в списке')
	assert.equal(reply.body.total, rows.length)
})
for (const [profile, expected] of [
	['teacherA', ['s1X', 's2X']],
	['teacherB', ['s2Y', 's3Y']],
] as Array<[ZoneProfile, ZoneAttemptKey[]]>) {
	row([profile], 'GET /admin/attempts', `200 только ${expected.join(' ')} и total по строкам`, async (p) => {
		const reply = await send(p, 'GET', '/admin/attempts?limit=100')
		expectStatus(reply, 200)
		const rows = rowsOf(reply.body.rows, 'попыток')
		assert.deepEqual(attemptKeys(rows), expected)
		assert.equal(reply.body.total, rows.length)
	})
}
status([['s1', 403]], 'GET /admin/attempts', (p) => send(p, 'GET', '/admin/attempts?limit=100'))
row(['adminNoZone'], 'GET /admin/attempts', '200 пусто и total 0', async (p) => {
	const reply = await send(p, 'GET', '/admin/attempts?limit=100')
	expectStatus(reply, 200)
	assert.deepEqual(reply.body.rows, [])
	assert.equal(reply.body.total, 0)
})

status(READ_CASES, 'GET /admin/attempts/:s2X', (p) => send(p, 'GET', `/admin/attempts/${w.attempts.s2X}`))
status(
	[
		['admin', 404],
		['teacherA', 403],
	],
	'GET /admin/attempts/:missing',
	(p) => send(p, 'GET', `/admin/attempts/${crypto.randomUUID()}`)
)

beforeAll(async () => {
	ctx = await startAuthApp('test_tz_tests')
	w = await seedTeacherZoneWorld(ctx, 'tzt')
}, 180_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('матрица зоны учителя: маршруты тестов и разделов', () => {
	const seen = new Set<string>()
	for (const item of ROWS) {
		const id = `${item.profile} ${item.route}`
		assert.ok(!seen.has(id), `повтор id ${id}`)
		seen.add(id)
		check(id, item.title, () => item.run(item.profile))
	}
	for (const id of KNOWN_DEFECTS) assert.ok(seen.has(id), `KNOWN_DEFECTS без строки ${id}`)
})
