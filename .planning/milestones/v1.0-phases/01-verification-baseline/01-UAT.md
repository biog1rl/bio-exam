---
status: complete
phase: 01-verification-baseline
source: [01-VERIFICATION.md]
started: 2026-10-03T11:19:34Z
updated: 2026-10-03T11:54:58Z
---

## Current Test

[testing complete]

## Tests

### 1. Прочтение README с точки зрения нового разработчика
expected: Все шаги README.md понятны на русском и идут в правильном порядке: Node 24, Corepack и Yarn 4.12, PostgreSQL 17, копирование .env.example, локальная база, migrate, dev, verify, e2e. Нигде не сказано направлять разработку или тесты на живую базу
result: pass

### 2. Push коммитов после исполнения и повторный CI в PR #2
expected: Коммиты 6283f6b (правки по ревью WR-01..04, WR-06, H-1..H-3, when и breakpoints в манифесте) и 7a6f95a (тесты валидации, шаги yarn verify в README и AGENTS.md) отправлены; verify, build и e2e зелёные на новом коммите, как на e02a86b (run 37114466556)
result: pass
evidence: "ветка на 7a6f95a, run 37120717677: verify, build, e2e — success"

### 3. CI без кэша (страховка плана 01-15)
expected: Прогон CI без попаданий в кэш Yarn, Turbo и Playwright даёт тот же зелёный результат для verify, build и e2e; кэш влияет только на длительность
result: pass
evidence: "run 37114466556 — первый запуск CI в репозитории (attempt 1), все кэши созданы в нём; verify, build, e2e — success"

### 4. Порядок одобрения зависимостей (01-02)
expected: Ты одобрил ровно восемь версий (vitest 5.0.3, vite 8.3.2, oxlint 1.86.0, oxfmt 0.71.0, tsdown 0.23.0, @playwright/test 1.63.0, drizzle-orm 0.45.3, drizzle-kit 0.31.11) на блокирующей точке до первой установки
result: pass
evidence: "ответ approved в 06:45:57, установка в продолжении 01-02 с 06:46:33; транзитивный esbuild 0.28.2 (postinstall) принят"

### 5. Подтверждение запретов, проверенных суждением
expected: Каждый запрет из раздела «Prohibitions» в 01-VERIFICATION.md принят как соблюдённый или переоткрыт как пробел
result: pass
evidence: "перепроверены утечки .env (только SESSION_COOKIE_NAME — публичное имя cookie), автор коммитов, дамп вне git, AGENTS.md без личных правил; 01-06 принят по зелёному CI"

### 6. Остановка yarn e2e по Ctrl+C (01-09, тестом не покрыто)
expected: Ctrl+C во время yarn e2e (пока идёт Playwright) завершает с кодом 130 и не оставляет процессов e2e, каталогов bio-exam-pg-* и bio-exam-e2e-storage-* и занятого порта API
result: pass
evidence: "yarn e2e (порты 4710/3710), SIGINT группе процессов во время Playwright (15 passed, 1 interrupted): exit 130 через 0.4 с; нет процессов, каталогов bio-exam-pg-*/bio-exam-e2e-storage-*, postgres и слушающих портов"

### 7. yarn verify останавливается на первом упавшем шаге (01-10, тестом не покрыто)
expected: С намеренно падающим тестом в одном workspace yarn verify выходит с кодом 1, печатает «yarn verify: FAILED at lint-typecheck-test», а следующие шаги помечены «not run»
result: pass
evidence: "временный падающий тест в packages/rbac: exit 1, «yarn verify: FAILED at lint-typecheck-test», migrations и script-tests — not run; тест удалён, дерево чистое"

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
