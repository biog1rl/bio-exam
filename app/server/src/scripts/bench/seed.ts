import { getBuiltinQuestionTypeByKey } from '@bio-exam/exam-core'
import { ROLE_KEYS, ROLE_REGISTRY, STUDENT_ROLE_KEY } from '@bio-exam/rbac'

import bcrypt from 'bcryptjs'

import type { DB } from '../../db/index.js'
import {
	answerKeys,
	questions,
	roles,
	studentGroups,
	testAssignments,
	tests,
	topics,
	userGroups,
	userRoles,
	users,
} from '../../db/schema.js'
import { setGroupOwner, setTopicTeachers } from '../../services/access-policy/index.js'
import { syncQuestionDerived, writeContentFiles } from '../../services/question-content/index.js'
import type { MemoryStorageAdapter } from '../../services/storage/adapters/memory.js'
import { storage, storageUrl } from '../../services/storage/index.js'

export type BenchScale = 'quick' | 'prod'

export type BenchContext = { db: DB; memory: MemoryStorageAdapter }

export type BenchUser = { id: string; login: string }

export type BenchSeed = {
	scale: BenchScale
	admin: BenchUser
	teacher: BenchUser | null
	students: BenchUser[]
	largestTest: { id: string; slug: string; topicSlug: string; questions: number }
	largestTopic: { id: string; slug: string; tests: number; bytes: number }
	counts: {
		users: number
		topics: number
		tests: number
		questions: number
		prompts: number
		explanations: number
		images: number
		objects: number
		bytes: number
		assignments: number
		groups: number
	}
}

type TemplateSpec = {
	type: string
	options?: { id: string; text: string }[]
	matchingPairs?: { left: { id: string; text: string }[]; right: { id: string; text: string }[] }
	correct: string | string[] | Record<string, string>
}

type PlannedQuestion = {
	id: string
	template: TemplateSpec
	prompt: string
	explanation: string | null
}

type PlannedTest = {
	slug: string
	title: string
	topicIndex: number
	questions: PlannedQuestion[]
}

type PlannedImage = { key: string; size: number }

const SEED = 20261005
const PROD_TOTAL_BYTES = 37 * 1024 * 1024
const PROD_STUDENTS = 29
const PROD_TESTS_PER_TOPIC = [16, 12, 10, 9, 8, 8]
const PROD_QUESTIONS = 1834
const PROD_SHARED_IMAGES = 30
const PROD_OWN_IMAGES = 224
const LARGEST_TOPIC_WEIGHT = 3
const EXPLANATION_EVERY = 3
const TEACHER_TOPIC_INDEX = 1
const GROUP_SIZE = 12
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PASSWORD = 'bench-password'

const TOPIC_TITLES = ['Клетка', 'Генетика', 'Эволюция', 'Экология', 'Ботаника', 'Анатомия человека']

const FIRST_NAMES = ['Анна', 'Иван', 'Мария', 'Пётр', 'Елена', 'Сергей', 'Ольга', 'Дмитрий', 'Наталья', 'Алексей']
const LAST_NAMES = ['Иванова', 'Петров', 'Смирнова', 'Кузнецов', 'Попова', 'Соколов', 'Лебедева', 'Козлов', 'Новикова']

const SENTENCES = [
	'Клетка является основной структурной и функциональной единицей живого организма.',
	'Митохондрия синтезирует АТФ в процессе клеточного дыхания.',
	'Фотосинтез протекает в хлоропластах растительной клетки.',
	'Рибосома обеспечивает синтез белка на матрице информационной РНК.',
	'Ядро клетки хранит наследственную информацию в виде ДНК.',
	'Комплекс Гольджи упаковывает и транспортирует вещества в клетке.',
	'Лизосома содержит ферменты для расщепления органических веществ.',
	'Мембрана клетки обладает избирательной проницаемостью.',
	'Митоз обеспечивает сохранение числа хромосом в дочерних клетках.',
	'Мейоз приводит к образованию гамет с гаплоидным набором хромосом.',
	'Ген определяет последовательность аминокислот в молекуле белка.',
	'Естественный отбор сохраняет особей с полезными признаками.',
	'Экосистема включает продуцентов, консументов и редуцентов.',
	'Хлоропласт содержит хлорофилл и улавливает энергию света.',
	'Эндоплазматическая сеть участвует в синтезе липидов и белков.',
	'Клеточная стенка растений состоит в основном из целлюлозы.',
	'Митохондрия имеет собственную кольцевую ДНК и рибосомы.',
	'Фотосинтез сопровождается выделением кислорода в атмосферу.',
	'Цепи питания начинаются с растений, создающих органические вещества.',
	'Кровь переносит кислород от лёгких к тканям организма.',
]

const QUESTION_PREFIXES = [
	'Прочитайте текст и ответьте на вопрос.',
	'Рассмотрите рисунок и выполните задание.',
	'Выберите верные утверждения.',
	'Установите соответствие.',
	'Определите последовательность процессов.',
]

const TEMPLATES: TemplateSpec[] = [
	{
		type: 'radio',
		options: [
			{ id: '1', text: 'Рибосома' },
			{ id: '2', text: 'Митохондрия' },
			{ id: '3', text: 'Лизосома' },
			{ id: '4', text: 'Комплекс Гольджи' },
		],
		correct: '2',
	},
	{
		type: 'checkbox',
		options: [
			{ id: '1', text: 'Хлоропласт' },
			{ id: '2', text: 'Центриоль' },
			{ id: '3', text: 'Клеточная стенка' },
			{ id: '4', text: 'Жгутик сперматозоида' },
		],
		correct: ['1', '3'],
	},
	{
		type: 'matching',
		matchingPairs: {
			left: [
				{ id: 'a', text: 'Фотосинтез' },
				{ id: 'b', text: 'Синтез белка' },
				{ id: 'c', text: 'Клеточное дыхание' },
			],
			right: [
				{ id: '1', text: 'Хлоропласт' },
				{ id: '2', text: 'Рибосома' },
				{ id: '3', text: 'Митохондрия' },
			],
		},
		correct: { a: '1', b: '2', c: '3' },
	},
	{ type: 'short_answer', correct: 'митоз' },
	{ type: 'sequence', correct: '2314' },
]

function createRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function pick<T>(random: () => number, items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)]
	if (item === undefined) throw new Error('bench seed: empty pick')
	return item
}

function uuidFrom(random: () => number): string {
	const bytes = Buffer.alloc(16)
	for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(random() * 256)
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function imageBytes(random: () => number, size: number): Buffer {
	const buffer = Buffer.alloc(size)
	PNG_SIGNATURE.copy(buffer, 0, 0, Math.min(size, PNG_SIGNATURE.length))
	let offset = PNG_SIGNATURE.length
	while (offset + 4 <= size) {
		buffer.writeUInt32LE(Math.floor(random() * 4294967296), offset)
		offset += 4
	}
	while (offset < size) {
		buffer[offset] = Math.floor(random() * 256)
		offset += 1
	}
	return buffer
}

function sentences(random: () => number, min: number, max: number): string {
	const count = min + Math.floor(random() * (max - min + 1))
	return Array.from({ length: count }, () => pick(random, SENTENCES)).join(' ')
}

function padded(value: number, width = 2): string {
	return String(value).padStart(width, '0')
}

function questionCounts(random: () => number, testCount: number, total: number): number[] {
	const counts = Array.from({ length: testCount }, (_, index) => (index === 0 ? 0 : 22 + Math.floor(random() * 13)))
	const rest = counts.reduce((sum, value) => sum + value, 0)
	counts[0] = total - rest
	const largest = counts[0] ?? 0
	if (largest <= Math.max(...counts.slice(1))) throw new Error('bench seed: first test is not the largest')
	return counts
}

function planTests(random: () => number, scale: BenchScale): PlannedTest[] {
	const testsPerTopic = scale === 'prod' ? PROD_TESTS_PER_TOPIC : [1]
	const testCount = testsPerTopic.reduce((sum, value) => sum + value, 0)
	const counts = scale === 'prod' ? questionCounts(random, testCount, PROD_QUESTIONS) : [3]
	const planned: PlannedTest[] = []
	let questionIndex = 0
	testsPerTopic.forEach((topicTests, topicIndex) => {
		for (let local = 0; local < topicTests; local += 1) {
			const testIndex = planned.length
			const questionCount = counts[testIndex] ?? 0
			const plannedQuestions: PlannedQuestion[] = []
			for (let order = 0; order < questionCount; order += 1) {
				const template = TEMPLATES[questionIndex % TEMPLATES.length]
				if (!template) throw new Error('bench seed: no template')
				const prefix = pick(random, QUESTION_PREFIXES)
				plannedQuestions.push({
					id: uuidFrom(random),
					template,
					prompt: `${prefix} Задание ${order + 1}. ${sentences(random, 3, 6)}`,
					explanation: questionIndex % EXPLANATION_EVERY === 0 ? sentences(random, 2, 3) : null,
				})
				questionIndex += 1
			}
			planned.push({
				slug: `bench-${topicIndex + 1}-${padded(local + 1)}`,
				title: `${TOPIC_TITLES[topicIndex] ?? 'Тема'}: вариант ${local + 1}`,
				topicIndex,
				questions: plannedQuestions,
			})
		}
	})
	return planned
}

function topicSlug(topicIndex: number): string {
	return `bench-topic-${topicIndex + 1}`
}

function imageMarkdown(key: string, index: number): string {
	return `\n\n![Рисунок ${index}](${storageUrl(key)})`
}

function attachImages(random: () => number, planned: PlannedTest[], scale: BenchScale): PlannedImage[] {
	if (scale === 'quick') return []
	const slots: number[] = []
	planned.forEach((test, testIndex) => {
		const weight = test.topicIndex === 0 ? LARGEST_TOPIC_WEIGHT : 1
		for (let copy = 0; copy < weight; copy += 1) slots.push(testIndex)
	})
	const ordered = [...slots.filter((_, index) => index % 2 === 0), ...slots.filter((_, index) => index % 2 === 1)]

	const keys: string[] = []
	const perTest = new Map<number, number>()
	for (let index = 0; index < PROD_OWN_IMAGES; index += 1) {
		const testIndex = ordered[index % ordered.length] ?? 0
		const test = planned[testIndex]
		if (!test) throw new Error('bench seed: image slot without test')
		const ownIndex = perTest.get(testIndex) ?? 0
		perTest.set(testIndex, ownIndex + 1)
		const key = `topics/${topicSlug(test.topicIndex)}/${test.slug}/assets/image-${padded(ownIndex + 1, 3)}.png`
		const question = test.questions[ownIndex % test.questions.length]
		if (!question) throw new Error('bench seed: test without questions')
		question.prompt += imageMarkdown(key, ownIndex + 1)
		keys.push(key)
	}

	const largestTopicTests = planned.filter((test) => test.topicIndex === 0)
	const otherTests = planned.filter((test) => test.topicIndex !== 0)
	for (let index = 0; index < PROD_SHARED_IMAGES; index += 1) {
		const key = `images/bench-shared-${padded(index + 1, 3)}.png`
		const own = largestTopicTests[index % largestTopicTests.length]
		const other = otherTests[(index * 7) % otherTests.length]
		for (const test of [own, other]) {
			if (!test) continue
			const question = test.questions[(index * 3 + 1) % test.questions.length]
			if (question) question.prompt += imageMarkdown(key, index + 1)
		}
		keys.push(key)
	}

	const mdBytes = planned
		.flatMap((test) => test.questions)
		.reduce((sum, q) => sum + Buffer.byteLength(q.prompt) + (q.explanation ? Buffer.byteLength(q.explanation) : 0), 0)
	const weights = keys.map(() => 0.5 + random())
	const weightSum = weights.reduce((sum, value) => sum + value, 0)
	const budget = PROD_TOTAL_BYTES - mdBytes
	const sizes = weights.map((weight) => Math.floor((budget * weight) / weightSum))
	const assigned = sizes.reduce((sum, value) => sum + value, 0)
	sizes[sizes.length - 1] = (sizes[sizes.length - 1] ?? 0) + budget - assigned
	return keys.map((key, index) => ({ key, size: sizes[index] ?? 0 }))
}

export async function seedBench(ctx: BenchContext, options: { scale: BenchScale }): Promise<BenchSeed> {
	const { db, memory } = ctx
	const random = createRandom(SEED)
	const planned = planTests(random, options.scale)
	const images = attachImages(random, planned, options.scale)
	const topicCount = Math.max(...planned.map((test) => test.topicIndex)) + 1
	const studentCount = options.scale === 'prod' ? PROD_STUDENTS : 1
	const passwordHash = await bcrypt.hash(PASSWORD, 4)

	const module = storage()
	for (const image of images) {
		await module.write(image.key, imageBytes(random, image.size), { contentType: 'image/png', upsert: true })
	}

	const contentPaths = new Map<string, { promptPath: string; explanationPath: string | null }>()
	for (const test of planned) {
		for (const question of test.questions) {
			const files = await writeContentFiles({
				topicSlug: topicSlug(test.topicIndex),
				testSlug: test.slug,
				questionId: question.id,
				promptText: question.prompt,
				explanationText: question.explanation,
			})
			contentPaths.set(question.id, { promptPath: files.promptPath, explanationPath: files.explanationPath })
		}
	}

	const result = await db.transaction(async (tx) => {
		await tx
			.insert(roles)
			.values(ROLE_KEYS.map((key) => ({ key })))
			.onConflictDoNothing()

		const createUser = async (login: string, name: string, roleKey: string): Promise<BenchUser> => {
			const [created] = await tx
				.insert(users)
				.values({ login, name, firstName: name, passwordHash, isActive: true, activatedAt: new Date() })
				.returning({ id: users.id })
			if (!created) throw new Error(`bench seed: user ${login} was not created`)
			await tx.insert(userRoles).values({ userId: created.id, roleKey })
			return { id: created.id, login }
		}

		const admin = await createUser('bench-admin', 'Администратор замеров', ROLE_REGISTRY.admin.key)
		const teacher =
			options.scale === 'prod' ? await createUser('bench-teacher', 'Учитель замеров', ROLE_REGISTRY.teacher.key) : null
		const students: BenchUser[] = []
		for (let index = 0; index < studentCount; index += 1) {
			const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`
			students.push(await createUser(`bench-student-${padded(index + 1)}`, name, STUDENT_ROLE_KEY))
		}

		const topicIds: string[] = []
		for (let index = 0; index < topicCount; index += 1) {
			const [topic] = await tx
				.insert(topics)
				.values({
					slug: topicSlug(index),
					title: TOPIC_TITLES[index] ?? `Тема ${index + 1}`,
					description: `Синтетическая тема замеров ${index + 1}`,
					order: index,
				})
				.returning({ id: topics.id })
			if (!topic) throw new Error(`bench seed: topic ${index} was not created`)
			topicIds.push(topic.id)
		}
		if (teacher) {
			const teacherTopicId = topicIds[TEACHER_TOPIC_INDEX]
			if (!teacherTopicId) throw new Error('bench seed: teacher topic is missing')
			await setTopicTeachers(tx, { topicId: teacherTopicId, teacherIds: [teacher.id], assignedBy: admin.id })
		}

		const testIds: string[] = []
		let questionCount = 0
		let assignmentCount = 0
		for (const [testIndex, plannedTest] of planned.entries()) {
			const topicId = topicIds[plannedTest.topicIndex]
			if (!topicId) throw new Error(`bench seed: topic for ${plannedTest.slug} is missing`)
			const [test] = await tx
				.insert(tests)
				.values({
					topicId,
					slug: plannedTest.slug,
					title: plannedTest.title,
					isPublished: true,
					showCorrectAnswer: true,
					version: 1,
					order: testIndex,
					createdBy: admin.id,
					updatedBy: admin.id,
				})
				.returning({ id: tests.id })
			if (!test) throw new Error(`bench seed: test ${plannedTest.slug} was not created`)
			testIds.push(test.id)

			for (const [order, question] of plannedTest.questions.entries()) {
				const builtin = getBuiltinQuestionTypeByKey(question.template.type)
				const paths = contentPaths.get(question.id)
				if (!builtin || !paths) throw new Error(`bench seed: question ${question.id} is not planned`)
				await tx.insert(questions).values({
					id: question.id,
					testId: test.id,
					type: question.template.type,
					order,
					points: builtin.scoringRule.correctPoints,
					options: question.template.options ?? null,
					matchingPairs: question.template.matchingPairs ?? null,
					promptPath: paths.promptPath,
					explanationPath: paths.explanationPath,
				})
				await tx.insert(answerKeys).values({
					questionId: question.id,
					version: 1,
					correctAnswer: question.template.correct,
					isActive: true,
					createdBy: admin.id,
				})
				await syncQuestionDerived(tx, {
					questionId: question.id,
					testId: test.id,
					topicId,
					type: question.template.type,
					promptText: question.prompt,
					explanationText: question.explanation,
					options: question.template.options,
					matchingPairs: question.template.matchingPairs,
				})
				questionCount += 1
			}

			const assignees = students.filter((_, studentIndex) => testIndex === 0 || (studentIndex + testIndex) % 4 === 0)
			if (assignees.length > 0) {
				await tx
					.insert(testAssignments)
					.values(assignees.map((student) => ({ testId: test.id, userId: student.id, assignedBy: admin.id })))
				assignmentCount += assignees.length
			}
		}

		let groupCount = 0
		if (teacher) {
			const [group] = await tx
				.insert(studentGroups)
				.values({ name: 'Группа замеров', createdBy: admin.id })
				.returning({ id: studentGroups.id })
			if (!group) throw new Error('bench seed: group was not created')
			await setGroupOwner(tx, { groupId: group.id, ownerId: teacher.id })
			const members = students.slice(0, GROUP_SIZE)
			await tx.insert(userGroups).values(members.map((student) => ({ groupId: group.id, userId: student.id })))
			groupCount = 1
		}

		return { admin, teacher, students, topicIds, testIds, questionCount, assignmentCount, groupCount }
	})

	const keys = memory.keys()
	const bytes = keys.reduce((sum, key) => sum + (memory.get(key)?.data.length ?? 0), 0)
	const largestTopicPrefix = `topics/${topicSlug(0)}/`
	const largestTopicBytes =
		keys
			.filter((key) => key.startsWith(largestTopicPrefix))
			.reduce((sum, key) => sum + (memory.get(key)?.data.length ?? 0), 0) +
		images.filter((image) => image.key.startsWith('images/')).reduce((sum, image) => sum + image.size, 0)
	const firstTest = planned[0]
	const firstTestId = result.testIds[0]
	const firstTopicId = result.topicIds[0]
	if (!firstTest || !firstTestId || !firstTopicId) throw new Error('bench seed: no tests')

	return {
		scale: options.scale,
		admin: result.admin,
		teacher: result.teacher,
		students: result.students,
		largestTest: {
			id: firstTestId,
			slug: firstTest.slug,
			topicSlug: topicSlug(firstTest.topicIndex),
			questions: firstTest.questions.length,
		},
		largestTopic: {
			id: firstTopicId,
			slug: topicSlug(0),
			tests: planned.filter((test) => test.topicIndex === 0).length,
			bytes: largestTopicBytes,
		},
		counts: {
			users: 1 + (result.teacher ? 1 : 0) + result.students.length,
			topics: topicCount,
			tests: result.testIds.length,
			questions: result.questionCount,
			prompts: planned.reduce((sum, test) => sum + test.questions.length, 0),
			explanations: planned.reduce(
				(sum, test) => sum + test.questions.filter((question) => question.explanation !== null).length,
				0
			),
			images: images.length,
			objects: keys.length,
			bytes,
			assignments: result.assignmentCount,
			groups: result.groupCount,
		},
	}
}
