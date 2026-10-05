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
 * Печатает одну строку счётчиков: e2e-seed: users=<n> tests=<n> questions=<n> prompts=<n>
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
	correct: string | string[] | Record<string, string>
}

type SeedTest = {
	slug: string
	title: string
	topic?: string
	published: boolean
	assignedTo: string[]
	questions: SeedQuestion[]
}

type SeedTopic = { slug: string; title: string; description: string; teachers?: string[] }

type SeedGroup = { name: string; owner: string; members: string[] }

type SeedFile = {
	password: string
	topic: SeedTopic
	topics?: SeedTopic[]
	projects: Record<string, { accounts: SeedAccount[]; tests: SeedTest[]; groups?: SeedGroup[] }>
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

	try {
		const passwordHash = await bcrypt.hash(seed.password, 10)
		const projects = Object.values(seed.projects)
		const seedTopics = [seed.topic, ...(seed.topics ?? [])]
		const topicSlugOf = (seedTestItem: SeedTest): string => seedTestItem.topic ?? seed.topic.slug

		const planned = new Map<SeedQuestion, { id: string; promptPath: string; explanationPath: string | null }>()
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

						await tx.insert(answerKeys).values({
							questionId: content.id,
							version: 1,
							correctAnswer: item.correct,
							isActive: true,
							createdBy: authorId,
						})

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

			return { users: userIds.size, tests: testCount, questions: questionCount }
		})

		console.log(
			`e2e-seed: users=${result.users} tests=${result.tests} questions=${result.questions} prompts=${planned.size}`
		)
	} finally {
		await pgPool.end()
	}
}

main().catch((error: unknown) => {
	console.error('e2e-seed failed:', error instanceof Error ? error.message : String(error))
	process.exit(1)
})
