---
status: complete
phase: 12-photos-on-session-authentication
source: 12-01-SUMMARY.md … 12-10-SUMMARY.md, 12-VERIFICATION.md
started: 2026-10-16T00:00:00Z
updated: 2026-10-16T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Ворота на HEAD (yarn verify)
expected: `yarn verify: OK` после правок ревью (UUID в нижнем регистре, белый фон при уменьшении, миниатюра вне перехвата декодирования, лимит и признаки из очереди, `inFlightGate`)
result: pass
evidence: все восемь шагов passed, server 108 файлов, web 103 файла (1690 тестов), exam-core 745 тестов; снимок маршрутов перегенерирован из-за `photoBodyGate` в цепочке PUT

### 2. e2e фото ответа
expected: `e2e/tests/answer-photos.spec.ts` зелёный на desktop и mobile после правок ревью
result: pass
evidence: 30 passed (проверка верификатора на рабочем дереве); полный `yarn e2e` прошёл на dcd0a5f до правок ревью

### 3. Сборка web и бюджет редактора
expected: `yarn workspace @bio-exam/web build` и `yarn editor:budget` зелёные (job build в CI)
result: pass
evidence: сборка завершена, `editor bundle OK`

### 4. Интерфейс на 375, 768 и 1280
expected: блок «Фото к ответу» без горизонтального переполнения, контраст текста AA, цели касания 44 px на мобильной ширине, лимит 5 из 5 и сводка лишних фото
result: pass
evidence: `12-UI-REVIEW.md`, 21 из 24, блокирующих нет; замеры по 8 состояниям на трёх ширинах

### 5. Linux-замер памяти и лимит контейнера API
expected: `node dist/scripts/photo-memory-bench.js` в контейнере образа API с лимитом памяти, серия 30; пик RSS на 12 и 48 МП ниже выбранного лимита с запасом на буферы запросов; строка «Образ API (Linux)» в ADR-0004
result: skipped
reason: шаги 1 и 4 из `12-10-SUMMARY.md`, выполняет пользователь до включения типа open (фаза 17) и до выкатки с включённым типом.

### 6. Решение по WebP 48 МП
expected: около 310 МБ на одну обработку; выбрать меньший лимит пикселей для WebP либо не принимать WebP у фото ответа; решение записать в ADR-0004
result: skipped
reason: решение владельца после Linux-замера (пункт 5).

### 7. Реальные снимки iPhone и Android, HEIC
expected: большой JPEG и HEIC через `--dir`, читаемость тетрадной страницы при 2560 px; число HEIC как основание пересмотреть D-12
result: skipped
reason: шаг 2 из `12-10-SUMMARY.md`, снимки у пользователя.

### 8. HEIC в Mac Safari
expected: выбор HEIC в раннере, клиент отправляет JPEG, фото принято
result: skipped
reason: шаг 3 из `12-10-SUMMARY.md`, нужен Safari пользователя.

### 9. Лимит тела запроса в Caddy
expected: не ниже 10 МБ с запасом на multipart
result: skipped
reason: шаг 5 из `12-10-SUMMARY.md`, профиль сервера, выполняет пользователь.

### 10. Выкатка миграции 0031
expected: вручную по правилам профиля сервера; проверка загрузки на копии данных
result: skipped
reason: шаг 6 из `12-10-SUMMARY.md`, выполняет пользователь вместе с выкаткой фазы.

## Summary

total: 10
passed: 4
issues: 0
pending: 0
skipped: 6
blocked: 0

## Gaps

Нет. Пункты 5–10 — шаги пользователя вне репозитория; владелец пользователь, срок — до включения типа open (фаза 17) и до выкатки 0031.
