/**
 * Запуск любой команды против свежей защищённой временной базы test_* (D-02, D-03, D-29).
 *
 * Использование:
 *   node scripts/with-test-db.mjs [--prefix test_run] -- <command> [args...]
 *   node scripts/with-test-db.mjs <command> [args...]
 *
 * Команда получает изолированное окружение: TEST_DATABASE_URL временной базы,
 * BIO_EXAM_ISOLATED_ENV=1, без DATABASE_URL, SUPABASE_* и PG*.
 * Когда база готова, в stderr печатается маркер "[with-test-db] ready <каталог кластера | preset>"
 * (без URL). SIGINT/SIGTERM пересылаются команде; кластер и база удаляются всегда.
 * Код выхода — код команды (130/143 при сигнале); если база не поднялась, команда не запускается
 * и код выхода 1.
 */
import { spawn } from 'node:child_process'

import { isolatedChildEnv, withTestDatabase } from './lib/test-db.mjs'

const USAGE = 'usage: node scripts/with-test-db.mjs [--prefix test_run] -- <command> [args...]'

function parseArgs(argv) {
	let prefix = 'test_run'
	let index = 0
	while (index < argv.length) {
		const arg = argv[index]
		if (arg === '--') {
			index += 1
			break
		}
		if (arg === '--prefix') {
			prefix = argv[index + 1]
			index += 2
			continue
		}
		if (arg.startsWith('--prefix=')) {
			prefix = arg.slice('--prefix='.length)
			index += 1
			continue
		}
		break
	}
	return { prefix, command: argv.slice(index) }
}

/** Код выхода по завершению дочернего процесса */
function exitCodeOf(code, signal) {
	if (code !== null) return code
	if (signal === 'SIGINT') return 130
	if (signal === 'SIGTERM') return 143
	return 1
}

/** Запускает команду и ждёт её завершения, пересылая SIGINT/SIGTERM */
function runCommand(command, env) {
	return new Promise((resolve) => {
		const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env })
		const forward = (signal) => () => {
			if (child.exitCode === null && child.signalCode === null) child.kill(signal)
		}
		const onSigint = forward('SIGINT')
		const onSigterm = forward('SIGTERM')
		process.on('SIGINT', onSigint)
		process.on('SIGTERM', onSigterm)
		const detach = () => {
			process.off('SIGINT', onSigint)
			process.off('SIGTERM', onSigterm)
		}
		child.on('error', (error) => {
			detach()
			console.error(`[with-test-db] could not start ${command[0]}: ${error.message}`)
			resolve(127)
		})
		child.on('exit', (code, signal) => {
			detach()
			resolve(exitCodeOf(code, signal))
		})
	})
}

async function main() {
	const { prefix, command } = parseArgs(process.argv.slice(2))
	if (command.length === 0) {
		console.error(USAGE)
		return 2
	}
	try {
		return await withTestDatabase(prefix, async ({ url, dir }) => {
			console.error(`[with-test-db] ready ${dir ?? 'preset'}`)
			return runCommand(command, isolatedChildEnv({ TEST_DATABASE_URL: url }))
		})
	} catch (error) {
		// База не поднялась: команда не запускалась, маркера готовности не было
		console.error(`[with-test-db] ${error && error.message ? error.message : String(error)}`)
		return 1
	}
}

main().then((code) => process.exit(code))
