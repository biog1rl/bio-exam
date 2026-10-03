/**
 * D-14 flow 2: студент проходит назначенный тест со всеми пятью шаблонами вопросов
 * (single_choice, multi_choice, matching, short_text, sequence_digits), завершает его и видит
 * счёт, который задают ключи ответов сида. Оба проекта работают со своим тестом all-templates-<p>.
 *
 * Сессия студента берётся из storageState (auth.setup.ts), входа в тесте нет.
 */

import { seedTest } from '../fixtures/accounts'
import { correctAnswers, expect, projectKey, takeTest, test, totalPointsOf } from '../fixtures/exam'

test.describe('flow 2: take a test with all five templates', () => {
	test('student answers every question and sees the full score @flow2', async ({ studentPage: page }, testInfo) => {
		const allTemplates = seedTest(projectKey(testInfo), 'all-templates')
		const total = totalPointsOf(allTemplates)
		// Пять шаблонов в одном тесте: если сид потеряет один, поток перестанет что-либо доказывать
		expect(allTemplates.questions.map((question) => question.template)).toEqual([
			'single_choice',
			'multi_choice',
			'matching',
			'short_text',
			'sequence_digits',
		])

		const submitted = await takeTest(page, allTemplates, correctAnswers(allTemplates))

		// Экран результата: баллы, процент и статус как их показывает интерфейс
		await expect(page.getByRole('heading', { level: 2, name: 'Результат' })).toBeVisible()
		await expect(page.getByText(`Баллы: ${total} / ${total}`)).toBeVisible()
		await expect(page.getByText('Процент: 100%')).toBeVisible()
		await expect(page.getByText('Статус: пройден')).toBeVisible()

		// То же число в ответе сервера: баллы считает сервер, а не страница
		expect(submitted.earnedPoints).toBe(total)
		expect(submitted.totalPoints).toBe(total)
		expect(submitted.passed).toBe(true)
		expect(submitted.results).toHaveLength(allTemplates.questions.length)
		expect(submitted.results.every((result) => result.isCorrect)).toBe(true)

		// Попытка попала в историю студента
		await page.getByRole('button', { name: 'Мои попытки' }).click()
		await expect(page.getByText(new RegExp(`${total}/${total} / 100% / пройден`))).toBeVisible()
	})
})
