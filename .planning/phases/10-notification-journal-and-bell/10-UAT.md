---
status: complete
phase: 10-notification-journal-and-bell
source: [10-VERIFICATION.md]
started: 2026-10-06T08:00:00Z
updated: 2026-10-06T08:10:00Z
---

## Current Test

Все пункты закрыты: решение по критерию 3 принял пользователь, проверимое из сессии подтверждено доказательствами; выкатка 0027 — шаг пользователя.

## Tests

### 1. Пример «student left the group» в критерии 3 ROADMAP
expected: пользователь принимает D-09 или заказывает доработку
result: pass
evidence: пользователь 2026-10-06 выбрал «Нет, доступ остаётся»; D-09 помечено подтверждённым в 10-CONTEXT.md, критерий 3 ROADMAP переписан; тест `notification-open.test.ts` «group leave keeps access while the assignment exists (D-09)».

### 2. Выкатка 0027 и пробное назначение
expected: миграция применена, колокольчик показывает 1, unread-count без 500
result: skipped
reason: шаг пользователя на сервере; правило 0027 (и совместная выкатка с 0026) записано в профиле сервера («Ловушки») и в «Шагах пользователя» 10-08-SUMMARY.

### 3. Вид колокольчика, поповера и экрана «Нет доступа» на 375/768/1280
expected: соответствует 10-UI-SPEC
result: pass
evidence: `e2e/tests/notifications.spec.ts` (66 passed после 3cdc44c) проверяет `horizontalOverflow` и `lowContrastTexts` на 375/768/1280, контраст числа и точки по вычисленным цветам (`elementContrast`, ≥ 4,5 и ≥ 3), перенос длинного названия, фокус и клавиатуру; UI-аудит фазы — шаг verify:post.

### 4. 12 запретов планов (уровень judgment)
expected: все соблюдены
result: pass
evidence: вердикт верификатора по каждому запрету в разделе «Запреты планов» 10-VERIFICATION.md; ревью кода и аудит безопасности (10-REVIEW.md, 10-SECURITY.md) нарушений не нашли; охранные тесты `attempt-integrity-guards`, `teacher-zone-guards`, `web-requests-guards` зелёные в `yarn verify`.

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

Нет.
