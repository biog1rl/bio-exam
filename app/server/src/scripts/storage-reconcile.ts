import '../config/env.js'
import { pgPool } from '../db/index.js'
import { ORPHAN_MIN_AGE_MS, reconcileStorage, type ReconcileReport } from '../services/question-content/reconcile.js'

const PREFIX = '[storage-reconcile]'
const DELETE_ORPHANS_FLAG = '--delete-orphans'
const DELETE_LEGACY_JSON_FLAG = '--delete-legacy-json'
const FLAGS = new Set([DELETE_ORPHANS_FLAG, DELETE_LEGACY_JSON_FLAG])

function printKeys(title: string, keys: string[]): void {
	console.log(`${PREFIX} ${title}: ${keys.length}`)
	for (const key of keys) console.log(`${PREFIX}   ${key}`)
}

function printReport(report: ReconcileReport): void {
	printKeys('сироты под topics/*/*/questions/', report.orphans)
	printKeys(`свежие сироты моложе ${ORPHAN_MIN_AGE_MS / 60_000} мин (не удаляются)`, report.recentOrphans)
	console.log(`${PREFIX} указатели на отсутствующие объекты: ${report.missingPointers.length}`)
	for (const entry of report.missingPointers) {
		console.log(`${PREFIX}   question=${entry.questionId} ${entry.kind}=${entry.key}`)
	}
	printKeys('сохранённые answer_keys.json и settings.json', report.legacyJson)
	console.log(`${PREFIX} объектов под topics/*/*/assets/: ${report.assetsCount}`)
	printKeys('прочие объекты под topics/ (не удаляются)', report.unknown)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const unknown = args.filter((arg) => !FLAGS.has(arg))
	if (unknown.length > 0) {
		throw new Error(
			`unknown arguments: ${unknown.join(' ')}; only ${DELETE_ORPHANS_FLAG} and ${DELETE_LEGACY_JSON_FLAG} are supported`
		)
	}
	const deleteOrphans = args.includes(DELETE_ORPHANS_FLAG)
	const deleteLegacyJson = args.includes(DELETE_LEGACY_JSON_FLAG)
	console.log(
		`${PREFIX} режим: ${deleteOrphans || deleteLegacyJson ? `удаление ${args.join(' ')}` : 'только отчёт, без записи'}`
	)

	const report = await reconcileStorage({ deleteOrphans, deleteLegacyJson })
	printReport(report)

	if (deleteOrphans) printKeys('удалено сирот', report.deleted.orphans)
	if (deleteLegacyJson) printKeys('удалено answer_keys.json и settings.json', report.deleted.legacyJson)
}

main()
	.catch((error: unknown) => {
		console.error(`${PREFIX} failed`, error)
		process.exitCode = 1
	})
	.finally(async () => {
		await pgPool.end().catch(() => undefined)
	})
