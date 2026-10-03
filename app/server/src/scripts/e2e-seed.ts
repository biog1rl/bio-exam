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
 * хранилище — prompt.md каждого вопроса (как обработчик создания теста).
 * Печатает одну строку счётчиков: e2e-seed: users=<n> tests=<n> questions=<n> prompts=<n>
 */
import { eq } from 'drizzle-orm'
import fs from 'node:fs'

import { isIsolatedEnv } from '../config/test-database-url.js'

type SeedAccount = { login: string; role: string; name: string }

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
	published: boolean
	assignedTo: string[]
	questions: SeedQuestion[]
}

type SeedFile = {
	password: string
	topic: { slug: string; title: string; description: string }
	projects: Record<string, { accounts: SeedAccount[]; tests: SeedTest[] }>
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
	const { answerKeys, questions, roles, testAssignments, tests, topics, userRoles, users } =
		await import('../db/schema.js')
	const { getBuiltinQuestionTypeByKey } = await import('../lib/tests/question-types.js')
	const { storageService } = await import('../services/storage/storage.js')
	const { upsertQuestionSearchDocument } = await import('../services/search/question-documents.js')

	try {
		const passwordHash = await bcrypt.hash(seed.password, 10)
		const projects = Object.values(seed.projects)

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

			const [topic] = await tx
				.insert(topics)
				.values({ slug: seed.topic.slug, title: seed.topic.title, description: seed.topic.description })
				.returning()

			const prompts: { path: string; text: string; question: SeedQuestion; questionId: string; testId: string }[] = []
			let testCount = 0
			let order = 0
			for (const project of projects) {
				const authorLogin = project.accounts.find((account) => account.role === 'admin')?.login
				const authorId = authorLogin ? (userIds.get(authorLogin) ?? null) : null

				for (const seedTestItem of project.tests) {
					const [test] = await tx
						.insert(tests)
						.values({
							topicId: topic.id,
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
						if (!builtin || builtin.uiTemplate !== item.template) {
							throw new Error(`seed question ${item.key}: type ${item.type} is not a builtin ${item.template} type`)
						}
						const [question] = await tx
							.insert(questions)
							.values({
								testId: test.id,
								type: item.type,
								order: index,
								points: builtin.scoringRule.correctPoints,
								options: item.options ?? null,
								matchingPairs: item.matchingPairs ?? null,
							})
							.returning({ id: questions.id })

						// Путь как у обработчика создания: topics/<тема>/<тест>/questions/<id>/prompt.md
						const promptPath = storageService.getQuestionPath(topic.slug, test.slug, question.id) + '/prompt.md'
						await tx.update(questions).set({ promptPath }).where(eq(questions.id, question.id))

						await tx.insert(answerKeys).values({
							questionId: question.id,
							version: 1,
							correctAnswer: item.correct,
							isActive: true,
							createdBy: authorId,
						})
						prompts.push({
							path: promptPath,
							text: item.prompt,
							question: item,
							questionId: question.id,
							testId: test.id,
						})
					}

					for (const login of seedTestItem.assignedTo) {
						const userId = userIds.get(login)
						if (!userId) throw new Error(`seed test ${seedTestItem.slug}: unknown assignee ${login}`)
						await tx.insert(testAssignments).values({ testId: test.id, userId, assignedBy: authorId })
					}
				}
			}

			return { topicId: topic.id, users: userIds.size, tests: testCount, prompts }
		})

		// Файлы пишутся после успешной транзакции, как в обработчике создания теста
		let written = 0
		for (const prompt of result.prompts) {
			await storageService.writeFile(prompt.path, prompt.text)
			written++
			await upsertQuestionSearchDocument({
				questionId: prompt.questionId,
				testId: prompt.testId,
				topicId: result.topicId,
				type: prompt.question.type,
				promptText: prompt.text,
				options: prompt.question.options,
				matchingPairs: prompt.question.matchingPairs,
			})
		}

		console.log(
			`e2e-seed: users=${result.users} tests=${result.tests} questions=${result.prompts.length} prompts=${written}`
		)
	} finally {
		await pgPool.end()
	}
}

main().catch((error: unknown) => {
	console.error('e2e-seed failed:', error instanceof Error ? error.message : String(error))
	process.exit(1)
})
