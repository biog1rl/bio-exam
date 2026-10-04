import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { addQuestion, startSession, submitAttempt, type AttemptWorld } from './attempt-world.js'
import { seedUser, type AuthApp } from './auth-app.js'
import { sessionCookieFor } from './http.js'

export type ZoneProfile =
	| 'admin'
	| 'teacherA'
	| 'teacherB'
	| 'teacherOff'
	| 's1'
	| 's2'
	| 's3'
	| 'invited'
	| 'readTests'
	| 'readTestsAll'
	| 'readUsers'
	| 'readUsersAll'
	| 'adminNoZone'

export type ZoneTopicKey = 'X' | 'Y' | 'Z'

export type ZoneTestKey = 'tX' | 'tX2' | 'tY' | 'tZ'

export type ZoneGroupKey = 'G' | 'GB' | 'GA'

export type ZoneAttemptKey = 's1X' | 's2X' | 's2Y' | 's3Y' | 'teacherAX'

export type ZoneUser = { id: string; login: string; cookie: string }

export type ZoneTopic = { id: string; slug: string }

export type ZoneTest = { id: string; slug: string; topicSlug: string; questionId: string }

export type FreshTest = { id: string; slug: string; questionId: string; attemptId: string | null }

export type FreshUserOptions = {
	role?: 'user' | 'teacher' | 'admin' | null
	groups?: string[]
	isActive?: boolean
	activated?: boolean
	allow?: string[]
}

export type TeacherZoneWorld = {
	ctx: AuthApp
	prefix: string
	users: Record<ZoneProfile, ZoneUser>
	topics: Record<ZoneTopicKey, ZoneTopic>
	tests: Record<ZoneTestKey, ZoneTest>
	groups: Record<ZoneGroupKey, string>
	attempts: Record<ZoneAttemptKey, string>
	freshTopic(options?: { teacher?: ZoneProfile }): Promise<ZoneTopic>
	freshTest(topic: ZoneTopicKey | ZoneTopic, options?: { withAttemptBy?: ZoneProfile }): Promise<FreshTest>
	freshQuestion(testKey: ZoneTestKey): Promise<string>
	freshUser(options?: FreshUserOptions): Promise<ZoneUser>
	freshGroup(options?: { owner?: string | null; members?: string[] }): Promise<string>
}

type Grant = { key: string; allow: boolean }

type ProfileSpec = {
	role: 'user' | 'teacher' | 'admin'
	student: boolean
	isActive: boolean
	activated: boolean
	invited: boolean
	grants: Grant[]
}

const PROFILE_SPECS: Record<ZoneProfile, ProfileSpec> = {
	admin: { role: 'admin', student: false, isActive: true, activated: true, invited: false, grants: [] },
	teacherA: { role: 'teacher', student: false, isActive: true, activated: true, invited: false, grants: [] },
	teacherB: { role: 'teacher', student: false, isActive: true, activated: true, invited: false, grants: [] },
	teacherOff: { role: 'teacher', student: false, isActive: false, activated: false, invited: false, grants: [] },
	s1: { role: 'user', student: true, isActive: true, activated: true, invited: false, grants: [] },
	s2: { role: 'user', student: true, isActive: true, activated: true, invited: false, grants: [] },
	s3: { role: 'user', student: true, isActive: true, activated: true, invited: false, grants: [] },
	invited: { role: 'user', student: true, isActive: false, activated: false, invited: true, grants: [] },
	readTests: {
		role: 'user',
		student: false,
		isActive: true,
		activated: true,
		invited: false,
		grants: [{ key: 'tests.read', allow: true }],
	},
	readTestsAll: {
		role: 'user',
		student: false,
		isActive: true,
		activated: true,
		invited: false,
		grants: [
			{ key: 'tests.read', allow: true },
			{ key: 'zone.all', allow: true },
		],
	},
	readUsers: {
		role: 'user',
		student: false,
		isActive: true,
		activated: true,
		invited: false,
		grants: [{ key: 'users.read', allow: true }],
	},
	readUsersAll: {
		role: 'user',
		student: false,
		isActive: true,
		activated: true,
		invited: false,
		grants: [
			{ key: 'users.read', allow: true },
			{ key: 'zone.all', allow: true },
		],
	},
	adminNoZone: {
		role: 'admin',
		student: false,
		isActive: true,
		activated: true,
		invited: false,
		grants: [{ key: 'zone.all', allow: false }],
	},
}

const PROFILE_ORDER = Object.keys(PROFILE_SPECS) as ZoneProfile[]

export async function seedTeacherZoneWorld(ctx: AuthApp, prefix: string): Promise<TeacherZoneWorld> {
	const { db, schema, pgPool } = ctx
	const password = `${prefix}-password-1`
	let counter = 0
	const nextName = (kind: string) => {
		counter += 1
		return `${prefix}-${kind}${counter}`
	}

	async function grant(userId: string, grants: Grant[]): Promise<void> {
		for (const item of grants) {
			const [domain, action] = item.key.split('.')
			assert.ok(domain && action, `seedTeacherZoneWorld: bad grant ${item.key}`)
			await pgPool.query('INSERT INTO rbac_user_grants (user_id, domain, action, allow) VALUES ($1, $2, $3, $4)', [
				userId,
				domain,
				action,
				item.allow,
			])
		}
	}

	async function createUser(
		login: string,
		label: string,
		options: { roles: string[]; isActive: boolean; activated: boolean; invited: boolean; grants: Grant[] }
	): Promise<ZoneUser> {
		const id = await seedUser(ctx, { login, roles: options.roles, password, isActive: options.isActive })
		await pgPool.query(
			`UPDATE users SET first_name = $2, last_name = $3,
				activated_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
				invited_at = CASE WHEN $5::boolean THEN now() ELSE NULL END
			WHERE id = $1`,
			[id, `Имя ${prefix} ${label}`, `Фамилия ${prefix} ${label}`, options.activated, options.invited]
		)
		await grant(id, options.grants)
		const cookie = await sessionCookieFor({ id, login })
		return { id, login, cookie }
	}

	const users = {} as Record<ZoneProfile, ZoneUser>
	for (const profile of PROFILE_ORDER) {
		const spec = PROFILE_SPECS[profile]
		users[profile] = await createUser(`${prefix}_${profile.toLowerCase()}`, profile, {
			roles: [spec.role],
			isActive: spec.isActive,
			activated: spec.activated,
			invited: spec.invited,
			grants: spec.grants,
		})
	}
	const adminId = users.admin.id

	async function insertTopic(slug: string, title: string): Promise<ZoneTopic> {
		const [topic] = await db
			.insert(schema.topics)
			.values({ slug, title, isActive: true, createdBy: adminId })
			.returning({ id: schema.topics.id, slug: schema.topics.slug })
		assert.ok(topic, `seedTeacherZoneWorld: topic ${slug} was not created`)
		return topic
	}

	async function attachTeacher(teacherId: string, topicId: string): Promise<void> {
		await db.insert(schema.teacherTopics).values({ teacherId, topicId, assignedBy: adminId })
	}

	const topics: Record<ZoneTopicKey, ZoneTopic> = {
		X: await insertTopic(`${prefix}-x`, `Раздел X ${prefix}`),
		Y: await insertTopic(`${prefix}-y`, `Раздел Y ${prefix}`),
		Z: await insertTopic(`${prefix}-z`, `Раздел Z ${prefix}`),
	}
	await attachTeacher(users.teacherA.id, topics.X.id)
	await attachTeacher(users.teacherB.id, topics.Y.id)

	const attemptWorld: AttemptWorld = {
		ctx,
		topicId: topics.X.id,
		topicSlug: topics.X.slug,
		adminId,
		adminCookie: users.admin.cookie,
		password,
	}

	async function insertTest(topic: ZoneTopic, slug: string): Promise<{ id: string; slug: string; questionId: string }> {
		const [created] = await db
			.insert(schema.tests)
			.values({
				topicId: topic.id,
				slug,
				title: `Тест ${slug}`,
				isPublished: true,
				showCorrectAnswer: true,
				createdBy: adminId,
			})
			.returning({ id: schema.tests.id, slug: schema.tests.slug })
		assert.ok(created, `seedTeacherZoneWorld: test ${slug} was not created`)
		const questionId = await addQuestion(attemptWorld, created.id, 'radio')
		return { id: created.id, slug: created.slug, questionId }
	}

	async function seedTest(topicKey: ZoneTopicKey, key: ZoneTestKey): Promise<ZoneTest> {
		const topic = topics[topicKey]
		const created = await insertTest(topic, `${prefix}-${key.toLowerCase()}`)
		return { ...created, topicSlug: topic.slug }
	}

	const tests: Record<ZoneTestKey, ZoneTest> = {
		tX: await seedTest('X', 'tX'),
		tX2: await seedTest('X', 'tX2'),
		tY: await seedTest('Y', 'tY'),
		tZ: await seedTest('Z', 'tZ'),
	}

	async function insertGroup(name: string, ownerId: string | null, members: string[]): Promise<string> {
		const [group] = await db
			.insert(schema.studentGroups)
			.values({ name, ownerId, createdBy: adminId })
			.returning({ id: schema.studentGroups.id })
		assert.ok(group, `seedTeacherZoneWorld: group ${name} was not created`)
		if (members.length > 0) {
			await db.insert(schema.userGroups).values(members.map((userId) => ({ groupId: group.id, userId })))
		}
		return group.id
	}

	const groups: Record<ZoneGroupKey, string> = {
		G: await insertGroup(`Группа G ${prefix}`, users.teacherA.id, [users.s1.id, users.invited.id]),
		GB: await insertGroup(`Группа GB ${prefix}`, users.teacherB.id, [users.s3.id]),
		GA: await insertGroup(`Группа GA ${prefix}`, null, [users.s1.id]),
	}

	await db.insert(schema.testAssignments).values([
		{ testId: tests.tX.id, userId: users.s1.id, assignedBy: users.teacherA.id },
		{ testId: tests.tX2.id, userId: users.s1.id, assignedBy: adminId },
		{ testId: tests.tX.id, userId: users.s2.id, assignedBy: adminId },
		{ testId: tests.tY.id, userId: users.s2.id, assignedBy: adminId },
		{ testId: tests.tY.id, userId: users.s3.id, assignedBy: adminId },
	])

	async function attempt(profile: ZoneProfile, testId: string, questionId: string): Promise<string> {
		const cookie = users[profile].cookie
		const started = await startSession(attemptWorld, cookie, testId)
		assert.equal(started.status, 200, `start ${profile}: ${JSON.stringify(started.body)}`)
		const sessionId = started.body.sessionId
		assert.equal(typeof sessionId, 'string', `start ${profile}: no sessionId`)
		const submitted = await submitAttempt(attemptWorld, cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(submitted.status, 200, `submit ${profile}: ${JSON.stringify(submitted.body)}`)
		const attemptId = submitted.body.attemptId
		assert.equal(typeof attemptId, 'string', `submit ${profile}: no attemptId`)
		return attemptId as string
	}

	const attempts: Record<ZoneAttemptKey, string> = {
		s1X: await attempt('s1', tests.tX.id, tests.tX.questionId),
		s2X: await attempt('s2', tests.tX.id, tests.tX.questionId),
		s2Y: await attempt('s2', tests.tY.id, tests.tY.questionId),
		s3Y: await attempt('s3', tests.tY.id, tests.tY.questionId),
		teacherAX: await attempt('teacherA', tests.tX.id, tests.tX.questionId),
	}

	return {
		ctx,
		prefix,
		users,
		topics,
		tests,
		groups,
		attempts,
		async freshTopic(options = {}) {
			const slug = nextName('topic')
			const topic = await insertTopic(slug, `Раздел ${slug}`)
			if (options.teacher) await attachTeacher(users[options.teacher].id, topic.id)
			return topic
		},
		async freshTest(topic, options = {}) {
			const target = typeof topic === 'string' ? topics[topic] : topic
			const created = await insertTest(target, nextName('test'))
			let attemptId: string | null = null
			const by = options.withAttemptBy
			if (by) {
				if (PROFILE_SPECS[by].student) {
					await db
						.insert(schema.testAssignments)
						.values({ testId: created.id, userId: users[by].id, assignedBy: adminId })
				}
				attemptId = await attempt(by, created.id, created.questionId)
			}
			return { ...created, attemptId }
		},
		async freshQuestion(testKey) {
			return addQuestion(attemptWorld, tests[testKey].id, 'radio')
		},
		async freshUser(options = {}) {
			const role = options.role === undefined ? 'user' : options.role
			const isActive = options.isActive ?? true
			const login = nextName('user').replace(/-/g, '_')
			const created = await createUser(login, login, {
				roles: role === null ? [] : [role],
				isActive,
				activated: options.activated ?? isActive,
				invited: false,
				grants: (options.allow ?? []).map((key) => ({ key, allow: true })),
			})
			for (const groupId of options.groups ?? []) {
				await db.insert(schema.userGroups).values({ groupId, userId: created.id })
			}
			return created
		},
		async freshGroup(options = {}) {
			return insertGroup(`Группа ${nextName('group')}`, options.owner ?? null, options.members ?? [])
		},
	}
}
