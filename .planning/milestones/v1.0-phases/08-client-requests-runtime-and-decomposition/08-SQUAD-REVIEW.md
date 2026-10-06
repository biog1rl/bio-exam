# Squad review — phase 8

- Дата: 2026-10-05
- Планы: 08-01 … 08-28
- Порядок проверки:
  1. Критики: plan-critic (gsd-plan-checker), code-critic (Explore), risk-critic (general-purpose), все opus.
  2. devils-advocate (opus) с пробами в `scratchpad/da08/`.
  3. Один цикл ревизии gsd-planner (opus).
  4. Перепроверка gsd-plan-checker (opus): 0 BLOCKER, 0 WARNING, 1 INFO.
- Outcome: **REVISED**, открытых BLOCKER нет.
- Счёт: поднято 25 находок (2 BLOCKER, 8 MAJOR, 15 MINOR); опровергнуто 1 (P3), частично 2 (R10 «предупреждение вместо остановки», C7 для 08-27).

## Решения оркестратора

- Доставка ZIP — через `services/question-content` (`streamArchive`, `archiveToBuffer` с 413 внутри модуля); `EXCEPTIONS` гарда хранилища фазы 7 пуст, обход через `config/` и `admin/shared.ts` запрещён (C1/R5).
- Ключи SWR — только строки, `parse` через `fetcherWith(parse)` на уровне модуля; кортежи запрещены охранным тестом 08-23 (C4/R2).
- D-11: 404 только при `hasGlobalZone`, учителю 403; `by-login` — точное совпадение, затем `lower()` при единственной строке (P2, R7).
- PERF-02: потолок одновременных чтений подбирается замером при задержке 120 мс (≤ 1,2× «до»), значение выше 8 допустимо.
- `EXPORT_ZIP_MAX_BYTES`: пустое и пробелы — «не задан», остальное fail-fast; откат фазы 8 — web → server (R10).

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| C1 = R5 | BLOCKER | CONFIRMED | fixed | 08-14, 08-17, 08-27 |
| C2 | BLOCKER | CONFIRMED | fixed | 08-14: `export.test.ts`, `zip-stream.test.ts` на `test-support/export-reference.ts` |
| C3 | MAJOR | CONFIRMED | fixed | 08-15 → волна 5 после 08-16 |
| C4 = R2 | MAJOR | CONFIRMED (проба SWR 2.3.8) | fixed | 08-04, 08-11, 13, 15, 16, 18–21, 23 |
| R1 (C5 → MINOR) | MAJOR | CONFIRMED | fixed | 08-24: загрузчик эмодзи без кэша отказа, ожидание только при `:alias:`, конвертация без таблицы при сбое |
| R3 | MAJOR | CONFIRMED | fixed | 08-06: `UserScope` из `userScope(req)`, deepEqual тела под teacherA |
| R4 | MAJOR | CONFIRMED (проба Node 24.17) | fixed | 08-12: обработчик на каждом чтении, три сценария, нет «Unhandled» |
| P1 | MAJOR | CONFIRMED | fixed | 08-23: `client.test.ts` |
| P2, R6, R7, R8, R9, R10, C6, C7, C8, C9, P5 | MINOR | CONFIRMED / DOWNGRADED | fixed | 08-02, 05, 06, 04, 10, 11, 15, 16, 17, 20, 26, 28, CONTEXT D-11 |
| P4, P6 | MINOR | CONFIRMED | accepted | разделение 08-23 и автосверка `codegraph affected` не делаются |
| 08-24 объём (17 файлов) | INFO | перепроверка | accepted | — |

## Refuted

- P3: снимок 08-03 закоммичен до 08-06 (коммит на план в `dev`).
