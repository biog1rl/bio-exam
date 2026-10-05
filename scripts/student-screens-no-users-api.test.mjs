import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const STUDENT_ROOTS = [
	{ root: 'app/web/app/(internal)/(protected)/dashboard', minFiles: 2 },
	{ root: 'app/web/app/(internal)/(protected)/profile', minFiles: 2 },
	{ root: 'app/web/app/(internal)/(protected)/tests', minFiles: 2 },
	{ root: 'app/web/app/(internal)/(protected)/sitemap', minFiles: 1 },
	{ root: 'app/web/app/(internal)/login', minFiles: 2 },
	{ root: 'app/web/app/(internal)/invite', minFiles: 2 },
	{ root: 'app/web/components/tests', minFiles: 5 },
]
const STUDENT_FILES = [
	'app/web/components/AppSidebar.tsx',
	'app/web/components/nav-user.tsx',
	'app/web/components/auth/AuthGuard.tsx',
	'app/web/components/providers/AuthProvider.tsx',
]
const ADMIN_ROOT = 'app/web/app/(internal)/(protected)/admin'

const OWN_PROFILE_ENDPOINTS = String.raw`(?:profile|avatar)`
const QUOTE = String.raw`['"\x60]`

const RULES = [
	{
		label: 'адрес /api/users, кроме собственных /profile и /avatar',
		pattern: new RegExp(String.raw`\/api\/users(?!\/${OWN_PROFILE_ENDPOINTS}(?![\w-]))`),
	},
	{
		label: 'импорт lib/users/api (справочник и карточки пользователей)',
		pattern: new RegExp(String.raw`${QUOTE}[^'"\x60]*lib\/users\/api${QUOTE}`),
	},
	{ label: 'usersKeys или usersListFetcher', pattern: /\b(?:usersKeys|usersListFetcher)\b/ },
]

function findViolations(source) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = RULES.filter((rule) => rule.pattern.test(line)).map((rule) => rule.label)
		if (labels.length > 0) hits.push({ line: index + 1, text: line.trim(), labels })
	})
	return hits
}

function collectSources(relativeDir) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(path.join(dir, entry.name))
		}
	}
	walk(path.join(REPO_ROOT, relativeDir))
	return files.sort()
}

const q = String.fromCharCode(39)

const VIOLATING = [
	'const url = `/api/users`',
	`const url = ${q}/api/users/by-login/${q} + login`,
	'const url = `/api/users/${id}/test-attempts`',
	`const url = ${q}/api/users/directory${q}`,
	`import { usersKeys } from ${q}@/lib/users/api${q}`,
	`import { parseUserEnvelope } from ${q}../../lib/users/api${q}`,
	'const key = usersKeys.list()',
]

const ALLOWED = [
	`const PROFILE_URL = ${q}/api/users/profile${q}`,
	`const AVATAR_URL = ${q}/api/users/avatar${q}`,
	`import { updateOwnProfile } from ${q}@/lib/users/profile-api${q}`,
	`const url = ${q}/api/auth/me${q}`,
	`const url = ${q}/api/tests/my-attempts${q}`,
]

test('правила ловят обращения к /api/users и пропускают собственный профиль (проба-нарушение)', () => {
	for (const text of VIOLATING) assert.equal(findViolations(text).length, 1, text)
	for (const text of ALLOWED) assert.deepEqual(findViolations(text), [], text)
	assert.equal(findViolations(`${q}/api/users/profile-extra${q}`).length, 1)
})

test('детектор живой: админские экраны ходят на /api/users', () => {
	const hits = collectSources(ADMIN_ROOT).filter((file) => findViolations(fs.readFileSync(file, 'utf8')).length > 0)
	assert.ok(hits.length >= 1, 'в admin нет ни одного обращения к /api/users: детектор или раскладка устарели')
})

test('экраны ученика web не вызывают /api/users (PRIV-02)', () => {
	const violations = []
	const files = []
	for (const { root, minFiles } of STUDENT_ROOTS) {
		const found = collectSources(root)
		assert.ok(found.length >= minFiles, `${root}: просканировано файлов: ${found.length}`)
		files.push(...found)
	}
	for (const file of STUDENT_FILES) {
		assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), `${file}: нет файла`)
		files.push(path.join(REPO_ROOT, file))
	}
	for (const file of files) {
		const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
		for (const hit of findViolations(fs.readFileSync(file, 'utf8'))) {
			violations.push(`${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
		}
	}
	assert.deepEqual(
		violations,
		[],
		'справочник пользователей доступен только админским экранам; ученик ходит на свои эндпоинты'
	)
})
