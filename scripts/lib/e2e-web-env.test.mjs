/**
 * Тесты защиты окружения Next в e2e (D-17, T-1-28): node --test scripts/lib/e2e-web-env.test.mjs
 *
 * Фикстурные каталоги создаются в os.tmpdir() и удаляются внутри теста. Значения в фикстурах —
 * только приманки (decoy): ни одно из них не должно попасть в окружение или в текст ошибки.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertWebEnvClosed, buildWebEnv, webEnvFileKeys } from './e2e-web-env.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const GUARD_CLI = path.join(REPO_ROOT, 'scripts', 'lib', 'e2e-web-env.mjs')
const WEB_DIR = path.join(REPO_ROOT, 'app', 'web')

const SCRATCH_URL = 'postgres://postgres@127.0.0.1:55432/test_e2e_x'

// Приманки «живых» значений из app/web/.env разработчика
const DECOY_DATABASE_URL = 'postgres://decoy_user:decoy-pass@aws-0-decoy.pooler.supabase.invalid:6543/postgres'
const DECOY_API_ORIGIN = 'http://127.0.0.1:4000'
const DECOY_SECRET = 'decoy-live-jwt-secret-value'
const DECOY_COOKIE = 'decoy_cookie_name'
const DECOYS = [DECOY_DATABASE_URL, 'decoy-pass', 'aws-0-decoy', DECOY_SECRET, DECOY_COOKIE, 'decoy-lockfile']

const DEV_ENV_FILE = [
	`API_ORIGIN=${DECOY_API_ORIGIN}`,
	'NEXT_IGNORE_INCORRECT_LOCKFILE=decoy-lockfile',
	`AUTH_JWT_SECRET="${DECOY_SECRET}"`,
	`DATABASE_URL=${DECOY_DATABASE_URL}`,
	`SESSION_COOKIE_NAME=${DECOY_COOKIE}`,
].join('\n')

const RUNNER_SECRET = 'e2e-only-jwt-secret-not-for-production'

/** Окружение раннера, из которого строится окружение Next */
function runnerEnv(overrides = {}) {
	return {
		TEST_DATABASE_URL: SCRATCH_URL,
		AUTH_JWT_SECRET: RUNNER_SECRET,
		SESSION_COOKIE_NAME: 'bio_exam_session',
		E2E_API_PORT: '4101',
		E2E_WEB_PORT: '4102',
		...overrides,
	}
}

/** Закрытое окружение Next так, как его получают next build и next start */
function closedEnv(webDir, overrides = {}) {
	const runner = runnerEnv()
	return { ...runner, ...buildWebEnv(runner, { webDir }), ...overrides }
}

/** Временный каталог web с заданными .env-файлами; удаляется после fn */
function withWebDir(files, fn) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-web-env-'))
	try {
		for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
		return fn(dir)
	} finally {
		fs.rmSync(dir, { recursive: true, force: true })
	}
}

/** Текст ошибки защиты (или null, если защита пропустила окружение) */
function violationText(env, webDir) {
	try {
		assertWebEnvClosed(env, { webDir })
		return null
	} catch (error) {
		return error.message
	}
}

/** Проверка: защита отказала, строка нарушения начинается с ключа, приманок в тексте нет */
function expectViolation(env, webDir, key) {
	const text = violationText(env, webDir)
	assert.notEqual(text, null, `guard accepted an environment with a bad ${key}`)
	assert.match(text, new RegExp(`^${key}: `, 'm'), `no line starting with ${key}: in\n${text}`)
	for (const decoy of DECOYS) assert.ok(!text.includes(decoy), `decoy value leaked into the guard message`)
	return text
}

test('buildWebEnv derives the closed Next environment from the runner env without the database and the JWT secret', () => {
	withWebDir({}, (webDir) => {
		const env = buildWebEnv(runnerEnv(), { webDir })
		assert.deepEqual(env, {
			NODE_ENV: 'production',
			API_ORIGIN: 'http://127.0.0.1:4101',
			APP_ORIGIN: 'http://127.0.0.1:4102',
			NEXT_PUBLIC_APP_ORIGIN: 'http://127.0.0.1:4102',
			SESSION_COOKIE_NAME: 'bio_exam_session',
			NEXT_IGNORE_INCORRECT_LOCKFILE: '1',
			DATABASE_URL: '',
			AUTH_JWT_SECRET: '',
		})
		const values = Object.values(env).join('\n')
		assert.ok(!values.includes(SCRATCH_URL))
		assert.ok(!values.includes(RUNNER_SECRET))
	})
})

test('buildWebEnv does not require TEST_DATABASE_URL or AUTH_JWT_SECRET in the runner env', () => {
	withWebDir({}, (webDir) => {
		const env = buildWebEnv(runnerEnv({ TEST_DATABASE_URL: undefined, AUTH_JWT_SECRET: undefined }), { webDir })
		assert.equal(env.DATABASE_URL, '')
		assert.equal(env.AUTH_JWT_SECRET, '')
	})
})

test('buildWebEnv throws naming each missing source variable', () => {
	withWebDir({}, (webDir) => {
		for (const key of ['SESSION_COOKIE_NAME', 'E2E_API_PORT', 'E2E_WEB_PORT']) {
			const env = runnerEnv()
			delete env[key]
			assert.throws(() => buildWebEnv(env, { webDir }), new RegExp(key), `buildWebEnv did not name ${key}`)
		}
	})
})

test('buildWebEnv sets every key from the web .env files, unknown keys as empty strings', () => {
	withWebDir({ '.env': `${DEV_ENV_FILE}\nOTHER_KEY=decoy-pass\n` }, (webDir) => {
		const env = buildWebEnv(runnerEnv(), { webDir })
		for (const key of [
			'API_ORIGIN',
			'AUTH_JWT_SECRET',
			'DATABASE_URL',
			'SESSION_COOKIE_NAME',
			'NEXT_IGNORE_INCORRECT_LOCKFILE',
			'OTHER_KEY',
		]) {
			assert.notEqual(env[key], undefined, `${key} is not set`)
		}
		assert.equal(env.OTHER_KEY, '')
		assert.equal(env.API_ORIGIN, 'http://127.0.0.1:4101')
		assert.equal(env.SESSION_COOKIE_NAME, 'bio_exam_session')
		assert.equal(env.NEXT_IGNORE_INCORRECT_LOCKFILE, '1')
		assert.equal(env.DATABASE_URL, '')
		assert.equal(env.AUTH_JWT_SECRET, '')
		const values = Object.values(env).join('\n')
		for (const decoy of DECOYS) assert.ok(!values.includes(decoy), 'a decoy value reached the environment')
	})
})

test('closed environment passes against a .env with the developer keys, decoys never reach it', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		assert.deepEqual(webEnvFileKeys(webDir).sort(), [
			'API_ORIGIN',
			'AUTH_JWT_SECRET',
			'DATABASE_URL',
			'NEXT_IGNORE_INCORRECT_LOCKFILE',
			'SESSION_COOKIE_NAME',
		])
		const env = closedEnv(webDir)
		assert.equal(violationText(env, webDir), null)
		const values = Object.values(env).join('\n')
		for (const decoy of DECOYS) assert.ok(!values.includes(decoy), 'a decoy value reached the environment')
	})
})

test('webEnvFileKeys returns names only and reads export lines', () => {
	withWebDir({ '.env': 'export EXPORTED_KEY=decoy-pass\n# COMMENTED=x\nPLAIN=1\n' }, (webDir) => {
		const keys = webEnvFileKeys(webDir)
		assert.deepEqual(keys.sort(), ['EXPORTED_KEY', 'PLAIN'])
		assert.ok(!JSON.stringify(keys).includes('decoy-pass'))
	})
})

test('a key defined in .env.local but absent from the environment fails and is named', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (builtFrom) => {
		withWebDir({ '.env': DEV_ENV_FILE, '.env.local': 'E2E_DECOY_KEY=decoy-pass\n' }, (webDir) => {
			expectViolation(closedEnv(builtFrom), webDir, 'E2E_DECOY_KEY')
		})
	})
})

test('a key from .env removed from the built environment fails and is named', () => {
	withWebDir({ '.env': `${DEV_ENV_FILE}\nOTHER_KEY=decoy-pass\n` }, (webDir) => {
		const env = closedEnv(webDir)
		assert.equal(violationText(env, webDir), null)
		delete env.OTHER_KEY
		expectViolation(env, webDir, 'OTHER_KEY')
	})
})

test('.env.example keys are ignored', () => {
	withWebDir({ '.env': DEV_ENV_FILE, '.env.example': 'UNPINNED_EXAMPLE_KEY=placeholder\n' }, (webDir) => {
		assert.ok(!webEnvFileKeys(webDir).includes('UNPINNED_EXAMPLE_KEY'))
		assert.equal(violationText(closedEnv(webDir), webDir), null)
	})
})

test('an empty value counts as present (@next/env fills only undefined keys)', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		assert.equal(
			violationText(closedEnv(webDir, { NEXT_IGNORE_INCORRECT_LOCKFILE: '', SESSION_COOKIE_NAME: '' }), webDir),
			null
		)
	})
})

test('API_ORIGIN on another port or host fails', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		expectViolation(closedEnv(webDir, { API_ORIGIN: 'http://127.0.0.1:4999' }), webDir, 'API_ORIGIN')
		expectViolation(closedEnv(webDir, { API_ORIGIN: 'http://localhost:4101' }), webDir, 'API_ORIGIN')
		expectViolation(closedEnv(webDir, { API_ORIGIN: DECOY_API_ORIGIN }), webDir, 'API_ORIGIN')
	})
})

test('NODE_ENV other than production fails', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		expectViolation(closedEnv(webDir, { NODE_ENV: 'development' }), webDir, 'NODE_ENV')
		expectViolation(closedEnv(webDir, { NODE_ENV: 'test' }), webDir, 'NODE_ENV')
		const env = closedEnv(webDir)
		delete env.NODE_ENV
		expectViolation(env, webDir, 'NODE_ENV')
	})
})

test('a non-empty DATABASE_URL fails without printing it, app/web does not read it', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		const local = 'postgres://u:s3cret@127.0.0.1:5432/test_e2e_x'
		const text = expectViolation(closedEnv(webDir, { DATABASE_URL: local }), webDir, 'DATABASE_URL')
		assert.match(text, /^DATABASE_URL: must be empty, app\/web does not read it \(ADR-0001\)$/m)
		assert.ok(!text.includes('s3cret'))
		assert.ok(!text.includes(local))
		expectViolation(closedEnv(webDir, { DATABASE_URL: SCRATCH_URL }), webDir, 'DATABASE_URL')
		expectViolation(closedEnv(webDir, { DATABASE_URL: DECOY_DATABASE_URL }), webDir, 'DATABASE_URL')
	})
})

test('DATABASE_URL and AUTH_JWT_SECRET that are not set fail as well', () => {
	withWebDir({}, (webDir) => {
		for (const key of ['DATABASE_URL', 'AUTH_JWT_SECRET']) {
			const env = closedEnv(webDir)
			delete env[key]
			expectViolation(env, webDir, key)
		}
	})
})

test('a non-empty AUTH_JWT_SECRET fails without printing it, even with the e2e-only- marker', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		const text = expectViolation(closedEnv(webDir, { AUTH_JWT_SECRET: RUNNER_SECRET }), webDir, 'AUTH_JWT_SECRET')
		assert.match(text, /^AUTH_JWT_SECRET: must be empty, app\/web does not read it \(ADR-0001\)$/m)
		assert.ok(!text.includes(RUNNER_SECRET))
		expectViolation(closedEnv(webDir, { AUTH_JWT_SECRET: DECOY_SECRET }), webDir, 'AUTH_JWT_SECRET')
	})
})

test('the closed environment does not need TEST_DATABASE_URL', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		const env = closedEnv(webDir)
		delete env.TEST_DATABASE_URL
		assert.equal(violationText(env, webDir), null)
	})
})

test('any SUPABASE_* variable fails and is named', () => {
	withWebDir({ '.env': DEV_ENV_FILE }, (webDir) => {
		expectViolation(closedEnv(webDir, { SUPABASE_URL: 'https://decoy.supabase.invalid' }), webDir, 'SUPABASE_URL')
		expectViolation(closedEnv(webDir, { SUPABASE_SERVICE_KEY: 'decoy-pass' }), webDir, 'SUPABASE_SERVICE_KEY')
	})
})

test('a web directory without any .env file passes (CI case)', () => {
	withWebDir({}, (webDir) => {
		assert.deepEqual(webEnvFileKeys(webDir), [])
		assert.equal(violationText(closedEnv(webDir), webDir), null)
	})
})

test('CLI --check prints next-env-guard: OK for the closed env and FAILED with key lines otherwise', () => {
	const ok = spawnSync(process.execPath, [GUARD_CLI, '--check'], {
		env: { PATH: process.env.PATH, ...closedEnv(WEB_DIR) },
		encoding: 'utf8',
	})
	if (ok.status === 0) assert.match(ok.stdout, /next-env-guard: OK/)
	else assert.match(ok.stderr, /^next-env-guard: FAILED/m)

	const bad = spawnSync(process.execPath, [GUARD_CLI, '--check'], {
		env: {
			PATH: process.env.PATH,
			...closedEnv(WEB_DIR, {
				API_ORIGIN: 'http://127.0.0.1:4000',
				DATABASE_URL: 'postgres://u:s3cret@db.example.invalid:5432/test_x',
				AUTH_JWT_SECRET: 'not-the-e2e-secret',
			}),
		},
		encoding: 'utf8',
	})
	const output = `${bad.stdout}\n${bad.stderr}`
	assert.notEqual(bad.status, 0)
	assert.match(output, /^next-env-guard: FAILED/m)
	for (const key of ['API_ORIGIN', 'DATABASE_URL', 'AUTH_JWT_SECRET'])
		assert.match(output, new RegExp(`^${key}: `, 'm'))
	assert.ok(!output.includes('s3cret'))
	assert.ok(!output.includes('not-the-e2e-secret'))
	assert.ok(!output.includes('next-env-guard: OK'))
})

test('control (research A4): @next/env fills a missing key from .env but never overrides a set one', () => {
	withWebDir({ '.env': 'PINNED_KEY=from-file\nFILL_KEY=from-file\nEMPTY_KEY=from-file\n' }, (dir) => {
		const script = [
			"const { createRequire } = require('node:module')",
			`const requireFromWeb = createRequire(${JSON.stringify(path.join(REPO_ROOT, 'app', 'web', 'package.json'))})`,
			"const { loadEnvConfig } = requireFromWeb('@next/env')",
			`loadEnvConfig(${JSON.stringify(dir)}, false, { info() {}, error() {} })`,
			'console.log(JSON.stringify({ pinned: process.env.PINNED_KEY, fill: process.env.FILL_KEY, empty: process.env.EMPTY_KEY }))',
		].join('\n')
		const result = spawnSync(process.execPath, ['-e', script], {
			env: { PATH: process.env.PATH, NODE_ENV: 'production', PINNED_KEY: 'from-env', EMPTY_KEY: '' },
			encoding: 'utf8',
		})
		assert.equal(result.status, 0, result.stderr)
		assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').pop()), {
			pinned: 'from-env',
			fill: 'from-file',
			empty: '',
		})
	})
})

test('@next/env resolves from app/web', () => {
	const requireFromWeb = createRequire(path.join(REPO_ROOT, 'app', 'web', 'package.json'))
	assert.equal(typeof requireFromWeb('@next/env').loadEnvConfig, 'function')
})
