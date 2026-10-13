---
phase: "4"
slug: "authentication-and-web-session"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 4 — Validation Strategy

> Контракт проверки фазы: требования AUTH-01..AUTH-12 и критерии успеха SC1..SC5 из ROADMAP.

---

## Test Infrastructure

| Свойство | Значение |
|----------|----------|
| **Фреймворки** | Vitest (web, server), `node:test` для проверок репозитория в `scripts/`, Playwright (e2e) |
| **Конфиги** | `app/web/vitest.config.ts`, `app/server/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Полный набор** | `yarn verify` (без e2e, сам поднимает одноразовый PostgreSQL 17), затем `yarn e2e` |
| **Время** | один воркспейс до 10 с; `yarn verify` 60–120 с; `yarn e2e` несколько минут |

Команды запуска; `<файл>` берётся из колонки «Файл теста»:

| Алиас | Команда |
|-------|---------|
| WEB | `yarn workspace @bio-exam/web vitest run <файл>` |
| SRV | `node scripts/with-test-db.mjs -- yarn workspace @bio-exam/server vitest run <файл>` |
| GUARD | `node --test scripts/<файл>` |
| E2E | `yarn e2e tests/<файл>.spec.ts` |

---

## Per-Requirement Verification Map

Статус: ✅ есть автотест; ✅ + manual есть автотест и ручной остаток из Manual-Only; manual автотеста нет.

| Требование | Что проверяется | Тип | Файл теста | Команда | Статус |
|------------|-----------------|-----|------------|---------|--------|
| AUTH-01 (SC4) | Один модуль считает эффективные права по ролям и переопределениям с учётом `inherits`; `/api/auth/me` и `requirePerm` дают одинаковый ответ по каждому `PermissionKey`; ошибка БД не выдаёт права | unit + integration (DB) | `app/server/src/services/access-policy/policy.test.ts`, `app/server/src/routes/auth/me-requirePerm-parity.test.ts`, `app/server/src/routes/auth/auth-known-defects.test.ts` | SRV `src/services/access-policy/policy.test.ts src/routes/auth/me-requirePerm-parity.test.ts src/routes/auth/auth-known-defects.test.ts` | ✅ |
| AUTH-02 (SC1) | Роль, снятая после выдачи токена, действует со следующего запроса; запрет в БД перекрывает админа | integration (DB) | `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/server/src/routes/auth/me-requirePerm-parity.test.ts` | SRV `src/routes/auth/auth-known-defects.test.ts src/routes/auth/me-requirePerm-parity.test.ts` | ✅ |
| AUTH-03 (SC4) | D4: исходы маршрутов, где раньше стояли проверки строк ролей, закреплены; в `app/web` и `app/server` нет проверок по строкам ролей | integration (DB) + static | `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/server/src/routes/auth/auth-characterization.test.ts`, `app/server/src/routes/tests/access-routes.test.ts`, `scripts/auth-no-role-string-checks.test.mjs` | SRV `src/routes/auth/auth-known-defects.test.ts src/routes/auth/auth-characterization.test.ts src/routes/tests/access-routes.test.ts`; GUARD `auth-no-role-string-checks.test.mjs` | ✅ |
| AUTH-04 (SC1) | Выход отзывает сессию; access-токен без `sid` или с отозванной сессией получает 401; смена пароля, деактивация, отзыв админом и приглашение отзывают сессии; после выхода старая cookie отклоняется | integration (DB) + e2e | `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/server/src/routes/auth/refresh-rotation.test.ts`, `app/server/src/routes/auth/session-revocation.test.ts`, `e2e/tests/session.spec.ts` | SRV `src/routes/auth/auth-known-defects.test.ts src/routes/auth/refresh-rotation.test.ts src/routes/auth/session-revocation.test.ts`; E2E `session` | ✅ + manual |
| AUTH-05 (SC2) | Два параллельных refresh дают одного преемника; повтор отзывает семейство; при отказе транзакции ответ 500 без `Set-Cookie` | integration (DB) | `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/server/src/routes/auth/refresh-rotation.test.ts` | SRV `src/routes/auth/auth-known-defects.test.ts src/routes/auth/refresh-rotation.test.ts` | ✅ |
| AUTH-06 (SC3) | Прогрессивный throttle по паре аккаунт и IP на общем хранилище; чужой IP не блокирует жертву; сброс throttle админом; страница входа показывает ожидание при 429; действия над сессиями в карточке | integration (DB) + unit + e2e | `app/server/src/routes/auth/login-throttle.test.ts`, `app/server/src/services/login-throttle/progression.test.ts`, `app/server/src/routes/auth/auth-known-defects.test.ts`, `app/web/components/users/session-actions.test.ts`, `e2e/tests/session.spec.ts` | SRV `src/routes/auth/login-throttle.test.ts src/services/login-throttle/progression.test.ts src/routes/auth/auth-known-defects.test.ts`; WEB `components/users/session-actions.test.ts`; E2E `session` | ✅ + manual |
| AUTH-07 | `readCookie` и `appendSetCookie` объявлены один раз, в `services/session/cookies.ts`; сервер пишет `Set-Cookie` только через них; web собирает `Set-Cookie` refresh в одном месте; после refresh claim `login` сохраняется; границы TTL и срока сессии | unit + static | `app/server/src/services/session/cookies.test.ts`, `app/server/src/routes/auth/refresh-rotation.test.ts`, `scripts/auth-single-session-helpers.test.mjs` | SRV `src/services/session/cookies.test.ts src/routes/auth/refresh-rotation.test.ts`; GUARD `auth-single-session-helpers.test.mjs` | ✅ |
| AUTH-08 (SC5) | В `app/web` нет `pg`, `jsonwebtoken`, `DATABASE_URL`, `AUTH_JWT_SECRET`; файлы web-маршрута `me`, `getMeData`, пула и RBAC-слоя не вернулись | static | `scripts/auth-no-role-string-checks.test.mjs`, `scripts/auth-single-session-helpers.test.mjs` | GUARD `auth-no-role-string-checks.test.mjs auth-single-session-helpers.test.mjs` | ✅ |
| AUTH-09 (SC5) | Один модуль владеет текущим пользователем, цепочкой 401 → refresh → повтор (несколько 401 дают один refresh) и редиректом входа с callback | unit | `app/web/lib/session/client.test.ts`, `app/web/lib/session/server.test.ts`, `app/web/lib/session/redirect.test.ts` | WEB `lib/session/client.test.ts lib/session/server.test.ts lib/session/redirect.test.ts` | ✅ |
| AUTH-10 (SC5) | D3: загрузка страницы не делает браузерных `/api/auth/me` и `/api/auth/refresh`; `AuthProvider` монтируется один раз, в `AppLayout`, а `AppLayout` один раз в корневом layout | e2e + static | `e2e/tests/session.spec.ts`, `scripts/auth-single-session-helpers.test.mjs` | E2E `session`; GUARD `auth-single-session-helpers.test.mjs` | ✅ |
| AUTH-11 (SC5) | D8: серверная страница с истёкшим access и живым refresh обновляет сессию, а не уводит на вход; refresh при SSR | unit + e2e | `app/web/proxy.test.ts`, `e2e/tests/session.spec.ts` | WEB `proxy.test.ts`; E2E `session` | ✅ |
| AUTH-12 (SC4) | Гейты UI берут права из того же списка, что Express (`SECTION_PERMISSIONS`); `requireSectionAccess` в layouts согласован с `sectionForPath`; роль `user` не видит `/admin/users`; в web нет проверок по строкам ролей | unit + e2e + static | `app/web/lib/session/route-permissions.test.ts`, `app/web/lib/session/section-access.test.ts`, `e2e/tests/session.spec.ts`, `scripts/auth-no-role-string-checks.test.mjs` | WEB `lib/session/route-permissions.test.ts lib/session/section-access.test.ts`; E2E `session`; GUARD `auth-no-role-string-checks.test.mjs` | ✅ + manual |

Критерии ROADMAP: SC1 = AUTH-02 и AUTH-04; SC2 = AUTH-05; SC3 = AUTH-06; SC4 = AUTH-01, AUTH-03, AUTH-12; SC5 = AUTH-08..AUTH-11.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| Клиентский компонент `AuthGuard` не обходит права через `isAdmin` | AUTH-12 | В unit-среде нет DOM, компонент клиентский; чистая функция `canAccessSection`, `SECTION_PERMISSIONS` и `requireSectionAccess` в layouts закрыты автотестами | Ревью кода при верификации фазы; поведение для роли `user` подтверждает e2e |
| Вёрстка на 375 px: блок «Сеансы и вход», страница входа с отсчётом при 429 | AUTH-04, AUTH-06 | Визуальная оценка | Подтверждено пользователем 2026-10-05 |
| Шаги выкатки по runbook D-24: SQL до и после миграции 0021, переменные окружения, порядок деплоя и отката server и web, IP за rewrite (`IP_TRUSTED`) | — | Нужны прод и сетевой путь прод-среды, агентам доступа нет | Выполнены пользователем; Vercel больше не используется |
| Принятие автономных решений: бэкфилл сессий без повторного входа, отказ при ошибке БД прав или сессии (500 вместо базовых прав), цена строгой ротации refresh | — | Решения принимает пользователь | Приняты пользователем 2026-10-05 |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 4 |
| Resolved | 4 |
| Manual-only | 0 |

Закрыто: AUTH-07, AUTH-08, AUTH-10 новым `scripts/auth-single-session-helpers.test.mjs`; AUTH-12 (`requireSectionAccess`, согласованность layout и `sectionForPath`) новым `app/web/lib/session/section-access.test.ts`. Клиентская часть AuthGuard остаётся в Manual-Only. Нового тестового кода: два файла.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 12: автоматизировано 12, из них с ручным остатком 3, только ручных 0)
