import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WEB_ROOT = 'app/web'
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage', 'test-results'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const REQUEST_MODULE_DIRS = ['app/web/lib/http/', 'app/web/lib/session/']

const REMOVED_FILES = ['app/web/lib/fetcher.ts', 'app/web/lib/swr-config.ts', 'app/web/lib/api-fetch.ts']

const FETCH_EXCEPTIONS = [
	{
		file: 'app/web/app/(internal)/login/LoginPageClient.tsx',
		reason: 'вход: 401 означает неверный пароль, 429 — троттлинг, а не истёкшую сессию',
		count: 1,
		test: 'app/web/lib/session/login-errors.test.ts',
	},
	{
		file: 'app/web/app/(internal)/invite/[token]/InviteClient.tsx',
		reason: 'анонимные проверка и принятие приглашения и вход после принятия: 401 входа не ведёт на /login',
		count: 3,
		test: 'app/web/lib/auth/invite-flow.test.ts',
	},
]

const SESSION_MODULE_TESTS = [
	'app/web/lib/session/client.test.ts',
	'app/web/lib/session/server.test.ts',
	'app/web/proxy.test.ts',
]

const BARE_FETCH = { label: 'голый fetch(', pattern: /(?:(?<![\w$.])|\b(?:window|globalThis|self)\.)fetch\s*\(/g }

const LINE_CHECKS = [
	{ label: 'локальный const …fetcher =', pattern: /\bconst\s+[\w$]*[fF]etcher\s*=(?!\s*fetcherWith\s*\()/g },
	{ label: 'apiFetch вне модуля сессии и модуля запросов', pattern: /\bapiFetch\b/g, outsideRequestModule: true },
	{ label: 'absoluteUrl', pattern: /\babsoluteUrl\b/g },
	{ label: 'x-forwarded-host', pattern: /x-forwarded-host/gi },
	{ label: "headers().get('host')", pattern: /\.get\(\s*['"\x60]host['"\x60]\s*\)/g },
	{ label: 'массив первым аргументом useSWR', pattern: /\buseSWR(?:Immutable|Infinite)?\s*(?:<[^()]*?>)?\s*\(\s*\[/g },
]

function toPosix(value) {
	return value.split(path.sep).join('/')
}

function collectWebSources(root) {
	const files = []
	const walk = (dir) => {
		if (!fs.existsSync(dir)) return
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(toPosix(path.relative(root, path.join(dir, entry.name))))
		}
	}
	walk(path.join(root, WEB_ROOT))
	return files.sort()
}

function lineOf(source, index) {
	return source.slice(0, index).split('\n').length
}

function matchesOf(pattern, source) {
	return [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => ({
		line: lineOf(source, match.index),
		text: source.split('\n')[lineOf(source, match.index) - 1].trim(),
	}))
}

function inRequestModule(file) {
	return REQUEST_MODULE_DIRS.some((dir) => file.startsWith(dir))
}

function webRequestViolations(root) {
	const violations = []
	for (const file of REMOVED_FILES) {
		if (fs.existsSync(path.join(root, file))) violations.push(`${file}: файл удалённого модуля запросов существует`)
	}
	for (const file of collectWebSources(root)) {
		const source = fs.readFileSync(path.join(root, file), 'utf8')
		for (const check of LINE_CHECKS) {
			if (check.outsideRequestModule && inRequestModule(file)) continue
			for (const hit of matchesOf(check.pattern, source)) {
				violations.push(`${file}:${hit.line}: ${check.label}: ${hit.text}`)
			}
		}
		if (inRequestModule(file)) continue
		const fetches = matchesOf(BARE_FETCH.pattern, source)
		const exception = FETCH_EXCEPTIONS.find((item) => item.file === file)
		if (!exception) {
			for (const hit of fetches) violations.push(`${file}:${hit.line}: ${BARE_FETCH.label}: ${hit.text}`)
			continue
		}
		if (fetches.length !== exception.count) {
			violations.push(
				`${file}: ${BARE_FETCH.label} ${fetches.length} раз, исключение D-07 разрешает ${exception.count}: ${fetches
					.map((hit) => hit.line)
					.join(', ')}`
			)
		}
	}
	return violations
}

function writeFile(root, file, content) {
	const target = path.join(root, file)
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.writeFileSync(target, content)
}

test('в app/web нет локальных fetcher, удалённых модулей, голого fetch(, apiFetch вне модуля, absoluteUrl, x-forwarded-host и ключей SWR массивом', () => {
	assert.deepEqual(webRequestViolations(REPO_ROOT), [])
})

test('каждое исключение D-07 существует, у него есть причина, точное число fetch( и тест с проверкой 401', () => {
	for (const exception of FETCH_EXCEPTIONS) {
		const file = path.join(REPO_ROOT, exception.file)
		assert.ok(fs.existsSync(file), `${exception.file} missing`)
		assert.ok(exception.reason.trim().length > 0, `${exception.file}: reason is empty`)
		const fetches = matchesOf(BARE_FETCH.pattern, fs.readFileSync(file, 'utf8'))
		assert.equal(fetches.length, exception.count, exception.file)
		const testFile = path.join(REPO_ROOT, exception.test)
		assert.ok(fs.existsSync(testFile), `${exception.test} missing`)
		assert.match(fs.readFileSync(testFile, 'utf8'), /\b401\b/, `${exception.test}: no 401 check`)
	}
})

test('тесты модуля сессии существуют и проверяют 401', () => {
	for (const file of SESSION_MODULE_TESTS) {
		const target = path.join(REPO_ROOT, file)
		assert.ok(fs.existsSync(target), `${file} missing`)
		assert.match(fs.readFileSync(target, 'utf8'), /\b401\b/, `${file}: no 401 check`)
	}
})

test('проба: каждое подмешанное нарушение ловится своим сообщением', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'web-requests-guards-'))
	try {
		const invite = FETCH_EXCEPTIONS[1].file
		const login = FETCH_EXCEPTIONS[0].file
		writeFile(tmp, login, "await fetch('/api/auth/login', {})\n")
		writeFile(
			tmp,
			invite,
			[1, 2, 3, 4].map((n) => `const r${n} = await fetch('/api/auth/invites/${n}')`).join('\n') + '\n'
		)
		writeFile(tmp, 'app/web/app/screen/Screen.tsx', 'const fetcher = (url: string) => requestJson(url)\n')
		writeFile(tmp, 'app/web/app/screen/Allowed.tsx', 'const usersFetcher = fetcherWith(parseUsers)\n')
		writeFile(tmp, 'app/web/lib/fetcher.ts', 'export {}\n')
		writeFile(tmp, 'app/web/components/Widget.tsx', "const r = await fetch('/api/users')\n")
		writeFile(tmp, 'app/web/components/Global.tsx', "const r = await globalThis.fetch('/api/users')\n")
		writeFile(
			tmp,
			'app/web/components/Fine.tsx',
			"apiClient.fetch('/x')\nrouter.prefetch('/x')\nconst a = await prefetch('/x')\n"
		)
		writeFile(tmp, 'app/web/app/screen/Api.tsx', "import { apiFetch } from '@/lib/session/client'\n")
		writeFile(tmp, 'app/web/lib/http/request.ts', "import { apiFetch } from '@/lib/session/client'\nfetch('/x')\n")
		writeFile(tmp, 'app/web/app/page/page.tsx', "const url = absoluteUrl('/api/users')\n")
		writeFile(tmp, 'app/web/lib/host.ts', "const host = h.get('X-Forwarded-Host')\n")
		writeFile(tmp, 'app/web/lib/host2.ts', "const host = (await headers()).get('host')\n")
		writeFile(tmp, 'app/web/app/screen/Tuple.tsx', 'const { data } = useSWR([url, parse], fetcher2)\n')
		writeFile(
			tmp,
			'app/web/app/screen/TupleWrapped.tsx',
			'const q = useSWR<Row[]>(\n\t\t[\n\t\turl,\n\t\tparse],\n\t\tf)\n'
		)
		writeFile(tmp, 'app/web/app/screen/Tuple.test.ts', "useSWR([url], f)\nfetch('/x')\n")

		const found = webRequestViolations(tmp)
		const expected = [
			/^app\/web\/lib\/fetcher\.ts: файл удалённого модуля запросов существует$/,
			/^app\/web\/app\/\(internal\)\/invite\/\[token\]\/InviteClient\.tsx: голый fetch\( 4 раз, исключение D-07 разрешает 3: 1, 2, 3, 4$/,
			/^app\/web\/app\/screen\/Screen\.tsx:1: локальный const …fetcher =: /,
			/^app\/web\/components\/Widget\.tsx:1: голый fetch\(: /,
			/^app\/web\/components\/Global\.tsx:1: голый fetch\(: /,
			/^app\/web\/app\/screen\/Api\.tsx:1: apiFetch вне модуля сессии и модуля запросов: /,
			/^app\/web\/app\/page\/page\.tsx:1: absoluteUrl: /,
			/^app\/web\/lib\/host\.ts:1: x-forwarded-host: /,
			/^app\/web\/lib\/host2\.ts:1: headers\(\)\.get\('host'\): /,
			/^app\/web\/app\/screen\/Tuple\.tsx:1: массив первым аргументом useSWR: /,
			/^app\/web\/app\/screen\/TupleWrapped\.tsx:1: массив первым аргументом useSWR: /,
		]
		for (const pattern of expected) {
			assert.equal(found.filter((line) => pattern.test(line)).length, 1, `${pattern}\n${found.join('\n')}`)
		}
		assert.equal(found.length, expected.length, found.join('\n'))
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})
