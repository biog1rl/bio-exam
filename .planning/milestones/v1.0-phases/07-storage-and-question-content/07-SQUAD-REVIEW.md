# Squad review — phase 7

- Дата: 2026-10-04
- Планы: 07-01 … 07-17
- Порядок проверки:
  1. Критики: plan-critic (gsd-plan-checker), code-critic, risk-critic.
  2. devils-advocate (opus).
  3. Один цикл ревизии gsd-planner (opus).
  4. Перепроверка gsd-plan-checker (opus): 0 BLOCKER, 1 WARNING, принят.
- Outcome: **REVISED**, открытых BLOCKER нет.

## Surviving findings

| id | severity | verdict | статус | где |
|---|---|---|---|---|
| C1 | BLOCKER | CONFIRMED | fixed | 07-01/07-02. Классификатор Supabase: промах download = `StorageUnknownError` с `originalError.status` 400/404. Повтор только при статусе ≥ 500 или без статуса. `exists` через SDK. Подделка — настоящий `createClient` поверх поддельного HTTP. Промах → `null` одним GET. |
| C2 | MAJOR | CONFIRMED | fixed | 07-01: `process.env.X` литералами, у `resolveStorageDriver()` нет параметров. |
| C3 | MAJOR | CONFIRMED | fixed | 07-11: `route-permissions.test.ts` ожидает `[]`. |
| C4 | MAJOR | CONFIRMED | fixed | 07-16: страховочное удаление `vi.mock` оболочки по `rg`, `allowRe` для `routes/tests`, typecheck сервера. |
| C5 | MAJOR | CONFIRMED | fixed | 07-13: удаление не трогает `assets/**`. |
| R4 | MAJOR | CONFIRMED | fixed | 07-10/07-12/07-13: условное переключение указателей, 409 и компенсация, `lockTest` в `updateQuestion`. |
| R7 | MAJOR | CONFIRMED | fixed | 07-15/07-16 T4: runbook D-27 по каркасу 04-14. |
| ZIP 4,5 МБ | MAJOR (UNVERIFIABLE) | missed by critics | fixed | 07-14: `ZIP_RESPONSE_LIMIT_BYTES` = 4 400 000, ответ 413 с текстом, показ на web, проверка крупной темы на preview. Потоковый ZIP — Phase 8. |
| R5, R6, R8 | MINOR | DOWNGRADED | fixed | Один `list` на префикс; сироты моложе 1 часа не удаляются; SQL владельцев прав без `users.read`. |
| P2, P4, R10 | MINOR | — | fixed | Повтор 07-15 после STOP; шаблон allow миграций; `nonServable` как условие STOP D-19. |
| R8 (web) | MINOR | — | open | Показ ошибки при 403 от `/api/users` в `GroupSheet` и редакторе — отдельная задача по решению пользователя (07-11 T4 п.3). |
| Объём 07-15 | WARNING | — | accepted | 21 файл, оценка 100k; около 6 из них — артефакты drizzle. |

## Refuted

- P1.
