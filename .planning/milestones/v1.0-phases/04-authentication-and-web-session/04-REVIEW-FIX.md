---
phase: 04-authentication-and-web-session
fixed_at: 2026-10-04T17:40:00+03:00
review_path: .planning/phases/04-authentication-and-web-session/04-REVIEW.md
disposition_path: .planning/phases/04-authentication-and-web-session/04-REVIEW-DISPOSITION.md
iteration: 1
findings_in_scope: 15
fixed: 15
skipped: 0
status: all_fixed
---

# Фаза 4: правки по ревью кода

Где работали: worktree `scratchpad/wt-p4fix`, ветка `gsd/phase-04-fix`. Все правки, тесты, `yarn verify` и `yarn e2e` выполнены в нём. Коммитов нет: изменения лежат в рабочем дереве worktree.

Область: таблица «Чинить в фазе 4» из `04-REVIEW-DISPOSITION.md` и решения пользователя от 2026-10-04 по CR-02, CR-03 и SEC-04.

## Итог

| id | статус | тест до правки |
|---|---|---|
| CR-01 / SEC-01 | fixed | красный → зелёный |
| CR-04 / SEC-02 | fixed | красный → зелёный |
| CR-02 (keep-alive и порог proxy) | fixed | красный → зелёный |
| CR-05 | fixed | красный → зелёный (deadlock 40P01 воспроизведён) |
| NQ-02 | fixed | один тест красный (deadlock), второй зелёный до правки — защита от регрессии |
| CR-06 | fixed | теста нет по disposition, проверка — существующие тесты троттлинга |
| CR-07 | fixed | красный → зелёный |
| CR-08 | fixed | красный → зелёный |
| SEC-05 | fixed | красный → зелёный |
| SEC-06 | fixed | красный → зелёный |
| SEC-03 | fixed | красный → зелёный |
| CR-03 (отзыв при accept и 409) | fixed | красный → зелёный |
| NQ-03 | fixed | зелёный до правки — покрытие |
| CR-10 | fixed | красный → зелёный |
| CR-12 | fixed | теста нет по disposition; отдельный коммит |
| SEC-04 | принятый риск | — |

## Исправлено

### CR-01 / SEC-01: обход `safeCallbackPath` через dot-сегменты

- Файлы: `app/web/lib/session/redirect.ts`, `app/web/lib/session/redirect.test.ts`.
- Правка: после `new URL` собирается `pathname + search + hash`. Если результат начинается с `//` или `/\`, функция возвращает fallback. Проверки исходной строки остались.
- Тест: в список отклоняемых добавлены `/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com/x`, `/%2e%2e//evil.com/path`, `/./\evil.com`. До правки 4 теста красные, например `//evil.com/path`. После правки 26/26 зелёные.

### CR-04 / SEC-02: Cookie и Authorization в логах

- Файлы:
  - `app/server/src/lib/logger.ts`;
  - `app/server/src/lib/logger.test.ts` (новый).
- Правка:
  - Логгер собирается фабриками `createLogger(destination?)` и `createHttpLogger(base)`.
  - Экспорты `logger`, `pinoHttpMiddleware` и `default` прежние.
  - У базового `pino` задан `redact`: пути `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `censor: '[redacted]'`.
- Тест:
  - Express с `createHttpLogger(createLogger(stream))`, реальный HTTP-запрос с cookie access и refresh и заголовком `Authorization`.
  - Обработчик пишет `req.log.warn({ event: 'refresh_replay' })` и строку с `res`.
  - Тест читает поток вывода: значений секретов в нём нет, `cookie`, `authorization` и `set-cookie` равны `[redacted]`.
  - До правки красный: в выводе было значение cookie.
- В логах прогона серверных тестов строки ошибок содержат `"cookie":"[redacted]"`.

### CR-02: keep-alive без нижней границы и порог proxy (решение пользователя)

- Файлы:
  - `app/web/lib/session/keep-alive.ts`, `app/web/lib/session/keep-alive.test.ts`;
  - `app/web/lib/session/access-token.ts`, `app/web/lib/session/access-token.test.ts`.
- Правка в keep-alive:
  - запоминается `lastOkAt` последнего исхода `ok`;
  - `scheduleIn` ставит срок не раньше `lastOkAt + REFRESH_RETRY_MS`;
  - граница действует и для `run()`, и для `update()` из `AuthProvider`.
- Правка в proxy: порог обновления равен `min(60, (exp − iat) / 2)` секунд. Без `iat`, или если `iat` не раньше `exp`, порог прежний — 60 с. `decodeAccessPayload` и его тип не менялись. Минимум `ACCESS_TOKEN_EXPIRES_SEC` остаётся 60, D-06 не менялся.
- Тесты keep-alive:
  - TTL 60 с: после `ok` и `update()` с тем же сроком следующий refresh не раньше 30 с;
  - часы клиента спешат, срок после `ok` уже в прошлом: refresh тоже не раньше 30 с.
  - До правки оба красные.
- Тесты `needsRefresh`:
  - TTL 60 со свежим `iat`: обновления нет;
  - граница 30/31 с при TTL 60, 60/61 с при TTL 900, 50/51 с при TTL 100;
  - некорректный `iat`: порог 60.
  - До правки 3 красных.

### CR-05: обратный порядок блокировок у ротации и отзыва

- Файл: `app/server/src/services/session/index.ts`.
- Правка:
  - `revokeSession` сначала отзывает `refresh_tokens` сессии, затем `auth_sessions`.
  - `revokeUserSessions` сначала делает `UPDATE refresh_tokens … WHERE session_id IN (SELECT id FROM auth_sessions WHERE <условия>)`, затем `UPDATE auth_sessions … RETURNING`.
  - Порядок совпадает с ротацией: токен, затем сессия.
  - Число отозванных сессий в ответе прежнее.
- Тест NQ-02, «replay старого токена параллельно с ротацией преемника», файл `refresh-rotation.test.ts`:
  - Триггер `AFTER INSERT ON refresh_tokens` с `pg_sleep(0.6)` держит ротацию между захватом токена и обновлением сессии.
  - Через 200 мс идёт replay.
  - До правки: `deadlock detected` (40P01), ответ 500.
  - После правки: replay 401, ротация не 500, сессия отозвана с `replay`, выданный ротацией токен и access отклоняются.
  - Три повторных прогона зелёные.

### NQ-02: пять параллельных replay

- Файл: `app/server/src/routes/auth/refresh-rotation.test.ts`.
- Тест: пять параллельных replay после окна. Все 401, без 500, сессия отозвана с `replay`, все токены сессии отозваны, преемник отклоняется.
- Зелёный и до правки: защита от регрессии.

### CR-06: порядок блокировок `reserveAttempt` и `recordSuccess`

- Файл: `app/server/src/services/login-throttle/index.ts`.
- Правка:
  - `recordSuccess` идёт по `bucketKeys` в порядке сортировки (`ip:` < `login:` < `pair:`): сначала UPDATE корзин `ip` (при `ipTrusted`) и `login`, затем DELETE `pair`.
  - Неиспользуемые импорты `ipKey` и `loginKey` убраны; реэкспорт остался.
- Проверка: `login-throttle.test.ts` и `progression.test.ts`, 18/18 зелёные.

### CR-07: исход `unavailable` в proxy вёл на `/login`

- Файлы:
  - `app/web/proxy.ts`, `app/web/proxy.test.ts`;
  - `app/web/lib/session/proxy-refresh.ts`, где добавлены константы `SESSION_REFRESH_HEADER = 'x-session-refresh'` и `SESSION_REFRESH_UNAVAILABLE`;
  - `app/web/components/AppLayout/AppLayout.tsx`.
- Правка в proxy:
  - При `unavailable` запрос идёт дальше с заголовком `x-session-refresh: unavailable`.
  - Входящий заголовок с этим именем удаляется на всех ветках, которые пропускают запрос.
  - Без входящего заголовка ветки без refresh заголовки запроса не переписывают.
- Правка в `AppLayout`: если `me` нет и заголовок равен `unavailable`, ставится `sessionError = true`. Тогда `AuthGuard` не уводит на `/login`.
- Тесты:
  - матрица `unavailable` (502, 500, 403, 429, 302, сбой сети) проверяет `x-middleware-request-x-session-refresh = unavailable`;
  - подменённый входящий заголовок заменяется значением proxy;
  - входящий заголовок вырезается на ветках: refresh успешен, 401 на публичном пути, access действует, `/login` и `/invite` без cookie;
  - без входящего заголовка override нет.
  - До правки 12 красных.
- Изменение ожидания по замыслу правки: в матрице `unavailable` было `x-middleware-request-cookie === null`. `NextResponse.next({ request: { headers } })` переносит все заголовки запроса, поэтому cookie теперь передаётся без изменений. Проверка стала такой: заголовка нет, или он равен входящему `refresh_token=old-refresh`.

### CR-08: сбой сети при выходе

- Файлы:
  - `app/web/lib/session/client.ts`, `app/web/lib/session/client.test.ts`;
  - `app/web/components/providers/AuthProvider.tsx`;
  - `app/web/components/nav-user.tsx`;
  - `app/web/app/(internal)/(protected)/profile/ProfileClient.tsx`.
- Правка:
  - `sessionClient.logout()` возвращает `false` только при исключении fetch. На любой HTTP-ответ возвращает `true`: Express очищает cookie в `finally`.
  - `AuthProvider.logout()` возвращает `Promise<boolean>`. При `false` страница остаётся, `me` не сбрасывается, события `logout` в `localStorage` и навигации нет.
  - `nav-user.tsx` показывает тост успеха после успешного выхода, а при `false` — `toast.error(LOGOUT_FAILED_MESSAGE)`.
  - `ProfileClient` при `false` показывает ту же ошибку.
- Тесты: «ответ 500 даёт true» (до правки красный) и «сбой сети даёт false».
- Изменение ожидания по замыслу правки: прежний тест «ответ 500 и сбой сети дают false» разделён на два, для 500 ожидание `true`, как требует disposition.

### SEC-05: refresh-токены без сессии

- Файлы: `app/server/src/services/session/index.ts`, `app/server/src/routes/auth/session-revocation.test.ts`.
- Правка: `revokeUserSessions` дополнительно отзывает токены пользователя с `session_id IS NULL`. Это происходит до обновления `auth_sessions`, при любом `exceptSessionId`.
- Тесты:
  - «завершить все сеансы» отзывает токен без сессии, refresh им даёт 401;
  - смена пароля отзывает такой токен, а текущая сессия работает.
  - До правки оба красные.

### SEC-06: проверка тела входа до троттлинга

- Файлы: `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/login-throttle.test.ts`.
- Правка:
  - Пустые или отсутствующие поля, как и раньше, дают 400 `Missing credentials`.
  - Затем zod: `username` — строка не длиннее 64, `password` — строка не длиннее 1024. Иначе 400 `Bad request`.
  - Всё это до `reserveAttempt`.
- Тесты:
  - Не строки (число, объект, массив), username 65 символов, password 1025 символов, пустые значения и пустое тело дают 400, число строк `login_throttle` не меняется. До правки 6 красных.
  - username 64 символа и password 1024 символа проходят проверку и доходят до троттлинга: ответ 401, строки созданы.

### SEC-03: одна стоимость bcrypt и пересчёт хэша

- Файлы:
  - `app/server/src/lib/constants.ts` (`BCRYPT_COST = 12`);
  - `app/server/src/routes/auth/login.ts`, `app/server/src/routes/auth/invites.ts`, `app/server/src/routes/users/profile.ts`, `app/server/src/scripts/bootstrap-admin.ts`;
  - `app/server/src/routes/auth/login-throttle.test.ts`.
- Правка:
  - Константа лежит в `lib/constants.ts`, а не в `config/auth.ts`: `bootstrap-admin.ts` импортирует модули до `loadDotenv()`, а `config/auth.ts` в production бросает исключение без секрета.
  - `DUMMY_HASH` пересчитан с cost 12.
  - После успешного входа активного пользователя, если `getRounds(hash) !== BCRYPT_COST`, хэш пересчитывается условным UPDATE: `WHERE id = $1 AND password_hash = <старый хэш>`, чтобы не затереть параллельную смену пароля.
  - Сбой пересчёта вход не ломает: событие `password_rehash_failed` пишется через `req.log.warn`.
  - `e2e-seed.ts` (cost 10) не менялся: при первом входе хэш пересчитывается.
- Тесты:
  - вход с хэшем cost 10 даёт 200, хэш становится cost 12 и подходит к паролю, повторный вход хэш не меняет;
  - неверный пароль (401) и неактивный пользователь (403) хэш не трогают.
  - До правки первый тест красный.
- Изменение тайм-аута: тест «шесть неудач без паузы…» входит 6 раз несуществующим логином, а сравнение с `DUMMY_HASH` cost 12 занимает около 220 мс. Под нагрузкой `yarn verify` тест не укладывался в 5 с по умолчанию. Тайм-аут теста поднят до 30 с, ожидания не менялись.

### CR-03: приглашение и сессии (решение пользователя)

- Файлы: `app/server/src/routes/auth/invites.ts`, `app/server/src/routes/auth/session-revocation.test.ts`.
- Правка:
  - `POST /api/auth/invites` с `userId` активного пользователя отвечает 409 с текстом «Пользователь уже активен: приглашение выдаётся только неактивному пользователю». Приглашение не создаётся.
  - `POST /api/auth/invites/accept` в той же транзакции вызывает `revokeUserSessions(inv.userId, { reason: 'password_change' }, tx)`.
  - Интерфейс не менялся.
- Тесты:
  - 409 для активного пользователя, строк в `invites` нет;
  - accept отзывает прежние сессии. Сценарий: деактивация → приглашение → повторная активация → вход → accept. Сессия отозвана с `password_change`, старые access и refresh дают 401, вход с новым паролем 200.
  - До правки оба красные.

### NQ-03: replay в одной сессии не трогает другую

- Файл: `app/server/src/routes/auth/refresh-rotation.test.ts`.
- Тест: replay в сессии A отзывает A. Сессия B того же пользователя и её токены не отозваны, `/api/auth/me` с B даёт 200, ротация B даёт 200 с прежним `sid`.
- Зелёный и до правки: покрытие.

### CR-10: `*_DAYS` без проверки

- Файлы:
  - `app/server/src/config/auth.ts`;
  - `app/server/src/services/session/cookies.test.ts`;
  - `app/server/.env.example` (комментарии к ключам).
- Правка:
  - `parseDays(key, raw, fallback)`: целое от 1 до 365, иначе ошибка с именем ключа при старте.
  - Применяется к `SESSION_MAX_AGE_DAYS` (по умолчанию 30) и `REFRESH_TOKEN_EXPIRES_DAYS` (по умолчанию значение сессии).
  - Пустая строка — ошибка, а не значение по умолчанию.
  - В репозитории (`scripts/`, `e2e/`, CI, `turbo.json`, `vercel-build.*`) эти ключи не задаются.
- Тесты: значение по умолчанию; `1`, `30`, `365` принимаются; `''`, `30d`, `0`, `-1`, `1.5`, `' 30'`, `366`, `NaN` дают ошибку с именем ключа для обоих ключей. До правки 20 красных.

### CR-12: два `Toaster`

- Файл: `app/web/components/AppLayout/AppLayout.tsx`.
- Правка: из `AppLayout` убраны `import { Toaster } from '@/components/ui/sonner'` и `<Toaster />`. Остался один `Toaster` в `app/layout.tsx`.
- Отдельный коммит. `AppLayout.tsx` меняет и CR-07, поэтому файл входит в оба коммита. Для CR-12 коммитятся только две удалённые строки: `import { Toaster } from '@/components/ui/sonner'` и `<Toaster />`.
- Состояние файла только с CR-07: `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/AppLayout.pre-cr12.tsx`. Текущий файл в worktree содержит CR-07 и CR-12.
- Порядок коммитов:
  1. сохранить текущий `AppLayout.tsx`;
  2. скопировать на его место `AppLayout.pre-cr12.tsx` и закоммитить основной набор;
  3. вернуть сохранённый файл и закоммитить CR-12.
- Тост успеха в `nav-user.tsx` теперь показывается после `logout()`, а тот уже вызвал `window.location.assign('/login')`. Поэтому тост почти не виден. Так требует disposition («тост успеха после выхода»). Перенести тост на страницу логина или убрать — решение пользователя.

## Принятый риск

### SEC-04: долгая блокировка входа в чужой аккаунт

Принятый риск, решение пользователя 2026-10-04. Код не меняется. Если владелец заблокирован, ограничение снимает администратор кнопкой «снять ограничение входа» (`DELETE /api/users/:id/login-throttle`).

## Проверки

Все проверки выполнены в worktree `scratchpad/wt-p4fix`, не в основном дереве.

- `yarn verify` — `yarn verify: OK`. Лог: `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/verify-p4fix.log`.
  - Пройдены все шаги: `lockfile`, `env-contract`, `docs-commands`, `ci-workflow`, `format-check`, `lint-typecheck-test`, `migrations`, `script-tests`.
  - Тесты:
    - rbac — 2;
    - exam-core — 498;
    - web — 20 файлов, 454 теста;
    - server — 22 файла, 465 тестов.
  - Первый прогон упал на тайм-ауте теста троттлинга (см. SEC-03). После правки тайм-аута второй прогон OK.
- `yarn e2e` — 132 passed за 1,1 мин, код выхода 0. Лог: `/private/tmp/claude-501/-Users-kdvornichenko-bio-exam/bde259ee-d6cb-4f21-8450-32718d096f81/scratchpad/e2e-p4fix.log`. Единственные `✘` — ожидаемый D1 `@known-defect` (`review.spec.ts:303`, desktop и mobile, `test.fail`).

---

_Fixed: 2026-10-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
