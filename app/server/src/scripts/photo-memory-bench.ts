import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp, { type Sharp } from 'sharp'

import {
	createImageIntake,
	detectImageType,
	IMAGE_INTAKE_CONCURRENCY,
	IMAGE_INTAKE_QUEUE_LIMIT,
	IMAGE_MAX_PIXELS,
	IMAGE_PROFILES,
	ImageRejectedError,
} from '../services/assets/image-intake.js'

type Measure = { input: string; copies: number; concurrency: number; out: string | null }

type Measured = {
	outcome: string
	output: string
	peakMb: number
	ms: number
}

type SeriesStep = { index: number; rssMb: number; ms: number }

type Row = {
	label: string
	sizeMb: number
	orientation: string
	concurrency: number
	copies: number
	expected: string | null
	result: Measured
}

type Synthetic = {
	label: string
	file: string
	expected: string
	create: () => Promise<Buffer>
}

const MB = 1024 * 1024
const SAMPLE_MS = 5

function arg(name: string): string | null {
	const index = process.argv.indexOf(name)
	if (index === -1) return null
	return process.argv[index + 1] ?? null
}

function mb(bytes: number): number {
	return Math.round((bytes / MB) * 10) / 10
}

function noiseJpeg(width: number, height: number, orientation: number): Promise<Buffer> {
	return sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 0, g: 0, b: 0 },
			noise: { type: 'gaussian', mean: 128, sigma: 40 },
		},
	})
		.jpeg({ quality: 90 })
		.withMetadata({ orientation })
		.toBuffer()
}

function solid(width: number, height: number): Sharp {
	return sharp({ create: { width, height, channels: 3, background: { r: 230, g: 230, b: 220 } } })
}

function solidPng(width: number, height: number, orientation: number | null): Promise<Buffer> {
	const image = solid(width, height).png()
	return (orientation === null ? image : image.withMetadata({ orientation })).toBuffer()
}

function losslessWebp(width: number, height: number, orientation: number): Promise<Buffer> {
	return solid(width, height).webp({ lossless: true }).withMetadata({ orientation }).toBuffer()
}

function lossyWebp(width: number, height: number, orientation: number): Promise<Buffer> {
	return sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 0, g: 0, b: 0 },
			noise: { type: 'gaussian', mean: 128, sigma: 40 },
		},
	})
		.webp({ quality: 80 })
		.withMetadata({ orientation })
		.toBuffer()
}

const SYNTHETIC: Synthetic[] = [
	{ label: 'JPEG 4,9 МП от клиента', file: 'jpeg-client.jpg', expected: 'ok', create: () => noiseJpeg(2560, 1920, 1) },
	{ label: 'JPEG 12 МП', file: 'jpeg-12-o6.jpg', expected: 'ok', create: () => noiseJpeg(4000, 3000, 6) },
	{ label: 'JPEG 12 МП', file: 'jpeg-12-o8.jpg', expected: 'ok', create: () => noiseJpeg(4000, 3000, 8) },
	{ label: 'JPEG 48 МП', file: 'jpeg-48-o6.jpg', expected: 'ok', create: () => noiseJpeg(8000, 6000, 6) },
	{ label: 'JPEG 48 МП', file: 'jpeg-48-o8.jpg', expected: 'ok', create: () => noiseJpeg(8000, 6000, 8) },
	{ label: 'PNG 24 МП', file: 'png-24-o6.png', expected: 'ok', create: () => solidPng(6000, 4000, 6) },
	{ label: 'PNG 24 МП', file: 'png-24-o8.png', expected: 'ok', create: () => solidPng(6000, 4000, 8) },
	{ label: 'PNG 48 МП', file: 'png-48-o6.png', expected: 'ok', create: () => solidPng(8000, 6000, 6) },
	{ label: 'PNG 48 МП', file: 'png-48-o8.png', expected: 'ok', create: () => solidPng(8000, 6000, 8) },
	{ label: 'PNG 49 МП', file: 'png-49.png', expected: 'ok', create: () => solidPng(7000, 7000, null) },
	{ label: 'WebP lossless 48 МП', file: 'webp-48-o6.webp', expected: 'ok', create: () => losslessWebp(8000, 6000, 6) },
	{ label: 'WebP lossless 48 МП', file: 'webp-48-o8.webp', expected: 'ok', create: () => losslessWebp(8000, 6000, 8) },
	{ label: 'WebP q80 48 МП', file: 'webp-lossy-48-o6.webp', expected: 'ok', create: () => lossyWebp(8000, 6000, 6) },
	{ label: 'PNG 64 МП', file: 'png-64.png', expected: '413', create: () => solidPng(8000, 8000, null) },
]

const LAYOUTS: Array<{ concurrency: number; copies: number }> = [
	{ concurrency: 1, copies: 1 },
	{ concurrency: 1, copies: 2 },
	{ concurrency: 2, copies: 2 },
]

function outcomeOf(error: unknown): string {
	if (error instanceof ImageRejectedError) return String(error.statusCode)
	return `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
}

function sampler(base: number): { stop: () => number } {
	let peak = process.memoryUsage.rss()
	const timer = setInterval(() => {
		peak = Math.max(peak, process.memoryUsage.rss())
	}, SAMPLE_MS)
	return {
		stop: () => {
			clearInterval(timer)
			return Math.max(peak, process.memoryUsage.rss()) - base
		},
	}
}

async function measureChild(spec: Measure): Promise<Measured> {
	const buffers = await Promise.all(Array.from({ length: spec.copies }, () => readFile(spec.input)))
	const intake = createImageIntake({ concurrency: spec.concurrency, queueLimit: 64 })
	await new Promise((done) => setTimeout(done, 50))
	const base = process.memoryUsage.rss()
	const watch = sampler(base)
	const started = performance.now()
	let outcome = 'ok'
	let output = '—'
	try {
		const accepted = await Promise.all(buffers.map((buffer) => intake.acceptImage(buffer, IMAGE_PROFILES.answerPhoto)))
		const [first] = accepted
		if (first) {
			output = `webp ${first.width}×${first.height}, ${mb(first.full.length)} МБ`
			if (spec.out !== null) {
				await writeFile(path.join(spec.out, `${path.parse(spec.input).name}.webp`), first.full)
			}
		}
	} catch (error) {
		outcome = outcomeOf(error)
	}
	const ms = Math.round(performance.now() - started)
	return { outcome, output, peakMb: mb(watch.stop()), ms }
}

async function seriesChild(input: string, count: number): Promise<SeriesStep[]> {
	const buffer = await readFile(input)
	const intake = createImageIntake({ concurrency: 1, queueLimit: 64 })
	const steps: SeriesStep[] = []
	for (let index = 1; index <= count; index += 1) {
		const started = performance.now()
		await intake.acceptImage(buffer, IMAGE_PROFILES.answerPhoto)
		steps.push({ index, rssMb: mb(process.memoryUsage.rss()), ms: Math.round(performance.now() - started) })
	}
	return steps
}

function runChild<T>(payload: Record<string, unknown>): T {
	const script = process.argv[1]
	if (!script) throw new Error('photo-memory-bench: не найден путь скрипта')
	const result = spawnSync(process.execPath, [...process.execArgv, script, '--child', JSON.stringify(payload)], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		maxBuffer: 16 * MB,
	})
	const line = result.stdout.trim().split('\n').pop()
	if (result.status !== 0 || !line)
		throw new Error(`photo-memory-bench: дочерний процесс завершился кодом ${result.status}`)
	return JSON.parse(line) as T
}

async function describeInput(
	file: string
): Promise<{ sizeMb: number; orientation: string; mime: string; pixels: string }> {
	const buffer = await readFile(file)
	const mime = (await detectImageType(buffer)) ?? 'неизвестно'
	let orientation = '—'
	let pixels = '—'
	try {
		const meta = await sharp(buffer).metadata()
		orientation = meta.orientation ? String(meta.orientation) : '—'
		pixels = `${Math.round((meta.width * meta.height) / 100_000) / 10} МП`
	} catch {
		pixels = 'не читается'
	}
	return { sizeMb: mb(buffer.length), orientation, mime, pixels }
}

function table(header: string[], rows: string[][]): string {
	const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`]
	for (const row of rows) lines.push(`| ${row.join(' | ')} |`)
	return lines.join('\n')
}

async function syntheticRows(work: string): Promise<Row[]> {
	const files: Array<{ synthetic: Synthetic; file: string }> = []
	for (const synthetic of SYNTHETIC) {
		const file = path.join(work, synthetic.file)
		await writeFile(file, await synthetic.create())
		files.push({ synthetic, file })
	}
	const rows: Row[] = []
	for (const { synthetic, file } of files) {
		const info = await describeInput(file)
		const layouts = synthetic.expected === 'ok' ? LAYOUTS : LAYOUTS.slice(0, 1)
		for (const layout of layouts) {
			const result = runChild<Measured>({ mode: 'measure', input: file, out: null, ...layout })
			rows.push({
				label: synthetic.label,
				sizeMb: info.sizeMb,
				orientation: info.orientation,
				concurrency: layout.concurrency,
				copies: layout.copies,
				expected: synthetic.expected,
				result,
			})
		}
	}
	return rows
}

async function directoryRows(
	dir: string,
	out: string | null
): Promise<Array<{ name: string; info: string[]; result: Measured }>> {
	if (out !== null) await mkdir(out, { recursive: true })
	const names = (await readdir(dir)).filter((name) => !name.startsWith('.')).sort()
	const rows: Array<{ name: string; info: string[]; result: Measured }> = []
	for (const name of names) {
		const file = path.join(dir, name)
		const info = await describeInput(file)
		const result = runChild<Measured>({ mode: 'measure', input: file, out, concurrency: 1, copies: 1 })
		rows.push({ name, info: [info.mime, String(info.sizeMb), info.pixels, info.orientation], result })
	}
	return rows
}

async function main(): Promise<number> {
	const child = arg('--child')
	if (child !== null) {
		const payload = JSON.parse(child) as Record<string, unknown>
		if (payload.mode === 'series') {
			console.log(JSON.stringify(await seriesChild(String(payload.input), Number(payload.count))))
		} else {
			console.log(JSON.stringify(await measureChild(payload as unknown as Measure)))
		}
		return 0
	}

	const seriesCount = Number(arg('--series') ?? 30)
	const dir = arg('--dir')
	const out = arg('--out')

	console.log(`# photo-memory-bench`)
	console.log('')
	console.log(
		`ОС ${process.platform} ${process.arch}, Node ${process.versions.node}, sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}; ` +
			`профиль answerPhoto (2560 px, WebP q82, миниатюра 400 px q75), лимит ${IMAGE_MAX_PIXELS / 1_000_000} МП, ` +
			`по умолчанию concurrency ${IMAGE_INTAKE_CONCURRENCY}, очередь ${IMAGE_INTAKE_QUEUE_LIMIT}. Пик RSS — прирост над базой процесса.`
	)
	console.log('')

	if (dir !== null) {
		const rows = await directoryRows(dir, out)
		console.log(
			table(
				['Файл', 'Тип', 'МБ', 'Пиксели', 'Orientation', 'Исход', 'Выход', 'Пик RSS, МБ', 'Время, мс'],
				rows.map((row) => [
					row.name,
					...row.info,
					row.result.outcome,
					row.result.output,
					String(row.result.peakMb),
					String(row.result.ms),
				])
			)
		)
		return 0
	}

	const work = await mkdtemp(path.join(tmpdir(), 'photo-bench-'))
	try {
		const rows = await syntheticRows(work)
		console.log(
			table(
				[
					'Вход',
					'МБ',
					'Orientation',
					'concurrency',
					'Одновременно',
					'Исход',
					'Ожидалось',
					'Выход',
					'Пик RSS, МБ',
					'Время, мс',
				],
				rows.map((row) => [
					row.label,
					String(row.sizeMb),
					row.orientation,
					String(row.concurrency),
					String(row.copies),
					row.result.outcome,
					row.expected ?? '—',
					row.result.output,
					String(row.result.peakMb),
					String(row.result.ms),
				])
			)
		)
		console.log('')

		const steps = runChild<SeriesStep[]>({
			mode: 'series',
			input: path.join(work, 'jpeg-12-o6.jpg'),
			count: seriesCount,
		})
		const first = steps[0]
		const last = steps[steps.length - 1]
		const average = steps.reduce((sum, step) => sum + step.ms, 0) / Math.max(steps.length, 1)
		console.log(`Серия: ${steps.length} обработок JPEG 12 МП подряд, concurrency 1, RSS процесса после каждой`)
		console.log('')
		console.log(
			table(
				['№', 'RSS, МБ', 'Время, мс'],
				steps.map((step) => [String(step.index), String(step.rssMb), String(step.ms)])
			)
		)
		console.log('')
		console.log(
			`Итог серии: RSS ${first?.rssMb ?? 0} → ${last?.rssMb ?? 0} МБ, среднее ${Math.round(average)} мс, ` +
				`около ${Math.round(60_000 / Math.max(average, 1))} фото в минуту при concurrency 1`
		)

		const mismatched = rows.filter((row) => row.expected !== null && row.result.outcome !== row.expected)
		if (mismatched.length > 0) {
			console.log('')
			console.log(`Не совпали ожидаемые исходы: ${mismatched.map((row) => row.label).join(', ')}`)
			return 1
		}
		return 0
	} finally {
		await rm(work, { recursive: true, force: true })
	}
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
)
