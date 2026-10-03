import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		// Зеркалит tsconfig paths: "@/*" -> "./*"
		alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
	},
	test: {
		// Ни один веб-тест не рендерит React, DOM не нужен
		environment: 'node',
		include: ['**/*.test.ts'],
		exclude: ['**/node_modules/**', '.next/**'],
	},
})
