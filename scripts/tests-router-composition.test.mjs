import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const COMPOSITION_FILE = 'app/server/src/routes/tests/index.ts'
const ADMIN_DIR = 'app/server/src/routes/tests/admin'
const MAX_LINES = 80
const TEST_FILE = /\.(?:test|spec)\.ts$/

const q = '\u0027'

const LINE_CHECKS = [
	{
		label: 'регистрация обработчика router.<метод>(: обработчики живут в routes/tests/admin',
		match: (line) => /\brouter\.(?:get|post|put|patch|delete|all|options|head)\(/.test(line),
	},
	{
		label: 'импорт db: точка сборки не ходит в базу',
		match: (line) => /\bfrom\s+['"][./]*db\/(?:index|schema)(?:\.js)?['"]/.test(line),
	},
	{ label: 'импорт drizzle-orm', match: (line) => /['"]drizzle-orm(?:\/[^'"]*)?['"]/.test(line) },
	{ label: 'импорт services/storage', match: (line) => /['"][./]*services\/storage(?:\/[^'"]*)?['"]/.test(line) },
	{
		label: 'импорт services/question-content',
		match: (line) => /['"][./]*services\/question-content(?:\/[^'"]*)?['"]/.test(line),
	},
]

function compositionViolations(root) {
	const source = fs.readFileSync(path.join(root, COMPOSITION_FILE), 'utf8')
	const violations = []
	source.split('\n').forEach((line, index) => {
		for (const check of LINE_CHECKS) {
			if (check.match(line)) violations.push(`${COMPOSITION_FILE}:${index + 1}: ${check.label}: ${line.trim()}`)
		}
	})
	const lines = source.split('\n').length
	if (lines > MAX_LINES) violations.push(`${COMPOSITION_FILE}: ${lines} строк, предел ${MAX_LINES}`)
	if (!/^export default router$/m.test(source)) violations.push(`${COMPOSITION_FILE}: нет export default router`)
	return violations
}

function adminRouterExports(root) {
	const dir = path.join(root, ADMIN_DIR)
	return fs
		.readdirSync(dir)
		.filter((name) => name.endsWith('.ts') && !TEST_FILE.test(name))
		.sort()
		.flatMap((name) => {
			const source = fs.readFileSync(path.join(dir, name), 'utf8')
			const match = /^export \{ router as (\w+) \}$/m.exec(source)
			return match ? [{ file: `${ADMIN_DIR}/${name}`, name: match[1] }] : []
		})
}

function mountViolations(root) {
	const source = fs.readFileSync(path.join(root, COMPOSITION_FILE), 'utf8')
	return adminRouterExports(root)
		.filter(({ name }) => !source.includes(`router.use(${name})`))
		.map(({ file, name }) => `${COMPOSITION_FILE}: суброутер ${name} из ${file} не смонтирован`)
}

function copyFile(tmp, relative, change = (source) => source) {
	const target = path.join(tmp, relative)
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.writeFileSync(target, change(fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8')))
}

test('routes/tests/index.ts только собирает суброутеры', () => {
	assert.deepEqual(compositionViolations(REPO_ROOT), [])
})

test('каждый суброутер routes/tests/admin смонтирован в точке сборки', () => {
	const exported = adminRouterExports(REPO_ROOT)
	assert.ok(exported.length >= 12, `${ADMIN_DIR}: суброутеров ${exported.length}`)
	assert.deepEqual(mountViolations(REPO_ROOT), [])
})

test('проба: обработчик и импорты db, drizzle-orm, хранилища и содержимого в копии точки сборки дают нарушения', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tests-router-composition-'))
	try {
		copyFile(tmp, COMPOSITION_FILE, (source) =>
			[
				`import { eq } from ${q}drizzle-orm${q}`,
				`import { db } from ${q}../../db/index.js${q}`,
				`import { storageService } from ${q}../../services/storage/index.js${q}`,
				`import { readAdminTest } from ${q}../../services/question-content/index.js${q}`,
				source,
				`router.get(${q}/probe${q}, (req, res) => res.json({ eq, db, storageService, readAdminTest }))`,
			].join('\n')
		)
		const found = compositionViolations(tmp)
		assert.equal(found.length, 5, found.join('\n'))
		assert.match(found[0], /^app\/server\/src\/routes\/tests\/index\.ts:1: импорт drizzle-orm/)
		assert.match(found[1], /^app\/server\/src\/routes\/tests\/index\.ts:2: импорт db/)
		assert.match(found[2], /^app\/server\/src\/routes\/tests\/index\.ts:3: импорт services\/storage/)
		assert.match(found[3], /^app\/server\/src\/routes\/tests\/index\.ts:4: импорт services\/question-content/)
		assert.match(found[4], /^app\/server\/src\/routes\/tests\/index\.ts:\d+: регистрация обработчика/)
		assert.deepEqual(compositionViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})

test('проба: длинная точка сборки без export default и с несмонтированным суброутером дают нарушения', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tests-router-composition-'))
	try {
		for (const { file } of adminRouterExports(REPO_ROOT)) copyFile(tmp, file)
		copyFile(
			tmp,
			COMPOSITION_FILE,
			(source) =>
				`${source.replace('export default router', 'export { router }').replace('router.use(exportRouter)\n', '')}${'\n'.repeat(MAX_LINES)}`
		)
		const found = compositionViolations(tmp)
		assert.equal(found.length, 2, found.join('\n'))
		assert.match(found[0], /^app\/server\/src\/routes\/tests\/index\.ts: \d+ строк, предел 80$/)
		assert.match(found[1], /^app\/server\/src\/routes\/tests\/index\.ts: нет export default router$/)
		assert.deepEqual(mountViolations(tmp), [
			`${COMPOSITION_FILE}: суброутер exportRouter из ${ADMIN_DIR}/export.ts не смонтирован`,
		])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})
