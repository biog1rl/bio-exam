---
phase: "8"
slug: "client-requests-runtime-and-decomposition"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 8 — Validation Strategy

> Контракт проверки фазы: требования HTTP-01..HTTP-04, RT-01..RT-04, PERF-01..PERF-05, DECOMP-01..DECOMP-02 и критерии успеха SC1..SC5 из ROADMAP.

---

## Test Infrastructure

| Свойство | Значение |
|----------|----------|
| **Фреймворки** | Vitest (web, server), `node:test` для проверок репозитория в `scripts/`, Playwright (e2e) |
| **Конфиги** | `app/web/vitest.config.ts`, `app/server/vitest.config.ts`, `e2e/playwright.config.ts` |
| **Полный набор** | `yarn verify` (без e2e, сам поднимает одноразовый PostgreSQL 17), затем `yarn e2e` |
| **Только CI** | `yarn editor:budget` (после сборки web, шаг «Check editor bundle budget» в `.github/workflows/ci.yml`) |
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
| HTTP-01 (SC2) | Типизированный слой запросов над `apiFetch`: 401, не-OK, битый JSON, сеть, отмена; `apiFetch` не отдаёт сырой `Response` | unit + static | `app/web/lib/http/request.test.ts`, `scripts/web-requests-guards.test.mjs` | WEB `lib/http/request.test.ts`; GUARD `web-requests-guards.test.mjs` | ✅ |
| HTTP-02 (SC2) | Все защищённые вызовы идут через типизированные слои по доменам (users, groups, tests, settings, assets, rbac, search); в web нет локальных fetcher, собственного `swrConfig` и голого `fetch` | unit + static | `app/web/lib/users/api.test.ts`, `app/web/lib/groups/api.test.ts`, `app/web/lib/tests/api.test.ts`, `app/web/lib/settings/api.test.ts`, `app/web/lib/assets/api.test.ts`, `app/web/lib/rbac/api.test.ts`, `app/web/lib/search/api.test.ts`, `scripts/web-requests-guards.test.mjs` | WEB `lib/users/api.test.ts lib/groups/api.test.ts lib/tests/api.test.ts lib/settings/api.test.ts lib/assets/api.test.ts lib/rbac/api.test.ts lib/search/api.test.ts`; GUARD `web-requests-guards.test.mjs` | ✅ + manual |
| HTTP-02 (SC2) | Исключения 401: неверный пароль оставляет на `/login` с понятным текстом; тексты приглашения и ошибок входа | e2e (`@http02`) + unit | `e2e/tests/login-401.spec.ts`, `app/web/lib/auth/invite-flow.test.ts`, `app/web/lib/session/login-errors.test.ts` | E2E `login-401`; WEB `lib/auth/invite-flow.test.ts lib/session/login-errors.test.ts` | ✅ |
| HTTP-02 | Занятый адрес теста (409) при создании и смене адреса показывается у поля, а не как «Ошибка сохранения» | unit + e2e | `app/web/app/(internal)/(protected)/admin/tests/components/test-editor/test-editor-api.test.ts`, `e2e/tests/authoring.spec.ts` | WEB `test-editor-api.test.ts`; E2E `authoring` | ✅ |
| HTTP-03 (SC1) | D7: поиск пользователя по id и логину в Express; пользователь вне первых 100 открывается из поиска без 404; зона учителя учтена | integration (DB) + e2e | `app/server/src/routes/users/user-lookup.test.ts`, `app/server/src/routes/users/teacher-zone-users.matrix.test.ts`, `e2e/tests/user-lookup.spec.ts` | SRV `src/routes/users/user-lookup.test.ts src/routes/users/teacher-zone-users.matrix.test.ts`; E2E `user-lookup` | ✅ |
| HTTP-04 (SC1) | Серверные страницы ходят в Express одним путём (`API_ORIGIN`); `absoluteUrl` и `x-forwarded-host` не используются | unit + static + e2e | `app/web/lib/session/server.test.ts`, `scripts/web-requests-guards.test.mjs`, `e2e/tests/server-pages.spec.ts` | WEB `lib/session/server.test.ts`; GUARD `web-requests-guards.test.mjs`; E2E `server-pages` | ✅ |
| RT-01 (SC3) | Код редактора не трогает `document` и `window` при рендере: SSR-рендер | unit | `app/web/components/editor/editor.ssr.test.ts` | WEB `components/editor/editor.ssr.test.ts` | ✅ |
| RT-02 (SC3) | Колбэк `use-debounce` обновляется в эффекте и отменяется при размонтировании; общий хук подписки тулбара; слушатели и объекты распознавания речи отсоединяются при очистке | unit | `app/web/components/editor/editor-hooks/use-debounce.test.ts`, `app/web/components/editor/editor-hooks/toolbar-subscription.test.ts`, `app/web/components/editor/plugins/actions/speech-session.test.ts` | WEB `components/editor/editor-hooks components/editor/plugins/actions/speech-session.test.ts` | ✅ + manual |
| RT-03 (SC3) | При `prefers-reduced-motion` анимации глобального поиска, медиатеки и плавающей панели форматирования отключены (CSS-ветки `motion-reduce`, сравнение с прогоном без эмуляции); утилита `prefersReducedMotion` | e2e (`@rt03`) + unit | `e2e/tests/reduced-motion.spec.ts`, `app/web/lib/utils/reduced-motion.test.ts` | E2E `reduced-motion`; WEB `lib/utils/reduced-motion.test.ts` | ✅ + manual |
| RT-04 (SC3) | Production-сборка web завершается кодом 0 (job `build` CI и сборка внутри `yarn e2e`); отчёт `react-doctor` без подтверждённых ошибок | build (CI, e2e) | `scripts/e2e.mjs`, `scripts/check-ci-workflow.mjs` | `yarn e2e`; шаг `ci-workflow` в `yarn verify` | ✅ + manual |
| PERF-01 (SC4) | Категории поиска идут параллельно, порядок детерминирован, фильтрация по правам сохранена (характеризация со строгим `snapshotOf`); пул 2, 429 на 61-й запрос | integration (DB) | `app/server/src/services/search/database-search.test.ts`, `app/server/src/routes/search-results.characterization.test.ts`, `app/server/src/routes/search-limits.test.ts` | SRV `src/services/search/database-search.test.ts src/routes/search-results.characterization.test.ts src/routes/search-limits.test.ts` | ✅ |
| PERF-02 (SC4) | Скачивание prompt идёт с ограниченным параллелизмом в одном месте, порядок запасных вариантов и отказы по вопросам сохранены | integration (DB) | `app/server/src/services/question-content/bounded.test.ts`, `app/server/src/services/question-content/read-texts.test.ts` | SRV `src/services/question-content/bounded.test.ts src/services/question-content/read-texts.test.ts` | ✅ |
| PERF-03 (SC4) | Профили редактора, ленивые группы плагинов и данные эмодзи: сериализация и доступность тулбара не изменились (золотые MDX-тесты); эмодзи загружаются лениво | unit + e2e | `app/web/components/editor/utils/mdx-golden.test.ts`, `app/web/components/editor/utils/mdx-emoji-load.test.ts`, `app/web/components/editor/utils/emoji-table.test.ts`, `app/web/components/editor/utils/markdown-toggle.test.ts`, `e2e/tests/editor-emoji-lazy.spec.ts`, `e2e/tests/editor-toolbar.spec.ts` | WEB `components/editor/utils`; E2E `editor-emoji-lazy`; E2E `editor-toolbar` | ✅ + manual |
| PERF-03 (SC4) | Логика бюджета бандла редактора на фикстурах | unit | `scripts/editor-bundle.test.mjs` | GUARD `editor-bundle.test.mjs` | ✅ |
| PERF-04 (SC4) | Экспорт читает данные наборами, ограничивает скачивания, отдаёт ZIP потоком с отменой и backpressure; результат эквивалентен прежнему; 413, 429 и закрытие потока; хранилище не отдаёт данные мимо модуля | integration (DB) + static | `app/server/src/services/question-content/export-queries.test.ts`, `app/server/src/services/storage/zip-stream.test.ts`, `app/server/src/services/question-content/export-equivalence.test.ts`, `app/server/src/routes/tests/export-routes.test.ts`, `scripts/storage-no-private-access.test.mjs` | SRV `src/services/question-content/export-queries.test.ts src/services/storage/zip-stream.test.ts src/services/question-content/export-equivalence.test.ts src/routes/tests/export-routes.test.ts`; GUARD `storage-no-private-access.test.mjs` | ✅ |
| PERF-05 (SC4) | Эквивалентность результата поиска и ZIP: те же тесты, что для PERF-01 и PERF-04 | integration (DB) | `app/server/src/routes/search-results.characterization.test.ts`, `app/server/src/services/question-content/export-equivalence.test.ts` | SRV `src/routes/search-results.characterization.test.ts src/services/question-content/export-equivalence.test.ts` | ✅ + manual |
| DECOMP-01 (SC5) | Характеризация порядка регистрации маршрутов и публичный снимок инвентаря маршрутов | integration (DB) + unit | `app/server/src/routes/tests/registration.characterization.test.ts`, `app/server/src/routes/route-inventory.snapshot.test.ts`, `app/server/src/lib/route-inventory.test.ts` | SRV `src/routes/tests/registration.characterization.test.ts src/routes/route-inventory.snapshot.test.ts src/lib/route-inventory.test.ts` | ✅ |
| DECOMP-02 (SC5) | Разбиение `routes/tests/index.ts` на подроутеры сохраняет цепочки middleware и порядок путей: снимок совпадает с `app/server/route-inventory.txt` байт в байт; точка сборки остаётся малой | integration (DB) + static | `app/server/src/routes/route-inventory.snapshot.test.ts`, `scripts/tests-router-composition.test.mjs` | SRV `src/routes/route-inventory.snapshot.test.ts`; GUARD `tests-router-composition.test.mjs` | ✅ + manual |

Критерии ROADMAP: SC1 = HTTP-03 и HTTP-04; SC2 = HTTP-01 и HTTP-02; SC3 = RT-01..RT-04; SC4 = PERF-01..PERF-05; SC5 = DECOMP-01 и DECOMP-02.

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| JS-ветка `prefersReducedMotion` в `SearchDialog` | RT-03 | e2e различает только CSS-ветки `motion-reduce`; вызов утилиты в компоненте в unit-среде без DOM не проверяется | Эмуляция `prefers-reduced-motion: reduce` (поиск, медиатека, плавающая панель): движения нет, спиннеры крутятся; подтверждено пользователем 2026-10-05 |
| Принятие приглашения с отказом входа (401): `InviteClient` остаётся на странице приглашения, на `/login` не уводит | HTTP-02 | В сиде e2e нет токена приглашения; поведение компонента в unit-среде без DOM не проверяется, тексты закрыты `invite-flow.test.ts` и `login-errors.test.ts` | Вручную: принять приглашение с неверным паролем при входе |
| Все десять плагинов тулбара используют общий хук `useUpdateToolbarHandler`, собственных `registerUpdateListener` нет | RT-02 | Структурный тест хрупок; сам хук покрыт `toolbar-subscription.test.ts` | Закрыто ревью кода |
| `react-doctor` без подтверждённых ошибок (`npx -y react-doctor@latest app/web --verbose --scope full --offline`) | RT-04 | Сетевой инструмент с плавающей версией, вне `yarn verify` | Отчёт `.planning/phases/08-client-requests-runtime-and-decomposition/08-REACT-DOCTOR.md`; сборка web проходит в CI и в `yarn e2e` |
| Бенчмарки до и после: число запросов, потолок параллелизма, пик буфера, размер чанка редактора | PERF-05 | Замеры зависят от машины; эквивалентность результата закрыта тестами | `.planning/phases/08-client-requests-runtime-and-decomposition/08-BENCHMARKS.md`, код замера `app/server/src/scripts/bench` |
| Бюджет бандла редактора: `yarn editor:budget` | PERF-03 | Нужна сборка web на минуты; бюджет проверяется только шагом CI, в `yarn verify` не входит | Шаг «Check editor bundle budget» в `.github/workflows/ci.yml`; логика на фикстурах в `scripts/editor-bundle.test.mjs` |
| Подмена анонимного обработчика между маршрутами с одинаковой цепочкой не меняет снимок; `codegraph affected` затрагивает только ожидаемые тесты | DECOMP-02 | Структурный тест хрупок; `codegraph affected` зависит от внешнего индекса `.codegraph`, в CI его нет | `yarn workspace @bio-exam/server routes:inventory --check` и ревью кода |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест, новый или существующий. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 10 |
| Resolved | 4 |
| Manual-only | 6 |

Закрыто: RT-03 — `e2e/tests/reduced-motion.spec.ts`; HTTP-02 (исключение 401 входа) — `e2e/tests/login-401.spec.ts`; PERF-01 (характеризация поиска сопоставляет полный набор ключей) — строгий `snapshotOf` в `app/server/src/routes/search-results.characterization.test.ts`; PERF-03 (эмодзи подгружаются без таймера) — существующий `e2e/tests/editor-emoji-lazy.spec.ts`. Ручные: PERF-03 (бюджет, только CI), RT-02, DECOMP-02 (анонимные обработчики), DECOMP-02 (`codegraph affected`), RT-04, PERF-05. У RT-03 и HTTP-02 остаётся ручной остаток, он записан в Manual-Only. Сверх карты: занятый адрес теста (409) проверяют `test-editor-api.test.ts` и шаг в `e2e/tests/authoring.spec.ts`. Нового тестового кода: два файла (`reduced-motion.spec.ts`, `login-401.spec.ts`). Компонентное поведение без DOM (`GroupSheet`, откат тоста, 409 по slug) проверяют чистые функции; в счёт пробелов оно не входит.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 15: автоматизировано 15, из них с ручным остатком 7, только ручных 0)
