# Phase 2: Dependency security - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 14 new/modified groups
**Analogs found:** 12 / 14 (все пути проверены как git-tracked; `.planning/` в `.gitignore`, ссылки на него только справочные)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/web/lib/mdx/untrusted.test.ts` (new) | test | transform | `app/web/lib/mdx/normalizeSource.test.ts` | exact |
| `app/web/lib/mdx/*.ts` plugins (conditional) | utility | transform | `app/web/lib/mdx/options.ts` | self |
| `app/server/src/routes/uploads.test.ts` (new, имя на усмотрение) | test | request-response, file-I/O | `app/server/src/services/storage/storage.local.test.ts` + `test-support/test-database.ts` | role-match |
| `e2e/tests/proxy-protection.spec.ts` (new) | test | request-response | `e2e/tests/auth.spec.ts` | role-match |
| `app/web/package.json`, `app/server/package.json`, `packages/rbac/package.json`, `yarn.lock`, `.yarnrc.yml` | config | batch | Phase 1 plan 01-02 (checkpoint + pins) | process-match |
| Vercel repro (`app/web/vercel.json`, `app/server/vercel.json`, `app/server/vercel-build.cjs`) | config | batch | 01-06-SUMMARY "Vercel build reproduction" | process-match |
| `docs/security/dependency-audit.md` (new) | doc | n/a | `docs/adr/0003-verification-before-refactoring.md` | tone-match |

## Pattern Assignments

### `app/web/lib/mdx/untrusted.test.ts` (test, transform)

**Analog:** `app/web/lib/mdx/normalizeSource.test.ts` (lines 1-5, 29-32)

```typescript
import assert from 'node:assert/strict'
import { test } from 'vitest'

import { normalizeMdxSource } from './normalizeSource'

test('normalizeMdxSource: не трогает настоящие списки и уже экранированные строки', () => {
	assert.equal(normalizeMdxSource('1. Настоящий список'), '1. Настоящий список')
})
```

Стиль: `node:assert/strict`, `test` из vitest, русские названия, табы. Конфиг `app/web/vitest.config.ts`: alias `@` -> корень `app/web`, `environment: 'node'`, `include: ['**/*.test.ts']` (файл должен быть `.test.ts`, не `.tsx`; рендер через `react-dom/server` `renderToString` + `React.createElement`, без JSX).

**Реальный конвейер** (`app/web/components/tests/MdxRenderer.tsx` line 7, 144):
```typescript
import { serialize } from 'next-mdx-remote/serialize'
const result = await serialize(normalized, buildMdxOptions())
```
`buildMdxOptions()` (`app/web/lib/mdx/options.ts`) возвращает `{ mdxOptions: { remarkPlugins: [remarkGfm, remarkParagraphPerLine, remarkMdxStyleToEstree], rehypePlugins: [[rehypeRaw, { passThrough: MDX_PASS }], rehypeStyleToObject] } }`. Пайплайн в тесте: `normalizeMdxSource` -> `serialize(src, buildMdxOptions())` -> `MDXRemote` (`next-mdx-remote`) рендер в Node. Побочный эффект проверять через `globalThis.__pwned` (сбрасывать в `beforeEach`).

**Ожидаемо падающий механизм (D-11):** образец `test.fail` из e2e Phase 1, `e2e/tests/authoring.spec.ts` lines 205-243: setup — обычный тест, ожидаемо падающая проверка отдельно, с тегом `@known-defect` и названием «fixed in Phase N». В Vitest аналог — `test.fails('... — fixed in Group 4 (DEP-03)', ...)` для матрицы пейлоадов; в Группе 4 заменить на `test`. Эталоны (style, таблицы, картинки) — обычные `test`, зелёные на v5 и v6.

### MDX plugins (conditional adaptation, D-08)

Менять только если `blockJS` вырежет style. Образцы в самих файлах: `app/web/lib/mdx/remarkMdxStyleToEstree.ts`, `rehypeStyleToObject.ts`. Не вводить sanitizer-фреймворк (D-09).

### Server upload tests (test, request-response)

**Analogs:** `app/server/src/services/storage/storage.local.test.ts` (структура), `app/server/src/test-support/test-database.ts`, `app/server/vitest.config.ts`.

Шапка и мок (storage.local.test.ts lines 1-12):
```typescript
import assert from 'node:assert/strict'
import { afterAll, beforeAll, beforeEach, describe, test, vi } from 'vitest'

const createClientSpy = vi.hoisted(() => vi.fn())
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientSpy }))
```

БД (test-database.ts): `createScratchDatabase(prefix)` (prefix `^test_[a-z0-9_]+$`, возвращает `{ url, name, drop }`), `migrateTestDatabase(url)`, `requireTestDatabaseUrl()` (без `TEST_DATABASE_URL` падает, не пропускает). `drop()` в `afterAll`. Запуск: `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test`. Vitest-конфиг сервера: `include: ['src/**/*.test.ts']`, `env: { BIO_EXAM_ISOLATED_ENV: '1' }`. App: `import app from '../app.js'` (default export, строка 153, без `listen`); для запросов — `app.listen(0)` + `fetch` с `FormData`/`Blob` (supertest в зависимостях проверить, иначе Node fetch).

Тестируемые multer-контракты (одинаковы во всех трёх роутах):
```typescript
limits: { fileSize: 5 * 1024 * 1024 },
fileFilter: (_req, file, cb) => { allowedMimes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Недопустимый тип файла. ...')) }
```
- `routes/tests/index.ts` lines 2288-2342: `POST /:id/assets`, `validateUUID('id')`, `sessionRequired()`, `requirePerm('tests','write')`, `upload.single('file')`, memoryStorage; MIME jpeg/png/gif/webp.
- `routes/users/avatar.ts` lines 52-78, 112: `sessionRequired(), upload.single('avatar')`, MIME jpeg/png/gif/webp, дальше `fileTypeFromBuffer` и Sharp (`sharp(buf).rotate(...).extract(...).resize(256,256)`).
- `routes/docs/assets.ts` lines 14-60: MIME jpeg/png/webp (без gif), Sharp -> `.webp`.

**Ограничение изоляции (WR-04):** без Supabase диск-ветка вызывает `assertLegacyUploadsAllowed()` в `destination` и в обработчике (avatar.ts lines 36-42, 125) и fails closed; поэтому проверять валидацию multer (413/ошибка размера, отказ по MIME) до хранилища. Для tests/assets (memoryStorage) проход дальше зависит от `STORAGE_LOCAL_DIR` (Phase 1 D-18, `storage.local.test.ts`). Sharp на Node 24 — отдельный unit-тест без HTTP: tiny PNG из `sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })`, затем `rotate`/`resize`/`webp`. Сессию для `sessionRequired()` брать так же, как существующие DB-тесты (проверить в `app/server/src` хелперы авторизации перед планом; аналогов тест-сессии среди unit-тестов нет).

### `e2e/tests/proxy-protection.spec.ts` (test, request-response)

**Analog:** `e2e/tests/auth.spec.ts` (шапка lines 1-21) и `e2e/playwright.config.ts` (lines 29-60).

```typescript
import { expect, test } from '@playwright/test'
```
Конфиг: `baseURL: webOrigin`, проекты `chromium-desktop`/`chromium-mobile` с `testMatch: /tests\/.+\.spec\.ts$/`, `workers: 1`. Использовать фикстуру `request` (APIRequestContext) без браузера: `request.get(path, { headers: {...}, maxRedirects: 0 })`, ожидать 307/308 и `location` на `/login?callbackUrl=...`. Заголовки: `RSC: 1`, `Next-Router-Prefetch: 1`, `Next-Router-Segment-Prefetch: <seg>`, `Next-Url`. Поведение proxy (`app/web/proxy.ts` lines 15-30): без `session`/`refresh_token` куки редирект `/login?callbackUrl=${pathname}${search}`; публичны `/login`, `/invite*`; matcher исключает `api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads`. Динамические параметры: пути вида `/tests/<uuid>`, `/dashboard/...` — взять реальные маршруты из `app/web/app`. Учесть: проект дублируется на desktop/mobile, API-тесты не зависят от устройства (можно `test.skip` для mobile либо принять двойной прогон); лимит входов не затрагивается, куки не нужны. Не входит в `yarn verify`, только `yarn e2e`.

### Manifests / lockfile / checkpoint

**Analog:** `.planning/phases/01-verification-baseline/01-02-PLAN.md` line 70: `<task type="checkpoint:human-verify" gate="blocking-human">` с точными именами, версиями, датой публикации до первой установки; threat-модель T-1-05/T-1-06 (lines 136-137). Phase 2: `^` для production (D-02), `yarn add`/`yarn up -R`; после каждой группы `yarn install --immutable`, `yarn verify`, сборка web. Гард второго lockfile: `scripts/check-lockfile.mjs`. Env-контракт `scripts/check-env-contract.mjs` не трогать (новых env-ключей нет).

### Vercel build repro

**Pattern:** 01-06-SUMMARY lines 245-251 и 62: сборка с плейсхолдер-env (`SESSION_COOKIE_NAME`, `NEXT_IGNORE_INCORRECT_LOCKFILE` в плейсхолдерах, чтобы `@next/env` ничего не брал из `app/web/.env`).
- Web: `app/web/vercel.json` `buildCommand`: `yarn --cwd ../.. workspace @bio-exam/rbac build && yarn build:dev`.
- Server: `app/server/vercel.json` `buildCommand`: `node vercel-build.cjs` (rbac build + `tsc`, ожидаемый вывод `=== Build completed successfully! ===`, exit 0); `installCommand` у обоих: `corepack enable && yarn --cwd ../.. install`.

### `docs/security/dependency-audit.md` (doc)

**Analog:** `docs/adr/0003-verification-before-refactoring.md` (front matter `status`/`date`, русский, сухие факты, маркированные списки). Не ADR: без front matter-статуса решений, но тот же тон. Заголовок: команда `yarn npm audit --all --recursive --severity high --json` и дата. Таблица по каждому остатку: пакет, severity, путь зависимости, достижимость, патч-версия, статус. `scripts/check-docs-commands.mjs` проверяет только `README.md`, `app/server/README.md`, `AGENTS.md`; `docs/security` не проверяется, но команды писать только существующие. Тест структуры доков: `scripts/check-docs-structure.test.mjs` (проверить, не требует ли он регистрации нового файла).

## Shared Patterns

- **Изоляция БД:** `TEST_DATABASE_URL` + `BIO_EXAM_ISOLATED_ENV=1` через `scripts/with-test-db.mjs`; `requireTestDatabaseUrl()` падает, а не пропускает (Source: `app/server/src/test-support/test-database.ts` lines 35-50).
- **Нулевой прогон = провал:** новые тесты обязаны быть в `include` своих vitest-конфигов (`app/web`: `**/*.test.ts`; `app/server`: `src/**/*.test.ts`).
- **Ожидаемо падающие:** отдельный setup-тест + `test.fail`/`test.fails` с пометкой «fixed in …» (`e2e/tests/authoring.spec.ts` lines 210-243).
- **Стиль кода:** табы, без комментариев в новом коде (правило пользователя; существующие файлы комментируют по-русски), `node:assert/strict`.
- **Агенты не коммитят;** границы планов = границы коммитов.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Server route upload tests (HTTP-уровень) | test | multipart request | Нет route-тестов через `app.ts`; unit-тесты сервера не поднимают Express. Брать `app.ts` default export + `test-database.ts`; хелпер тестовой сессии придётся написать |
| MDX render test | test | transform | Нет теста с `MDXRemote`/`renderToString`; ближайший только `normalizeSource.test.ts` |

## Metadata

**Analog search scope:** `app/web/lib/mdx`, `app/web/proxy.ts`, `app/web/vitest.config.ts`, `app/server/src/{routes,services/storage,test-support,config}`, `e2e`, `docs/adr`, `scripts`, Phase 1 plans/summaries.
**Pattern extraction date:** 2026-10-03
