# Фаза 4: разбор находок ревью кода

Область: `git diff bf332e6 208765e`. Источники:
- `04-REVIEW.md` (CR-01…CR-12);
- аудит безопасности (SEC-01…SEC-07);
- аудит тестов (NQ-01…NQ-10);
- проверка devils-advocate. Пробы devils-advocate лежат в scratchpad сессии, каталог `da4/`.

## Чинить в фазе 4

| id | Severity | Правка | Тест |
|---|---|---|---|
| CR-01 / SEC-01 | BLOCKER | `app/web/lib/session/redirect.ts`: после `new URL` собрать путь; если он начинается с `//` или `/\`, вернуть fallback | `redirect.test.ts`: `/.//evil.com`, `/a/..//evil.com`, `/%2e//evil.com/x` → fallback (NQ-05) |
| CR-04 / SEC-02 | MAJOR | `app/server/src/lib/logger.ts`: `redact` на базовом `pino`, `paths: ['req.headers.cookie','req.headers.authorization']`, `censor: '[redacted]'` | Тест читает поток вывода `pino(opts, stream)`, шпион метода не годится; вместо проверки `refresh-rotation.test.ts:452` |
| CR-02 | MAJOR | `app/web/lib/session/keep-alive.ts`: запоминать время последнего `ok`; в `scheduleIn` и `update` задержка не меньше `lastOkAt + REFRESH_RETRY_MS − now`. Одной границы в `run()` мало: `update()` из `AuthProvider` снова ставит 0 | При TTL=60 после `ok` следующий refresh не раньше 30 с, в том числе через `update()` |
| CR-05 | MINOR | `services/session/index.ts`: в `revokeSession` и `revokeUserSessions` сначала `UPDATE refresh_tokens … WHERE session_id IN (SELECT id FROM auth_sessions WHERE …)`, затем `auth_sessions` (порядок как в ротации) | NQ-02: 5 параллельных replay после окна → все 401, отзыв один, без 500; replay A параллельно с ротацией |
| CR-06 | MINOR | `services/login-throttle/index.ts` `recordSuccess`: сначала UPDATE `login` (и `ip`), потом DELETE `pair` (порядок как в `reserveAttempt`) | — |
| CR-07 | MINOR | `proxy.ts` при `unavailable` ставит заголовок запроса `x-session-refresh: unavailable`; `AppLayout` читает его через `headers()` и выставляет `sessionError`. Входящий такой же заголовок proxy удаляет на всех ветках | `proxy.test.ts`: заголовок при `unavailable`, входящий вырезан |
| CR-08 | MINOR | `client.ts` `logout()` возвращает `false` только при сбое сети; `AuthProvider`/`nav-user.tsx` при `false` остаются на странице и показывают ошибку; тост успеха после выхода | `client.test.ts` |
| SEC-05 | LOW | `revokeUserSessions`: дополнительно `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND session_id IS NULL AND revoked_at IS NULL` | Токен без сессии после «завершить все сеансы» → 401 |
| SEC-06 | LOW | `routes/auth/login.ts`: zod до `reserveAttempt`; `username` — строка 1…64, `password` — строка 1…1024, иначе 400 | Не-строка и длинный логин → 400, строк в `login_throttle` нет |
| SEC-03 | LOW–MEDIUM | Одна константа `BCRYPT_COST = 12` для `invites.ts`, `profile.ts`, `bootstrap-admin.ts`; `DUMMY_HASH` с cost 12; при успешном входе, если `getRounds(hash) !== BCRYPT_COST`, пересчитать хэш | Вход со старым хэшем cost 10 обновляет хэш |
| CR-03 | MINOR | `routes/auth/invites.ts` accept: `revokeUserSessions(inv.userId, { reason: 'password_change' }, tx)` в транзакции | Accept отзывает прежние сессии |
| NQ-03 | — | — | Replay в сессии A не трогает сессию B того же пользователя |
| CR-10 | INFO | Парсер `*_DAYS` по образцу `parseAccessTokenTtl`, fail-fast на старте; пустое значение и `30d` → ошибка с именем ключа | `cookies.test.ts` или `config` |
| CR-12 | MINOR | Убрать `<Toaster />` из `AppLayout.tsx`, отдельным коммитом | — |

## Решения пользователя (2026-10-04)

- **SEC-04.** Риск принят: долгая блокировка входа посторонним. Восстановление — кнопка администратора «снять ограничение входа». Формулировку T-4-27 «не дольше минуты» понимать как «одна серия».
- **CR-02.** Минимум `ACCESS_TOKEN_EXPIRES_SEC` остаётся 60 (D-06 без изменений). Порог обновления в proxy: `min(60, (exp − iat) / 2)` с.
- **CR-03.** Отзыв сессий при accept, а `POST /invites` для активного пользователя отвечает 409.

## Отложено

- **Phase 8 (HTTP-04):**
  - SEC-07: `absoluteUrl` и `x-forwarded-host`;
  - CR-09: чтение тела в `getServerMe`, только вместе с `yarn e2e`.
- **Phase 7.1:** если `teacher` получит `users.invite`, проверка `isActive` при выдаче приглашения обязательна до выдачи права.

## Опровергнуто или не делается

- CR-11: поведение задумано (D-18, `proxy.test.ts:206-211`).
- NQ-06, NQ-08: уже покрыто.
- NQ-01, NQ-04, NQ-09, NQ-10: низкая ценность.
- NQ-07: остаток — документирующий тест к SEC-04.
