---
phase: 08-client-requests-runtime-and-decomposition
plan: 05
subsystem: web
tags: [ssr, session, error-page, HTTP-04, SEC-07, CR-09]
status: complete

requires:
  - phase: 08-01
    provides: команда снимка 08-plan-files.cjs
provides:
  - serverRequest, requireServerData, ServerOutcome в app/web/lib/session/server.ts; getServerMe на том же примитиве
  - components/feedback/PageErrorState.tsx и страницы ошибки app/(internal)/(protected)/error.tsx, app/error.tsx
  - страницы /admin/attempts, /admin/attempts/<id> и layout теста в редакторе на serverRequest
  - e2e/tests/server-pages.spec.ts
affects: [08-11, 08-23, 08-28]

actuals:
  tokens: 6750
  tasks: 3
  commits: 0
plan_head_before: 0afc8498e71cd2fd43d79ed38e527fafbabda309
plan_head_after: 0afc8498e71cd2fd43d79ed38e527fafbabda309

tech-stack:
  added: []
  patterns:
    - "Серверный запрос к Express только через serverRequest('/api/...', { parse }): URL от API_ORIGIN, путь обязан начинаться с /api/ и остаться под /api/ после разбора URL, cookie запроса, cache no-store, redirect error"
    - "Тело ответа читается response.text() сразу после fetch, до разбора статуса; cancel() не вызывается ни на одной ветке"
    - "401 при заголовке запроса x-session-refresh: unavailable — исход error со status 401 (страница ошибки), без заголовка — unauthorized (вход)"
    - "Страница решает исход сама: denied до requireServerData, если нужен AccessDeniedState; requireServerData не оборачивается в try/catch"

key-files:
  created:
    - app/web/components/feedback/PageErrorState.tsx
    - app/web/app/(internal)/(protected)/error.tsx
    - e2e/tests/server-pages.spec.ts
  modified:
    - app/web/lib/session/server.ts
    - app/web/lib/session/server.test.ts
    - app/web/app/(internal)/(protected)/admin/attempts/page.tsx
    - app/web/app/(internal)/(protected)/admin/attempts/[id]/page.tsx
    - app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/layout.tsx
    - app/web/app/error.tsx

key-decisions:
  - "Ошибка конфигурации API_ORIGIN и недопустимый путь бросают исключение из serverRequest, а не исход error: getServerMe сохраняет контракт «ошибка конфигурации без запроса»"
  - "У исхода error для некорректного JSON нет cause: SyntaxError несёт фрагмент тела ответа (T-8-12); cause остаётся только у сбоя сети и у броска parse"
  - "requireServerData бросает Error без cause и без тела, в сообщении только путь страницы и статус"
  - "Путь возврата на вход в layout теста и на странице попытки собирается из encodeURIComponent сегментов, как и путь запроса"
  - "2xx, отличный от 200, считается ok только если тело разбирается; 204 даёт error"
  - "Страница попытки кодирует id через encodeURIComponent в пути запроса"

duration: ~10min
completed: 2026-10-05
---

# Phase 8 Plan 05: серверные страницы ходят в Express одним путём, страницы ошибки (HTTP-04) Summary

Примитив `serverRequest` в модуле веб-сессии (URL только от `API_ORIGIN`, тело читается на каждой ветке, 401 различает отказ и недоступность refresh), `getServerMe` и три серверные страницы на нём, русская страница ошибки с «Повторить» и «На главную» для сегмента `(protected)` и корня.

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве worktree `gsd/phase-08`.

## Что сделано

- Task 1 (tracer, TDD): тесты в `server.test.ts` написаны первыми (34 красных из 52), затем `server.ts` и `admin/attempts/[id]/page.tsx`; после реализации 52 passed, `typecheck` зелёный. Шлюз tracer: оба `<automated>` повторены — зелёные, затем Task 2.
- Task 2: `/admin/attempts` через `requireServerData`; layout теста через `serverRequest` с `view=summary`; `PageErrorState` по разметке Поверхности 3 дословно; обе страницы ошибки рисуют его с `digest` и `retry`.
- Task 3: `e2e/tests/server-pages.spec.ts` — список попыток без страницы ошибки; `/admin/attempts/not-a-uuid` (400 от `validateUUID`) показывает страницу ошибки с фокусом на `h1`, «Код ошибки:», «Повторить», «На главную», без английских строк, «Повторить» снова даёт страницу ошибки, «На главную» ведёт на `/dashboard`; страница теста в редакторе рисуется (layout пропускает).

## Итоговые сигнатуры

```typescript
export type ServerOutcome<T> =
	| { kind: 'ok'; data: T }
	| { kind: 'unauthorized' }
	| { kind: 'denied' }
	| { kind: 'missing' }
	| { kind: 'error'; status?: number; cause?: unknown }
export async function serverRequest<T>(path: `/api/${string}`, options: { parse: (body: unknown) => T }): Promise<ServerOutcome<T>>
export function requireServerData<T>(outcome: ServerOutcome<T>, currentPath: string): T
export const getServerMe: () => Promise<ServerMe | null>
```

Экспорты модуля: `getServerMe`, `requireServerData`, `serverRequest` (тест проверяет точный список).

## Исходы страниц

| Страница | 401 | 401 при недоступном refresh | 403 | 404 | 5xx, 400, сеть, некорректный JSON или конверт |
|----------|-----|-----------------------------|-----|-----|-----------------------------------------------|
| `/admin/attempts` | вход с `callbackUrl=/admin/attempts` | исключение → страница ошибки | `notFound()` | `notFound()` | исключение → страница ошибки |
| `/admin/attempts/<id>` | вход с возвратом на `/admin/attempts/<id>` | исключение → страница ошибки | `AccessDeniedState` «Нет доступа к попытке» | `notFound()` | исключение → страница ошибки |
| layout `/admin/tests/<topic>/<test>` | вход с возвратом на путь теста | дочерняя страница | `AccessDeniedState` «Нет доступа к тесту» | дочерняя страница | дочерняя страница |
| `getServerMe` | `null` | `null` (AppLayout ставит `sessionError` по заголовку, как раньше) | исключение | исключение | исключение |

## codegraph impact (по индексу основного дерева: в worktree `.codegraph/` нет)

- `getServerMe` (`lib/session/server.ts:12`): 43 затронутых символа — `AppLayout`, `app/layout.tsx`, `(protected)/layout.tsx`, `profile/page.tsx`, `profile/[id]/page.tsx`, `admin/users/[id]/page.tsx`, `lib/session/section-access.ts` и layout разделов `admin/*`. Контракт сохранён: 200 → `parseAuthMe(body)`, 401 → `null`, прочие отказы → исключение.
- `absoluteUrl` (`lib/http/absoluteUrl.ts:5`): 13 символов в четырёх вызывающих — `admin/tests/[topicSlug]/[testSlug]/layout.tsx`, `admin/users/[id]/page.tsx`, `admin/attempts/[id]/page.tsx`, `admin/attempts/page.tsx`. Три переведены здесь; `admin/users/[id]/page.tsx` и удаление файла — 08-11.
- `objectAccess` (`lib/session/object-access.ts:3`): `object-access.test.ts`, layout теста и страница попытки. После плана страницы его не импортируют; файл и тест не в `files_modified` и остаются.

## codegraph affected

`codegraph affected` по файлам плана: 7 файлов — `lib/session/server.test.ts`, `e2e/tests/server-pages.spec.ts` и layout/компоненты `admin/tests/*` (индекс считает их тестовыми целями). Новые файлы в индексе основного дерева отсутствуют. Все тесты web прогнаны в `yarn verify`, e2e — полным `yarn e2e`.

## Проверки

- `yarn workspace @bio-exam/web vitest run lib/session/server.test.ts` — 52 passed.
- `yarn workspace @bio-exam/web typecheck` — exit 0; `lint` — без замечаний по файлам плана.
- Проверка Task 2 (`node -e ...`) — `pages ok`.
- `yarn e2e tests/server-pages.spec.ts` — 14 passed (setup + 3 × 2 проекта).
- `yarn verify` — `yarn verify: OK` (web 57 файлов тестов, server 65, exam-core 12, rbac 1; все шаги passed).
- Полный `yarn e2e` — `184 passed`, exit 0 на chromium-desktop и chromium-mobile. Четыре строки `✘` в `editor-toolbar.spec.ts` (promptText пресета full) — тесты с `test.fail()`, те же, что в прогоне 08-04, считаются пройденными. CR-09 закрыт: тело читается на каждой ветке (юнит-тест с потоком, считающим чтение до конца и вызовы `cancel`), полный e2e зелёный.
- `node .planning/phases/08-client-requests-runtime-and-decomposition/08-plan-files.cjs check 08-05` — `08-05 changed only its files`.
- `route-inventory.txt` не перегенерировался: маршруты и middleware сервера не менялись.
- STATE.md, ROADMAP.md и REQUIREMENTS.md не менялись (как в 08-01 … 08-04): общий `.planning` у параллельных worktree, отметку HTTP-04 и продвижение плана делает оркестратор.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Проверка пути после разбора URL**
- **Found during:** Task 1
- **Issue:** путь `/api/../internal` проходит проверку префикса строки, а `URL` нормализует его в `/internal`.
- **Fix:** `resolveApiUrl` дополнительно требует `url.pathname.startsWith('/api/')` после `apiUrl(path)`; тест на четыре недопустимых пути без запроса.
- **Files modified:** `app/web/lib/session/server.ts`, `server.test.ts`

### Дополнение сверх behavior

В `server.test.ts` добавлены тесты исходов страницы попытки (не отклонение, а покрытие): 200, 403 (`AccessDeniedState`), 404, 401 (вход), 400/500/401 при недоступном refresh/конверт без `questions`/сбой fetch → исключение.

## Known Stubs

Нет.

## Threat Flags

Нет: новой поверхности сверх `<threat_model>` план не вводит. T-8-10 (три страницы), T-8-11, T-8-12 закрыты.

## Deferred human verification

- Страница ошибки на 375px (Поверхность 3, backstop): заголовок и код переносятся, кнопки друг под другом — сводно в 08-28. Мобильный проект e2e (Pixel 7) страницу открывает и кликает обе кнопки, визуальная проверка — за человеком.
- Коммит файлов плана делает ведущая сессия.

## Файлы к коммиту

- app/web/lib/session/server.ts
- app/web/lib/session/server.test.ts
- app/web/app/(internal)/(protected)/admin/attempts/page.tsx
- app/web/app/(internal)/(protected)/admin/attempts/[id]/page.tsx
- app/web/app/(internal)/(protected)/admin/tests/[topicSlug]/[testSlug]/layout.tsx
- app/web/components/feedback/PageErrorState.tsx
- app/web/app/(internal)/(protected)/error.tsx
- app/web/app/error.tsx
- e2e/tests/server-pages.spec.ts
- .planning/phases/08-client-requests-runtime-and-decomposition/08-05-SUMMARY.md

## Передачи следующим планам

- 08-11: `admin/users/[id]/page.tsx` переводится на `serverRequest('/api/users/<id>', { parse })` с исходами Поверхности 3 (401 → вход, 403 и 404 → `notFound()`, прочее → исключение; подходит `requireServerData`); после этого удаляется `lib/http/absoluteUrl.ts`. `objectAccess` страницы больше не импортируют — его судьбу решает 08-11 или 08-23 (файл не в `files_modified` 08-05).
- 08-23 и любые новые серверные страницы: только `serverRequest` + `requireServerData` (или ручной разбор `denied`, если нужен `AccessDeniedState`); `requireServerData` не оборачивать в try/catch. Ошибки страниц `(protected)` уходят в `(protected)/error.tsx`, вне него — в `app/error.tsx`.
- 08-28: сводная проверка страницы ошибки на 375px.
- Логи: `scratchpad/08-05-verify.log`, `08-05-e2e.log`, `08-05-e2e-spec.log`, `08-05-impact.txt`, `08-05-affected.txt`.

## Self-Check: PASSED

Все девять файлов кода на месте (`git status`: 6 изменённых, 3 новых); коммитов в плане нет по правилу пользователя, `plan_head_before` равен `plan_head_after`.
