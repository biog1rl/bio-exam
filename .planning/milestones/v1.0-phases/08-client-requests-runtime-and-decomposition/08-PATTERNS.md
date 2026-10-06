# Фаза 8: Client requests, runtime and decomposition - карта образцов

**Составлено:** 2026-10-05
**Код читался из:** worktree `wt-phase-07.1`, ветка `gsd/phase-07.1`, HEAD `1d800af`. Номера строк в `routes/tests/assignments.ts`, `routes/groups`, `routes/auth/invites.ts`, `routes/users/index.ts`, `services/search`, `GroupSheet` даны «на 1d800af»: ревью 07.1 их правит параллельно, перед планом перепроверить `grep -n`.
**Файлов проанализировано:** 61 новых и меняемых
**Образец найден:** 56 / 61 (5 без образца: см. «Образца нет»)

Все пути в таблицах отслеживаются git (`git ls-files` проверен выборочно на файлах-образцах: `lib/session/keep-alive.ts`, `lib/users/role-traits.ts`, `routes/tests/assignments.ts`, `scripts/*.test.mjs`). Зеркал `.gsd/capabilities` среди образцов нет.

## Расхождения с CONTEXT, которые важны планировщику

1. **`routes/tests/index.ts` на 1d800af - 1755 строк, не 2737** (CONTEXT: 2737 на `aea7e48`; фаза 7 вынесла содержимое вопроса в модуль). "Около 60 строк" точки сборки остаётся целью.
2. **У `absoluteUrl` четыре вызывающих, не три.** Четвёртый - `app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/layout.tsx:11` (UI-SPEC Поверхность 3 это уже учла). Три остальных: `admin/attempts/page.tsx:12`, `admin/attempts/[id]/page.tsx:21`, `admin/users/[id]/page.tsx:19`.
3. **`fetchAttemptReview` в `lib/tests/api.ts` уже нет** (0 совпадений по `app/web`). Удалять нечего. Локальная `fetchAttemptReviewData` на странице `admin/attempts/[id]/page.tsx:17` - это не он, она уходит вместе с переводом на серверный примитив.
4. **Вызывающих больше, чем перечислено в D-08.** Дополнительно к списку CONTEXT есть: `app/(internal)/(protected)/dashboard/DashboardClient.tsx:125` (свой 401/403 → `null`), `components/users/dialogs/InviteUserDialog.tsx:54,84`, `components/users/dialogs/ReinviteUserDialog.tsx:45`, `components/groups/DeleteGroupDialog.tsx:41`, `admin/tests/components/TopicFormDialog.tsx:114,165,193`, `[testSlug]/questions/new/NewQuestionDraftPageClient.tsx:37,48`, `lib/drafts/question-draft-api.ts:30,45`, `lib/users/role-traits.ts:49`, `components/editor/GitCommitModal.tsx:41`, `components/editor/plugins/drag-drop-paste-plugin.tsx:36`, `components/editor/plugins/images-plugin.tsx:117`, `lib/tests/api.ts:7,53,147`. Охранный тест D-10 всё это поймает, значит в плане они должны быть названы поимённо.
5. **В `lib/tests/api.ts` три разных `apiFetch`-формы**, не одна: `fetchJson` (`:6-21`, бросает `Error(text)`), `fetchAttemptJson` с `AttemptRequestError` (`:53-`), `saveAttemptDraft` с исходом `{ kind }` (`:137-155`). Перевод должен сохранить публичные сигнатуры и семантику фазы 6.
6. **`app/error.tsx` сейчас - голая английская заготовка** (`Something went wrong!`), `(protected)/error.tsx` не существует. Образец разметки для обоих - `AccessDeniedState` (UI-SPEC Поверхность 3 уже задаёт отличия).
7. **Три охранных скрипта читают `routes/tests/index.ts` как один файл** (`scripts/attempt-integrity-guards.test.mjs:20,214,400`, `scripts/storage-no-private-access.test.mjs:55,325`, `scripts/teacher-zone-guards.test.mjs:21,30,58-75,440`). После DECOMP-02 они сломаются. План нарезки обязан обновить их под раскладку суброутеров (карта `ROUTE_FILES` в teacher-zone-guards `:29-37` уже умеет несколько файлов).
8. **Эталон «одной веб-функции чтения и парсинга» уже есть:** `lib/users/role-traits.ts:25-56` (`parseRoleTraits`) с `role-traits.test.ts`. Это образец для `parse` из D-03.
9. **В коде нет ни одного `motion-reduce` и ни одного `prefers-reduced-motion`**; единственный JS-случай `scrollIntoView({ behavior: 'smooth' })` - `components/tests/attempt-review/attempt-review-utils.ts:394`.
10. **Загрузка промптов сейчас в трёх разных видах**, а не только последовательная: неограниченный `Promise.all` по вопросам (`routes/tests/public.ts:~300-325` и `~370-385`, `routes/tests/index.ts:1721-1740`), партии по 5 (`question-content/read.ts:83-95`, `ADMIN_READ_CONCURRENCY`), строго последовательно в экспорте (`question-content/export.ts:104-124`). PERF-02 сводит их в один помощник.

## Классификация файлов

### HTTP (web)

| Файл | Роль | Поток данных | Ближайший образец | Качество |
|------|------|--------------|-------------------|----------|
| `app/web/lib/http/request.ts` (новый; имя - Discretion) | service (ядро запросов) | request-response | `app/web/lib/session/client.ts:162` (`apiFetch`) + `lib/tests/api.ts:6-21` (`fetchJson`) + `lib/drafts/question-draft-api.ts:23-56` (исход вместо исключения) | role-match |
| `app/web/lib/http/request.test.ts` (новый) | test | pure/seam | `lib/session/client.test.ts`, `lib/session/keep-alive.test.ts` | exact |
| `app/web/lib/http/errors.ts` (новый; тексты D-02, `readApiError`) | utility | transform | `lib/users/invite-form.ts:30-55`, `lib/users/student-card.ts:15`, `lib/session/login-errors.ts` | role-match |
| `app/web/lib/http/swr.ts` (новый; `swrFetcher`, ключи) | utility | request-response | `lib/users/role-traits.ts:48-62` (`useSWR` + узкий `parse`) | role-match |
| `app/web/lib/users/api.ts` (новый) | service | CRUD | `lib/tests/api.ts` (`fetchTopicTests`, `startTestSession`) | role-match |
| `app/web/lib/groups/api.ts` (новый) | service | CRUD | `lib/tests/api.ts` | role-match |
| `lib/tests/api.ts`, `test-editor-api.ts`, `lib/search/api.ts`, `lib/image-signed-url-cache.ts`, `lib/drafts/question-draft-api.ts` (перевод) | service | CRUD | сами себя; форма исхода - `question-draft-api.ts:27-56` | exact |
| `app/web/components/ui/load-error.tsx` (новый компонент блока ошибки; имя - Discretion) | component | request-response | `components/ui/alert.tsx` + `RoleZoneAlert` в `EditUserDialog.tsx:96-128` | role-match |
| `app/web/app/error.tsx` (переписать), `app/web/app/(internal)/(protected)/error.tsx` (новый) | component (error boundary) | request-response | `components/auth/AccessDeniedState.tsx` (разметка) + `app/error.tsx` (контракт `{ error, reset }`) | role-match |
| `app/web/lib/session/server.ts` (+ серверный примитив D-13) | service | request-response | сам: `getServerMe` `:11-24` | exact |
| `admin/attempts/page.tsx`, `admin/attempts/[id]/page.tsx`, `admin/users/[id]/page.tsx`, `admin/tests/[topicSlug]/[testSlug]/layout.tsx` | page (RSC) | request-response | `admin/users/[id]/page.tsx` (редирект + `getServerMe`), `lib/session/object-access.ts` | exact |
| `lib/http/absoluteUrl.ts` (удалить), `lib/fetcher.ts`, `lib/swr-config.ts`, `lib/api-fetch.ts` (удалить/сузить) | - | - | - | - |
| Охранный тест web-запросов `scripts/web-requests-guards.test.mjs` (новый) | test (guard) | file-I/O | `scripts/auth-no-role-string-checks.test.mjs:1-80` (WEB_CHECKS, SCAN_ROOTS) + `scripts/draft-durability-guards.test.mjs:1-70` (перечень файлов-исключений) | exact |
| Правка `app/web/.env.example`, `scripts/lib/e2e-web-env.mjs:53-54`, `scripts/lib/e2e-web-env.test.mjs:95-96` | config | - | `scripts/check-env-contract.mjs:184` (`unused`) | exact |

### HTTP (Express, D7)

| Файл | Роль | Поток данных | Ближайший образец | Качество |
|------|------|--------------|-------------------|----------|
| `app/server/src/routes/users/index.ts` (+ `GET /:id`, `GET /by-login/:login`) | route | request-response | сам: `GET /` `:115-222`, `GET /:userId/test-attempts` `:368-417` (на 1d800af) | exact |
| Общий селектор и сериализатор строки пользователя (в `routes/users/` или `services/`; имя - Discretion) | utility | transform | блок `select` и `rows.map` в `routes/users/index.ts:128-216` (на 1d800af) | exact |
| Тест D7 `routes/users/user-lookup.test.ts` (новый) | test | request-response | `routes/users/users-list.characterization.test.ts`, матрица зон `teacher-zone-users.matrix.test.ts` | exact |

### RT (редактор)

| Файл | Роль | Поток данных | Ближайший образец | Качество |
|------|------|--------------|-------------------|----------|
| `components/editor/plugins/code-action-menu-plugin.tsx:157` | component | event-driven | сам, `if (!anchorElem) return null` уже есть на `:160` | exact |
| `components/editor/plugins/actions/counter-character-plugin.tsx:8-31` | component | transform | `components/editor/utils/doc-serialization.ts:30` (`new TextEncoder()` без `window`) | exact |
| `components/editor/editor-hooks/use-debounce.ts` + новый чистый модуль `createDebounced` | hook + utility | event-driven | `lib/session/keep-alive.ts:29-37` (шов `setTimer`/`clearTimer`/`now`) | exact |
| `components/editor/editor-hooks/use-update-toolbar.ts` + модуль подписки | hook | pub-sub | `lib/session/keep-alive.ts` (`fakeDocument` со счётчиком слушателей, `keep-alive.test.ts:12-35`) | exact |
| `components/editor/plugins/toolbar/toolbar-plugin.tsx` | component | pub-sub | сам, `:14-52` | exact |
| `components/editor/plugins/actions/speech-to-text-plugin.tsx` + модуль сессии распознавания | component + utility | event-driven | `lib/session/keep-alive.ts` (`stop()`, `dispose`), `keep-alive.test.ts` `fakeDocument` | role-match |
| SSR-тест редактора `components/editor/editor.ssr.test.ts` (новый) | test | transform | `lib/session/server.test.ts:1-60` (`vi.mock('next/headers')`, `vi.resetModules`, среда node) | role-match |
| Помощник `prefersReducedMotion()` в `lib/utils` | utility | transform | `lib/utils/cn.ts`, `components/editor/shared/can-use-dom.ts` | role-match |
| Затронутые анимированные элементы | component | - | образца Tailwind `motion-reduce:` в коде нет (см. «Образца нет») | - |

### PERF

| Файл | Роль | Поток данных | Ближайший образец | Качество |
|------|------|--------------|-------------------|----------|
| `app/server/src/services/search/database-search.ts:391-419` | service | batch | сам; пул `pgPool` `:112` | exact |
| `app/server/src/services/question-content/read.ts` (+ помощник ограниченной параллельности) | service | batch | `relocate.ts:16,258-268` (`COPY_CONCURRENCY`, партии), `read.ts:83-95` | exact |
| `routes/tests/public.ts` (`~300-325`, `~370-385`, `~598-620`), `routes/tests/index.ts:1721-1740` | route | request-response | сами; заменяются вызовом функции модуля | exact |
| `app/server/src/services/storage/zip.ts` (поток) | service | streaming | сам: `packZip` `:44-54`, `buildZip` `:56-72`; `archiver` | role-match |
| `app/server/src/services/question-content/export.ts` (данные пачкой, приёмники) | service | batch + streaming | сам: `collectTestParts` `:90-136`, `buildTopicArchive` `:170-203` | exact |
| Обработчики экспорта `routes/tests/index.ts:1479-1511` | route | streaming | сами | exact |
| Новый ключ env (`EXPORT_ZIP_MAX_BYTES`) | config | - | `app/server/.env.example`, `scripts/check-env-contract.mjs` | exact |
| `components/editor/plugins.tsx`, `plugins-config.ts` (лениво) | component | transform | `plugins/emoji-picker-plugin.tsx:21-24` (`next/dynamic`, `ssr: false`), `:62-71` (динамический `import('../utils/emoji-list')`) | exact |
| `components/editor/transformers/markdown-emoji-transformer.ts`, `utils/mdx-converter.ts` | utility | transform | `emoji-picker-plugin.tsx:62-71` | role-match |
| Скрипт бюджета чанка + JSON бюджета | script | batch | `scripts/check-exam-core-dist.mjs`, `scripts/check-rbac-dist.mjs` | role-match |
| `scripts/bench/*` (наполнение, замеры) | script | batch | `scripts/with-test-db.mjs` (запуск), `app/server/src/test-support/test-database.ts` | role-match |
| `08-BENCHMARKS.md`, `08-REACT-DOCTOR.md` | doc | - | образца в коде нет, форма - в CONTEXT D-19, D-28 | - |

### DECOMP

| Файл | Роль | Поток данных | Ближайший образец | Качество |
|------|------|--------------|-------------------|----------|
| `app/server/src/routes/tests/<домен>.ts` (суброутеры) | route | request-response | `routes/tests/assignments.ts:19-40,57-` (`Router`, `mergeParams`, именованный экспорт) | exact |
| `app/server/src/routes/tests/index.ts` (точка сборки) | route | request-response | `app/server/src/routes/index.ts:1-34` (импорты + `router.use` по порядку + `export default`) | exact |
| Генератор инвентаря `routes:inventory` и снимок | script | transform | образца обхода `router.stack` в коде нет | - |
| Характеризация регистрации `routes/tests/registration.characterization.test.ts` | test | request-response | `routes/tests/access-routes.test.ts:1-60`, `routes/users/users-list.characterization.test.ts:1-45` | exact |
| Именованные фабрики (`requirePerm`, `requirePermKey`, `validateUUID`, `sessionRequired`) | middleware | request-response | `middleware/auth/requirePerm.ts:9-30`, `middleware/validateParams.ts`, `middleware/auth/session.ts:39` | exact |
| Обновление `scripts/{attempt-integrity,storage-no-private-access,teacher-zone}-guards.test.mjs` | test (guard) | file-I/O | `teacher-zone-guards.test.mjs:29-37` (`ROUTE_FILES`) | exact |
| `.agents/skills/bio-exam-api/SKILL.md:40`, `bio-exam-data/SKILL.md`, `AGENTS.md` (таблица) | doc | - | сами | exact |

## Назначение образцов

### HTTP-01. Ядро модуля запросов `lib/http/request.ts`

**Образец 1: `app/web/lib/session/client.ts`** - цепочка 401 уже здесь, второй не заводить.

`AuthExpiredError` `:8-12`; точка входа для вызывающих `:162-164`:

```typescript
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	return sessionClient.fetchWithSession(url, init)
}
```

`fetchWithSession` `:99-115`: на 401 один `refreshOnce()`, при `rejected` - `expire()` (редирект на вход + `throw new AuthExpiredError()`), при `unavailable` возвращается исходный ответ 401. Из этого следуют два свойства модуля запросов: `kind: 'auth'` получается из `instanceof AuthExpiredError`; 401 при `unavailable` приходит как обычный `Response` с `status 401` и должен классифицироваться как `http`, не как `auth` (тест на это обязателен).

**Образец 2: `lib/tests/api.ts:6-21`** (`fetchJson`) - то, что заменяется:

```typescript
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await apiFetch(url, {
		cache: 'no-store',
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
	})
	if (!response.ok) {
		const text = await response.text()
		throw new Error(text || `HTTP ${response.status}`)
	}
	return (await response.json()) as T
}
```

`cache: 'no-store'` по умолчанию (D-01) берётся отсюда. Текст ошибки из тела берёт `readApiError`.

**Образец 3: `lib/drafts/question-draft-api.ts:27-56`** - форма «исход вместо исключения» (для `request`, D-01):

```typescript
try {
	const response = await apiFetch(url, { method: 'PATCH', headers: {...}, body: json, keepalive: options.keepalive })
	if (!response.ok) return STATUS_RESULT[response.status] ?? FAILED
	const confirmed = readDraftLockVersion(await response.json().catch(() => null))
	return confirmed === null ? FAILED : { kind: 'ok', lockVersion: confirmed }
} catch {
	return FAILED
}
```

Семантика фазы 6 (`keepalive`, `KEEPALIVE_BODY_LIMIT_BYTES` в `lib/tests/api.ts:~134`, `saveAttemptDraft` `:137-155` с исходами `response`/`network`/`too-large`) не меняется: `request` с `keepalive` должен давать те же исходы.

**Образец 4 (тест): `lib/session/client.test.ts`** + `lib/session/keep-alive.test.ts:12-35` - Vitest, среда `node`, без DOM, шов `fetch` через `vi.stubGlobal('fetch', vi.fn(...))`; пример поддельного `Response` с подсчётом чтения тела - `lib/session/server.test.ts:42-60` (`Options.rawBody`, `failure`, `status`).

### HTTP-01/02. Проверка формы `parse` и тексты отказов

**Образец: `lib/users/role-traits.ts:25-56`** - узкая проверка конверта без zod:

```typescript
export function parseRoleTraits(body: unknown): RoleTraits[] {
	if (!body || typeof body !== 'object') return fallbackRoleTraits()
	const list = (body as Record<string, unknown>).roles
	if (!Array.isArray(list)) return fallbackRoleTraits()
	...
}
```

В новой функции `parse` вместо запасного значения возвращается отказ `malformed` (D-03). Парный тест - `lib/users/role-traits.test.ts`. Для готовых схем пакета: `parseAuthMe` из `@/lib/auth/authMePayload` (`lib/session/server.ts:5`).

**Тексты отказов** (UI-SPEC Поверхность 2): сопоставление статусов с текстами уже оформлено чистыми функциями, форму копировать из `lib/users/invite-form.ts:30-55` (`input.status === 403` → `FORBIDDEN_ACTION`, `serverErrorText(body)`), `lib/users/student-card.ts:15`, `lib/groups/group-form.ts:63-64`, `components/users/session-actions.ts:49`. Тексты, которые 07.1 задала вызывающим, остаются у них и имеют приоритет (UI-SPEC).

### HTTP-02. Список вызывающих по группам D-08 и их 401-поведение

Локальные `const fetcher =` (16 штук на 1d800af, плюс глобальный):

| Группа | Файл:строка | Форма | Что делает с ошибкой |
|--------|-------------|-------|----------------------|
| 1 | `admin/users/UsersClient.tsx:18-24` | голый `fetch` + `r.json()` | пустой `if (r.status === 401) {}` - мёртвая ветка; `{ error }` разбирается как данные |
| 1 | `components/users/UserProfileAssignmentsPage.tsx:72-` | `apiFetch` | свой разбор, `AuthExpiredError` `:380` |
| 1 | `components/users/dialogs/EditUserDialog.tsx:81` | голый `fetch` с `credentials` | `{ error }` как данные; `AuthExpiredError` без тоста `:347` |
| 1 | `components/users/dialogs/UserGrantsDialog.tsx:28` | голый `fetch` | то же |
| 1 | `profile/ProfileClient.tsx:19` | голый `fetch` | то же |
| 2 | `admin/groups/GroupsClient.tsx:19` | голый `fetch` | `{ error }` → «Групп пока нет» (`:24,30`) |
| 2 | `components/groups/GroupSheet.tsx:68,71` (на 1d800af) | голый `fetch` | то же |
| 2 | `admin/settings/chart/ChartSettingsPageClient.tsx:12` | импорт `lib/fetcher` | единственный потребитель |
| 3 | `admin/tests/TestsClient.tsx:57`, `[topicSlug]/TopicTestsClient.tsx:36`, `question-types/QuestionTypesPageClient.tsx:29`, `[key]/QuestionTypeDetailsPageClient.tsx:32`, `scoring/ScoringSettingsPageClient.tsx:31`, `questions/QuestionEditorPageClient.tsx:46`, `test-editor/useTestEditorModel.ts:45` | смесь `apiFetch` и голого `fetch` | `throw` по `!ok`; экраны ловят в SWR `error` |
| 4 | `admin/settings/rbac/page.tsx:22` | голый `fetch` | `{ error }` как данные |
| 5 | `tests/TestsPageClient.tsx:15` | `fetchPublicTestsList()` | обёртка над `lib/tests/api.ts` |
| глобальный | `lib/fetcher.ts:2`, `lib/swr-config.ts:4` | мёртвые для приложения (`swrOptions`/`swrConfig` не импортируются; `lib/fetcher.ts` читает один `ChartSettingsPageClient`) | удалить |

**Вызывающие, которые обрабатывают 401 по-своему (оставить явными, D-07; у каждого нужен тест 401):**

| Место | Что делает при 401 | Почему остаётся |
|-------|--------------------|------------------|
| `lib/session/transport.ts:9-12` (`me`, `refresh`, `logout`, `request`) | модуль сессии | сам владеет цепочкой |
| `lib/session/server.ts:20` (`getServerMe`) | `401 → null` | SSR, proxy уже пробовал refresh |
| `lib/session/proxy-refresh.ts:53` | `401 → { kind: 'rejected' }` | refresh в proxy |
| `app/(internal)/login/LoginPageClient.tsx:110` | 401 = неверный пароль; тексты `lib/session/login-errors.ts:14-16` | анонимный вход |
| `app/(internal)/invite/[token]/InviteClient.tsx:24,52,78` | 404/409 по приглашению `:90-92` | анонимный поток |
| `dashboard/DashboardClient.tsx:125-129` (`fetchAdminJson`) | `401/403 → null`, иначе `throw` | **не названо в D-07**: сведения админа опциональны; перевести на модуль с исходом `auth`/`http 403 → null` и тестом, либо внести в D-07 |
| `components/AppSidebar.tsx:39` | публичный `/api/sidebar`, ошибка → пусто | D-07 велит перейти на модуль, UI-SPEC: поведение «меню пусто» |

**Каноничный образец доменного слоя: `lib/tests/api.ts`** - небольшие экспортируемые функции по ресурсам (`fetchTopicTests` `:124-126`, `startTestSession` `:128-130`), URL строится в слое, `apiFetch` не выходит наружу. `lib/users/api.ts` и `lib/groups/api.ts` копируют именно эту форму, но возвращают `T` через `requestJson` и берут ключи SWR из `usersKeys`/`groupsKeys`.

**Инвалидация по ключам:** сейчас строки ключей разбросаны (`EditUserDialog.tsx:237,269`, `ReinviteUserDialog.tsx`, `UsersTable.tsx`); значения (`'/api/users'`, `'/api/groups'`) остаются прежними.

**Перевод глобального поиска:** `lib/search/api.ts:4-16` сейчас читает `data?.error || 'Не удалось выполнить поиск'` - это и есть образец `readApiError`, помощник входит в модуль. Сигнатура `searchAll(query, scope, limit)` получает `signal`.

### HTTP-02/UI. Блок ошибки загрузки (Поверхность 1)

**Образец: `components/ui/alert.tsx`** (`Alert` с `role="alert"` по умолчанию, `variant="destructive"`, `[&>svg]:absolute` под пиктограмму) и единственный существующий вызов с `Alert`+`AlertTitle`+`AlertDescription`:

`components/users/dialogs/EditUserDialog.tsx:390-399`:

```tsx
<Alert variant="destructive">
	<ShieldCheck className="h-4 w-4" />
	<AlertTitle>Внимание</AlertTitle>
	<AlertDescription>...</AlertDescription>
</Alert>
```

и `:116-124` (`RoleZoneAlert`, отдельный компонент с `Alert`). Новый компонент берёт ровно эту структуру плюс `Button` из UI-SPEC (`rounded-3xl`, `RotateCw`/`Loader2`, `aria-busy`/`aria-disabled`, без `disabled`).

Строки, которые блок заменяет (все видимые на 1d800af): `GroupsClient.tsx` (`Не удалось загрузить группы. Обновите страницу.`), `TestsClient.tsx` (`<p role="alert">Не удалось загрузить темы</p>`), `UserProfileAssignmentsPage.tsx:309` (`Не удалось загрузить пользователя`), тосты `Ошибка загрузки` и `Ошибка загрузки пунктов меню` в `ScoringSettingsPageClient.tsx` и `SidebarSettingsClient.tsx`.

Логика «показывать/не показывать повтор» - чистая функция от `kind`/`status` в `lib/http/errors.ts` (по UI-SPEC: скрыть при 403/404, `auth` и `aborted` - блока нет), тестируется Vitest без DOM, как `lib/tests/bank-view.ts` (`:128-129` статус → сообщение).

### HTTP-04. Серверный примитив D-13 и страницы

**Образец: `lib/session/server.ts:11-24`**:

```typescript
export const getServerMe = cache(async (): Promise<ServerMe | null> => {
	const url = new URL('/api/auth/me', requireApiOrigin())
	const cookieStore = await cookies()
	const response = await fetch(url, {
		headers: { cookie: cookieStore.toString() },
		cache: 'no-store',
		redirect: 'error',
	})
	if (response.status === 401) return null
	if (!response.ok) throw new Error(`GET /api/auth/me failed with status ${response.status}`)
	const body: unknown = await response.json()
	return parseAuthMe(body)
})
```

Новый примитив строится по тому же шаблону на `apiUrl(path)` из `lib/session/api-origin.ts:16-18` (там уже проверка `http:`/`https:` и сообщения вида `API_ORIGIN is not set`). Возвращает `ObjectAccess`-подобный исход (`lib/session/object-access.ts:1-8`: `'ok' | 'denied' | 'missing' | 'error'`), дополненный `unauthorized`, и всегда читает тело (`await response.text()`/`json()`/`discard`). Тест: копия обвязки `lib/session/server.test.ts:1-60` (хост `holders.cookie`, `vi.mock('next/headers')`, `vi.mock('next/navigation')` с бросающими `redirect`/`notFound`, поддельный `fetch` с флагом «тело прочитано»).

**Страницы, которые меняются (на 1d800af):**

- `admin/attempts/page.tsx:8-22` - сейчас `try { ... if (!res.ok) return null } catch { return null }` и `rows ?? []`; новое поведение по UI-SPEC: 401 → `redirect(buildLoginRedirect('/admin/attempts'))`, 403/404 → `notFound()`, иное → исключение в `error.tsx`.
- `admin/attempts/[id]/page.tsx:17-40,44-60` - `objectAccess(res.status)` и `AccessDeniedState` при `denied` **сохраняются** (отступление от D-13, UI-SPEC Поверхность 3); `missing` и `error` сейчас оба идут в `notFound()`, `error` нужно перевести в исключение.
- `admin/users/[id]/page.tsx:11-30,32-52` - `resolveLoginByUserId` ищет в `/api/users` (первые 100); заменяется на `GET /api/users/:id`, остальное (редирект на `/profile/<login>`, гейт `tests.manage_assignments` `:41`, `getServerMe` `:35`) без изменений.
- `admin/tests/[topicSlug]/[testSlug]/layout.tsx:8-24` - уже использует `objectAccess` и `AccessDeniedState`; меняется только способ запроса (`absoluteUrl` → примитив), 404/5xx по UI-SPEC не ломают дочернюю страницу.

**Что удаляется:** `lib/http/absoluteUrl.ts` целиком (`:5-20` строит origin из `x-forwarded-host`), ключи `APP_ORIGIN`/`NEXT_PUBLIC_APP_ORIGIN` в `app/web/.env.example:13-14`, `scripts/lib/e2e-web-env.mjs:53-54`, `scripts/lib/e2e-web-env.test.mjs:95-96`.

### HTTP-03 (D7). Маршруты `GET /api/users/:id` и `GET /api/users/by-login/:login`

**Образец: `app/server/src/routes/users/index.ts` (на 1d800af).**

Регистрация и порядок: монтирование подроутеров `:41-44` (`/profile`, `/avatar`, `/` sessions, `/` login-throttle), затем `GET /directory` `:54`, `GET /` `:115`, `PATCH /:id` `:225`, `DELETE /:id` `:351`, `GET /:userId/test-attempts` `:368`, `GET/POST/DELETE /:userId/test-assignments` `:419`, `:460`, `:482`. `GET /:id` не пересекается с `PATCH`/`DELETE /:id`; `/by-login/:login` - два сегмента; регистрировать нужно **до** параметрических `GET /:userId/...` не обязательно (число сегментов разное), но **после** `/directory`.

Шаблон маршрута с проверкой зоны (копировать форму `GET /:userId/test-attempts`, `:368-377`):

```typescript
router.get(
	'/:userId/test-attempts',
	validateUUID('userId'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const { userId } = req.params as { userId: string }
			...
```

Для D7: `validateUUID('id'), sessionRequired(), requirePerm('users', 'read')`, затем `canReadUser(req, id)` из `services/access-policy/index.ts` (импорт уже есть в `routes/users/index.ts:20-30`; тип - `scope-rules.ts:21`, реализация `:131`). Нет строки → 404 `{ error: 'Пользователь не найден' }`; вне зоны → 403 `{ error: 'Forbidden' }`.

Селектор и сериализатор: блок `db.select({...}).from(users).leftJoin(...).groupBy(...)` `:128-198` и `rows.map` `:200-221` вынести в общую функцию и использовать в трёх маршрутах (D-11 «один запрос строки и один сериализатор»). Аватар: `avatarUrl(row.avatar)` из `services/storage/links.ts` (импорт `:27`). Тип ответа - `UserRow` из `types/db/users.ts` (импорт `:28`). Логин для `by-login`: `login.toLowerCase().trim()`.

**Тесты (копировать формы):**

- Харнесс `startAuthApp` / `seedUser` / `login` / `call`: `routes/users/users-list.characterization.test.ts:1-45`; сами функции `app/server/src/test-support/auth-app.ts:46-107,144-172`.
- Сид 150 пользователей для «150-й находится»: `seedUser(ctx, { login, roles, password })` в цикле, как в `users-list.characterization.test.ts:25-27`.
- 401: `call(ctx, 'GET', '/api/users')` без cookie → `401 { error: 'Unauthorized' }` (`:39-43`).
- 403 при `users.read` deny: профили и гранты - `routes/tests/access-routes.test.ts:7-60` (`PROFILES` с `grants: [{ domain, action, allow }]`, имя `admin_deny_tests_read`).
- Учитель (свой ученик 200, чужой 403): `routes/users/teacher-zone-users.matrix.test.ts` (530 строк) - расширить матрицу, а не писать новую.
- Конкретика `directory.test.ts` (289 строк) - второй образец для тестов `/directory`, который регистрируется прямо перед `/:id`.

**Охранный тест зоны:** `scripts/teacher-zone-guards.test.mjs:29-37,226-` проверяет, что объектные маршруты решают доступ функциями шва; новые два маршрута добавить в `INVENTORY` с `OBJECT` и `['canReadUser(']`.

### Web-сторона D7

`components/users/UserProfileAssignmentsPage.tsx:106-112` (на 1d800af) ищет пользователя в списке 100 строк; заменить на `getUserByLogin(login)` из `lib/users/api.ts` (новый, возвращает `User`/`null`; 403/404 → «Пользователь не найден»). Ссылка поиска `database-search.ts:237` (`/admin/users/<id>`) не меняется.

### RT-01. SSR без `document`/`window`

**Точки:**

- `components/editor/plugins/code-action-menu-plugin.tsx:156-158` - `anchorElem = document.body` как значение по умолчанию параметра; тип уже `HTMLElement | null`, проверка `if (!anchorElem) return null` на `:160`. Правка - убрать умолчание, обязательный `anchorElem`. Вызывающий `plugins.tsx:256` уже передаёт `floatingAnchorElem` из состояния.
- `components/editor/plugins/actions/counter-character-plugin.tsx:8-31` - `window.TextEncoder` (`:11,16`) → `globalThis.TextEncoder`; образец без `window`: `utils/doc-serialization.ts:30` (`new TextEncoder().encode(...)`).
- Остальные 117 упоминаний `document`/`window`/`navigator`/`localStorage` в `components/editor/**` (119 всего, 2 найдены выше): выборочно - `plugins/images-plugin.tsx:37,48` и `plugins/actions/speech-to-text-plugin.tsx:26,45,53` уже защищены `CAN_USE_DOM` (`components/editor/shared/can-use-dom.ts`), это образец защиты для уровня модуля. Каждое обращение нужно классифицировать: «внутри эффекта/обработчика» (допустимо) или «при рендере/на уровне модуля» (правка).

**SSR-тест (образец структуры):** `lib/session/server.test.ts:1-60`. Среда уже `node`, `document` и `window` отсутствуют, значит достаточно `renderToString(createElement(Editor, { preset: 'full' }))` и `assert.doesNotThrow`. Подмену `next/dynamic` делать через `vi.mock('next/dynamic', ...)` в той же форме, что `vi.mock('server-only', () => ({}))` (`server.test.ts:11`). Конфиг: `vitest.config.ts` - `environment: 'node'`, `include: ['**/*.test.ts']` (**только `.test.ts`**, не `.tsx`: файл теста писать без JSX через `createElement`).

### RT-02. Debounce, подписка тулбара, распознавание речи

**Образец шва: `lib/session/keep-alive.ts:14-37`**:

```typescript
export type KeepAliveOptions = {
	refresh: () => Promise<RefreshOutcome>
	...
	doc: KeepAliveDocument
	now?: () => number
	setTimer?: (callback: () => void, ms: number) => unknown
	clearTimer?: (handle: unknown) => void
}

export function createKeepAlive({ ..., doc, now = () => Date.now(),
	setTimer = (callback, ms) => setTimeout(callback, ms),
	clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: KeepAliveOptions): KeepAlive {
```

Структурный интерфейс вместо реального `Document` (`KeepAliveDocument` `:8-12` - только три члена) - так же описать `ToolbarEditorLike` (`registerCommand`, `getEditorState`) и `SpeechRecognitionLike` (`addEventListener`, `removeEventListener`, `abort`, `start`, `stop`). Результат с `update()`/`stop()` - форма `KeepAlive` `:24-27` - для `createDebounced(...)` с `cancel`.

**Образец поддельного окружения для теста: `lib/session/keep-alive.test.ts:12-35`** (`fakeDocument` со множеством слушателей и `listenerCount()`), `setup(...)` `:40-` и `vi.useFakeTimers`. Для тулбара и речи нужен тот же ход: «поставил слушатели - счётчик равен N - `dispose()` - счётчик 0».

**Что менять (на 1d800af):**

- `editor-hooks/use-debounce.ts:5-22` - `funcRef.current = fn` на `:7` пишется при рендере; нужно в изоморфном layout-эффекте; `lodash.debounce` в `useMemo` по `[ms, maxWait]`; добавить `cancel()` при размонтировании. Вызывающие: `plugins/code-action-menu-plugin.tsx:45`, `editor-ui/code-button.tsx:19`. Рядом есть `hooks/useDebounce.ts:9` (значение, другая сигнатура, не путать).
- `editor-hooks/use-update-toolbar.ts:7-32` - `useEffect(..., [activeEditor, callback])` дважды; `callback` меняется на каждый рендер, поэтому подписка пересоздаётся. Колбэк в ref, зависимость только `[activeEditor]`. Потребители (11 файлов): `plugins/toolbar/{font-format,font-family,block-format,font-size,element-format,subsuper,link,font-color,code-language,font-background,line-height}-toolbar-plugin.tsx`.
- `plugins/toolbar/toolbar-plugin.tsx:19` - `const $updateToolbar = () => {}` новая функция на каждый рендер, значение `ToolbarContext` нестабильно; `:21-30` эффект с зависимостью `[editor, activeEditor]`.
- `plugins/actions/speech-to-text-plugin.tsx:47-86` - слушатель `result` добавляется один раз при создании и не снимается; cleanup `:79-83` вызывает только `stop()`; нужно `abort()`, `removeEventListener` для `result`/`end`/`error`, `recognition.current = null`, флаг «размонтирован».

### RT-03. Reduced-motion

Образцов в коде нет (ни `motion-reduce:`, ни `prefers-reduced-motion`). Использовать варианты Tailwind из D-18 и один помощник. Единственный JS-кандидат: `components/tests/attempt-review/attempt-review-utils.ts:394` (`scrollIntoView({ behavior: 'smooth', block: 'start' })`). В `components/editor` анимации (`transition-`, `duration-`) только в `plugins/floating-text-format-plugin.tsx` и `plugins/images-plugin/MediaLibrary.tsx`. Помощник `prefersReducedMotion()` - чистая функция со швом `matchMedia` (по образцу `CAN_USE_DOM` в `components/editor/shared/can-use-dom.ts` и швов `keep-alive.ts`), тестируется без DOM подменой аргумента.

### RT-04. React Doctor и сборка

Образец оформления отчёта - таблица в `08-REACT-DOCTOR.md` (форма в CONTEXT D-19). Сборка web в CI: `.github/workflows/*.yml:116-119` (`yarn workspace @bio-exam/web build`, плейсхолдер `API_ORIGIN`); ту же команду выполнить в плане.

### PERF-01. Параллельный глобальный поиск

**Образец: `services/search/database-search.ts:391-419` (на 1d800af)** - сам цикл:

```typescript
const categories: SearchCategory[] = []
for (const scope of scopes) {
	const available = canRunScope(scope, params.access)
	let items: SearchResultItem[] = []
	if (available && query.length >= 2) {
		if (scope === 'tests') items = await searchTests({ query, like, limit, access: params.access })
		if (scope === 'questions') items = await searchQuestions({ query, like, limit, tests: params.access.tests })
		if (scope === 'users') items = await searchUsers({ query, like, limit, users: params.access.users })
		if (scope === 'groups') items = await searchGroups({ query, like, limit, groups: params.access.groups })
		if (scope === 'attempts') items = await searchAttempts({ query, like, likeAlt, limit, access: params.access })
	}
	categories.push({ scope, title: CATEGORY_TITLES[scope], available, items })
}
```

Порядок категорий сейчас фиксирован массивом `scopes` `:396-397` (`['tests','questions','users','groups','attempts']`), доступность - `canRunScope` `:89-97` (тесты и попытки всегда, вопросы - `tests.write` и зона тестов, пользователи - `users.read`, группы - `groups.manage_groups`). Параллельный вариант: `await Promise.all(scopes.map(async (scope) => ({...})))` сохраняет порядок массива автоматически; важный инвариант - порядок категорий берётся из индекса, а не из порядка завершения.

Шов запросов: единственная точка выхода в БД - `queryRows` `:111-114` (`pgPool.query`). В `database-search.ts` ровно 6 вызовов `queryRows` (`:127,183,224,264,301,350`), значит `searchTests` может делать **два** запроса (ветка с зоной и без нее); это нужно записать в замер, не предполагать «один на категорию». Тестовый шов: добавить необязательный `executor` в `queryRows`/`SearchParams`.

Тесты поиска: `routes/tests/access-routes.test.ts` и `teacher-zone-tests.matrix.test.ts` частично покрывают права; матрицу прав категорий закрепить характеризацией до правки (D-20).

### PERF-02. Загрузка промптов

**Образец ограниченной параллельности: `services/question-content/relocate.ts:16,258-268`**:

```typescript
export const COPY_CONCURRENCY = 8
for (let index = 0; index < pairs.length; index += COPY_CONCURRENCY) {
	const batch = pairs.slice(index, index + COPY_CONCURRENCY)
	const results = await Promise.allSettled(batch.map((pair) => module.copy(pair.from, pair.to)))
	...
}
```

и `read.ts:83-95` (`readTexts`, `ADMIN_READ_CONCURRENCY = 5`):

```typescript
for (let i = 0; i < keys.length; i += ADMIN_READ_CONCURRENCY) {
	const batch = keys.slice(i, i + ADMIN_READ_CONCURRENCY)
	const contents = await Promise.all(batch.map((key) => module.readText(key)))
	...
}
```

Обе - партии, а не скользящее окно (медленный объект держит всю партию). D-21 требует «не больше константы одновременных чтений» - партии это выполняют; скользящее окно - улучшение по усмотрению планировщика, тогда оно заменяет оба места.

Кандидаты устаревших путей одного вопроса - **последовательно**: `read.ts:56-65` (`findFirstMarkdown`, цикл `for (const candidate of candidates)` с `readText` и `trim().length > 0`), `isReadableKey` `:44-54` (`StorageKeyError` - пропустить кандидата). Режимы ошибок D-03 фазы 7: `read.ts:67-68` (`?? ''`).

**Места, которые читают список и должны использовать единую функцию:**

| Место | Сейчас |
|-------|--------|
| `question-content/read.ts:134-153` (`readAdminTest`) | партии по 5, без кандидатов путей (читает `promptPath` напрямую) |
| `routes/tests/public.ts` `~300-325` и `~370-385` (прохождение, чтение теста) | неограниченный `Promise.all` по вопросам, локальная обёртка `readFirstMarkdown` `:57-59` над `readFirstQuestionMarkdown` |
| `routes/tests/public.ts` `~598-620` (`scoreSubmission.readExplanation`) | по вопросу |
| `routes/tests/index.ts:1721-1740` (разбор попытки админом) | неограниченный `Promise.all` с `readQuestionMarkdown` |
| `question-content/export.ts:104-124` | строго последовательно по вопросам и файлам |
| `question-content/asset-index.ts:150` | `findFirstMarkdown` |
| `app/server/src/scripts/backfill-question-search.ts:56` | `readFirstMarkdown([row.promptPath])` в цикле (скрипт, вне охвата) |

Тесты на считанные одновременные чтения: in-memory адаптер `services/storage/adapters/memory.ts` (в `BIO_EXAM_ISOLATED_ENV=1`), контрактные тесты `storage.contract.test.ts` и `question-content/read.test.ts` (266 строк) - форма для нового теста; задержка и счётчик пишутся обёрткой над `memory`.

### PERF-03. Профили редактора и ленивые группы

**Образец ленивости: `components/editor/plugins/emoji-picker-plugin.tsx:21-24,62-71`**:

```typescript
const LexicalTypeaheadMenuPlugin = dynamic(
	() => import('@lexical/react/LexicalTypeaheadMenuPlugin').then((mod) => mod.LexicalTypeaheadMenuPlugin<EmojiOption>),
	{ ssr: false }
)
...
useEffect(() => {
	let mounted = true
	import('../utils/emoji-list').then((file) => { if (mounted) setEmojis(file.emojiList) })
	return () => { mounted = false }
}, [])
```

Эта же форма в `mentions-plugin.tsx:19` и `component-picker-menu-plugin.tsx:17`. Проблема: тот же 324 КБ `emoji-list.ts` (324 276 байт) статически тянет `transformers/markdown-emoji-transformer.ts:5`, которого использует `utils/mdx-converter.ts:14,23` - поэтому динамический `import` в пикере чанк не выделяет. Для D-22 `EMOJI` должен читать таблицу, загруженную `mdxToEditorState`, который уже асинхронный (`mdx-converter.ts:38-53`, `Promise<void>`).

Пресеты: `plugins-config.ts:67-118` (`full`, `minimal`, `standard`, `document`), `isPluginEnabled` `:122-137`. `QuestionEditor` остаётся на `full`. `plugins.tsx` (367 строк) - основная точка, где группы переключаются через `isPluginEnabled`.

Золотые тесты MDX: чистые функции `mdxToEditorState`/`editorStateToMdx` вне DOM не вызываются (нужен Lexical-редактор без DOM): проверить, умеет ли `createEditor()` работать в `node`; если нет - STOP по D-17 (DOM-среда = новая dev-зависимость).

Бюджет чанка: образец скриптов проверки сборки - `scripts/check-exam-core-dist.mjs`, `scripts/check-rbac-dist.mjs` (шаги `verify`), но новый скрипт в `yarn verify` не входит; команда `yarn …` должна существовать для `scripts/check-docs-commands.mjs`.

### PERF-04. Поточный ZIP и экспорт

**Образец: `services/storage/zip.ts`** (буферный сборщик фазы 7):

```typescript
function packZip(files: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const archive = archiver('zip', { zlib: { level: 9 } })
		const chunks: Buffer[] = []
		archive.on('data', (chunk: Buffer) => chunks.push(chunk))
		archive.on('end', () => resolve(Buffer.concat(chunks)))
		archive.on('warning', reject)
		archive.on('error', reject)
		for (const file of files) archive.append(file.data, { name: file.name })
		void archive.finalize()
	})
}
```

и `buildZip` `:56-72`: `assertEntryNames(entries)` (zip slip, `ZipEntryNameError`), все объекты читаются подряд в память, `missing-files.txt` в конец (`MISSING_FILES_ENTRY`). Новое: поток при тех же правилах имён, уровне сжатия 9, той же раскладке `ZipEntry` (`{ name, key } | { name, buffer }`) и порядке; **эквивалентность** проверяется тестом, который собирает архив обоими сборщиками на одном состоянии и сравнивает sha256 несжатого содержимого записей (D-24). Образец тестов экспорта и разбора ZIP: `services/question-content/export.test.ts` (465 строк), `services/storage/links.test.ts`.

Экспорт: `question-content/export.ts` -

- `ZIP_RESPONSE_LIMIT_BYTES = 4_400_000` `:15` и сообщение `ARCHIVE_TOO_LARGE_MESSAGE` `:17`;
- `assertArchiveFits(buffer, limitBytes)` `:41-43` бросает `ApiError(413, ...)`;
- N+1: `collectTestParts` `:90-136` - на каждый тест отдельный `select` вопросов `:97-101` и отдельный `answerKeysEntry(questionRows)` `:67-81`; в `buildTopicArchive` `:170-203` цикл по тестам темы с `collectTestParts` в каждом `:190-195`; чтение промптов построчно `:104-124` (`findFirstMarkdown`);
- порядок записей: сортировка `byName` `:46-48,160-161`, общие ассеты `:138-140` в конце.

Приёмники (D-25): сегодня `res.send(archive.buffer)` в `routes/tests/index.ts:1479-1494` (тест) и `:1496-1511` (тема); заголовки `Content-Type`/`Content-Disposition` ставятся в самих обработчиках. Новое: заголовки после всех проверок, `res` как приёмник потока. 403/404 приходят **до** сборки (`canReadTest` `:1483`, `testScope` `:1498-1500`).

Веб: `admin/tests/TestsClient.tsx:198,218`, `[topicSlug]/TopicTestsClient.tsx:87,107`, `test-editor/test-editor-api.ts:91` - все три скачивают через `apiFetch` и `res.blob()`; идут через `requestBlob`.

### PERF-05. Бенчмарки

Образцов измерения времени в коде нет. Для запуска: `scripts/with-test-db.mjs` (изолированная `test_*` база), `app/server/src/test-support/test-database.ts` (`createScratchDatabase`, `migrateTestDatabase`, `requireTestDatabaseUrl`), `app/server/src/test-support/auth-app.ts:46` (`startAuthApp`). `PG_POOL_MAX` для записи в замер читать из `app/server/src/db/index.ts`.

### DECOMP-01/02. Инвентарь `routes/tests/index.ts` (на 1d800af, 1755 строк)

Хелперы выше маршрутов (используются несколькими доменами - общий модуль при нарезке): схемы `:96-155` (`GlobalScoringRulesPayloadSchema`, `TestScoringRulesPayloadSchema`, `QuestionTypeKeySchema`, `Create/UpdateQuestionTypePayloadSchema`, `TopicTeachersSchema`, `PutTestQuestionTypeOverrideSchema`), `validateScoringRuleTemplateCompatibility` `:156`, `ensureGlobalScoringRules` `:166`, `syncQuestionPointsForTestByTypeConfig` `:188` (используют типы вопросов **и** правила баллов), черновики `:215-272` (`QuestionDraftRow`, `normalizeQuestionDraftPayload`, `toQuestionDraftResponse`, `toQuestionDraftListItem`), `upload` (multer) `:1424`, `requireTestWrite` `:1439`, `studentAttemptsInScope` `:1520`, `isEmptyScope` `:1525`.

Маршруты в порядке регистрации:

| Строка | Метод и путь | Домен (предложение) |
|--------|--------------|---------------------|
| 273 | GET `/topics` | темы |
| 305 | GET `/topics/teacher-options` | темы |
| 314 | PUT `/topics/:id/teachers` | темы |
| 346 | POST `/topics` | темы |
| 382 | PATCH `/topics/:id` | темы |
| 402 | DELETE `/topics/:id` | темы |
| 422 | GET `/` | тесты (список) |
| 470 | GET `/question-types` | типы вопросов |
| 521 | GET `/question-types/:key` | типы вопросов |
| 540 | POST `/question-types` | типы вопросов |
| 596 | PATCH `/question-types/:key` | типы вопросов |
| 674 | DELETE `/question-types/:key` | типы вопросов |
| 710 | GET `/question-types/tests/:id/overrides` | типы вопросов |
| 727 | PUT `/question-types/tests/:id/overrides/:key` | типы вопросов |
| 811 | DELETE `/question-types/tests/:id/overrides/:key` | типы вопросов |
| 845 | GET `/scoring-rules/global` | правила баллов |
| 855 | PUT `/scoring-rules/global` | правила баллов |
| 895 | GET `/scoring-rules/tests/:id` | правила баллов |
| 921 | PUT `/scoring-rules/tests/:id` | правила баллов |
| 965 | GET `/by-slug/:topicSlug/:testSlug` | тесты |
| 988 | POST `/:testId/question-drafts` | черновики вопросов |
| 1018 | GET `/:testId/question-drafts` | черновики вопросов |
| 1042 | GET `/:testId/question-drafts/:draftId` | черновики вопросов |
| 1077 | PATCH `/:testId/question-drafts/:draftId` | черновики вопросов |
| 1159 | DELETE `/:testId/question-drafts/:draftId` | черновики вопросов |
| 1193 | GET `/:id` | тесты |
| 1207 | POST `/save` | тесты |
| 1248 | PATCH `/:id/settings` | тесты |
| 1274 | POST `/:id/questions` | вопросы |
| 1298 | PATCH `/:id/questions/:questionId` | вопросы |
| 1325 | PUT `/:id/questions/reorder` | вопросы |
| 1345 | POST `/:id/questions/:questionId/move` | вопросы |
| 1385 | DELETE `/:id/questions/:questionId` | вопросы |
| 1408 | DELETE `/:id` | тесты |
| 1448 | POST `/:id/assets` (multer `upload` `:1424`, `requireTestWrite` `:1439`) | ассеты |
| 1479 | GET `/:id/export` | экспорт |
| 1496 | GET `/topics/:slug/export` | экспорт |
| 1518 | USE `/:testId/assignments` (`assignmentsRouter`) | уже отдельный файл |
| 1534 | GET `/admin/dashboard` | дашборд и попытки |
| 1616 | GET `/admin/attempts` | дашборд и попытки |
| 1681 | GET `/admin/attempts/:attemptId` | дашборд и попытки |

Выводы о границах (непрерывные отрезки текущего порядка, перестановки запрещены, D-31):

- **Непрерывные отрезки**: темы `273-420`, `GET /` `422` (тесты), типы вопросов `470-845` (в одном отрезке с переопределениями), правила баллов `845-965`, `GET /by-slug` `965` (тесты, но отдельный отрезок), черновики `988-1190`, тесты `1193-1273` (`/:id`, `/save`, `/:id/settings`), вопросы `1274-1407`, `DELETE /:id` `1408`, ассеты `1424-1478`, экспорт `1479-1511`, `USE assignments` `1518`, дашборд и попытки `1534-1755`.
- **Тесты (домен) разорваны на четыре отрезка**: `422`, `965`, `1193-1273`, `1408`. Суброутер «тесты» экспортирует несколько роутеров (D-31), либо `GET /` и `GET /by-slug` остаются как минимальные отрезки. Монтирование идёт строго в исходном порядке.
- **Опасные пары (покрыть характеризацией)**: `GET /topics` и `GET /topics/teacher-options` против `GET /:id` `:1193` (однозначно решается порядком); `GET /topics/:slug/export` `:1496` после `GET /:id/export` `:1479`; `PATCH /:id/questions/:questionId` `:1298` и `PUT /:id/questions/reorder` `:1325` (разные методы); `GET /by-slug/...` `:965` до `GET /:id` `:1193`; `/admin/*` после `GET /:id` (ОК: у `/:id` один сегмент, и он с `validateUUID`).
- Подроутеры публичных маршрутов монтируются **после**: `routes/index.ts:26-27` (`/tests` перед `/tests/public`); `app.ts:90-93` (`/healthz`, `/api`).

### DECOMP-01/02. Форма суброутера и точка сборки

**Образец суброутера: `routes/tests/assignments.ts:1-19,57-`**:

```typescript
import { Router, type Request } from 'express'
...
export const assignmentsRouter = Router({ mergeParams: true })
...
assignmentsRouter.get('/', validateUUID('testId'), sessionRequired(), async (req, res, next) => {
```

Для суброутеров без `mergeParams` (маршруты на корне `/api/tests` с собственными путями вроде `/:id/questions`) - `Router()` без параметров, как в `routes/tests/index.ts:94`; `mergeParams` нужен только при монтировании по префиксу с параметром (`/:testId/assignments` `:1518`).

**Образец точки сборки: `routes/index.ts:1-34`** (импорты, `Router()`, `router.use(path, sub)` в строгом порядке, `export default router`). Шаблон для нового `routes/tests/index.ts`:

```typescript
import { Router } from 'express'

import { assignmentsRouter } from './assignments.js'
import { topicsRouter } from './topics.js'

const router = Router()

router.use(topicsRouter)
router.use('/:testId/assignments', assignmentsRouter)

export default router
```

Экспорт `export default router` сохраняется: `routes/index.ts:12` импортирует `testsRouter from './tests/index.js'`.

### DECOMP-01. Характеризация регистрации и инвентарь

**Образец (интеграция через `app.ts`):** `routes/tests/access-routes.test.ts:1-60` - `startAuthApp(prefix)`, `seedUser`, `login`, `call`; профили и гранты как данные (`PROFILES`); форма проверки 401/403 - `users-list.characterization.test.ts:39-43`. Паттерн именования файла - `*.characterization.test.ts` (в каталоге: `question-content.characterization.test.ts`, `question-relocation.characterization.test.ts`, `avatar.characterization.test.ts`, `users-list.characterization.test.ts`).

**Образца обхода `router.stack` в коде нет** (поиск по `.stack`/`_router` в `app/server/src` и `scripts` пуст): генератор инвентаря (D-29) пишется с нуля. Ближайшие опоры:

- точка подключения: `app.ts:90-93` (`app.use('/healthz', ...)`, `app.use('/api', apiRouter)`) и `routes/index.ts:17-27`;
- проблема анонимных замыканий: `requirePerm` возвращает `permissionGuard(...)` с анонимной стрелкой (`middleware/auth/requirePerm.ts:9-27`), `sessionRequired()` - анонимная `async (req, res, next)` (`middleware/auth/session.ts:39-41`), `validateUUID` - замыкание (`middleware/validateParams.ts`). Именование через один помощник по D-29 делается без изменения поведения (`Object.defineProperty(fn, 'name', ...)`).
- форма снимка и сравнения «сгенерированное против файла»: `scripts/check-env-contract.mjs` + `scripts/env-contract.config.json` + `check-env-contract.test.mjs`, `scripts/check-migrations.mjs`/`compare-schema-dump.mjs` (снимок в репозитории, проверка в `verify`).
- новая команда `routes:inventory` в `app/server/package.json` (раздел `scripts` `:7-22`) и каждая `yarn ...` в документации - `scripts/check-docs-commands.mjs`.

### Охранные тесты `scripts/*.test.mjs`

**Образец (структура): `scripts/auth-no-role-string-checks.test.mjs:1-80`**:

```javascript
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/
const WEB_ROOT = 'app/web'
const WEB_CHECKS = [
	{ label: 'импорт pg или jsonwebtoken', pattern: /.../ },
	...
]
function findChecks(checks, source) { ... source.split('\n').forEach((line, index) => { ... }) }
```

`findChecks(checks, source)` возвращает `{ line, text, labels }`; список исключений поимённо - `SERVER_EXCEPTIONS` `:34-47` (`file`, `reason`, `fragment`, `count`). Для D-10 это формат исключений D-07: `{ file, reason, count }` на каждое место (`transport.ts`, `server.ts`, `proxy-refresh.ts`, `LoginPageClient.tsx`, `InviteClient.tsx`).

**Образец проверки на подделку: `scripts/draft-durability-guards.test.mjs:1-70,381`** - `TEST_RUNNER_CHECKS` как массив `{ label, match: (line) => ... }`, список файлов-исключений `HOOK_FILES` `:21-24`, использование `os.tmpdir()` для копий в негативных тестах (`teacher-zone-guards.test.mjs:440-474`: `copyFile(tmp, TESTS_ROUTES, ...)` с подмешанным нарушением и проверкой текста).

Прогон: `scripts/verify.mjs:70-75` (шаг `script-tests`, `node --test scripts/**/*.test.mjs`; нулевой набор - провал). Новый файл подхватывается автоматически, регистрировать не нужно.

**Охранный тест D-32 «в `index.ts` нет обработчиков и импортов `db`/`drizzle-orm`/хранилища/модуля содержимого»**: формат - те же `findChecks`, плюс `scripts/storage-no-private-access.test.mjs:55,325-326` (читает `TESTS_ROUTER`, считает `registrations(source)`), его нужно перевести на новую раскладку.

### Env-контракт

Новый ключ сервера (`EXPORT_ZIP_MAX_BYTES`): прочитать в `app/server/src/config/*` (где читаются остальные ключи; образец - `app/server/src/config/test-database-url.ts`) и добавить placeholder в `app/server/.env.example`; `scripts/check-env-contract.mjs:184` ругается на ключ в примере без читателя (`unused`) и на читателя без ключа. Удаляемые `APP_ORIGIN`/`NEXT_PUBLIC_APP_ORIGIN` в `app/web/.env.example:13-14` сейчас закомментированы (`# APP_ORIGIN=...`), но e2e-окружение их выставляет: `scripts/lib/e2e-web-env.mjs:53-54`.

## Общие образцы (для всех планов)

### Рабочие правила тестов web
**Источник:** `app/web/vitest.config.ts` - `environment: 'node'`, `include: ['**/*.test.ts']`, алиас `@` → `.`. Тесты - только `.test.ts`, без JSX и рендера; псевдонимы и `node:assert/strict` + `vitest` (`test`, `vi`, `afterEach`) по образцу `lib/session/keep-alive.test.ts:1-2`. Серверные тесты используют БД: `node scripts/with-test-db.mjs yarn workspace @bio-exam/server test` (`test_*`, `BIO_EXAM_ISOLATED_ENV=1`).

### Серверные модули и проверка доступа
**Источник:** `services/access-policy/index.ts` (`canReadUser`, `canReadTest`, `canWriteTest`, `testScope`, `userScope`, `groupScope`). Маршрут решает объектный доступ функцией шва; охранные тесты зон проверяют именно это (`teacher-zone-guards.test.mjs`).

### Ошибки и ответы сервера
**Источник:** `ApiError(status, message)` (`app/server/src/lib/errors.ts`, используется в `export.ts:41-43,161-164`), `ERROR_MESSAGES` из `lib/constants.js`, `next(e)` в `catch` каждого обработчика (`routes/users/index.ts:3xx`, `routes/tests/index.ts:1479-1494`). Форма ответа ошибки - `{ error: string }`.

### Веб-сессия
**Источник:** `lib/session/client.ts` (`apiFetch`, `AuthExpiredError`, цепочка 401), `lib/session/redirect.ts` (`buildLoginRedirect`), `lib/session/object-access.ts`. Модуль запросов и серверный примитив на них опираются, дублировать цепочку нельзя (ADR-0001).

### Работа с кодовой базой в агентах
**Источник:** `AGENTS.md` («Scope and safety», «Project commands»): `yarn verify` зелёный до закрытия; комментарии в коде не писать; env-ключи в примеры; `yarn`-команды в документации должны существовать.

## Образца нет

| Файл | Роль | Поток | Причина |
|------|------|-------|---------|
| Генератор инвентаря маршрутов (`routes:inventory`) | script | transform | В коде нет ни одного обхода `router.stack`; писать с нуля по D-29 |
| `motion-reduce:` варианты Tailwind | component | - | Ни одного вхождения в `app/web`; форма - D-18 |
| Потоковый приёмник ответа (`res` с backpressure, `archive.abort()`) | service | streaming | Сегодня везде `res.send(buffer)`; готового потока в `app/server/src` нет |
| Бюджет чанка (парсинг вывода `next build`) | script | batch | Скриптов, читающих сборку web, нет (`check-*-dist.mjs` проверяют `dist` пакетов) |
| `08-BENCHMARKS.md`, `08-REACT-DOCTOR.md` | doc | - | Форма в CONTEXT D-19, D-28 |

## Метаданные

**Область поиска образцов:** `app/web/{app,components,lib}`, `app/server/src/{routes,services,middleware,test-support}`, `scripts/`, `.github/workflows`, `docs/adr/0005-decompose-by-concept.md`.
**Основной источник контекста:** `08-CONTEXT.md` (D-01...D-35), `08-UI-SPEC.md` (Поверхности 1-3, 7-8), REQUIREMENTS HTTP-01...04, RT-01...04, PERF-01...05, DECOMP-01...02.
**Не проверялось:** `codegraph affected`/`impact` (индекс снят по основному дереву, старше worktree); `GroupSheet`, `routes/groups`, `routes/auth/invites.ts` читались только по именам вызовов.
**Дата извлечения:** 2026-10-05
