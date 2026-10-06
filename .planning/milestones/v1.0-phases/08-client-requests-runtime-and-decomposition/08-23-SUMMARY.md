---
phase: 08-client-requests-runtime-and-decomposition
plan: 23
subsystem: web/http (каталог ученика, попытка, дашборд, приглашение, охранный тест)
tags: [HTTP-01, HTTP-02, D-04, D-05, D-07, D-08, D-10, SEC-04]
status: complete
deferred_human_gate: false

requires:
  - phase: 08-04
    provides: request, requestJson, RequestOutcome, RequestError, fetcherWith, swrFetcher, failureMessage, LoadErrorAlert
  - phase: 08-22
    provides: последние импортёры @/lib/api-fetch — только DashboardClient.tsx и lib/session/client.test.ts
provides:
  - lib/tests/api.ts на модуле запросов с прежними публичными сигнатурами; все сегменты пути через encodeURIComponent (SEC-04 фазы 6)
  - lib/tests/admin-optional.ts — optionalAdminData(outcome)
  - lib/auth/invite-flow.ts — inviteValidationOutcome, inviteAcceptErrorText, loginAfterAcceptText, ACCEPT_FAILED_TEXT, ACTIVATED_LOGIN_MANUALLY_TEXT
  - scripts/web-requests-guards.test.mjs — охранный тест D-10 с поимённым списком исключений D-07
  - удалены lib/fetcher.ts, lib/swr-config.ts, lib/api-fetch.ts, components/editor/GitCommitModal.tsx
affects: [08-24, 08-25, 08-28]

actuals:
  tokens: 13300
  tasks: 3
  commits: 0
plan_head_before: fdca3a52f2b04bf27cb0e0c6846eaf8de23c5676
plan_head_after: fdca3a52f2b04bf27cb0e0c6846eaf8de23c5676

tech-stack:
  added: []
  patterns:
    - "Исход попытки поверх request: http → AttemptRequestError(status, body.error, body.attemptId), остальные отказы → RequestError"
    - "Черновик попытки поверх request: ответ сервера (ok, http, malformed, сбой чтения тела после ответа) → { kind: 'response', status }; auth, network, aborted без статуса → network"
    - "Охранный тест web-запросов: детекторы — функции от корня, проба на синтетическом дереве во временном каталоге, исключения { file, reason, count, test }"

key-files:
  created:
    - app/web/lib/tests/api.test.ts
    - app/web/lib/tests/admin-optional.ts
    - app/web/lib/tests/admin-optional.test.ts
    - app/web/lib/auth/invite-flow.ts
    - app/web/lib/auth/invite-flow.test.ts
    - scripts/web-requests-guards.test.mjs
  modified:
    - app/web/lib/tests/api.ts
    - app/web/app/(internal)/(protected)/tests/TestsPageClient.tsx
    - app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx
    - app/web/app/(internal)/invite/[token]/InviteClient.tsx
    - app/web/lib/session/client.test.ts
    - .agents/skills/bio-exam-web/SKILL.md
  deleted:
    - app/web/lib/fetcher.ts
    - app/web/lib/swr-config.ts
    - app/web/lib/api-fetch.ts
    - app/web/components/editor/GitCommitModal.tsx

key-decisions:
  - "saveAttemptDraft: исход response при любом полученном ответе, в том числе 2xx с телом не JSON (malformed со статусом) и сбое чтения тела после ответа (network со статусом) — прежний код тело не читал и отдавал статус любого ответа (решение исполнителя, автономно)"
  - "DashboardClient: ключ попыток ученика ['dashboard-attempts', ids] заменён строкой `dashboard-attempts:${ids}` — правило фазы «ключи SWR только строки»; mutate по этому ключу нигде нет (решение исполнителя, автономно)"
  - "Детектор const …fetcher = ловит любую константу с именем на fetcher/Fetcher, кроме `= fetcherWith(` (доменные фетчеры уровня модуля разрешены)"
  - "Детектор голого fetch( считает также window.fetch(, globalThis.fetch(, self.fetch( (обход правила через глобальный объект)"
  - "Детектор apiFetch ловит любое упоминание идентификатора вне lib/http и lib/session (импорт, реэкспорт, обращение через пространство имён); тестовые файлы не сканируются — им нужен vi.mock('@/lib/session/client')"
  - "Детектор headers().get('host') ловит любой .get('host') (в том числе через переменную `const h = await headers()`)"
  - "lib/api-fetch.ts в списке запрещённых файлов охранного теста вместе с lib/fetcher.ts и lib/swr-config.ts (D-05, Discretion: удалить)"
  - "InviteClient: путь проверки приглашения кодирует token (encodeURIComponent); сбой сети при входе после принятия даёт текст «…Теперь вы можете войти по логину.» вместо вечного «Выполняется вход...»; 2xx проверки с телом не объектом — «Ссылка недействительна (404).» вместо вечной «Загрузка…» (решение исполнителя, автономно)"

metrics:
  duration: 35min
  completed: 2026-10-05
---

# Phase 8 Plan 23: Каталог ученика и попытка на модуле запросов, дашборд и приглашение, удаление мёртвого кода и охранный тест web-запросов Summary

`lib/tests/api.ts` переведён на `request`/`requestJson` с прежними сигнатурами и семантикой фазы 6, все сегменты пути кодируются (SEC-04); дашборд читает данные администратора через `optionalAdminData`; разбор ответов приглашения вынесен в `lib/auth/invite-flow.ts`; `lib/fetcher.ts`, `lib/swr-config.ts`, `lib/api-fetch.ts` и `GitCommitModal.tsx` удалены; правило запирает `scripts/web-requests-guards.test.mjs` в шаге `script-tests`.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Выполнено

- **Задача 1 (tracer, TDD).** Сначала `lib/tests/api.test.ts` (vi.mock `@/lib/session/client`) и `admin-optional.test.ts`: прогон красный — 8 упали, 10 прошли (кодирование пути, `RequestError`, нет модуля `admin-optional`). Затем `lib/tests/api.ts`: `fetchJson` → `requestJson`; `fetchAttemptJson` → `request`, отказ `http` → `AttemptRequestError(status, code, attemptId)` из `body`, прочие → `RequestError`; `saveAttemptDraft` → `request` с `method: 'PATCH'`, `json`, `keepalive`; `too-large` до запроса; `fetchChartDefaultRange` при любом отказе → `{ value: 'month' }`; `segment = encodeURIComponent` для `testId`, `sessionId`, `topicSlug`, `testSlug`. Враждебный `sessionId` `'../x?y'` даёт путь `/api/tests/public/tests/t1/sessions/..%2Fx%3Fy/answers`. `attempt-draft-save.test.ts` (подделка глобального `fetch`) остался зелёным без правок. `admin-optional.ts`: `ok` → данные; `auth`, `http 401`, `http 403` → `null`; иное → `throw new RequestError(outcome)`. `DashboardClient.tsx`: `fetchAdminJson` = `optionalAdminData(await request<T>(url))`, ключи администратора прежние. `TestsPageClient.tsx`: `useSWR('public-tests-list', fetchPublicTestsList)`, локальной обёртки нет. Гейт tracer: `vitest run lib/tests components/tests` — 21 файл, 411 тестов, зелёный; повторён после правки экранов.
- **Задача 2 (TDD).** Сначала `lib/auth/invite-flow.test.ts`: красный (нет модуля). Затем `lib/auth/invite-flow.ts` и `InviteClient.tsx`: три голых `fetch` на месте (исключение D-07 №5), разбор ответа проверки, текста отказа принятия и исхода входа после принятия — чистые функции; видимые тексты прежние, недостижимая ветка `404/409` после `return` убрана вместе с переписанным `accept()`. `lib/session/client.test.ts`: тест «импорт без window не падает…» больше не импортирует `@/lib/api-fetch`, запрос идёт через `sessionModule.apiFetch` из `./client`, добавлена проверка, что `AuthExpiredError` из `@/lib/http/request` — тот же класс. Удалены четыре файла. `git grep --untracked -E "api-fetch|lib/fetcher|lib/swr-config|GitCommitModal|swrOptions|swrConfig" -- app/web` — пусто. Навык `bio-exam-web`, раздел «Запросы и сессия», описывает модуль запросов, SWR-ключи и фетчеры, тексты отказов, блок ошибки, доменные слои, цепочку 401, серверные страницы, исключения D-07 и охранный тест.
- **Задача 3.** `scripts/web-requests-guards.test.mjs`, четыре теста: дерево без нарушений; исключения D-07 существуют, с причиной, с точным `count` и тестом, где есть `401`; тесты модуля сессии существуют и проверяют `401`; проба на синтетическом дереве — каждое из 11 подмешанных нарушений ловится ровно одной строкой своего сообщения, разрешённые формы (`fetcherWith`, `.fetch(`, `prefetch(`, `apiFetch` и `fetch(` в `lib/http`, тестовые файлы) нарушений не дают.

## Исключения охранного теста

| Файл | count | Причина | Тест 401 |
|------|-------|---------|----------|
| `app/web/lib/http/*` | — | модуль запросов | `app/web/lib/http/request.test.ts` |
| `app/web/lib/session/*` | — | модуль сессии: `transport.ts` (`/me`, `/refresh`, `/logout`, `request`), `server.ts` (SSR), `proxy-refresh.ts` | `lib/session/client.test.ts`, `lib/session/server.test.ts`, `app/web/proxy.test.ts` |
| `app/web/app/(internal)/login/LoginPageClient.tsx` | 1 | вход: 401 — неверный пароль, 429 — троттлинг, а не истёкшая сессия | `app/web/lib/session/login-errors.test.ts` |
| `app/web/app/(internal)/invite/[token]/InviteClient.tsx` | 3 | анонимные проверка и принятие приглашения и вход после принятия: 401 входа не ведёт на `/login` | `app/web/lib/auth/invite-flow.test.ts` |

Детекторы (`app/web`, без `node_modules`, `.next`, `.turbo`, `.vercel`, `dist`, `out`, `coverage`, `test-results` и `*.test.*`/`*.spec.*`): удалённые файлы `lib/fetcher.ts`, `lib/swr-config.ts`, `lib/api-fetch.ts`; `const …fetcher =` не через `fetcherWith(`; голый `fetch(` (без точки и буквы перед ним, а также `window.`/`globalThis.`/`self.fetch(`) вне `lib/http`, `lib/session` и исключений, у исключения — ровно `count`; `apiFetch` вне `lib/http` и `lib/session`; `absoluteUrl`; `x-forwarded-host` (без регистра); `.get('host')`; массив первым аргументом `useSWR`/`useSWRImmutable`/`useSWRInfinite` с необязательным параметром типа, пробелами и переносами после `(`.

## codegraph

`codegraph impact` (до правок, индекс основного дерева, лог `scratchpad/08-23-impact.log`):
- `fetchJson` (`lib/tests/api.ts:6`) — 19 символов: функции чтения в `lib/tests/api.ts`, `TestLandingPageClient.tsx`, `TestsPageClient.tsx` (`fetcher:15`), `DashboardClient.tsx`, `StudentProgressSection.tsx`, `TestPageClient.tsx`.
- `fetchAttemptJson` (`:52`) — `startTestSession`, `submitPublicTestAnswers`, `use-attempt-lifecycle.ts` (`createBrowserAttemptLifecycle`).
- `saveAttemptDraft` (`:136`) — `attempt-draft-save.test.ts`, `use-attempt-lifecycle.ts` (`createBrowserAttemptLifecycle`, `useAttemptLifecycle`).
- `fetchAdminJson` (`DashboardClient.tsx:124`) — `DashboardClient`, `dashboard/page.tsx`.
- `GitCommitModal` — 1 символ, только сам компонент: импортёров 0 (подтверждено `git grep` в worktree), условие STOP не сработало.
- `apiFetch` — 144 символа в индексе на начало фазы; в worktree перед планом вне `lib/http` и `lib/session` его импортировали только `DashboardClient.tsx` (через `@/lib/api-fetch`) и `lib/tests/api.ts` (через `../api-fetch`) плюс `lib/session/client.test.ts`.
- `fetcher` — 17 определений в индексе на начало фазы; в worktree перед планом оставались `TestsPageClient.tsx:15` и `lib/fetcher.ts:2`.
- `swrConfig` — 1 символ, импортёров нет.

`codegraph affected` (индекс основного дерева, файлы плана): `TestsPageClient.tsx`, `lib/session/client.test.ts`, `lib/tests/admin-optional.ts`, `lib/tests/api.ts`. Индекс не содержит изменений фазы; по `git grep` в worktree затронуты также `lib/tests/attempt-draft-save.test.ts`, тесты `components/tests` (модуль попытки) и `lib/tests/api.test.ts` — все прогнаны.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/tests components/tests` — 21 файл, 411 тестов, passed.
- `yarn workspace @bio-exam/web vitest run lib/auth lib/session` — 11 файлов, 260 тестов, passed.
- `yarn workspace @bio-exam/web typecheck` — exit 0.
- `git grep -n --untracked -E "lib/api-fetch|lib/fetcher|lib/swr-config" -- app/web` — код 1 (совпадений нет). Проверка плана не видит относительный импорт (`lib/tests/api.ts` импортировал `../api-fetch`), поэтому дополнительно `git grep -E "api-fetch|swr-config|GitCommitModal|swrOptions|swrConfig" -- app/web` — пусто.
- `node --test scripts/check-docs-structure.test.mjs` — в составе `script-tests`, зелёный.
- `node --test scripts/web-requests-guards.test.mjs` — 4 из 4.
- `yarn verify` — `yarn verify: OK` (все 8 шагов passed; web — 1411 тестов; `script-tests` — 206 тестов, в том числе `web-requests-guards`). Лог `scratchpad/08-23-verify.log`.
- `yarn oxfmt --check .` — All matched files use the correct format.
- oxlint по новым и изменённым файлам — без предупреждений, кроме 7 прежних `no-unused-vars` в нетронутых строках `DashboardClient.tsx` (записаны в `deferred-items.md`).
- `yarn e2e` — 194 passed (1.7m), chromium-desktop и chromium-mobile, упавших и нестабильных нет, exit 0. Лог `scratchpad/08-23-e2e.log`.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-23` — `08-23 changed only its files`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `InviteClient`: незакодированный token в пути и необработанный сбой входа после принятия**
- **Found during:** Задача 2
- **Fix:** `encodeURIComponent(token)`; отказ сети при входе → тот же текст, что при 401. Число голых `fetch(` — 3, как в исключении.
- **Files modified:** `app/web/app/(internal)/invite/[token]/InviteClient.tsx`

## Оставшиеся передачи «для 08-23» вне файлов плана (не трогались)

- `app/web/lib/session/object-access.ts` и `object-access.test.ts` никто не импортирует — удалить.
- `candidatesSource`, `candidatesHint` в `app/web/lib/groups/group-form.ts` экран не использует; их импортируют только `lib/groups/api.test.ts:27,64-65` и `lib/groups/group-form.test.ts` — удалить вместе с тестами.
- Копия `parseQuestionTypes`/`questionTypesFetcher` в `test-editor-api.ts:81,111` (импортирует `useTestEditorModel.ts:29,110`, тест `test-editor-api.test.ts:33,461,473-474`) — перевести `useTestEditorModel.ts` на `lib/tests/admin-api.ts`, копию и её тест удалить.
- `reinviteErrorText({ status, text })` (`lib/users/invite-form.ts`, `ReinviteUserDialog.tsx:29` собирает `text` через `JSON.stringify(failure.body)`) — перевести на `body` вместе с `invite-form.test.ts`.
- Дубль инвалидации в `onSaved` `UserProfileAssignmentsPage` (её делает `EditUserDialog`).
- `lib/users/role-traits.ts` — `const ROLE_TRAITS_URL = '/api/rbac/roles'` на `rbacKeys.roles()`; в том же плане обновить `lib/rbac/api.test.ts:33`, который читает эту константу из исходника.
- `AdminTestListItem = Test` в `lib/tests/admin-api.ts:11` импортирует тип из `app/(internal)/(protected)/admin/tests/types` — перенос типов в `lib/tests` не делался.

## Передачи следующим планам

- Все: новый клиентский запрос — только через `@/lib/http/request` или доменный слой; `apiFetch` вне `lib/http` и `lib/session` ловит охранный тест (тестовые файлы не сканируются, `vi.mock('@/lib/session/client')` разрешён). Новое исключение D-07 — запись `{ file, reason, count, test }` в `FETCH_EXCEPTIONS` и тест с проверкой `401`. Ключ SWR массивом сразу после `useSWR(` — нарушение; ключ за тернарным оператором детектор не видит, следить в ревью.
- 08-24 и 08-25 (тесты и хуки редактора): `components/editor/GitCommitModal.tsx` удалён.
- 08-28: `lib/tests/api.ts` шлёт `cache: 'no-store'` и в PATCH черновика попытки (раньше `cache` не задавался); семантика `keepalive` и исходов прежняя.

## Deferred human verification

Нет шагов пользователя. Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- `.agents/skills/bio-exam-web/SKILL.md`
- `app/web/app/(internal)/(protected)/dashboard/DashboardClient.tsx`
- `app/web/app/(internal)/(protected)/tests/TestsPageClient.tsx`
- `app/web/app/(internal)/invite/[token]/InviteClient.tsx`
- `app/web/components/editor/GitCommitModal.tsx` (удалён)
- `app/web/lib/api-fetch.ts` (удалён)
- `app/web/lib/fetcher.ts` (удалён)
- `app/web/lib/swr-config.ts` (удалён)
- `app/web/lib/session/client.test.ts`
- `app/web/lib/tests/api.ts`
- `app/web/lib/tests/api.test.ts` (новый)
- `app/web/lib/tests/admin-optional.ts` (новый)
- `app/web/lib/tests/admin-optional.test.ts` (новый)
- `app/web/lib/auth/invite-flow.ts` (новый)
- `app/web/lib/auth/invite-flow.test.ts` (новый)
- `scripts/web-requests-guards.test.mjs` (новый)

`app/web/lib/tests/attempt-draft-save.test.ts` (optional) не менялся.

## Self-Check: PASSED

- Созданные файлы на месте: `lib/tests/api.test.ts`, `lib/tests/admin-optional.ts`, `lib/tests/admin-optional.test.ts`, `lib/auth/invite-flow.ts`, `lib/auth/invite-flow.test.ts`, `scripts/web-requests-guards.test.mjs`.
- Удалённые файлы отсутствуют: `lib/fetcher.ts`, `lib/swr-config.ts`, `lib/api-fetch.ts`, `components/editor/GitCommitModal.tsx`.
- Коммитов нет по правилу пользователя: `commits: 0`, `plan_head_before` = `plan_head_after` = `fdca3a5`; изменения в рабочем дереве.
- Сверка: `08-23 changed only its files`.
