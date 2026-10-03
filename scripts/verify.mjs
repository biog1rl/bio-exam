/**
 * yarn verify: единственный вход в проверку репозитория, локально и в CI (VER-02, D-03, ADR-0003).
 *
 * Шаги идут строго по порядку и останавливаются на первом ненулевом коде выхода:
 *   1. lockfile             node scripts/check-lockfile.mjs
 *   2. env-contract         node scripts/check-env-contract.mjs (.env.example совпадают с кодом, без секретов)
 *   3. docs-commands        node scripts/check-docs-commands.mjs (команды yarn в README и AGENTS.md существуют)
 *   4. ci-workflow          node scripts/check-ci-workflow.mjs (CI только читает: без записи, секретов и публикации)
 *   5. format-check         yarn format:check (oxfmt --check .)
 *   6. lint-typecheck-test  yarn turbo run lint typecheck test (все три воркспейса)
 *   7. migrations           node scripts/check-migrations.mjs
 *   8. script-tests         node --test scripts/**\/*.test.mjs
 * Новые шаги добавляются в массив STEPS, порядок задаётся только им.
 *
 * Все шаги работают с одноразовой PostgreSQL 17, которую поднимает withTestDatabase (или с
 * предустановленной TEST_DATABASE_URL, например сервисным контейнером CI, после той же защиты).
 * Если PostgreSQL 17 нет и TEST_DATABASE_URL не задан, прогон падает с понятным сообщением:
 * шаги с базой никогда не пропускаются молча (D-03).
 *
 * Дочерние процессы получают isolatedChildEnv: без DATABASE_URL, SUPABASE_* и PG*, с
 * BIO_EXAM_ISOLATED_ENV=1 и TEST_DATABASE_URL временной базы (T-1-17). Предупреждения шага
 * не ошибка: решает только код выхода (D-12).
 *
 * Вывод заканчивается блоком "verify summary:" и строкой "yarn verify: OK" либо
 * "yarn verify: FAILED at <шаг>". Код выхода 0 или 1.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { isolatedChildEnv, withTestDatabase } from './lib/test-db.mjs'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts')

/** Имя "шага" для отказа до начала шагов: нет PostgreSQL 17 или база не поднялась */
const SETUP_STEP = 'test-database'

/** Тестовые файлы скриптов: рекурсивно, без зависимости от глобов оболочки или Node */
function collectScriptTests(dir = SCRIPTS_DIR) {
	const files = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) files.push(...collectScriptTests(full))
		else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(full)
	}
	return files.sort()
}

/** Порядок шагов задан здесь и только здесь */
export const STEPS = [
	{ name: 'lockfile', cmd: process.execPath, args: ['scripts/check-lockfile.mjs'] },
	{ name: 'env-contract', cmd: process.execPath, args: ['scripts/check-env-contract.mjs'] },
	{ name: 'docs-commands', cmd: process.execPath, args: ['scripts/check-docs-commands.mjs'] },
	{ name: 'ci-workflow', cmd: process.execPath, args: ['scripts/check-ci-workflow.mjs'] },
	{ name: 'format-check', cmd: 'yarn', args: ['format:check'] },
	{ name: 'lint-typecheck-test', cmd: 'yarn', args: ['turbo', 'run', 'lint', 'typecheck', 'test'] },
	{ name: 'migrations', cmd: process.execPath, args: ['scripts/check-migrations.mjs'] },
	{
		name: 'script-tests',
		cmd: process.execPath,
		// Файлы раскрываются здесь: ноль найденных тестов — провал, а не успех
		args: () => {
			const files = collectScriptTests().map((file) => path.relative(REPO_ROOT, file))
			if (files.length === 0) throw new Error('no scripts/**/*.test.mjs files found: zero tests is a failure')
			return ['--test', ...files]
		},
	},
]

/** Запуск одного шага с наследованием вывода; возвращает { ok, detail } и не бросает */
function runStep(step, env) {
	return new Promise((resolve) => {
		let args
		try {
			args = typeof step.args === 'function' ? step.args() : step.args
		} catch (error) {
			resolve({ ok: false, detail: error.message })
			return
		}
		console.error(`\n[verify] step ${step.name}: ${[path.basename(step.cmd), ...args].join(' ')}`)
		const child = spawn(step.cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', env })
		child.on('error', (error) => resolve({ ok: false, detail: `cannot start ${step.cmd}: ${error.message}` }))
		child.on('close', (code, signal) => {
			if (code === 0) resolve({ ok: true })
			else resolve({ ok: false, detail: signal ? `terminated by ${signal}` : `exit code ${code}` })
		})
	})
}

/** Блок итогов: каждый шаг по порядку (passed / FAILED / not run) и финальная строка */
export function formatSummary(steps, statuses, failedName) {
	const lines = ['verify summary:']
	for (const step of steps) lines.push(`  ${step.name}: ${statuses.get(step.name) ?? 'not run'}`)
	lines.push(failedName === null ? 'yarn verify: OK' : `yarn verify: FAILED at ${failedName}`)
	return lines.join('\n')
}

async function main() {
	const statuses = new Map()
	let failed = null
	try {
		await withTestDatabase('test_verify', async ({ url }) => {
			const env = isolatedChildEnv({ TEST_DATABASE_URL: url })
			for (const step of STEPS) {
				const result = await runStep(step, env)
				if (result.ok) {
					statuses.set(step.name, 'passed')
					continue
				}
				statuses.set(step.name, 'FAILED')
				console.error(`[verify] step ${step.name} failed: ${result.detail}`)
				failed = step.name
				break
			}
		})
	} catch (error) {
		// Нет PostgreSQL 17, пустой или недопустимый TEST_DATABASE_URL, кластер не поднялся
		console.error(`[verify] ${error && error.message ? error.message : String(error)}`)
		failed ??= SETUP_STEP
	}
	const summary = formatSummary(STEPS, statuses, failed)
	console.log(summary)
	return failed === null ? 0 : 1
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().then(
		(code) => process.exit(code),
		(error) => {
			console.error(`yarn verify: crashed: ${error && error.message ? error.message : String(error)}`)
			process.exit(1)
		}
	)
}
