import { format, setHours, setMinutes, startOfDay, subDays } from 'date-fns'

import type { ProgressAttempt } from '@/lib/progress/attempt-chart'

import type { ActivityDay, ContentTest, ContentTopic } from './dashboard-series'

function generator(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

const DEMO_TESTS = [
	{ id: 'demo-cell-1', title: 'Строение клетки', topicSlug: 'kletka', topicTitle: 'Клетка' },
	{ id: 'demo-cell-2', title: 'Деление клетки', topicSlug: 'kletka', topicTitle: 'Клетка' },
	{ id: 'demo-gen-1', title: 'Законы Менделя', topicSlug: 'genetika', topicTitle: 'Генетика' },
	{ id: 'demo-gen-2', title: 'Сцепленное наследование', topicSlug: 'genetika', topicTitle: 'Генетика' },
	{ id: 'demo-evo-1', title: 'Естественный отбор', topicSlug: 'evolyuciya', topicTitle: 'Эволюция' },
	{ id: 'demo-evo-2', title: 'Видообразование', topicSlug: 'evolyuciya', topicTitle: 'Эволюция' },
] as const

const DEMO_ATTEMPTS = 42
const DEMO_SPAN_DAYS = 150
const PASSING_PERCENT = 60

export function demoAttempts(now: Date): ProgressAttempt[] {
	const random = generator(20261006)
	const today = startOfDay(now)
	const attempts: ProgressAttempt[] = []
	for (let index = 0; index < DEMO_ATTEMPTS; index += 1) {
		const progress = index / (DEMO_ATTEMPTS - 1)
		const daysAgo = Math.round((1 - Math.sqrt(progress)) * DEMO_SPAN_DAYS)
		const test = DEMO_TESTS[Math.floor(random() * DEMO_TESTS.length)] ?? DEMO_TESTS[0]
		const day = subDays(today, daysAgo)
		const at = setMinutes(setHours(day, 9 + Math.floor(random() * 11)), Math.floor(random() * 60))
		const totalPoints = 20 + Math.floor(random() * 4) * 5
		const percent = Math.min(100, Math.max(15, 45 + progress * 35 + (random() - 0.5) * 40))
		const earnedPoints = Math.round((percent / 100) * totalPoints)
		const scorePercentage = Math.round((earnedPoints / totalPoints) * 1000) / 10
		attempts.push({
			attemptId: `demo-attempt-${index}`,
			testId: test.id,
			testTitle: test.title,
			testSlug: test.id,
			topicSlug: test.topicSlug,
			topicTitle: test.topicTitle,
			submittedAt: at.toISOString(),
			earnedPoints,
			totalPoints,
			scorePercentage,
			passed: scorePercentage >= PASSING_PERCENT,
		})
	}
	return attempts.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

export function demoContent(): { topics: ContentTopic[]; tests: ContentTest[] } {
	const random = generator(7)
	const titles = ['Клетка', 'Генетика', 'Эволюция', 'Экология', 'Ботаника', 'Зоология', 'Анатомия', 'Физиология']
	const topics = titles.map((title, index) => ({ id: `demo-topic-${index}`, title }))
	const tests: ContentTest[] = []
	for (const topic of topics) {
		const count = 1 + Math.floor(random() * 5)
		for (let index = 0; index < count; index += 1) {
			tests.push({ topicId: topic.id, isPublished: random() > 0.3, questionsCount: 5 + Math.floor(random() * 20) })
		}
	}
	return { topics, tests }
}

export function demoActivity(now: Date): ActivityDay[] {
	const random = generator(99)
	const today = startOfDay(now)
	const days: ActivityDay[] = []
	for (let index = 29; index >= 0; index -= 1) {
		const attempts = random() < 0.2 ? 0 : 1 + Math.floor(random() * 9)
		if (attempts === 0) continue
		days.push({
			date: format(subDays(today, index), 'yyyy-MM-dd'),
			attempts,
			averageScore: Math.round(50 + random() * 40),
		})
	}
	return days
}
