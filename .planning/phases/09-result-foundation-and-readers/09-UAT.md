---
status: complete
phase: 09-result-foundation-and-readers
source: [09-VERIFICATION.md]
started: 2026-10-06T01:10:00Z
updated: 2026-10-06T01:15:00Z
---

## Current Test

Все проверимые из сессии пункты проверены ведущей сессией (режим автономный, пользователь недоступен). Пункты 5 и 6 — шаги пользователя на сервере после слияния в master.

## Tests

### 1. e2e после 3be6c16
expected: yarn e2e: 292 passed, без failed и flaky на chromium-desktop и chromium-mobile
result: pass
evidence: ведущая сессия после коммита 3be6c16 (до коммита, на том же дереве) запустила полный `yarn e2e`: «292 passed (4.0m)», последние строки `zero-weight.spec.ts`, `user-lookup.spec.ts`, `timed-attempt.spec.ts` на chromium-mobile зелёные. `attempt-review-pending.spec.ts` входит в набор (4 теста × 2 проекта).

### 2. Контраст меток «На проверке» и «проверено учителем»
expected: lowContrastTexts по меткам пуст, контраст не ниже 4,5:1 по вычисленным стилям
result: pass
evidence: `e2e/tests/attempt-review-pending.spec.ts` меряет `lowContrastTexts` по вычисленным стилям на списке попыток, разборе, профиле, странице теста, дашбордах (страница целиком) и на экране после сдачи (тексты меток); прогон из пункта 1 зелёный. Старый низкий контраст номера отвеченного вопроса (2,22) — до фазы 9, в deferred-items.md.

### 3. Ширины 375, 768 и 1280 px
expected: нет горизонтального скролла, «проверено учителем» помещается, метка не сжимается
result: pass
evidence: тот же спек проверяет `horizontalOverflow` через `setViewportSize` на 1280, 768 и 375 px; 09-18 исправил обрезку таблицы попыток на странице теста (`overflow-x-auto!`) и переполнение профиля (`min-w-0`); прогон из пункта 1 зелёный.

### 4. Вставка в краткий ответ текста длиннее 200 знаков
expected: браузер обрезает по maxLength без сообщения; сдача проходит
result: pass
evidence: `QuestionInput.tsx` ставит `maxLength={SHORT_TEXT_MAX_LENGTH}` у полей `short_text` и `sequence_digits` (3be6c16); атрибут `maxlength` браузер применяет к любому вводу пользователя, включая вставку. Если значение длиннее всё же придёт (старая вкладка), сервер отвечает 422 `short_text_too_long`, баннер и повторная сдача покрыты `lifecycle-submit.test.ts` и `attempt-submit.test.ts`.

### 5. Выкатка 0026
expected: вся фаза 9 в master одним пакетом, свежая копия, репетиция на дампе под bio_exam, ручной deploy.sh; после 0026 без отката одного образа
result: skipped
reason: шаг пользователя на сервере после слияния; правило и порядок записаны в профиле сервера (раздел «Ловушки», миграция 0026) и в «Шагах пользователя» 09-19-SUMMARY.

### 6. Запросы сверки на проде и строка open до и после
expected: attempts = none_count, mismatched = 0; open неактивен с шаблоном open и правилом manual; триггер, CHECK convalidated, users_created_by_fk confdeltype = 'n'; до миграции своего типа с ключом open нет
result: skipped
reason: данные прода, выполняет пользователь; запросы в профиле сервера и в 09-05-PLAN «User steps».

### 7. Запрет 09-05: применённые миграции не менялись, push не выполнялся
expected: 0000…0025 не менялись
result: pass
evidence: `git diff --stat 57e7a38..HEAD -- app/server/drizzle/` — только `0026_attempt_result_projection.sql`, `meta/0026_snapshot.json`, запись idx 26 в `_journal.json` и в `migrations-manifest.json`; `yarn verify` шаг `migrations` (цепочка с пустой базы и сверка схемы) passed; в `package.json` нет скрипта `drizzle-kit push`.

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

Нет. Пункты 5 и 6 — шаги пользователя при выкатке, не пробелы кода.
