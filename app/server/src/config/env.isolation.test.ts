/**
 * Регрессионный тест переключателя изоляции (D-29, исследование C4).
 *
 * env.ts загружает .env через dotenv({ override: true }). Без переключателя такой процесс
 * молча переключился бы с одноразовой базы на боевую. Здесь env.ts импортирует дочерний
 * процесс в пустой временной папке с поддельным .env: с BIO_EXAM_ISOLATED_ENV=1 ни один
 * .env не загружается, без него (контроль) загружается какой-то файл. Контроль доказывает,
 * что тест способен упасть, и именно переключатель блокирует загрузку.
 *
 * Дочерний процесс печатает ровно одну JSON-строку из булевых значений и пути к файлу, а
 * не значения переменных, и не подключается к базе (env.ts не импортирует db).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const tsxCli = require.resolve('tsx/cli')
const envModuleUrl = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'env.ts')).href

// Код дочернего процесса. console.log заглушён на время импорта: при DEBUG_ENV=1 из реального
// .env env.ts печатает строку про DATABASE_URL, а наружу должна попасть только итоговая JSON-строка.
const CHILD_CODE = `
const print = console.log
console.log = () => {}
import(${JSON.stringify(envModuleUrl)}).then((m) => {
	console.log = print
	print(JSON.stringify({ envLoadedFrom: m.ENV_LOADED_FROM, supabaseUrlSet: Boolean(process.env.SUPABASE_URL) }))
})
`

const FAKE_ENV = ['SUPABASE_URL=https://fake.invalid', 'DATABASE_URL=postgres://fake@fake.invalid/test_fake', ''].join(
	'\n'
)

interface ChildReport {
	envLoadedFrom: string | null
	supabaseUrlSet: boolean
}

let tempDir = ''

beforeAll(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-envtest-'))
	fs.writeFileSync(path.join(tempDir, '.env'), FAKE_ENV)
})

afterAll(() => {
	if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
})

function runChild(isolated: boolean): ChildReport {
	const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' }
	delete env.DATABASE_URL
	delete env.TEST_DATABASE_URL
	delete env.DEBUG_ENV
	for (const key of Object.keys(env)) {
		if (key.startsWith('SUPABASE_')) delete env[key]
	}
	if (isolated) env.BIO_EXAM_ISOLATED_ENV = '1'
	else delete env.BIO_EXAM_ISOLATED_ENV

	const result = spawnSync(process.execPath, [tsxCli, '--eval', CHILD_CODE], {
		cwd: tempDir,
		env,
		encoding: 'utf8',
		timeout: 60_000,
	})
	// Вывод дочернего процесса не печатаем: он может содержать данные реального .env
	expect(result.status, 'дочерний процесс завершился с ошибкой').toBe(0)
	const lines = result.stdout.trim().split('\n')
	expect(lines, 'ожидали ровно одну строку вывода').toHaveLength(1)
	return JSON.parse(lines[0]) as ChildReport
}

describe('переключатель BIO_EXAM_ISOLATED_ENV и загрузка .env', () => {
	test('с BIO_EXAM_ISOLATED_ENV=1 ни один .env не загружается', () => {
		const report = runChild(true)
		expect(report.envLoadedFrom).toBeNull()
		expect(report.supabaseUrlSet).toBe(false)
	})

	test('контроль: без переключателя какой-то .env загружается', () => {
		const report = runChild(false)
		expect(report.envLoadedFrom).not.toBeNull()
		expect(typeof report.envLoadedFrom).toBe('string')
	})
})
