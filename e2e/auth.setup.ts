/**
 * Один вход на аккаунт со storageState за прогон (D-16): так быстрее, и сессия общая для тестов.
 * Успешные входы не ограничены, троттлинг входа считает только неудачи.
 *
 * Вход идёт через origin web (rewrite /api/* в Next -> e2e Express), поэтому успешный ответ
 * доказывает, что пользователи сида активны и что rewrites ведут на e2e Express.
 * Cookies сохраняются в e2e/.auth/<login>.json для тестов проектов desktop и mobile.
 */
import { expect, test as setup } from '@playwright/test'

import fs from 'node:fs'

import { AUTH_DIR, E2E_PASSWORD, storageStateAccounts, storageStatePath } from './fixtures/accounts'

for (const account of storageStateAccounts()) {
	setup(`log in ${account.login} once`, async ({ request }) => {
		const response = await request.post('/api/auth/login', {
			data: { username: account.login, password: E2E_PASSWORD },
		})
		expect(response.status(), `login of ${account.login}`).toBe(200)

		const state = await request.storageState()
		expect(state.cookies.map((cookie) => cookie.name)).toContain('bio_exam_session')

		fs.mkdirSync(AUTH_DIR, { recursive: true })
		await request.storageState({ path: storageStatePath(account.login) })
	})
}
