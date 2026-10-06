---
phase: 11-deadline-finalisation-upload-window-and-background-jobs
plan: 02
subsystem: web
tags: [characterization, attempt-lifecycle, vitest]
requires: []
provides:
  - характеризация сбоя автосдачи по дедлайну без связи
  - характеризация 409 на автосдачу теста с лимитом
  - перечень закреплений, которые меняет фаза 11
affects: [11-06, 11-11, 11-12, 11-13, 11-14, 11-15]
actuals:
  tokens: 1500
  tasks: 2
  commits: 0
tech-stack:
  added: []
  patterns: [характеризация через интерфейс модуля createAttemptLifecycle с фейками testing.ts]
key-files:
  created: []
  modified:
    - app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
    - app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
key-decisions:
  - "Прод-код не менялся, ожидания существующих тестов не правились"
status: complete
---

# Phase 11 Plan 02: Характеризация жизненного цикла попытки Summary

Два теста закрепили нынешнее поведение модуля попытки при автосдаче по дедлайну (сбой сети и 409) до правок D-12, D-13, D-14; оба зелёные на неизменённом коде.

## Что сделано

- `lifecycle-time.test.ts`, «характеризация: автосдача по дедлайну без связи возвращает ввод (до D-12)»: тест с лимитом 10 минут, ответ `a`, сдача падает `Error('network')`, дедлайн по таймеру. Один вызов `submit`; снимок `phase === 'active'`, `submitFailed === true`, `interactionDisabled === false`, `secondsLeft === 0`; `answer(Q2, 'b')` меняет снимок и попадает в `answers` WAL.
- `lifecycle-submit.test.ts`, «характеризация: 409 ATTEMPT_ALREADY_SUBMITTED на автосдачу теста с лимитом … (до D-13/D-14)»: `submit({ auto: true })` с 409 даёт `blocked`, `already-submitted`, `alreadySubmittedAttemptId === ATTEMPT_ID`, `presentKeys(storage)` пуст (все четыре ключа, включая WAL).

Расхождений с описанием поведения в плане нет: оба теста прошли с первого запуска.

## Закрепления, которые меняет фаза

Строки — в рабочем дереве после добавления тестов этого плана.

| Файл:строка | Тест | Кто меняет |
| --- | --- | --- |
| `lifecycle-time.test.ts:214` | характеризация: автосдача по дедлайну без связи возвращает ввод (до D-12) | D-12 → 11-11 |
| `lifecycle-submit.test.ts:325` | характеризация: 409 на автосдачу теста с лимитом (до D-13/D-14) | D-13/D-14 → 11-12, 11-13 |
| `lifecycle-submit.test.ts:266, 271` | 409 ATTEMPT_ALREADY_SUBMITTED с attemptId и без: стираются четыре ключа | D-13/D-14 → 11-12, 11-13 |
| `lifecycle-submit.test.ts:288` | 422 TIME_EXPIRED на ручную отправку: четыре ключа удалены | D-13/D-14 → 11-12, 11-13 |
| `lifecycle-submit.test.ts:307` | 422 TIME_EXPIRED на автосдачу теста с лимитом: blocked time-expired, ключи удалены | D-13/D-14 → 11-12, 11-13 |
| `lifecycle-submit.test.ts:116-138` | CR-01(а): автосдача 200, showTimeUp 1500 мс | D-13 («Ответ принят») → 11-12 |
| `lifecycle-submit.test.ts:439-445` | автосдача упала с 500: active, submitFailed, showTimeUp false | D-12 → 11-11 |
| `lifecycle-submit.test.ts:592-603, 635-640` | retake после 422; showTimeUp | D-13/D-14 → 11-12, 11-13 |
| `lifecycle-restore.test.ts:80-90` | восстановление: 422 TIME_EXPIRED и 409 already-submitted | D-14 (сверка WAL) → 11-13 |
| `lifecycle-restore.test.ts:202, 238, 255, 310` | брошенная просроченная s1, восстановление в пределах льготы и за ней, frozenKey | D-12, D-14 → 11-11, 11-13; Pitfall 4 → 11-14 |
| `lifecycle-restore.test.ts:351-377, 388-423` | submitFailed при восстановлении, retake после 422 | D-12/D-14 → 11-11, 11-13 |
| `lifecycle-time.test.ts:178-196` | восстановление после дедлайна в пределах льготы (200, 422) | D-12, D-14 → 11-11, 11-13 |
| `lifecycle-time.test.ts:198-212` | confirmStart после брошенной просроченной сессии: автосдача, 422 | D-12, D-14 → 11-11, 11-13; Pitfall 4 → 11-14 |
| `lifecycle-time.test.ts:245-280` | D-05: после 422 и retake новая сессия считает заново | D-13/D-14 → 11-12, 11-13; CR-05 → 11-15 |
| `attempt-time-limit.test.ts:88` | в пределах льготы /start возвращает ту же сессию, за льготой закрывает как expired | D-01, D-04, D-05 → 11-06 |
| `attempt-time-limit.test.ts:151` | PATCH в просроченную, но не закрытую сессию отвечает 200 | D-01 → 11-06 |
| `attempt-time-limit.test.ts:163` | PATCH в сессию, закрытую как expired: 404, черновик не меняется | D-01/D-04 → 11-06: сценарий остаётся на пустом черновике, непустой черновик финализируется сервером, PATCH → 404 |
| `attempt-time-limit.test.ts:290` | started_at 13 минут назад: 422, сессия закрыта expired, попытки нет | D-01/D-04 → 11-06 |

Точное соответствие решений и номеров планов в двух последних группах взято из текста плана; сами файлы решений и других планов фазы здесь не перечитывались.

## codegraph affected

```
Affected test files (2):

  app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts
  app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts
```

## Проверки

- `yarn workspace @bio-exam/web vitest run components/tests/attempt-lifecycle`: 7 файлов, 145 тестов зелёные.
- `yarn workspace @bio-exam/web test`: 94 файла, 1425 тестов зелёные (до плана 1423).
- `yarn verify`: `yarn verify: OK`.
- `yarn exec oxfmt` по двум файлам: чисто.
- Сверка `11-plan-files.cjs check 11-02` не запускалась по правилу режима worktree (её делает ведущая сессия); `git status --short` показывает только два файла плана.

## Deviations from Plan

None - plan executed exactly as written. Коммиты не делались по правилам исполнителя фазы 11.

## Known Stubs

None.

## Threat Flags

None.

## Файлы к коммиту

- `app/web/components/tests/attempt-lifecycle/lifecycle-time.test.ts`
- `app/web/components/tests/attempt-lifecycle/lifecycle-submit.test.ts`
- `.planning/phases/11-deadline-finalisation-upload-window-and-background-jobs/11-02-SUMMARY.md`

## Self-Check: PASSED

Оба теста найдены в файлах, прод-код (`lifecycle.ts`) не изменён, `git status --short` содержит только два тестовых файла.
