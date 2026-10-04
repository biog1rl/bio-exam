import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		testTimeout: 20_000,
		// Изолированный режим для каждого тестового процесса: db/index.ts и env.ts не читают .env
		// и берут только TEST_DATABASE_URL (D-29). Тест, который импортирует db без неё, падает.
		env: { BIO_EXAM_ISOLATED_ENV: '1' },
	},
})
