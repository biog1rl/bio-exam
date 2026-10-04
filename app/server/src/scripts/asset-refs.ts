import '../config/env.js'
import { pgPool } from '../db/index.js'
import {
	backfillAssetRefs,
	inventoryAssetRefs,
	type AssetInventory,
	type QuestionAssetRef,
} from '../services/question-content/asset-index.js'

const PREFIX = '[asset-refs]'
const WRITE_FLAG = '--write'

function counts(record: Record<string, number>): string {
	const entries = Object.entries(record)
	return entries.length === 0 ? 'нет' : entries.map(([name, count]) => `${name}=${count}`).join(' ')
}

function printRefs(title: string, refs: QuestionAssetRef[]): void {
	console.log(`${PREFIX} ${title}: ${refs.length}`)
	for (const ref of refs) console.log(`${PREFIX}   question=${ref.questionId} key=${ref.key} src=${ref.src}`)
}

function printInventory(inventory: AssetInventory): void {
	console.log(`${PREFIX} вопросов: ${inventory.questions}, ссылок: ${inventory.links.length}`)
	console.log(`${PREFIX} по формам: ${counts(inventory.byForm)}`)
	console.log(`${PREFIX} по пространствам имён: ${counts(inventory.byNamespace)}`)
	printRefs('вне images/, topics/*/*/assets/, avatars/', inventory.outsideNamespaces)
	printRefs('nonServable (не отдаёт isServableImageKey)', inventory.nonServable)
	console.log(`${PREFIX} некорректные ссылки: ${inventory.invalid.length}`)
	for (const entry of inventory.invalid) console.log(`${PREFIX}   question=${entry.questionId} src=${entry.src}`)
	printRefs('отсутствующие объекты', inventory.missingObjects)
	console.log(`${PREFIX} указатели на отсутствующий файл: ${inventory.missingPointers.length}`)
	for (const entry of inventory.missingPointers) {
		console.log(`${PREFIX}   question=${entry.questionId} ${entry.kind}=${entry.key}`)
	}
	const outside = inventory.outsideNamespaces.length
	const nonServable = inventory.nonServable.length
	console.log(
		outside > 0 || nonServable > 0
			? `${PREFIX} STOP D-19: ${outside} ссылок вне пространств, ${nonServable} nonServable`
			: `${PREFIX} STOP D-19: нет`
	)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const unknown = args.filter((arg) => arg !== WRITE_FLAG)
	if (unknown.length > 0) throw new Error(`unknown arguments: ${unknown.join(' ')}; only ${WRITE_FLAG} is supported`)

	printInventory(await inventoryAssetRefs())

	if (args.includes(WRITE_FLAG)) {
		const result = await backfillAssetRefs()
		console.log(
			`${PREFIX} backfill processed=${result.processed} indexed=${result.indexed} skipped=${result.skipped} failed=${result.failed}`
		)
		if (result.failed > 0) process.exitCode = 1
	}
}

main()
	.catch((error: unknown) => {
		console.error(`${PREFIX} failed`, error)
		process.exitCode = 1
	})
	.finally(async () => {
		await pgPool.end().catch(() => undefined)
	})
