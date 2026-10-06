---
phase: "7"
slug: "storage-and-question-content"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 7 — Validation Strategy

> Контракт проверки фазы: требования STOR-01..STOR-05, QCON-01..QCON-05, ASSET-01..ASSET-02, PRIV-01..PRIV-03 и критерии успеха SC1..SC5 из ROADMAP.

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
| STOR-01 (SC1) | Файлы доступны только через модуль хранилища: в routes нет `fs`, `path` и литералов путей; по умолчанию в тестах память; выбор драйвера | static + unit | `scripts/storage-no-private-access.test.mjs`, `app/server/src/services/storage/storage-memory-default.test.ts`, `app/server/src/services/storage/storage.local.test.ts` | GUARD `storage-no-private-access.test.mjs`; SRV `src/services/storage/storage-memory-default.test.ts src/services/storage/storage.local.test.ts` | ✅ |
| STOR-02 (SC1) | `normalizeKey` отвергает `../`, закодированный обход, абсолютные пути, чужие префиксы; ключ проверяется до адаптера; единые ошибки `StorageUnavailable`, `Conflict`, `NotFound`; локальный адаптер не выходит за корень (symlink, соседний префикс) | unit | `app/server/src/services/storage/storage-known-defects.test.ts`, `app/server/src/services/storage/storage.local.test.ts` | SRV `src/services/storage/storage-known-defects.test.ts src/services/storage/storage.local.test.ts` | ✅ |
| STOR-03 (SC1) | Один контрактный набор на локальном адаптере, подделке клиента Supabase и памяти, плюс враждебные ключи | contract | `app/server/src/services/storage/storage.contract.test.ts` | SRV `src/services/storage/storage.contract.test.ts` | ✅ + manual |
| STOR-04 (SC3) | Web получает готовые URL: нет `/storage/v1/`, `getStoragePathFromSupabaseUrl`, `isStoragePath`; кэш подписанных URL; `GET /signed` | static + unit + integration (DB) | `scripts/storage-no-private-access.test.mjs`, `app/web/lib/image-signed-url-cache.test.ts`, `app/server/src/routes/docs/assets.test.ts` | GUARD `storage-no-private-access.test.mjs`; WEB `lib/image-signed-url-cache.test.ts`; SRV `src/routes/docs/assets.test.ts` | ✅ |
| STOR-05 (SC3) | ZIP экспорта содержит картинки, на которые ссылаются вопросы; медиатека отказывает в удалении используемой картинки (409) | unit + integration (DB) + e2e | `app/server/src/services/question-content/export.test.ts`, `app/server/src/routes/tests/question-relocation.characterization.test.ts`, `app/server/src/routes/docs/assets.test.ts`, `e2e/tests/assets.spec.ts` | SRV `src/services/question-content/export.test.ts src/routes/tests/question-relocation.characterization.test.ts src/routes/docs/assets.test.ts`; E2E `assets` | ✅ + manual |
| STOR-05 (SC3) | Лимит ответа ZIP: 2000 байт даёт 413, 0 включает поток, не заданный равен 4 400 000 | integration (DB) | `app/server/src/routes/tests/export-routes.test.ts` | SRV `src/routes/tests/export-routes.test.ts` | ✅ |
| STOR-05 (SC3) | Вставленная base64-картинка при сохранении вопроса переносится в `images/<hash>.webp`, ссылки индексируются; ученик её видит, экспорт темы скачивает ZIP | integration (DB) + e2e (`@assets`) | `app/server/src/services/question-content/inline-images.test.ts`, `e2e/tests/inline-image-export.spec.ts` | SRV `src/services/question-content/inline-images.test.ts`; E2E `inline-image-export` | ✅ |
| STOR-05 (SC3) | Медиатека и диалог отказа удаления на 375 px: текст виден, кнопки «Удалить» нет, горизонтальной прокрутки нет | e2e (`@layout375`) | `e2e/tests/mobile-layout.spec.ts` | E2E `mobile-layout` | ✅ |
| QCON-01 (SC2) | Один модуль ведёт жизненный цикл вопроса (создание, правка, перенос, удаление, чтение) по пяти частям; маршруты `tests` собраны из подроутеров | integration (DB) + static | `app/server/src/services/question-content/write.test.ts`, `app/server/src/services/question-content/read.test.ts`, `app/server/src/services/question-content/move-remove.test.ts`, `app/server/src/services/question-content/relocate.test.ts`, `scripts/tests-router-composition.test.mjs` | SRV `src/services/question-content/write.test.ts src/services/question-content/read.test.ts src/services/question-content/move-remove.test.ts src/services/question-content/relocate.test.ts`; GUARD `tests-router-composition.test.mjs` | ✅ |
| QCON-02 (SC2) | Переименование slug переносит файлы и откатывается при сбое; сбой копирования даёт 503, сбой транзакции не оставляет половинчатого состояния; сверка файлов и БД | integration (DB) | `app/server/src/routes/tests/question-relocation.characterization.test.ts`, `app/server/src/services/question-content/move-remove.test.ts`, `app/server/src/services/question-content/relocate.test.ts`, `app/server/src/services/question-content/reconcile.test.ts` | SRV `src/routes/tests/question-relocation.characterization.test.ts src/services/question-content/move-remove.test.ts src/services/question-content/relocate.test.ts src/services/question-content/reconcile.test.ts` | ✅ |
| QCON-03 (SC2) | Порядок вопросов без дыр после создания, переноса, удаления и параллельного переноса с созданием; `PUT` reorder | integration (DB) | `app/server/src/services/question-content/move-remove.test.ts`, `app/server/src/routes/tests/question-content.characterization.test.ts` | SRV `src/services/question-content/move-remove.test.ts src/routes/tests/question-content.characterization.test.ts` | ✅ |
| QCON-04 (SC2) | D6: `PATCH` вопроса не удаляет старый prompt до записи нового | integration (DB) | `app/server/src/routes/tests/question-content.characterization.test.ts` | SRV `src/routes/tests/question-content.characterization.test.ts` | ✅ |
| QCON-05 | `POST /api/tests/save` не пишет `settings.json`; экспорт с `withAnswers` не пишет `answer_keys.json` в хранилище; чтение админского теста через один `readAdminTest` | integration (DB) | `app/server/src/services/question-content/write.test.ts`, `app/server/src/routes/tests/question-relocation.characterization.test.ts`, `app/server/src/services/question-content/read.test.ts` | SRV `src/services/question-content/write.test.ts src/routes/tests/question-relocation.characterization.test.ts src/services/question-content/read.test.ts` | ✅ |
| ASSET-01 (SC4) | Загрузка и удаление требуют `tests.write` (матрица GET, POST, DELETE); имена объектов нормализуются в `images/<hex>.webp`; `POST /api/tests/:id/assets` | integration (DB) | `app/server/src/routes/docs/assets.test.ts`, `app/server/src/routes/uploads.test.ts` | SRV `src/routes/docs/assets.test.ts src/routes/uploads.test.ts` | ✅ |
| ASSET-02 (SC4) | `DELETE` только `images/<имя>`: обход, закодированный обход, абсолютный путь и чужой префикс отвергаются; устаревшая ссылка открывается через proxy; логика `assets:refs` | integration (DB) | `app/server/src/routes/docs/assets.test.ts`, `app/server/src/services/question-content/asset-refs.test.ts` | SRV `src/routes/docs/assets.test.ts src/services/question-content/asset-refs.test.ts` | ✅ + manual |
| PRIV-01 (SC5) | Справочник пользователей отдаёт ровно 7 ключей; роль `user` не получает `users.read` | integration (DB) + static + e2e | `app/server/src/routes/users/directory.test.ts`, `scripts/storage-no-private-access.test.mjs`, `e2e/tests/assets.spec.ts` | SRV `src/routes/users/directory.test.ts`; GUARD `storage-no-private-access.test.mjs`; E2E `assets` | ✅ |
| PRIV-02 (SC5) | Админ и `user` с allow видят полные данные через админские права; ни один экран ученика в web не вызывает `/api/users`; поиск пользователя | integration (DB) + static + e2e | `app/server/src/routes/users/directory.test.ts`, `app/server/src/routes/users/users-list.characterization.test.ts`, `scripts/student-screens-no-users-api.test.mjs`, `e2e/tests/user-lookup.spec.ts` | SRV `src/routes/users/directory.test.ts src/routes/users/users-list.characterization.test.ts`; GUARD `student-screens-no-users-api.test.mjs`; E2E `user-lookup` | ✅ |
| PRIV-03 (SC5) | Матрица прав D-22 и сравнение множеств ключей минимального и админского ответов | integration (DB) | `app/server/src/routes/users/directory.test.ts` | SRV `src/routes/users/directory.test.ts` | ✅ |

Критерии ROADMAP: SC1 = STOR-01..STOR-03; SC2 = QCON-01..QCON-04; SC3 = STOR-04 и STOR-05; SC4 = ASSET-01 и ASSET-02; SC5 = PRIV-01..PRIV-03.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| Живой адаптер Supabase: чтение, запись, копирование, листинг больше 100 объектов, удаление | STOR-03 | Изоляция тестов запрещает живой бакет; прод работает на локальном адаптере, Supabase отключается | Контракт держит подделка клиента Supabase; живой бакет не проверяется |
| STOP D-19: `yarn workspace @bio-exam/server assets:refs` на проде не находит ссылок вне нормализованного пространства | ASSET-02 | Нужны прод-данные; логика скрипта покрыта `asset-refs.test.ts` | Выполнено пользователем при переносе |
| ZIP самой крупной темы с картинками: до 4 400 000 байт скачивается целиком, больше даёт 413 | STOR-05 | Размер зависит от прод-контента; порог лимита проверяет `export-routes.test.ts` | Подтверждено пользователем 2026-10-05 |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест, новый или существующий. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 5 |
| Resolved | 3 |
| Manual-only | 2 |

Закрыто: PRIV-02 (экраны ученика не ходят на `/api/users`) — `scripts/student-screens-no-users-api.test.mjs`; SC3 (медиатека и отказ удаления на 375 px) — `e2e/tests/mobile-layout.spec.ts`; STOR-05 (лимит ZIP) — существующий `app/server/src/routes/tests/export-routes.test.ts`. Ручные: живой Supabase (STOR-03), STOP D-19 на прод-ссылках (ASSET-02). Сверх карты добавлен `e2e/tests/inline-image-export.spec.ts` (base64-картинка, экспорт темы); перенос base64 при сохранении проверяет `app/server/src/services/question-content/inline-images.test.ts`. Нового тестового кода: два файла (`student-screens-no-users-api.test.mjs`, `inline-image-export.spec.ts`); `mobile-layout.spec.ts` общий с фазами 3 и 6.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 15: автоматизировано 15, из них с ручным остатком 3, только ручных 0)
