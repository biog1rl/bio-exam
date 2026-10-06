---
phase: "2"
slug: "dependency-security"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-06"
---

# Phase 2 — Validation Strategy

> Контракт проверки фазы: требования DEP-01..DEP-05 и критерии успеха SC1..SC4 из ROADMAP.

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
| DEP-01 (SC2) | Версии не ниже порогов во всех записях `yarn.lock` и в `package.json` воркспейсов: `next` и `@next/mdx` не ниже 16.3.6 и равны друг другу, `multer` 2.x не ниже 2.4.0, `sharp` не ниже 0.35.0, `drizzle-orm` не ниже 0.45.3, `postcss` не ниже 8.5.18; TinyMCE нет ни в lock, ни в манифестах | статика (node:test) | `scripts/dependency-floors.test.mjs` | GUARD `dependency-floors.test.mjs` | ✅ |
| DEP-02 | `lodash` не ниже 4.18.1 во всех записях `yarn.lock` и в манифесте | статика (node:test) | `scripts/dependency-floors.test.mjs` | GUARD `dependency-floors.test.mjs` | ✅ |
| DEP-03 (SC3) | Недоверенный MDX не исполняется: матрица `PAYLOADS` и набор `LEGIT_FIXTURES` проходят через настоящие `serialize` и `renderToString` | unit | `app/web/lib/mdx/untrusted.test.ts` | WEB `lib/mdx/untrusted.test.ts` | ✅ + manual |
| DEP-04 (SC1) | Прямых production advisory нет; каждый оставшийся транзитивный advisory записан с путём, достижимостью и статусом upstream в `docs/security/dependency-audit.md` | ручной прогон `yarn npm audit` | — | см. Manual-Only | manual |
| DEP-05 (SC2, SC4) | Загрузки: MIME, лимит 5 МБ, 401, обрыв, битый multipart, сигнатура файла, Sharp | integration (DB) | `app/server/src/routes/uploads.test.ts` | SRV `src/routes/uploads.test.ts` | ✅ + manual |
| DEP-05 | Sharp 0.35.x загружается и обрабатывает изображение на Node 24 | unit | `app/server/src/lib/sharp-runtime.test.ts` | SRV `src/lib/sharp-runtime.test.ts` | ✅ + manual |
| DEP-05 | Маршруты под защитой proxy отвечают как до апгрейда | e2e (`@proxy`) | `e2e/tests/proxy-protection.spec.ts` | E2E `proxy-protection` | ✅ |
| DEP-05 | Drizzle-запросы работают на 0.45.3: сценарии экзамена на реальной БД | integration (DB) | `app/server/src/routes/tests/exam-flow.test.ts` | SRV `src/routes/tests/exam-flow.test.ts` | ✅ |
| DEP-05 | Содержимое редактора сохраняется и читается, бюджет и состав чанка редактора | e2e + unit | `e2e/tests/authoring.spec.ts`, `e2e/tests/editor-toolbar.spec.ts`, `scripts/editor-bundle.test.mjs` | E2E `authoring`, E2E `editor-toolbar`, GUARD `editor-bundle.test.mjs` | ✅ |
| DEP-05 (SC2) | `yarn install --immutable` стоит в каждом job CI; структура `yarn.lock` проверена шагом `lockfile` | static | `scripts/check-ci-workflow.mjs`, `scripts/check-lockfile.mjs`, `scripts/check-ci-workflow.test.mjs`, `scripts/check-lockfile.test.mjs` | GUARD `check-ci-workflow.test.mjs`, GUARD `check-lockfile.test.mjs`; шаги `ci-workflow` и `lockfile` в `yarn verify` | ✅ + manual |
| DEP-05 (SC2) | Production-сборка web завершается кодом 0 | e2e (сборка внутри прогона) | `scripts/e2e.mjs` | `yarn e2e` | ✅ |

Критерии ROADMAP: SC1 = DEP-04; SC2 = DEP-05 (установка, сборка); SC3 = DEP-03; SC4 = DEP-05 (загрузки, Sharp, proxy).

---

## Manual-Only Verifications

| Что проверяется | Требование | Почему не автоматизируется | Как проверено |
|-----------------|------------|----------------------------|---------------|
| `yarn npm audit --all --environment production --severity high --no-deprecations` без записей; `yarn npm audit --all --recursive --severity high --json` сверяется с `docs/security/dependency-audit.md` | DEP-04 | Нужна сеть, ответ реестра и GitHub Advisory Database меняется без изменений кода, поэтому прогон в `yarn verify` падал бы недетерминированно; структурная проверка реестра хрупка | Прогон 2026-10-04: прямых advisory нет, 17 из 17 GHSA есть в реестре с путём, достижимостью и статусом upstream |
| `yarn install --immutable` и `yarn verify` на Linux | DEP-05 | Нужен Linux-раннер: локальная среда macOS | CI: шаг `yarn install --immutable` обязателен в job, это проверяет `scripts/check-ci-workflow.mjs` |
| Sharp 0.35.x и Next 16.3.x на Linux | DEP-05 | Нативный бинарник linux ставится и запускается только на Linux; локально Sharp проверяет `sharp-runtime.test.ts` на macOS | Job `build` в CI |
| Сравнение реальных текстов преподавателей (таблицы, формулы, цвета, `class`, `font`, `center`) до и после апгрейда MDX | DEP-03 | Тексты лежат в хранилище, сравнение визуальное | Принято пользователем 2026-10-05 |

---

## Validation Audit 2026-10-06

Пробел: пункт раздела «Пробелы» карты покрытия, которому нужен тест. Закрыт: для пробела есть автотест, новый или существующий. Manual-only: пробел закрыт ручной проверкой.

| Метрика | Число |
|---------|-------|
| Gaps found | 5 |
| Resolved | 2 |
| Manual-only | 3 |

Закрыто: DEP-01 и DEP-02 новым `scripts/dependency-floors.test.mjs`; DEP-05 для редактора существующими `e2e/tests/authoring.spec.ts`, `e2e/tests/editor-toolbar.spec.ts` и `scripts/editor-bundle.test.mjs`. Ручные: DEP-04 (прямой аудит), DEP-04 (реестр), DEP-05 (`yarn install --immutable`, шаг CI). Нового тестового кода: один файл.

---

## Validation Sign-Off

- [x] У каждого требования есть автотест или обоснованная ручная проверка в Manual-Only
- [x] Все названные файлы тестов существуют
- [x] Ручной остаток каждого требования записан в Manual-Only
- [x] Режима watch нет
- [x] `nyquist_compliant: true` в frontmatter

**Approval:** validated 2026-10-06 (требований 5: автоматизировано 4, из них с ручным остатком 2, только ручных 1)
