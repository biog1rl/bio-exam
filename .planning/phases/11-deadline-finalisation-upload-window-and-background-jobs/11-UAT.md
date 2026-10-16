---
status: complete
phase: 11-deadline-finalisation-upload-window-and-background-jobs
source: 11-01-SUMMARY.md … 11-22-SUMMARY.md, 11-VERIFICATION.md
started: 2026-10-13T00:00:00Z
updated: 2026-10-13T20:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Ворота на HEAD (yarn verify)
expected: `yarn verify: OK` на HEAD после правок ревью (CR-01, WR-05, IN-01, sessionFilter)
result: pass
note: первый прогон упал на необработанном 57P01 из timestamps.test.ts при 2044 зелёных тестах (известная нестабильность), второй прогон `yarn verify: OK`

### 2. Дедлайн: гонка трёх путей и сбой хранилища
expected: `attempt-deadline.test.ts`, `commands.test.ts`, `upload-window.test.ts` зелёные на базе test_*
result: pass
note: server 104 файла, 2044 теста зелёные в yarn verify

### 3. Фоновые задачи и остановка
expected: `shutdown.test.ts`, `background-jobs.test.ts` зелёные: замок на два экземпляра, ожидание задач до pool.end()
result: pass
note: shutdown.test.ts, background-jobs.test.ts зелёные в yarn verify

### 4. Команда jobs:run
expected: `jobs:run finalize-deadlines` и `reconcile-outcomes` дают отчёт и код 0; без аргумента или с неизвестным именем код 1; при занятом замке код 75
result: pass
note: на test_* базе обе задачи отчёт и код 0, без аргумента и неизвестное имя код 1; код 75 покрыт background-jobs.test.ts, вручную не воспроизводился

### 5. Клиент: исход «Ответ принят», сверка текста, две вкладки, выход
expected: web-тесты lifecycle-restore/outcomes, refresh-coordinator, user-storage зелёные; e2e deadline-finalised, session (PLAT-03), auth зелёные
result: pass
note: web 102 файла зелёные в verify; полный yarn e2e 376 passed (deadline-finalised, session PLAT-03, auth) на HEAD

### 6. Осмотр в браузере: «Ответ принят» и строка «Фото можно добавить до ЧЧ:ММ»
expected: после финализации по дедлайну страница показывает «Ответ принят», «Время вышло, ответы приняты автоматически.», срок окна для фото; без окна строки нет; текст в диалоге «Начать тест?» с пометкой о недошедшем тексте
result: pass
note: проверено сценариями Playwright deadline-finalised.spec.ts (TIME-01/03/06) в chromium-desktop и chromium-mobile, а не ручным осмотром; визуальный осмотр человеком не делался

### 7. Шаги на сервере
expected: `stop_grace_period` у `api` не меньше 30 с; `idle_in_transaction_session_timeout` 0 или не меньше 30 с; выкатка без идущих попыток с таймером; после выкатки запрос по `submit_source = 'deadline'`
result: pass
note: выкатка 2026-10-13 `DEPLOY_OK 9b4b2b034990 -> 186f2f4da5e3`, `RELEASE_OK`; stop_grace_period api 30 с, idle_in_transaction_session_timeout 1 мин (замер Bioexam server); блок 2: миграции `32|1791292874244`, колонки `test_attempts.upload_closes_at` и `tests.photo_upload_window_minutes`, `jobs-run.js` в dist/scripts, `jobs-run finalize-deadlines` rc=0, healthz 200. `submit_source`: client|266, строк deadline пока нет (сервер ещё не сдавал по дедлайну)

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
