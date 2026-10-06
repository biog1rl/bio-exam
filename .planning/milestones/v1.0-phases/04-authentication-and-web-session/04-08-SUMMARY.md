---
phase: 04-authentication-and-web-session
plan: 08
subsystem: auth
tags: [login-throttle, auth-06, d-11, d-12, postgres, retry-after, vitest, playwright]
status: complete
deferred_human_gate: true

requires:
  - phase: 04-authentication-and-web-session
    provides: "04-03: таблица login_throttle (миграция 0021); 04-06: openSession в login.ts; 04-07: routes/users/sessions.ts как образец маршрута, KNOWN_DEFECTS с одним AUTH-06-foreign-ip"
provides:
  - "services/login-throttle: reserveAttempt, recordSuccess, clearForLogin, clientIp"
  - "progression.ts: IP_TRUSTED = false, pairBlockMs(failures, ipTrusted), loginBlockMs, ipBlockMs, bucketKeys, pairKey/loginKey/ipKey, константы окон"
  - "POST /api/auth/login: 429 с Retry-After и телом { error } при блокировке, без запроса к users и без bcrypt"
  - "DELETE /api/users/:id/login-throttle под users.edit, ответ { ok: true, cleared }"
  - "Runbook «Снять ограничение входа» в app/server/README.md"
  - "auth-known-defects.test.ts без KNOWN_DEFECTS и test.fails"
affects: [04-09, 04-12, 04-14]

actuals:
  tokens: 9500
  tasks: 3
  commits: 0
plan_head_before: 1eea6b8a35779210c99f2f54c7012750e54b6f7e
plan_head_after: 1eea6b8a35779210c99f2f54c7012750e54b6f7e

tech-stack:
  added: []
  patterns:
    - "Резерв попытки одной командой INSERT … ON CONFLICT (bucket_key) DO UPDATE SET updated_at = login_throttle.updated_at RETURNING: строка создаётся или блокируется, возвращаются актуальные failures, признак устаревания и секунды до конца окна, всё по now() базы"
    - "Блокировка откатывает транзакцию через внутреннее исключение Blocked: заблокированная попытка ничего не пишет"
    - "Порядок блокировок постоянный: ключи корзин начинаются с ip:, login:, pair:, массив отсортирован, вставка идёт в этом порядке"
    - "Устаревшие строки чужих корзин удаляются подзапросом FOR UPDATE SKIP LOCKED, свои ключи исключены, поэтому удаление не ждёт чужих блокировок"
    - "Тесты троттлинга сдвигают blocked_until SQL-запросом и не ждут"

key-files:
  created:
    - app/server/src/services/login-throttle/progression.ts
    - app/server/src/services/login-throttle/progression.test.ts
    - app/server/src/services/login-throttle/client-ip.ts
    - app/server/src/services/login-throttle/index.ts
    - app/server/src/routes/auth/login-throttle.test.ts
    - app/server/src/routes/users/login-throttle.ts
  modified:
    - app/server/src/routes/auth/login.ts
    - app/server/src/routes/auth/auth-known-defects.test.ts
    - app/server/src/middleware/rateLimiter.ts
    - app/server/src/lib/constants.ts
    - app/server/src/routes/users/index.ts
    - app/server/README.md
    - e2e/auth.setup.ts
    - e2e/fixtures/exam.ts
    - e2e/tests/auth.spec.ts
    - e2e/playwright.config.ts

key-decisions:
  - "Ключ пары pair:JSON.stringify([login, ip]): логин и IPv6 содержат ':', JSON-ключ однозначен"
  - "recordSuccess при IP_TRUSTED = true возвращает резерв и в корзину IP (уменьшает на 1, снимает окно при счётчике ≤ 50); план называл только корзину логина, решение исполнителя (автономно)"
  - "Ветка неактивного аккаунта с верным паролем тоже вызывает recordSuccess до ответа 403, как предписано планом"
  - "openSession получает ip прежним выражением req.ip || req.socket.remoteAddress || null: clientIp используется только троттлингом, 'unknown' в created_by_ip не пишется"

requirements-completed: []

duration: 25min
completed: 2026-10-04
---

# Phase 04 Plan 08: троттлинг входа в PostgreSQL вместо блокировки аккаунта

**Жёсткая блокировка на 30 минут и in-memory лимитер заменены троттлингом в таблице `login_throttle`. Корзины: пара (логин, IP) и логин по всем IP; корзина по IP выключена константой `IP_TRUSTED = false`. Заблокированная попытка получает 429 с `Retry-After` без bcrypt. Для снятия ограничения есть маршрут администратора и SQL-runbook. Тест AUTH-06-foreign-ip стал обычным.**

Коммит: не выполнялся (правило пользователя), изменения в рабочем дереве.

## Performance

- **Duration:** ~25 мин
- **Completed:** 2026-10-04
- **Tasks:** 3/3
- **Files:** 6 созданы, 10 изменены

## Accomplishments

- `progression.ts`: `FREE_PAIR_FAILURES = 5`, `PAIR_BASE_MS = 30_000`, `PAIR_CAP_MS = 900_000`, `LOGIN_FREE_FAILURES = 20`, `LOGIN_CAP_MS = 60_000`, `IP_FREE_FAILURES = 50`, `IP_CAP_MS = 300_000`, `FAILURE_RESET_MS = 86_400_000`, `IP_TRUSTED = false`. Env модуль не читает.
- `reserveAttempt` выполняется одной короткой транзакцией до запроса к users и bcrypt. Если какая-то корзина в окне, функция возвращает `{ blocked, retryAfterSec }` и ничего не меняет. Иначе все корзины получают +1 и окно по прогрессии. Счётчик старше суток считается нулём, а чужие устаревшие строки удаляются. `recordSuccess` удаляет пару и возвращает резерв корзине логина. `clearForLogin` удаляет все строки логина.
- `login.ts`: убраны лимитер, `updateLoginGuardFields`, ветка `ACCOUNT_LOCKED` и обнуление счётчиков. Ветка `DUMMY_HASH` для незаблокированной попытки сохранена. Колонки `users.failed_login_attempts`, `users.locked_until` и индекс в схеме остались.
- Удалены `loginRateLimiter` (`rateLimiter.ts`) и `ERROR_MESSAGES.ACCOUNT_LOCKED`. `rateLimiter` остался для приглашений и профиля.
- Маршрут `DELETE /api/users/:id/login-throttle` защищён `validateUUID`, `sessionRequired()` и `requirePerm('users','edit')`. Несуществующий пользователь получает 404. Пользователь без login получает `cleared: 0`. Маршрут смонтирован рядом с `sessionsRouter`.
- README сервера: в «Правила доступа» описан троттлинг, добавлен подраздел «Снять ограничение входа» с маршрутом и `DELETE FROM login_throttle WHERE login = '<логин в нижнем регистре>';`.
- e2e: комментарии про «5 входов в минуту» приведены к факту: считаются только неудачи. Код e2e не менялся.

## CodeGraph

`codegraph impact loginRateLimiter`: 3 символа. Это `middleware/rateLimiter.ts:101` и файлы `routes/auth/login.ts`, `routes/auth/index.ts` (импорт на уровне файла). Других читателей нет.

`codegraph impact rateLimiter`: 10 символов: `rateLimiter:57`, `loginRateLimiter:101`, `routes/auth/login.ts` (POST /api/auth/login), `routes/auth/invites.ts`, `routes/auth/index.ts`, `routes/users/profile.ts`, `routes/users/index.ts`, а в web `LoginPageClient.tsx handleSubmit:77` и `InviteClient.tsx accept:38` (через HTTP). Функция `rateLimiter` сохранена, invites и profile не затронуты.

`codegraph impact ACCOUNT_LOCKED`: символ не найден (это поле объекта). По `grep` единственный читатель был `login.ts`, в web строки «Account is locked» нет.

`codegraph affected` по файлам плана: 35 файлов. Серверные тесты: `auth-characterization`, `auth-known-defects`, `login-throttle`, `me-requirePerm-parity`, `refresh-rotation`, `session-revocation`, `access-routes`, `exam-flow`, `uploads`, `policy`, `progression`, `cookies`, `answer-keys-jsonb`, `timestamps`. Плюс клиенты `app/web` (tests api, editor) и e2e `auth.spec`, `authoring.spec`, `review.spec`, `fixtures/exam.ts`. Всё прогнано в `yarn verify` и `yarn e2e`.

## Task Commits

1. **Task 1 (tracer): троттлинг в PostgreSQL, 429 с Retry-After, AUTH-06 переключён.** Коммит: не выполнялся (правило пользователя).
   - Tracer gate (auto): оба `<automated>` повторены. `vitest run src/routes/auth` показал 6 файлов, 82 passed. Проверка на отсутствие блокировки напечатала `no hard lockout`. Затем начато расширение.
2. **Task 2 (tdd): таблица прогрессии, удаление loginRateLimiter и ACCOUNT_LOCKED, маршрут снятия, runbook.** Коммит: не выполнялся.
3. **Task 3: комментарии e2e, полный прогон.** Коммит: не выполнялся.

## TDD

- Task 2, прогрессия: `progression.test.ts` написан до остальных шагов задачи. С первого запуска он зелёный (7 passed), потому что `progression.ts` создан в Task 1 как часть tracer. Красной фазы у таблицы не было.
- Task 2, маршрут: тесты `DELETE /api/users/:id/login-throttle` добавлены в `login-throttle.test.ts` до маршрута. RED: 3 failed, 8 passed (маршрута нет, 404 вместо 200/403). GREEN после маршрута: 11 passed.
- RED/GREEN-коммиты не делались (правило пользователя), порядок соблюдён по сути.

## Проверки

| Проверка | Итог |
|---|---|
| `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run src/routes/auth` | 6 files, 82 passed |
| статическая проверка (lockedUntil, KNOWN_DEFECTS, IP_TRUSTED = false, без process.env) | `no hard lockout` |
| `yarn workspace @bio-exam/server vitest run src/services/login-throttle/progression.test.ts` | 7 passed |
| `node scripts/with-test-db.mjs -- … vitest run src/routes/auth/login-throttle.test.ts` | 11 passed |
| `node scripts/check-docs-commands.mjs` | `check-docs-commands: OK` |
| `rg -n "loginRateLimiter" app/server/src` | пусто |
| `rg -n "5 входов в минуту\|5 раз в минуту\|лимит входа" e2e` | пусто |
| `yarn verify` | `yarn verify: OK` (server 21 files, 423 passed) |
| `yarn e2e` | exit 0, `122 passed (46.1s)`; ✘ только у 6 ожидаемых `@known-defect`: D1, D8, D3 в двух проектах. Остальное зелёное, auth.setup не пострадал |
| `cd app/server && node vercel-build.cjs` | `=== Build completed successfully! ===` |

Строки behavior Task 1 в `login-throttle.test.ts`:

- ghost и victim: 6 неудач дают 401, 7-я попытка получает 429 с Retry-After 29–31, тела одинаковы (`{ error }`).
- Окно истекло: неудача даёт 401 и окно 60 с, дважды.
- 3 неудачи, затем верный пароль: 200, корзины пары нет.
- AUTH-06-foreign-ip проверен в обоих файлах.
- Общий IP: 11 неудач, затем владелец получает 429 с Retry-After ≤ 60. Все строки логина ≤ 60 с. После сдвига на 60 с вход даёт 200.
- 21 неудача с 21 IP, затем новый IP получает 429 с Retry-After ≤ 60.
- 12 параллельных попыток дают ≤ 6 ответов 401, остальные 429.
- При переименованной `users` заблокированная пара получает 429, незаблокированная попытка 500, failures пары остаётся 6.

## KNOWN_DEFECTS после плана

Константы нет. `auth-known-defects.test.ts` содержит обычные регрессии AUTH-01…AUTH-06, `defectTest` и `test.fails` удалены (AUTH-04-logout тоже переведён в `test`). Шесть дефектов D-19 закрыты.

## Deviations from Plan

None - plan executed exactly as written. Решения исполнителя перечислены в key-decisions: возврат резерва корзине IP при `IP_TRUSTED = true`, формат ключа пары.

## Threat Flags

Нет. Новая поверхность (`DELETE /api/users/:id/login-throttle`) есть в плане и закрыта `users.edit`. Модуль не пишет в лог логины, пароли, хэши и cookie. Известная утечка Cookie через `pinoHttp` (вне плана) осталась без изменений, новых логов нет.

## Known Stubs

Нет.

## Deferred human verification

Не выполнено, ждёт пользователя. Исполнитель ничего не одобрял.

1. CONTEXT `<specifics>` п. 5: троттлинг заменяет блокировку. Паузы пары 30–60 с, пока `IP_TRUSTED = false`, и до 15 мин после включения. По логину до 60 с, ответ 429 с Retry-After. Текущие блокировки (`locked_until` в будущем) при выкатке перестают действовать. Read-only запрос на проде: `SELECT count(*) FROM users WHERE locked_until > now();`.
2. CONTEXT `<specifics>` п. 6: на preview проверить, какой IP видит Express у двух разных клиентов через rewrite web → server. Это стоп-условие перед включением `IP_TRUSTED`. Без подтверждения константа остаётся `false`. Включение — отдельная правка константы человеком (тесты, редеплой server), шаг входит в чек-лист 04-14. Для Milestone 2 (nginx) проверку повторить.
3. CONTEXT `<specifics>` п. 7 (часть): подтвердить маршрут `DELETE /api/users/:id/login-throttle` под `users.edit`.
4. Коммит файлов плана делает пользователь или оркестратор.

## Файлы к коммиту

- app/server/README.md
- app/server/src/lib/constants.ts
- app/server/src/middleware/rateLimiter.ts
- app/server/src/routes/auth/auth-known-defects.test.ts
- app/server/src/routes/auth/login.ts
- app/server/src/routes/auth/login-throttle.test.ts
- app/server/src/routes/users/index.ts
- app/server/src/routes/users/login-throttle.ts
- app/server/src/services/login-throttle/client-ip.ts
- app/server/src/services/login-throttle/index.ts
- app/server/src/services/login-throttle/progression.ts
- app/server/src/services/login-throttle/progression.test.ts
- e2e/auth.setup.ts
- e2e/fixtures/exam.ts
- e2e/playwright.config.ts
- e2e/tests/auth.spec.ts
- .planning/phases/04-authentication-and-web-session/04-08-SUMMARY.md, .planning/STATE.md, .planning/ROADMAP.md (gsd-tools)

## Next Phase Readiness

- 04-09 (web): ответ 429 несёт `Retry-After` целыми секундами и тело `{ error: 'Too many requests. Please try again later.' }`.
- 04-12/04-14: кнопке «Снять ограничение входа» нужен `DELETE /api/users/:id/login-throttle` → `{ ok, cleared }`. Включение `IP_TRUSTED` — после проверки на preview.

## Self-Check: PASSED

Все 6 созданных файлов на месте, 10 изменённых видны в `git status`, вне allow-list плана нет ничего. Коммиты не ожидаются (правило пользователя), `commits: 0` при изменениях в рабочем дереве — так задумано правилами запуска.
