# Phase 3: Exam core - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 41 (новых и изменяемых)
**Analogs found:** 36 / 41 (5 без аналога, см. «No Analog Found»)

Все пути ниже отслеживаются git в HEAD 7a6f95a, если не помечено «не в HEAD» (файлы фазы 2 в рабочем дереве). Зеркал `.gsd/capabilities` в аналогах нет. Номера строк сняты с рабочего дерева.

## File Classification

### Новые файлы пакета

| Новый файл | Роль | Поток данных | Ближайший аналог | Качество |
|------------|------|--------------|------------------|----------|
| `packages/exam-core/package.json` | config | - | `packages/rbac/package.json` | exact |
| `packages/exam-core/tsdown.config.ts` | config | - | `packages/rbac/tsdown.config.ts` | exact |
| `packages/exam-core/tsconfig.json` | config | - | `packages/rbac/tsconfig.json` | exact |
| `packages/exam-core/vitest.config.ts` | config | - | `packages/rbac/vitest.config.ts` | exact |
| `packages/exam-core/src/index.ts` | barrel | - | `packages/rbac/src/index.ts` | exact |
| `packages/exam-core/src/registry.ts` (шаблоны, метрики, схема правила, `BUILTIN_QUESTION_TYPES`) | model | transform | `app/server/src/lib/tests/question-types.ts` | exact (перенос) |
| `packages/exam-core/src/normalize.ts` (нормализация) | utility | transform | `app/server/src/lib/tests/scoring.ts:72-118` | exact (перенос) |
| `packages/exam-core/src/adapters/*.ts` (ошибки, вердикты, ключ, ответ, answered; по шаблону) | service | transform | `scoring.ts:120-190` + `question-type-resolver.ts:182-277` + `TestRunner.tsx:65-83` + `attempt-review-utils.ts:29-96` | role-match (слияние четырёх копий) |
| `packages/exam-core/src/scoring.ts` (ошибки -> баллы, `scoreQuestion`) | utility | transform | `app/server/src/lib/tests/scoring.ts:208-313` | exact (перенос) |
| `packages/exam-core/src/validate.ts` (проверка ключа, тексты ошибок, склонение) | service | request-response | `question-type-resolver.ts:182-277` + `QuestionEditorPageClient.tsx:114-166` | role-match |
| `packages/exam-core/src/submit-result.ts` | model | - | `app/server/src/lib/tests/submit-result.ts` | exact (перенос) |
| `packages/exam-core/src/telemetry.ts` | utility | transform | `app/server/src/lib/tests/telemetry.ts` + `app/web/components/tests/telemetry.ts:1-27` | exact (перенос) |
| `packages/exam-core/src/*.test.ts` (табличные) | test | transform | `app/server/src/lib/tests/scoring.test.ts`, `telemetry.test.ts` | role-match |
| `packages/exam-core/src/invariants.test.ts` (все части верны <=> 0 ошибок) | test | transform | `scoring.test.ts` (форма) | partial |
| `app/server/src/lib/tests/parity.test.ts` (старая `scoreQuestionByType` против пакета) | test | transform | `scoring.test.ts` | partial |

### Проводка сборки и документация

| Файл | Роль | Поток | Аналог | Качество |
|------|------|-------|--------|----------|
| `scripts/check-exam-core-dist.mjs` (или обобщение `check-rbac-dist.mjs`) | utility | file-I/O | `scripts/check-rbac-dist.mjs` | exact |
| `.github/workflows/ci.yml` (job `build`) | config | - | `ci.yml:73-76` (шаги rbac) | exact |
| `scripts/check-ci-workflow.mjs` (`JOB_ORDER.build`) | config | - | `check-ci-workflow.mjs:55-62` | exact |
| `app/web/vercel.json` | config | - | сам файл (`buildCommand`) | exact |
| `app/server/vercel-build.cjs` | config | - | сам файл (`run('yarn workspace @bio-exam/rbac build')`) | exact |
| `scripts/e2e.mjs` | config | batch | `e2e.mjs:142-143` | exact |
| `app/web/package.json`, `app/server/package.json` | config | - | `app/server/package.json:22` | exact |
| `AGENTS.md`, `README.md`, `app/server/README.md` | docs | - | сами файлы | exact |

### Server (переключение, D-16 п.4)

| Файл | Роль | Поток | Аналог | Качество |
|------|------|-------|--------|----------|
| `app/server/src/lib/tests/scoring.ts` (удалить `:72-313`, остаётся/уходит legacy `:12-70` по D-19: не трогать) | utility | transform | перенос в пакет | - |
| `app/server/src/lib/tests/question-types.ts` | model | - | удалить, реэкспорт или импорт из пакета | - |
| `app/server/src/lib/tests/question-type-resolver.ts` | service | CRUD | DB-часть `:100-150` остаётся, `:152-300` в пакет | - |
| `app/server/src/schemas/tests.ts` | model | request-response | `:47-199`, `:250-279` | - |
| `app/server/src/routes/tests/index.ts`, `public.ts` | controller | request-response | сами файлы | - |
| `app/server/src/db/schema.ts` (`import type`) | model | CRUD | `schema.ts:15-28` | exact |
| `app/server/src/db/` тип колонки `answer_keys.correct_answer` (D-11) | model | CRUD | `schema.ts:427-445` | no analog (см. ниже) |
| Новые DB-тесты (ключи; сохранение/submit через `app.ts`) | test | CRUD / request-response | `app/server/src/db/timestamps.test.ts` + `test-support/test-database.ts`; HTTP: `test-support/http.ts` (не в HEAD) и `routes/uploads.test.ts` (не в HEAD) | exact / exact |

### Web (переключение, D-16 п.5)

| Файл | Роль | Поток | Аналог |
|------|------|-------|--------|
| `app/web/lib/tests/types.ts` | model | - | типы из пакета |
| `admin/tests/types/index.ts` | model | transform | `:70-125`, `:273-324` в пакет |
| `QuestionEditorPageClient.tsx`, `test-editor-utils.ts`, `QuestionEditor.tsx` | component/utility | request-response | вызов адаптера пакета |
| `TestRunner.tsx` (`isAnswered`), `attempt-review-utils.ts`, `telemetry.ts` | utility | transform | то же |
| `attempt-review/QuestionAnswerReview.tsx` | component | transform | сам файл (ветка `TextAnswerReview`) |
| Красный Vitest D5 (новый файл, например `admin/tests/.../validate-question.test.ts`) | test | transform | образец `KNOWN_HOLES` |
| `e2e/tests/review.spec.ts`, `e2e/tests/authoring.spec.ts` | test | e2e | сами файлы |

---

## Pattern Assignments

### `packages/exam-core/package.json`

**Analog:** `packages/rbac/package.json` (весь файл, 37 строк). Копировать целиком, поменять `name`, добавить `dependencies`.

```json
{
	"name": "@bio-exam/rbac",
	"version": "0.0.1",
	"private": true,
	"files": ["dist"],
	"type": "module",
	"main": "./dist/index.cjs",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js",
			"require": "./dist/index.cjs",
			"default": "./dist/index.js"
		}
	},
	"scripts": {
		"build": "tsdown", "clean": "rimraf dist", "watch": "tsdown --watch",
		"typecheck": "tsc --noEmit", "test": "vitest run",
		"lint": "oxlint -c ../../.oxlintrc.json src"
	},
	"devDependencies": {
		"oxlint": "1.86.0", "rimraf": "^5.0.5", "tsdown": "0.23.0",
		"typescript": "^5.6.3", "vite": "8.3.2", "vitest": "5.0.3"
	}
}
```

Добавить `"dependencies": { "zod": "^3.24.3" }` (D-01; в `yarn.lock` одна версия zod 3.25.76, проверить `yarn why zod`). У rbac зависимостей нет, это единственное отличие.

### `packages/exam-core/tsdown.config.ts`, `tsconfig.json`, `vitest.config.ts`

**Analog:** одноимённые файлы `packages/rbac/`. Копировать без изменений (в комментарии tsdown.config.ts объясняется `fixedExtension: false`; правило проекта «без комментариев в коде» относится к новому коду, но при копировании комментарий можно не переносить).

```ts
export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	outDir: 'dist',
	dts: true,
	clean: true,
	fixedExtension: false,
})
```

```ts
export default defineConfig({
	test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
```

tsconfig rbac: `module: ESNext`, `moduleResolution: Bundler`, `strict`, `verbatimModuleSyntax`, `rootDir: src`, `include: ["src/**/*.ts"]`. Из-за `verbatimModuleSyntax` типы импортируются только через `import type`.

### Подключение пакета приложениями (D-02)

**Analog:** `app/server/package.json:22` — `"@bio-exam/rbac": "workspace:*"`. Web сейчас `app/web/package.json:16` — `"@bio-exam/rbac": "*"` (в Discretion: перевести на `workspace:*`). Для exam-core в обоих: `"@bio-exam/exam-core": "workspace:*"`. Резолв идёт через `dist`, поэтому `vitest.config.ts` приложений alias на пакет не содержит и не должен (`app/web/vitest.config.ts` знает только alias `@`). Turbo `^build` уже собирает зависимости перед `test`/`typecheck`.

### Прод-сборка Vercel

**Analog `app/web/vercel.json`:**
```json
"buildCommand": "yarn --cwd ../.. workspace @bio-exam/rbac build && yarn build:dev",
```
Станет `... rbac build && yarn --cwd ../.. workspace @bio-exam/exam-core build && yarn build:dev`.

**Analog `app/server/vercel-build.cjs`** (строки с `console.log('packages/rbac ...')` и `run(...)`):
```js
console.log('\n=== Building @bio-exam/rbac ===')
run('yarn workspace @bio-exam/rbac build', rootDir)
```
Добавить такой же блок для exam-core перед сборкой server. Файл CJS, отступ табами, `run(cmd, cwd)` уже есть.

### `scripts/e2e.mjs`

**Analog:** `scripts/e2e.mjs:142-143`.
```js
await runStep('build packages/rbac', 'yarn', ['workspace', '@bio-exam/rbac', 'build'], isolatedChildEnv({}))
```
Добавить второй `runStep('build packages/exam-core', ...)` следом; обновить комментарий и шапку (`:4`, `:11`), где упомянут rbac.

### `.github/workflows/ci.yml` и `scripts/check-ci-workflow.mjs`

**Analog `ci.yml:73-76`:**
```yaml
      - name: Build rbac
        run: yarn workspace @bio-exam/rbac build
      - name: Check rbac dist
        run: node scripts/check-rbac-dist.mjs
```
**Analog `check-ci-workflow.mjs` `JOB_ORDER.build`:**
```js
build: [
	{ label: 'yarn workspace @bio-exam/rbac build', pattern: /run:\s*yarn workspace @bio-exam\/rbac build\b/ },
	{ label: 'check-rbac-dist', pattern: /run:\s*node scripts\/check-rbac-dist\.mjs\b/ },
	{ label: 'yarn workspace @bio-exam/server build', ... },
```
Шаги идут «каждая строка после предыдущей». Новые шаги exam-core вставлять между `check-rbac-dist` и `server build` в обоих файлах одновременно, иначе `ci-workflow` в `yarn verify` падает. Проверить, нет ли теста на `check-ci-workflow` (`scripts/*.test.mjs`), который фиксирует список.

### `scripts/check-exam-core-dist.mjs`

**Analog:** `scripts/check-rbac-dist.mjs` (шапка, `REQUIRED_FILES`, `EXPECTED_EXPORTS`, `diffNames`, сравнение ESM и CJS):
```js
const DIST_DIR = fileURLToPath(new URL('../packages/rbac/dist/', import.meta.url))
const REQUIRED_FILES = ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']
const esmNames = Object.keys(await import(pathToFileURL(path.join(DIST_DIR, 'index.js')).href)).sort()
const cjsNames = Object.keys(createRequire(import.meta.url)(path.join(DIST_DIR, 'index.cjs'))).sort()
```
Для exam-core нужен `EXPECTED_EXPORTS`: список имён публичного API (эталон: зафиксировать после реализации). Если обобщать на оба пакета: параметризовать `{ dir, expected }`. Важно: ESM `dist/index.js` с зависимостью `zod` грузится из `node_modules`, поэтому проверку запускать после `yarn install`.

### Реестр шаблонов и схемы правил -> `packages/exam-core/src/registry.ts`

**Analog:** `app/server/src/lib/tests/question-types.ts:1-60` (читать файл целиком при реализации: там ещё `createDefaultScoringRuleForTemplate`, `defaultMistakeMetricForTemplate`, схема определения типа, `BUILTIN_QUESTION_TYPES`).

```ts
export const QUESTION_UI_TEMPLATES = ['single_choice','multi_choice','matching','short_text','sequence_digits'] as const
export type QuestionUiTemplate = (typeof QUESTION_UI_TEMPLATES)[number]
export const MISTAKE_METRICS = ['boolean_correct','set_distance','pair_mismatch_count','compact_text_equal','compact_text_in_set','hamming_digits'] as const
export const ALLOWED_MISTAKE_METRICS_BY_TEMPLATE: Record<QuestionUiTemplate, MistakeMetric[]> = { ... }
export const SCORING_FORMULAS = ['exact_match', 'one_mistake_partial', 'tiers'] as const
export const QuestionTypeScoringRuleSchema = z.object({...}).superRefine(...)
```
Это вторая копия того же реестра: `admin/tests/types/index.ts:70-125` (`ALLOWED_MISTAKE_METRICS_BY_TEMPLATE`, `createDefaultQuestionTypeScoringRule`). Пакет одна копия; обе файла превращаются в импорт. Литералы шаблонов в `z.enum` в `routes/tests/index.ts:96`, `:105` заменяются на `z.enum(QUESTION_UI_TEMPLATES)`.

Подписи `TEMPLATE_META`, `MISTAKE_METRIC_LABELS`, `MISTAKE_METRIC_DESCRIPTIONS` (Discretion): `Record<MistakeMetric, string>` в `admin/tests/types/index.ts:81-100`. Тип `Record<MistakeMetric, ...>` обеспечивает исчерпываемость при импорте `MistakeMetric` из пакета. Описание `hamming_digits` (`:100`) меняется по UI-SPEC.

### Нормализация и ошибки -> `packages/exam-core/src/normalize.ts`, `adapters/*`

**Analog (перенос):** `app/server/src/lib/tests/scoring.ts:72-190`. Ключевое поведение, которое табличные тесты обязаны закрепить (D-05, D-12):

```ts
function normalizeIdValue(value: unknown): string | null {
	if (typeof value === 'string') return value
	if (typeof value === 'number' && Number.isFinite(value)) return String(value)
	if (typeof value === 'bigint') return value.toString()
	return null
}
function countSequenceMistakes(userAnswer, correctAnswer): number {
	...
	if (correctSequence.length > 3 && userSequence.length === correctSequence.length && mismatchedIndexes.length === 2) {
		const isSingleAdjacentSwap = secondIndex === firstIndex + 1 &&
			userSequence[firstIndex] === correctSequence[secondIndex] &&
			userSequence[secondIndex] === correctSequence[firstIndex]
		if (isSingleAdjacentSwap) return 1
	}
	return mistakes
}
```
Рассогласование и непригодный ввод даёт `Number.MAX_SAFE_INTEGER` (`countShortAnswerMistakes`, `countShortAnswerVariantsMistakes`, `countCheckboxMistakes`, `countMatchingMistakes`): D-12 оставляет это и закрепляет строкой таблицы. `countRadioMistakes` вместо этого даёт 1. `set_distance` = `Math.max(missingCount, extraCount)`.

Вердикты по частям (D-07) берут за основу текущие копии:
- `app/web/components/tests/attempt-review/QuestionAnswerReview.tsx:24-195` (подсветка выбора и пар),
- `attempt-review-utils.ts:29-96` (`answerIds`, `getChoiceOptionReviewRows`, `formatAnswerLines`),
- `TestRunner.tsx:65-83` (`isAnswered`).

Новая функция вердиктов последовательности без аналога (см. «No Analog Found»); исходная формула для порогов в `scoring.ts:145-170`.

Единая точка входа адаптера (форма на усмотрение планировщика), рекомендуется описать в виде объекта с функциями, ключом по `QuestionUiTemplate`, чтобы `Record<QuestionUiTemplate, Adapter>` давал исчерпываемость при добавлении шаблона (аналог приёма: `Record<MistakeMetric, string>` выше и `ALLOWED_MISTAKE_METRICS_BY_TEMPLATE`).

### Оценка баллов -> `packages/exam-core/src/scoring.ts`

**Analog:** `app/server/src/lib/tests/scoring.ts:208-313` (`scoreByRule`, `normalizeRule`, `scoreQuestionByType`). Перенести сигнатуру и тип результата как есть (паритет D-15 требует тех же входов и выходов):

```ts
export type ScoreQuestionResult = { maxPoints: number; earnedPoints: number; isCorrect: boolean; mistakesCount: number }
export function scoreQuestionByType(input: { questionType; userAnswer; correctAnswer; fallbackMaxPoints; questionTypesMap }): ScoreQuestionResult
```
Если типа нет в карте: `earnedPoints: 0, isCorrect: false, mistakesCount: Number.MAX_SAFE_INTEGER`. Неразрешённая метрика: `normalizeRule` подставляет правило шаблона по умолчанию с `fallbackMaxPoints`. Это поведение для паритета не менять.

Важно: `RuntimeQuestionTypeConfig.scoringRule` имеет тип `unknown` и разбирается `safeParse`; в пакет переносится вместе. DB-часть (`RuntimeQuestionType` из `question-type-resolver.ts:100-150`) остаётся на сервере и использует типы пакета.

### Схема результата попытки и телеметрия

**Analog `app/server/src/lib/tests/submit-result.ts`** (перенос целиком, 26 строк; `SubmitResultItemSchema`, `SubmitResultSchema` без новых полей, D-03).

**Analog `app/server/src/lib/tests/telemetry.ts`** (перенос, 20 строк):
```ts
export function mergeTelemetryMaps(...snapshots: Array<TelemetryMap | null | undefined>): TelemetryMap {
	const merged: TelemetryMap = {}
	for (const snapshot of snapshots) {
		if (!snapshot) continue
		for (const [questionId, entry] of Object.entries(snapshot)) {
			const current = merged[questionId]
			merged[questionId] = current ? { timeSpentMs: Math.max(...), focusLossCount: Math.max(...), visitCount: Math.max(...) } : { ...entry }
```
В пакете типы `QuestionTelemetry` и `TelemetryMap` объявляются здесь (сейчас: `app/server/src/db/schema.ts:20-28`, `app/web/components/tests/telemetry.ts:1-27`). Строка `import type { TelemetryMap } from '../../db/schema.js'` в копии исчезает. Схема записи телеметрии из `public.ts:34-43` (zod) переезжает рядом; конверты `SubmitAnswersSchema` и `SaveDraftAnswerSchema` остаются.

Веб-копия: `app/web/components/tests/telemetry.ts:1-27` (типы и слияние) заменяется импортом, редьюсеры `:29-76` остаются (Phase 6). Тест `app/web/components/tests/telemetry.test.ts` и серверный `telemetry.test.ts` переносятся строками таблицы. Формат серверного теста:
```ts
import assert from 'node:assert/strict'
import { test } from 'vitest'
test('mergeTelemetryMaps: берёт максимумы по вопросам и добавляет новые вопросы', () => {
	assert.deepEqual(mergeTelemetryMaps({...}, {...}), {...})
})
```

### Табличные тесты пакета (`packages/exam-core/src/*.test.ts`)

**Analog:** `app/server/src/lib/tests/scoring.test.ts` (428 строк). Шапка и карта типов, которую переиспользовать как фикстуру `builtinTypesMap`:
```ts
import assert from 'node:assert/strict'
import { test } from 'vitest'
const builtinTypesMap = {
	radio: { key: 'radio', uiTemplate: 'single_choice' as const,
		scoringRule: { formula: 'exact_match' as const, mistakeMetric: 'boolean_correct' as const, correctPoints: 1 } },
	checkbox: {... 'set_distance', correctPoints: 2, oneMistakePoints: 1 },
	matching: {... 'pair_mismatch_count' ...},
	short_answer: {... 'compact_text_equal' ...},
	sequence: {... 'hamming_digits' ...},
}
```
Сейчас тесты поштучные `test('sequence: одна ошибка', () => {...})`. Для пакета перейти на `test.each` (vitest 5.0.3) с строками `(тип, ключ, ответ) -> {ошибки, баллы, вердикты}`; названия по-русски. Строки из:
- `scoring.test.ts` (sequence `:122-175`: точный `2314`, одна ошибка `2315`, несколько `2415`, соседняя перестановка `12354` на `12345` = 1 балл, несоседняя `14325` = 0),
- `question-type-resolver.test.ts` (карта `short_answer_variants` с `compact_text_in_set`, `validateQuestionWithType`),
- `schemas/tests.test.ts`,
- `AttemptQuestionsList.test.ts`, `attempt-review-utils.test.ts`,
- оба `telemetry.test.ts`.

Новая строка D2: ключ `1243`, ответ `1234`, длина 4: ошибок 1, вердикты `[correct, correct, swapped, swapped]` (одна единица ошибки), баллы 1 (`oneMistakePoints`).

Инвариант D-07 «все части верны <=> 0 ошибок»: один общий `describe`, который обходит все таблицы (экспортировать массивы строк из `*.cases.ts` рядом с тестами, а не дублировать).

Тест паритета (D-15) в `app/server/src/lib/tests/`: импортирует старую `scoreQuestionByType` из `./scoring.js` и новую из `@bio-exam/exam-core`, генерирует входы (все перестановки длиной 2-5, числовые и строковые id, пустые и `null`). Удаляется вместе с копией (D-17).

### Сервер: проверка ключа при сохранении (D-09, D-13)

**Analog (заменяемый):** `question-type-resolver.ts:182-277` `validateByTemplate` и `validateQuestionWithType` (экспорт остаётся тонкой обёрткой над DB-картой):
```ts
export function validateQuestionWithType(question, typesMap): string | null {
	const resolvedType = typesMap[question.type]
	if (!resolvedType) return `Неизвестный тип вопроса: ${question.type}`
	if (!resolvedType.isActive) return `Тип вопроса отключён: ${resolvedType.title}`
	return validateByTemplate({ template: resolvedType.uiTemplate, mistakeMetric: resolvedType.scoringRule.mistakeMetric,
		validationSchema: resolvedType.validationSchema, options: question.options, matchingPairs: question.matchingPairs, correct: question.correct })
}
```
Проверки «неизвестный тип» и «тип отключён» остаются на сервере (это DB-слой), `validateByTemplate` заменяется вызовом адаптера. Тексты ошибок: адаптер использует формулировки web (UI-SPEC, таблица «Тексты»), поэтому серверные тесты, ожидающие старые тексты (`Нужно минимум 2 варианта ответа`, `Максимум вариантов: N`), надо обновить в том же плане. Текущий юнит-тест мокает БД:
```ts
vi.mock('../../db/index.js', () => ({ db: {} }))
```
Сохранить этот приём, пока `question-type-resolver.ts` импортирует `db`.

Точки вызова: `/save` `routes/tests/index.ts:1396` (глобальная карта), POST `:1724` и PATCH `:1864` (карта теста с переопределениями).

**zod-слой:** `schemas/tests.ts:47-199` (`QuestionSchema.superRefine` по ключу типа) и `:250-279` сокращаются до формы payload (`CorrectAnswerSchema`). Тест `schemas/tests.test.ts` переносится в пакет, оставшаяся форма payload тестируется там же.

### Сервер: чтение ключа, D-11 (`answer_keys.correct_answer`)

**Analog тестов:** `app/server/src/db/timestamps.test.ts` (DB-регрессия на scratch-базе). Шаблон:
```ts
import { afterAll, beforeAll, describe, test } from 'vitest'
import { createScratchDatabase, migrateTestDatabase, requireTestDatabaseUrl, type ScratchDatabase } from '../test-support/test-database.js'
let scratch: ScratchDatabase | null = null
beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_ts')
	await migrateTestDatabase(scratch.url)
}, 60_000)
afterAll(async () => { await scratch?.drop() })
```
Подключение: `new Pool({ connectionString: scratch.url })`, `drizzle(pool, { schema })`, `pool.end()` в `finally`. Тест D-14: вставить ключи `"3142"`, `"1.50"`, `"true"`, `"митоз"` (нужны строки `topics`/`tests`/`questions` ради FK; сидовые помощники можно взять из `app/server/src/scripts/e2e-seed.ts` или `routes/uploads.test.ts`, не в HEAD, смотреть там), проверить `SELECT jsonb_typeof(correct_answer)` = `'string'` сырым запросом `pool.query`, затем `db.select().from(schema.answerKeys)` и `assert.equal(typeof row.correctAnswer, 'string')`. Красное состояние помечается `test.fails` (см. ниже), запуск через `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`.

**Аналог места правки:** `db/schema.ts:427-445`, строка `correctAnswer: jsonb('correct_answer').notNull(), // string | string[] | Record<string, string>`. Выбор способа (свой `customType`, `::text`) за планировщиком; условие: `drizzle-kit` не предлагает миграцию (`yarn verify` шаг `migrations`). Все места чтения: `public.ts:761-766` (пример: `db.select().from(answerKeys).where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))`), `routes/tests/index.ts:1008-1014`, `:1313-1319`, `:2381-2392`, `:2428-2439`, `:2697-2708`.

### Типы в `app/server/src/db/schema.ts` (D-02)

**Analog:** `schema.ts:15-28`, текущий приём:
```ts
import type { QuestionTypeScoringRule, QuestionUiTemplate } from '../lib/tests/question-types.js'
import type { TestScoringRules } from '../lib/tests/scoring.js'
export type QuestionTelemetry = {...}
export type TelemetryMap = Record<string, QuestionTelemetry>
```
Заменить пути на `from '@bio-exam/exam-core'`, `QuestionTelemetry`/`TelemetryMap` реэкспортировать оттуда или удалить и поправить импортёров. Только `import type`: drizzle-kit загружает `schema.ts` и не должен тянуть runtime пакета. `TestScoringRules` не трогать (D-19 отложен).

### Серверные HTTP-характеризации (D-14)

**Analog:** `app/server/src/routes/uploads.test.ts` и `app/server/src/test-support/http.ts` (оба не в HEAD, фаза 2; перед чтением проверить наличие). Конструкция: `app.ts` default export + scratch-база из `test-database.ts`. При планировании читать эти два файла как образец; excerpt здесь не приводится, чтобы не цитировать файлы вне HEAD по памяти.

### Образец ожидаемо красных проверок (D5, D-11): `test.fails` + константа

**Analog:** константа `KNOWN_HOLES` и ветка `test.fails` из `app/web/lib/mdx/untrusted.test.ts` в версии фазы 2-01. В текущем рабочем дереве (не в HEAD) константы уже нет, дыры закрыты; образец сохранён в `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01:94-100`, `:188-199`:

```ts
const KNOWN_HOLES = new Set(['выражение в блоке', 'элемент script'])

if (KNOWN_HOLES.has(payload.name)) {
	test.fails(`${payload.name} не исполняется — исправляется в Группе 4 (DEP-03)`, async () => { ...assert... })
} else {
	test(`${payload.name} не исполняется`, async () => { ...assert... })
}
```
Для D5: `test.fails` на функцию, которую вызывает сохранение (рекомендуется вынести `validateQuestion` из `QuestionEditorPageClient.tsx:114` в чистый модуль без изменения поведения; сейчас она не экспортирована, поэтому первым шагом нужен вынос). Для D-11: `test.fails` вокруг чтения ключей. Каждый `test.fails` помечать именем с фазой, которая его чинит, и снимать в плане, где чинится дефект (в тест-раннере Vitest `test.fails` «зеленеет» при падении, а при починке становится красным и напоминает о переключении).

### Web: проверка редактора (D5, D-09, D-13)

**Заменяемые копии (три):**
1. `QuestionEditorPageClient.tsx:114-166` `validateQuestion`, причина D5 в `:155-159`:
```ts
if (template === 'short_text') {
	const normalized = normalizeShortTextCorrectValue(question.correct)
	if (!normalized || !normalized.trim()) { return 'Укажите правильный краткий ответ' }
}
```
`normalizeShortTextCorrectValue` (`admin/tests/types/index.ts:285-293`) принимает только строку или число, массив даёт `null`, поэтому и падает D5.
2. `test-editor-utils.ts:64-110` `getCreateQuestionsValidationError` (тот же код, префикс `Вопрос ${i + 1}: ` и нижний регистр).
3. `admin/tests/types/index.ts:277-324` (`normalizeSequenceCorrectValue`, `normalizeShortTextCorrectValue`, `isValidSequenceCorrectValue`, `normalizeQuestionForSave`).

Форма вызова после переключения: адаптер возвращает сообщение с заглавной буквы без префикса. Вызывающий код `getCreateQuestionsValidationError` добавляет префикс:
```ts
return `Вопрос ${i + 1}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`
```
Тексты ошибок web сохранить дословно (UI-SPEC, таблица «Тексты»; в `QuestionEditorPageClient` они уже те же). Показ ошибки не меняется: `toast.error(message)` из `sonner` в `handleSaveQuestion` (`:431-433`), `useTestEditorModel.ts` (`toast.error(err.message)`).

Прочие точки: `normalizeDraftCorrect` `:75-81` (теряет число: `if (!isRecord(value)) return ''`; станет приведением числа к строке по D-11 п.2) и `acceptsMultipleShortAnswers` `QuestionEditor.tsx:52-54`.

### Web: разбор `QuestionAnswerReview.tsx` (D2, D-08, UI-SPEC)

**Analog:** сам файл, `TextAnswerReview` `:146-195`. Заменяемое:
```tsx
const givenDigits = given.replace(/\s+/g, '')
const expectedDigits = expected.replace(/\s+/g, '')
const matchingPositions = [...givenDigits].filter((digit, index) => digit === expectedDigits[index]).length
...
{sequence && (correctAnswer != null || isCorrect) ? (
	<p className="mt-2 text-xs">
		Совпало позиций: {matchingPositions} / {expectedDigits.length}
	</p>
) : null}
```
Станет: вердикты из адаптера пакета (`computeVerdicts` или как назовёт планировщик) на `given` и `expected`, строка `<p className="mt-2 text-xs">{`Ошибок: ${errors}`}</p>` одним текстовым узлом (e2e читает `/Ошибок: (\d+)/`), условие показа `sequence && (correctAnswer != null || isCorrect)` сохранить. Ряд ячеек по UI-SPEC: `role="list" aria-label="Разбор по позициям" className="mt-3 flex flex-wrap gap-2"`, ячейка `inline-flex size-10 ... font-mono text-base font-medium`, цвета и иконки по таблице UI-SPEC, `cn` из `@/lib/utils/cn`, иконки lucide (`Check` уже импортируется в файле). Классы вердиктов уже есть в файле (`border-green-500/40 bg-green-50/80`, `border-amber-500/40`, `border-red-500/40 bg-red-50/80`), копировать оттуда.

Случай «пустой ответ»: `given` = `''` при `studentLines[0] === 'Нет ответа'`, ошибок = длина ключа, ячеек нет.

Единый компонент обслуживает `AttemptQuestionsList.tsx` (админ) и `TestRunner.tsx:745-770` (студент), правка одна.

### Web: описание метрики (D-08)

`admin/tests/types/index.ts:100` — строка `hamming_digits: 'Считаются несовпадения по позициям и разница длины.'` заменяется на текст из UI-SPEC.

### e2e (D-18)

**Analog:** сами файлы.

`e2e/tests/review.spec.ts:164-168` (заменяемый помощник):
```ts
function positionsMatched(sectionText: string): { matched: number; length: number } {
	const found = /Совпало позиций: (\d+) \/ (\d+)/.exec(sectionText)
	if (!found) throw new Error(`no "Совпало позиций: X / N" line in the review: ${sectionText}`)
```
Станет читать `/Ошибок: (\d+)/`; D2 сравнивает N с `serverMistakesFromPoints(earned, max)` (`:175-179`, функция остаётся). Блок D2 `:181-232` устроен как `test.describe.serial` из подготовительного обычного теста (setup, `@known-defect`) и отдельного `test.fail(...)`. Чинящий план переключает `test.fail(` на `test(` и переименовывает заголовок (убрать «known defect», сохранить тег по правилам репозитория). Ожидание `:103` `'Совпало позиций: 4 / 4'` меняется на `'Ошибок: 0'`.

`e2e/tests/authoring.spec.ts:202-242` D5: подготовка `D5 setup` (обычный тест) + `test.fail('D5 — fixed in Phase 3 (EXAM-07): ...', async () => { await saveQuestion(page!, slug); await page!.reload(); await expect(page!.getByText(D5_PROMPT)).toBeVisible() })`. Переключить `test.fail` в `test`. D1 (`review.spec.ts:234-…`) не трогать.

Перед переключением web выполнить `yarn e2e` и убедиться, что D2 по-прежнему красный как ожидается (D-14).

### Документация (D-02)

- `AGENTS.md:46` строка «Exam domain» в таблице Routing: добавить `packages/exam-core` в колонку «Where».
- `README.md` (`:5`, `:72`, `:95`, `:104`), `app/server/README.md:37`. Ограничения: `scripts/check-docs-structure.test.mjs:48-53` требует пять идентификаторов шаблонов в `app/server/README.md`; `scripts/check-docs-commands.mjs` проверяет, что каждая `yarn ...` в доках существует. Комментарии и README по-русски.

---

## Shared Patterns

### Правила кода
**Source:** `AGENTS.md`, глобальные правила. Без комментариев в коде; ESM, табы, одинарные кавычки, без точки с запятой (по oxfmt, `yarn format`); `import type` обязателен для типов (`verbatimModuleSyntax`); окончание `.js` в относительных импортах только в `app/server` (NodeNext-стиль: `'./scoring.js'`), в `app/web` и `packages/*` по их tsconfig (в rbac `moduleResolution: Bundler`, расширения не нужны).

### Тесты
**Source:** `app/server/src/lib/tests/scoring.test.ts:1-3`
```ts
import assert from 'node:assert/strict'
import { test } from 'vitest'
```
`node:assert/strict`, `test` из `vitest`, русские названия, web без DOM, БД только через `node scripts/with-test-db.mjs`.

### Тесты с БД
**Source:** `app/server/src/db/timestamps.test.ts` + `app/server/src/test-support/test-database.ts` (`requireTestDatabaseUrl`, `createScratchDatabase(prefix)`, `migrateTestDatabase`, `scratch.drop()`). Префикс `^test_[a-z0-9_]+$`; без `TEST_DATABASE_URL` тест падает, не пропускается.

### Ожидаемо красные проверки
**Source:** `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01:94-100,188-199` (`test.fails` + константа). Для e2e: `test.fail(...)` в Playwright с подготовкой обычным тестом (`authoring.spec.ts:202-242`).

### Порядок сборки
**Source:** `packages/rbac` + `turbo.json` (`^build`). Везде, где явно собирается rbac (Vercel x2, `e2e.mjs`, CI job `build`, `check-ci-workflow.mjs`), добавить exam-core ПОСЛЕ rbac и ДО server/web. `dist` в `.gitignore`.

### Удаление копий (D-17)
Цепочка на каждую копию: `codegraph impact <symbol>` -> перенос тестов в таблицы пакета -> переключение вызовов -> удаление -> `codegraph affected <files>` -> `yarn verify`. Верификатор сверяет список из 20 позиций в `<code_context>` CONTEXT.md.

---

## No Analog Found

| Файл / задача | Роль | Поток | Причина |
|---------------|------|-------|---------|
| Вердикты по частям для `sequence_digits` (`correct`/`wrong`/`missing`/`extra`/`swapped`) | utility | transform | Сегодня есть только счётчик ошибок (`scoring.ts:145-170`) и подсчёт совпавших позиций (`QuestionAnswerReview.tsx:152`); функции вердиктов нет. Исходить из формулы счётчика, инвариант «единиц ошибки = ошибок адаптера» закрепить таблицей |
| Склонение `{вариант\|варианта\|вариантов}` и `{правильный ответ\|...}` (UI-SPEC) | utility | transform | Склонения в кодовой базе нет (grep по web не искал; табличный тест на 1, 2, 5, 11, 12, 21, 22, 25 из UI-SPEC) |
| Тип колонки `answer_keys.correct_answer` без второго `JSON.parse` (D-11) | model | CRUD | В `db/schema.ts` нет `customType`; проверить `grep customType app/server/src/db`. Править только эту колонку, миграции не нужны |
| Тест паритета старой и новой оценки на сгенерированных входах | test | transform | Генеративных тестов нет (только поштучные); писать по описанию D-15 |
| Единый `Adapter` по шаблону (`Record<QuestionUiTemplate, Adapter>`) | service | transform | Сегодня логика разбросана по `if (template === ...)` в четырёх местах; ближайший приём исчерпываемости: `Record<MistakeMetric, string>` в `admin/tests/types/index.ts:81-100` |

## Метаданные

**Область поиска:** `packages/rbac`, `app/server/src/lib/tests`, `app/server/src/db`, `app/server/src/test-support`, `app/web/components/tests`, `app/web/app/(internal)/(protected)/admin/tests`, `e2e/tests`, `scripts`, `.github/workflows`, `.planning/phases/02-dependency-security/baseline`.
**Файлов прочитано:** ~25.
**Дата извлечения:** 2026-10-04.

**Не в HEAD (рабочее дерево фазы 2):** `app/server/src/test-support/http.ts`, `app/server/src/routes/uploads.test.ts`, `app/web/lib/mdx/untrusted.test.ts` (константы `KNOWN_HOLES` в нём больше нет: образец взят из baseline-снимка `.planning/phases/02-dependency-security/baseline/untrusted.test.ts.02-01`, который лежит в `.planning`, не в исходниках).
**Расхождение с CONTEXT:** CONTEXT.md D-14 и канонические ссылки называют `untrusted.test.ts` образцом `KNOWN_HOLES`; в текущем дереве константа удалена вместе с закрытием дыр, образец доступен только в baseline-файле.
