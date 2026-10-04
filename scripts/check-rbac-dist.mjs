/**
 * Проверка сборки @bio-exam/rbac (D-09, T-1-21): dist после tsdown совпадает с прежней сборкой tsup.
 *
 *  1. В packages/rbac/dist есть ровно те файлы, на которые смотрит карта exports:
 *     index.js (ESM), index.cjs (CJS), index.d.ts и index.d.cts.
 *  2. Списки экспортов ESM и CJS совпадают с EXPECTED_EXPORTS — эталоном, снятым со сборки tsup.
 *
 * Запуск после `yarn workspace @bio-exam/rbac build`: `node scripts/check-rbac-dist.mjs`.
 * Выход: 0 — «rbac dist OK»; 1 — список расхождений.
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIST_DIR = fileURLToPath(new URL('../packages/rbac/dist/', import.meta.url))
const REQUIRED_FILES = ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']

// Эталон: Object.keys() сборки tsup 8.5 (ESM и CJS одинаковы), снят до перехода на tsdown
const EXPECTED_EXPORTS = [
	'PERMISSION_DOMAINS',
	'ROLES_LIST',
	'ROLE_KEYS',
	'ROLE_REGISTRY',
	'accessRuleToSerializable',
	'can',
	'createAccessRule',
	'normaliseActionList',
	'normaliseRoleAccessMap',
	'normaliseRoleKeys',
	'normaliseUserAccessMap',
	'normaliseUserIdentifiers',
	'roleDisplayName',
]

function diffNames(label, actual) {
	const expected = [...EXPECTED_EXPORTS].sort()
	const missing = expected.filter((name) => !actual.includes(name))
	const extra = actual.filter((name) => !expected.includes(name))
	const problems = []
	if (missing.length) problems.push(`${label}: нет экспортов ${missing.join(', ')}`)
	if (extra.length) problems.push(`${label}: лишние экспорты ${extra.join(', ')}`)
	return problems
}

async function main() {
	const problems = []

	for (const file of REQUIRED_FILES) {
		if (!fs.existsSync(path.join(DIST_DIR, file))) problems.push(`нет файла packages/rbac/dist/${file}`)
	}
	if (problems.length) throw new Error(problems.join('\n'))

	const esmNames = Object.keys(await import(pathToFileURL(path.join(DIST_DIR, 'index.js')).href)).sort()
	const cjsNames = Object.keys(createRequire(import.meta.url)(path.join(DIST_DIR, 'index.cjs'))).sort()

	problems.push(...diffNames('ESM', esmNames), ...diffNames('CJS', cjsNames))
	if (problems.length) throw new Error(problems.join('\n'))

	console.log(`rbac dist OK: ${REQUIRED_FILES.join(', ')}; ${EXPECTED_EXPORTS.length} экспортов в ESM и CJS`)
}

main().catch((err) => {
	console.error(`rbac dist FAILED:\n${err.message}`)
	process.exit(1)
})
