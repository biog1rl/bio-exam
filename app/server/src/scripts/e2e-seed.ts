/**
 * Детерминированный сид для e2e (D-15, D-17, D-18).
 *
 * Запускается только из scripts/e2e.mjs: изолированный режим (BIO_EXAM_ISOLATED_ENV=1,
 * база только из TEST_DATABASE_URL), локальное хранилище (STORAGE_DRIVER=local) и путь к
 * фикстуре в E2E_SEED_FILE. Файлы .env не читаются вовсе: подгрузка .env вернула бы
 * SUPABASE_* и боевые адреса.
 *
 * Пишет в базу роли, активных пользователей (bcrypt-хэши тестового пароля), роли
 * пользователей, тему, тесты, вопросы, ключи ответов версии 1 и назначения, а в локальное
 * хранилище — промпт каждого вопроса через модуль содержимого.
 * Попытки блока attempts создаются тем же путём, что сдача по HTTP (scoreSubmission и submitAttempt),
 * проверенные дополнительно проходят через materializeAttemptOutcome.
 * Печатает одну строку счётчиков: e2e-seed: users=<n> tests=<n> questions=<n> prompts=<n> attempts=<n>
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

import { isIsolatedEnv } from '../config/test-database-url.js'

type SeedAccount = { login: string; role: string; name: string; storageState: boolean }

type SeedQuestion = {
	key: string
	template: string
	type: string
	prompt: string
	options?: { id: string; text: string }[]
	matchingPairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] }
	correct?: string | string[] | Record<string, string>
}

type SeedTest = {
	slug: string
	title: string
	topic?: string
	published: boolean
	assignedTo: string[]
	questions: SeedQuestion[]
}

type SeedAttempt = {
	test: string
	student: string
	answers: Record<string, string>
	grade?: Record<string, number>
}

type SeedTopic = { slug: string; title: string; description: string; teachers?: string[] }

type SeedGroup = { name: string; owner: string; members: string[] }

type SeedBulkUsers = { prefix: string; count: number; name: string }

type SeedFile = {
	password: string
	topic: SeedTopic
	topics?: SeedTopic[]
	bulkUsers?: SeedBulkUsers
	projects: Record<
		string,
		{ accounts: SeedAccount[]; tests: SeedTest[]; groups?: SeedGroup[]; attempts?: SeedAttempt[] }
	>
}

/** Отказ до любого подключения: сид работает только в изолированном e2e-окружении */
function assertE2eEnvironment(): string {
	if (!isIsolatedEnv()) {
		throw new Error('e2e-seed runs only with BIO_EXAM_ISOLATED_ENV=1')
	}
	if (process.env.STORAGE_DRIVER !== 'local') {
		throw new Error('e2e-seed runs only with STORAGE_DRIVER=local')
	}
	const seedFile = process.env.E2E_SEED_FILE
	if (!seedFile) {
		throw new Error('e2e-seed needs E2E_SEED_FILE')
	}
	return seedFile
}

const BULK_CREATED_AT_BASE = Date.UTC(2020, 0, 1)
const BULK_CREATED_AT_STEP_MS = 60_000

function bulkUserRows(bulk: SeedBulkUsers | undefined, passwordHash: string) {
	if (!bulk) return []
	return Array.from({ length: bulk.count }, (_, index) => {
		const number = String(index + 1).padStart(3, '0')
		const createdAt = new Date(BULK_CREATED_AT_BASE + (index + 1) * BULK_CREATED_AT_STEP_MS)
		const name = `${bulk.name} ${number}`
		return {
			login: `${bulk.prefix}-${number}`,
			name,
			firstName: name,
			passwordHash,
			isActive: true,
			activatedAt: createdAt,
			createdAt,
		}
	})
}

async function main(): Promise<void> {
	const seedFile = assertE2eEnvironment()
	// JSON читается с диска, а не импортом: rootDir сервера — src
	const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8')) as SeedFile

	// Модули с подключением к базе грузятся только после проверки окружения
	const { ROLE_KEYS } = await import('@bio-exam/rbac')
	const bcrypt = (await import('bcryptjs')).default
	const { db, pgPool } = await import('../db/index.js')
	const { answerKeys, questions, roles, studentGroups, testAssignments, tests, topics, userGroups, userRoles, users } =
		await import('../db/schema.js')
	const { getBuiltinQuestionTypeByKey } = await import('@bio-exam/exam-core')
	const { syncQuestionDerived, writeContentFiles } = await import('../services/question-content/index.js')
	const { setGroupOwner, setTopicTeachers } = await import('../services/access-policy/index.js')
	const { startAttemptSession, submitAttempt } = await import('../services/attempt-sessions/index.js')
	const { materializeAttemptOutcome, scoreSubmission } = await import('../services/scored-attempt/index.js')

	try {
		const passwordHash = await bcrypt.hash(seed.password, 10)
		const projects = Object.values(seed.projects)
		const seedTopics = [seed.topic, ...(seed.topics ?? [])]
		const topicSlugOf = (seedTestItem: SeedTest): string => seedTestItem.topic ?? seed.topic.slug

		const planned = new Map<SeedQuestion, { id: string; promptPath: string; explanationPath: string | null }>()
		const questionIds = new Map<string, string>()
		const questionIdOf = (testSlug: string, key: string): string => {
			const id = questionIds.get(`${testSlug}:${key}`)
			if (!id) throw new Error(`seed attempt: unknown question ${key} in test ${testSlug}`)
			return id
		}
		for (const project of projects) {
			for (const seedTestItem of project.tests) {
				for (const item of seedTestItem.questions) {
					const builtin = getBuiltinQuestionTypeByKey(item.type)
					if (!builtin || builtin.uiTemplate !== item.template) {
						throw new Error(`seed question ${item.key}: type ${item.type} is not a builtin ${item.template} type`)
					}
					const id = crypto.randomUUID()
					const files = await writeContentFiles({
						topicSlug: topicSlugOf(seedTestItem),
						testSlug: seedTestItem.slug,
						questionId: id,
						promptText: item.prompt,
					})
					planned.set(item, { id, promptPath: files.promptPath, explanationPath: files.explanationPath })
					questionIds.set(`${seedTestItem.slug}:${item.key}`, id)
				}
			}
		}

		const result = await db.transaction(async (tx) => {
			await tx
				.insert(roles)
				.values(ROLE_KEYS.map((key) => ({ key })))
				.onConflictDoNothing()

			// Пользователи: is_active по умолчанию false, а вход неактивного даёт 403 ACCOUNT_NOT_ACTIVATED
			const userIds = new Map<string, string>()
			for (const project of projects) {
				for (const account of project.accounts) {
					const [created] = await tx
						.insert(users)
						.values({
							login: account.login,
							name: account.name,
							firstName: account.name,
							passwordHash,
							isActive: true,
							activatedAt: new Date(),
						})
						.returning({ id: users.id })
					userIds.set(account.login, created.id)
					await tx.insert(userRoles).values({ userId: created.id, roleKey: account.role })
				}
			}

			const bulkRows = bulkUserRows(seed.bulkUsers, passwordHash)
			let bulkCount = 0
			if (bulkRows.length > 0) {
				const bulkUsers = await tx.insert(users).values(bulkRows).returning({ id: users.id })
				await tx.insert(userRoles).values(bulkUsers.map((created) => ({ userId: created.id, roleKey: 'user' })))
				bulkCount = bulkUsers.length
			}

			const adminLogin = projects
				.flatMap((project) => project.accounts)
				.find((account) => account.role === 'admin')?.login
			const adminId = adminLogin ? (userIds.get(adminLogin) ?? null) : null
			const userIdOf = (login: string, owner: string): string => {
				const userId = userIds.get(login)
				if (!userId) throw new Error(`${owner}: unknown account ${login}`)
				return userId
			}

			const topicIds = new Map<string, string>()
			for (const [index, seedTopic] of seedTopics.entries()) {
				const [topic] = await tx
					.insert(topics)
					.values({ slug: seedTopic.slug, title: seedTopic.title, description: seedTopic.description, order: index })
					.returning({ id: topics.id })
				topicIds.set(seedTopic.slug, topic.id)
				if (seedTopic.teachers && seedTopic.teachers.length > 0) {
					await setTopicTeachers(tx, {
						topicId: topic.id,
						teacherIds: seedTopic.teachers.map((login) => userIdOf(login, `seed topic ${seedTopic.slug}`)),
						assignedBy: adminId,
					})
				}
			}

			const testRows = new Map<string, { id: string; passingScore: number | null }>()
			let questionCount = 0
			let testCount = 0
			let order = 0
			for (const project of projects) {
				const authorLogin = project.accounts.find((account) => account.role === 'admin')?.login
				const authorId = authorLogin ? (userIds.get(authorLogin) ?? null) : null

				for (const seedTestItem of project.tests) {
					const topicId = topicIds.get(topicSlugOf(seedTestItem))
					if (!topicId) throw new Error(`seed test ${seedTestItem.slug}: unknown topic ${topicSlugOf(seedTestItem)}`)
					const [test] = await tx
						.insert(tests)
						.values({
							topicId,
							slug: seedTestItem.slug,
							title: seedTestItem.title,
							isPublished: seedTestItem.published,
							showCorrectAnswer: true,
							version: seedTestItem.published ? 1 : 0,
							order: order++,
							createdBy: authorId,
							updatedBy: authorId,
						})
						.returning()
					testCount++
					testRows.set(seedTestItem.slug, { id: test.id, passingScore: test.passingScore })

					for (const [index, item] of seedTestItem.questions.entries()) {
						const builtin = getBuiltinQuestionTypeByKey(item.type)
						const content = planned.get(item)
						if (!builtin || !content) throw new Error(`seed question ${item.key}: content is not planned`)
						await tx.insert(questions).values({
							id: content.id,
							testId: test.id,
							type: item.type,
							order: index,
							points: builtin.scoringRule.correctPoints,
							options: item.options ?? null,
							matchingPairs: item.matchingPairs ?? null,
							promptPath: content.promptPath,
							explanationPath: content.explanationPath,
						})

						if (item.template !== 'open') {
							if (item.correct === undefined) throw new Error(`seed question ${item.key}: correct is required`)
							await tx.insert(answerKeys).values({
								questionId: content.id,
								version: 1,
								correctAnswer: item.correct,
								isActive: true,
								createdBy: authorId,
							})
						}

						await syncQuestionDerived(tx, {
							questionId: content.id,
							testId: test.id,
							topicId,
							type: item.type,
							promptText: item.prompt,
							explanationText: null,
							options: item.options,
							matchingPairs: item.matchingPairs,
						})
						questionCount++
					}

					for (const login of seedTestItem.assignedTo) {
						const userId = userIds.get(login)
						if (!userId) throw new Error(`seed test ${seedTestItem.slug}: unknown assignee ${login}`)
						await tx.insert(testAssignments).values({ testId: test.id, userId, assignedBy: authorId })
					}
				}

				for (const seedGroup of project.groups ?? []) {
					const [group] = await tx
						.insert(studentGroups)
						.values({ name: seedGroup.name, createdBy: authorId })
						.returning({ id: studentGroups.id })
					await setGroupOwner(tx, {
						groupId: group.id,
						ownerId: userIdOf(seedGroup.owner, `seed group ${seedGroup.name}`),
					})
					for (const login of seedGroup.members) {
						await tx
							.insert(userGroups)
							.values({ groupId: group.id, userId: userIdOf(login, `seed group ${seedGroup.name}`) })
					}
				}
			}

			return { users: userIds.size + bulkCount, tests: testCount, questions: questionCount, testRows, userIds }
		})

		let attemptCount = 0
		for (const project of projects) {
			for (const seedAttempt of project.attempts ?? []) {
				const testRow = result.testRows.get(seedAttempt.test)
				if (!testRow) throw new Error(`seed attempt: unknown test ${seedAttempt.test}`)
				const userId = result.userIds.get(seedAttempt.student)
				if (!userId) throw new Error(`seed attempt: unknown student ${seedAttempt.student}`)
				const answers = Object.fromEntries(
					Object.entries(seedAttempt.answers).map(([key, value]) => [questionIdOf(seedAttempt.test, key), value])
				)

				const session = await startAttemptSession({ testId: testRow.id, userId, timeLimitMinutes: null })
				const scored = await scoreSubmission({
					testId: testRow.id,
					answers,
					passingScore: testRow.passingScore,
					readExplanation: async () => null,
				})
				if (!scored.ok) throw new Error(`seed attempt ${seedAttempt.test}: scoring failed (${scored.reason})`)
				const submitted = await submitAttempt({
					testId: testRow.id,
					userId,
					testSessionId: session.sessionId,
					clientAttemptId: crypto.randomUUID(),
					answers,
					scored: {
						results: scored.facts,
						resultsVersion: 2,
						earnedPoints: scored.earnedPoints,
						totalPoints: scored.totalPoints,
						scorePercentage: scored.scorePercentage,
						passed: scored.passed,
						outcome: scored.outcome,
						passingScore: scored.passingScore,
					},
				})
				if (submitted.kind !== 'created') {
					throw new Error(`seed attempt ${seedAttempt.test}: submit returned ${submitted.kind}`)
				}

				if (seedAttempt.grade) {
					const latestScores = new Map(
						Object.entries(seedAttempt.grade).map(([key, value]) => [questionIdOf(seedAttempt.test, key), value])
					)
					await db.transaction((tx) => materializeAttemptOutcome(tx, { attemptId: submitted.attemptId, latestScores }))
				}
				attemptCount++
			}
		}

		console.log(
			`e2e-seed: users=${result.users} tests=${result.tests} questions=${result.questions} prompts=${planned.size} attempts=${attemptCount}`
		)
	} finally {
		await pgPool.end()
	}
}

main().catch((error: unknown) => {
	console.error('e2e-seed failed:', error instanceof Error ? error.message : String(error))
	process.exit(1)
})
