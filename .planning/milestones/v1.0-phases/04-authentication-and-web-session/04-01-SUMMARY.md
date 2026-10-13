---
phase: 04-authentication-and-web-session
plan: 01
subsystem: testing
tags: [vitest, characterization, express, auth, rbac, postgres, known-defects]
status: complete
deferred_human_gate: true

requires:
  - phase: 03-exam-core
    provides: "app/server/src/routes/tests/exam-flow.test.ts (порядок scratch → migrate → resetModules → import app.js), KNOWN_DEFECTS + test.fails"
  - phase: 02-dependency-security
    provides: "app/server/src/test-support/http.ts (startTestServer), образец KNOWN_HOLES"
  - phase: 01-verification-baseline
    provides: "test-support/test-database.ts, scripts/with-test-db.mjs, yarn verify"
provides:
  - "app/server/src/test-support/auth-app.ts: startAuthApp, seedUser, login, call, cookieHeader, mergeCookies (+ parseSetCookies, nextIp); вход только через POST /api/auth/login, уникальный X-Forwarded-For из 198.18.0.0/15"
  - "Характеризация login → me → refresh → me → logout → me, requirePerm, отказов refresh и исходов D-04 через app.ts на test_* (27 тестов)"
  - "KNOWN_DEFECTS с шестью идентификаторами AUTH-01…AUTH-06, у каждого сопутствующий тест подготовки"
affects: [04-04, 04-05, 04-06, 04-07, 04-08]

actuals:
  tokens: 6500
  tasks: 3
  commits: 0
plan_head_before: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a
plan_head_after: 7a6f95a86f9fb74ce94c10d9141a120b40b8776a

tech-stack:
  added: []
  patterns:
    - "Auth-характеризация: AUTH_SESSION_ENFORCE_DB=1 и RBAC_USE_DB_OVERRIDES=1 выставляются до vi.resetModules() и динамического импорта app.js, db/index.js, db/schema.js; stop() возвращает три переменные окружения"
    - "Каждый запрос помощника идёт с уникальным x-forwarded-for (trust proxy 1), поэтому in-memory лимитеры входа 5/мин и refresh 10/мин не срабатывают; явный ip — только там, где он часть сценария (AUTH-06)"
    - "parseSetCookies хранит первое вхождение имени: у logout первая строка refresh_token — Path=/, legacy Path=/api/auth/refresh отбрасывается"
    - "defectTest(id, title, fn): test.fails, пока id в KNOWN_DEFECTS, иначе test; подготовка — отдельный обычный тест того же describe, состояние передаётся через переменную describe"

key-files:
  created:
    - app/server/src/test-support/auth-app.ts
    - app/server/src/routes/auth/auth-characterization.test.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
  modified: []

key-decisions:
  - "AUTH-01-db-error проверяется отдельным admin (defect_db_admin), у которого до RENAME не было ни одного запроса прав: 200 приходит из fail-open (NODE_ENV=test), а не из userCache; подготовка «маршрут 200 до вмешательства» сделана на другом admin (defect_db_probe)"
  - "AUTH-01 и AUTH-02 проверяют два статуса одним утверждением, чтобы сообщение об ошибке показывало оба фактических значения"

patterns-established:
  - "План, который чинит дефект, удаляет его идентификатор из KNOWN_DEFECTS в auth-known-defects.test.ts; тело проверки не меняется"
  - "Значения Max-Age и тексты ошибок не закрепляются (D-06, UI-SPEC)"

requirements-completed: []

duration: 11min
completed: 2026-10-04
---

# Phase 4 Plan 01: характеризация авторизации и шесть красных проверок Summary

**Вход, refresh, выход, `/api/auth/me`, `requirePerm` и исходы маршрутов D-04 закреплены через настоящий `app.ts` на временной `test_*` с флагами production; шесть дефектов AUTH-01…AUTH-06 воспроизведены как `test.fails` под константой `KNOWN_DEFECTS`.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~11 мин
- **Started:** 2026-10-04T06:14:23Z
- **Completed:** 2026-10-04T06:25:00Z
- **Tasks:** 3/3
- **Files created:** 3

## Accomplishments

- `auth-app.ts`: временная база через `requireTestDatabaseUrl` и `createScratchDatabase`, миграции, флаги D-02 до импорта `app.js`, сид пользователей с bcrypt-паролем (cost 4), `fetch` с уникальным `x-forwarded-for`, разбор `Set-Cookie` в `Map` имя → `{ value, attributes }`. Строки `DATABASE_URL` и `sessionCookieFor` в файлах нет (`auth-app clean`).
- Tracer: `char_user` проходит login → me → refresh → me → logout → me (401) в одном тесте.
- Характеризация: 27 тестов, все зелёные.
- Дефекты: 6 сопутствующих тестов зелёные, 6 проверок засчитаны как `expected fail`.
- `yarn verify: OK` (server: `275 passed | 6 expected fail (281)`, оба новых файла в прогоне).

## Task Commits

Коммиты не выполнялись (правило пользователя), изменения в рабочем дереве:

1. **Task 1 (tracer): помощник и сквозной путь.** Tracer-гейт: `<verify>` прогнан end-to-end, `1 passed`, затем расширение.
2. **Task 2: requirePerm, отказы refresh, исходы D-04.**
3. **Task 3 (TDD): шесть красных проверок.** RED — это сами проверки `test.fails`; пробы «test.fails → test» ниже подтверждают, что каждая краснеет на утверждении о целевом поведении. GREEN наступит в планах 04-04…04-08, когда идентификатор удаляется из константы.

## Файлы к коммиту

- `app/server/src/test-support/auth-app.ts` (новый)
- `app/server/src/routes/auth/auth-characterization.test.ts` (новый)
- `app/server/src/routes/auth/auth-known-defects.test.ts` (новый)

`.planning/commit-snapshots/before-04-01/fingerprint.json` (отпечаток шага 0) и этот SUMMARY лежат в `.planning/`, который игнорируется git: в коммит не попадают.

## codegraph impact (D-22, шаг 1)

Код приложения план не меняет; вызывающие записаны для следующих планов.

- `sessionOptional` (`middleware/auth/session.ts:66`), 19 символов: `sessionRequired` (`session.ts:111`); файлы `app.ts`, `index.ts`, `routes/auth/me.ts`, `routes/auth/index.ts`, `routes/auth/invites.ts`, `routes/docs/assets.ts`, `routes/groups/index.ts`, `routes/rbac/index.ts`, `routes/search.ts`, `routes/settings.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/tests/public.ts`, `routes/users/avatar.ts`, `routes/users/index.ts`, `routes/users/profile.ts`.
- `requirePerm` (`middleware/auth/requirePerm.ts:10`), 10 символов: `routes/auth/invites.ts`, `routes/auth/index.ts`, `routes/groups/index.ts`, `routes/index.ts`, `routes/rbac/index.ts`, `routes/sidebar/index.ts`, `routes/tests/assignments.ts`, `routes/tests/index.ts`, `routes/users/index.ts`.

## codegraph affected (D-22, конец плана)

По трём файлам плана: `app/server/src/routes/auth/auth-characterization.test.ts`, `app/server/src/routes/auth/auth-known-defects.test.ts`. Других затронутых тестов нет.

## Фактические статусы характеризации (Task 1–2)

Расхождений с ожиданиями плана нет: каждый факт совпал с ожиданием.

| Группа | Проверка | Факт |
|---|---|---|
| Tracer | login `char_user` | 200; `bio_exam_session` и `refresh_token` с `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age` |
| Tracer | `GET /api/auth/me` | 200, `ok: true`, `user.id` = id из сида, `roles` содержит `user`, `perms` — массив строк |
| Tracer | `POST /api/auth/refresh` | 200, новый `refresh_token` ≠ прежнего |
| Tracer | `GET /api/auth/me` после refresh | 200 |
| Tracer | `POST /api/auth/logout` | 200, обе cookie `Max-Age=0`, набор пуст |
| Tracer | `GET /api/auth/me` без cookie | 401 |
| A | `GET /api/rbac/roles` без сессии / `char_user` / `char_admin` | 401 / 403 / 200 |
| B | refresh без cookie | 401, без `refresh_token` в ответе |
| B | refresh с выдуманным `refresh_token` | 401 |
| B | refresh токеном сессии после logout | 401 |
| B | `/api/auth/me` с испорченным `bio_exam_session` | 401 |
| C | `GET /api/tests/public/topics/:topicSlug/tests/d04-assigned`: admin / `d04_student` / `d04_stranger` | 200 / 200 / 403 |
| C | `GET /api/tests/public/tests/:id` (d04-assigned): admin / `d04_student` / `d04_stranger` | 200 / 200 / 403 |
| C | `GET /api/tests/public/tests`: admin / `d04_student` / `d04_stranger` | оба / только `d04-assigned` / ни одного |
| C | `GET /api/tests/public/topics/:slug/tests`: admin / `d04_student` / `d04_stranger` | оба / только `d04-assigned` / ни одного |
| C | `GET /api/settings/chart-default-range`: admin / `d04_student` | 200 / 403 |
| C | `PUT /api/settings/chart-default-range` `{ value: 'week' }`: admin / `d04_student` | 200 / 403 |
| C | `GET /api/search?q=хлоропласт&scope=tests`: admin | оба теста, `href` начинается с `/admin/tests/` |
| C | то же: `d04_student` | только `d04-assigned`, `href` с `/tests/` |
| C | то же: `d04_stranger` | ни одного |

Тесты `d04-*` засеяны без вопросов: детальные маршруты не читают storage, мок хранилища не нужен. В поиске у admin фильтруются строки `type === 'test'` (привилегированная ветка возвращает и темы).

## Пробы «test.fails → test» (Task 3)

Каждый идентификатор по очереди удалялся из `KNOWN_DEFECTS`, файл прогонялся через `node scripts/with-test-db.mjs`, затем файл возвращался (sha256 до и после совпал). В каждой пробе: `1 failed | 6 passed | 5 expected fail (12)`, то есть все сопутствующие тесты подготовки зелёные, падает только проверка на целевом утверждении.

| Идентификатор | Чинит | Утверждение, на котором краснеет | Факт сейчас |
|---|---|---|---|
| AUTH-01-db-error | 04-04 | `me.status >= 500 && roles.status >= 500` после `ALTER TABLE rbac_user_grants RENAME TO rbac_user_grants_off` | `/api/auth/me` 200, `/api/rbac/roles` 200 (fail-open: `NODE_ENV=test`, кэш у этого admin пуст) |
| AUTH-02-role-removed | 04-05 | `[roles.status, settings.status]` = `[403, 403]` после `DELETE` роли admin и `INSERT` роли user через `pgPool` | `[200, 200]` (`userCache` прав и объединение ролей JWT в `session.ts:99`) |
| AUTH-03-d4-allow | 04-05 | `GET /api/tests/public/topics/defects-topic/tests/defects-free` = 200 у user с allow `tests.read` без назначения | 403 |
| AUTH-04-logout | 04-06 | `/api/auth/me` только со старым `bio_exam_session` после logout = 401 | 200 |
| AUTH-05-parallel-refresh | 04-07 | число строк `refresh_tokens` пользователя = 2 (вход + один преемник) | 3; статусы `[200, 200]` прошли, до проверки `Set-Cookie` не дошло (сейчас оба ответа несут `refresh_token`). Исход зависит от гонки `select` → транзакция: при другом порядке возможны `[200, 401]` и 2 строки, тогда проверка краснеет на утверждении статусов. Это тоже текущий дефект, а не регрессия |
| AUTH-06-foreign-ip | 04-08 | вход владельца с `198.51.100.20` верным паролем = 200 после пяти неудач с `203.0.113.10` (каждая 401) | 403 (`locked_until` на 30 мин) |

Зависимость внутри `describe`: красная проверка использует состояние, которое подготовил сопутствующий тест (cookie, refresh-токен, пять неудач). Vitest гонит тесты файла последовательно; если подготовка упадёт, файл всё равно будет красным из-за сопутствующего теста, а `required()` в проверке не даст ей молча засчитаться.

## Verification

- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth/auth-characterization.test.ts`: `Tests 27 passed (27)`.
- `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth/auth-known-defects.test.ts`: `Tests 6 passed | 6 expected fail (12)`.
- Оба файла вместе: `Tests 33 passed | 6 expected fail (39)`.
- `auth-app clean`, `characterization shape ok`, `known defects: 6`.
- `yarn verify`: `yarn verify: OK` (все шаги passed; server `275 passed | 6 expected fail (281)`).
- Сверка с отпечатком `before-04-01/fingerprint.json`: `04-01 changed only its files` (в базе был один чужой файл, `test-support/http.ts`, он не тронут).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Литерал `new Set<string>([...])` не проходил проверку формы плана**
- **Found during:** Task 3, проверка `known defects: 6`
- **Issue:** регулярное выражение проверки ищет `KNOWN_DEFECTS = new Set([`; дженерик `<string>` давал exit 1
- **Fix:** `new Set([...])`, тип выводится как `Set<string>`
- **Files modified:** `app/server/src/routes/auth/auth-known-defects.test.ts`
- **Commit:** не выполнялся (правило пользователя)

Других отклонений нет: все ожидания плана совпали с фактическим поведением HEAD, все шесть дефектов воспроизводятся.

### Отклонения по правилам исполнения

- `root-pin.sh` отклонён правами; заменён проверкой `git rev-parse --show-toplevel` = `/Users/kdvornichenko/bio-exam`, запись только по абсолютным путям внутри корня.

## Deferred human verification

- Коммит файлов плана делает пользователь (граница плана = граница коммита). Шаги: просмотреть три новых файла из «Файлы к коммиту» и закоммитить их. Не выполнено, ждёт пользователя; исполнитель не одобрял.

## Known Stubs

Нет.

## Self-Check: PASSED

- FOUND: app/server/src/test-support/auth-app.ts
- FOUND: app/server/src/routes/auth/auth-characterization.test.ts
- FOUND: app/server/src/routes/auth/auth-known-defects.test.ts
- FOUND: .planning/commit-snapshots/before-04-01/fingerprint.json
- Коммиты: 0 (правило пользователя), HEAD не менялся (7a6f95a)
