import '../config/env.js'
import { pgPool } from '../db/index.js'
import { moveInlineImages, type InlineImagesReport } from '../services/question-content/inline-images.js'

const PREFIX = '[inline-images]'
const APPLY_FLAG = '--apply'

function megabytes(bytes: number): string {
	return `${(bytes / 1048576).toFixed(2)} МБ`
}

function printReport(report: InlineImagesReport, apply: boolean): void {
	console.log(`${PREFIX} вопросов просмотрено: ${report.scanned}`)
	console.log(`${PREFIX} вопросов с base64-картинками: ${report.withImages}`)
	console.log(`${PREFIX} base64-картинок: ${report.inlineImages}, объём ${megabytes(report.inlineBytes)}`)
	console.log(`${PREFIX} вариантов ответа с base64 (не переносятся): ${report.optionsWithImages}`)
	console.log(`${PREFIX} черновиков с base64 (перенесутся при сохранении): ${report.draftsWithImages}`)
	if (!apply) return
	console.log(`${PREFIX} вопросов переписано: ${report.updated}`)
	console.log(`${PREFIX} файлов картинок в images/: ${report.storedImages}`)
	console.log(`${PREFIX} текст вопросов: ${megabytes(report.bytesBefore)} -> ${megabytes(report.bytesAfter)}`)
	console.log(`${PREFIX} картинок не удалось перенести: ${report.failedImages}`)
	console.log(`${PREFIX} вопросов с ошибкой: ${report.failedQuestions.length}`)
	for (const entry of report.failedQuestions) console.log(`${PREFIX}   question=${entry.questionId} ${entry.error}`)
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const unknown = args.filter((arg) => arg !== APPLY_FLAG)
	if (unknown.length > 0) {
		throw new Error(`unknown arguments: ${unknown.join(' ')}; only ${APPLY_FLAG} is supported`)
	}
	const apply = args.includes(APPLY_FLAG)
	console.log(`${PREFIX} режим: ${apply ? 'перенос в хранилище' : 'только отчёт, без записи'}`)
	const report = await moveInlineImages({ apply })
	printReport(report, apply)
	if (report.failedQuestions.length > 0) process.exitCode = 1
}

main()
	.catch((error: unknown) => {
		console.error(`${PREFIX} failed`, error)
		process.exitCode = 1
	})
	.finally(async () => {
		await pgPool.end().catch(() => undefined)
	})
