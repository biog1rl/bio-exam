import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

import { isIsolatedEnv, resolveIsolatedDatabaseUrl } from './src/config/test-database-url.ts'

// Изолированный режим (BIO_EXAM_ISOLATED_ENV=1): .env не загружается, адрес только из
// TEST_DATABASE_URL через защиту. Иначе drizzle-kit без DATABASE_URL взял бы боевой адрес
// из app/server/.env.
const isolated = isIsolatedEnv()
if (!isolated) {
	loadDotenv()
}

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: isolated ? resolveIsolatedDatabaseUrl() : process.env.DATABASE_URL || '',
	},
	strict: true,
	verbose: true,
})
