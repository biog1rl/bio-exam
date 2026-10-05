---
name: bio-exam-web
description: Факты веб-клиента bio-exam (Next.js, app/web). Применять перед правкой app/web - запросы к API и веб-сессия, гейты по правам в интерфейсе, прохождение теста учеником, автосохранение черновика вопроса, web-тесты.
---

# bio-exam web

Данные и решения о доступе принадлежат Express (`docs/adr/0001-express-owns-data-and-access-policy.md`). Web показывает и отправляет, а не решает.

## Запросы и сессия

- Запрос к API из клиента идёт через модуль запросов `app/web/lib/http/request.ts`: `request` возвращает исход `{ ok: true, status, data }` или отказ с `kind` (`auth`, `http`, `malformed`, `network`, `aborted`), `requestJson` бросает `RequestError`, `requestBlob` скачивает файл. `parse` проверяет конверт ответа 2xx, несовпадение даёт `malformed`.
- SWR: ключ — строка из `*Keys` доменного слоя, фетчер — `swrFetcher` или `fetcherWith(parse)` из `app/web/lib/http/swr.ts`, объявленный на уровне модуля. Глобального `SWRConfig` нет.
- Тексты отказов: `failureMessage`, `loadErrorView`, `readApiError` в `app/web/lib/http/errors.ts`. Блок ошибки загрузки на экране: `app/web/components/feedback/LoadErrorAlert.tsx`.
- Доменные слои запросов: `app/web/lib/users/api.ts`, `app/web/lib/groups/api.ts`, `app/web/lib/tests/admin-api.ts`, `app/web/lib/tests/api.ts`, `app/web/lib/rbac/api.ts`, `app/web/lib/settings/api.ts`, `app/web/lib/assets/api.ts`. Сегменты пути кодируются `encodeURIComponent`.
- Цепочкой 401 владеет `apiFetch` (`app/web/lib/session/client.ts`): ответ 401 → один общий `refreshOnce()` → один повтор запроса. Отказ refresh или повторный 401 уводят на `/login` и бросают `AuthExpiredError`; недоступный refresh возвращает исходный 401 без выхода. `apiFetch` импортируют только модуль сессии `app/web/lib/session` и модуль запросов `app/web/lib/http`.
- Параллельные 401 ждут один и тот же refresh, второй не запускается.
- Серверные страницы читают API через `serverRequest` и `requireServerData` (`app/web/lib/session/server.ts`).
- Свой `fetch` с другим поведением при 401 есть только у входа (`app/web/app/(internal)/login/LoginPageClient.tsx`, разбор в `app/web/lib/session/login-errors.ts`) и приглашения (`app/web/app/(internal)/invite/[token]/InviteClient.tsx`, разбор в `app/web/lib/auth/invite-flow.ts`). Правило держит `scripts/web-requests-guards.test.mjs`.
- Продление до истечения access-токена: `createKeepAlive` (`app/web/lib/session/keep-alive.ts`), подключён в `app/web/components/providers/AuthProvider.tsx`.
- Страницы: `app/web/proxy.ts` обновляет сессию до рендера, когда access-токен истекает, и уводит на `/login`, если refresh отклонён или кук сессии нет.

## Гейты по правам

- Раздел по пути и нужные права: `SECTION_PERMISSIONS`, `sectionForPath`, `canAccessSection` в `app/web/lib/session/route-permissions.ts`.
- Серверный layout раздела вызывает `requireSectionAccess` (`app/web/lib/session/section-access.ts`): нет прав → `notFound()`.
- В клиенте права берутся из `useAuth().can(...)` (`app/web/components/providers/AuthProvider.tsx`), проверка по ключу права из `@bio-exam/rbac`, а не по строке роли. В web нет `pg`, `jsonwebtoken` и чтения секретов: это держит `scripts/auth-no-role-string-checks.test.mjs`.

## Прохождение теста

- Модуль жизненного цикла попытки: `app/web/components/tests/attempt-lifecycle/`. Ядро `createAttemptLifecycle` (`lifecycle.ts`) без React: старт, ответы, навигация, таймер и автосдача по дедлайну, телеметрия времени на вопросе, отправка, восстановление после перезагрузки.
- Хук `useAttemptLifecycle` (`app/web/components/tests/attempt-lifecycle/use-attempt-lifecycle.ts`) создаёт модуль с `localStorage` и событиями видимости браузера и отдаёт снимок через `useSyncExternalStore`. `app/web/components/tests/TestRunner.tsx` только рисует снимок и вызывает команды модуля.
- Локальная копия ответов: `wal.ts`; восстановление: `restore.ts`; строка состояния сохранения: `save-indicator.ts`; ключи хранилища: `storage-keys.ts`.
- Ответы и телеметрия уходят через очередь `createSaveQueue` (`app/web/lib/drafts/save-queue.ts`) с паузой `ATTEMPT_SAVE_DEBOUNCE_MS` и пределом ожидания `ATTEMPT_SAVE_MAX_WAIT_MS`; при `pagehide` очередь досылается с `keepalive`.
- Схемы ответов и сессии попытки берутся из `@bio-exam/exam-core`.

## Черновик вопроса

- Автосохранение: `createQuestionDraftAutosave` (`app/web/lib/drafts/question-draft-autosave.ts`) поверх `createSaveQueue` с `lockVersion` сервера.
- Локальная копия черновика до подтверждения сервером: `app/web/lib/drafts/question-draft-copy.ts`; защита ухода со страницы: `app/web/lib/drafts/before-unload.ts`; тексты тостов: `app/web/lib/drafts/draft-ui.ts`; запросы: `app/web/lib/drafts/question-draft-api.ts`.
- Хук `useQuestionDraftAutosave` (`app/web/lib/drafts/use-question-draft-autosave.ts`) регистрирует досылку в `app/web/store/unsavedChanges.store.ts`.

## Web-тесты

- Vitest в environment `node`, только `*.test.ts` (`app/web/vitest.config.ts`): React не рендерится, DOM нет.
- Логика живёт в фабрике без React со швами в параметрах (`now`, `setTimer`, `clearTimer`, `doc`) по образцу `app/web/lib/session/keep-alive.ts`; тест подставляет швы, хук остаётся тонкой обёрткой.
- Фикстуры модуля попытки: `app/web/components/tests/attempt-lifecycle/testing.ts`.

```bash
yarn workspace @bio-exam/web test
yarn workspace @bio-exam/web typecheck
yarn workspace @bio-exam/web lint
yarn e2e
```
