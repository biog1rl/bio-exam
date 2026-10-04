import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const WEB_ROOT = 'app/web'
const TEST_RUNNER = 'app/web/components/tests/TestRunner.tsx'
const BEFORE_UNLOAD_GUARD = 'app/web/lib/drafts/before-unload.ts'
const ATTEMPT_LIFECYCLE_DIR = 'app/web/components/tests/attempt-lifecycle'
const DRAFTS_DIR = 'app/web/lib/drafts'
const QUESTION_EDITOR_PAGE =
	'app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/questions/QuestionEditorPageClient.tsx'
const HOOK_FILES = new Set([
	`${ATTEMPT_LIFECYCLE_DIR}/use-attempt-lifecycle.ts`,
	`${DRAFTS_DIR}/use-question-draft-autosave.ts`,
])

const q = '\u0027'
const dq = '\u0022'

const TEST_RUNNER_CHECKS = [
	{
		label: 'localStorage: хранилище попытки ведёт модуль attempt-lifecycle',
		match: (line) => /\blocalStorage\b/.test(line),
	},
	{
		label: 'visibilitychange: видимость вкладки слушает хук модуля',
		match: (line) => line.includes('visibilitychange'),
	},
	{
		label: 'useDebouncedCallback: дебаунс ответов заменён журналом модуля',
		match: (line) => /\buseDebouncedCallback\b/.test(line),
	},
	{
		label: 'use-debounce: пакет дебаунса в TestRunner не нужен',
		match: (line) => line.includes('use-debounce'),
	},
	{
		label: 'setInterval: таймер попытки ведёт модуль',
		match: (line) => /\bsetInterval\b/.test(line),
	},
	{
		label: 'beforeunload: предупреждение при уходе только через lib/drafts/before-unload.ts',
		match: (line) => line.includes('beforeunload'),
	},
	{
		label: 'запасной пользователь anonymous: ключи попытки строятся от userId',
		match: (line) => line.includes(`${q}anonymous${q}`) || line.includes(`${dq}anonymous${dq}`),
	},
	{
		label: 'client-attempt-id: clientAttemptId создаёт модуль',
		match: (line) => line.includes('client-attempt-id'),
	},
	{
		label: 'storageKeysToClear: очистку ключей попытки ведёт модуль',
		match: (line) => /\bstorageKeysToClear\b/.test(line),
	},
	{
		label: 'isClientExpired: истечение сессии решает сервер',
		match: (line) => /\bisClientExpired\b/.test(line),
	},
	{
		label: 'setTimeout: отложенный ответ в TestRunner, ответ сразу пишет модуль',
		match: (line) => /\bsetTimeout\b/.test(line),
	},
	{
		label: 'saveAttemptDraft: черновик попытки отправляет модуль',
		match: (line) => /\bsaveAttemptDraft\b/.test(line),
	},
	{
		label: 'submitPublicTestAnswers: отправку попытки ведёт модуль',
		match: (line) => /\bsubmitPublicTestAnswers\b/.test(line),
	},
	{
		label: 'startTestSession: сессию попытки открывает модуль',
		match: (line) => /\bstartTestSession\b/.test(line),
	},
]

const TEST_RUNNER_REQUIRED = [
	{ label: 'вызов useAttemptLifecycle(', pattern: /\buseAttemptLifecycle\(/ },
	{ label: 'функция extractImagePaths', pattern: /\bfunction\s+extractImagePaths\b/ },
]

const BEFORE_UNLOAD_CHECKS = [
	{
		label: 'слушатель beforeunload вне lib/drafts/before-unload.ts',
		match: (line) =>
			line.includes(`${q}beforeunload${q}`) ||
			line.includes(`${dq}beforeunload${dq}`) ||
			/\bonbeforeunload\b/.test(line),
	},
]

const ATTEMPT_KEY_CHECKS = ['test-answers-wal-', 'test-session-', 'test-frozen-'].map((fragment) => ({
	label: `ключ попытки ${fragment} вне components/tests/attempt-lifecycle`,
	match: (line) => line.includes(fragment),
}))

const QUESTION_EDITOR_CHECKS = [
	{
		label: 'draftAutosaveTimerRef: автосохранение черновика ведёт lib/drafts',
		match: (line) => /\bdraftAutosaveTimerRef\b/.test(line),
	},
	{
		label: 'setTimeout(: таймер автосохранения в странице редактора',
		match: (line) => /\bsetTimeout\(/.test(line),
	},
	{
		label: 'lock version mismatch: серверную строку конфликта разбирает lib/drafts',
		match: (line) => /lock version mismatch/i.test(line),
	},
]

const MODULE_PURITY_CHECKS = [
	{
		label: 'импорт React: чистый модуль без React',
		match: (line) =>
			/(?:\bfrom\s+|\bimport\s+|\brequire\(\s*)['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(line) ||
			/\bimport\s*\(\s*['"]react(?:-dom)?(?:\/[^'"]*)?['"]/.test(line),
	},
	{
		label: 'localStorage: хранилище приходит швом из хука',
		match: (line) => /\blocalStorage\b/.test(line),
	},
	{
		label: 'document.: окружение браузера приходит швом из хука',
		match: (line) => /\bdocument\./.test(line),
	},
	{
		label: 'window.: окружение браузера приходит швом из хука',
		match: (line) => /\bwindow\./.test(line),
	},
	{
		label: 'setInterval: часы приходят швом',
		match: (line) => /\bsetInterval\b/.test(line),
	},
]

function toRelative(root, file) {
	return path.relative(root, file).split(path.sep).join('/')
}

function collectSources(root, relativeDir) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(toRelative(root, path.join(dir, entry.name)))
		}
	}
	const start = path.join(root, relativeDir)
	if (fs.existsSync(start)) walk(start)
	return files.sort()
}

function findLines(checks, source) {
	const hits = []
	source.split('\n').forEach((line, index) => {
		const labels = checks.filter((check) => check.match(line)).map((check) => check.label)
		if (labels.length > 0) hits.push({ line: index + 1, text: line.trim(), labels })
	})
	return hits
}

function formatHits(relative, hits) {
	return hits.map((hit) => `${relative}:${hit.line}: ${hit.labels.join(', ')}: ${hit.text}`)
}

function scanFiles(root, files, checks) {
	const violations = []
	for (const relative of files) {
		violations.push(...formatHits(relative, findLines(checks, fs.readFileSync(path.join(root, relative), 'utf8'))))
	}
	return violations
}

function testRunnerViolations(root) {
	const source = fs.readFileSync(path.join(root, TEST_RUNNER), 'utf8')
	const violations = formatHits(TEST_RUNNER, findLines(TEST_RUNNER_CHECKS, source))
	for (const required of TEST_RUNNER_REQUIRED) {
		if (!required.pattern.test(source)) violations.push(`${TEST_RUNNER}: нет ${required.label}`)
	}
	return violations
}

function beforeUnloadViolations(root) {
	const files = collectSources(root, WEB_ROOT).filter((file) => file !== BEFORE_UNLOAD_GUARD)
	return scanFiles(root, files, BEFORE_UNLOAD_CHECKS)
}

function attemptKeyViolations(root) {
	const files = collectSources(root, WEB_ROOT).filter((file) => !file.startsWith(`${ATTEMPT_LIFECYCLE_DIR}/`))
	return scanFiles(root, files, ATTEMPT_KEY_CHECKS)
}

function questionEditorViolations(root) {
	return scanFiles(root, [QUESTION_EDITOR_PAGE], QUESTION_EDITOR_CHECKS)
}

function pureModuleFiles(root) {
	return [ATTEMPT_LIFECYCLE_DIR, DRAFTS_DIR]
		.flatMap((dir) => collectSources(root, dir))
		.filter((file) => !HOOK_FILES.has(file))
}

function modulePurityViolations(root) {
	return scanFiles(root, pureModuleFiles(root), MODULE_PURITY_CHECKS)
}

function matchesAny(checks, sample) {
	return findLines(checks, sample).length > 0
}

test('детекторы находят запрещённые строки и пропускают разрешённые', () => {
	for (const sample of [
		`const raw = localStorage.getItem(${q}k${q})`,
		`document.addEventListener(${q}visibilitychange${q}, onChange)`,
		'const save = useDebouncedCallback(send, 500)',
		`import { useDebouncedCallback } from ${q}use-debounce${q}`,
		'const id = setInterval(tick, 1000)',
		`window.addEventListener(${q}beforeunload${q}, guard)`,
		`const uid = me?.id ?? ${q}anonymous${q}`,
		`import { getClientAttemptId } from ${q}./client-attempt-id${q}`,
		'for (const key of storageKeysToClear(test.id)) remove(key)',
		'if (isClientExpired(session)) reset()',
		'const timer = setTimeout(() => lifecycle.answer(questionId, value), 300)',
		'const timer = window.setTimeout(flush, 300)',
		`import { saveAttemptDraft } from ${q}@/lib/tests/api${q}`,
		'await saveAttemptDraft(test.id, sessionId, body, { keepalive: false })',
		'const view = await submitPublicTestAnswers(test.id, request)',
		'const session = await startTestSession(test.id)',
	]) {
		assert.ok(matchesAny(TEST_RUNNER_CHECKS, sample), sample)
	}
	for (const sample of [
		'const { lifecycle, snapshot } = useAttemptLifecycle({ test, questions, userId, onNotice })',
		'const anonymousCount = 0',
		'const view = saveIndicatorView(snapshot)',
		'void lifecycle.submit()',
		'void lifecycle.confirmStart()',
		'lifecycle.answer(questionId, value)',
	]) {
		assert.ok(!matchesAny(TEST_RUNNER_CHECKS, sample), sample)
	}
	assert.ok(matchesAny(BEFORE_UNLOAD_CHECKS, `win.addEventListener(${dq}beforeunload${dq}, handler)`))
	assert.ok(matchesAny(BEFORE_UNLOAD_CHECKS, 'window.onbeforeunload = () => true'))
	assert.ok(!matchesAny(BEFORE_UNLOAD_CHECKS, 'const guard = createBeforeUnloadGuard(window)'))
	assert.ok(matchesAny(ATTEMPT_KEY_CHECKS, 'const key = `test-answers-wal-${testId}-${userId}`'))
	assert.ok(matchesAny(ATTEMPT_KEY_CHECKS, 'const key = `test-session-${testId}-${userId}`'))
	assert.ok(matchesAny(ATTEMPT_KEY_CHECKS, 'const key = `test-frozen-${testId}-${userId}`'))
	assert.ok(!matchesAny(ATTEMPT_KEY_CHECKS, 'const keys = attemptStorageKeys(testId, userId)'))
	assert.ok(matchesAny(QUESTION_EDITOR_CHECKS, 'draftAutosaveTimerRef.current = null'))
	assert.ok(matchesAny(QUESTION_EDITOR_CHECKS, 'const timer = setTimeout(save, 800)'))
	assert.ok(matchesAny(QUESTION_EDITOR_CHECKS, `if (message.includes(${q}Lock version mismatch${q})) reload()`))
	assert.ok(!matchesAny(QUESTION_EDITOR_CHECKS, 'const autosave = useQuestionDraftAutosave(options)'))
	for (const sample of [
		`import { useEffect } from ${q}react${q}`,
		`import React from ${dq}react${dq}`,
		`import ${q}react${q}`,
		`const { useState } = require(${q}react${q})`,
		`import { flushSync } from ${q}react-dom${q}`,
		`import { jsx } from ${q}react/jsx-runtime${q}`,
		`const raw = localStorage.getItem(${q}k${q})`,
		'const hidden = document.visibilityState',
		'window.addEventListener(type, listener)',
		'const id = setInterval(tick, 1000)',
	]) {
		assert.ok(matchesAny(MODULE_PURITY_CHECKS, sample), sample)
	}
	for (const sample of [
		`import { useSWR } from ${q}swr${q}`,
		`import { toast } from ${q}react-toastify${q}`,
		'const storage: ClientAttemptStorage = deps.storage',
		'win.addEventListener(type, listener)',
		'const timer = clock.setTimeout(tick, 1000)',
	]) {
		assert.ok(!matchesAny(MODULE_PURITY_CHECKS, sample), sample)
	}
})

test('TestRunner только рисует: нет хранилища, видимости, дебаунса, интервалов и проверки истечения на клиенте', () => {
	assert.ok(fs.existsSync(path.join(REPO_ROOT, TEST_RUNNER)), TEST_RUNNER)
	assert.deepEqual(testRunnerViolations(REPO_ROOT), [])
})

test('слушатель beforeunload в app/web объявлен только в lib/drafts/before-unload.ts', () => {
	const files = collectSources(REPO_ROOT, WEB_ROOT)
	assert.ok(files.length >= 100, `${WEB_ROOT}: просканировано файлов: ${files.length}`)
	assert.ok(
		/['"]beforeunload['"]/.test(fs.readFileSync(path.join(REPO_ROOT, BEFORE_UNLOAD_GUARD), 'utf8')),
		`${BEFORE_UNLOAD_GUARD}: нет слушателя beforeunload`
	)
	assert.deepEqual(beforeUnloadViolations(REPO_ROOT), [])
})

test('ключи попытки test-answers-wal-, test-session-, test-frozen- в app/web только в components/tests/attempt-lifecycle', () => {
	const owned = collectSources(REPO_ROOT, ATTEMPT_LIFECYCLE_DIR)
	assert.ok(
		owned.some((file) => /test-answers-wal-/.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))),
		`${ATTEMPT_LIFECYCLE_DIR}: нет ключа test-answers-wal-`
	)
	assert.deepEqual(attemptKeyViolations(REPO_ROOT), [])
})

test('в QuestionEditorPageClient.tsx нет прежнего таймера автосохранения и строки lock version mismatch', () => {
	assert.ok(fs.existsSync(path.join(REPO_ROOT, QUESTION_EDITOR_PAGE)), QUESTION_EDITOR_PAGE)
	assert.deepEqual(questionEditorViolations(REPO_ROOT), [])
})

test('модули attempt-lifecycle и lib/drafts вне хуков не импортируют React и не трогают окружение браузера', () => {
	for (const file of HOOK_FILES) {
		assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), file)
	}
	const files = pureModuleFiles(REPO_ROOT)
	assert.ok(files.length >= 10, `просканировано файлов: ${files.length}`)
	assert.deepEqual(modulePurityViolations(REPO_ROOT), [])
})

test('проба: вставка запрещённой строки в копию файла во временном каталоге даёт нарушение с путём файла', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-durability-guards-'))
	const probeModule = `${DRAFTS_DIR}/save-queue.ts`
	const before = {
		runner: fs.readFileSync(path.join(REPO_ROOT, TEST_RUNNER), 'utf8'),
		module: fs.readFileSync(path.join(REPO_ROOT, probeModule), 'utf8'),
	}
	try {
		const copyWith = (relative, line, prepend = false) => {
			const target = path.join(tmp, relative)
			const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8')
			fs.mkdirSync(path.dirname(target), { recursive: true })
			fs.writeFileSync(target, prepend ? `${line}\n${source}` : `${source}\n${line}\n`)
		}
		copyWith(TEST_RUNNER, `const probeAnswers = localStorage.getItem(${q}probe${q})`)
		copyWith(probeModule, `import { useRef } from ${q}react${q}`, true)

		const runner = testRunnerViolations(tmp)
		assert.equal(runner.length, 1, runner.join('\n'))
		assert.match(runner[0], /^app\/web\/components\/tests\/TestRunner\.tsx:\d+: .*localStorage/)

		copyWith(TEST_RUNNER, 'const probeTimer = setTimeout(() => lifecycle.answer(probeId, probeValue), 300)')
		const delayed = testRunnerViolations(tmp)
		assert.equal(delayed.length, 1, delayed.join('\n'))
		assert.match(delayed[0], /^app\/web\/components\/tests\/TestRunner\.tsx:\d+: .*setTimeout/)

		copyWith(
			TEST_RUNNER,
			`import { saveAttemptDraft, startTestSession, submitPublicTestAnswers } from ${q}@/lib/tests/api${q}`,
			true
		)
		const direct = testRunnerViolations(tmp)
		assert.equal(direct.length, 1, direct.join('\n'))
		assert.match(
			direct[0],
			/^app\/web\/components\/tests\/TestRunner\.tsx:1: .*saveAttemptDraft.*submitPublicTestAnswers.*startTestSession/
		)

		const purity = modulePurityViolations(tmp)
		assert.equal(purity.length, 1, purity.join('\n'))
		assert.match(purity[0], /^app\/web\/lib\/drafts\/save-queue\.ts:1: .*импорт React/)

		assert.equal(fs.readFileSync(path.join(REPO_ROOT, TEST_RUNNER), 'utf8'), before.runner)
		assert.equal(fs.readFileSync(path.join(REPO_ROOT, probeModule), 'utf8'), before.module)
		assert.deepEqual(testRunnerViolations(REPO_ROOT), [])
		assert.deepEqual(modulePurityViolations(REPO_ROOT), [])
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
})
