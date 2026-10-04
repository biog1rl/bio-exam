/**
 * Playwright для изолированного e2e (D-15, D-16, D-17). Запускается только через yarn e2e.
 *
 * scripts/e2e.mjs поднимает временную базу test_e2e_*, применяет миграции, сидирует данные,
 * собирает web с e2e API_ORIGIN и передаёт сюда окружение Next целиком в E2E_WEB_ENV.
 * Конфиг не выводит окружение web заново и не читает переменную живой базы по имени.
 *
 * Проекты: setup (вход каждого аккаунта со storageState один раз за прогон, лимит входа
 * 5 в минуту), chromium-desktop и chromium-mobile (оба зависят от setup).
 */
import { defineConfig, devices } from '@playwright/test'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const REQUIRED = ['E2E_WEB_ENV', 'E2E_API_PORT', 'E2E_WEB_PORT', 'TEST_DATABASE_URL']
const missing = REQUIRED.filter((key) => !process.env[key])
if (process.env.BIO_EXAM_ISOLATED_ENV !== '1' || missing.length > 0) {
	const reason = process.env.BIO_EXAM_ISOLATED_ENV !== '1' ? 'BIO_EXAM_ISOLATED_ENV is not 1' : missing.join(', ')
	throw new Error(`e2e/playwright.config.ts: start e2e through yarn e2e (${reason})`)
}

const apiPort = process.env.E2E_API_PORT
const webPort = process.env.E2E_WEB_PORT
const apiOrigin = `http://127.0.0.1:${apiPort}`
const webOrigin = `http://127.0.0.1:${webPort}`

// Окружение next start ровно то же, что у next build (buildWebEnv в scripts/lib/e2e-web-env.mjs)
const webEnv = JSON.parse(process.env.E2E_WEB_ENV as string) as Record<string, string>

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: webOrigin,
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts$/,
		},
		{
			name: 'chromium-desktop',
			use: { ...devices['Desktop Chrome'] },
			testMatch: /tests\/.+\.spec\.ts$/,
			dependencies: ['setup'],
		},
		{
			name: 'chromium-mobile',
			use: { ...devices['Pixel 7'] },
			testMatch: /tests\/.+\.spec\.ts$/,
			dependencies: ['setup'],
		},
	],
	webServer: [
		{
			// Express: development только здесь (Pitfall 12: cookie без Secure по HTTP),
			// проверка сессий и прав в БД работает всегда, как в production
			command: 'yarn workspace @bio-exam/server tsx src/index.ts',
			cwd: REPO_ROOT,
			url: `${apiOrigin}/healthz`,
			env: {
				NODE_ENV: 'development',
				PORT: String(apiPort),
				ALLOWED_ORIGIN: webOrigin,
				BIO_EXAM_ISOLATED_ENV: '1',
				ACCESS_TOKEN_EXPIRES_SEC: '3600',
			},
			reuseExistingServer: false,
			timeout: 120_000,
			stdout: 'ignore',
			stderr: 'pipe',
		},
		{
			// Next: защита проверяет ровно то окружение, которое получит next start, и при отказе
			// сервер не стартует
			command: `node scripts/lib/e2e-web-env.mjs --check && yarn workspace @bio-exam/web start -H 127.0.0.1 -p ${webPort}`,
			cwd: REPO_ROOT,
			url: `${webOrigin}/login`,
			env: webEnv,
			reuseExistingServer: false,
			timeout: 120_000,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	],
})
